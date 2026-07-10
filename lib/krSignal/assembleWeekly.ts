/**
 * KR Signal Bot — assemble the Weekly KR Market Report from live data + calc
 * (spec §6, §7.A). Async, Supabase-backed. Reads prior-week snapshots + baselines;
 * the caller persists this week's metrics after a successful send.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import * as adapters from "./adapters";
import * as calc from "./calc";
import type { KrSignalClient } from "./config";
import {
  getGlobalPrior,
  getClientPrior,
  getBaseline,
  type GlobalSnapshot,
  type ClientWeekly,
} from "./store";
import { buildWeeklyReport, type WeeklyReportData, type VenueVol } from "./weeklyReport";

const VENUE_LABEL: Record<string, string> = {
  upbit: "Upbit", bithumb: "Bithumb", coinbase: "Coinbase", bybit: "Bybit",
  kraken: "Kraken", bitget: "Bitget", gate: "Gate",
};

export interface AssembledWeekly {
  data: WeeklyReportData;
  html: string;
  pending: string[];
  global: GlobalSnapshot;
  client: ClientWeekly;
  weekEnding: string;
  debug: Record<string, unknown>;
}

export async function assembleWeekly(
  supabase: SupabaseClient,
  cfg: KrSignalClient
): Promise<AssembledWeekly> {
  const pending: string[] = [];
  const weekEnding = isoWeekEnding();

  const [fx, usdtKrw, perVenue, kospi, futures, upbitKrw, bithumbKrw] = await Promise.all([
    adapters.getUsdKrw(),
    adapters.getUsdtKrw(),
    cfg.coingecko_id ? adapters.getPerVenueVolume(cfg.coingecko_id) : Promise.resolve({} as Record<string, number>),
    adapters.getKospi(),
    adapters.getFuturesTotalUsd(),
    adapters.getUpbitKrCexQuoteVolKrw(),
    adapters.getBithumbKrCexQuoteVolKrw(),
  ]);
  if (!cfg.coingecko_id) pending.push("By Venue + KR vol share — coingecko_id not set");

  const kimchi = calc.kimchiPremium(usdtKrw, fx);

  // By Venue + KR vol share (token volume, uniform CoinGecko source)
  const tracked = [...cfg.kr_venues, ...cfg.global_venues];
  const vols = tracked.map((v) => ({ v, usd: perVenue[v] || 0 })).filter((x) => x.usd > 0);
  const totalTok = vols.reduce((s, x) => s + x.usd, 0);
  const krTok = (perVenue["upbit"] || 0) + (perVenue["bithumb"] || 0);
  const krVolShare = totalTok ? krTok / totalTok : 0;
  const byVenue: VenueVol[] = vols
    .sort((a, b) => b.usd - a.usd)
    .map((x) => ({
      name: VENUE_LABEL[x.v] || x.v,
      usd: x.usd,
      pct: totalTok ? Math.round((x.usd / totalTok) * 100) : 0,
      isKR: cfg.kr_venues.includes(x.v),
    }));

  const krCexKrw = upbitKrw + bithumbKrw;
  const krCexUsd = krCexKrw / fx;

  // Trend (vs prior week) + regime (vs stored baseline)
  const db = cfg.thresholds?.trend_deadband ?? 0.05;
  const [fxPrior, krPrior, krVolPrior, fbBase, krBase] = await Promise.all([
    getGlobalPrior(supabase, "futures_total", weekEnding),
    getGlobalPrior(supabase, "kr_cex_vol", weekEnding),
    getClientPrior(supabase, cfg.id, "kr_token_vol_usd", weekEnding),
    getBaseline(supabase, "futures_total"),
    getBaseline(supabase, "kr_cex_vol"),
  ]);
  if (fxPrior == null || krPrior == null || krVolPrior == null)
    pending.push("trend arrows — no prior-week snapshot yet (flat until the 2nd weekly run persists state)");
  if (!fbBase || !krBase) pending.push("regime labels — baseline job not run yet (defaulting 'neutral')");

  const krVolArrow = krVolPrior != null ? calc.trendArrow(krTok, krVolPrior, db) : "⟷";
  const krVolPct = krVolPrior != null ? ((krTok - krVolPrior) / krVolPrior) * 100 : 0;
  const krVolTrend = krVolPrior != null ? calc.trend(krTok, krVolPrior, db) : "flat";

  const th = {
    hot: cfg.thresholds?.kimchi_hot ?? 0.03,
    positive: cfg.thresholds?.kimchi_positive ?? 0.01,
    flat: cfg.thresholds?.kimchi_flat ?? 0.01,
  };

  // SOV placeholder (§6.5) — cumulative content-piece growth WoW, NOT real
  // mindshare. Supported source ref: 'hhp:<clients.id uuid>' → count posted
  // contents across that HHP client's campaigns. Prior cumulative comes from
  // kr_signal_client_weekly.sov_pieces_cum (persisted after each send).
  let sovArrow: calc.Arrow = "⟷";
  let sovPct = 0;
  let sovPiecesCum: number | null = null;
  const hhpRef = /^hhp:([0-9a-f-]{36})$/i.exec(cfg.content_log_source ?? "");
  if (!cfg.content_log_source) {
    pending.push("KR share-of-voice line — content_log_source not set");
  } else if (!hhpRef) {
    pending.push(`KR share-of-voice line — unsupported content_log_source (use hhp:<client uuid>)`);
  } else {
    try {
      const { count } = await (supabase as any)
        .from("contents")
        .select("id, campaigns!inner(client_id)", { count: "exact", head: true })
        .eq("status", "posted")
        .eq("campaigns.client_id", hhpRef[1]);
      const cum = count ?? 0;
      sovPiecesCum = cum;
      const prevCum = await getClientPrior(supabase, cfg.id, "sov_pieces_cum", weekEnding);
      if (prevCum != null && prevCum > 0) {
        const g = calc.sovPlaceholder(cum, prevCum);
        sovPct = Math.round(g * 100);
        sovArrow = calc.trendArrow(cum, prevCum, db);
      } else {
        pending.push("KR share-of-voice trend — first run, no prior cumulative yet");
      }
    } catch {
      pending.push("KR share-of-voice line — content count query failed");
    }
  }

  // Peer rank (§6.4 / §7.A) — client KR-vol-share ranked against the
  // peer_basket (CoinGecko ids). Failed peer fetches drop out of the basket.
  let peerRank = 1;
  if (!cfg.peer_basket?.length) {
    pending.push("peer rank (#N in KR vol share) — peer_basket empty");
  } else {
    const peerResults = await Promise.allSettled(
      cfg.peer_basket.map((id) => adapters.getPerVenueVolume(id))
    );
    const peerShares: number[] = [];
    let failed = 0;
    for (const r of peerResults) {
      if (r.status !== "fulfilled") { failed++; continue; }
      const pv = r.value;
      const totals = tracked.map((v) => pv[v] || 0);
      const kr = (pv["upbit"] || 0) + (pv["bithumb"] || 0);
      const sum = totals.reduce((a, b) => a + b, 0);
      peerShares.push(sum > 0 ? kr / sum : 0);
    }
    peerRank = calc.krVolShareRank(krVolShare, peerShares);
    if (failed > 0) pending.push(`peer rank — ${failed} peer fetch(es) failed, ranked against the rest`);
  }

  const data: WeeklyReportData = {
    ticker: cfg.ticker,
    weekLabel: weekLabel(),
    krVolSharePct: Math.round(krVolShare * 100),
    krVol7dArrow: krVolArrow,
    krVol7dPct: Math.round(krVolPct),
    koreaReadLabel: calc.koreaReadLabel(kimchi, krVolTrend, th),
    byVenue,
    futuresTotalUsd: futures.total,
    futuresRegime: fbBase ? calc.regimeLabel(futures.total, fbBase.p33, fbBase.p66) : "neutral",
    futuresArrow: fxPrior != null ? calc.trendArrow(futures.total, fxPrior, db) : "⟷",
    krCexVolKrw: krCexKrw,
    krCexVolUsd: krCexUsd,
    krCexRegime: krBase ? calc.regimeLabel(krCexUsd, krBase.p33, krBase.p66) : "neutral",
    krCexArrow: krPrior != null ? calc.trendArrow(krCexUsd, krPrior, db) : "⟷",
    kospi: Math.round(kospi.level),
    kospiWoWPct: +kospi.wowPct.toFixed(1),
    kospiYtdPct: Math.round(kospi.ytdPct),
    kospiAtAth: kospi.atAth,
    fxUsdKrw: Math.round(fx),
    kimchiUsdtPct: +(kimchi * 100).toFixed(1),
    sovArrow,
    sovPct,
    peerRank,
  };

  const global: GlobalSnapshot = {
    futures_total: futures.total,
    kr_cex_vol: krCexUsd,
    kospi: kospi.level,
    fx_usdkrw: fx,
    kimchi_usdt: kimchi,
  };
  const client: ClientWeekly = {
    kr_token_vol_usd: krTok,
    kr_vol_share: krVolShare,
    by_venue: byVenue,
    // §6.5 — persist this week's cumulative so next week's SOV growth has a prior.
    sov_pieces_cum: sovPiecesCum,
  };

  return {
    data,
    html: buildWeeklyReport(data),
    pending,
    global,
    client,
    weekEnding,
    debug: { futuresByVenue: futures.byVenue, futuresMissing: futures.missing, krCexKrw },
  };
}

function weekLabel(): string {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 6);
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${M[start.getUTCMonth()]} ${start.getUTCDate()}–${now.getUTCDate()}`;
}

/** ISO date (YYYY-MM-DD) of the most recent Sunday, UTC. */
function isoWeekEnding(): string {
  const now = new Date();
  const dow = now.getUTCDay();
  const sunday = new Date(now);
  sunday.setUTCDate(now.getUTCDate() - dow);
  return sunday.toISOString().slice(0, 10);
}
