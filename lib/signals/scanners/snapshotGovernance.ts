/**
 * Scanner: Snapshot.org DAO Governance
 * Queries Snapshot for proposals mentioning Asia/Korea expansion.
 * Signal: dao_asia_governance (+20)
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';
import { findProspectMatch } from '../matching';

const SNAPSHOT_GRAPHQL = 'https://hub.snapshot.org/graphql';

const ASIA_KEYWORDS = ['asia', 'korea', 'korean', 'apac', 'seoul', 'japan', 'singapore', 'expansion'];

export const snapshotGovernanceScanner: ScannerModule = {
  id: 'snapshot_governance',
  name: 'Snapshot.org DAO Governance',
  cadence: 'weekly',
  requires: 'api',
  signalTypes: ['dao_asia_governance'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    try {
      // Query recent proposals (last 30 days) that mention Asia/Korea keywords
      const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

      const query = `
        query {
          proposals(
            first: 100,
            skip: 0,
            where: { created_gte: ${thirtyDaysAgo}, state: "active" },
            orderBy: "created",
            orderDirection: desc
          ) {
            id
            title
            body
            space { id name }
            created
            end
            state
            link
          }
        }
      `;

      const res = await fetch(SNAPSHOT_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return signals;
      const data = await res.json();
      const proposals = data?.data?.proposals || [];

      for (const proposal of proposals) {
        const titleLower = (proposal.title || '').toLowerCase();
        const bodyLower = (proposal.body || '').toLowerCase().substring(0, 2000);
        const combined = `${titleLower} ${bodyLower}`;

        // Check if proposal mentions Asia/Korea keywords
        const hasAsiaKeyword = ASIA_KEYWORDS.some(kw => combined.includes(kw));
        if (!hasAsiaKeyword) continue;

        // Try to match the space name to a prospect
        const spaceName = proposal.space?.name || proposal.space?.id || '';
        const match = findProspectMatch(spaceName, '', ctx.prospects);
        if (!match) continue;

        const config = SIGNAL_WEIGHTS.dao_asia_governance;
        signals.push({
          prospect_id: match.id,
          project_name: match.name,
          signal_type: 'dao_asia_governance',
          headline: `DAO proposal: ${proposal.title.substring(0, 200)}`,
          snippet: `${proposal.body?.substring(0, 400) || 'No description'}`,
          source_url: proposal.link || `https://snapshot.org/#/${proposal.space?.id}/proposal/${proposal.id}`,
          source_name: 'snapshot',
          relevancy_weight: config.weight,
          tier: config.tier,
          shelf_life_days: config.shelf_life_days,
          expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
          metadata: { space: spaceName, state: proposal.state },
        });
      }
    } catch (err) {
      console.error('Snapshot governance scanner error:', err);
    }

    return signals;
  },
};
