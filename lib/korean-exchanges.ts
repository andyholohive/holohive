/**
 * Korean Exchange API Client + New Listing Detection
 *
 * Wraps Upbit and Bithumb's public market endpoints. No API keys required.
 * Used by /api/cron/korean-exchange-listings to detect new listings hourly.
 */

export interface ExchangeMarket {
  exchange: 'upbit' | 'bithumb';
  symbol: string;          // e.g. 'BTC', 'AVAX'
  market_pair: string;     // e.g. 'KRW-BTC' (Upbit), 'BTC' (Bithumb returns just symbol)
  quote_currency: string;  // 'KRW', 'BTC', 'USDT'
  korean_name?: string;
  english_name?: string;
  warning_flag?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// Upbit
// https://docs.upbit.com/reference/마켓-코드-조회
// ────────────────────────────────────────────────────────────────────

interface UpbitMarketRow {
  market: string;          // e.g. "KRW-BTC", "USDT-ETH"
  korean_name: string;
  english_name: string;
  market_warning?: 'NONE' | 'CAUTION';
}

export async function fetchUpbitMarkets(): Promise<ExchangeMarket[]> {
  const res = await fetch('https://api.upbit.com/v1/market/all?isDetails=true', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Upbit API ${res.status}: ${res.statusText}`);
  }
  const rows: UpbitMarketRow[] = await res.json();
  return rows.map(r => {
    const [quote, symbol] = r.market.split('-');
    return {
      exchange: 'upbit' as const,
      symbol,
      market_pair: r.market,
      quote_currency: quote,
      korean_name: r.korean_name,
      english_name: r.english_name,
      warning_flag: r.market_warning === 'CAUTION',
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// Bithumb
// https://apidocs.bithumb.com/reference/현재가-정보-조회
//
// Returns: { status: "0000", data: { BTC: {...}, ETH: {...}, "date": "..."} }
// Each key in data is a symbol; we filter out the meta "date" entry.
// ────────────────────────────────────────────────────────────────────

interface BithumbAllResponse {
  status: string;
  data: Record<string, any>;
}

async function fetchBithumbMarketsForQuote(quote: 'KRW' | 'BTC'): Promise<ExchangeMarket[]> {
  const res = await fetch(`https://api.bithumb.com/public/ticker/ALL_${quote}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Bithumb API ${res.status}: ${res.statusText}`);
  }
  const json: BithumbAllResponse = await res.json();
  if (json.status !== '0000') {
    throw new Error(`Bithumb API error status: ${json.status}`);
  }
  const out: ExchangeMarket[] = [];
  for (const [key, value] of Object.entries(json.data)) {
    if (key === 'date') continue;
    if (typeof value !== 'object' || value === null) continue;
    out.push({
      exchange: 'bithumb',
      symbol: key,
      market_pair: `${quote}-${key}`, // synthesize for consistency with Upbit
      quote_currency: quote,
    });
  }
  return out;
}

export async function fetchBithumbMarkets(): Promise<ExchangeMarket[]> {
  // Bithumb has separate KRW and BTC books. Fetch both in parallel.
  const [krw, btc] = await Promise.allSettled([
    fetchBithumbMarketsForQuote('KRW'),
    fetchBithumbMarketsForQuote('BTC'),
  ]);
  const out: ExchangeMarket[] = [];
  if (krw.status === 'fulfilled') out.push(...krw.value);
  if (btc.status === 'fulfilled') out.push(...btc.value);
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Diff logic
// ────────────────────────────────────────────────────────────────────

export interface DiffResult {
  newListings: ExchangeMarket[];      // present now, not in DB
  delisted: Array<{ exchange: string; market_pair: string; symbol: string }>; // in DB, not present now
  unchanged: number;                  // count of markets present in both
}

/**
 * Diffs the live market list (just fetched from exchange APIs) against
 * the most recent DB snapshot. Detects:
 *   - new listings: symbols present in live but not in DB
 *   - delistings:   symbols in DB (and still marked active, i.e. delisted_at IS NULL)
 *                   that aren't in live
 */
export function diffMarkets(
  live: ExchangeMarket[],
  dbActive: Array<{ exchange: string; market_pair: string; symbol: string }>,
): DiffResult {
  const liveKeys = new Set(live.map(m => `${m.exchange}|${m.market_pair}`));
  const dbKeys = new Set(dbActive.map(m => `${m.exchange}|${m.market_pair}`));

  const newListings = live.filter(m => !dbKeys.has(`${m.exchange}|${m.market_pair}`));
  const delisted = dbActive.filter(m => !liveKeys.has(`${m.exchange}|${m.market_pair}`));

  return {
    newListings,
    delisted,
    unchanged: live.length - newListings.length,
  };
}
