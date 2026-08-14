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

type BudgetRow = {
  client_id: string;
  client_name: string;
  campaign_id: string;
  campaign_name: string;
  budget: number;
  spent: number;
  remaining: number;
  pct_used: number | null;
  paid_count: number;
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
  const { data: clientRows } = await (supabase as any)
    .from('clients')
    .select('id, name')
    .is('archived_at', null)
    .eq('is_active', true)
    .order('name');
  const clients = (clientRows ?? []) as Array<{ id: string; name: string }>;
  const clientName = new Map(clients.map(c => [c.id, c.name]));
  if (clients.length === 0) {
    return NextResponse.json({ ok: true, lineups: [], budgets: [], generated_at: new Date().toISOString() });
  }

  const { data: campaignRows } = await (supabase as any)
    .from('campaigns')
    .select('id, name, client_id, total_budget')
    .in('client_id', clients.map(c => c.id));
  const campaigns = (campaignRows ?? []) as Array<{ id: string; name: string; client_id: string; total_budget: number | null }>;
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

  const budgetOut: BudgetRow[] = campaigns.map(c => {
    const budget = Number(c.total_budget) || 0;
    const spend = spendByCampaign.get(c.id) ?? { total: 0, count: 0 };
    return {
      client_id: c.client_id,
      client_name: clientName.get(c.client_id) ?? 'Unknown',
      campaign_id: c.id,
      campaign_name: c.name,
      budget,
      spent: spend.total,
      remaining: budget - spend.total,
      // null rather than 0 when there's no budget on the record — "0% used"
      // and "no budget set" are different facts and the UI says so.
      pct_used: budget > 0 ? (spend.total / budget) * 100 : null,
      paid_count: spend.count,
    };
  });

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    lineups: lineupOut,
    budgets: budgetOut,
  });
}
