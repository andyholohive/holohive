import type { KolDeliverable } from './kolDeliverableService';
import type { KolChannelSnapshot } from './kolChannelSnapshotService';

/**
 * KOL composite-score engine — Phase 3 of the May 2026 KOL overhaul.
 *
 * Score is a 0-100 composite of five equally-weighted (20% each)
 * dimensions per the spec:
 *
 *   1. Engagement Quality   — views_24h / followers (deliverables)
 *   2. Reach Efficiency     — forwards / views (deliverables)
 *   3. Channel Health       — engagement_rate + posting_frequency (snapshots)
 *   4. Growth Trajectory    — month-over-month follower change (snapshots)
 *   5. Activation Impact    — activation_participants vs campaign avg (deliverables)
 *
 * Each raw dimension value is normalized 0-100 against the rest of the
 * roster (min-max scaling), then weighted + summed for the composite.
 *
 * Why client-side and not a Postgres view:
 *   - Normalization needs the entire population to compute min/max.
 *     Doable in SQL with window functions but harder to iterate on.
 *   - The team will tweak weights and add/remove dimensions over the
 *     next few months as patterns emerge ("Weights can be adjusted
 *     later once patterns emerge from logged campaigns" — spec).
 *     Pure TS is faster to change than a Postgres function.
 *   - At <500 KOLs the perf cost is negligible (~5ms total).
 *
 * "Insufficient data" gating per spec: minimum 3 logged deliverables
 * before any score generates. KOLs below threshold are returned with
 * `score = null` — UI shows "Insufficient data" instead of a number.
 */

// Tier bands from the spec.
export type ScoreTier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface TierStyle {
  tier: ScoreTier;
  label: string;
  /** Tailwind classes for the badge background + text. */
  classes: string;
}

const TIER_BANDS: ReadonlyArray<{ min: number; tier: ScoreTier; classes: string }> = [
  { min: 85, tier: 'S', classes: 'bg-amber-100 text-amber-800 border border-amber-300' },     // Gold
  { min: 70, tier: 'A', classes: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },// Green
  { min: 50, tier: 'B', classes: 'bg-blue-100 text-blue-800 border border-blue-300' },         // Blue
  { min: 30, tier: 'C', classes: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },   // Yellow
  { min: 0,  tier: 'D', classes: 'bg-red-100 text-red-800 border border-red-300' },            // Red
];

export function tierForScore(score: number): TierStyle {
  for (const band of TIER_BANDS) {
    if (score >= band.min) {
      return { tier: band.tier, label: band.tier, classes: band.classes };
    }
  }
  return { tier: 'D', label: 'D', classes: TIER_BANDS[TIER_BANDS.length - 1].classes };
}

// ────────────────────── Per-KOL raw aggregation ──────────────────────

/**
 * Per-dimension raw values for one KOL. Any can be null if the KOL
 * doesn't have the data — the normalizer handles nulls by ranking
 * them at the bottom for that dimension.
 */
interface RawDimensions {
  engagement_quality: number | null;   // avg(views_24h / latest_followers) across deliverables
  reach_efficiency: number | null;     // avg(forwards / views_24h) across deliverables
  channel_health: number | null;       // (engagement_rate * 100) + posting_frequency, latest snapshot
  growth_trajectory: number | null;    // pct change in followers, latest two snapshots
  activation_impact: number | null;    // avg(activation_participants) across deliverables
}

const MIN_DELIVERABLES_FOR_SCORE = 3;

/**
 * Compute the raw (un-normalized) per-dimension values for one KOL
 * from their deliverables + snapshots. Returns null per dimension if
 * the source data is missing — normalization will treat that as
 * worst-bucket for that dimension.
 *
 * The "latest_followers" used by Engagement Quality comes from the
 * newest snapshot for the KOL. Without a snapshot we can't compute
 * the ratio so it's null.
 */
