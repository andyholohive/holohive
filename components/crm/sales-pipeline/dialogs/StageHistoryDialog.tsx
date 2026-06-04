'use client';

/**
 * StageHistoryDialog — vertical timeline of every stage transition
 * for the currently-focused opportunity. Sourced from
 * `crm_stage_history` (written by `recordStageHistory()` in
 * crmService on every `updateOpportunity` stage change).
 *
 * Triggered from the slide-over's "history" icon button; once open
 * it floats on top of the slide-over (z-[80] > z-[70]).
 *
 * Layout:
 *   - 3-line skeleton while loading
 *   - "No history recorded yet." centered text when empty
 *   - Vertical timeline (left rail + dot per entry) when present.
 *     Each entry shows from→to badges, timestamp + actor, and
 *     optional notes.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was rendered
 * inside `renderSlideOver`'s portal fragment, restored from the
 * legacy /crm/pipeline) on 2026-06-02 as part of Phase 3 of the
 * structural split. Now rendered in the page-level dialog cluster
 * so it stays mounted independent of slide-over open/closed state
 * — visibility is still controlled by `stageHistoryOpen`.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Clock, History } from 'lucide-react';
import { format } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  STAGE_LABELS,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';

export function StageHistoryDialog() {
  const {
    stageHistoryOpen,
    setStageHistoryOpen,
    stageHistory,
    stageHistoryLoading,
    slideOverOpp,
    getUserName,
  } = useSalesPipeline();

  return (
    <Dialog open={stageHistoryOpen} onOpenChange={setStageHistoryOpen}>
      <DialogContent className="max-w-lg z-[80]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand" />
            Stage History
          </DialogTitle>
          <DialogDescription>
            Timeline for <span className="font-medium">{slideOverOpp?.name}</span>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[420px]">
          <div className="space-y-4 py-2">
            {stageHistoryLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : stageHistory.length === 0 ? (
              <p className="text-center text-sm text-ink-warm-500 py-6">No history recorded yet.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-1 bottom-1 w-0.5 bg-cream-200" />
                {stageHistory.map(entry => (
                  <div key={entry.id} className="relative pl-10 pb-4">
                    <div className="absolute left-2.5 top-1.5 w-3 h-3 bg-white border-2 border-cream-300 rounded-full" />
                    <div className="bg-cream-50 rounded-lg p-3 border border-cream-100">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {entry.from_stage ? (
                          <>
                            <Badge variant="outline" className="text-[10px] bg-white">
                              {STAGE_LABELS[entry.from_stage as SalesPipelineStage] || entry.from_stage}
                            </Badge>
                            <ArrowRight className="h-3 w-3 text-ink-warm-400" />
                            <Badge className="text-[10px] bg-brand text-white">
                              {STAGE_LABELS[entry.to_stage as SalesPipelineStage] || entry.to_stage}
                            </Badge>
                          </>
                        ) : (
                          <Badge className="text-[10px] bg-brand text-white">
                            Created as {STAGE_LABELS[entry.to_stage as SalesPipelineStage] || entry.to_stage}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-warm-500 flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {format(new Date(entry.changed_at), 'MMM d, yyyy h:mm a')}
                        {entry.changed_by && (
                          <>· <span className="text-ink-warm-700">{getUserName(entry.changed_by)}</span></>
                        )}
                      </p>
                      {entry.notes && (
                        <p className="text-xs text-ink-warm-700 mt-1 whitespace-pre-wrap">{entry.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => setStageHistoryOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
