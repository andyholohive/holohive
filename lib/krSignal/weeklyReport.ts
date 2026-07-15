/**
 * KR Signal Bot — Weekly KR Market Report renderer (spec §7.A).
 * Emits a Telegram HTML message; the body sits in a <pre> block so the
 * ASCII bars stay aligned. KOSPI line split to two lines to avoid mobile wrap (§8).
 * Ported from the standalone repo.
 */
import type { Arrow, Regime } from "./calc";

export interface VenueVol { name: string; usd: number; pct: number; isKR?: boolean; }

export interface WeeklyReportData {
  ticker: string;
  weekLabel: string;
  /** Actual window of the venue-volume figures: "7d" once a week of daily
   *  snapshots has accrued, "Nd" mid-accrual, "24h" fallback. Labels always
   *  state what the numbers really are. */
  volWindow?: string;
  krVolSharePct: number;
  krVol7dArrow: Arrow; krVol7dPct: number;
  koreaReadLabel: string;
  byVenue: VenueVol[];
  futuresTotalUsd: number; futuresRegime: Regime; futuresArrow: Arrow;
  krCexVolKrw: number; krCexVolUsd: number; krCexRegime: Regime; krCexArrow: Arrow;
  kospi: number; kospiWoWPct: number; kospiYtdPct: number; kospiAtAth: boolean;
  fxUsdKrw: number;
  kimchiUsdtPct: number;
  /** SoV line renders only when showSov is true — otherwise a flat "+0%" would
   *  read as a real (zero) metric. */
  sovArrow: Arrow; sovPct: number; showSov?: boolean;
  /** null when peer_basket is empty OR the token isn't KR-listed → the
   *  "#N vs peers" line is suppressed rather than printing a fabricated rank. */
  peerRank: number | null;
  /** Whether the token trades on a Korean exchange. When false, the Korea
   *  Demand share/vol lines are meaningless (all zero) and get reframed to a
   *  "watching for a KR listing" note [Andy 2026-07-16]. */
  krListed?: boolean;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sign = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(n % 1 === 0 ? 0 : 1) + "%";
/** Compact USD with unit-appropriate precision. The old fixed "$XM" render
 *  showed "$0M" for thousands-range token volumes (Andy 2026-07-10). */
const usdCompact = (n: number) =>
  n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B"
  : n >= 1e7 ? "$" + (n / 1e6).toFixed(0) + "M"
  : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M"
  : n >= 1e3 ? "$" + (n / 1e3).toFixed(0) + "K"
  : "$" + n.toFixed(0);
const usdB = (n: number) => "$" + (n / 1e9).toFixed(2) + "B";

/** 8-cell bar: filled █ vs empty ░ from a 0–100 pct. */
function bar(pct: number, cells = 8): string {
  const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)));
  return "█".repeat(filled) + "░".repeat(cells - filled);
}
function pad(s: string, n: number): string { return s.length >= n ? s : s + " ".repeat(n - s.length); }

/**
 * HoloHive brand mark — ☆ per Andy 2026-07-10 (replaces the bee; the custom
 * logo emoji can't ship until we own a bot-created emoji pack — Telegram only
 * lets bots send custom emoji from packs the bot itself created). If/when that
 * pack exists, set KR_SIGNAL_LOGO_EMOJI_ID and this wraps ☆ in a tg-emoji
 * entity; sendMessage strips the tag and falls back to ☆ on failure.
 */
const LOGO_EMOJI_ID = process.env.KR_SIGNAL_LOGO_EMOJI_ID || "";
function logo(fallback = "☆"): string {
  return LOGO_EMOJI_ID ? `<tg-emoji emoji-id="${LOGO_EMOJI_ID}">${fallback}</tg-emoji>` : fallback;
}

