/**
 * Renewal pack — a client-facing deck built from the client dashboard, shared
 * as /public/renewal/[token] (same pattern as Korea Scan share links:
 * unguessable token, soft-delete revokes, opens counted).
 *
 * The snapshot is frozen at creation and client-safe by construction:
 *   - no spend, no KOL cost, no roster ranks against other clients
 *   - no channel names (counts only), no hired/organic per channel
 *   - top 5 creators only (they're the client's own creators)
 */

import type { ClientDashboardData } from '@/lib/clientDashboard';

export type RenewalSlide = 'cover' | 'journey' | 'results' | 'position' | 'community' | 'creators' | 'scorecard' | 'next';

export interface RenewalSnapshot {
  client: ClientDashboardData['client'];
  week: ClientDashboardData['week'];
  startDate: string | null;
  totals: ClientDashboardData['totals'];
  weekly: ClientDashboardData['weekly'];
  creators: ClientDashboardData['creators'];
  sentiment: ClientDashboardData['sentiment'];
  market: ClientDashboardData['market'];
  buzz: ClientDashboardData['buzz'];
  placement: ClientDashboardData['placement'];
  position: ClientDashboardData['position'];
  journey: ClientDashboardData['journey'];
  benchmarks: ClientDashboardData['benchmarks'];
  /** Channel coverage as counts only. */
  coverage: { covering: number; organic: number; gap: number } | null;
  createdAt: string;
}

export const RENEWAL_SLIDES: Array<{ id: RenewalSlide; label: string; hint: string; available: (s: RenewalSnapshot) => boolean }> = [
  { id: 'cover', label: 'Cover', hint: 'Headline numbers for the term', available: () => true },
  { id: 'journey', label: 'Journey', hint: 'Kickoff to today, with the moments', available: (s) => !!(s.journey.start || s.journey.firstPost) },
  { id: 'results', label: 'Results', hint: 'Reads per week and by platform', available: (s) => !!s.totals },
  { id: 'position', label: 'Korea position', hint: 'Map, rank race and the field', available: (s) => !!s.position || !!s.placement },
  { id: 'community', label: 'Community', hint: 'Sentiment and translated comments', available: (s) => !!s.sentiment },
  { id: 'creators', label: 'Creators', hint: 'Top creators and the top post', available: (s) => s.creators.length > 0 },
  { id: 'scorecard', label: 'Where we stand', hint: 'The client-safe scorecard', available: (s) => !!s.totals },
  { id: 'next', label: 'Next term', hint: 'Your note, room to grow, pace', available: () => true },
];

export const DEFAULT_SLIDES: RenewalSlide[] = ['cover', 'journey', 'results', 'position', 'community', 'creators', 'next'];

/** Known slide ids only, in catalog order, and only ones the snapshot can fill. */
export function cleanRenewalSlides(ids: unknown, s?: RenewalSnapshot): RenewalSlide[] {
  const wanted = new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  return RENEWAL_SLIDES.filter((x) => wanted.has(x.id) && (!s || x.available(s))).map((x) => x.id);
}

export function buildRenewalSnapshot(d: ClientDashboardData): RenewalSnapshot {
  const ch = d.channels ?? [];
  return {
    client: d.client,
    week: d.week,
    startDate: d.startDate,
    totals: d.totals,
    weekly: d.weekly,
    creators: d.creators.slice(0, 5),
    sentiment: d.sentiment,
    market: d.market,
    buzz: d.buzz,
    placement: d.placement,
    position: d.position,
    journey: d.journey,
    // Medians stay ("typical HoloHive campaign"); cost and ranks never leave.
    benchmarks: d.benchmarks ? { ...d.benchmarks, cpm: null, readsPerPost: { ...d.benchmarks.readsPerPost, rank: null }, engRate: { ...d.benchmarks.engRate, rank: null } } : null,
    coverage: ch.length ? {
      covering: ch.filter((c) => c.client > 0).length,
      organic: ch.filter((c) => c.client > 0 && !c.hired).length,
      gap: ch.filter((c) => c.client === 0).length,
    } : null,
    createdAt: new Date().toISOString(),
  };
}

/** The snapshot as the dashboard components expect it (spend/channels empty). */
export function asDashboard(s: RenewalSnapshot): ClientDashboardData {
  return {
    ...s,
    campaigns: [],
    lineup: null,
    channels: null,
    spend: null,
  };
}
