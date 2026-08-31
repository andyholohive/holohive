/**
 * Lineup slot ↔ content sync.
 *
 * [2026-07-06] lineup_slots.status supported 'posted' since the Lineup
 * Manager shipped, but nothing ever wrote it — the Lineups tab showed
 * posted badges/counts that were forever pending. This helper closes the
 * loop: whenever a content row lands for a KOL (TG /submit approval or
 * manual add on the Content Dashboard), flip their slot in that week's
 * lineup to 'posted'.
 *
 * Week bucketing matches the Lineup Manager: campaign_lineups.week_of
 * is the Monday; the week runs week_of .. week_of+6.
 *
 * Best-effort by design — content creation must never fail because a
 * lineup lookup did. Callers fire-and-forget or ignore the result.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function markLineupSlotPosted(
  supabase: SupabaseClient,
  opts: {
    campaignId: string;
    /** Either id works; masterKolId wins when both are present. */
    masterKolId?: string | null;
    campaignKolsId?: string | null;
    /** Content activation date (YYYY-MM-DD). Defaults to today UTC. */
    dateIso?: string | null;
  },
): Promise<{ updated: number }> {
  try {
    let kolId = opts.masterKolId ?? null;
    if (!kolId && opts.campaignKolsId) {
      const { data: ck } = await (supabase as any)
        .from('campaign_kols')
        .select('master_kol_id')
        .eq('id', opts.campaignKolsId)
        .maybeSingle();
      kolId = (ck as any)?.master_kol_id ?? null;
    }
    if (!kolId) return { updated: 0 };

    const date = opts.dateIso || new Date().toISOString().slice(0, 10);

    // Find the lineup whose week contains `date`. week_of is the Monday.
    const { data: lineups } = await (supabase as any)
      .from('campaign_lineups')
      .select('id, week_of, status')
      .eq('campaign_id', opts.campaignId)
      .in('status', ['proposed', 'confirmed', 'completed'])
      .lte('week_of', date)
      .order('week_of', { ascending: false })
      .limit(1);
    const lineup = (lineups as any[])?.[0];
    if (!lineup) return { updated: 0 };
    const weekEnd = new Date(lineup.week_of + 'T00:00:00Z');
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    if (date > weekEnd.toISOString().slice(0, 10)) return { updated: 0 };

    // Slot lookup goes through the angle join (slots don't carry lineup_id).
    const { data: angles } = await (supabase as any)
      .from('lineup_angles')
      .select('id')
      .eq('lineup_id', lineup.id);
    const angleIds = ((angles as any[]) ?? []).map(a => a.id);
    if (angleIds.length === 0) return { updated: 0 };

    // [2026-08-31, Jdot] 'missed' is included deliberately, not just 'pending'.
    //
    // markCompletedIfWeekEnded flips every still-pending slot to 'missed' when
    // the week closes. Content logged after that — a KOL who posted on the
    // Wednesday but whose link only reached us the following Monday — found
    // its slot already 'missed' and this update matched nothing, so the slot
    // stayed missed forever and the post belonged to no week at all.
    //
    // Umia Wk 6 is the case: Gorochi posted 08-26, inside the week; the link
    // was logged 08-31, five hours after the cron closed the week. He read as
    // a no-show against a post that exists.
    //
    // A post that happened inside the week is not a miss, whenever it was
    // logged. Correcting that is not a judgement call, it is fixing a record
    // that is factually wrong. The week bucketing above already guarantees the
    // date falls inside this lineup's week, so this cannot credit a slot for a
    // post from some other week.
    const { data: updatedRows } = await (supabase as any)
      .from('lineup_slots')
      .update({ status: 'posted' })
      .in('angle_id', angleIds)
      .eq('kol_id', kolId)
      .in('status', ['pending', 'missed'])
      .select('id');
    return { updated: ((updatedRows as any[]) ?? []).length };
  } catch (err) {
    console.warn('[lineupSlotSync] markLineupSlotPosted failed:', err);
    return { updated: 0 };
  }
}
