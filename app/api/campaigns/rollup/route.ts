import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { deriveLineupLifecycleStage, type LineupStatus } from '@/lib/lineupManagerService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/campaigns/rollup
 *
 * Cross-client rollups for the two overview dialogs on /campaigns:
 * "All Lineups" and "All Budgets".
 *
 * Both exist for the same reason: the per-client versions of this data live
 * inside each client's own modal, so answering "which lineups are still
 * unconfirmed" or "who is over budget" meant opening seven clients one at a
 * time. One trip, grouped by client, is the whole point — so this route
 * returns both payloads together rather than making the page fire two
 * requests to render one dialog each.
 *
 * Lineup status is the DERIVED lifecycle stage, not the stored enum, so a
 * week that has ended reads Completed here exactly as it does in the Lineup
 * Manager — a rollup that disagreed with the tab it summarises would be worse
 * than no rollup.
 */

type LineupRow = {
  client_id: string;
  client_name: string;
  campaign_id: string;
  campaign_name: string;
  week_number: number;
  week_of: string;
  stage: string;
  kol_count: number;
};

/**
 * Budget is a CLIENT-level fact, not a campaign one.
 *
 * [2026-08-14] First cut read `campaigns.total_budget` and reported Fogo at
 * 113% of a $15,000 budget. That column is a stale scalar: Fogo has two
 * engagement terms of $15,000 (the original plus a renewal), so the real
 * contracted budget is $30,000 and it is at 57%, not over. total_budget was
 * never updated when the second term was signed.
 *
 * The campaign Budget tab already resolves this correctly and says so in a
 * comment naming Fogo as the example (components/campaign/BudgetDashboardV2
 * :138-142). Precedence, matching it exactly:
 *   1. sum of client_engagement_periods.amount across the client's stints
 *   2. else sum of the campaign's budget_allocations
 *   3. else campaigns.total_budget
 *
 * Because the terms total belongs to the client, campaigns nest UNDER the
 * client here rather than each carrying a budget of their own — a client with
 * four campaigns would otherwise show the same engagement total four times
 * and imply 4× the money.
 */
type BudgetClient = {
  client_id: string;
  client_name: string;
  budget: number;
  /** Where `budget` came from, so a surprising number is auditable. */
  budget_source: 'engagement_terms' | 'allocations' | 'campaign_total' | 'none';
  term_count: number;
  spent: number;
  remaining: number;
  pct_used: number | null;
  campaigns: Array<{
    campaign_id: string;
    campaign_name: string;
    spent: number;
    paid_count: number;
  }>;
};

