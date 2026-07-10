/**
 * KR Signal Bot — Supabase-backed state store (spec §5, §6.1).
 * Replaces the standalone repo's local-JSON store. Holds:
 *   - global market-wide weekly snapshots (futures_total, kr_cex_vol, kospi, fx, kimchi)
 *   - per-client weekly token metrics (kr_token_vol_usd, kr_vol_share, by_venue)
 *   - full-cycle baselines (p33/p66) for regime labels
 *
 * Prior-week lookups exclude the current week key so a same-week re-run can't
 * read its own snapshot as "prior" (which would force trend arrows flat).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { percentile } from "./calc";

// ─── Global market-wide snapshots ─────────────────────────────────────────
export interface GlobalSnapshot {
  futures_total: number;
  kr_cex_vol: number;
  kospi: number;
  fx_usdkrw: number;
  kimchi_usdt: number;
}

/** Most recent global value for a metric strictly before `beforeWeek`, or null. */
export async function getGlobalPrior(
  supabase: SupabaseClient,
  metric: keyof GlobalSnapshot,
  beforeWeek: string
): Promise<number | null> {
  const { data } = await supabase
    .from("kr_signal_weekly_snapshots")
    .select(`week_ending, ${metric}`)
    .lt("week_ending", beforeWeek)
    .order("week_ending", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = (data as any)?.[metric];
  return typeof v === "number" ? v : null;
}

/** Persist this week's global market snapshot (upsert on week_ending). */
export async function saveGlobalWeekly(
  supabase: SupabaseClient,
  weekEnding: string,
  snap: GlobalSnapshot
): Promise<void> {
  const { error } = await supabase
    .from("kr_signal_weekly_snapshots")
    .upsert({ week_ending: weekEnding, ...snap }, { onConflict: "week_ending" });
  if (error) throw new Error(`saveGlobalWeekly: ${error.message}`);
}

/** All persisted values for a global metric, oldest→newest (for the §5 baseline job). */
export async function getGlobalSeries(
  supabase: SupabaseClient,
  metric: keyof GlobalSnapshot
): Promise<number[]> {
  const { data } = await supabase
    .from("kr_signal_weekly_snapshots")
    .select(`week_ending, ${metric}`)
    .order("week_ending", { ascending: true });
  return ((data ?? []) as any[]).map((r) => r[metric]).filter((v) => typeof v === "number");
}

// ─── Per-client weekly ────────────────────────────────────────────────────
export interface ClientWeekly {
  kr_token_vol_usd: number;
  kr_vol_share: number;
  by_venue: unknown;
  sov_pieces_cum?: number | null;
}

/** Most recent per-client value for a metric strictly before `beforeWeek`, or null. */
export async function getClientPrior(
  supabase: SupabaseClient,
  clientId: string,
  metric: "kr_token_vol_usd" | "kr_vol_share" | "sov_pieces_cum",
  beforeWeek: string
): Promise<number | null> {
  const { data } = await supabase
    .from("kr_signal_client_weekly")
    .select(`week_ending, ${metric}`)
    .eq("client_id", clientId)
    .lt("week_ending", beforeWeek)
    .order("week_ending", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = (data as any)?.[metric];
  return typeof v === "number" ? v : null;
}

/** Persist this week's per-client token metrics (upsert on client_id+week_ending). */
export async function saveClientWeekly(
  supabase: SupabaseClient,
  clientId: string,
  weekEnding: string,
  vals: ClientWeekly
): Promise<void> {
  const { error } = await supabase
    .from("kr_signal_client_weekly")
    .upsert({ client_id: clientId, week_ending: weekEnding, ...vals }, { onConflict: "client_id,week_ending" });
  if (error) throw new Error(`saveClientWeekly: ${error.message}`);
}

// ─── Baselines (§5) ───────────────────────────────────────────────────────
export interface Baseline { p33: number; p66: number; provisional: boolean }

export async function getBaseline(supabase: SupabaseClient, metric: string): Promise<Baseline | null> {
  const { data } = await supabase
    .from("kr_signal_baselines")
    .select("p33, p66, provisional")
    .eq("metric", metric)
    .maybeSingle();
  return (data as Baseline) ?? null;
}

export async function saveBaseline(
  supabase: SupabaseClient,
  metric: string,
  p33: number,
  p66: number,
  provisional: boolean
): Promise<void> {
  const { error } = await supabase
    .from("kr_signal_baselines")
    .upsert({ metric, p33, p66, provisional, updated_at: new Date().toISOString() }, { onConflict: "metric" });
  if (error) throw new Error(`saveBaseline: ${error.message}`);
}

const BASELINE_METRICS: (keyof GlobalSnapshot)[] = ["futures_total", "kr_cex_vol"];
const MIN_WEEKS_FOR_REAL_BASELINE = 8;

export interface BaselineResult { metric: string; p33: number; p66: number; weeks: number; provisional: boolean; skipped?: boolean }

/**
 * §5 baseline refresh — recompute p33/p66 for the market-wide metrics from the
 * accumulated global weekly series. With < 8 weeks and `seed`, write provisional
 * ±15% bands around the latest reading so regime labels render before a real
 * backfill exists (§10 open item).
 */
export async function refreshBaselines(
  supabase: SupabaseClient,
  opts: { seed?: boolean } = {}
): Promise<BaselineResult[]> {
  const out: BaselineResult[] = [];
  for (const metric of BASELINE_METRICS) {
    const series = await getGlobalSeries(supabase, metric);
    if (series.length >= MIN_WEEKS_FOR_REAL_BASELINE) {
      const p33 = percentile(series, 0.33);
      const p66 = percentile(series, 0.66);
      await saveBaseline(supabase, metric, p33, p66, false);
      out.push({ metric, p33, p66, weeks: series.length, provisional: false });
    } else if (opts.seed && series.length >= 1) {
      const latest = series[series.length - 1];
      const p33 = latest * 0.85;
      const p66 = latest * 1.15;
      await saveBaseline(supabase, metric, p33, p66, true);
      out.push({ metric, p33, p66, weeks: series.length, provisional: true });
    } else {
      out.push({ metric, p33: NaN, p66: NaN, weeks: series.length, provisional: false, skipped: true });
    }
  }
  return out;
}