function computeRawDimensions(
  deliverables: KolDeliverable[],
  snapshots: KolChannelSnapshot[],
): RawDimensions {
  const sortedSnapshots = [...snapshots].sort((a, b) =>
    a.snapshot_date < b.snapshot_date ? 1 : -1,
  );
  const latest = sortedSnapshots[0] || null;
  const previous = sortedSnapshots[1] || null;
  const latestFollowers = latest?.follower_count || null;

  // Engagement Quality: views_24h / followers, averaged across rows
  // that have both. Null if no deliverable has views_24h or no
  // snapshot exists.
  let eqSum = 0;
  let eqCount = 0;
  if (latestFollowers && latestFollowers > 0) {
    for (const d of deliverables) {
      if (d.views_24h != null) {
        eqSum += d.views_24h / latestFollowers;
        eqCount++;
      }
    }
  }
  const engagement_quality = eqCount > 0 ? eqSum / eqCount : null;

  // Reach Efficiency: forwards / views_24h, averaged. Null if no
  // deliverable has both.
  let reSum = 0;
  let reCount = 0;
  for (const d of deliverables) {
    if (d.forwards != null && d.views_24h != null && d.views_24h > 0) {
      reSum += d.forwards / d.views_24h;
      reCount++;
    }
  }
  const reach_efficiency = reCount > 0 ? reSum / reCount : null;

  // Channel Health: spec says "engagement_rate + posting_frequency".
  // engagement_rate = avg_views / followers (capped at 1 → 100 in
  // pct space so it's comparable to posting_frequency which is in
  // posts/week scale ~= 0-30). Sum them so both contribute.
  let channel_health: number | null = null;
  if (latest) {
    const erComponent =
      latest.avg_views_per_post != null && latest.follower_count > 0
        ? (latest.avg_views_per_post / latest.follower_count) * 100
        : null;
    const pfComponent = latest.posting_frequency != null ? Number(latest.posting_frequency) : null;
    if (erComponent != null || pfComponent != null) {
      channel_health = (erComponent ?? 0) + (pfComponent ?? 0);
    }
  }

  // Growth Trajectory: pct change between latest two snapshots. Need
  // two snapshots and a non-zero previous to avoid div/0.
  let growth_trajectory: number | null = null;
  if (latest && previous && previous.follower_count > 0) {
    growth_trajectory = ((latest.follower_count - previous.follower_count) / previous.follower_count) * 100;
  }

  // Activation Impact: spec says "vs campaign avg" but we don't have
  // a notion of "campaign avg" without joining. v1: use the raw
  // average; the normalization step compares KOLs to each other
  // anyway, which captures the same idea. Refine later if needed.
  let aiSum = 0;
  let aiCount = 0;
  for (const d of deliverables) {
    if (d.activation_participants != null) {
      aiSum += d.activation_participants;
      aiCount++;
    }
  }
  const activation_impact = aiCount > 0 ? aiSum / aiCount : null;

  return {
    engagement_quality,
    reach_efficiency,
    channel_health,
    growth_trajectory,
    activation_impact,
  };
}

// ────────────────────── Roster-wide normalization ──────────────────────

/**
 * Min-max normalize a value to 0-100 against the full roster's range
 * for that dimension. Null inputs map to 0 (worst-bucket per spec).
 *
 * Edge case: if every KOL has the same value (range = 0), we return
 * 50 for everyone — neutral middle. Avoids dividing by zero and
 * avoids artificially crowning all-tied KOLs at 100.
 */
