/**
 * Backlog service — DB access + transition guards for the HHP Backlog
 * Tab (per the Jdot spec, 2026-06-08).
 *
 * Why a service layer instead of inline supabase calls in the page:
 *   • Transition guards live in one place. Phase 2 hardens the
 *     "ready_for_review → live" gate to reporter-or-Jdot only; centralizing
 *     it here means the Telegram bot and the future Auto-Resolve cron
 *     share the same checks the UI uses.
 *   • Attachments need a two-step write (Storage upload + DB row).
 *     Wrapping them as one function keeps callers from forgetting half.
 *   • Future Phase 3 (Telegram) and Phase 5 (saved view / cron) want
 *     server-side access. Keeping logic out of the React tree means
 *     those surfaces can reuse it without React.
 */

import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Standing default assignee for new Bug + Request items per the spec
 * (section 3: "Defaults to Andy for Bugs and Requests"). Email-based
 * so that if Andy ever changes user_ids, swapping this constant is
 * the single migration point — no historical rows need updating.
 *
 * Resolved lazily at create time via lookupDefaultAssigneeId. Returns
 * null gracefully when the email isn't found (e.g. account renamed)
 * so creates still succeed; the item lands unassigned and the team
 * can pick it up manually.
 */
const DEFAULT_ASSIGNEE_EMAIL = 'andy@holohive.io';

/**
 * Server-friendly lookup that takes a Supabase client so both the
 * browser path (BacklogService.create) and the Telegram webhook
 * (supabaseAdmin / service role) can call it.
 */
export async function lookupDefaultAssigneeId(
  client: SupabaseClient,
): Promise<string | null> {
  const { data } = await (client as any)
    .from('users')
    .select('id')
    .eq('email', DEFAULT_ASSIGNEE_EMAIL)
    .eq('is_active', true)
    .maybeSingle();
  return data?.id ?? null;
}

// ─── Domain types ───────────────────────────────────────────────────
//
// Values are duplicated from the CHECK constraints in the migration —
// keeping them in sync is a small annoyance vs. the compile-time
// safety win. Adding a new value requires both a migration AND an
// edit here; a single source via a generated types file is a
// follow-up cleanup.

export type BacklogType = 'bug' | 'request';

export type BacklogArea =
  | 'content_dashboard'
  | 'kol_mastersheet'
  | 'budget_dashboard'
  | 'priority_dashboard'
  | 'kol_cards'
  | 'client_success'
  | 'other';

export type BacklogStatus = 'new' | 'building' | 'ready_for_review' | 'live';

export type BacklogSource = 'telegram_bug' | 'telegram_req' | 'hhp_modal' | 'seed';

export type BacklogItem = {
  id: string;
  type: BacklogType;
  area: BacklogArea;
  title: string;
  description: string;
  reference_url: string | null;
  status: BacklogStatus;
  reporter_id: string;
  assignee_id: string | null;
  source: BacklogSource;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
  ready_for_review_at: string | null;
  live_at: string | null;
};

