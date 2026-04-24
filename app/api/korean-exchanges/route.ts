import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/korean-exchanges
 *
 * Returns a snapshot of the exchange tracker state for the Exchanges tab UI.
 *
 * Response:
 *   {
 *     stats: {
 *       total_markets: number,
 *       upbit: number,
 *       bithumb: number,
 *       new_last_7d: number,
 *       delisted_last_30d: number,
 *       total_scanner_signals: number,
 *     },
 *     recent_markets: [
 *       { exchange, symbol, market_pair, quote_currency, korean_name,
 *         english_name, warning_flag, first_seen_at, listing_signal_fired_at, is_new }
 *     ],
 *     delisted_markets: [
 *       { exchange, symbol, market_pair, delisted_at }
 *     ],
 *     recent_runs: [
 *       { id, status, started_at, completed_at, duration_ms, output_summary, error_message }
 *     ],
 *     last_run: { ... } | null
 *   }
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch recent markets (sorted by first_seen_at DESC for "what's new" view).
  // Paginate via range() to bypass PostgREST's 1000-row server cap.
  const PAGE_SIZE = 1000;
  const allMarkets: any[] = [];
  for (let page = 0; page < 50; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await (supabase as any)
      .from('korean_exchange_markets')
      .select('exchange, symbol, market_pair, quote_currency, korean_name, english_name, warning_flag, first_seen_at, delisted_at, listing_signal_fired_at')
      .range(from, to);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    allMarkets.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const active = allMarkets.filter(m => !m.delisted_at);
  const delisted = allMarkets.filter(m => m.delisted_at);

  // Signals total (scanner-emitted)
  const { count: signalsCount } = await (supabase as any)
    .from('prospect_signals')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'korean_exchange_scanner');

  // Recent agent runs
  const { data: runs } = await (supabase as any)
    .from('agent_runs')
    .select('id, status, started_at, completed_at, duration_ms, output_summary, error_message')
    .eq('agent_name', 'KOREAN_EXCHANGES')
    .order('started_at', { ascending: false })
    .limit(10);

  // Stats
  const upbitCount = active.filter(m => m.exchange === 'upbit').length;
  const bithumbCount = active.filter(m => m.exchange === 'bithumb').length;
  const newLast7d = active.filter(m => m.first_seen_at > sevenDaysAgo && m.listing_signal_fired_at).length;
  const delistedLast30d = delisted.filter(m => m.delisted_at > thirtyDaysAgo).length;

  // Recent markets (newest first_seen_at first). Mark as "is_new" if first_seen
  // is within the last 7 days AND a listing signal was fired (meaning the
  // scanner actually detected it as a net-new listing, not a baseline entry).
  const recentMarkets = active
    .slice()
    .sort((a, b) => (b.first_seen_at > a.first_seen_at ? 1 : -1))
    .slice(0, 50)
    .map(m => ({
      ...m,
      is_new: m.first_seen_at > sevenDaysAgo && !!m.listing_signal_fired_at,
    }));

  const recentDelisted = delisted
    .slice()
    .sort((a, b) => (b.delisted_at > a.delisted_at ? 1 : -1))
    .slice(0, 20)
    .map(m => ({
      exchange: m.exchange,
      symbol: m.symbol,
      market_pair: m.market_pair,
      delisted_at: m.delisted_at,
    }));

  return NextResponse.json({
    stats: {
      total_markets: active.length,
      upbit: upbitCount,
      bithumb: bithumbCount,
      new_last_7d: newLast7d,
      delisted_last_30d: delistedLast30d,
      total_scanner_signals: signalsCount ?? 0,
    },
    recent_markets: recentMarkets,
    delisted_markets: recentDelisted,
    recent_runs: runs ?? [],
    last_run: runs?.[0] ?? null,
  });
}
