/**
 * Scanner: DeFiLlama Airdrops
 * Detects airdrop announcements by checking DeFiLlama's protocol data.
 * Signal: airdrop_announcement (+20)
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';
import { findProspectMatch } from '../matching';

export const defillamaAirdropsScanner: ScannerModule = {
  id: 'defillama_airdrops',
  name: 'DeFiLlama Airdrops',
  cadence: 'daily',
  requires: 'api',
  signalTypes: ['airdrop_announcement'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    try {
      // DeFiLlama doesn't have a dedicated free airdrop API anymore.
      // We check protocols that have airdrops via their main endpoint.
      const res = await fetch('https://api.llama.fi/protocols', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return signals;

      const protocols = await res.json();
      if (!Array.isArray(protocols)) return signals;

      // Look for protocols that have airdrop-related fields or recent launches
      // Filter to protocols with symbol (likely to have tokens)
      const recentProtocols = protocols.filter((p: any) => {
        if (!p.symbol || !p.name) return false;
        // Check if the protocol description mentions airdrop
        const desc = (p.description || '').toLowerCase();
        return desc.includes('airdrop') || desc.includes('token launch') || desc.includes('tge');
      });

      for (const protocol of recentProtocols.slice(0, 50)) {
        const match = findProspectMatch(protocol.name, protocol.symbol || '', ctx.prospects);
        if (match) {
          const config = SIGNAL_WEIGHTS.airdrop_announcement;
          signals.push({
            prospect_id: match.id,
            project_name: match.name,
            signal_type: 'airdrop_announcement',
            headline: `${protocol.name} airdrop/token launch detected via DeFiLlama`,
            snippet: protocol.description?.substring(0, 500) || '',
            source_url: `https://defillama.com/protocol/${protocol.slug}`,
            source_name: 'defillama',
            relevancy_weight: config.weight,
            tier: config.tier,
            shelf_life_days: config.shelf_life_days,
            expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
    } catch (err) {
      console.error('DeFiLlama airdrops scanner error:', err);
    }

    return signals;
  },
};
