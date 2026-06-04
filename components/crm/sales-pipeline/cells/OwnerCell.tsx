'use client';

/**
 * OwnerCell — owner name (resolved from the `users` roster) +
 * optional `+coOwner1, coOwner2` chip line. Used by every Outreach /
 * Pipeline / Orbit / Forecast table that surfaces ownership.
 *
 * Extracted from the page's inline `renderOwnerCell` helper on
 * 2026-06-03. Was being threaded through context to 5 child callers
 * (same prop-drilling pattern as `renderProjectNameSuffix` before
 * that became `<ProjectNameSuffix />`). The local
 * `getCoOwnerNames` helper folded in here too.
 */

import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import type { SalesPipelineOpportunity } from '@/lib/salesPipelineService';

interface OwnerCellProps {
  opp: SalesPipelineOpportunity;
}

export function OwnerCell({ opp }: OwnerCellProps) {
  const { getUserName, users } = useSalesPipeline();
  const ownerName = getUserName(opp.owner_id);
  const coNames = (opp.co_owner_ids || [])
    .map(id => {
      const u = users.find(u => u.id === id);
      return u?.name || u?.email || '—';
    });
  return (
    <div>
      <span>{ownerName}</span>
      {coNames.length > 0 && (
        <span className="text-[10px] text-ink-warm-400 block tabular-nums">
          +{coNames.join(', ')}
        </span>
      )}
    </div>
  );
}
