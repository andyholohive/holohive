/**
 * KR Signal Bot — Feature B (Korea Listings): detection + message builders.
 * Reuses HHP's existing korean_exchange_markets table (populated hourly by the
 * korean-exchange-listings cron) as the detection source — no second poller.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DetectedListing {
  symbol: string;          // base ticker, e.g. 'VVV'
  venues: string[];        // ['upbit','bithumb'] — same-day combined
  listedOn: string;        // YYYY-MM-DD (KST-ish, from first_seen_at)
  warning: boolean;        // Korea investment-warning designation
}

/**
 * New KRW listings first seen since `sinceIso`, grouped by base symbol
 * (same-day multi-venue combined). Reads korean_exchange_markets.
 */
export async function fetchRecentKrwListings(
  supabase: SupabaseClient,
  sinceIso: string
): Promise<DetectedListing[]> {
  const { data, error } = await supabase
    .from("korean_exchange_markets")
    .select("exchange, symbol, warning_flag, first_seen_at")
    .eq("quote_currency", "KRW")
    .is("delisted_at", null)
    .gte("first_seen_at", sinceIso)
    .order("first_seen_at", { ascending: true });
  if (error) throw new Error(`fetchRecentKrwListings: ${error.message}`);

  const bySymbol = new Map<string, DetectedListing>();
  for (const row of (data ?? []) as any[]) {
    const symbol = String(row.symbol || "").toUpperCase();
    if (!symbol) continue;
    const listedOn = String(row.first_seen_at).slice(0, 10);
    const cur = bySymbol.get(symbol);
    if (cur) {
      if (!cur.venues.includes(row.exchange)) cur.venues.push(row.exchange);
      cur.warning = cur.warning || !!row.warning_flag;
    } else {
      bySymbol.set(symbol, { symbol, venues: [row.exchange], listedOn, warning: !!row.warning_flag });
    }
  }
  return [...bySymbol.values()];
}

/** Per-token 24h KRW volume split by venue (best-effort). §7.D shows the
 *  Day-1 volume per venue ("$92M Upbit · $38M Bithumb"), so keep the split. */
export async function getTokenKrVolumeByVenueKrw(
  symbol: string
): Promise<{ upbit: number; bithumb: number; total: number }> {
  const sym = symbol.toUpperCase();
  const upbit = (async () => {
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=KRW-${sym}`);
    if (!r.ok) return 0;
    const j: any = await r.json();
    return Number(j?.[0]?.acc_trade_price_24h ?? 0);
  })();
  const bithumb = (async () => {
    const r = await fetch(`https://api.bithumb.com/public/ticker/${sym}_KRW`);
    if (!r.ok) return 0;
    const j: any = await r.json();
    if (j?.status !== "0000") return 0;
    return Number(j?.data?.acc_trade_value_24H ?? j?.data?.acc_trade_value ?? 0);
  })();
  const [u, b] = await Promise.allSettled([upbit, bithumb]);
  const uv = u.status === "fulfilled" ? u.value : 0;
  const bv = b.status === "fulfilled" ? b.value : 0;
  return { upbit: uv, bithumb: bv, total: uv + bv };
}

/** Per-token 24h KRW volume across Upbit + Bithumb (sum). */
export async function getTokenKrVolumeKrw(symbol: string): Promise<number> {
  return (await getTokenKrVolumeByVenueKrw(symbol)).total;
}

/** Current KRW trade price on Upbit (fallback Bithumb). Best-effort → 0.
 *  Captured at detection so the digest can show "Since listing ▲ +X%" (§7.B). */
export async function getTokenKrPriceKrw(symbol: string): Promise<number> {
  const sym = symbol.toUpperCase();
  try {
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=KRW-${sym}`);
    if (r.ok) {
      const j: any = await r.json();
      const p = Number(j?.[0]?.trade_price ?? 0);
      if (p > 0) return p;
    }
  } catch { /* fall through */ }
  try {
    const r = await fetch(`https://api.bithumb.com/public/ticker/${sym}_KRW`);
    if (r.ok) {
      const j: any = await r.json();
      if (j?.status === "0000") return Number(j?.data?.closing_price ?? 0);
    }
  } catch { /* fall through */ }
  return 0;
}

