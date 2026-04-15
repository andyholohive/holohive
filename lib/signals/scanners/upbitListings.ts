/**
 * Scanner: Upbit Exchange Listings
 * Fetches KRW trading pairs from Upbit and cross-references with prospects.
 * Unmatched tokens go to discovery queue.
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { findProspectMatch, SKIP_TOKENS } from '../matching';

export interface UpbitToken {
  name: string;
  symbol: string;
  market: string;
}

export async function fetchUpbitTokens(): Promise<UpbitToken[]> {
  try {
    const res = await fetch('https://api.upbit.com/v1/market/all?is_details=true', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || [])
      .filter((m: any) => m.market?.startsWith('KRW-'))
      .map((m: any) => ({
        name: m.english_name || '',
        symbol: m.market?.replace('KRW-', '') || '',
        market: m.market || '',
      }));
  } catch (err) {
    console.error('Error fetching Upbit tokens:', err);
    return [];
  }
}

export const upbitListingsScanner: ScannerModule = {
  id: 'upbit_listings',
  name: 'Upbit Exchange Listings',
  cadence: 'daily',
  requires: 'api',
  signalTypes: ['social_presence'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];
    const tokens = await fetchUpbitTokens();

    // Store unmatched tokens in context metadata for discovery
    const unmatchedTokens: UpbitToken[] = [];

    for (const token of tokens) {
      const match = findProspectMatch(token.name, token.symbol, ctx.prospects);
      if (!match && !SKIP_TOKENS.has(token.symbol)) {
        unmatchedTokens.push(token);
      }
    }

    // Store unmatched for discovery phase (handled by orchestrator)
    ctx.metadata._unmatchedUpbitTokens = unmatchedTokens;

    return signals;
  },
};
