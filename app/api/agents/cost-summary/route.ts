import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/cost-summary
 *
 * Returns Discovery / Intelligence spend for the last 7 days, broken down
 * by run_type. Used by the Intelligence page to show a "this week" badge
 * so the team has immediate cost visibility.
 *
 * Response:
 *   {
 *     total_cost_usd:  2.14,
 *     runs:           18,
 *     by_run_type: {
 *       'discovery_scan':       { cost: 1.80, count: 2 },
 *       'grok_deep_dive':       { cost: 0.22, count: 5 },
 *       'grok_poc_enrichment':  { cost: 0.13, count: 3 },
 *       ...
 *     },
 *     window_days: 7
 *   }
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await (supabase as any)
    .from('agent_runs')
    .select('run_type, output_summary, started_at')
    .eq('agent_name', 'DISCOVERY')
    .gte('started_at', since);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let total = 0;
  let runs = 0;
  const byType: Record<string, { cost: number; count: number }> = {};

  for (const row of data || []) {
    const cost = Number(row.output_summary?.cost_usd ?? 0);
    if (!Number.isFinite(cost)) continue;
    total += cost;
    runs++;
    const t = row.run_type || 'unknown';
    if (!byType[t]) byType[t] = { cost: 0, count: 0 };
    byType[t].cost += cost;
    byType[t].count++;
  }

  // Round everything at the edge so the UI doesn't have to.
  for (const k of Object.keys(byType)) {
    byType[k].cost = Number(byType[k].cost.toFixed(4));
  }

  return NextResponse.json({
    total_cost_usd: Number(total.toFixed(4)),
    runs,
    by_run_type: byType,
    window_days: 7,
  });
}
