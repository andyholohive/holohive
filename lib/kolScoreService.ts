/**
 * KOL Score service — implements Jdot's TG Addendum (18 June 2026)
 * two-score model + blend rule.
 *
 *   Channel Score (4 dims, Round 2 per Jdot 2026-07-10) = POTENTIAL:
 *     Average Views    35%  = avg organic views per post (RAW — the one
 *                             dimension where a big channel earns its
 *                             reach; ranked vs the WHOLE roster)
 *     Engagement Rate  35%  = (reactions + replies + forwards) / views
 *                             (absorbs old Reach Efficiency + Discussion;
 *                             ranked within follower bands)
 *     Channel Health   15%  = avg(rank(engagement_rate), rank(posting_freq))
 *     Growth Trajectory 15% = follower_growth_pct, floor neg at 0
 *     Rate dims rank within follower bands (<5K / 5–20K / 20K+); then the
 *     weighted blend is RE-RANKED across the roster so the top KOL sits
 *     near 100 (averaging ranks alone caps everyone ~70).
 *
 *   Activation Score (Round 2) = PROVEN. One dimension: participants
 *   driven, percentiled WITHIN each campaign (not vs the mean, which big
 *   drivers drag up), averaged across campaigns, then re-ranked across
 *   the activated pool. No logged participants → null, renders "—".
 *
 *   Display: NO BLEND. Two scores side by side ("72 / 88"). Channel =
 *   how good they are; Activation = how well they delivered.
 *
 *   Rule across the model: rank everything, log nothing.
 *
 *   Tier (from the Channel Score — the score everyone has):
 *     S 85+ · A 70-84 · B 50-69 · C 30-49 · D <30
 *
 * All raw dimension outputs are RANK-normalized to 0-100 (percentile
 * position in the comparison pool) per Jdot's 2026-07-10 amendment —
 * min-max let one freak channel peg 100 and crush everyone into the
 * teens; rank puts the middle of the pack at ~50. Comparison pools:
 * whole roster for Average Views, follower band for the rate dims,
 * activated pool for Campaign dims. X-only/test accounts (no TG
 * snapshot) carry null raws and drop out of every pool automatically.
 *
 * Pure compute — no DB calls. Pass in arrays of SnapshotInput +
 * DeliverableInput + master KOL list; get a Map<kol_id, ScoreResult>
 * back. The fetcher (`assembleScoreInputs`) lives at the bottom of the
 * file and is the one place that hits Supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ─── Types ─────────────────────────────────────────────────────────────

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

/** Round 2 (Jdot 2026-07-10): 4 dimensions, and `composite` is the FINAL
 *  Channel Score — the weighted pre-blend re-ranked across the roster so
 *  the top KOL sits near 100 (averaging ranks alone caps everyone ~70). */
export interface ChannelScoreBreakdown {
  averageViews: number;
  /** (reactions + replies + forwards) / views — absorbs the old Reach
   *  Efficiency + Discussion Engagement. null = no views data. */
  engagementRate: number | null;
  channelHealth: number;
  growthTrajectory: number | null;
  /** FINAL Channel Score: rank of the weighted blend across the roster. */
  composite: number;
}

/** Round 2: Campaign Performance → Activation Score. One thing only —
 *  participants driven, percentiled WITHIN each campaign then averaged,
 *  then the final number re-ranked across the activated pool. */
export interface ActivationScoreBreakdown {
  /** Avg of per-campaign participant percentiles (pre final rank). */
  activationImpact: number;
  /** FINAL Activation Score: rank across the activated pool. */
  composite: number;
  deliverableCount: number;
  campaignsCounted: number;
}

/** Round 2: NO BLEND. Two scores side by side — Channel = potential
 *  (everyone has one), Activation = proven (null renders as "—"). */
export interface DisplayScores {
  channel: number;
  activation: number | null;
  /** Tier from the Channel Score — the score everyone has. */
  tier: Tier;
  activated: boolean;
  /** From the latest snapshot's low_organic_volume_flag — low-confidence marker. */
  lowConfidence: boolean;
}

export interface ScoreResult {
  channel: ChannelScoreBreakdown;
  activation: ActivationScoreBreakdown | null;
  scores: DisplayScores;
}

