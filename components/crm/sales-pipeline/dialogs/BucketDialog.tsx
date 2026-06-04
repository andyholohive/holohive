'use client';

/**
 * BucketDialog — prompt shown after a discovery call to assign the
 * opportunity a qualification bucket: A (hot), B (warm), or C (low).
 *
 * Renders three large segmented buttons (A/B/C) instead of a dropdown
 * so the qualification choice reads at a glance — the v11 pass over
 * this folder will reconsider the inline tint classes (still uses
 * border-emerald/amber/gray instead of StatusBadge tones).
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderBucketPrompt`) on 2026-06-02 as part of Phase 3 of the
 * structural split. Consumes the three `bucket*` fields +
 * `confirmBucket` from `SalesPipelineContext`.
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
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import type { Bucket } from '@/lib/salesPipelineService';

export function BucketDialog() {
  const {
    bucketPrompt,
    setBucketPrompt,
    bucketValue,
    setBucketValue,
    confirmBucket,
  } = useSalesPipeline();

  return (
    <Dialog open={!!bucketPrompt} onOpenChange={open => { if (!open) setBucketPrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Assign Bucket</DialogTitle>
          <DialogDescription>How qualified is {bucketPrompt?.oppName} after the discovery call?</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          {(['A', 'B', 'C'] as Bucket[]).map(b => (
            <button
              key={b}
              onClick={() => setBucketValue(b)}
              className={`flex-1 py-3 rounded-lg text-center font-semibold text-lg border-2 transition-all ${
                bucketValue === b
                  ? b === 'A' ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : b === 'B' ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-cream-300 bg-cream-50 text-ink-warm-700'
                  : 'border-cream-200 text-ink-warm-400 hover:border-cream-300'
              }`}
            >
              {b}
              <div className="text-[10px] font-normal mt-0.5">
                {b === 'A' ? 'Hot' : b === 'B' ? 'Warm' : 'Low'}
              </div>
            </button>
          ))}
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => setBucketPrompt(null)}>Cancel</Button>
          <Button variant="brand" onClick={confirmBucket}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
