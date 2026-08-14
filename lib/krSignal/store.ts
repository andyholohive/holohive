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
  /** Window kr_token_vol_usd was measured over ("24h" | "Nd" | "7d"). Lets the
   *  WoW math refuse to compare across a window change (e.g. 7d-vs-24h ramp-up). */
  kr_token_vol_window?: string | null;
  /** [2026-08-03] The exact Telegram HTML that went out this week.
   *
   *  Stored because the report CANNOT be reconstructed from the other columns:
   *  they hold 12 raw metrics, while WeeklyReportData needs ~25 — kospiYtdPct,
   *  kospiAtAth, peerRank and every arrow/regime/koreaReadLabel are derived at
   *  send time from live adapter calls and then discarded. Re-rendering later
   *  would invent the missing half and label it history.
   *
   *  Null for the weeks sent before this column existed. */
  report_html?: string | null;
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
    // [2026-08-14] Delivered weeks only. Rows now persist at GENERATION time,
    // so a report that was skipped (or is still awaiting approval) would
    // otherwise become the baseline for next week's "vs last week" — printing
    // a comparison against a week the client never saw.
    .eq("status", "sent")
    .lt("week_ending", beforeWeek)
    .order("week_ending", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = (data as any)?.[metric];
  return typeof v === "number" ? v : null;
}

/** Most recent per-client KR-token volume + the window it was measured over,
 *  strictly before `beforeWeek`. The window lets the caller refuse a WoW
 *  comparison when this week's window differs (a 7d sum vs a stored 24h/partial
 *  reading during ramp-up would otherwise print a garbage +X%). */
export async function getClientKrVolPrior(
  supabase: SupabaseClient,
  clientId: string,
  beforeWeek: string
): Promise<{ value: number; window: string | null } | null> {
  const { data } = await supabase
    .from("kr_signal_client_weekly")
    .select("week_ending, kr_token_vol_usd, kr_token_vol_window")
    .eq("client_id", clientId)
    .eq("status", "sent")   // delivered weeks only — see getClientPrior
    .lt("week_ending", beforeWeek)
    .order("week_ending", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = (data as any)?.kr_token_vol_usd;
  if (typeof v !== "number") return null;
  return { value: v, window: (data as any)?.kr_token_vol_window ?? null };
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

// ─── Weekly review queue ──────────────────────────────────────────────────
//
// A weekly report is now written the day BEFORE it can go out, in
// `pending_review`, and only reaches the client when someone approves it.
// These helpers are the whole state machine; the crons, the webhook and the
// in-app editor all go through them so the transitions can't drift apart.

export type WeeklyReviewStatus = "pending_review" | "approved" | "sent" | "skipped";

export interface WeeklyReviewRow {
  id: string;
  client_id: string;
  week_ending: string;
  status: WeeklyReviewStatus;
  report_html: string | null;
  edited_html: string | null;
  preflight: { ok: boolean; chat_id?: string | null; title?: string | null; error?: string } | null;
  review_chat_id: string | null;
  review_message_id: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  sent_at: string | null;
}

const REVIEW_COLUMNS =
  "id, client_id, week_ending, status, report_html, edited_html, preflight, review_chat_id, review_message_id, approved_by_name, approved_at, sent_at";

/** Park a freshly-generated report for review. Upsert so re-running the
 *  generate cron in the same week refreshes the numbers rather than
 *  duplicating the row — but never clobbers a decision already made. */
export async function saveWeeklyForReview(
  supabase: SupabaseClient,
  clientId: string,
  weekEnding: string,
  vals: ClientWeekly & {
    preflight: WeeklyReviewRow["preflight"];
  }
): Promise<WeeklyReviewRow | null> {
  const { data: existing } = await supabase
    .from("kr_signal_client_weekly")
    .select("status")
    .eq("client_id", clientId)
    .eq("week_ending", weekEnding)
    .maybeSingle();

  // Re-generating over a sent or skipped week would resurrect a decided
  // report as pending. Refresh nothing; the decision stands.
  if (existing && (existing as any).status !== "pending_review") return null;

  const { data, error } = await supabase
    .from("kr_signal_client_weekly")
    .upsert(
      {
        client_id: clientId,
        week_ending: weekEnding,
        status: "pending_review",
        // Re-generating replaces the numbers, so any edit made against the
        // PREVIOUS render is now attached to a report that no longer exists.
        // Dropping it is the safe direction: the operator re-edits fresh copy
        // instead of silently shipping last run's wording over new figures.
        edited_html: null,
        edited_at: null,
        ...vals,
      },
      { onConflict: "client_id,week_ending" }
    )
    .select(REVIEW_COLUMNS)
    .single();
  if (error) throw new Error(`saveWeeklyForReview: ${error.message}`);
  return data as unknown as WeeklyReviewRow;
}

/** Everything still waiting on a human, oldest week first. */
export async function listWeekliesAwaitingReview(
  supabase: SupabaseClient,
  clientId?: string
): Promise<WeeklyReviewRow[]> {
  let q = supabase
    .from("kr_signal_client_weekly")
    .select(REVIEW_COLUMNS)
    .in("status", ["pending_review", "approved"])
    .order("week_ending", { ascending: true });
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw new Error(`listWeekliesAwaitingReview: ${error.message}`);
  return (data ?? []) as unknown as WeeklyReviewRow[];
}

export async function getWeeklyReviewById(
  supabase: SupabaseClient,
  id: string
): Promise<WeeklyReviewRow | null> {
  const { data } = await supabase
    .from("kr_signal_client_weekly")
    .select(REVIEW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as WeeklyReviewRow) ?? null;
}

/** Store the operator's edited copy. Stays pending — editing is not approving,
 *  so a typo fix can't accidentally ship the report. */
export async function saveWeeklyEdit(
  supabase: SupabaseClient,
  id: string,
  editedHtml: string
): Promise<void> {
  const { error } = await supabase
    .from("kr_signal_client_weekly")
    .update({ edited_html: editedHtml, edited_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_review");
  if (error) throw new Error(`saveWeeklyEdit: ${error.message}`);
}

/** Record the delivery. `approved_by` is nullable on purpose: approval can come
 *  from the ops chat, where the actor is a Telegram user we may not be able to
 *  map to a HHP account — the name is always kept so the audit line reads. */
export async function markWeeklySent(
  supabase: SupabaseClient,
  id: string,
  opts: { messageId: number; byName: string | null; byUserId?: string | null }
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("kr_signal_client_weekly")
    .update({
      status: "sent",
      sent_at: now,
      sent_message_id: opts.messageId,
      approved_at: now,
      approved_by_name: opts.byName,
      approved_by: opts.byUserId ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(`markWeeklySent: ${error.message}`);
}

export async function markWeeklySkipped(
  supabase: SupabaseClient,
  id: string,
  byName: string | null
): Promise<void> {
  const { error } = await supabase
    .from("kr_signal_client_weekly")
    .update({ status: "skipped", approved_at: new Date().toISOString(), approved_by_name: byName })
    .eq("id", id);
  if (error) throw new Error(`markWeeklySkipped: ${error.message}`);
}

/** Remember where the review card was posted so approve/skip can edit it in
 *  place instead of leaving a live button on a decided report. */
export async function attachReviewCard(
  supabase: SupabaseClient,
  id: string,
  chatId: string,
  messageId: number
): Promise<void> {
  await supabase
    .from("kr_signal_client_weekly")
    .update({ review_chat_id: chatId, review_message_id: messageId })
    .eq("id", id);
}
