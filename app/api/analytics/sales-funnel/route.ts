import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/sales-funnel?days=7
 *
 * Canonical 5-stage outbound funnel for the Sales Pipeline header:
 *
 *   Outreach → Replies → Calls Booked → Calls Taken → Proposals
 *
 * All five metrics now have real data thanks to migration 044
 * (added `direction` to crm_activities + auto-stamps proposal_sent_at,
 * etc., from createActivity). Counts DISTINCT opportunities per stage
 * — one prospect DM'd 5 times = 1 outreach.
 *
 * Sources per metric:
 *
 *   - outreach:      DISTINCT opportunity_id whose FIRST outbound activity
 *                    (across all time) lands inside the window. Bumping an
 *                    already-counted prospect doesn't move this — only
 *                    adding a fresh prospect to outreach does. Makes Reply
 *                    Rate (= replies / outreach) stable as you bump existing
 *                    rows; it only changes when a new touch-1 is added or
 *                    when one of the existing in-window touches replies.
 *                    [Changed 2026-05-14 — was "any outbound in window"
 *                    which inflated the denominator when old prospects
 *                    got bumped, making the rate drift down for no reason.]
 *   - replies:       DISTINCT opportunity_id from crm_activities WHERE
 *                    direction='inbound' AND type='message'
 *                    AND created_at >= since
 *   - calls_booked:  COUNT crm_activities WHERE type='meeting' AND
 *                    created_at >= since AND next_step_date > now()
 *                    (meeting was logged as scheduled-for-future = booked)
 *   - calls_taken:   COUNT crm_activities WHERE type='meeting' AND
 *                    created_at >= since AND (next_step_date <= now() OR
 *                    next_step_date IS NULL)
 *                    (meeting was logged with no future date = happened)
 *   - proposals_sent: COUNT crm_opportunities WHERE proposal_sent_at >= since
 *                     (auto-stamped by createActivity on first 'proposal' activity)
 *
 * Shape:
 *   {
 *     window_days:    7,
 *     since_iso:      "...",
 *     outreach:       12,
 *     replies:         5,
 *     calls_booked:    3,
 *     calls_taken:     2,
 *     proposals_sent:  1,
 *   }
 */
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { searchParams } = new URL(request.url);
  const windowDays = Math.max(1, Math.min(90, Number(searchParams.get('days')) || 7));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Five queries in parallel. Outbound is now an ALL-TIME pull (not
  // window-filtered) so we can compute MIN(created_at) per opp client-
  // side and pick the ones whose first-touch lands inside the window.
  // Activity volume is bounded (~3k outbound rows historically); the
  // limit=10000 gives plenty of headroom. Inbound stays window-filtered
  // since we just want distinct repliers in the period.
  const [outboundRes, inboundRes, meetingsRes, proposalsRes] = await Promise.all([
    (supabase as any)
      .from('crm_activities')
      .select('opportunity_id, created_at')
      .eq('direction', 'outbound')
      .in('type', ['message', 'bump'])
      .order('created_at', { ascending: true })
      .limit(10000),
    (supabase as any)
      .from('crm_activities')
      .select('opportunity_id')
      .eq('direction', 'inbound')
      .eq('type', 'message')
      .gte('created_at', since)
      .limit(2000),
    // Pull meeting activities + their next_step_date so we can split
    // booked vs taken in JS. Doing it server-side would require two
    // separate queries with date conditions; one fetch is simpler.
    (supabase as any)
      .from('crm_activities')
      .select('id, next_step_date')
      .eq('type', 'meeting')
      .gte('created_at', since)
      .limit(500),
    (supabase as any)
      .from('crm_opportunities')
      .select('id', { count: 'exact', head: true })
      .gte('proposal_sent_at', since),
  ]);

  // Distinct opps helper — used for the inbound side (window-scoped).
  const distinctOpps = (rows: Array<{ opportunity_id: string | null }> | null): number =>
    new Set((rows || []).map(r => r.opportunity_id).filter(Boolean)).size;

  // First-touch outreach — group ALL outbound activities by opp_id,
  // take the earliest, and count those whose earliest lands inside the
  // window. Iterating in order(created_at asc) means the first time we
  // see an opp_id IS its first outbound activity.
  const firstTouchPerOpp = new Map<string, string>(); // opp_id → ISO created_at
  for (const row of (outboundRes.data || []) as Array<{ opportunity_id: string | null; created_at: string }>) {
    if (!row.opportunity_id) continue;
    if (!firstTouchPerOpp.has(row.opportunity_id)) {
      firstTouchPerOpp.set(row.opportunity_id, row.created_at);
    }
  }
  // Array.from() around .values() — tsconfig's downlevelIteration is
  // off so `for (const ts of map.values())` won't compile.
  let outreachCount = 0;
  for (const ts of Array.from(firstTouchPerOpp.values())) {
    if (ts >= since) outreachCount++;
  }

  const meetings: Array<{ id: string; next_step_date: string | null }> = meetingsRes.data || [];
  // Meeting was logged as scheduled in the future = booked (call hasn't
  // happened yet). Logged with no future date (or past) = happened/taken.
  // Crude split, but matches how the team currently uses the meeting type
  // — a manual log entry usually happens AFTER the call, so most rows
  // have a past or null next_step_date and count as "taken."
  let callsBooked = 0;
  let callsTaken = 0;
  for (const m of meetings) {
    if (m.next_step_date && m.next_step_date > now) {
      callsBooked++;
    } else {
      callsTaken++;
    }
  }

  const errs = [outboundRes, inboundRes, meetingsRes, proposalsRes]
    .filter(r => r.error)
    .map(r => r.error?.message);
  if (errs.length > 0) console.error('[sales-funnel] partial query failures:', errs);

  return NextResponse.json({
    window_days: windowDays,
    since_iso: since,
    outreach:       outreachCount,
    replies:        distinctOpps(inboundRes.data),
    calls_booked:   callsBooked,
    calls_taken:    callsTaken,
    proposals_sent: proposalsRes.count ?? 0,
  });
}
