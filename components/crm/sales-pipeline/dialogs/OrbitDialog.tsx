'use client';

/**
 * OrbitDialog — prompt shown when an opportunity is moved to the
 * Orbit stage. Captures the reason (dropdown from `ORBIT_REASONS`)
 * + the follow-up window in days.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderOrbitPrompt`) on 2026-06-02 as part of Phase 3 of the
 * structural split. Consumes the four `orbit*` fields +
 * `confirmOrbit` from `SalesPipelineContext`.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import { ORBIT_REASONS, type OrbitReason } from '@/lib/salesPipelineService';

export function OrbitDialog() {
  const {
    orbitPrompt,
    setOrbitPrompt,
    orbitReasonValue,
    setOrbitReasonValue,
    orbitFollowupDays,
    setOrbitFollowupDays,
    confirmOrbit,
  } = useSalesPipeline();

  return (
    <Dialog open={!!orbitPrompt} onOpenChange={open => { if (!open) setOrbitPrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Move to Orbit</DialogTitle>
          <DialogDescription>Select the reason for moving this opportunity to orbit.</DialogDescription>
        </DialogHeader>
        <Select value={orbitReasonValue} onValueChange={v => setOrbitReasonValue(v as OrbitReason)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ORBIT_REASONS.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <label className="text-sm font-medium mb-1 block">Follow up in X days</label>
          <Input
            type="number"
            min={1}
            value={orbitFollowupDays}
            onChange={e => setOrbitFollowupDays(Math.max(1, parseInt(e.target.value) || 90))}
          />
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => { setOrbitPrompt(null); setOrbitFollowupDays(90); }}>Cancel</Button>
          <Button variant="brand" onClick={confirmOrbit}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