export interface SnapshotInput {
  kol_id: string;
  snapshot_date: string;
  follower_count: number | null;
  avg_views_per_post: number | null;
  avg_forwards_per_post: number | null;
  avg_reactions_per_post: number | null;
  avg_replies_per_post: number | null;
  engagement_rate: number | null;
  posting_frequency: number | null;
  follower_growth_pct: number | null;
  low_organic_volume_flag: boolean | null;
}

export interface DeliverableInput {
  kol_id: string;
  campaign_id: string;
  date_posted: string | null;
  views_48h: number | null;
  forwards: number | null;
  activation_participants: number | null;
}

// ─── Dimension weights ────────────────────────────────────────────────

// Round 2 weights: Average Views + combined Engagement Rate carry 70%.
const CHANNEL_WEIGHTS = {
  averageViews: 0.35,
  engagementRate: 0.35,
  channelHealth: 0.15,
  growthTrajectory: 0.15,
} as const;

// ─── Math helpers ──────────────────────────────────────────────────────

/**
 * Rank-normalize a value into 0–100 against a population (Jdot 2026-07-10
 * amendment). Score = midrank percentile: where the KOL sits in the pool,
 * ties averaged. Replaces min-max, where one freak channel pegged 100 and
 * dropped everyone else into the teens — rank pulls the median to ~50.
 * Population values of `null`/`undefined` are dropped; a pool of one
 * collapses to 50 (neutral).
 */
function rankNormalize(value: number, population: ReadonlyArray<number | null | undefined>): number {
  const nums = population.filter((n): n is number => n != null && isFinite(n));
  if (nums.length <= 1) return 50;
  let below = 0;
  let equal = 0;
  for (const n of nums) {
    if (n < value) below++;
    else if (n === value) equal++;
  }
  // Midrank percentile over n values → median lands at 50, best near 100.
  const pct = ((below + (equal + 1) / 2 - 0.5) / nums.length) * 100;
  return clamp(pct, 0, 100);
}

/** Follower band for the rate dimensions (Jdot 2026-07-10): small channels
 *  rank against small so strong engagement on 3K isn't buried under 60K.
 *  Coarse on purpose — each band needs enough KOLs to rank against.
 *  Unknown follower counts fall into the small band. */
type FollowerBand = 'small' | 'mid' | 'big';
function bandFor(followers: number | null | undefined): FollowerBand {
  if (followers == null || followers < 5_000) return 'small';
  if (followers < 20_000) return 'mid';
  return 'big';
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }

