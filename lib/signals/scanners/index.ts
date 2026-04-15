/**
 * Scanner Registry — exports all scanner modules organized by cadence.
 */

import type { ScannerModule } from '../types';

// Existing scanners (extracted from monolithic scan route)
import { upbitListingsScanner } from './upbitListings';
import { bithumbListingsScanner } from './bithumbListings';
import { koreanNewsRSSScanner } from './koreanNewsRSS';
import { webSearchScanner } from './webSearch';
import { claudeAnalysisScanner } from './claudeAnalysis';

// New Phase 3 scanners (Bible v3)
import { defillamaAirdropsScanner } from './defillamaAirdrops';
import { defillamaProtocolsScanner } from './defillamaProtocols';
import { snapshotGovernanceScanner } from './snapshotGovernance';
import { cryptoJobsKoreaScanner } from './cryptoJobsKorea';
import { coingeckoNewListingsScanner } from './coingeckoNewListings';
import { koreanCommunityHealthScanner } from './koreanCommunityHealth';

// Phase 4: CRM enrichment
import { crmEnrichmentScanner } from './crmEnrichment';

// ─── All scanners ───

export const ALL_SCANNERS: ScannerModule[] = [
  // Daily cadence
  upbitListingsScanner,
  bithumbListingsScanner,
  koreanNewsRSSScanner,
  coingeckoNewListingsScanner,
  defillamaAirdropsScanner,
  crmEnrichmentScanner,

  // Weekly cadence
  webSearchScanner,
  claudeAnalysisScanner,
  defillamaProtocolsScanner,
  snapshotGovernanceScanner,
  cryptoJobsKoreaScanner,
  koreanCommunityHealthScanner,
];

// ─── Scanner selectors ───

export function getScannersByIds(ids: string[]): ScannerModule[] {
  return ALL_SCANNERS.filter(s => ids.includes(s.id));
}

export function getScannersByCadence(cadence: 'daily' | 'weekly' | 'monthly'): ScannerModule[] {
  const cadenceOrder = { daily: 0, weekly: 1, monthly: 2 };
  const targetLevel = cadenceOrder[cadence];
  // Include all scanners up to the target cadence level
  return ALL_SCANNERS.filter(s => cadenceOrder[s.cadence] <= targetLevel);
}

/**
 * Get scanners based on legacy scan modes (api, web, claude) for backward compatibility.
 */
export function getScannersByModes(modes: string[]): ScannerModule[] {
  const scanners: ScannerModule[] = [];
  const added = new Set<string>();

  const add = (s: ScannerModule) => {
    if (!added.has(s.id)) {
      added.add(s.id);
      scanners.push(s);
    }
  };

  if (modes.includes('api')) {
    add(upbitListingsScanner);
    add(bithumbListingsScanner);
    add(koreanNewsRSSScanner);
    add(coingeckoNewListingsScanner);
    add(defillamaAirdropsScanner);
    add(crmEnrichmentScanner);
  }

  if (modes.includes('web')) {
    add(koreanNewsRSSScanner); // Needed for article URLs
    add(webSearchScanner);
    add(defillamaProtocolsScanner);
    add(snapshotGovernanceScanner);
    add(cryptoJobsKoreaScanner);
    add(koreanCommunityHealthScanner);
  }

  if (modes.includes('claude')) {
    add(koreanNewsRSSScanner); // Needed for articles
    add(claudeAnalysisScanner);
  }

  return scanners;
}

// Re-export individual scanners for direct use
export { upbitListingsScanner } from './upbitListings';
export { bithumbListingsScanner } from './bithumbListings';
export { koreanNewsRSSScanner } from './koreanNewsRSS';
export { webSearchScanner } from './webSearch';
export { claudeAnalysisScanner } from './claudeAnalysis';
export { defillamaAirdropsScanner } from './defillamaAirdrops';
export { defillamaProtocolsScanner } from './defillamaProtocols';
export { snapshotGovernanceScanner } from './snapshotGovernance';
export { cryptoJobsKoreaScanner } from './cryptoJobsKorea';
export { coingeckoNewListingsScanner } from './coingeckoNewListings';
export { koreanCommunityHealthScanner } from './koreanCommunityHealth';
export { crmEnrichmentScanner } from './crmEnrichment';
