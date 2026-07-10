/**
 * KR Signal Bot — live market-data adapters (spec §4).
 * Ported from the standalone repo. All public APIs, no keys required
 * (CoinGecko demo key optional). Uses global fetch (Node 18+ / Next runtime).
 */

// ─── Upbit ────────────────────────────────────────────────────────────────
const UPBIT = "https://api.upbit.com/v1";
async function upbitJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Upbit ${r.status}`);
  return r.json();
}
function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}
/** USDT/KRW trade price (for kimchi premium, §6.3). */
export async function getUsdtKrw(): Promise<number> {
  const t = await upbitJson(`${UPBIT}/ticker?markets=KRW-USDT`);
  return t[0].trade_price;
}
async function getUpbitKrwMarkets(): Promise<string[]> {
  const m = await upbitJson(`${UPBIT}/market/all?isDetails=false`);
  return m.filter((x: any) => x.market.startsWith("KRW-")).map((x: any) => x.market);
}
/** Sum of 24h KRW trade value across all Upbit KRW markets. */
export async function getUpbitKrCexQuoteVolKrw(): Promise<number> {
  const markets = await getUpbitKrwMarkets();
  let sum = 0;
  for (const c of chunk(markets, 100)) {
    const t = await upbitJson(`${UPBIT}/ticker?markets=${c.join(",")}`);
    for (const x of t) sum += x.acc_trade_price_24h ?? 0;
  }
  return sum;
}

// ─── Bithumb ──────────────────────────────────────────────────────────────
/** Bithumb 24h KRW spot volume (§4). */
export async function getBithumbKrCexQuoteVolKrw(): Promise<number> {
  const r = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW");
  if (!r.ok) throw new Error(`Bithumb ${r.status}`);
  const j: any = await r.json();
  if (j.status !== "0000") throw new Error(`Bithumb status ${j.status}`);
  let sum = 0;
  for (const [k, v] of Object.entries<any>(j.data)) {
    if (k === "date") continue;
    sum += parseFloat(v.acc_trade_value || "0");
  }
  return sum;
}

// ─── CoinGecko ────────────────────────────────────────────────────────────
const CG = "https://api.coingecko.com/api/v3";
const CG_KEY = process.env.COINGECKO_API_KEY;
function cgHdr(): Record<string, string> {
  return CG_KEY ? { "x-cg-demo-api-key": CG_KEY } : {};
}
async function cgJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: cgHdr() });
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  return r.json();
}
const VENUE_MATCH: [string, string][] = [
  ["upbit", "upbit"], ["bithumb", "bithumb"], ["coinbase", "coinbase"],
  ["bybit", "bybit"], ["kraken", "kraken"], ["bitget", "bitget"], ["gate", "gate"],
];
/** §6.7 — token's frozen trailing-7d average DAILY volume (USD), for the listing
 *  vol-spike multiple. Excludes the most recent (partial) day. Best-effort → 0. */
export async function getTrailing7dAvgVolumeUsd(id: string): Promise<number> {
  const c = await cgJson(`${CG}/coins/${id}/market_chart?vs_currency=usd&days=8&interval=daily`);
  const vols: [number, number][] = c.total_volumes || [];
  if (vols.length < 2) return 0;
  const prior = vols.slice(0, -1).slice(-7).map((v) => v[1]).filter((x) => typeof x === "number" && x > 0);
  if (!prior.length) return 0;
  return prior.reduce((a, b) => a + b, 0) / prior.length;
}

/** §7.C — current USD price + market cap for the client listing alert. Best-effort → nulls. */
export async function getCoinPriceAndMcapUsd(id: string): Promise<{ priceUsd: number | null; mcapUsd: number | null }> {
  try {
    const j = await cgJson(`${CG}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_market_cap=true`);
    const row = j?.[id];
    return {
      priceUsd: typeof row?.usd === "number" ? row.usd : null,
      mcapUsd: typeof row?.usd_market_cap === "number" ? row.usd_market_cap : null,
    };
  } catch {
    return { priceUsd: null, mcapUsd: null };
  }
}

/** §6.7 / §7.B — resolve a bare ticker to a CoinGecko id (exact symbol match).
 *  Used to freeze the vol-spike baseline for non-client listings, where we
 *  only have the exchange ticker. Best-effort → null on ambiguity/miss. */
export async function searchCoingeckoIdBySymbol(symbol: string): Promise<string | null> {
  try {
    const j = await cgJson(`${CG}/search?query=${encodeURIComponent(symbol)}`);
    const sym = symbol.toUpperCase();
    const hit = (j?.coins || []).find((c: any) => String(c?.symbol || "").toUpperCase() === sym);
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

/** Map CoinGecko market names → our venue keys; aggregate 24h converted USD volume. */
export async function getPerVenueVolume(id: string): Promise<Record<string, number>> {
  const c = await cgJson(`${CG}/coins/${id}/tickers?depth=false`);
  const out: Record<string, number> = {};
  for (const tk of c.tickers || []) {
    const name = (tk.market?.name || "").toLowerCase();
    const hit = VENUE_MATCH.find(([needle]) => name.includes(needle));
    if (!hit) continue;
    const vol = tk.converted_volume?.usd || 0;
    out[hit[1]] = (out[hit[1]] || 0) + vol;
  }
  return out;
}

// ─── FX ───────────────────────────────────────────────────────────────────
/** USD/KRW FX (§4). Free, no key. */
export async function getUsdKrw(): Promise<number> {
  const r = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!r.ok) throw new Error(`FX ${r.status}`);
  const j: any = await r.json();
  const krw = j?.rates?.KRW;
  if (!krw) throw new Error("FX USD/KRW unavailable");
  return krw;
}

// ─── KOSPI ────────────────────────────────────────────────────────────────
export interface KospiData {
  level: number; wowPct: number; ytdPct: number; pctFromAth: number; atAth: boolean;
}
/** KOSPI via Yahoo Finance ^KS11 (§4): level, WoW, YTD, % from ATH. */
export async function getKospi(): Promise<KospiData> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?range=1y&interval=1d";
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`KOSPI ${r.status}`);
  const j: any = await r.json();
  const res = j.chart.result[0];
  const ts: number[] = res.timestamp;
  const closeArr: (number | null)[] = res.indicators.quote[0].close;
  const pts = ts.map((t, i) => ({ t, c: closeArr[i] })).filter((p) => p.c != null) as { t: number; c: number }[];
  const level = res.meta.regularMarketPrice ?? pts[pts.length - 1].c;
  const weekAgo = pts[pts.length - 6]?.c ?? pts[0].c;
  const wowPct = ((level - weekAgo) / weekAgo) * 100;
  const year = new Date().getUTCFullYear();
  const ytdStart = (pts.find((p) => new Date(p.t * 1000).getUTCFullYear() === year)?.c) ?? pts[0].c;
  const ytdPct = ((level - ytdStart) / ytdStart) * 100;
  const ath = Math.max(level, res.meta.fiftyTwoWeekHigh ?? 0, ...pts.map((p) => p.c));
  const pctFromAth = ((level - ath) / ath) * 100;
  const atAth = level >= ath * 0.999;
  return { level, wowPct, ytdPct, pctFromAth, atAth };
}

// ─── Futures (aggregated perps) ──────────────────────────────────────────
async function futJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
const sumBy = (a: any[], f: (x: any) => number) => a.reduce((s, x) => s + (f(x) || 0), 0);
async function binance(): Promise<number> {
  const a = await futJson("https://fapi.binance.com/fapi/v1/ticker/24hr");
  return sumBy(a, (x) => parseFloat(x.quoteVolume));
}
async function bybit(): Promise<number> {
  const j = await futJson("https://api.bybit.com/v5/market/tickers?category=linear");
  return sumBy(j.result?.list || [], (x) => parseFloat(x.turnover24h));
}
async function bitget(): Promise<number> {
  const j = await futJson("https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures");
  return sumBy(j.data || [], (x) => parseFloat(x.quoteVolume ?? x.usdtVolume));
}
async function mexc(): Promise<number> {
  const j = await futJson("https://contract.mexc.com/api/v1/contract/ticker");
  return sumBy(j.data || [], (x) => parseFloat(x.amount24));
}
async function okx(): Promise<number> {
  const j = await futJson("https://www.okx.com/api/v5/market/tickers?instType=SWAP");
  return sumBy(j.data || [], (x) => parseFloat(x.volCcy24h) * parseFloat(x.last));
}
/** Top-5 perp 24h notional (§4). Self-reported footnote applies (§10). */
export async function getFuturesTotalUsd(): Promise<{ total: number; byVenue: Record<string, number>; missing: string[] }> {
  const venues: [string, () => Promise<number>][] = [
    ["binance", binance], ["okx", okx], ["bybit", bybit], ["bitget", bitget], ["mexc", mexc],
  ];
  const results = await Promise.allSettled(venues.map(([, fn]) => fn()));
  const byVenue: Record<string, number> = {};
  const missing: string[] = [];
  results.forEach((res, i) => {
    const name = venues[i][0];
    if (res.status === "fulfilled" && isFinite(res.value)) byVenue[name] = res.value;
    else missing.push(name);
  });
  const total = Object.values(byVenue).reduce((s, v) => s + v, 0);
  return { total, byVenue, missing };
}
