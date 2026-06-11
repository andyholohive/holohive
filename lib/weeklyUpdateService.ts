/**
 * Weekly Update service — Post-Onboarding Phase 2.
 *
 * Drives the new Weekly Update tab in the Client Context modal, which
 * replaces Bolt's Monday TG update + ClickUp WDR form per Jdot's spec
 * (HHP Portal_ Post-Onboarding Campaign View, v2 2026-05-28).
 *
 * Two-stage flow:
 *   Stage 1 (Jdot, Sun/Mon)       — strategic_notes (internal-only)
 *   Stage 2 (Bolt/CM, Mon)        — three zones:
 *     A. execution_plan[]   (internal yellow zone — batch-creates HQ tasks on submit)
 *     B. this_week_feed[]   (client-facing green zone — drives the portal "This Week" card)
 *     C. top_post_override  (null = use auto-selected from contents table)
 *
 * Q5 decision (Andy 2026-06-11): mid-week edits to feed items + plan
 * are allowed; every edit logs to client_weekly_update_audit so the
 * team stays accountable. Tight-locking creates friction for typo fixes.
 *
 * Q3 decision (Andy 2026-06-11): execution_plan rows auto-create HQ
 * tasks with task_type='Client Delivery' + the spec's deliverable_type
 * value. The 6-value list is enforced by the CHECK constraint applied
 * in the post_onboarding_phase2_schema migration.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Per Q3 — the 6-value list enforced by CHECK on tasks.deliverable_type.
 * Stored lowercase to match the existing UI in /clients/page.tsx; rendered
 * TitleCase via DELIVERABLE_TYPE_LABELS for display.
 */
export type DeliverableType =
  | 'brief'
  | 'report'
  | 'translation'
  | 'content_review'
  | 'client_update'
  | 'other';

export const DELIVERABLE_TYPES: DeliverableType[] = [
  'brief',
  'report',
  'translation',
  'content_review',
  'client_update',
  'other',
];

export const DELIVERABLE_TYPE_LABELS: Record<DeliverableType, string> = {
  brief: 'Brief',
  report: 'Report',
  translation: 'Translation',
  content_review: 'Content Review',
  client_update: 'Client Update',
  other: 'Other',
};

/**
 * Zone A: one row of the internal execution plan. Submitting the
 * weekly update converts each row into a row in `tasks`.
 */
export type ExecutionPlanItem = {
  /** Stable id so we can match before/after for audit log diffs. */
  id: string;
  /** What needs to happen. Free text. */
  task_description: string;
  /** UUID of the assignee from users table. Null = unassigned. */
  assignee_id: string | null;
  /** YYYY-MM-DD. Null = no specific deadline (uncommon). */
  due_date: string | null;
  /** Per Q3, drives the new tasks.deliverable_type field. */
  deliverable_type: DeliverableType | null;
  /** If true, an HQ task was auto-created at submit. Re-submit won't dup. */
  task_created: boolean;
  /** Optional FK to the created tasks row, for forward navigation. */
  task_id: string | null;
};

/**
 * Zone B: one row of the client-facing This Week feed. Drives the
 * portal's "This Week" card (Phase 3). Done items optionally seed a
 * Delivery Log Pending Review draft (Phase 4 / spec § 6).
 */
export type ThisWeekFeedItem = {
  id: string;
  text: string;
  /** YYYY-MM-DD — the date the item is anchored to (e.g. "Wed: KOL X posts"). */
  date: string | null;
  status: 'pending' | 'done';
  done_at: string | null;
  done_by: string | null;
};

/**
 * Zone C: top post override. Null = use the auto-picked content
 * derived from the contents table by total engagement.
 */
export type TopPostOverride = {
  content_id: string;
} | null;

export type WeeklyUpdate = {
  id: string;
  client_id: string;
  week_of: string;        // YYYY-MM-DD (Monday-anchored)
  strategic_notes: string | null;
  strategic_notes_updated_at: string | null;
  strategic_notes_by: string | null;
  execution_plan: ExecutionPlanItem[];
  execution_plan_submitted_at: string | null;
  execution_plan_submitted_by: string | null;
  this_week_feed: ThisWeekFeedItem[];
  top_post_override: TopPostOverride;
  // Legacy columns — present on the row but the new UI ignores them.
  // Read by /clients/page.tsx + /public/portal/[id]/page.tsx as
  // fallback for pre-v2 rows; do not delete.
  current_focus: string | null;
  active_initiatives: string | null;
  next_checkin: string | null;
  open_questions: string | null;
  created_at: string;
  updated_at: string;
};

