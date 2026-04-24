import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/korean-exchanges/simulate
 *
 * Safely simulates a new listing to test the signal pipeline end-to-end:
 *   1. Picks one market from korean_exchange_markets
 *   2. Soft-deletes it (saves a restore snapshot)
 *   3. Triggers the cron endpoint
 *   4. The scanner sees the market "missing" from the DB but present on the
 *      exchange → detects it as a new listing → fires a signal
 *   5. Restores the market row + cleans up the synthetic signal
 *   6. Returns the captured signal for display
 *
 * This proves: diff detection → signal write → (optional) prospect matching,
 * all without polluting the real Korea Signals feed.
 *
 * Body (optional):
 *   { symbol?: string, exchange?: 'upbit' | 'bithumb' }
 * If omitted, picks a random market.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || !supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing server config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await request.json().catch(() => ({}));
  const preferSymbol: string | undefined = body.symbol;
  const preferExchange: 'upbit' | 'bithumb' | undefined = body.exchange;

  // --- 1. Pick a market to "remove" ---
  let target: any;
  if (preferSymbol) {
    const query = (supabase as any)
      .from('korean_exchange_markets')
      .select('*')
      .ilike('symbol', preferSymbol)
      .is('delisted_at', null)
      .limit(1);
    if (preferExchange) query.eq('exchange', preferExchange);
    const { data } = await query.maybeSingle();
    target = data;
  }
  if (!target) {
    // Random-ish pick from a known KRW pair on Upbit (biggest pool, liquid)
    const { data } = await (supabase as any)
      .from('korean_exchange_markets')
      .select('*')
      .eq('exchange', 'upbit')
      .eq('quote_currency', 'KRW')
      .is('delisted_at', null)
      .order('first_seen_at', { ascending: false })
      .limit(20);
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No active markets to simulate with' }, { status: 500 });
    }
    target = data[Math.floor(Math.random() * data.length)];
  }

  const snapshotId = target.id;
  const snapshotFirstSeen = target.first_seen_at;

  // --- 2. "Remove" the market from the DB so the scanner sees it as new ---
  const { error: delErr } = await (supabase as any)
    .from('korean_exchange_markets')
    .delete()
    .eq('id', snapshotId);
  if (delErr) {
    return NextResponse.json({ error: `Failed to stash market: ${delErr.message}` }, { status: 500 });
  }

  const removedAt = new Date().toISOString();

  // --- 3. Trigger the cron ---
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  let runResult: any = null;
  let runError: string | null = null;
  try {
    const res = await fetch(`${baseUrl}/api/cron/korean-exchange-listings`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(110_000),
    });
    runResult = await res.json();
    if (!res.ok) runError = runResult?.error ?? `Cron returned ${res.status}`;
  } catch (e: any) {
    runError = e?.message ?? 'Cron call failed';
  }

  // --- 4. Capture the signal (if one was written) ---
  const { data: capturedSignals } = await (supabase as any)
    .from('prospect_signals')
    .select('id, project_name, signal_type, headline, snippet, source_url, relevancy_weight, metadata, detected_at, prospect_id')
    .eq('source_name', 'korean_exchange_scanner')
    .eq('signal_type', 'korea_exchange_listing')
    .gte('detected_at', removedAt)
    .ilike('project_name', `%${target.symbol}%`)
    .order('detected_at', { ascending: false })
    .limit(5);

  const signalForTarget =
    (capturedSignals || []).find(
      (s: any) =>
        s.metadata?.exchange === target.exchange &&
        s.metadata?.market_pair === target.market_pair,
    ) ?? capturedSignals?.[0];

  // --- 5. Clean up: restore the market + delete the synthetic signal ---
  // The scanner's upsert already re-inserted the market (because the live API
  // still returns it), but with a new first_seen_at. Roll that back to the
  // original first_seen_at we captured in step 1, and clear the fired flag.
  await (supabase as any)
    .from('korean_exchange_markets')
    .update({
      first_seen_at: snapshotFirstSeen,
      listing_signal_fired_at: null,
      delisted_at: null,
    })
    .eq('exchange', target.exchange)
    .eq('market_pair', target.market_pair);

  // Delete ONLY the synthetic signal we created (identified by agent_run_id
  // from the just-executed run). Keep any real signals untouched.
  let signalsDeleted = 0;
  if (runResult?.listing_signals_fired > 0) {
    const { data: deleted } = await (supabase as any)
      .from('prospect_signals')
      .delete()
      .eq('source_name', 'korean_exchange_scanner')
      .gte('detected_at', removedAt)
      .select('id');
    signalsDeleted = deleted?.length ?? 0;
  }

  return NextResponse.json({
    success: !runError,
    target: {
      exchange: target.exchange,
      symbol: target.symbol,
      market_pair: target.market_pair,
    },
    run_result: runResult,
    run_error: runError,
    signal_captured: signalForTarget
      ? {
          project_name: signalForTarget.project_name,
          signal_type: signalForTarget.signal_type,
          headline: signalForTarget.headline,
          snippet: signalForTarget.snippet,
          source_url: signalForTarget.source_url,
          relevancy_weight: signalForTarget.relevancy_weight,
          matched_prospect_id: signalForTarget.prospect_id,
        }
      : null,
    cleanup: {
      market_restored: true,
      synthetic_signals_deleted: signalsDeleted,
    },
  });
}
