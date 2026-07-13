/**
 * Lineup Manager service layer.
 *
 * Per-week KOL selection + approval flow per HHP Lineup Manager Spec
 * (Jdot, 2026-06-01). Implements CRUD for lineups + angles + slots,
 * state transitions (draft → proposed → confirmed → completed),
 * audit log writes, and confirm-time side effects (auto-add KOLs to
 * campaign_kols + post lineup to TG ops chat + DM Jdot/Quazo).
 *
 * Permission gating per § 4.3 lives here, not in RLS, because
 * status-dependent rules (Quazo can propose but only on Drafts; Jdot
 * is the only one who can Confirm) need application context.
 *
 * Client-side import via `LineupManagerService` from this file.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { renderTemplate } from './messageTemplates';
import { escapeHtml } from './telegramHtml';
import {
  getCampaignWeek,
  mondayOfCampaignWeek as mondayOfCampaignWeekHelper,
} from '@/lib/campaignWeekHelpers';

// ─── Types ──────────────────────────────────────────────────────────

export type LineupStatus = 'draft' | 'proposed' | 'confirmed' | 'completed';
export type LineupSlotStatus = 'pending' | 'posted' | 'missed';
export type LineupActivityAction =
  | 'draft_saved' | 'proposed' | 'confirmed' | 'completed' | 'unlocked'
  | 'duplicated' | 'kol_added' | 'kol_removed' | 'angle_added'
  | 'angle_removed' | 'angle_renamed' | 'slot_reordered';

export type CampaignLineup = {
  id: string;
  campaign_id: string;
  week_number: number;
  week_of: string; // YYYY-MM-DD
  status: LineupStatus;
  proposed_by: string | null;
  proposed_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LineupAngle = {
  id: string;
  lineup_id: string;
  angle_name: string;
  sort_order: number;
  created_at: string;
};

export type LineupSlot = {
  id: string;
  angle_id: string;
  kol_id: string;
  sort_order: number;
  status: LineupSlotStatus;
  created_at: string;
};

export type LineupActivityLogRow = {
  id: string;
  lineup_id: string;
  action: LineupActivityAction;
  actor: string | null;
  /** Joined from `users.name` — null when the actor row is missing or
      the system performed the action (cron, server-side). */
  actor_name?: string | null;
  details: string | null;
  ts: string;
};

/** Composite returned by `getLineupFull` — what the UI usually wants. */
export type LineupFull = CampaignLineup & {
  angles: Array<LineupAngle & { slots: LineupSlot[] }>;
  // [2026-07-02] Joined `users.name` for proposed_by / confirmed_by so the
  // read-only summary panel can show "Confirmed by Andy" without an extra
  // fetch. Nullable when the actor row is missing or the field itself is null.
  proposed_by_name?: string | null;
  confirmed_by_name?: string | null;
};

/**
 * End-of-week close-out summary for one lineup (per Andy 2026-07-13).
 * Produced by `markCompletedIfWeekEnded` so the cron can post a single
 * ops-terminal line — "«campaign» Wk N closed. X/Y posted, missed: …".
 */
