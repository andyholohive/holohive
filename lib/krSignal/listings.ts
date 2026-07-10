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

/** Per-token 24h KRW volume across Upbit + Bithumb (best-effort). For the Day-1 recap. */
export async function getTokenKrVolumeKrw(symbol: string): Promise<number> {
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
  return uv + bv;
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

/** §7.C Stage-1 client listing alert — the client's own token just listed on a KR exchange. */
export function buildStage1Alert(ticker: string, l: DetectedListing): string {
  const L = [
    `🚨 <b>$${esc(ticker)} listed on ${esc(venueList(l.venues))}</b> (KRW)`,
    l.warning ? `⚠️ Marked with an investment-warning designation.` : ``,
    ``,
    `Korea's the largest retail on-ramp — this is a demand event. We'll post a Day-1 recap in ~24h with first-day KRW volume and the kimchi read.`,
  ].filter(Boolean);
  return L.join("\n");
}

/** §7.D Stage-2 recap — edited into the Stage-1 message ~24h later.
 *  spikeMultiple (§6.7) = day-1 volume ÷ the token's frozen trailing-7d avg. */
export function buildStage2Recap(
  ticker: string,
  l: DetectedListing,
  day1VolKrw: number,
  fxUsdKrw: number,
  spikeMultiple?: number | null
): string {
  const day1Usd = fxUsdKrw > 0 ? day1VolKrw / fxUsdKrw : 0;
  const spikeLine =
    spikeMultiple != null && isFinite(spikeMultiple) && spikeMultiple > 0
      ? `Vol-spike     ${spikeMultiple.toFixed(1)}× the token's prior 7-day avg`
      : ``;
  const L = [
    `☆ <b>$${esc(ticker)} · Day-1 on ${esc(venueList(l.venues))}</b>`,
    ``,
    `First-24h KRW vol  ${krwT(day1VolKrw)}${day1Usd ? ` ≈ ${usdCompact(day1Usd)}` : ``}`,
    spikeLine,
    l.warning ? `⚠️ Investment-warning designation in effect.` : ``,
    ``,
    `Listed ${esc(l.listedOn)}. Trading now live for KR retail.`,
  ].filter(Boolean);
  return L.join("\n");
}

/** §7.B Korea Listings Digest — the week's new KRW listings (general market intel). */
export function buildListingsDigest(listings: DetectedListing[], weekLabel: string): string {
  const HR = "━━━━━━━━━━━━━";
  const L = [`🇰🇷 <b>Korea Listings — ${esc(weekLabel)}</b>`, HR];
  if (listings.length === 0) {
    L.push(`No new KRW listings this week.`);
  } else {
    const sorted = [...listings].sort((a, b) => a.symbol.localeCompare(b.symbol));
    for (const l of sorted) {
      L.push(`• <b>$${esc(l.symbol)}</b> — ${esc(venueList(l.venues))}${l.warning ? " ⚠️" : ""}`);
    }
  }
  return L.join("\n");
}
