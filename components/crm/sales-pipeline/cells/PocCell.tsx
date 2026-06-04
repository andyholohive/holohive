'use client';

/**
 * PocCell — POC platform badge + handle, with the handle becoming a
 * clickable x.com link when `poc_platform === 'twitter'`. Used by
 * every Outreach / Pipeline / Orbit / Forecast table that surfaces
 * the POC.
 *
 * Extracted from the page's inline `renderPocCell` helper on
 * 2026-06-03. Same prop-drilling pattern as `renderOwnerCell` /
 * `renderProjectNameSuffix` before they became standalone components.
 *
 * The `maxWidth` prop matches the legacy `maxWidthClass` argument:
 * a Tailwind class controlling the truncation cap. Defaults to the
 * same `max-w-[120px]` the page helper used.
 */

import { Badge } from '@/components/ui/badge';
import { cleanPocHandle } from '@/lib/salesPipelineHelpers';
import type { SalesPipelineOpportunity } from '@/lib/salesPipelineService';

interface PocCellProps {
  opp: SalesPipelineOpportunity;
  /** Tailwind max-width class for the handle. Default keeps the
   *  legacy 120px cap; pass `max-w-[180px]` etc. for wider columns. */
  maxWidth?: string;
}

export function PocCell({ opp, maxWidth = 'max-w-[120px]' }: PocCellProps) {
  if (!opp.poc_handle) return <span className="text-ink-warm-400 text-xs">—</span>;
  const cleanHandle = cleanPocHandle(opp.poc_handle);
  const isTwitter = opp.poc_platform === 'twitter';
  const xHandle = cleanHandle.replace(/^@/, '');
  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 capitalize shrink-0 bg-white"
      >
        {opp.poc_platform || 'other'}
      </Badge>
      {isTwitter && xHandle ? (
        <a
          href={`https://x.com/${xHandle}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`text-xs text-blue-600 hover:underline truncate ${maxWidth}`}
          title={cleanHandle}
        >
          {cleanHandle}
        </a>
      ) : (
        <span className={`text-xs text-ink-warm-700 truncate ${maxWidth}`}>
          {cleanHandle}
        </span>
      )}
    </div>
  );
}