export type LineupCloseOut = {
  lineupId: string;
  campaignId: string | null;
  campaignName: string;
  weekNumber: number;
  /** Slots that reached 'posted' (content landed). */
  posted: number;
  /** Total slots in the lineup. */
  total: number;
  /** KOL names whose slots were still pending → flipped to missed. */
  missedNames: string[];
  /** Per-campaign ops chat fallback (campaigns.tg_ops_group_id). */
  opsChatId: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Compute the Monday-anchored ISO date for week N of a campaign.
 *
 * [2026-06-23] Behaviour change: Week 1 now anchors to the **first
 * Monday on or after** start_date (not the Monday containing start).
 * This aligns lineup weeks across all campaigns regardless of which
 * day the campaign starts on — per Andy's spec.
 *
 * Delegates to lib/campaignWeekHelpers.ts so the math stays in lockstep
 * with the campaign hero, public portal, and any other week-counter
 * surfaces. Anything that wants to compute campaign weeks should call
 * those helpers directly; this function is preserved for the lineup
 * service's existing callers.
 */
export function mondayOfCampaignWeek(campaignStartDate: string, weekNumber: number): string {
  const monday = mondayOfCampaignWeekHelper(campaignStartDate, weekNumber);
  if (!monday) {
    // Defensive fallback — preserves the old return shape so callers
    // don't have to handle null. Returns the input date as-is.
    return campaignStartDate.slice(0, 10);
  }
  // Use local Y-M-D so we return the visible Monday's calendar date,
  // not a UTC-shifted one.
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Compute "what week of the campaign are we in right now?" Used to
 * preselect the current week in the Week Selector.
 *
 * [2026-06-23] Returns 1 for any date before Week 1's Monday (per
 * Andy's call: no Week 0 state on already-running campaigns).
 * Anchored on the first Monday on/after start per
 * lib/campaignWeekHelpers.ts.
 */
export function currentWeekNumber(campaignStartDate: string, now = new Date()): number | null {
  const week = getCampaignWeek(campaignStartDate, now);
  return week?.weekNumber ?? null;
}

// ─── Service ────────────────────────────────────────────────────────

export class LineupManagerService {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── Lineups ──────────────────────────────────────────────────────

  /** Get a single lineup with all its angles and slots. */
  async getLineupFull(lineupId: string): Promise<LineupFull | null> {
    const { data: lineup, error: lErr } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('*')
      .eq('id', lineupId)
      .maybeSingle();
    if (lErr) throw lErr;
    if (!lineup) return null;

    const { data: angles, error: aErr } = await (this.supabase as any)
      .from('lineup_angles')
      .select('*')
      .eq('lineup_id', lineupId)
      .order('sort_order');
    if (aErr) throw aErr;

    if (!angles || angles.length === 0) {
      return { ...(lineup as CampaignLineup), angles: [] };
    }

    const angleIds = (angles as LineupAngle[]).map(a => a.id);
    const { data: slots, error: sErr } = await (this.supabase as any)
      .from('lineup_slots')
      .select('*')
      .in('angle_id', angleIds)
      .order('sort_order');
    if (sErr) throw sErr;

    const slotsByAngle = new Map<string, LineupSlot[]>();
    for (const s of (slots || []) as LineupSlot[]) {
      const arr = slotsByAngle.get(s.angle_id) || [];
      arr.push(s);
      slotsByAngle.set(s.angle_id, arr);
    }

    // [2026-07-02] Join the actor names for proposed_by / confirmed_by so
    // the read-only summary panel can render "Confirmed by <name>". One tiny
    // extra roundtrip; keeps the concern in the service so every consumer
    // gets the same shape.
    const actorIds = Array.from(new Set(
      [lineup.proposed_by, lineup.confirmed_by].filter(Boolean) as string[]
    ));
    const nameById = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: users } = await (this.supabase as any)
        .from('users')
        .select('id, name')
        .in('id', actorIds);
      for (const u of (users || []) as Array<{ id: string; name: string | null }>) {
        if (u.name) nameById.set(u.id, u.name);
      }
    }

    return {
      ...(lineup as CampaignLineup),
      proposed_by_name: lineup.proposed_by ? (nameById.get(lineup.proposed_by) ?? null) : null,
      confirmed_by_name: lineup.confirmed_by ? (nameById.get(lineup.confirmed_by) ?? null) : null,
      angles: (angles as LineupAngle[]).map(a => ({
        ...a,
        slots: slotsByAngle.get(a.id) || [],
      })),
    };
  }

  /** List all lineups for a campaign, newest-week first. */
  async listForCampaign(campaignId: string): Promise<CampaignLineup[]> {
    const { data, error } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('week_number', { ascending: false });
    if (error) throw error;
    return (data || []) as CampaignLineup[];
  }

  /**
   * Get the lineup for a specific (campaign, week_number), creating
   * an empty draft if none exists yet. Idempotent — repeated calls
   * for the same week return the same row.
   */
  async getOrCreateForWeek(
    campaignId: string,
    weekNumber: number,
    weekOf: string,
    actorId: string | null,
  ): Promise<CampaignLineup> {
    const { data: existing } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('week_number', weekNumber)
      .maybeSingle();
    if (existing) return existing as CampaignLineup;

    const { data, error } = await (this.supabase as any)
      .from('campaign_lineups')
      .insert({
        campaign_id: campaignId,
        week_number: weekNumber,
        week_of: weekOf,
        status: 'draft',
      })
      .select('*')
      .single();
    if (error) throw error;

    await this.logActivity(data.id, 'draft_saved', actorId, 'Lineup created.');
    return data as CampaignLineup;
  }

  // ── Angles ───────────────────────────────────────────────────────

  async createAngle(
    lineupId: string,
    angleName: string,
    sortOrder: number,
    actorId: string | null,
  ): Promise<LineupAngle> {
    await this.assertEditable(lineupId);
    const { data, error } = await (this.supabase as any)
      .from('lineup_angles')
      .insert({ lineup_id: lineupId, angle_name: angleName, sort_order: sortOrder })
      .select('*')
      .single();
    if (error) throw error;
    await this.logActivity(lineupId, 'angle_added', actorId, angleName);
    return data as LineupAngle;
  }

  async renameAngle(angleId: string, newName: string, actorId: string | null): Promise<void> {
    const lineupId = await this.lineupIdForAngle(angleId);
    await this.assertEditable(lineupId);
    const { error } = await (this.supabase as any)
      .from('lineup_angles')
      .update({ angle_name: newName })
      .eq('id', angleId);
    if (error) throw error;
    await this.logActivity(lineupId, 'angle_renamed', actorId, newName);
  }

  async deleteAngle(angleId: string, actorId: string | null): Promise<void> {
    const lineupId = await this.lineupIdForAngle(angleId);
    await this.assertEditable(lineupId);
    // Fetch the name for the audit log before delete.
    const { data: angle } = await (this.supabase as any)
      .from('lineup_angles')
      .select('angle_name')
      .eq('id', angleId)
      .single();
    const { error } = await (this.supabase as any)
      .from('lineup_angles')
      .delete()
      .eq('id', angleId);
    if (error) throw error;
    await this.logActivity(lineupId, 'angle_removed', actorId, angle?.angle_name || null);
  }

  /**
   * Delete an entire lineup record. Cascades to lineup_angles,
   * lineup_slots, and lineup_activity_log via FK ON DELETE CASCADE.
   *
   * Allowed from any status — including confirmed/completed — so admins
   * can clean up a lineup that was confirmed by mistake. The caller
   * (UI) is responsible for showing a sufficiently scary confirmation
   * dialog. Unlike `unlock`, this is destructive: the audit trail goes
   * away with the lineup.
   *
   * Note: side effects from a prior `confirm` (auto-added campaign_kols,
   * TG messages) are NOT undone — those are tracked on
   * `campaign_kols.added_via_lineup_id` so they linger as orphans. That's
   * intentional; the KOLs may still be running content even if the
   * lineup record itself was wrong.
   */
  async deleteLineup(lineupId: string, _actorId: string | null): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('campaign_lineups')
      .delete()
      .eq('id', lineupId);
    if (error) throw error;
    // No activity log write — the log row is cascade-deleted with the
    // parent. Caller surfaces the action via toast instead.
  }

  // ── Slots (KOL assignments) ──────────────────────────────────────

  async addSlot(
    angleId: string,
    kolId: string,
    sortOrder: number,
    actorId: string | null,
  ): Promise<LineupSlot> {
    const lineupId = await this.lineupIdForAngle(angleId);
    await this.assertEditable(lineupId);
    const { data, error } = await (this.supabase as any)
      .from('lineup_slots')
      .insert({ angle_id: angleId, kol_id: kolId, sort_order: sortOrder, status: 'pending' })
      .select('*')
      .single();
    if (error) throw error;
    // Look up the KOL name for the audit log.
    const { data: kol } = await (this.supabase as any)
      .from('master_kols')
      .select('name')
      .eq('id', kolId)
      .single();
    await this.logActivity(lineupId, 'kol_added', actorId, kol?.name || kolId);
    return data as LineupSlot;
  }

  async removeSlot(slotId: string, actorId: string | null): Promise<void> {
    const { data: slot } = await (this.supabase as any)
      .from('lineup_slots')
      .select('angle_id, kol_id')
      .eq('id', slotId)
      .single();
    if (!slot) return;
    const lineupId = await this.lineupIdForAngle(slot.angle_id);
    await this.assertEditable(lineupId);
    const { data: kol } = await (this.supabase as any)
      .from('master_kols')
      .select('name')
      .eq('id', slot.kol_id)
      .single();
    const { error } = await (this.supabase as any)
      .from('lineup_slots')
      .delete()
      .eq('id', slotId);
    if (error) throw error;
    await this.logActivity(lineupId, 'kol_removed', actorId, kol?.name || slot.kol_id);
  }

  /**
   * Bulk-reorder slots within an angle. Used by the drag-reorder UX.
   * Accepts ordered list of slotIds; updates sort_order to match.
   */
  async reorderSlots(angleId: string, orderedSlotIds: string[], actorId: string | null): Promise<void> {
    const lineupId = await this.lineupIdForAngle(angleId);
    await this.assertEditable(lineupId);
    // Sequential updates because Supabase doesn't have bulk-update-by-id-with-different-values.
    // The list is small (typically <20 slots per angle) so this is fine.
    for (let i = 0; i < orderedSlotIds.length; i++) {
      const { error } = await (this.supabase as any)
        .from('lineup_slots')
        .update({ sort_order: i })
        .eq('id', orderedSlotIds[i]);
      if (error) throw error;
    }
    await this.logActivity(lineupId, 'slot_reordered', actorId, null);
  }

  // ── State transitions ────────────────────────────────────────────

  /** Spec § 4.3: "Save Draft" — keep status at draft / proposed unchanged. */
  async saveDraft(lineupId: string, actorId: string | null): Promise<void> {
    const lineup = await this.getLineup(lineupId);
    if (lineup.status === 'confirmed' || lineup.status === 'completed') {
      throw new Error(`Cannot save draft on a ${lineup.status} lineup. Unlock first.`);
    }
    await this.logActivity(lineupId, 'draft_saved', actorId, null);
  }

  /**
   * Spec § 4.3: Propose. Marks Draft → Proposed. Sends DM to Jdot
   * (delegated to caller via the returned action).
   */
  async propose(lineupId: string, actorId: string | null): Promise<void> {
    const lineup = await this.getLineup(lineupId);
    if (lineup.status !== 'draft') {
      throw new Error(`Can only propose a draft lineup. Current status: ${lineup.status}.`);
    }
    const { error } = await (this.supabase as any)
      .from('campaign_lineups')
      .update({
        status: 'proposed',
        proposed_by: actorId,
        proposed_at: new Date().toISOString(),
      })
      .eq('id', lineupId);
    if (error) throw error;
    await this.logActivity(lineupId, 'proposed', actorId, null);
    // Notification delegated — see notifyLineupProposed() below for
    // the formatter the API route should call after this returns.
  }

  /**
   * Spec § 4.3: Confirm. Locks the lineup. Per § 6, also triggers
   * auto-add of new KOLs to campaign_kols (with status=Curated) and
   * the TG group chat post. Both are best-effort — the lineup
   * confirmation succeeds even if side effects fail; failures are
   * logged + caller-visible.
   */
  async confirm(lineupId: string, actorId: string | null): Promise<{
    lineup: CampaignLineup;
    autoAddedKols: string[];
    sideEffectErrors: string[];
  }> {
    const lineup = await this.getLineup(lineupId);
    if (lineup.status !== 'proposed' && lineup.status !== 'draft') {
      throw new Error(`Can only confirm a draft or proposed lineup. Current status: ${lineup.status}.`);
    }
    const { data: updated, error } = await (this.supabase as any)
      .from('campaign_lineups')
      .update({
        status: 'confirmed',
        confirmed_by: actorId,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', lineupId)
      .select('*')
      .single();
    if (error) throw error;
    await this.logActivity(lineupId, 'confirmed', actorId, null);

    // ─── § 6.1 — Auto-add any KOLs not yet in campaign_kols ──
    const sideEffectErrors: string[] = [];
    let autoAddedKols: string[] = [];
    try {
      autoAddedKols = await this.autoAddNewKolsToTracker(lineupId, lineup.campaign_id);
    } catch (err: any) {
      sideEffectErrors.push(`Auto-add KOLs: ${err?.message || err}`);
    }

    return {
      lineup: updated as CampaignLineup,
      autoAddedKols,
      sideEffectErrors,
    };
    // The TG group-chat post (§ 6.3) is fired by the API route
    // *after* this returns, using the formatLineupForGroupPost
    // helper below. Done in the route so the bot send infrastructure
    // is owned in one place.
  }

  /**
   * Spec § 4.3: Unlock. Confirmed → Draft. Logs the unlock with
   * timestamp so the audit log shows who reopened.
   */
  async unlock(lineupId: string, actorId: string | null, reason?: string): Promise<void> {
    const lineup = await this.getLineup(lineupId);
    if (lineup.status !== 'confirmed') {
      throw new Error(`Can only unlock a confirmed lineup. Current status: ${lineup.status}.`);
    }
    const { error } = await (this.supabase as any)
      .from('campaign_lineups')
      .update({ status: 'draft', confirmed_by: null, confirmed_at: null })
      .eq('id', lineupId);
    if (error) throw error;
    await this.logActivity(lineupId, 'unlocked', actorId, reason || null);
  }

  /**
   * Spec § 4.3: Duplicate. Copy this week's full structure (angles
   * + slots) into next week as a fresh Draft. If next week already
   * exists, overwrite-with-confirm is left to the caller (this method
   * throws if the next-week lineup exists already with content).
   */
  async duplicateToNextWeek(
    lineupId: string,
    actorId: string | null,
  ): Promise<CampaignLineup> {
    const source = await this.getLineupFull(lineupId);
    if (!source) throw new Error('Source lineup not found.');

    // Compute next week's metadata.
    const nextWeekNumber = source.week_number + 1;
    const nextWeekOf = (() => {
      const d = new Date(source.week_of + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
    })();

    // Refuse if next week already has content (don't silently
    // overwrite). The caller can delete the existing one first
    // if a fresh duplicate is wanted.
    const { data: existing } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('id, status')
      .eq('campaign_id', source.campaign_id)
      .eq('week_number', nextWeekNumber)
      .maybeSingle();
    if (existing) {
      throw new Error(
        `Week ${nextWeekNumber} already has a lineup (${existing.status}). Delete or unlock it first.`,
      );
    }

    const { data: newLineup, error } = await (this.supabase as any)
      .from('campaign_lineups')
      .insert({
        campaign_id: source.campaign_id,
        week_number: nextWeekNumber,
        week_of: nextWeekOf,
        status: 'draft',
      })
      .select('*')
      .single();
    if (error) throw error;

    // Copy angles + slots in order.
    for (const angle of source.angles) {
      const { data: newAngle } = await (this.supabase as any)
        .from('lineup_angles')
        .insert({
          lineup_id: newLineup.id,
          angle_name: angle.angle_name,
          sort_order: angle.sort_order,
        })
        .select('id')
        .single();
      if (!newAngle) continue;
      for (const slot of angle.slots) {
        await (this.supabase as any)
          .from('lineup_slots')
          .insert({
            angle_id: newAngle.id,
            kol_id: slot.kol_id,
            sort_order: slot.sort_order,
            status: 'pending',
          });
      }
    }

    await this.logActivity(
      newLineup.id,
      'duplicated',
      actorId,
      `Duplicated from Week ${source.week_number}.`,
    );
    return newLineup as CampaignLineup;
  }

  // ── Completed transition (cron-driven) ──────────────────────────

  /**
   * Spec § 4.1 — Completed status. Auto-transition any confirmed
   * lineup whose week has ended (week_of + 7 days <= today UTC).
   * Returns count of updated rows for cron telemetry.
   *
   * [2026-07-13] End-of-week close-out (per Andy): at rollover, any
   * lineup_slot still 'pending' flips to 'missed' — so a KOL who
   * flaked leaves a record instead of silently falling off the
   * dashboard. Returns per-lineup close-out data (posted/total +
   * missed KOL names + the campaign's ops chat) so the cron can post
   * one summary line per lineup to the ops terminal. Slots reach
   * 'posted' via lib/lineupSlotSync when content lands; everything
   * left over is a no-show.
   *
   * Note: this is the auto-transition per spec § 4.1 Completed
   * (blue) status. Manual "Mark as Completed" can be added later
   * if Jdot prefers explicit control — for now, time-based is the
   * lowest-friction default (open question #4 in the Jdot message).
   */
  async markCompletedIfWeekEnded(): Promise<{
    updated: number;
    ids: string[];
    closeOuts: LineupCloseOut[];
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const { data: candidates, error: cErr } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('id, week_of, week_number, campaign:campaigns(id, name, tg_ops_group_id)')
      .eq('status', 'confirmed');
    if (cErr) throw cErr;

    const ended = ((candidates || []) as Array<{
      id: string;
      week_of: string;
      week_number: number;
      campaign: { id: string; name: string; tg_ops_group_id: string | null } | null;
    }>).filter(c => {
      // week_of is the Monday; the week ends 6 days later (Sunday inclusive).
      const weekEnd = new Date(c.week_of + 'T00:00:00Z');
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); // Sunday
      const todayMs = new Date(today + 'T00:00:00Z').getTime();
      return todayMs > weekEnd.getTime();
    });

    if (ended.length === 0) return { updated: 0, ids: [], closeOuts: [] };

    const ids = ended.map(c => c.id);
    const closeOuts: LineupCloseOut[] = [];

    for (const lineup of ended) {
      // Slots hang off angles, not the lineup directly.
      const { data: angles } = await (this.supabase as any)
        .from('lineup_angles')
        .select('id')
        .eq('lineup_id', lineup.id);
      const angleIds = ((angles as any[]) ?? []).map(a => a.id);

      let posted = 0;
      let total = 0;
      const missedNames: string[] = [];

      if (angleIds.length > 0) {
        // Pull every slot with the KOL name so we can (a) flip the
        // pending ones to missed and (b) name the no-shows in the post.
        const { data: slots } = await (this.supabase as any)
          .from('lineup_slots')
          .select('id, status, kol:master_kols(name)')
          .in('angle_id', angleIds);
        const slotRows = ((slots as any[]) ?? []);
        total = slotRows.length;
        posted = slotRows.filter(s => s.status === 'posted').length;
        const pendingIds = slotRows.filter(s => s.status === 'pending').map(s => s.id);
        for (const s of slotRows) {
          if (s.status === 'pending') missedNames.push(s.kol?.name || 'Unknown');
        }
        if (pendingIds.length > 0) {
          await (this.supabase as any)
            .from('lineup_slots')
            .update({ status: 'missed' })
            .in('id', pendingIds);
        }
      }

      closeOuts.push({
        lineupId: lineup.id,
        campaignId: lineup.campaign?.id ?? null,
        campaignName: lineup.campaign?.name ?? 'Campaign',
        weekNumber: lineup.week_number,
        posted,
        total,
        missedNames,
        opsChatId: lineup.campaign?.tg_ops_group_id ?? null,
      });
    }

    const { error: uErr } = await (this.supabase as any)
      .from('campaign_lineups')
      .update({ status: 'completed' })
      .in('id', ids);
    if (uErr) throw uErr;

    // Best-effort activity log writes — one per lineup.
    for (const co of closeOuts) {
      try {
        const missedNote = co.missedNames.length > 0
          ? ` ${co.missedNames.length} slot(s) flipped to missed: ${co.missedNames.join(', ')}.`
          : '';
        await (this.supabase as any)
          .from('lineup_activity_log')
          .insert({
            lineup_id: co.lineupId,
            action: 'completed',
            actor: null,
            details: `Auto-transitioned to Completed (week ended). ${co.posted}/${co.total} posted.${missedNote}`,
          });
      } catch { /* swallow */ }
    }

    return { updated: ids.length, ids, closeOuts };
  }

  // ── Activity log ─────────────────────────────────────────────────

  async getActivityLog(lineupId: string): Promise<LineupActivityLogRow[]> {
    // Join the actor's display name so the popover can show who did
    // what (instead of a UUID). RLS on users is permissive enough for
    // signed-in teammates to read each other's name.
    const { data, error } = await (this.supabase as any)
      .from('lineup_activity_log')
      .select('*, actor_user:users!lineup_activity_log_actor_fkey(name)')
      .eq('lineup_id', lineupId)
      .order('ts', { ascending: false });
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      lineup_id: r.lineup_id,
      action: r.action,
      actor: r.actor,
      actor_name: r.actor_user?.name ?? null,
      details: r.details,
      ts: r.ts,
    })) as LineupActivityLogRow[];
  }

  // ── TG group chat formatter (§ 7.2) ──────────────────────────────

  /**
   * Format the confirmed lineup as a Telegram group-chat post.
   * The API route that calls confirm() should call this and dispatch
   * the result via the bot's existing send-message infrastructure.
   *
   * Uses Markdown links — the simplest "embed @handle as a clickable
   * link" interpretation of the spec § 7.2 "(@handle embed)" line.
   * Awaiting Jdot's clarification (open question #6) on whether
   * Telegram MessageEntity mentions are preferred.
   */
  async formatLineupForGroupPost(
    lineupId: string,
    campaignName: string,
    confirmedByName: string,
    // [2026-07-06] Optional custom header line (Markdown; vars
    // {campaign} {week} {by}) — resolved from app_settings by the
    // notify route. Omitted → the original hardcoded header.
    headerTemplate?: string,
  ): Promise<string> {
    const full = await this.getLineupFull(lineupId);
    if (!full) throw new Error('Lineup not found for group post.');

    // Pull KOL names + handles.
    const allKolIds = full.angles.flatMap(a => a.slots.map(s => s.kol_id));
    const { data: kols } = await (this.supabase as any)
      .from('master_kols')
      .select('id, name, link')
      .in('id', allKolIds.length > 0 ? allKolIds : ['00000000-0000-0000-0000-000000000000']);
    const kolById = new Map<string, { name: string; link: string | null }>();
    for (const k of (kols || []) as Array<{ id: string; name: string; link: string | null }>) {
      kolById.set(k.id, { name: k.name, link: k.link });
    }

    const lines: string[] = [];
    lines.push(headerTemplate
      ? renderTemplate(headerTemplate, {
          campaign: campaignName,
          week: String(full.week_number),
          by: confirmedByName,
        })
      : `*${campaignName}* Week ${full.week_number} Lineup Confirmed`);
    lines.push('');
    for (const angle of full.angles) {
      lines.push(`*${angle.angle_name}* (${angle.slots.length} KOL${angle.slots.length === 1 ? '' : 's'})`);
      for (const slot of angle.slots) {
        const kol = kolById.get(slot.kol_id);
        if (!kol) continue;
        // Markdown link if we have a profile URL, plain text otherwise.
        const display = kol.link
          ? `[${kol.name}](${kol.link})`
          : kol.name;
        lines.push(`  • ${display}`);
      }
      lines.push('');
    }
    lines.push(`Confirmed by ${confirmedByName} | ${new Date(full.confirmed_at || Date.now()).toLocaleString()}`);
    return lines.join('\n');
  }

  // ── Weekly Content Recap (§ Andy 2026-07-13) ─────────────────────

  /**
   * Format the just-ended week's lineup as a client-facing "Weekly
   * Content Recap" (per Andy): angles in order, each with only the KOLs
   * who actually posted, each name hyperlinked to their content. KOLs
   * with no posted content that week are dropped ("remove unposted
   * kols"). Returns null when nothing posted ("no content = no post").
   *
   * Posted = a `contents` row for that campaign+KOL with status 'posted'
   * and activation_date inside the lineup week (week_of .. week_of+6).
   * The slot's own 'posted' status isn't trusted here — the content row
   * is the source of truth, and it's what carries the link + preview.
   *
   * HTML output; web preview left ON by the sender so the first content
   * link renders its image.
   */
  async formatWeeklyContentRecap(
    campaignId: string,
    campaignName: string,
    weekOf: string,
    headerTemplate?: string,
  ): Promise<string | null> {
    // Find the week's lineup (confirmed or completed — the close-out
    // cron flips confirmed→completed Monday 06:00, before this runs).
    const { data: lineups } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('id, week_number, week_of, status')
      .eq('campaign_id', campaignId)
      .eq('week_of', weekOf)
      .in('status', ['confirmed', 'completed'])
      .order('week_number', { ascending: false })
      .limit(1);
    const lineup = (lineups as any[])?.[0];
    if (!lineup) return null;

    const full = await this.getLineupFull(lineup.id);
    if (!full || full.angles.length === 0) return null;

    // Week window end (Sunday).
    const weekEnd = new Date(weekOf + 'T00:00:00Z');
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // Posted content for the campaign in this week, keyed by master_kol_id
    // (latest wins). contents → campaign_kols(master_kol_id).
    const { data: contentRows } = await (this.supabase as any)
      .from('contents')
      .select('content_link, activation_date, campaign_kols:campaign_kols_id(master_kol_id)')
      .eq('campaign_id', campaignId)
      .eq('status', 'posted')
      .gte('activation_date', weekOf)
      .lte('activation_date', weekEndStr)
      .order('activation_date', { ascending: true });
    const linkByKol = new Map<string, string>();
    for (const r of ((contentRows as any[]) ?? [])) {
      const kolId = r.campaign_kols?.master_kol_id;
      const link = (r.content_link || '').trim();
      if (kolId && link) linkByKol.set(kolId, link); // ascending order → last (latest) wins
    }
    if (linkByKol.size === 0) return null; // no content = no post

    // KOL display names for the slots.
    const allKolIds = full.angles.flatMap(a => a.slots.map(s => s.kol_id));
    const { data: kols } = await (this.supabase as any)
      .from('master_kols')
      .select('id, name')
      .in('id', allKolIds.length > 0 ? allKolIds : ['00000000-0000-0000-0000-000000000000']);
    const nameByKol = new Map<string, string>();
    for (const k of ((kols as any[]) ?? [])) nameByKol.set(k.id, k.name);

    const header = headerTemplate
      ? renderTemplate(headerTemplate, { campaign: escapeHtml(campaignName), week: String(lineup.week_number) })
      : `<b>${escapeHtml(campaignName)} Weekly Content Recap</b>`;

    const blocks: string[] = [];
    for (const angle of full.angles) {
      // Only KOLs in this angle who actually posted (have a content link).
      const posted = angle.slots.filter(s => linkByKol.has(s.kol_id));
      if (posted.length === 0) continue; // drop empty angles
      const lines = [`<b>${escapeHtml(angle.angle_name)}</b> (${posted.length} KOL${posted.length === 1 ? '' : 's'})`];
      for (const slot of posted) {
        const name = nameByKol.get(slot.kol_id) || 'KOL';
        const link = linkByKol.get(slot.kol_id)!;
        lines.push(`  • <a href="${escapeHtml(link)}">${escapeHtml(name)}</a>`);
      }
      blocks.push(lines.join('\n'));
    }
    if (blocks.length === 0) return null;

    return [header, '', blocks.join('\n\n')].join('\n');
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private async getLineup(lineupId: string): Promise<CampaignLineup> {
    const { data, error } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('*')
      .eq('id', lineupId)
      .single();
    if (error) throw error;
    return data as CampaignLineup;
  }

  private async lineupIdForAngle(angleId: string): Promise<string> {
    const { data, error } = await (this.supabase as any)
      .from('lineup_angles')
      .select('lineup_id')
      .eq('id', angleId)
      .single();
    if (error) throw error;
    return data.lineup_id as string;
  }

  /** Throws if the lineup is in a non-editable state. */
  private async assertEditable(lineupId: string): Promise<void> {
    const lineup = await this.getLineup(lineupId);
    if (lineup.status === 'confirmed' || lineup.status === 'completed') {
      throw new Error(`Cannot edit a ${lineup.status} lineup. Unlock first.`);
    }
  }

  private async logActivity(
    lineupId: string,
    action: LineupActivityAction,
    actor: string | null,
    details: string | null,
  ): Promise<void> {
    // Best-effort — log failure shouldn't fail the parent op.
    try {
      await (this.supabase as any)
        .from('lineup_activity_log')
        .insert({ lineup_id: lineupId, action, actor, details });
    } catch (err) {
      console.warn('LineupManager: activity log write failed', err);
    }
  }

  /**
   * § 6.1 — for every kol_id in the lineup that doesn't have a
   * campaign_kols row, create one with hh_status='Curated'. Returns
   * the names of newly-added KOLs for the confirm response toast.
   */
  private async autoAddNewKolsToTracker(
    lineupId: string,
    campaignId: string,
  ): Promise<string[]> {
    // All kol_ids in the lineup.
    const { data: slotRows } = await (this.supabase as any)
      .from('lineup_slots')
      .select('kol_id, angle_id')
      .in(
        'angle_id',
        (
          await (this.supabase as any)
            .from('lineup_angles')
            .select('id')
            .eq('lineup_id', lineupId)
        ).data?.map((a: { id: string }) => a.id) || [],
      );
    const lineupKolIds = Array.from(
      new Set(((slotRows || []) as Array<{ kol_id: string }>).map(r => r.kol_id)),
    );
    if (lineupKolIds.length === 0) return [];

    // KOLs already in the tracker.
    const { data: existing } = await (this.supabase as any)
      .from('campaign_kols')
      .select('master_kol_id')
      .eq('campaign_id', campaignId)
      .in('master_kol_id', lineupKolIds);
    const existingIds = new Set(
      ((existing || []) as Array<{ master_kol_id: string }>).map(r => r.master_kol_id),
    );

    const toAdd = lineupKolIds.filter(id => !existingIds.has(id));
    if (toAdd.length === 0) return [];

    // Pull names for the response.
    const { data: nameRows } = await (this.supabase as any)
      .from('master_kols')
      .select('id, name')
      .in('id', toAdd);
    const nameById = new Map<string, string>();
    for (const r of (nameRows || []) as Array<{ id: string; name: string }>) {
      nameById.set(r.id, r.name);
    }

    // Bulk insert.
    const { error } = await (this.supabase as any)
      .from('campaign_kols')
      .insert(toAdd.map(id => ({
        campaign_id: campaignId,
        master_kol_id: id,
        hh_status: 'Curated',
      })));
    if (error) throw error;

    return toAdd.map(id => nameById.get(id) || id);
  }
}
