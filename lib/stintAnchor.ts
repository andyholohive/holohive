import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve which client_stint a new row belongs to.
 *
 * WHY THIS EXISTS [2026-07-27]
 * The `88bca7b` migration added stint_id to campaigns, deliverables,
 * client_weekly_updates, client_activity_log and client_meeting_notes, and
 * backfilled every row that existed at the time. Nothing ever set it on INSERT.
 * So stint anchoring worked once, in June, and then silently decayed: by
 * 2026-07-27 it was 18/42 campaigns, 20/32 deliverables, 15/30 weekly updates
 * and 81/160 activity-log rows unanchored, every one of them written after the
 * backfill. Stints are the substrate under Week N of M, budget totals, coverage
 * alerts and the renewals pipeline, so per-stint queries were quietly dropping
 * roughly half of recent history.
 *
 * It stayed invisible because `campaign_week_window` falls back to a
 * client-level lookup when stint_id is NULL — the week math still rendered, so
 * nothing looked broken while the anchor rotted underneath it.
 *
 * One shared resolver rather than the same lookup inlined at each insert: six
 * copies would drift, and the whole failure mode here is a rule that lives in
 * too many places to keep true.
 */

type MinimalStint = {
  id: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
};

/**
 * The stint covering `onDate` for this client, or the best available fallback.
 *
 * Order of preference:
 *   1. A stint whose window contains the date (open-ended end_date counts).
 *   2. The client's active stint.
 *   3. The most recently started stint.
 *   4. null — the client genuinely has no stints yet. Callers must treat NULL
 *      as acceptable, NOT as an error: brand-new clients legitimately have no
 *      engagement recorded, and refusing the insert would be worse than
 *      leaving one row unanchored.
 *
 * Never throws. A resolver failure must not block the write it decorates —
 * losing the row is strictly worse than losing its anchor.
 */
export async function resolveStintId(
  supabase: SupabaseClient<any, any, any>,
  clientId: string | null | undefined,
  onDate?: string | Date | null,
): Promise<string | null> {
  if (!clientId) return null;

  try {
    const { data, error } = await supabase
      .from('client_stints')
      .select('id, start_date, end_date, status')
      .eq('client_id', clientId)
      .order('start_date', { ascending: false });

    if (error || !data || data.length === 0) return null;
    const stints = data as MinimalStint[];

    const day = (() => {
      if (!onDate) return new Date().toISOString().slice(0, 10);
      if (onDate instanceof Date) return onDate.toISOString().slice(0, 10);
      return String(onDate).slice(0, 10);
    })();

    // 1. Covering window. end_date NULL means still open, so it covers anything
    //    on or after start_date.
    const covering = stints.find(s =>
      s.start_date && s.start_date <= day && (!s.end_date || s.end_date >= day),
    );
    if (covering) return covering.id;

    // 2. Active. Reached when the date falls in a gap between stints — the row
    //    still belongs to the engagement currently running.
    const active = stints.find(s => s.status === 'active');
    if (active) return active.id;

    // 3. Most recent by start_date (the select is already sorted desc).
    return stints[0]?.id ?? null;
  } catch {
    return null;
  }
}

// A campaign_id → stint_id variant was written here first, on the assumption
// that `deliverables` was campaign-scoped. It is not — it carries client_id
// directly, like every other stint-bearing table — so all five call sites use
// resolveStintId above and the campaign variant had no callers. Removed rather
// than left in place: an unused exported helper reads as a supported path and
// invites someone to reach for it before checking whether it is exercised.
