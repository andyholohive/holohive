import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/prospects/discovery/[id]
 *
 * Loads everything we have on one discovery prospect for the detail page:
 *   - the full prospect row
 *   - all active signals (both discovery_claude and grok_x_deep_scan),
 *     ordered most-recent-first
 *   - recent agent_runs that touched this prospect, with costs and
 *     summaries — gives a history timeline of scans
 *
 * Used by /intelligence/discovery/[id].
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: prospect, error: prospectErr } = await (supabase as any)
    .from('prospects')
    .select('*')
    .eq('id', id)
    .single();
  if (prospectErr || !prospect) {
    return NextResponse.json({ error: prospectErr?.message || 'Prospect not found' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { data: signals } = await (supabase as any)
    .from('prospect_signals')
    .select('id, signal_type, headline, snippet, source_url, source_name, relevancy_weight, confidence, metadata, detected_at, expires_at, shelf_life_days, is_active')
    .eq('prospect_id', id)
    .eq('is_active', true)
    .in('source_name', ['discovery_claude', 'grok_x_deep_scan'])
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('detected_at', { ascending: false });

  // Pull runs that touched this prospect (via input_params.prospect_ids).
  // Postgres JSONB containment lets us ask "which runs have this id?"
  // directly — cheap and precise.
  const { data: runs } = await (supabase as any)
    .from('agent_runs')
    .select('id, run_type, status, started_at, completed_at, duration_ms, input_params, output_summary, error_message')
    .in('run_type', ['grok_deep_dive', 'grok_poc_enrichment', 'poc_enrichment'])
    .contains('input_params', { prospect_ids: [id] })
    .order('started_at', { ascending: false })
    .limit(30);

  const snap = prospect.discovery_snapshot || {};
  return NextResponse.json({
    prospect: {
      ...prospect,
      // Hoist snapshot fields for convenience (matches the list endpoint's shape)
      icp_verdict: snap.icp_verdict ?? null,
      icp_checks: snap.icp_checks ?? null,
      prospect_score: snap.prospect_score ?? null,
      discovery_action_tier: snap.action_tier ?? null,
      disqualification_reason: snap.disqualification_reason ?? null,
      consideration_reason: snap.consideration_reason ?? null,
      fit_reasoning: snap.fit_reasoning ?? null,
      funding: snap.funding ?? null,
      post_korea_listing_at: snap.post_korea_listing_at ?? null,
      post_korea_listing_exchange: snap.post_korea_listing_exchange ?? null,
      post_korea_listing_market_pair: snap.post_korea_listing_market_pair ?? null,
    },
    signals: signals || [],
    runs: runs || [],
  });
}
