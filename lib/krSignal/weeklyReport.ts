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
  krVolSharePct: number;
  krVol7dArrow: Arrow; krVol7dPct: number;
  koreaReadLabel: string;
  byVenue: VenueVol[];
  futuresTotalUsd: number; futuresRegime: Regime; futuresArrow: Arrow;
  krCexVolKrw: number; krCexVolUsd: number; krCexRegime: Regime; krCexArrow: Arrow;
  kospi: number; kospiWoWPct: number; kospiYtdPct: number; kospiAtAth: boolean;
  fxUsdKrw: number;
  kimchiUsdtPct: number;
  sovArrow: Arrow; sovPct: number;
  peerRank: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sign = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(n % 1 === 0 ? 0 : 1) + "%";
const usdM = (n: number) => "$" + (n / 1e6).toFixed(0) + "M";
const usdB = (n: number) => "$" + (n / 1e9).toFixed(2) + "B";

/** 8-cell bar: filled █ vs empty ░ from a 0–100 pct. */
function bar(pct: number, cells = 8): string {
  const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)));
  return "█".repeat(filled) + "░".repeat(cells - filled);
}
function pad(s: string, n: number): string { return s.length >= n ? s : s + " ".repeat(n - s.length); }

/**
 * HoloHive brand mark. Wraps a fallback emoji in a Telegram custom-emoji entity
 * so the logo shows in front of the title + Holo Hive Signal line. Overridable
 * via KR_SIGNAL_LOGO_EMOJI_ID. Custom emoji don't render inside <pre> blocks, so
 * these lines are emitted OUTSIDE the monospace body. sendMessage strips the tag
 * and falls back to the plain emoji if the bot isn't allowed to send it.
 */
const LOGO_EMOJI_ID = process.env.KR_SIGNAL_LOGO_EMOJI_ID || "4988010039290627193";
function logo(fallback: string): string {
  return LOGO_EMOJI_ID ? `<tg-emoji emoji-id="${LOGO_EMOJI_ID}">${fallback}</tg-emoji>` : fallback;
}

export function buildWeeklyReport(d: WeeklyReportData): string {
  const HR = "━━━━━━━━━━━━━";
  // Monospace body (bars need alignment) — everything except the branded
  // title + Holo Hive Signal header, which sit OUTSIDE <pre> so the custom
  // logo emoji renders (it can't inside a code block).
  const B: string[] = [];
  B.push(`🇰🇷 Korea Demand`);
  B.push(`KR vol share   ${d.krVolSharePct}% (Upbit + Bithumb)`);
  B.push(`KR Vol 7d      ${d.krVol7dArrow} ${sign(d.krVol7dPct)}`);
  B.push(d.koreaReadLabel);
  B.push(HR);
  B.push(`🏦 By Venue (7d volume)`);
  for (const v of d.byVenue) {
    const flag = v.isKR ? "🇰🇷 " : "   ";
    B.push(`${flag}${pad(v.name, 9)}${pad(usdM(v.usd), 6)} ${bar(v.pct)} ${v.pct}%`);
  }
  B.push(HR);
  B.push(`🌐 Market Backdrop`);
  B.push(`Futures total  ~${usdB(d.futuresTotalUsd)}   ${d.futuresArrow} ${d.futuresRegime}`);
  B.push(`KR CEX vol     ₩${(d.krCexVolKrw / 1e12).toFixed(1)}T ≈${usdB(d.krCexVolUsd)}  ${d.krCexArrow} ${d.krCexRegime}`);
  B.push(`KOSPI          ${d.kospi.toLocaleString()}  ${d.kospiWoWPct >= 0 ? "▲" : "▼"} ${sign(d.kospiWoWPct)} WoW`);
  B.push(`               ${sign(d.kospiYtdPct)} YTD${d.kospiAtAth ? " (at ATH)" : ""}`);
  B.push(`FX $1=₩${d.fxUsdKrw.toLocaleString()}`);
  B.push(`Kimchi prem (USDT)  ${sign(d.kimchiUsdtPct)}`);

  const title = `${logo("📊")} <b>$${esc(d.ticker)} Weekly Report · ${esc(d.weekLabel)}</b>`;
  const signal = [
    `${logo("🐝")} <b>Holo Hive Signal</b>`,
    esc(`KR share of voice   ${d.sovArrow} ${sign(d.sovPct)} WoW`),
    esc(`vs AI-token peers    $${d.ticker} #${d.peerRank} in KR vol share`),
  ].join("\n");

  return `${title}\n<pre>${esc(B.join("\n"))}</pre>\n${signal}`;
}

/** Market-backdrop-only block — for the /vl command (mirrors @cexdexspikebot). */
export function buildBackdrop(d: WeeklyReportData): string {
  const L: string[] = [];
  L.push(`Futures total  ~${usdB(d.futuresTotalUsd)}   ${d.futuresArrow} ${d.futuresRegime}`);
  L.push(`KR CEX vol     ₩${(d.krCexVolKrw / 1e12).toFixed(1)}T ≈${usdB(d.krCexVolUsd)}  ${d.krCexArrow} ${d.krCexRegime}`);
  L.push(`KOSPI          ${d.kospi.toLocaleString()}  ${d.kospiWoWPct >= 0 ? "▲" : "▼"} ${sign(d.kospiWoWPct)} WoW`);
  L.push(`FX $1=₩${d.fxUsdKrw.toLocaleString()}`);
  L.push(`Kimchi prem (USDT)  ${sign(d.kimchiUsdtPct)}`);
  const title = `${logo("📊")} <b>$${esc(d.ticker)} Market Backdrop · ${esc(d.weekLabel)}</b>`;
  return `${title}\n<pre>${esc(L.join("\n"))}</pre>`;
}
