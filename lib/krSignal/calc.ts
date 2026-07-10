/**
 * KR Signal Bot — calculation / signal module (spec §6).
 * Pure functions, no I/O. This is the Holo Hive proprietary signal layer.
 * Ported verbatim from the standalone kr-signal-bot repo.
 */

export type Arrow = "▲" | "⟷" | "▼";
export type Regime = "active" | "neutral" | "quiet";
export type Trend = "rising" | "flat" | "falling";

/** §6.1 Trend arrow — this week vs last week, ±5% deadband. */
export function trendArrow(current: number, prior: number, deadband = 0.05): Arrow {
  if (!isFinite(prior) || prior === 0) return "⟷";
  const delta = (current - prior) / prior;
  if (delta < -deadband) return "▼";
  if (delta > deadband) return "▲";
  return "⟷";
}

/** Trend as a word (for the Korea-read label table). */
export function trend(current: number, prior: number, deadband = 0.05): Trend {
  const a = trendArrow(current, prior, deadband);
  return a === "▲" ? "rising" : a === "▼" ? "falling" : "flat";
}

/** §6.2 Regime label — vs stored full-cycle baseline (p33/p66). */
export function regimeLabel(current: number, p33: number, p66: number): Regime {
  if (current >= p66) return "active";
  if (current >= p33) return "neutral";
  return "quiet";
}

/** §6.3 Kimchi premium (USDT). Returns a fraction (e.g. 0.006 = +0.6%). */
export function kimchiPremium(upbitUsdtKrw: number, usdKrwFx: number): number {
  return upbitUsdtKrw / usdKrwFx - 1;
}

/** §6.4 KR vol share = (Upbit + Bithumb token vol) / total across tracked venues. */
export function krVolShare(krVenueVols: number[], allVenueVols: number[]): number {
  const total = allVenueVols.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return krVenueVols.reduce((a, b) => a + b, 0) / total;
}

/** §6.5 SOV placeholder — cumulative content-piece growth WoW. NOT real mindshare. */
export function sovPlaceholder(cumThisWeek: number, cumLastWeek: number): number {
  if (cumLastWeek === 0) return 0;
  return (cumThisWeek - cumLastWeek) / cumLastWeek;
}

/** §6.7 Vol-spike multiple = day-1 volume / frozen trailing-7d avg. */
export function volSpike(day1Vol: number, frozen7dAvg: number): number {
  if (frozen7dAvg === 0) return 0;
  return day1Vol / frozen7dAvg;
}

type KimchiBucket = "hot" | "positive" | "flat" | "discount";
function kimchiBucket(prem: number, t = { hot: 0.03, positive: 0.01, flat: 0.01 }): KimchiBucket {
  if (prem > t.hot) return "hot";
  if (prem > t.positive) return "positive";
  if (prem >= -t.flat) return "flat";
  return "discount";
}

/**
 * §6.6 Korea-read label — kimchi (USDT) crossed with KR vol WoW trend.
 * Table is sparse in the spec; unlisted combos fall back to the nearest sensible phrase.
 */
export function koreaReadLabel(
  kimchiPrem: number,
  krVolTrend: Trend,
  thresholds = { hot: 0.03, positive: 0.01, flat: 0.01 }
): string {
  const b = kimchiBucket(kimchiPrem, thresholds);
  const key = `${b}:${krVolTrend}`;
  const table: Record<string, string> = {
    "hot:rising": "KR retail heating up",
    "hot:flat": "KR retail heating up",
    "hot:falling": "Mixed, KR selling into strength",
    "positive:rising": "KR retail leaning in",
    "positive:flat": "KR retail steady on the bid",
    "positive:falling": "Mixed, KR selling into strength",
    "flat:rising": "KR retail leaning in",
    "flat:flat": "KR retail neutral or sidelined",
    "flat:falling": "KR retail cooling",
    "discount:rising": "Mixed, KR selling into strength",
    "discount:flat": "KR retail neutral or sidelined",
    "discount:falling": "KR retail cooling",
  };
  return table[key] ?? "KR retail neutral or sidelined";
}

/** Peer rank in KR vol share (1-indexed). For the "#N in KR vol share" Holo Hive Signal line. */
export function krVolShareRank(clientShare: number, peerShares: number[]): number {
  return peerShares.filter((s) => s > clientShare).length + 1;
}

/** Linear-interpolated percentile (p in [0,1]) over an unsorted numeric array. §5 baseline job. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
