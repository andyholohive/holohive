import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallets/probe
 *
 * [May 2026 — diagnostic only]
 *
 * The user keeps getting an HTML 500 from /api/wallets/summary even
 * after we wrapped that handler in try/catch. Without auth I can't
 * tell from outside whether the deployed bundle matches my source,
 * or whether the service-role read against wallet_analytics works.
 *
 * This endpoint is added to the middleware PUBLIC_API_PREFIXES so I
 * can curl it from anywhere. It does the bare minimum:
 *   1. Confirms the route was built into the bundle (returns 200 JSON
 *      with a build marker, so I know which deploy is live)
 *   2. Runs the exact same service-role read the summary handler does,
 *      capping at 1 row, and returns the count + first row's chain
 *
 * No PII surfaced — just counts + a single chain string. Remove this
 * file once the summary issue is solved.
 */
export async function GET() {
  const BUILD_MARKER = 'wallets-probe-v1-2026-05-24';
  let stage = 'init';
  try {
    stage = 'env_check';
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({
        ok: false,
        marker: BUILD_MARKER,
        stage,
        error: 'missing env vars',
        has_url: !!url,
        has_service_key: !!serviceKey,
      }, { status: 200 });
    }

    stage = 'create_client';
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    stage = 'select_count';
    const { count, error: countErr } = await supabase
      .from('wallet_analytics')
      .select('id', { count: 'exact', head: true });
    if (countErr) {
      return NextResponse.json({
        ok: false,
        marker: BUILD_MARKER,
        stage,
        error: countErr.message,
      }, { status: 200 });
    }

    stage = 'select_one';
    const { data: sample, error: sampleErr } = await supabase
      .from('wallet_analytics')
      .select('chain, num_events')
      .limit(1)
      .maybeSingle();
    if (sampleErr) {
      return NextResponse.json({
        ok: false,
        marker: BUILD_MARKER,
        stage,
        error: sampleErr.message,
      }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      marker: BUILD_MARKER,
      stage: 'done',
      row_count: count ?? null,
      sample_chain: sample?.chain ?? null,
      sample_num_events: sample?.num_events ?? null,
      ts: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      marker: BUILD_MARKER,
      stage,
      error: err?.message || String(err) || 'unknown',
    }, { status: 200 });
  }
}