export type BacklogAttachment = {
  id: string;
  item_id: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

// ─── Display labels ─────────────────────────────────────────────────
//
// Single source of truth for "what does enum X read as in the UI."
// The CMs see Title Case strings; the DB stores snake_case. Avoids
// each call site reinventing its own labels.

export const BACKLOG_TYPE_LABELS: Record<BacklogType, string> = {
  bug: 'Bug',
  request: 'Request',
};

export const BACKLOG_AREA_LABELS: Record<BacklogArea, string> = {
  content_dashboard: 'Content Dashboard',
  kol_mastersheet: 'KOL Mastersheet',
  budget_dashboard: 'Budget Dashboard',
  priority_dashboard: 'Priority Dashboard',
  kol_cards: 'KOL Cards',
  client_success: 'Client Success',
  other: 'Other',
};

export const BACKLOG_STATUS_LABELS: Record<BacklogStatus, string> = {
  new: 'New',
  building: 'Building',
  ready_for_review: 'Ready for review',
  live: 'Live',
};

// The valid forward transitions a non-privileged user can make.
// Live transitions are special-cased — see canTransitionToLive.
const FORWARD_TRANSITIONS: Record<BacklogStatus, BacklogStatus[]> = {
  new: ['building'],
  building: ['ready_for_review'],
  ready_for_review: ['live'],
  live: [], // terminal; needs a manual "reopen" elsewhere if ever needed
};

// Allow going backwards too — sometimes a "ready for review" turns
// out to need more work and gets bumped back to building. UI exposes
// these as the "Move back" affordance.
const BACKWARD_TRANSITIONS: Record<BacklogStatus, BacklogStatus[]> = {
  new: [],
  building: ['new'],
  ready_for_review: ['building'],
  live: ['ready_for_review'],
};

export function getValidTransitions(
  current: BacklogStatus,
): { forward: BacklogStatus[]; backward: BacklogStatus[] } {
  return {
    forward: FORWARD_TRANSITIONS[current] || [],
    backward: BACKWARD_TRANSITIONS[current] || [],
  };
}

// ─── Filters ────────────────────────────────────────────────────────

export type BacklogFilters = {
  status?: BacklogStatus | 'all' | 'open'; // 'open' = anything not live
  type?: BacklogType | 'all';
  area?: BacklogArea | 'all';
  search?: string;
};

// ─── Service surface ────────────────────────────────────────────────

export const BacklogService = {
  /**
   * Fetch items with optional filtering. Always returns newest first
   * within each status bucket; ordering tweaks happen at the UI layer
   * (e.g. Quazo's "oldest open first" view sorts client-side).
   */
  async list(filters: BacklogFilters = {}): Promise<BacklogItem[]> {
    let query = (supabase as any)
      .from('backlog_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'open') {
        query = query.neq('status', 'live');
      } else {
        query = query.eq('status', filters.status);
      }
    }
    if (filters.type && filters.type !== 'all') {
      query = query.eq('type', filters.type);
    }
    if (filters.area && filters.area !== 'all') {
      query = query.eq('area', filters.area);
    }
    if (filters.search && filters.search.trim()) {
      const s = filters.search.trim();
      // ilike on title OR description. PostgREST doesn't expose OR
      // across columns cleanly; use the `.or` filter syntax.
      query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as BacklogItem[];
  },

  async getById(id: string): Promise<BacklogItem | null> {
    const { data, error } = await (supabase as any)
      .from('backlog_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as BacklogItem) || null;
  },

  /**
   * Create a new item. Reporter defaults to the authenticated user;
   * status defaults to 'new'; source defaults to 'hhp_modal' (the
   * Telegram path overrides source + source_ref before calling).
   */
  async create(input: {
    type: BacklogType;
    area?: BacklogArea;
    title: string;
    description: string;
    reference_url?: string | null;
    reporter_id: string;
    assignee_id?: string | null;
    source?: BacklogSource;
    source_ref?: string | null;
  }): Promise<BacklogItem> {
    // Default assignee → Andy (spec section 3). Only kicks in when
    // the caller didn't pass an explicit assignee_id; existing
    // import-from-CSV flows that DO pass one are untouched. The
    // lookup is one extra round-trip per create, which is fine for
    // the create cadence (a few per day).
    let assigneeId: string | null = input.assignee_id ?? null;
    if (!assigneeId) {
      assigneeId = await lookupDefaultAssigneeId(supabase);
    }

    const payload = {
      type: input.type,
      area: input.area || 'other',
      title: input.title.trim(),
      description: input.description.trim(),
      reference_url: input.reference_url || null,
      reporter_id: input.reporter_id,
      assignee_id: assigneeId,
      source: input.source || 'hhp_modal',
      source_ref: input.source_ref || null,
      // status defaults to 'new' in the schema
    };
    const { data, error } = await (supabase as any)
      .from('backlog_items')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data as BacklogItem;
  },

  /**
   * Patch any subset of editable fields. Use `transitionStatus` for
   * status changes specifically — that path stamps the lifecycle
   * timestamps and enforces the live-transition gate.
   */
  async update(
    id: string,
    patch: Partial<{
      title: string;
      description: string;
      area: BacklogArea;
      type: BacklogType;
      assignee_id: string | null;
      reference_url: string | null;
    }>,
  ): Promise<BacklogItem> {
    const { data, error } = await (supabase as any)
      .from('backlog_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as BacklogItem;
  },

  /**
   * Move a backlog item between statuses. Centralizes:
   *   • The legality check (forward/backward edges defined above)
   *   • The lifecycle stamp (ready_for_review_at, live_at)
   *   • The Live gate — only the reporter or a super_admin can move
   *     an item to live. UI hides the button for everyone else; this
   *     is the defense-in-depth backstop.
   *
   * Phase 4 will hook ready_for_review transitions to fire the
   * Telegram DM + in-HHP notification; for now it just stamps.
   */
  async transitionStatus(
    id: string,
    next: BacklogStatus,
    actor: { id: string; role: string | null },
  ): Promise<BacklogItem> {
    const current = await BacklogService.getById(id);
    if (!current) throw new Error('Backlog item not found');
    if (current.status === next) return current;

    const { forward, backward } = getValidTransitions(current.status);
    const isValid = forward.includes(next) || backward.includes(next);
    if (!isValid) {
      throw new Error(
        `Invalid transition: ${current.status} → ${next}. ` +
        `Allowed: ${[...forward, ...backward].join(', ') || 'none'}.`,
      );
    }

    // Live transition guard — reporter or super_admin only.
    if (next === 'live') {
      const isReporter = actor.id === current.reporter_id;
      const isSuperAdmin = actor.role === 'super_admin';
      if (!isReporter && !isSuperAdmin) {
        throw new Error(
          'Only the reporter or a super-admin can mark this item Live.',
        );
      }
    }

    const stamps: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };
    if (next === 'ready_for_review' && !current.ready_for_review_at) {
      stamps.ready_for_review_at = new Date().toISOString();
    }
    if (next === 'live' && !current.live_at) {
      stamps.live_at = new Date().toISOString();
    }
    // Going BACKWARDS clears the corresponding stamp so the timeline
    // stays accurate — if an item ping-pongs ready→building→ready,
    // the second ready_for_review_at reflects the real second time
    // it was ready, not the first.
    if (next === 'building' && current.ready_for_review_at) {
      stamps.ready_for_review_at = null;
    }
    if (next === 'ready_for_review' && current.live_at) {
      stamps.live_at = null;
    }

    const { data, error } = await (supabase as any)
      .from('backlog_items')
      .update({ status: next, ...stamps })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as BacklogItem;
  },

  async delete(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('backlog_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ─── Attachments ──────────────────────────────────────────────────

  async listAttachments(itemId: string): Promise<BacklogAttachment[]> {
    const { data, error } = await (supabase as any)
      .from('backlog_attachments')
      .select('*')
      .eq('item_id', itemId)
      .order('uploaded_at', { ascending: true });
    if (error) throw error;
    return (data || []) as BacklogAttachment[];
  },

  /**
   * Upload a file to Supabase Storage and create the attachment row
   * pointing at it. The storage path is namespaced by item_id so a
   * future "delete item" can sweep the bucket folder cleanly.
   */
  async uploadAttachment(
    itemId: string,
    file: File,
    uploaderId: string,
  ): Promise<BacklogAttachment> {
    // Random suffix to avoid collisions on same-name files.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${itemId}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('backlog-attachments')
      .upload(path, file, { contentType: file.type || undefined });
    if (uploadErr) throw uploadErr;

    const { data, error } = await (supabase as any)
      .from('backlog_attachments')
      .insert({
        item_id: itemId,
        storage_path: path,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: uploaderId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as BacklogAttachment;
  },

  /**
   * Get a short-lived signed URL for displaying an attachment. The
   * bucket is private (no public access) — clients must request a
   * URL each time they render. 1 hour TTL is plenty for a page load.
   */
  async getAttachmentUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('backlog-attachments')
      .createSignedUrl(storagePath, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  },

  async deleteAttachment(attachmentId: string, storagePath: string): Promise<void> {
    // Storage delete first — if the DB row sticks around with a
    // dangling path it's just stale metadata; if Storage holds an
    // orphan file with no DB row, we can't surface it to clean up.
    await supabase.storage.from('backlog-attachments').remove([storagePath]);
    const { error } = await (supabase as any)
      .from('backlog_attachments')
      .delete()
      .eq('id', attachmentId);
    if (error) throw error;
  },
};
