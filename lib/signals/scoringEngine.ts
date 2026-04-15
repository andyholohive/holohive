/**
 * Signal & Trigger Bible v3 — Scoring Engine
 * Calculates prospect scores and action tiers based on active signals.
 * Implements: diminishing returns, recency decay, diversity bonus,
 * velocity bonus, signal stacking, compound triggers, and score decay.
 */

import { SIGNAL_WEIGHTS, getActionTier, type ActionTier } from './types';

interface SignalForScoring {
  signal_type: string;
  relevancy_weight: number;
  is_active: boolean;
  detected_at: string | null;
  tier?: number | null;
  shelf_life_days?: number | null;
}

export interface ScoreResult {
  score: number;
  action_tier: ActionTier;
  signal_count: number;
  is_trending: boolean;
  last_new_signal_date: string | null;
}

/**
 * Calculate the prospect score from all active signals.
 * Implements Bible v3 scoring rules.
 */
export function calculateScore(signals: SignalForScoring[]): ScoreResult {
  const activeSignals = signals.filter(s => s.is_active);
  if (activeSignals.length === 0) {
    return { score: 0, action_tier: 'SKIP', signal_count: 0, is_trending: false, last_new_signal_date: null };
  }

  const now = Date.now();

  // Group signals by type
  const signalsByType = new Map<string, Array<{ weight: number; detected_at: string | null; tier: number }>>();
  let lastNewSignalDate: string | null = null;

  for (const s of activeSignals) {
    const existing = signalsByType.get(s.signal_type) || [];
    const tier = s.tier || SIGNAL_WEIGHTS[s.signal_type]?.tier || 3;
    existing.push({ weight: s.relevancy_weight, detected_at: s.detected_at, tier });
    signalsByType.set(s.signal_type, existing);

    // Track most recent signal date
    if (s.detected_at) {
      if (!lastNewSignalDate || new Date(s.detected_at) > new Date(lastNewSignalDate)) {
        lastNewSignalDate = s.detected_at;
      }
    }
  }

  // 1. Base score: sum of weights with diminishing returns per type
  let totalScore = 0;

  for (const [signalType, typeSignals] of Array.from(signalsByType.entries())) {
    // Sort by absolute weight descending
    typeSignals.sort((a: { weight: number }, b: { weight: number }) => Math.abs(b.weight) - Math.abs(a.weight));

    for (let i = 0; i < typeSignals.length; i++) {
      const s = typeSignals[i];

      // Negative signals — apply directly, no diminishing returns
      if (s.weight < 0) {
        totalScore += s.weight;
        continue;
      }

      // Compound triggers: signals marked compound_only score 0 unless stacked with another signal type
      const config = SIGNAL_WEIGHTS[signalType];
      if (config?.compound_only && signalsByType.size <= 1) {
        continue; // Skip compound-only signals if they're the only type
      }

      // Recency multiplier: 1.0 for signals in last 30 days, decays to 0.5 at 180 days
      let recencyMultiplier = 1.0;
      if (s.detected_at) {
        const ageDays = (now - new Date(s.detected_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 30) {
          recencyMultiplier = Math.max(0.5, 1.0 - ((ageDays - 30) / 300));
        }
      }

      // Diminishing returns: first signal gets full weight, subsequent get halved
      const baseScore = i === 0 ? s.weight : Math.max(5, Math.floor(s.weight * (0.5 ** i)));
      totalScore += Math.round(baseScore * recencyMultiplier);
    }
  }

  // 2. Score decay: -10 per 30 days with no new signal
  if (lastNewSignalDate) {
    const daysSinceLastSignal = (now - new Date(lastNewSignalDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastSignal > 30) {
      const decayPeriods = Math.floor(daysSinceLastSignal / 30);
      totalScore -= decayPeriods * 10;
    }
  }

  // 3. Signal stacking: 2+ Tier 1/2 signals in same week → +10 bonus
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentTier12 = activeSignals.filter(s => {
    const tier = s.tier || SIGNAL_WEIGHTS[s.signal_type]?.tier || 3;
    return tier <= 2 && s.detected_at && (now - new Date(s.detected_at).getTime()) < sevenDaysMs;
  });
  if (recentTier12.length >= 2) {
    totalScore += 10; // Stacking bonus
  }

  // 4. Diversity bonus: reward having multiple distinct signal types
  const uniqueTypes = signalsByType.size;
  let diversityMultiplier = 1.0;
  if (uniqueTypes >= 4) diversityMultiplier = 1.20;
  else if (uniqueTypes === 3) diversityMultiplier = 1.12;
  else if (uniqueTypes === 2) diversityMultiplier = 1.05;

  // 5. Velocity bonus: recent signal clusters indicate trending
  const recentSignalCount = activeSignals.filter(
    s => s.detected_at && (now - new Date(s.detected_at).getTime()) < sevenDaysMs
  ).length;
  let velocityMultiplier = 1.0;
  if (recentSignalCount >= 5) velocityMultiplier = 1.25;
  else if (recentSignalCount >= 3) velocityMultiplier = 1.15;

  const finalScore = Math.max(0, Math.min(100, Math.round(totalScore * diversityMultiplier * velocityMultiplier)));
  const isTrending = recentSignalCount >= 3;

  return {
    score: finalScore,
    action_tier: getActionTier(finalScore),
    signal_count: activeSignals.length,
    is_trending: isTrending,
    last_new_signal_date: lastNewSignalDate,
  };
}

/**
 * Apply score decay to prospects that haven't received new signals.
 * Called by the cron job after each scan.
 * Returns the number of prospects updated.
 */
export async function applyScoreDecay(
  supabase: any,
): Promise<{ updated: number; watchlisted: number }> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  let updated = 0;
  let watchlisted = 0;

  // Find prospects with no new signals in 30+ days that still have a score
  const { data: staleProspects } = await supabase
    .from('prospects')
    .select('id, korea_relevancy_score, last_new_signal_date, action_tier')
    .gt('korea_relevancy_score', 0)
    .not('last_new_signal_date', 'is', null)
    .lt('last_new_signal_date', thirtyDaysAgo);

  if (!staleProspects || staleProspects.length === 0) {
    return { updated: 0, watchlisted: 0 };
  }

  for (const p of staleProspects) {
    const daysSince = (now.getTime() - new Date(p.last_new_signal_date).getTime()) / (1000 * 60 * 60 * 24);
    const decayPeriods = Math.floor(daysSince / 30);
    const newScore = Math.max(0, p.korea_relevancy_score - (decayPeriods * 10));
    const newTier = getActionTier(newScore);

    // Auto-WATCH at 90 days with no signal
    const forceWatch = p.last_new_signal_date < ninetyDaysAgo && newTier !== 'SKIP';

    const updateData: any = {
      korea_relevancy_score: newScore,
      action_tier: forceWatch ? 'WATCH' : newTier,
    };

    await supabase.from('prospects').update(updateData).eq('id', p.id);
    updated++;
    if (forceWatch) watchlisted++;
  }

  return { updated, watchlisted };
}