export async function GET() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Active, non-archived clients only. The dialogs are a working view — a
  // finished engagement's lineups and budget are history, and mixing them in
  // makes the list long enough that the live ones stop standing out.
  // Errors are surfaced, not swallowed. A failed query here returns null data,
  // which reads as "no active clients" and renders a plausible, completely
  // empty rollup — the one failure mode nobody would think to question.
  const { data: clientRows, error: clientErr } = await (supabase as any)
    .from('clients')
    .select('id, name')
    .is('archived_at', null)
    .eq('is_active', true)
    .order('name');
  if (clientErr) {
    return NextResponse.json({ error: `clients: ${clientErr.message}` }, { status: 500 });
  }
  const clients = (clientRows ?? []) as Array<{ id: string; name: string }>;
  const clientName = new Map(clients.map(c => [c.id, c.name]));
  if (clients.length === 0) {
    return NextResponse.json({ ok: true, lineups: [], budgets: [], no_clients: true, generated_at: new Date().toISOString() });
  }

  // Allocations live in their own table (`campaign_budget_allocations`) and
  // are embedded here; the app-level `campaign.budget_allocations` shape the
  // Budget tab reads is that relation renamed at the page's fetch, not a
  // column. Selecting it by that name silently errors the whole query out to
  // an empty rollup.
  const { data: campaignRows, error: campaignErr } = await (supabase as any)
    .from('campaigns')
    .select('id, name, client_id, total_budget, campaign_budget_allocations(allocated_budget)')
    .in('client_id', clients.map(c => c.id));
  if (campaignErr) {
    return NextResponse.json({ error: `campaigns: ${campaignErr.message}` }, { status: 500 });
  }
  const campaigns = (campaignRows ?? []) as Array<{
    id: string; name: string; client_id: string;
    total_budget: number | null;
    campaign_budget_allocations: Array<{ allocated_budget?: number | string | null }> | null;
  }>;
  const campaignById = new Map(campaigns.map(c => [c.id, c]));

  if (campaigns.length === 0) {
    return NextResponse.json({ ok: true, lineups: [], budgets: [], generated_at: new Date().toISOString() });
  }
  const campaignIds = campaigns.map(c => c.id);

  // ── Lineups ────────────────────────────────────────────────────────
  const { data: lineupRows } = await (supabase as any)
    .from('campaign_lineups')
    .select('id, campaign_id, week_number, week_of, status')
    .in('campaign_id', campaignIds)
    .order('week_of', { ascending: false });
  const lineups = (lineupRows ?? []) as Array<{
    id: string; campaign_id: string; week_number: number; week_of: string; status: string;
  }>;

  // Slot counts per lineup — "how many KOLs are in this week" is the one
  // number that says whether a lineup is real or an empty shell.
  //
  // Two hops, not one: slots hang off ANGLES, not off the lineup. A slot row
  // carries angle_id and kol_id only, so counting `lineup_slots.lineup_id`
  // returns nothing at all — every week reads "—" and the column is dead.
  const slotCount = new Map<string, number>();
  if (lineups.length > 0) {
    const { data: angleRows } = await (supabase as any)
      .from('lineup_angles')
      .select('id, lineup_id')
      .in('lineup_id', lineups.map(l => l.id));
    const angles = (angleRows ?? []) as Array<{ id: string; lineup_id: string }>;
    const lineupForAngle = new Map(angles.map(a => [a.id, a.lineup_id]));
    if (angles.length > 0) {
      const { data: slotRows } = await (supabase as any)
        .from('lineup_slots')
        .select('angle_id')
        .in('angle_id', angles.map(a => a.id));
      for (const s of (slotRows ?? []) as Array<{ angle_id: string }>) {
        const lineupId = lineupForAngle.get(s.angle_id);
        if (!lineupId) continue;
        slotCount.set(lineupId, (slotCount.get(lineupId) ?? 0) + 1);
      }
    }
  }

  const lineupOut: LineupRow[] = lineups.map(l => {
    const camp = campaignById.get(l.campaign_id)!;
    return {
      client_id: camp.client_id,
      client_name: clientName.get(camp.client_id) ?? 'Unknown',
      campaign_id: camp.id,
      campaign_name: camp.name,
      week_number: l.week_number,
      week_of: l.week_of,
      // Same derivation the Lineup Manager renders, week_of included, so a
      // finished week reads Completed in both places.
      stage: deriveLineupLifecycleStage(l.status as LineupStatus, null, l.week_of),
      kol_count: slotCount.get(l.id) ?? 0,
    };
  });

  // ── Budgets ────────────────────────────────────────────────────────
  // Spend = sum of payments on the campaign. payment_category is not
  // filtered here: the question this dialog answers is "how much of the
  // budget is gone", and every category spends the same money.
  const { data: paymentRows } = await (supabase as any)
    .from('payments')
    .select('campaign_id, amount')
    .in('campaign_id', campaignIds);
  const spendByCampaign = new Map<string, { total: number; count: number }>();
  for (const p of (paymentRows ?? []) as Array<{ campaign_id: string; amount: number | null }>) {
    const cur = spendByCampaign.get(p.campaign_id) ?? { total: 0, count: 0 };
    cur.total += Number(p.amount) || 0;
    cur.count += 1;
    spendByCampaign.set(p.campaign_id, cur);
  }

  // Engagement terms per client — the contracted budget, renewals included.
  const { data: stintRows } = await (supabase as any)
    .from('client_stints')
    .select('id, client_id')
    .in('client_id', clients.map(c => c.id));
  const stints = (stintRows ?? []) as Array<{ id: string; client_id: string }>;
  const clientForStint = new Map(stints.map(s => [s.id, s.client_id]));
  const termsByClient = new Map<string, { total: number; count: number }>();
  if (stints.length > 0) {
    const { data: periodRows } = await (supabase as any)
      .from('client_engagement_periods')
      .select('stint_id, amount')
      .in('stint_id', stints.map(s => s.id));
    for (const p of (periodRows ?? []) as Array<{ stint_id: string; amount: number | string | null }>) {
      const cid = clientForStint.get(p.stint_id);
      if (!cid) continue;
      const cur = termsByClient.get(cid) ?? { total: 0, count: 0 };
      cur.total += Number(p.amount) || 0;
      cur.count += 1;
      termsByClient.set(cid, cur);
    }
  }

  const budgetOut: BudgetClient[] = clients.map(cl => {
    const own = campaigns.filter(c => c.client_id === cl.id);
    const terms = termsByClient.get(cl.id) ?? { total: 0, count: 0 };
    const allocationsSum = own.reduce((s, c) => s
      + ((c.campaign_budget_allocations ?? []).reduce((a, x) => a + (Number(x.allocated_budget) || 0), 0)), 0);
    const campaignTotals = own.reduce((s, c) => s + (Number(c.total_budget) || 0), 0);

    const budget = terms.total > 0 ? terms.total
      : allocationsSum > 0 ? allocationsSum
        : campaignTotals;
    const budgetSource: BudgetClient['budget_source'] = terms.total > 0 ? 'engagement_terms'
      : allocationsSum > 0 ? 'allocations'
        : campaignTotals > 0 ? 'campaign_total' : 'none';

    const perCampaign = own.map(c => {
      const spend = spendByCampaign.get(c.id) ?? { total: 0, count: 0 };
      return { campaign_id: c.id, campaign_name: c.name, spent: spend.total, paid_count: spend.count };
    }).sort((a, b) => b.spent - a.spent);
    const spent = perCampaign.reduce((s, c) => s + c.spent, 0);

    return {
      client_id: cl.id,
      client_name: cl.name,
      budget,
      budget_source: budgetSource,
      term_count: terms.count,
      spent,
      remaining: budget - spent,
      // null rather than 0 when nothing is contracted — "0% used" and "no
      // budget set" are different facts and the UI says so.
      pct_used: budget > 0 ? (spent / budget) * 100 : null,
      campaigns: perCampaign,
    };
  });

  // ── Per-client tab index ───────────────────────────────────────────
  // The dialogs' editable per-client tabs mount the real Lineup Manager,
  // which needs the campaign's start date and its term end. Both come from
  // `campaign_week_window` — the one source of "week N of M" — so they're
  // resolved here rather than by one extra round-trip per tab click.
  const { data: windowRows } = await (supabase as any)
    .from('campaign_week_window')
    .select('campaign_id, start_date, term_end')
    .in('campaign_id', campaignIds);
  const windowByCampaign = new Map(
    ((windowRows ?? []) as Array<{ campaign_id: string; start_date: string | null; term_end: string | null }>)
      .map(w => [w.campaign_id, w]),
  );

  const tabsOut = clients.map(cl => ({
    client_id: cl.id,
    client_name: cl.name,
    campaigns: campaigns
      .filter(c => c.client_id === cl.id)
      .map(c => ({
        campaign_id: c.id,
        campaign_name: c.name,
        start_date: windowByCampaign.get(c.id)?.start_date ?? null,
        covered_through: windowByCampaign.get(c.id)?.term_end ?? null,
      }))
      .sort((a, b) => a.campaign_name.localeCompare(b.campaign_name)),
  })).filter(t => t.campaigns.length > 0);

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    lineups: lineupOut,
    budgets: budgetOut,
    tabs: tabsOut,
  });
}