function normalize(value: number | null, min: number, max: number): number {
  if (value == null) return 0;
  if (max === min) return 50;
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

interface DimensionRange {
  min: number;
  max: number;
}

function rangeOf(values: Array<number | null>): DimensionRange {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return { min: 0, max: 0 };
  return {
    min: Math.min(...present),
    max: Math.max(...present),
  };
}

// ────────────────────── Public API ──────────────────────

export interface KolScoreInput {
  kol_id: string;
  deliverables: KolDeliverable[];
  snapshots: KolChannelSnapshot[];
}

export interface KolScoreResult {
  kol_id: string;
  /** Final composite 0-100, or null when below the deliverables threshold. */
  score: number | null;
  /** Why score is null — for UI tooltip ("Insufficient data" etc). */
  reason: string | null;
  /** Per-dimension breakdown (normalized 0-100) for transparency. */
  dimensions: {
    engagement_quality: number | null;
    reach_efficiency: number | null;
    channel_health: number | null;
    growth_trajectory: number | null;
    activation_impact: number | null;
  };
}

/**
 * Compute scores for every KOL in the roster. Single-pass, with
 * roster-wide normalization in the middle.
 *
 * Caller pre-fetches deliverables + snapshots in bulk and passes one
 * entry per KOL. KOLs without enough deliverables get score=null with
 * a "reason" string for the UI to surface.
 */
export function computeRosterScores(roster: KolScoreInput[]): Map<string, KolScoreResult> {
  // Step 1: per-KOL raw dimensions.
  const rawByKol = new Map<string, RawDimensions>();
  for (const k of roster) {
    rawByKol.set(k.kol_id, computeRawDimensions(k.deliverables, k.snapshots));
  }

  // Step 2: ranges for normalization, computed across the whole
  // roster. We deliberately INCLUDE KOLs below the deliverables
  // threshold in the range calc — excluding them would shift the
  // normalization basis every time the threshold tripped, making
  // scores volatile.
  const allEq: Array<number | null> = [];
  const allRe: Array<number | null> = [];
  const allCh: Array<number | null> = [];
  const allGt: Array<number | null> = [];
  const allAi: Array<number | null> = [];
  for (const raw of Array.from(rawByKol.values())) {
    allEq.push(raw.engagement_quality);
    allRe.push(raw.reach_efficiency);
    allCh.push(raw.channel_health);
    allGt.push(raw.growth_trajectory);
    allAi.push(raw.activation_impact);
  }
  const ranges = {
    engagement_quality: rangeOf(allEq),
    reach_efficiency: rangeOf(allRe),
    channel_health: rangeOf(allCh),
    growth_trajectory: rangeOf(allGt),
    activation_impact: rangeOf(allAi),
  };

  // Step 3: per-KOL normalized + composite + threshold gate.
  const out = new Map<string, KolScoreResult>();
  for (const k of roster) {
    const raw = rawByKol.get(k.kol_id)!;

    const normalized = {
      engagement_quality: normalize(raw.engagement_quality, ranges.engagement_quality.min, ranges.engagement_quality.max),
      reach_efficiency: normalize(raw.reach_efficiency, ranges.reach_efficiency.min, ranges.reach_efficiency.max),
      channel_health: normalize(raw.channel_health, ranges.channel_health.min, ranges.channel_health.max),
      growth_trajectory: normalize(raw.growth_trajectory, ranges.growth_trajectory.min, ranges.growth_trajectory.max),
      activation_impact: normalize(raw.activation_impact, ranges.activation_impact.min, ranges.activation_impact.max),
    };

    const composite =
      normalized.engagement_quality * 0.2 +
      normalized.reach_efficiency * 0.2 +
      normalized.channel_health * 0.2 +
      normalized.growth_trajectory * 0.2 +
      normalized.activation_impact * 0.2;

    // Threshold gate per spec: minimum 3 deliverables.
    const deliverableCount = k.deliverables.length;
    const belowThreshold = deliverableCount < MIN_DELIVERABLES_FOR_SCORE;

    out.set(k.kol_id, {
      kol_id: k.kol_id,
      score: belowThreshold ? null : Math.round(composite),
      reason: belowThreshold
        ? `Insufficient data — needs ${MIN_DELIVERABLES_FOR_SCORE - deliverableCount} more deliverable${
            MIN_DELIVERABLES_FOR_SCORE - deliverableCount === 1 ? '' : 's'
          }.`
        : null,
      dimensions: {
        engagement_quality: belowThreshold ? null : Math.round(normalized.engagement_quality),
        reach_efficiency: belowThreshold ? null : Math.round(normalized.reach_efficiency),
        channel_health: belowThreshold ? null : Math.round(normalized.channel_health),
        growth_trajectory: belowThreshold ? null : Math.round(normalized.growth_trajectory),
        activation_impact: belowThreshold ? null : Math.round(normalized.activation_impact),
      },
    });
  }

  return out;
}
