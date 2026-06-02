/**
 * ⚠️ ISOLATION POINT — per Jdot Q5 answer (2026-06-01).
 *
 * Yano's CRM rebuild will change the data model behind
 * `/crm/sales-pipeline`. When that ships, ONLY this file's internals
 * change. Every dashboard consumer reads from the typed exports
 * here, so the swap is a single-file replacement.
 *
 * Today the pipeline lives in `crm_opportunities` with:
 *   - stage: cold_dm | new | warm | nurture | orbit | deal_qualified |
 *            negotiation | contract | v2_closed_lost | dead | ...
 *   - bucket: A | B | C | null (tier within the stage)
 *   - deal_value: numeric (mostly 0 today — team rarely fills)
 *   - closed_at: NULL while the opp is open
 *   - updated_at: bumped on any stage / field change
 *
 * After Yano's rebuild this'll probably move to a more normalised
 * shape. The PUBLIC SHAPE this module returns will not change.
 */

import { createClient } from '@supabase/supabase-js';

export interface PipelineSnapshot {
  /** Total $ in open opportunities (deal_value summed across non-closed rows). */
  totalOpenValue: number;
  /** Count of open opps per stage, sorted desc. */
  countByStage: Array<{ stage: string; count: number; totalValue: number }>;
  /** Last 10 opps that moved (by updated_at desc). */
  recentMovement: Array<{
    id: string;
    name: string;
    stage: string;
    deal_value: number;
    last_movement_at: string | null;
  }>;
  /** Total count of open opportunities. */
  totalOpenCount: number;
}

/** Opportunity stages that count as "active pipeline" (excludes lost / dead / cold prospecting). */
export const ACTIVE_PIPELINE_STAGES = new Set([
  'warm',
  'nurture',
  'orbit',
  'deal_qualified',
  'negotiation',
  'contract',
]);

export async function getPipelineSnapshot(): Promise<PipelineSnapshot> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { totalOpenValue: 0, countByStage: [], recentMovement: [], totalOpenCount: 0 };
  }
  const sb = createClient(url, key);

  const { data, error } = await (sb as any)
    .from('crm_opportunities')
    .select('id, name, stage, deal_value, updated_at')
    .is('closed_at', null);

  if (error || !data) {
    return { totalOpenValue: 0, countByStage: [], recentMovement: [], totalOpenCount: 0 };
  }

  let totalOpenValue = 0;
  const stageMap = new Map<string, { count: number; totalValue: number }>();

  for (const row of data) {
    const val = Number(row.deal_value || 0);
    totalOpenValue += val;
    const cur = stageMap.get(row.stage) ?? { count: 0, totalValue: 0 };
    cur.count += 1;
    cur.totalValue += val;
    stageMap.set(row.stage, cur);
  }

  const countByStage = Array.from(stageMap.entries())
    .map(([stage, v]) => ({ stage, count: v.count, totalValue: v.totalValue }))
    .sort((a, b) => b.count - a.count);

  const recentMovement = data
    .filter((r: any) => r.updated_at)
    .sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, 10)
    .map((r: any) => ({
      id: r.id,
      name: r.name,
      stage: r.stage,
      deal_value: Number(r.deal_value || 0),
      last_movement_at: r.updated_at,
    }));

  return {
    totalOpenValue,
    countByStage,
    recentMovement,
    totalOpenCount: data.length,
  };
}
