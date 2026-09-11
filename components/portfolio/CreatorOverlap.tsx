'use client';

/**
 * Creators carrying more than one live account.
 *
 * [2026-09-11, Andy] This started as a risk view and turned out to be two
 * things at once. A creator on every posting account is a single point of
 * failure — lose them and several campaigns degrade in the same week — and they
 * are also showing one Korean audience several different projects in the same
 * voice, which erodes exactly the credibility the small analyst channels are
 * paid a premium for.
 *
 * Neither is an argument against reuse. A creator who already knows how we work
 * is cheaper to brief and better at it. The point is to make the concentration
 * visible so it is a decision rather than an accident.
 */

import { StatusBadge } from '@/components/ui/status-badge';
import { CollapsibleCard } from '@/components/portfolio/Collapsible';
import type { CreatorReach } from '@/lib/portfolioService';

export function CreatorOverlap({ creators, clientCount }: { creators: CreatorReach[]; clientCount: number }) {
  if (creators.length === 0) return null;

  const everywhere = creators.filter(c => c.clients.length >= clientCount - 1 && c.clients.length > 2);
  const top = creators[0]?.clients.length ?? 0;

  return (
    <CollapsibleCard
      id="overlap"
      kicker="Roster concentration"
      title="Creators working more than one account"
      description={
        everywhere.length > 0
          ? `${everywhere.length} creator${everywhere.length === 1 ? '' : 's'} appear on ${top} of the live accounts. Losing one degrades that many campaigns at once, and the same Korean audience sees the same voice across all of them.`
          : `${creators.length} creators are on more than one live roster.`
      }
      defaultOpen={false}
    >
      <div className="p-5 flex flex-col gap-2">
        {creators.map(c => (
          <div
            key={c.id}
            className="flex items-start justify-between gap-3 flex-wrap px-3.5 py-2.5 rounded-[10px] border border-cream-200 bg-white"
          >
            <span className="flex items-center gap-2 min-w-0">
              <StatusBadge
                tone={c.clients.length >= 4 ? 'danger' : c.clients.length === 3 ? 'warning' : 'neutral'}
                size="sm"
              >
                {c.clients.length}
              </StatusBadge>
              <span className="text-[12.5px] text-ink-warm-900 truncate">{c.name}</span>
            </span>
            <span className="text-[11.5px] text-ink-warm-500">{c.clients.join(' · ')}</span>
          </div>
        ))}
        <p className="text-[11.5px] text-ink-warm-400 leading-relaxed pt-1 max-w-[80ch]">
          Counted on roster membership, not posts — the exposure starts when someone is briefed on a
          second account, not when the second post lands.
        </p>
      </div>
    </CollapsibleCard>
  );
}