export type EditKind =
  | 'strategic_notes'
  | 'execution_plan'
  | 'this_week_feed'
  | 'top_post_override'
  | 'submitted';

export type WeeklyUpdateAuditRow = {
  id: string;
  weekly_update_id: string;
  edited_by: string | null;
  edited_by_name: string | null;
  edit_kind: EditKind;
  before_json: unknown;
  after_json: unknown;
  edited_at: string;
};

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Monday-anchored ISO date for any input date. Falls back to the input
 * date string when it can't be parsed.
 *
 * Why Monday: Bolt submits Mondays per spec § 5 Stage 2; aligning the
 * key to a single day makes "the current week's update" trivially
 * resolvable.
 */
export function mondayOfWeek(input: Date): string {
  const d = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sun
  const delta = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Lightweight uuid-ish — good enough for in-array stable ids. */
function rid(): string {
  // crypto.randomUUID is available in modern browsers + Node 18+.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback. Not RFC-4122 valid, but unique enough for client-side ids.
  return `r${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function newExecutionPlanItem(partial?: Partial<ExecutionPlanItem>): ExecutionPlanItem {
  return {
    id: rid(),
    task_description: '',
    assignee_id: null,
    due_date: null,
    deliverable_type: null,
    task_created: false,
    task_id: null,
    ...partial,
  };
}

export function newThisWeekFeedItem(partial?: Partial<ThisWeekFeedItem>): ThisWeekFeedItem {
  return {
    id: rid(),
    text: '',
    date: null,
    status: 'pending',
    done_at: null,
    done_by: null,
    ...partial,
  };
}

// ─── Service ────────────────────────────────────────────────────────

export class WeeklyUpdateService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Fetch the weekly update row for (client, week). Creates an empty
   * row if none exists yet so the UI always has something to bind to.
   * Idempotent — concurrent callers will both end up on the same row
   * thanks to the UNIQUE (client_id, week_of) constraint.
   */
  async getOrCreate(clientId: string, weekOf: string): Promise<WeeklyUpdate> {
    const { data: existing, error: selErr } = await (this.supabase as any)
      .from('client_weekly_updates')
      .select('*')
      .eq('client_id', clientId)
      .eq('week_of', weekOf)
      .maybeSingle();
    if (selErr) throw selErr;
    if (existing) return this.normalizeRow(existing);

    // No row yet — create an empty one. The legacy current_focus column
    // is NOT NULL, so we have to insert an empty string.
    const { data: inserted, error: insErr } = await (this.supabase as any)
      .from('client_weekly_updates')
      .insert({
        client_id: clientId,
        week_of: weekOf,
        current_focus: '',
        execution_plan: [],
        this_week_feed: [],
      })
      .select('*')
      .single();
    if (insErr) {
      // Concurrent-create race: re-select the row that landed.
      const { data: race } = await (this.supabase as any)
        .from('client_weekly_updates')
        .select('*')
        .eq('client_id', clientId)
        .eq('week_of', weekOf)
        .single();
      if (race) return this.normalizeRow(race);
      throw insErr;
    }
    return this.normalizeRow(inserted);
  }

  /** Latest N rows for a client, newest first. Drives the "history" pane. */
  async listRecent(clientId: string, limit = 12): Promise<WeeklyUpdate[]> {
    const { data, error } = await (this.supabase as any)
      .from('client_weekly_updates')
      .select('*')
      .eq('client_id', clientId)
      .order('week_of', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((r: any) => this.normalizeRow(r));
  }

  // ── Field updates with audit log ────────────────────────────────

  async saveStrategicNotes(
    weeklyUpdateId: string,
    notes: string,
    actor: { id: string | null; name: string | null },
  ): Promise<void> {
    const before = await this.fetchSnapshot(weeklyUpdateId, ['strategic_notes']);
    const nowIso = new Date().toISOString();
    const { error } = await (this.supabase as any)
      .from('client_weekly_updates')
      .update({
        strategic_notes: notes,
        strategic_notes_updated_at: nowIso,
        strategic_notes_by: actor.id,
      })
      .eq('id', weeklyUpdateId);
    if (error) throw error;
    await this.logEdit(weeklyUpdateId, 'strategic_notes', before, { strategic_notes: notes }, actor);
  }

  async saveExecutionPlan(
    weeklyUpdateId: string,
    plan: ExecutionPlanItem[],
    actor: { id: string | null; name: string | null },
  ): Promise<void> {
    const before = await this.fetchSnapshot(weeklyUpdateId, ['execution_plan']);
    const { error } = await (this.supabase as any)
      .from('client_weekly_updates')
      .update({ execution_plan: plan })
      .eq('id', weeklyUpdateId);
    if (error) throw error;
    await this.logEdit(weeklyUpdateId, 'execution_plan', before, { execution_plan: plan }, actor);
  }

  async saveThisWeekFeed(
    weeklyUpdateId: string,
    feed: ThisWeekFeedItem[],
    actor: { id: string | null; name: string | null },
  ): Promise<void> {
    const before = await this.fetchSnapshot(weeklyUpdateId, ['this_week_feed']);
    const { error } = await (this.supabase as any)
      .from('client_weekly_updates')
      .update({ this_week_feed: feed })
      .eq('id', weeklyUpdateId);
    if (error) throw error;
    await this.logEdit(weeklyUpdateId, 'this_week_feed', before, { this_week_feed: feed }, actor);
  }

  async saveTopPostOverride(
    weeklyUpdateId: string,
    override: TopPostOverride,
    actor: { id: string | null; name: string | null },
  ): Promise<void> {
    const before = await this.fetchSnapshot(weeklyUpdateId, ['top_post_override']);
    const { error } = await (this.supabase as any)
      .from('client_weekly_updates')
      .update({ top_post_override: override })
      .eq('id', weeklyUpdateId);
    if (error) throw error;
    await this.logEdit(weeklyUpdateId, 'top_post_override', before, { top_post_override: override }, actor);
  }

  /**
   * Convenience: toggle a single feed item's done status without
   * re-sending the full array. Useful for the Q4 "Done toggle" UX —
   * one click flips it, audit log captures who and when.
   */
  async toggleFeedItemDone(
    weeklyUpdateId: string,
    feedItemId: string,
    nextStatus: 'pending' | 'done',
    actor: { id: string | null; name: string | null },
  ): Promise<ThisWeekFeedItem[]> {
    const { data: row, error: selErr } = await (this.supabase as any)
      .from('client_weekly_updates')
      .select('this_week_feed')
      .eq('id', weeklyUpdateId)
      .single();
    if (selErr) throw selErr;
    const feed: ThisWeekFeedItem[] = Array.isArray(row?.this_week_feed) ? row.this_week_feed : [];
    const next = feed.map(item => {
      if (item.id !== feedItemId) return item;
      return {
        ...item,
        status: nextStatus,
        done_at: nextStatus === 'done' ? new Date().toISOString() : null,
        done_by: nextStatus === 'done' ? (actor.id ?? null) : null,
      };
    });
    await this.saveThisWeekFeed(weeklyUpdateId, next, actor);
    return next;
  }

  /**
   * Submit Stage 2 — Bolt presses "Submit Weekly Update" Monday morning.
   * Side effect: every execution_plan row with task_created=false gets
   * a corresponding row in `tasks` (task_type='Client Delivery' +
   * deliverable_type from the row). The plan row is then marked
   * task_created=true so re-submission doesn't duplicate.
   *
   * Returns the count of tasks created.
   */
  async submitExecutionPlan(
    weeklyUpdateId: string,
    clientId: string,
    plan: ExecutionPlanItem[],
    actor: { id: string | null; name: string | null },
  ): Promise<{ tasksCreated: number; updatedPlan: ExecutionPlanItem[] }> {
    const toCreate = plan.filter(p => !p.task_created && p.task_description.trim().length > 0);
    const updatedPlan = [...plan];
    let createdCount = 0;

    for (let i = 0; i < toCreate.length; i++) {
      const item = toCreate[i];
      const { data: task, error: tErr } = await (this.supabase as any)
        .from('tasks')
        .insert({
          title: item.task_description,
          task_type: 'Client Delivery',
          deliverable_type: item.deliverable_type,
          client_id: clientId,
          assigned_to: item.assignee_id,
          due_date: item.due_date,
          status: 'pending',
          created_by: actor.id,
        })
        .select('id')
        .single();
      if (tErr) {
        // Don't abort the whole submit — let the UI surface partial
        // failures so the user can retry just the rows that failed.
        console.error('[weeklyUpdate.submitExecutionPlan] task insert failed:', tErr);
        continue;
      }
      createdCount++;
      const idx = updatedPlan.findIndex(p => p.id === item.id);
      if (idx >= 0) {
        updatedPlan[idx] = {
          ...updatedPlan[idx],
          task_created: true,
          task_id: (task as { id: string }).id,
        };
      }
    }

    // Persist the updated plan + stamp the submission timestamp.
    const nowIso = new Date().toISOString();
    const { error: uErr } = await (this.supabase as any)
      .from('client_weekly_updates')
      .update({
        execution_plan: updatedPlan,
        execution_plan_submitted_at: nowIso,
        execution_plan_submitted_by: actor.id,
      })
      .eq('id', weeklyUpdateId);
    if (uErr) throw uErr;
    await this.logEdit(weeklyUpdateId, 'submitted', { tasksCreated: 0 }, { tasksCreated: createdCount }, actor);

    return { tasksCreated: createdCount, updatedPlan };
  }

  // ── Audit log ───────────────────────────────────────────────────

  async getAuditLog(weeklyUpdateId: string, limit = 100): Promise<WeeklyUpdateAuditRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('client_weekly_update_audit')
      .select('*')
      .eq('weekly_update_id', weeklyUpdateId)
      .order('edited_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as WeeklyUpdateAuditRow[];
  }

  // ── Internals ───────────────────────────────────────────────────

  private async fetchSnapshot(weeklyUpdateId: string, fields: string[]): Promise<Record<string, unknown>> {
    const { data, error } = await (this.supabase as any)
      .from('client_weekly_updates')
      .select(fields.join(','))
      .eq('id', weeklyUpdateId)
      .maybeSingle();
    if (error || !data) return {};
    return data as Record<string, unknown>;
  }

  private async logEdit(
    weeklyUpdateId: string,
    kind: EditKind,
    before: unknown,
    after: unknown,
    actor: { id: string | null; name: string | null },
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('client_weekly_update_audit')
      .insert({
        weekly_update_id: weeklyUpdateId,
        edit_kind: kind,
        before_json: before ?? null,
        after_json: after ?? null,
        edited_by: actor.id,
        edited_by_name: actor.name,
      });
    if (error) {
      // Audit failures should not block user-facing writes. Log + move on.
      console.error('[weeklyUpdate.logEdit] audit insert failed:', error);
    }
  }

  /**
   * Normalize a raw DB row to the strongly-typed shape. Defends
   * against legacy rows that have null/missing JSONB columns.
   */
  private normalizeRow(row: any): WeeklyUpdate {
    return {
      id: row.id,
      client_id: row.client_id,
      week_of: row.week_of,
      strategic_notes: row.strategic_notes ?? null,
      strategic_notes_updated_at: row.strategic_notes_updated_at ?? null,
      strategic_notes_by: row.strategic_notes_by ?? null,
      execution_plan: Array.isArray(row.execution_plan) ? row.execution_plan : [],
      execution_plan_submitted_at: row.execution_plan_submitted_at ?? null,
      execution_plan_submitted_by: row.execution_plan_submitted_by ?? null,
      this_week_feed: Array.isArray(row.this_week_feed) ? row.this_week_feed : [],
      top_post_override: row.top_post_override ?? null,
      current_focus: row.current_focus ?? null,
      active_initiatives: row.active_initiatives ?? null,
      next_checkin: row.next_checkin ?? null,
      open_questions: row.open_questions ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
