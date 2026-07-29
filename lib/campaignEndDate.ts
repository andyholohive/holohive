/**
 * Effective campaign end date — one resolver, stint-derived.
 *
 * [2026-07-29] Per Andy: the stint is the source of truth for a campaign's end
 * date. Before this there were THREE competing answers and they disagreed:
 *
 *   1. `campaigns.end_date`      — a stored column, written at create/edit time
 *                                  and never revisited. STALE.
 *   2. `campaigns_with_stint_dates.effective_end_date` — a view computing
 *                                  COALESCE(client covered_through, end_date).
 *                                  Referenced by zero application queries.
 *   3. `campaign_week_window.term_end` — what the campaign page and portal
 *                                  actually render. CORRECT.
 *
 * 6 of 42 campaigns disagreed. Venice Korea's stored end_date was 2026-07-06
 * while the campaign was live in week 12 with a term running to 2026-08-07 —
 * three weeks in the past. Anything reading the column thought Venice had
 * ended. The AI agent read the column, so it could quote a client a date no
 * human-facing page showed.
 *
 * This resolves via `campaign_week_window`, which takes the campaign's OWN
 * `stint_id` first and only falls back to the client's latest stint when the
 * campaign has none — 41 of 42 campaigns have a direct link, so this is
 * genuinely per-campaign, not client-level. Venice's two campaigns correctly
 * resolve to different dates (08/07 active, 05/07 ended) precisely because of
 * that direct link.
 *
 * `campaigns.end_date` is deliberately kept as the last-resort fallback rather
 * than removed: one campaign has no stint at all, and a null end date reads
 * worse than a stale one.
 */

type EndDateMap = Record<string, string | null>;

/**
 * Resolve effective end dates for a set of campaigns in one round-trip.
 * Returns a map of campaign_id → ISO date (or null when neither the stint nor
 * the stored column can answer).
 *
 * `fallbacks` lets callers pass the stored `campaigns.end_date` they already
 * hold, so a campaign with no stint still renders something.
 */
export async function resolveCampaignEndDates(
  supabase: any,
  campaignIds: string[],
  fallbacks: EndDateMap = {},
): Promise<EndDateMap> {
  const out: EndDateMap = {};
  for (const id of campaignIds) out[id] = fallbacks[id] ?? null;
  if (campaignIds.length === 0) return out;

  const { data, error } = await supabase
    .from('campaign_week_window')
    .select('campaign_id, term_end')
    .in('campaign_id', campaignIds);

  // Best-effort: on error every caller still has the stored fallback. This
  // resolver feeds read-only surfaces (the AI agent), so degrading to the old
  // behaviour is strictly better than throwing.
  if (error || !data) return out;

  for (const row of data as Array<{ campaign_id: string; term_end: string | null }>) {
    if (row.term_end) out[row.campaign_id] = row.term_end;
  }
  return out;
}

/** Single-campaign convenience wrapper. */
export async function resolveCampaignEndDate(
  supabase: any,
  campaignId: string,
  fallback: string | null = null,
): Promise<string | null> {
  const map = await resolveCampaignEndDates(supabase, [campaignId], { [campaignId]: fallback });
  return map[campaignId] ?? null;
}
