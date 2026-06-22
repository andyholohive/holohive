/**
 * KOL Score service — implements Jdot's TG Addendum (18 June 2026)
 * two-score model + blend rule.
 *
 *   Channel Score (5 dims, 100%):
 *     Engagement Quality       30%  = avg organic views / followers
 *     Reach Efficiency         25%  = avg organic forwards / avg organic views
 *     Discussion Engagement    15%  = avg organic replies / avg organic views
 *                                     (drop + renormalize for broadcast-only)
 *     Channel Health           15%  = avg(min-max(engagement_rate),
 *                                          min-max(posting_frequency))
 *     Growth Trajectory        15%  = follower_growth_pct, floor neg at 0
 *                                     (drop + renormalize on month-1 / null)
 *
 *   Campaign Performance Score (3 dims, gates at 3+ deliverables):
 *     Activation Impact        50%  = participants / single-campaign avg
 *     Sponsored Engagement Lift 30% = views_48h / KOL baseline (closest-prior snapshot)
 *     Sponsored Reach          20%  = forwards / views_48h on sponsored posts
 *
 *   Display blend:
 *     not activated   → Channel Score (100%)
 *     activated (3+)  → 0.4 * Campaign + 0.6 * Channel
 *
 *   Tier (absolute, applied to the displayed score):
 *     S 85+ · A 70-84 · B 50-69 · C 30-49 · D <30
 *
 * All raw dimension outputs get min-max normalized to 0-100 across the
 * pool that produced them: roster for Channel dims, aggregated campaign
 * data for Campaign dims (per Jdot Q3 + Q12).
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

export interface ChannelScoreBreakdown {
  /** All normalized 0–100. null = dimension dropped (broadcast-only / month-1). */
  engagementQuality: number;
  reachEfficiency: number;
  discussionEngagement: number | null;
  channelHealth: number;
  growthTrajectory: number | null;
  /** Weighted composite, renormalized over present dimensions. 0–100. */
  composite: number;
}

export interface CampaignScoreBreakdown {
  activationImpact: number;
  sponsoredEngagementLift: number;
  sponsoredReach: number;
  composite: number;
  deliverableCount: number;
}

export interface BlendedScore {
  channel: number;
  campaign: number | null;
  /** The single Score that renders on /kols. */
  displayed: number;
  tier: Tier;
  activated: boolean;
  /** From the latest snapshot's low_organic_volume_flag — low-confidence marker. */
  lowConfidence: boolean;
}

