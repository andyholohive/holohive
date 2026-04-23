import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchUpbitMarkets,
  fetchBithumbMarkets,
  diffMarkets,
  type ExchangeMarket,
} from '@/lib/korean-exchanges';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/korean-exchange-listings
 *
 * Hourly cron. Fetches all currently-listed markets from Upbit + Bithumb,
 * diffs against the korean_exchange_markets table, and:
 *   - For each NEW listing: writes a `korea_exchange_listing` signal
 *     (Tier 1, weight 25) and links to a prospect if symbol matches.
 *   - For each DELISTED market: writes a `korea_exchange_delisting` signal
 *     (negative weight, disqualifier).
 *
 * First run = "baseline mode": populates the table with the current state
 * but does NOT fire signals (otherwise every existing market would falsely
 * appear as a new listing). Subsequent runs do real new-listing detection.
 *
 * Auth: `Authorization: Bearer {CRON_SECRET}` or `?secret={CRON_SECRET}`
 */

const LISTING_SIGNAL_WEIGHT = 25;       // Tier 1, top of scale
const DELISTING_SIGNAL_WEIGHT = -15;    // negative = disqualifier
const SIGNAL_SOURCE_NAME = 'korean_exchange_scanner';

export async function GET(request: Request) {
  const startedAt = new Date();

  // Auth
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Log agent run for visibility in AI Agents dashboard
  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'KOREAN_EXCHANGES',
      run_type: 'scheduled',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: {},
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (status: 'completed' | 'failed', output: any, error?: string) => {
    if (!runId) return;
    const endedAt = new Date();
    await (supabase as any)
      .from('agent_runs')
      .update({
        status,
        completed_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        output_summary: output,
        error_message: error ?? null,
      })
      .eq('id', runId);
  };

  try {
    // ── 1. Fetch live markets from both exchanges in parallel ────────
    const [upbitResult, bithumbResult] = await Promise.allSettled([
      fetchUpbitMarkets(),
      fetchBithumbMarkets(),
    ]);

    const live: ExchangeMarket[] = [];
    const fetchErrors: string[] = [];

    if (upbitResult.status === 'fulfilled') {
      live.push(...upbitResult.value);
    } else {
      fetchErrors.push(`Upbit: ${upbitResult.reason?.message ?? 'unknown'}`);
    }
    if (bithumbResult.status === 'fulfilled') {
      live.push(...bithumbResult.value);
    } else {
      fetchErrors.push(`Bithumb: ${bithumbResult.reason?.message ?? 'unknown'}`);
    }

    if (live.length === 0) {
      await finishRun('failed', { fetchErrors }, 'Both exchange fetches failed');
      return NextResponse.json({ error: 'Both exchange fetches failed', details: fetchErrors }, { status: 502 });
    }

    // ── 2. Load current DB snapshot (active markets only) ────────────
    const { data: dbActiveRaw, error: dbErr } = await (supabase as any)
      .from('korean_exchange_markets')
      .select('id, exchange, symbol, market_pair, listing_signal_fired_at')
      .is('delisted_at', null);
    if (dbErr) throw new Error(`DB read failed: ${dbErr.message}`);

    const dbActive = (dbActiveRaw || []).map((r: any) => ({
      id: r.id,
      exchange: r.exchange,
      symbol: r.symbol,
      market_pair: r.market_pair,
      listing_signal_fired_at: r.listing_signal_fired_at,
    }));

    const isBaselineRun = dbActive.length === 0;

    // ── 3. Diff ───────────────────────────────────────────────────────
    const diff = diffMarkets(live, dbActive);

    // ── 4. Upsert all live markets (touch last_seen_at) ──────────────
    const nowIso = new Date().toISOString();
    const upsertRows = live.map(m => ({
      exchange: m.exchange,
      symbol: m.symbol,
      market_pair: m.market_pair,
      quote_currency: m.quote_currency,
      korean_name: m.korean_name ?? null,
      english_name: m.english_name ?? null,
      warning_flag: m.warning_flag ?? false,
      last_seen_at: nowIso,
      delisted_at: null, // re-listings clear the flag
      updated_at: nowIso,
    }));

    // Chunk to keep payloads sane
    const CHUNK = 200;
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const slice = upsertRows.slice(i, i + CHUNK);
      const { error: upErr } = await (supabase as any)
        .from('korean_exchange_markets')
        .upsert(slice, { onConflict: 'exchange,market_pair', ignoreDuplicates: false });
      if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);
    }

    // ── 5. Mark delisted markets ─────────────────────────────────────
    let delistingsMarked = 0;
    for (const d of diff.delisted) {
      await (supabase as any)
        .from('korean_exchange_markets')
        .update({ delisted_at: nowIso, updated_at: nowIso })
        .eq('exchange', d.exchange)
        .eq('market_pair', d.market_pair);
      delistingsMarked++;
    }

    // ── 6. Fire signals (skip on baseline run) ───────────────────────
    let listingSignalsFired = 0;
    let delistingSignalsFired = 0;
    let prospectMatches = 0;
    const signalErrors: string[] = [];

    if (!isBaselineRun) {
      // New listings → korea_exchange_listing signals
      for (const m of diff.newListings) {
        try {
          // Look for matching prospect by symbol
          const { data: prospect } = await (supabase as any)
            .from('prospects')
            .select('id, name')
            .or(`symbol.ilike.${m.symbol},name.ilike.${m.korean_name || m.english_name || m.symbol}`)
            .limit(1)
            .maybeSingle();

          const projectName =
            m.english_name || m.korean_name || prospect?.name || m.symbol;

          if (prospect?.id) prospectMatches++;

          const exchangeLabel = m.exchange === 'upbit' ? 'Upbit' : 'Bithumb';
          const headline = `${m.symbol} listed on ${exchangeLabel}${m.warning_flag ? ' (with caution flag)' : ''}`;

          const { error: sigErr } = await (supabase as any)
            .from('prospect_signals')
            .insert({
              prospect_id: prospect?.id ?? null,
              project_name: projectName,
              signal_type: 'korea_exchange_listing',
              headline,
              snippet: `New ${m.quote_currency} pair: ${m.market_pair}. ${m.korean_name ? `Korean name: ${m.korean_name}. ` : ''}This is a Tier 1 outreach trigger.`,
              source_url: m.exchange === 'upbit'
                ? `https://upbit.com/exchange?code=CRIX.UPBIT.${m.market_pair}`
                : `https://www.bithumb.com/react/trade/order/${m.symbol}_${m.quote_currency}`,
              source_name: SIGNAL_SOURCE_NAME,
              relevancy_weight: m.warning_flag ? Math.round(LISTING_SIGNAL_WEIGHT / 2) : LISTING_SIGNAL_WEIGHT,
              tier: 1,
              confidence: 'confirmed',
              shelf_life_days: 14,
              metadata: {
                exchange: m.exchange,
                market_pair: m.market_pair,
                quote_currency: m.quote_currency,
                korean_name: m.korean_name ?? null,
                english_name: m.english_name ?? null,
                warning_flag: m.warning_flag ?? false,
                agent_run_id: runId,
              },
              detected_at: nowIso,
              is_active: true,
            });

          if (sigErr) {
            signalErrors.push(`Listing ${m.exchange}/${m.symbol}: ${sigErr.message}`);
          } else {
            listingSignalsFired++;
            // Mark the row so re-runs don't re-fire
            await (supabase as any)
              .from('korean_exchange_markets')
              .update({ listing_signal_fired_at: nowIso })
              .eq('exchange', m.exchange)
              .eq('market_pair', m.market_pair);
          }
        } catch (e: any) {
          signalErrors.push(`Listing ${m.exchange}/${m.symbol}: ${e?.message ?? 'unknown'}`);
        }
      }

      // Delistings → korea_exchange_delisting signals (negative weight)
      for (const d of diff.delisted) {
        try {
          const { data: prospect } = await (supabase as any)
            .from('prospects')
            .select('id, name')
            .ilike('symbol', d.symbol)
            .limit(1)
            .maybeSingle();

          const exchangeLabel = d.exchange === 'upbit' ? 'Upbit' : 'Bithumb';
          const headline = `${d.symbol} delisted from ${exchangeLabel}`;

          const { error: sigErr } = await (supabase as any)
            .from('prospect_signals')
            .insert({
              prospect_id: prospect?.id ?? null,
              project_name: prospect?.name || d.symbol,
              signal_type: 'korea_exchange_delisting',
              headline,
              snippet: `${d.market_pair} no longer appears in ${exchangeLabel}'s market list. Disqualifier — likely loss of Korean retail liquidity.`,
              source_url: null,
              source_name: SIGNAL_SOURCE_NAME,
              relevancy_weight: DELISTING_SIGNAL_WEIGHT,
              tier: 1,
              confidence: 'confirmed',
              shelf_life_days: 30,
              metadata: {
                exchange: d.exchange,
                market_pair: d.market_pair,
                agent_run_id: runId,
              },
              detected_at: nowIso,
              is_active: true,
            });

          if (sigErr) {
            signalErrors.push(`Delisting ${d.exchange}/${d.symbol}: ${sigErr.message}`);
          } else {
            delistingSignalsFired++;
            await (supabase as any)
              .from('korean_exchange_markets')
              .update({ delisting_signal_fired_at: nowIso })
              .eq('exchange', d.exchange)
              .eq('market_pair', d.market_pair);
          }
        } catch (e: any) {
          signalErrors.push(`Delisting ${d.exchange}/${d.symbol}: ${e?.message ?? 'unknown'}`);
        }
      }
    }

    // ── 7. Done ──────────────────────────────────────────────────────
    const summary = {
      live_markets_total: live.length,
      live_upbit: live.filter(m => m.exchange === 'upbit').length,
      live_bithumb: live.filter(m => m.exchange === 'bithumb').length,
      db_active_before: dbActive.length,
      baseline_run: isBaselineRun,
      new_listings_detected: diff.newListings.length,
      delistings_detected: diff.delisted.length,
      delistings_marked: delistingsMarked,
      listing_signals_fired: listingSignalsFired,
      delisting_signals_fired: delistingSignalsFired,
      prospect_matches: prospectMatches,
      fetch_errors: fetchErrors,
      signal_errors: signalErrors,
    };

    await finishRun('completed', summary);

    return NextResponse.json({
      success: true,
      ...summary,
      duration_ms: Date.now() - startedAt.getTime(),
    });
  } catch (err: any) {
    console.error('Korean exchange listings cron error:', err);
    await finishRun('failed', {}, err?.message ?? 'Unknown error');
    return NextResponse.json(
      { error: err?.message ?? 'Korean exchange listings cron failed' },
      { status: 500 },
    );
  }
}
