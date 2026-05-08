import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/prospects/discovery/progress
 *
 * Returns the most recent DISCOVERY on_demand run's status and progress
 * snapshot. Polled by the scan dialog every ~2s to render a live progress bar.
 *
 * Shape:
 *   {
 *     id:              string | null,
 *     status:          'running' | 'completed' | 'failed',
 *     started_at:      ISO string,
 *     completed_at:    ISO string | null,
 *     duration_ms:     number | null,
 *     progress: {
 *       stage:             string | null,     // 'discovering_candidates' | 'enriching' | 'writing'
 *       message:           string | null,     // human-readable current status
 *       percent:           number | null,     // 0-100
 *       candidates_found:  number | null,
 *       batches_total:     number | null,
 *       batches_complete:  number | null,
 *     },
 *     // When complete, these final fields populate:
 *     final: {
 *       projects_enriched: number | null,
 *       inserted:          number | null,
 *       updated:           number | null,
 *       signals_added:     number | null,
 *       cost_usd:          number | null,
 *     },
 *     error_message:   string | null,
 *   }
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await (supabase as any)
    .from('agent_runs')
    .select('id, status, started_at, completed_at, duration_ms, output_summary, error_message')
    .eq('agent_name', 'DISCOVERY')
    .eq('run_type', 'on_demand')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ id: null, status: null });
  }

  const out = data.output_summary || {};

  return NextResponse.json({
    id: data.id,
    status: data.status,
    started_at: data.started_at,
    completed_at: data.completed_at,
    duration_ms: data.duration_ms,
    progress: {
      stage: out.stage ?? null,
      message: out.message ?? null,
      percent: typeof out.percent === 'number' ? out.percent : null,
      candidates_found: out.candidates_found ?? null,
      batches_total: out.batches_total ?? null,
      batches_complete: out.batches_complete ?? null,
    },
    // Rich detail block (added 2026-05-05) — what's actually being
    // discovered, filtered, and enriched. Pass-through of the scan
    // route's `detail` object. Shape:
    //   {
    //     sources:  { per_source_counts, errors, list },
    //     filtered: { recent_skipped, crm_skipped_total,
    //                 crm_filtered_names, candidate_names },
    //     enriched: [{ name, tier, score, poc_count, icp_verdict }],
    //     tier_breakdown: { TIER_NAME: count },
    //     batch_errors: string[]
    //   }
    // null until the scan reaches Stage 2 init, or for historical scans
    // that pre-date this column.
    detail: out.detail ?? null,
    final: {
      projects_enriched: out.projects_enriched ?? null,
      inserted: out.inserted ?? null,
      updated: out.updated ?? null,
      signals_added: out.signals_added ?? null,
      cost_usd: out.cost_usd ?? null,
      stage1_per_source: out.stage1_per_source ?? null,
      skipped_duplicates: out.skipped_duplicates ?? null,
      skip_list_size: out.skip_list_size ?? null,
      cooldown_days: out.cooldown_days ?? null,
      batches_run: out.batches_run ?? null,
      batches_failed: out.batches_failed ?? null,
    },
    error_message: data.error_message,
  });
}
