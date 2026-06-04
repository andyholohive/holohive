'use client';

/**
 * BumpCounter — the 4-dot sky tile inside the slide-over's view mode,
 * visible only for cold_dm-stage opportunities. Shows current
 * `bump_number / 4`, supports `-` / `+ Bump` buttons that fire the
 * page's handlers, and surfaces "Last bump: 3d ago" when set.
 *
 * Extracted from `OpportunitySlideOver.tsx` 2026-06-03 (Pass 1 of the
 * slide-over slice) — purely presentational, takes the opp as a prop
 * and reaches into context for the bump callbacks + spinner flag.
 */

import { Button } from '@/components/ui/button';
import { Loader2, Minus, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import type { SalesPipelineOpportunity } from '@/lib/salesPipelineService';

interface BumpCounterProps {
  opp: SalesPipelineOpportunity;
}

export function BumpCounter({ opp }: BumpCounterProps) {
  const { handleRecordBump, handleReduceBump, isBumping } = useSalesPipeline();

  if (opp.stage !== 'cold_dm') return null;

  return (
    <div className="bg-sky-50 rounded-lg border border-sky-200 p-4">
      <h4 className="text-xs font-semibold text-sky-700 uppercase tracking-wider mb-3">Bump Progress</h4>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border-2 ${i <= opp.bump_number ? 'bg-sky-500 border-sky-500' : 'bg-white border-sky-300'}`}
              />
            ))}
          </div>
          <span className="text-sm font-medium text-sky-800">{opp.bump_number} / 4 bumps</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-sky-300 text-sky-700 hover:bg-sky-100"
            onClick={() => handleReduceBump(opp.id)}
            disabled={opp.bump_number <= 0 || isBumping}
          >
            {isBumping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minus className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 border-sky-300 text-sky-700 hover:bg-sky-100 text-xs font-medium"
            onClick={() => handleRecordBump(opp.id)}
            disabled={isBumping}
          >
            {isBumping ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />} Bump
          </Button>
        </div>
      </div>
      {opp.last_bump_date && (
        <p className="text-xs text-sky-600 mt-2">
          Last bump: {formatDistanceToNow(new Date(opp.last_bump_date), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
