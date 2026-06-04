'use client';

/**
 * TgHandleDialog — small prompt shown when an opportunity is moved
 * to a stage that requires a Telegram handle (tg_intro). Single text
 * input + Cancel / Confirm footer.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderTgHandlePrompt`) on 2026-06-02 as the first dialog in
 * Phase 3 of the structural refactor. Consumes the four
 * `tgHandle*` fields + `confirmTgHandle` from `SalesPipelineContext`
 * — opening / closing is driven entirely by `tgHandlePrompt`'s
 * non-null state so nothing else needs to plumb visibility.
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

export function TgHandleDialog() {
  const {
    tgHandlePrompt,
    setTgHandlePrompt,
    tgHandleValue,
    setTgHandleValue,
    confirmTgHandle,
  } = useSalesPipeline();

  return (
    <Dialog open={!!tgHandlePrompt} onOpenChange={open => { if (!open) setTgHandlePrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Enter TG Handle</DialogTitle>
          <DialogDescription>Enter the Telegram handle for {tgHandlePrompt?.oppName}.</DialogDescription>
        </DialogHeader>
        <Input
          value={tgHandleValue}
          onChange={e => setTgHandleValue(e.target.value)}
          placeholder="@handle"
          autoFocus
          className="focus-brand"
        />
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => setTgHandlePrompt(null)}>Cancel</Button>
          <Button variant="brand" onClick={confirmTgHandle} disabled={!tgHandleValue.trim()} className="text-white">Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