const VENUE_LABEL: Record<string, string> = { upbit: "Upbit", bithumb: "Bithumb" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const venueList = (v: string[]) => v.map((x) => VENUE_LABEL[x] || x).join(" + ");
const krwT = (n: number) => "₩" + (n / 1e12).toFixed(2) + "T";
/** Compact USD — thousands-range day-1 volumes rendered "$0.0M" with the old
 *  fixed-M formatter (Andy 2026-07-10). Mirrors weeklyReport's usdCompact. */
const usdCompact = (n: number) =>
  n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B"
  : n >= 1e7 ? "$" + (n / 1e6).toFixed(0) + "M"
  : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M"
  : n >= 1e3 ? "$" + (n / 1e3).toFixed(0) + "K"
  : "$" + n.toFixed(0);

const HR = "━━━━━━━━━━━━━";
const usdPrice = (n: number) => "$" + (n >= 1 ? n.toFixed(2) : n.toFixed(4));
const arrowPct = (pct: number) => `${pct >= 0 ? "▲ +" : "▼ "}${Math.round(pct)}%`;
/** "Jul 6" from a YYYY-MM-DD key — matches the spec's entry date style. */
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${M[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** §7.C Stage-1 client listing alert — celebratory framing per spec (§7.D note:
 *  "No analytical commentary line. Congratulatory framing only."). Price + mkt
 *  cap render when the client has a coingecko_id; lines omit when unavailable. */
export function buildStage1Alert(
  ticker: string,
  l: DetectedListing,
  opts?: { priceUsd?: number | null; mcapUsd?: number | null }
): string {
  const priceLine =
    opts?.priceUsd
      ? `Price   ${usdPrice(opts.priceUsd)}${opts?.mcapUsd ? ` · Mkt cap ${usdCompact(opts.mcapUsd)}` : ``}`
      : ``;
  const L = [
    `🎉 <b>$${esc(ticker)} is LIVE in Korea!</b>`,
    HR,
    `Congrats team, $${esc(ticker)} just listed on 🇰🇷 ${esc(venueList(l.venues))}`,
    `Market  KRW`,
    `Listed  ${esc(shortDate(l.listedOn))}`,
    priceLine,
    l.warning ? `⚠️ Investment-warning designation in effect.` : ``,
    HR,
    `⏳ Day-1 recap drops here in 24h`,
  ].filter(Boolean);
  return L.join("\n");
}

/** §7.D Stage-2 recap — edited into the Stage-1 message at +24h. Congratulatory
 *  framing; price change + per-venue Day-1 volume + vol-spike (§6.7). */
export function buildStage2Recap(
  ticker: string,
  l: DetectedListing,
  day1ByVenueKrw: { upbit: number; bithumb: number; total: number },
  fxUsdKrw: number,
  spikeMultiple?: number | null,
  prices?: { listingUsd?: number | null; nowUsd?: number | null }
): string {
  const toUsd = (krw: number) => (fxUsdKrw > 0 ? krw / fxUsdKrw : 0);
  const priceLine =
    prices?.listingUsd && prices?.nowUsd
      ? `Price        ${usdPrice(prices.listingUsd)} → ${usdPrice(prices.nowUsd)}  ${arrowPct(((prices.nowUsd - prices.listingUsd) / prices.listingUsd) * 100)}`
      : ``;
  const venueParts = [
    day1ByVenueKrw.upbit > 0 ? `${usdCompact(toUsd(day1ByVenueKrw.upbit))} Upbit` : ``,
    day1ByVenueKrw.bithumb > 0 ? `${usdCompact(toUsd(day1ByVenueKrw.bithumb))} Bithumb` : ``,
  ].filter(Boolean);
  const volLine = venueParts.length
    ? `Day-1 KR vol ${venueParts.join(" · ")}`
    : `Day-1 KR vol ${krwT(day1ByVenueKrw.total)}${day1ByVenueKrw.total ? ` ≈ ${usdCompact(toUsd(day1ByVenueKrw.total))}` : ``}`;
  const spikeLine =
    spikeMultiple != null && isFinite(spikeMultiple) && spikeMultiple > 0
      ? `Vol spike    ${spikeMultiple.toFixed(1)}× prior avg`
      : ``;
  const L = [
    `🎉 <b>$${esc(ticker)} Korea Debut · Day 1</b> 🚀`,
    HR,
    `Congrats team — Day 1 on 🇰🇷 ${esc(venueList(l.venues))}! 🎊`,
    HR,
    priceLine,
    volLine,
    spikeLine,
    l.warning ? `⚠️ Investment-warning designation in effect.` : ``,
  ].filter(Boolean);
  return L.join("\n");
}

/** §7.B digest entry — DetectedListing enriched with captured metrics. Optional
 *  lines render only when the underlying capture exists. */
export interface DigestEntry extends DetectedListing {
  sinceListingPct?: number | null;
  day1KrVolKrw?: number | null;
  spikeMultiple?: number | null;
}

/** §7.B Korea Listings Digest — per-entry blocks per the spec template. */
export function buildListingsDigest(listings: DigestEntry[], weekLabel: string, fxUsdKrw = 0): string {
  const L = [`🇰🇷 <b>Korea Listings · Week of ${esc(weekLabel)}</b>`, HR];
  if (listings.length === 0) {
    L.push(`No new KRW listings this week.`);
    return L.join("\n");
  }
  L.push(`Upbit + Bithumb · KRW listings · ${listings.length} new`);
  const sorted = [...listings].sort((a, b) => a.listedOn.localeCompare(b.listedOn));
  for (const l of sorted) {
    L.push(HR);
    L.push(`<b>$${esc(l.symbol)}</b>  🇰🇷 ${esc(venueList(l.venues))} (KRW) · ${esc(shortDate(l.listedOn))}${l.warning ? " ⚠️" : ""}`);
    if (l.sinceListingPct != null && isFinite(l.sinceListingPct)) {
      L.push(`Since listing  ${arrowPct(l.sinceListingPct)}`);
    }
    if (l.day1KrVolKrw != null && l.day1KrVolKrw > 0) {
      const usd = fxUsdKrw > 0 ? ` ≈ ${usdCompact(l.day1KrVolKrw / fxUsdKrw)}` : ``;
      L.push(`Day-1 KR vol   ${krwT(l.day1KrVolKrw)}${usd}${l.venues.length > 1 ? " (combined)" : ""}`);
    }
    if (l.spikeMultiple != null && isFinite(l.spikeMultiple) && l.spikeMultiple > 0) {
      L.push(`Vol spike      ${l.spikeMultiple.toFixed(1)}× prior avg`);
    }
  }
  return L.join("\n");
}
