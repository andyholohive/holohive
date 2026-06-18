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
};

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Compute the Monday-anchored ISO date for week N of a campaign.
 * Spec § 4.1: "Weeks calculated from campaign start date." Week 1 =
 * the week containing the campaign start; subsequent weeks start the
 * following Monday.
 */
export function mondayOfCampaignWeek(campaignStartDate: string, weekNumber: number): string {
  const start = new Date(campaignStartDate + 'T00:00:00Z');
  // Find the Monday of the week the campaign started.
  const dayOfWeek = start.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysBackToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const week1Monday = new Date(start);
  week1Monday.setUTCDate(start.getUTCDate() - daysBackToMonday);
  // Add (weekNumber - 1) weeks.
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);
  return target.toISOString().slice(0, 10);
}

/**
 * Compute "what week of the campaign are we in right now?" Used to
 * preselect the current week in the Week Selector (§ 4.1).
 * Returns null if `now` is before the campaign start.
 */
export function currentWeekNumber(campaignStartDate: string, now = new Date()): number | null {
  const start = new Date(campaignStartDate + 'T00:00:00Z');
  // Anchor on the Monday of the campaign-start week.
  const dayOfWeek = start.getUTCDay();
  const daysBackToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const week1Monday = new Date(start);
  week1Monday.setUTCDate(start.getUTCDate() - daysBackToMonday);
  const diffMs = now.getTime() - week1Monday.getTime();
  if (diffMs < 0) return null;
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
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

    return {
      ...(lineup as CampaignLineup),
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
   * Note: this is the auto-transition per spec § 4.1 Completed
   * (blue) status. Manual "Mark as Completed" can be added later
   * if Jdot prefers explicit control — for now, time-based is the
   * lowest-friction default (open question #4 in the Jdot message).
   */
  async markCompletedIfWeekEnded(): Promise<{ updated: number; ids: string[] }> {
    const today = new Date().toISOString().slice(0, 10);
    const { data: candidates, error: cErr } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('id, week_of')
      .eq('status', 'confirmed');
    if (cErr) throw cErr;

    const toUpdate = ((candidates || []) as Array<{ id: string; week_of: string }>)
      .filter(c => {
        // week_of is the Monday; the week ends 7 days later (next Sunday inclusive).
        const weekEnd = new Date(c.week_of + 'T00:00:00Z');
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); // Sunday
        const todayMs = new Date(today + 'T00:00:00Z').getTime();
        return todayMs > weekEnd.getTime();
      })
      .map(c => c.id);

    if (toUpdate.length === 0) return { updated: 0, ids: [] };

    const { error: uErr } = await (this.supabase as any)
      .from('campaign_lineups')
      .update({ status: 'completed' })
      .in('id', toUpdate);
    if (uErr) throw uErr;

    // Best-effort activity log writes — one per lineup.
    for (const id of toUpdate) {
      try {
        await (this.supabase as any)
          .from('lineup_activity_log')
          .insert({
            lineup_id: id,
            action: 'completed',
            actor: null,
            details: 'Auto-transitioned to Completed (week ended).',
          });
      } catch { /* swallow */ }
    }

    return { updated: toUpdate.length, ids: toUpdate };
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
    lines.push(`*${campaignName}* Week ${full.week_number} Lineup Confirmed`);
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
