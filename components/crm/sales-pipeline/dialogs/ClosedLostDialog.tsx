'use client';

/**
 * ClosedLostDialog — prompt shown when an opportunity is marked
 * Closed Lost. Captures an optional reason string.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderClosedLostPrompt`) on 2026-06-02 as part of Phase 3 of
 * the structural split. Consumes the three `closedLost*` fields
 * + `confirmClosedLost` from `SalesPipelineContext`.
 *
 * Uses `variant="destructive"` on the confirm button since this is
 * a terminal/negative action.
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';

export function ClosedLostDialog() {
  const {
    closedLostPrompt,
    setClosedLostPrompt,
    closedLostReasonValue,
    setClosedLostReasonValue,
    confirmClosedLost,
  } = useSalesPipeline();

  return (
    <Dialog open={!!closedLostPrompt} onOpenChange={open => { if (!open) setClosedLostPrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Close as Lost</DialogTitle>
          <DialogDescription>Optionally add a reason for closing this opportunity.</DialogDescription>
        </DialogHeader>
        <Input
          value={closedLostReasonValue}
          onChange={e => setClosedLostReasonValue(e.target.value)}
          placeholder="Reason (optional)"
        />
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => setClosedLostPrompt(null)}>Cancel</Button>
          <Button onClick={confirmClosedLost} variant="destructive">Close Lost</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