/** Safe division — returns null when denominator is 0 or either operand is missing. */
function safeDiv(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

// ─── Raw dimension extractors (per-KOL, pre-normalization) ─────────────

interface ChannelRawDims {
  averageViewsRaw: number | null;
  engagementRateRaw: number | null;
  channelHealthRaw_ER: number | null;
  channelHealthRaw_Freq: number | null;
  growthTrajectoryRaw: number | null;
}

function extractChannelRaw(snap: SnapshotInput | undefined): ChannelRawDims {
  if (!snap) {
    return {
      averageViewsRaw: null, engagementRateRaw: null,
      channelHealthRaw_ER: null, channelHealthRaw_Freq: null, growthTrajectoryRaw: null,
    };
  }
  // Round 2: combined Engagement Rate absorbs the old Reach Efficiency
  // (forwards÷views double-counted views, tiny + noisy, fought Average
  // Views) and Discussion Engagement.
  const interactions =
    (snap.avg_reactions_per_post ?? 0) + (snap.avg_replies_per_post ?? 0) + (snap.avg_forwards_per_post ?? 0);
  return {
    // "Average Views" — raw avg views per post, NOT ÷followers. The one
    // dimension where a big channel earns its reach.
    averageViewsRaw: snap.avg_views_per_post ?? null,
    engagementRateRaw: safeDiv(interactions, snap.avg_views_per_post),
    channelHealthRaw_ER: snap.engagement_rate,
    channelHealthRaw_Freq: snap.posting_frequency,
    growthTrajectoryRaw: snap.follower_growth_pct == null
      ? null
      : Math.max(0, snap.follower_growth_pct),  // floor negatives at 0 per Jdot Q12
  };
}

// ─── Channel Score composite (with renormalize) ────────────────────────

/** Weighted 4-dim blend BEFORE the final re-rank. Missing dims (no views
 *  → no engagement rate; month-1 → no growth) drop out and the remaining
 *  weights rescale to 1 (Jdot Q2 + Q4 renormalization rule). */
function computeChannelPreBlend(
  normalized: {
    averageViews: number;
    engagementRate: number | null;
    channelHealth: number;
    growthTrajectory: number | null;
  }
): number {
  let weighted = 0;
  let totalWeight = 0;

  weighted += normalized.averageViews * CHANNEL_WEIGHTS.averageViews;
  totalWeight += CHANNEL_WEIGHTS.averageViews;

  if (normalized.engagementRate != null) {
    weighted += normalized.engagementRate * CHANNEL_WEIGHTS.engagementRate;
    totalWeight += CHANNEL_WEIGHTS.engagementRate;
  }

  weighted += normalized.channelHealth * CHANNEL_WEIGHTS.channelHealth;
  totalWeight += CHANNEL_WEIGHTS.channelHealth;

  if (normalized.growthTrajectory != null) {
    weighted += normalized.growthTrajectory * CHANNEL_WEIGHTS.growthTrajectory;
    totalWeight += CHANNEL_WEIGHTS.growthTrajectory;
  }

  if (totalWeight === 0) return 0;
  return weighted / totalWeight;
}

// ─── Activation Score (Round 2: participants only) ────────────────────
// Sponsored Engagement Lift + Sponsored Reach dropped entirely — driving
// real people is the only thing sponsored data tells us that the channel
// score can't already see. Participants are percentiled WITHIN each
// campaign (not vs the campaign mean, which the big drivers drag up so
// everyone else lands below it), then averaged across the KOL's campaigns.

/** This KOL's participants summed per campaign. Only deliverables with
 *  activation_participants logged count — no logging, no score. */
function participantsPerCampaign(deliverables: DeliverableInput[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of deliverables) {
    if (d.activation_participants == null) continue;
    m.set(d.campaign_id, (m.get(d.campaign_id) ?? 0) + d.activation_participants);
  }
  return m;
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

// ─── Tier ──────────────────────────────────────────────────────────────

function tierFor(displayedScore: number): Tier {
  if (displayedScore >= 85) return 'S';
  if (displayedScore >= 70) return 'A';
  if (displayedScore >= 50) return 'B';
  if (displayedScore >= 30) return 'C';
  return 'D';
}

// ─── Orchestrator ──────────────────────────────────────────────────────

export interface ComputeInputs {
  /** Latest snapshot per KOL — what feeds Channel Score raw dims. */
  latestSnapshotByKol: Map<string, SnapshotInput>;
  /** All historical snapshots per KOL — used by Engagement Lift's
   *  closest-prior-snapshot lookup. */
  allSnapshotsByKol: Map<string, SnapshotInput[]>;
  /** All logged deliverables, grouped by KOL. */
  deliverablesByKol: Map<string, DeliverableInput[]>;
  /** Campaign → avg participants across all KOLs on that campaign.
   *  Used as the Activation Impact denominator per Jdot Q5. */
  campaignAvgParticipants: Map<string, number>;
  /** The roster — every KOL we want a score for. */
  kolIds: string[];
}

export function computeKolScores(inputs: ComputeInputs): Map<string, ScoreResult> {
  const { latestSnapshotByKol, allSnapshotsByKol, deliverablesByKol, campaignAvgParticipants, kolIds } = inputs;

  // Pass 1: raw channel dims per KOL + per-campaign participant sums.
  const channelRawByKol = new Map<string, ChannelRawDims>();
  const participantsByKol = new Map<string, Map<string, number>>();
  for (const kolId of kolIds) {
    channelRawByKol.set(kolId, extractChannelRaw(latestSnapshotByKol.get(kolId)));
    participantsByKol.set(kolId, participantsPerCampaign(deliverablesByKol.get(kolId) ?? []));
  }

  // Pass 2: comparison pools (rank normalization, Jdot Round 2).
  // Average Views ranks vs the WHOLE roster; the rate dims rank within
  // follower bands (<5K / 5–20K / 20K+). X-only/test accounts have no TG
  // snapshot → null raws → excluded from every pool automatically.
  const bandByKol = new Map<string, FollowerBand>();
  for (const kolId of kolIds) {
    bandByKol.set(kolId, bandFor(latestSnapshotByKol.get(kolId)?.follower_count));
  }
  const idsInBand = (b: FollowerBand) => kolIds.filter(id => bandByKol.get(id) === b);
  const bandPop = (b: FollowerBand) => {
    const ids = idsInBand(b);
    return {
      er: ids.map(id => channelRawByKol.get(id)?.engagementRateRaw),
      ch_er: ids.map(id => channelRawByKol.get(id)?.channelHealthRaw_ER),
      ch_freq: ids.map(id => channelRawByKol.get(id)?.channelHealthRaw_Freq),
      gt: ids.map(id => channelRawByKol.get(id)?.growthTrajectoryRaw),
    };
  };
  const ratePops: Record<FollowerBand, ReturnType<typeof bandPop>> = {
    small: bandPop('small'),
    mid: bandPop('mid'),
    big: bandPop('big'),
  };
  const avgViewsPop = kolIds.map(id => channelRawByKol.get(id)?.averageViewsRaw);

  // Activation pools: every KOL's participant total WITHIN each campaign.
  const campaignPools = new Map<string, number[]>();
  for (const perCamp of participantsByKol.values()) {
    for (const [campaignId, total] of perCamp) {
      const arr = campaignPools.get(campaignId) ?? [];
      arr.push(total);
      campaignPools.set(campaignId, arr);
    }
  }

  // Pass 3: per-dimension ranks + weighted pre-blends.
  const preChannel = new Map<string, {
    dims: { averageViews: number; engagementRate: number | null; channelHealth: number; growthTrajectory: number | null };
    preBlend: number;
    hasSnapshot: boolean;
  }>();
  const preActivation = new Map<string, { impact: number; campaignsCounted: number; deliverableCount: number }>();

  for (const kolId of kolIds) {
    const raw = channelRawByKol.get(kolId)!;
    const pop = ratePops[bandByKol.get(kolId)!];
    const av = raw.averageViewsRaw == null ? 0 : rankNormalize(raw.averageViewsRaw, avgViewsPop);
    const er = raw.engagementRateRaw == null ? null : rankNormalize(raw.engagementRateRaw, pop.er);
    const chER = raw.channelHealthRaw_ER == null ? 0 : rankNormalize(raw.channelHealthRaw_ER, pop.ch_er);
    const chFreq = raw.channelHealthRaw_Freq == null ? 0 : rankNormalize(raw.channelHealthRaw_Freq, pop.ch_freq);
    const ch = (chER + chFreq) / 2;
    const gt = raw.growthTrajectoryRaw == null ? null : rankNormalize(raw.growthTrajectoryRaw, pop.gt);
    const dims = { averageViews: av, engagementRate: er, channelHealth: ch, growthTrajectory: gt };
    preChannel.set(kolId, {
      dims,
      preBlend: computeChannelPreBlend(dims),
      hasSnapshot: latestSnapshotByKol.get(kolId) != null,
    });

    // Activation Impact: percentile within each campaign, averaged.
    const perCamp = participantsByKol.get(kolId)!;
    if (perCamp.size > 0) {
      const pcts = [...perCamp.entries()].map(([campaignId, total]) =>
        rankNormalize(total, campaignPools.get(campaignId) ?? []));
      preActivation.set(kolId, {
        impact: avg(pcts),
        campaignsCounted: perCamp.size,
        deliverableCount: (deliverablesByKol.get(kolId) ?? []).length,
      });
    }
  }

  // Pass 4 (Round 2 core fix): re-rank the FINAL score across the roster.
  // Averaging ranked dims pulls everyone to the middle (~70 max); ranking
  // the blend puts the top KOL near 100 so tiers actually spread. Same
  // for Activation across the activated pool.
  const channelBlendPop = kolIds
    .filter(id => preChannel.get(id)!.hasSnapshot)
    .map(id => preChannel.get(id)!.preBlend);
  const activationBlendPop = [...preActivation.values()].map(a => a.impact);

  const results = new Map<string, ScoreResult>();
  for (const kolId of kolIds) {
    const pre = preChannel.get(kolId)!;
    const snap = latestSnapshotByKol.get(kolId);
    const channelFinal = pre.hasSnapshot ? rankNormalize(pre.preBlend, channelBlendPop) : 0;

    const channelBreakdown: ChannelScoreBreakdown = { ...pre.dims, composite: channelFinal };

    const act = preActivation.get(kolId);
    const activationBreakdown: ActivationScoreBreakdown | null = act
      ? {
          activationImpact: act.impact,
          composite: rankNormalize(act.impact, activationBlendPop),
          deliverableCount: act.deliverableCount,
          campaignsCounted: act.campaignsCounted,
        }
      : null;

    const scores: DisplayScores = {
      channel: channelFinal,
      activation: activationBreakdown?.composite ?? null,
      tier: tierFor(channelFinal),
      activated: activationBreakdown != null,
      lowConfidence: snap?.low_organic_volume_flag ?? false,
    };

    results.set(kolId, { channel: channelBreakdown, activation: activationBreakdown, scores });
  }
  return results;
}

// ─── DB fetcher ────────────────────────────────────────────────────────

/**
 * Assemble all inputs `computeKolScores` needs in one Supabase round-trip
 * batch. Reads: master_kols (id list), kol_channel_snapshots (all rows),
 * kol_deliverables (all rows). For an 86-KOL roster this stays well
 * under the row limit and is cheap to call on every read.
 */
export async function assembleScoreInputs(supabase: SupabaseClient<Database>): Promise<ComputeInputs> {
  const [{ data: kols }, { data: snapshots }, { data: deliverables }] = await Promise.all([
    supabase.from('master_kols').select('id').is('archived_at', null),
    supabase.from('kol_channel_snapshots').select('*').order('snapshot_date', { ascending: false }),
    supabase.from('kol_deliverables').select('*'),
  ]);

  const kolIds = (kols ?? []).map(k => k.id);

  // Group snapshots by KOL, capture latest per KOL.
  const allSnapshotsByKol = new Map<string, SnapshotInput[]>();
  const latestSnapshotByKol = new Map<string, SnapshotInput>();
  for (const snap of snapshots ?? []) {
    const list = allSnapshotsByKol.get(snap.kol_id) ?? [];
    list.push(snap as SnapshotInput);
    allSnapshotsByKol.set(snap.kol_id, list);
    // First seen = latest (because we ordered DESC).
    if (!latestSnapshotByKol.has(snap.kol_id)) latestSnapshotByKol.set(snap.kol_id, snap as SnapshotInput);
  }

  // Group deliverables by KOL + compute per-campaign avg participants.
  const deliverablesByKol = new Map<string, DeliverableInput[]>();
  const campParticipantsAccum = new Map<string, { sum: number; n: number }>();
  for (const d of deliverables ?? []) {
    const list = deliverablesByKol.get(d.kol_id) ?? [];
    list.push(d as DeliverableInput);
    deliverablesByKol.set(d.kol_id, list);
    if (d.activation_participants != null) {
      const slot = campParticipantsAccum.get(d.campaign_id) ?? { sum: 0, n: 0 };
      slot.sum += d.activation_participants;
      slot.n += 1;
      campParticipantsAccum.set(d.campaign_id, slot);
    }
  }
  const campaignAvgParticipants = new Map<string, number>();
  for (const [cid, slot] of campParticipantsAccum) {
    if (slot.n > 0) campaignAvgParticipants.set(cid, slot.sum / slot.n);
  }

  return { latestSnapshotByKol, allSnapshotsByKol, deliverablesByKol, campaignAvgParticipants, kolIds };
}

/** Helper for the per-KOL route: assemble + compute + pick. */
export async function getKolScore(supabase: SupabaseClient<Database>, kolId: string): Promise<ScoreResult | null> {
  const inputs = await assembleScoreInputs(supabase);
  return computeKolScores(inputs).get(kolId) ?? null;
}

/** Helper for the batch route. */
export async function getAllKolScores(supabase: SupabaseClient<Database>): Promise<Map<string, ScoreResult>> {
  const inputs = await assembleScoreInputs(supabase);
  return computeKolScores(inputs);
}
