/**
 * Scanner: Bithumb Exchange Listings
 * Fetches KRW trading pairs from Bithumb and cross-references with prospects.
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SKIP_TOKENS } from '../matching';

export async function fetchBithumbTokens(): Promise<{ symbol: string }[]> {
  try {
    const res = await fetch('https://api.bithumb.com/public/ticker/ALL_KRW', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== '0000' || !data.data) return [];
    return Object.keys(data.data)
      .filter(k => k !== 'date')
      .map(symbol => ({ symbol: symbol.toUpperCase() }));
  } catch (err) {
    console.error('Error fetching Bithumb tokens:', err);
    return [];
  }
}

export const bithumbListingsScanner: ScannerModule = {
  id: 'bithumb_listings',
  name: 'Bithumb Exchange Listings',
  cadence: 'daily',
  requires: 'api',
  signalTypes: ['social_presence'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const tokens = await fetchBithumbTokens();
    const bithumbSymbols = new Set(tokens.map(t => t.symbol));

    // Remove matched prospects
    for (const p of ctx.prospects) {
      if (p.symbol && bithumbSymbols.has(p.symbol.toUpperCase())) {
        bithumbSymbols.delete(p.symbol.toUpperCase());
      }
    }

    // Store unmatched for discovery phase
    const unmatchedSymbols: string[] = [];
    for (const sym of Array.from(bithumbSymbols)) {
      if (!SKIP_TOKENS.has(sym)) unmatchedSymbols.push(sym);
    }
    ctx.metadata._unmatchedBithumbSymbols = unmatchedSymbols;

    return [];
  },
};
