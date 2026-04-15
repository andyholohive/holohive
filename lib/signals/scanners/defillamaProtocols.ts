/**
 * Scanner: DeFiLlama Protocol Activity
 * Detects new DeFi protocol launches and multi-chain expansions.
 * Signals: staking_defi_launch (+20), multi_chain_expansion (+10)
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';
import { findProspectMatch } from '../matching';

export const defillamaProtocolsScanner: ScannerModule = {
  id: 'defillama_protocols',
  name: 'DeFiLlama Protocol Activity',
  cadence: 'weekly',
  requires: 'api',
  signalTypes: ['staking_defi_launch', 'multi_chain_expansion'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    try {
      const res = await fetch('https://api.llama.fi/protocols', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return signals;

      const protocols = await res.json();
      if (!Array.isArray(protocols)) return signals;

      for (const protocol of protocols) {
        if (!protocol.name || !protocol.symbol) continue;

        const match = findProspectMatch(protocol.name, protocol.symbol, ctx.prospects);
        if (!match) continue;

        // Detect staking/DeFi launches — protocols with high TVL change
        const tvlChange7d = protocol.change_7d;
        if (tvlChange7d && tvlChange7d > 100) {
          // TVL grew 100%+ in 7 days = likely new launch
          const config = SIGNAL_WEIGHTS.staking_defi_launch;
          signals.push({
            prospect_id: match.id,
            project_name: match.name,
            signal_type: 'staking_defi_launch',
            headline: `${protocol.name} TVL surged ${Math.round(tvlChange7d)}% in 7 days`,
            snippet: `${protocol.name} (${protocol.category || 'DeFi'}) saw a ${Math.round(tvlChange7d)}% TVL increase. Current TVL: $${formatAmount(protocol.tvl)}. This indicates a new product launch or significant growth.`,
            source_url: `https://defillama.com/protocol/${protocol.slug}`,
            source_name: 'defillama',
            relevancy_weight: config.weight,
            tier: config.tier,
            shelf_life_days: config.shelf_life_days,
            expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
            metadata: { tvl: protocol.tvl, tvl_change_7d: tvlChange7d, category: protocol.category },
          });
        }

        // Detect multi-chain expansion — protocols on 3+ chains
        const chains = protocol.chains || [];
        if (chains.length >= 3) {
          const config = SIGNAL_WEIGHTS.multi_chain_expansion;
          signals.push({
            prospect_id: match.id,
            project_name: match.name,
            signal_type: 'multi_chain_expansion',
            headline: `${protocol.name} deployed across ${chains.length} chains`,
            snippet: `${protocol.name} is active on ${chains.slice(0, 5).join(', ')}${chains.length > 5 ? ` and ${chains.length - 5} more` : ''}. Multi-chain presence indicates growing ecosystem.`,
            source_url: `https://defillama.com/protocol/${protocol.slug}`,
            source_name: 'defillama',
            relevancy_weight: config.weight,
            tier: config.tier,
            shelf_life_days: config.shelf_life_days,
            expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
            metadata: { chains, chain_count: chains.length },
          });
        }
      }
    } catch (err) {
      console.error('DeFiLlama protocols scanner error:', err);
    }

    return signals;
  },
};

function formatAmount(n: number): string {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}
