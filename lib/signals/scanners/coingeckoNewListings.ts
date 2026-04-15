/**
 * Scanner: CoinGecko New Listings (TGE Detection)
 * Detects recently added coins on CoinGecko that match our prospects.
 * Signal: tge_within_60d (+25) — highest value signal in the Bible
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';
import { findProspectMatch } from '../matching';

export const coingeckoNewListingsScanner: ScannerModule = {
  id: 'coingecko_new_listings',
  name: 'CoinGecko New Listings (TGE Detection)',
  cadence: 'daily',
  requires: 'api',
  signalTypes: ['tge_within_60d'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    try {
      // CoinGecko /coins/list returns all coins — we compare against known prospects
      // to find recently added ones that match
      const res = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=false', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return signals;
      const coins = await res.json();
      if (!Array.isArray(coins)) return signals;

      // Get the last known coin count from metadata to detect new additions
      const { data: scanMeta } = await ctx.supabase
        .from('prospect_signals')
        .select('metadata')
        .eq('project_name', '__scanner_meta__')
        .eq('signal_type', 'coingecko_coin_count')
        .limit(1)
        .single();

      const lastKnownCount = scanMeta?.metadata?.count || 0;
      const currentCount = coins.length;

      // If this is the first run or coin count increased, check for matches
      if (lastKnownCount > 0 && currentCount > lastKnownCount) {
        // New coins were added — check the last N coins (likely most recently added)
        // CoinGecko list isn't sorted by date, but newer coins tend to be at the end
        const checkCount = Math.min(currentCount - lastKnownCount + 50, 200);
        const recentCoins = coins.slice(-checkCount);

        for (const coin of recentCoins) {
          const match = findProspectMatch(coin.name || '', coin.symbol || '', ctx.prospects);
          if (match) {
            const config = SIGNAL_WEIGHTS.tge_within_60d;
            signals.push({
              prospect_id: match.id,
              project_name: match.name,
              signal_type: 'tge_within_60d',
              headline: `${match.name} recently listed on CoinGecko — possible TGE`,
              snippet: `${coin.name} (${(coin.symbol || '').toUpperCase()}) was recently added to CoinGecko. This typically indicates a recent or upcoming token launch (TGE). Projects near TGE need Korean community building urgently.`,
              source_url: `https://www.coingecko.com/en/coins/${coin.id}`,
              source_name: 'coingecko',
              relevancy_weight: config.weight,
              tier: config.tier,
              shelf_life_days: config.shelf_life_days,
              expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
            });
          }
        }
      }

      // Update the coin count metadata
      await ctx.supabase
        .from('prospect_signals')
        .upsert({
          project_name: '__scanner_meta__',
          signal_type: 'coingecko_coin_count',
          prospect_id: null,
          headline: `CoinGecko coin count: ${currentCount}`,
          source_name: 'system',
          relevancy_weight: 0,
          is_active: false,
          metadata: { count: currentCount, updated_at: new Date().toISOString() },
        }, { onConflict: 'project_name,signal_type' })
        .select()
        .single();
    } catch (err) {
      console.error('CoinGecko new listings scanner error:', err);
    }

    return signals;
  },
};
