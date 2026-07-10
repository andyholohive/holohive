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

export function buildWeeklyReport(d: WeeklyReportData): string {
  const HR = "━━━━━━━━━━━━━";
  const L: string[] = [];
  L.push(`📊 $${d.ticker} Weekly Report · ${d.weekLabel}`);
  L.push(HR);
  L.push(`🇰🇷 Korea Demand`);
  L.push(`KR vol share   ${d.krVolSharePct}% (Upbit + Bithumb)`);
  L.push(`KR Vol 7d      ${d.krVol7dArrow} ${sign(d.krVol7dPct)}`);
  L.push(d.koreaReadLabel);
  L.push(HR);
  L.push(`🏦 By Venue (7d volume)`);
  for (const v of d.byVenue) {
    const flag = v.isKR ? "🇰🇷 " : "   ";
    L.push(`${flag}${pad(v.name, 9)}${pad(usdM(v.usd), 6)} ${bar(v.pct)} ${v.pct}%`);
  }
  L.push(HR);
  L.push(`🌐 Market Backdrop`);
  L.push(`Futures total  ~${usdB(d.futuresTotalUsd)}   ${d.futuresArrow} ${d.futuresRegime}`);
  L.push(`KR CEX vol     ₩${(d.krCexVolKrw / 1e12).toFixed(1)}T ≈${usdB(d.krCexVolUsd)}  ${d.krCexArrow} ${d.krCexRegime}`);
  L.push(`KOSPI          ${d.kospi.toLocaleString()}  ${d.kospiWoWPct >= 0 ? "▲" : "▼"} ${sign(d.kospiWoWPct)} WoW`);
  L.push(`               ${sign(d.kospiYtdPct)} YTD${d.kospiAtAth ? " (at ATH)" : ""}`);
  L.push(`FX $1=₩${d.fxUsdKrw.toLocaleString()}`);
  L.push(`Kimchi prem (USDT)  ${sign(d.kimchiUsdtPct)}`);
  L.push(HR);
  L.push(`🐝 Holo Hive Signal`);
  L.push(`KR share of voice   ${d.sovArrow} ${sign(d.sovPct)} WoW`);
  L.push(`vs AI-token peers    $${d.ticker} #${d.peerRank} in KR vol share`);

  return `<pre>${esc(L.join("\n"))}</pre>`;
}

/** Market-backdrop-only block — for the /vl command (mirrors @cexdexspikebot). */
export function buildBackdrop(d: WeeklyReportData): string {
  const HR = "━━━━━━━━━━━━━";
  const L: string[] = [];
  L.push(`📊 $${d.ticker} Market Backdrop · ${d.weekLabel}`);
  L.push(HR);
  L.push(`Futures total  ~${usdB(d.futuresTotalUsd)}   ${d.futuresArrow} ${d.futuresRegime}`);
  L.push(`KR CEX vol     ₩${(d.krCexVolKrw / 1e12).toFixed(1)}T ≈${usdB(d.krCexVolUsd)}  ${d.krCexArrow} ${d.krCexRegime}`);
  L.push(`KOSPI          ${d.kospi.toLocaleString()}  ${d.kospiWoWPct >= 0 ? "▲" : "▼"} ${sign(d.kospiWoWPct)} WoW`);
  L.push(`FX $1=₩${d.fxUsdKrw.toLocaleString()}`);
  L.push(`Kimchi prem (USDT)  ${sign(d.kimchiUsdtPct)}`);
  return `<pre>${esc(L.join("\n"))}</pre>`;
}