export function buildWeeklyReport(d: WeeklyReportData): string {
  const HR = "━━━━━━━━━━━━━";
  // Monospace body (bars need alignment). Brand header + title sit at the
  // TOP of the same message, outside <pre> (Andy 2026-07-10 — moved back
  // from the bottom); the share-of-voice lines fold into the body's tail.
  //
  // Volume labels say 24h, not 7d: getPerVenueVolume aggregates CoinGecko's
  // 24-hour converted USD volume per exchange (a per-venue 7d figure isn't
  // available in one call). The old "(7d volume)" header presented daily
  // numbers as weekly — the "volume seems inaccurate" report from Jdot's
  // side. The WoW arrow compares this 24h reading to last week's.
  const W = d.volWindow || "24h";
  const B: string[] = [];
  B.push(HR); // §7.A — divider between the title block and Korea Demand
  B.push(`🇰🇷 Korea Demand`);
  if (d.krListed === false) {
    // Not on Upbit/Bithumb yet — the share/vol/read lines would all be a
    // meaningless 0%. Reframe as a watch note instead [Andy 2026-07-16].
    B.push(`Not yet on a Korean exchange — watching for a KR debut.`);
  } else {
    B.push(`KR vol share   ${d.krVolSharePct}% (Upbit + Bithumb)`);
    B.push(`${pad(`KR Vol (${W})`, 15)}${d.krVol7dArrow} ${sign(d.krVol7dPct)} WoW`);
    B.push(d.koreaReadLabel);
  }
  B.push(HR);
  B.push(`🏦 By Venue (${W} volume)`);
  for (const v of d.byVenue) {
    const flag = v.isKR ? "🇰🇷 " : "   ";
    B.push(`${flag}${pad(v.name, 9)}${pad(usdCompact(v.usd), 7)} ${bar(v.pct)} ${v.pct}%`);
  }
  B.push(HR);
  B.push(`🌐 Market Backdrop`);
  // (24h) per Andy 2026-07-10 — both are 24-hour readings (top-5 perp
  // notional; Upbit+Bithumb KRW spot), same honesty rule as By Venue.
  B.push(`Futures (24h)  ~${usdB(d.futuresTotalUsd)}   ${d.futuresArrow} ${d.futuresRegime}`);
  B.push(`KR CEX (24h)   ₩${(d.krCexVolKrw / 1e12).toFixed(1)}T ≈${usdB(d.krCexVolUsd)}  ${d.krCexArrow} ${d.krCexRegime}`);
  B.push(`KOSPI          ${d.kospi.toLocaleString()}  ${d.kospiWoWPct >= 0 ? "▲" : "▼"} ${sign(d.kospiWoWPct)} WoW`);
  B.push(`               ${sign(d.kospiYtdPct)} YTD${d.kospiAtAth ? " (at ATH)" : ""}`);
  B.push(`FX $1=₩${d.fxUsdKrw.toLocaleString()}`);
  B.push(`Kimchi prem (USDT)  ${sign(d.kimchiUsdtPct)}`);
  // Tail lines are conditional — a missing peer_basket or unconfigured
  // content_log_source suppresses its line (and the divider) rather than
  // printing a fabricated "#1" / inert "+0%" [Andy 2026-07-15].
  const tail: string[] = [];
  if (d.showSov) tail.push(`KR share of voice   ${d.sovArrow} ${sign(d.sovPct)} WoW`);
  if (d.peerRank != null) tail.push(`vs peers   $${d.ticker} #${d.peerRank} in KR vol share`);
  if (tail.length) { B.push(HR); B.push(...tail); }

  const brand = `${logo()} <b>Holo Hive Signal</b>`;
  const title = `<b>$${esc(d.ticker)} Weekly Report · ${esc(d.weekLabel)}</b>`;
  return `${brand}\n${title}\n<pre>${esc(B.join("\n"))}</pre>`;
}

/** Market-backdrop-only block — for the /vl command (mirrors @cexdexspikebot). */
export function buildBackdrop(d: WeeklyReportData): string {
  const L: string[] = [];
  L.push(`Futures (24h)  ~${usdB(d.futuresTotalUsd)}   ${d.futuresArrow} ${d.futuresRegime}`);
  L.push(`KR CEX (24h)   ₩${(d.krCexVolKrw / 1e12).toFixed(1)}T ≈${usdB(d.krCexVolUsd)}  ${d.krCexArrow} ${d.krCexRegime}`);
  L.push(`KOSPI          ${d.kospi.toLocaleString()}  ${d.kospiWoWPct >= 0 ? "▲" : "▼"} ${sign(d.kospiWoWPct)} WoW`);
  L.push(`FX $1=₩${d.fxUsdKrw.toLocaleString()}`);
  L.push(`Kimchi prem (USDT)  ${sign(d.kimchiUsdtPct)}`);
  const title = `${logo()} <b>$${esc(d.ticker)} Market Backdrop · ${esc(d.weekLabel)}</b>`;
  return `${title}\n<pre>${esc(L.join("\n"))}</pre>`;
}