export interface ScoreResult {
  channel: ChannelScoreBreakdown;
  campaign: CampaignScoreBreakdown | null;
  blended: BlendedScore;
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

const CHANNEL_WEIGHTS = {
  engagementQuality: 0.30,
  reachEfficiency: 0.25,
  discussionEngagement: 0.15,
  channelHealth: 0.15,
  growthTrajectory: 0.15,
} as const;

const CAMPAIGN_WEIGHTS = {
  activationImpact: 0.50,
  sponsoredEngagementLift: 0.30,
  sponsoredReach: 0.20,
} as const;

const CHANNEL_BLEND_WEIGHT = 0.60;
const CAMPAIGN_BLEND_WEIGHT = 0.40;
const ACTIVATION_THRESHOLD = 3;

// ─── Math helpers ──────────────────────────────────────────────────────

/**
 * Min-max normalize a value into 0–100 against a population.
 * Population values of `null`/`undefined` are dropped. If min==max the
 * normalized value collapses to 50 (neutral) — preserves rank order
 * without dividing by zero.
 */
function minMaxNormalize(value: number, population: ReadonlyArray<number | null | undefined>): number {
  const nums = population.filter((n): n is number => n != null && isFinite(n));
  if (nums.length === 0) return 0;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return 50;
  const scaled = ((value - min) / (max - min)) * 100;
  return clamp(scaled, 0, 100);
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }

/** Safe division — returns null when denominator is 0 or either operand is missing. */
function safeDiv(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

// ─── Raw dimension extractors (per-KOL, pre-normalization) ─────────────

interface ChannelRawDims {
  engagementQualityRaw: number | null;
  reachEfficiencyRaw: number | null;
  discussionEngagementRaw: number | null;
  channelHealthRaw_ER: number | null;
  channelHealthRaw_Freq: number | null;
  growthTrajectoryRaw: number | null;
}

function extractChannelRaw(snap: SnapshotInput | undefined): ChannelRawDims {
  if (!snap) {
    return {
      engagementQualityRaw: null, reachEfficiencyRaw: null, discussionEngagementRaw: null,
      channelHealthRaw_ER: null, channelHealthRaw_Freq: null, growthTrajectoryRaw: null,
    };
  }
  return {
    engagementQualityRaw: safeDiv(snap.avg_views_per_post, snap.follower_count),
    reachEfficiencyRaw: safeDiv(snap.avg_forwards_per_post, snap.avg_views_per_post),
    discussionEngagementRaw: safeDiv(snap.avg_replies_per_post, snap.avg_views_per_post),
    channelHealthRaw_ER: snap.engagement_rate,
    channelHealthRaw_Freq: snap.posting_frequency,
    growthTrajectoryRaw: snap.follower_growth_pct == null
      ? null
      : Math.max(0, snap.follower_growth_pct),  // floor negatives at 0 per Jdot Q12
  };
}

// ─── Channel Score composite (with renormalize) ────────────────────────

function computeChannelComposite(
  normalized: {
    engagementQuality: number;
    reachEfficiency: number;
    discussionEngagement: number | null;
    channelHealth: number;
    growthTrajectory: number | null;
  }
): number {
  /**
   * Renormalization rule per Jdot Q2 + Q4: when Discussion or Growth is
   * missing, drop that dimension entirely and rescale the remaining
   * weights so they sum to 1. Done by dividing the weighted sum by the
   * total weight of present dimensions.
   */
  let weighted = 0;
  let totalWeight = 0;

  weighted += normalized.engagementQuality * CHANNEL_WEIGHTS.engagementQuality;
  totalWeight += CHANNEL_WEIGHTS.engagementQuality;

  weighted += normalized.reachEfficiency * CHANNEL_WEIGHTS.reachEfficiency;
  totalWeight += CHANNEL_WEIGHTS.reachEfficiency;

  if (normalized.discussionEngagement != null) {
    weighted += normalized.discussionEngagement * CHANNEL_WEIGHTS.discussionEngagement;
    totalWeight += CHANNEL_WEIGHTS.discussionEngagement;
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

// ─── Campaign Performance ──────────────────────────────────────────────

interface CampaignRawDims {
  activationImpactRaw: number | null;
  sponsoredEngagementLiftRaw: number | null;
  sponsoredReachRaw: number | null;
  deliverableCount: number;
}

/**
 * Find the snapshot from `kolSnapshots` that was the most recent one
 * on/before `postedDate`. Used for Engagement Lift baseline per Doc 2 §6
 * (closest-prior snapshot, per Jdot Q1).
 */
function findBaselineSnapshot(
  kolSnapshots: SnapshotInput[],
  postedDate: string | null
): SnapshotInput | null {
  if (!postedDate || kolSnapshots.length === 0) return null;
  const target = new Date(postedDate).getTime();
  const eligible = kolSnapshots
    .filter(s => new Date(s.snapshot_date).getTime() <= target)
    .sort((a, b) => new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime());
  return eligible[0] ?? null;
}

function extractCampaignRaw(
  deliverables: DeliverableInput[],          // this KOL's deliverables only
  allSnapshotsByKol: Map<string, SnapshotInput[]>,
  campaignAvgParticipants: Map<string, number>,
  kolId: string
): CampaignRawDims {
  const count = deliverables.length;
  if (count < ACTIVATION_THRESHOLD) {
    return {
      activationImpactRaw: null, sponsoredEngagementLiftRaw: null,
      sponsoredReachRaw: null, deliverableCount: count,
    };
  }

  // Activation Impact: avg(participants / that-campaign's-average)
  const impactRatios = deliverables
    .map(d => {
      const campAvg = campaignAvgParticipants.get(d.campaign_id);
      return safeDiv(d.activation_participants, campAvg);
    })
    .filter((n): n is number => n != null);

  // Engagement Lift: avg(views_48h / baseline-at-time-of-post)
  const kolSnapshots = allSnapshotsByKol.get(kolId) ?? [];
  const liftRatios = deliverables
    .map(d => {
      const baseline = findBaselineSnapshot(kolSnapshots, d.date_posted);
      return safeDiv(d.views_48h, baseline?.avg_views_per_post);
    })
    .filter((n): n is number => n != null);

  // Sponsored Reach: avg(forwards / views_48h)
  const reachRatios = deliverables
    .map(d => safeDiv(d.forwards, d.views_48h))
    .filter((n): n is number => n != null);

  return {
    activationImpactRaw: impactRatios.length ? avg(impactRatios) : null,
    sponsoredEngagementLiftRaw: liftRatios.length ? avg(liftRatios) : null,
    sponsoredReachRaw: reachRatios.length ? avg(reachRatios) : null,
    deliverableCount: count,
  };
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function computeCampaignComposite(normalized: {
  activationImpact: number;
  sponsoredEngagementLift: number;
  sponsoredReach: number;
}): number {
  return (
    normalized.activationImpact * CAMPAIGN_WEIGHTS.activationImpact +
    normalized.sponsoredEngagementLift * CAMPAIGN_WEIGHTS.sponsoredEngagementLift +
    normalized.sponsoredReach * CAMPAIGN_WEIGHTS.sponsoredReach
  );
}

// ─── Blend + tier ──────────────────────────────────────────────────────

function tierFor(displayedScore: number): Tier {
  if (displayedScore >= 85) return 'S';
  if (displayedScore >= 70) return 'A';
  if (displayedScore >= 50) return 'B';
  if (displayedScore >= 30) return 'C';
  return 'D';
}

function blend(channel: number, campaign: number | null): number {
  if (campaign == null) return channel;
  return campaign * CAMPAIGN_BLEND_WEIGHT + channel * CHANNEL_BLEND_WEIGHT;
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

  // Pass 1: extract raw dims per KOL.
  const channelRawByKol = new Map<string, ChannelRawDims>();
  const campaignRawByKol = new Map<string, CampaignRawDims>();
  for (const kolId of kolIds) {
    channelRawByKol.set(kolId, extractChannelRaw(latestSnapshotByKol.get(kolId)));
    campaignRawByKol.set(kolId, extractCampaignRaw(
      deliverablesByKol.get(kolId) ?? [],
      allSnapshotsByKol,
      campaignAvgParticipants,
      kolId,
    ));
  }

  // Pass 2: collect roster populations for min-max normalization.
  // Channel dims normalize across the 86-KOL roster (Jdot Q3 + Q12).
  // Campaign dims normalize across "aggregated campaign data" — i.e. the
  // pool of activated KOLs' raw ratios (Q12).
  const channelPop = {
    eq: kolIds.map(id => channelRawByKol.get(id)?.engagementQualityRaw),
    re: kolIds.map(id => channelRawByKol.get(id)?.reachEfficiencyRaw),
    de: kolIds.map(id => channelRawByKol.get(id)?.discussionEngagementRaw),
    ch_er: kolIds.map(id => channelRawByKol.get(id)?.channelHealthRaw_ER),
    ch_freq: kolIds.map(id => channelRawByKol.get(id)?.channelHealthRaw_Freq),
    gt: kolIds.map(id => channelRawByKol.get(id)?.growthTrajectoryRaw),
  };
  const campaignPop = {
    ai: kolIds.map(id => campaignRawByKol.get(id)?.activationImpactRaw),
    sel: kolIds.map(id => campaignRawByKol.get(id)?.sponsoredEngagementLiftRaw),
    sr: kolIds.map(id => campaignRawByKol.get(id)?.sponsoredReachRaw),
  };

  // Pass 3: normalize + compose per KOL.
  const results = new Map<string, ScoreResult>();
  for (const kolId of kolIds) {
    const raw = channelRawByKol.get(kolId)!;
    const camp = campaignRawByKol.get(kolId)!;
    const snap = latestSnapshotByKol.get(kolId);

    // Channel dims.
    const eq = raw.engagementQualityRaw == null ? 0 : minMaxNormalize(raw.engagementQualityRaw, channelPop.eq);
    const re = raw.reachEfficiencyRaw == null ? 0 : minMaxNormalize(raw.reachEfficiencyRaw, channelPop.re);
    const de = raw.discussionEngagementRaw == null
      ? null
      : minMaxNormalize(raw.discussionEngagementRaw, channelPop.de);
    // Channel Health: average of two min-max'd sub-metrics per Jdot Q3 option A.
    const chER = raw.channelHealthRaw_ER == null ? 0 : minMaxNormalize(raw.channelHealthRaw_ER, channelPop.ch_er);
    const chFreq = raw.channelHealthRaw_Freq == null ? 0 : minMaxNormalize(raw.channelHealthRaw_Freq, channelPop.ch_freq);
    const ch = (chER + chFreq) / 2;
    const gt = raw.growthTrajectoryRaw == null ? null : minMaxNormalize(raw.growthTrajectoryRaw, channelPop.gt);

    const channelBreakdown: ChannelScoreBreakdown = {
      engagementQuality: eq,
      reachEfficiency: re,
      discussionEngagement: de,
      channelHealth: ch,
      growthTrajectory: gt,
      composite: computeChannelComposite({ engagementQuality: eq, reachEfficiency: re, discussionEngagement: de, channelHealth: ch, growthTrajectory: gt }),
    };

    // Campaign dims (only if activated).
    let campaignBreakdown: CampaignScoreBreakdown | null = null;
    if (camp.deliverableCount >= ACTIVATION_THRESHOLD) {
      const ai = camp.activationImpactRaw == null ? 0 : minMaxNormalize(camp.activationImpactRaw, campaignPop.ai);
      const sel = camp.sponsoredEngagementLiftRaw == null ? 0 : minMaxNormalize(camp.sponsoredEngagementLiftRaw, campaignPop.sel);
      const sr = camp.sponsoredReachRaw == null ? 0 : minMaxNormalize(camp.sponsoredReachRaw, campaignPop.sr);
      campaignBreakdown = {
        activationImpact: ai,
        sponsoredEngagementLift: sel,
        sponsoredReach: sr,
        composite: computeCampaignComposite({ activationImpact: ai, sponsoredEngagementLift: sel, sponsoredReach: sr }),
        deliverableCount: camp.deliverableCount,
      };
    }

    const channelScore = channelBreakdown.composite;
    const campaignScore = campaignBreakdown?.composite ?? null;
    const displayed = blend(channelScore, campaignScore);
    const blended: BlendedScore = {
      channel: channelScore,
      campaign: campaignScore,
      displayed,
      tier: tierFor(displayed),
      activated: campaignBreakdown != null,
      lowConfidence: snap?.low_organic_volume_flag ?? false,
    };

    results.set(kolId, { channel: channelBreakdown, campaign: campaignBreakdown, blended });
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
