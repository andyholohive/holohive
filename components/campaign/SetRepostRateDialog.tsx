'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

export interface SetRepostRateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  masterKolId: string | null | undefined;
  kolName: string;

  /** KOL's standard_rate — used to pre-fill 50%. */
  masterStandardRate?: number | null;

  /** Existing repost_rate (edit mode). Null = first-time setup. */
  currentRepostRate?: number | null;

  /**
   * Called after master_kols.repost_rate is saved successfully.
   * Receives the saved rate.
   */
  onSaved?: (rate: number) => void;
}

/**
 * Prompt to set master_kols.repost_rate when a content is flipped to
 * QRT (repost) for the first time. Mirrors the SetPaymentTermsDialog
 * pattern but is simpler — repost is a global per-KOL rate, not per
 * campaign, so there's only one column to write.
 *
 * Behavior:
 *  - First-time: pre-filled with 50% of master_kols.standard_rate
 *  - Edit: pre-filled with currentRepostRate
 *  - Cancel: leaves repost_rate null (caller's QRT is still saved,
 *    but the budget falls back to standard_rate * 0.5 until set).
 *
 * Writes to: master_kols.repost_rate
 */
export default function SetRepostRateDialog({
  open,
  onOpenChange,
  masterKolId,
  kolName,
  masterStandardRate,
  currentRepostRate,
  onSaved,
}: SetRepostRateDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const suggestion =
    currentRepostRate ??
    (masterStandardRate != null ? Math.round(masterStandardRate * 0.5 * 100) / 100 : null);

  const hasSuggestion = suggestion !== null && suggestion !== undefined;

  // Reset state when dialog opens with new props
  useEffect(() => {
    if (open) {
      setAmount(hasSuggestion ? String(suggestion) : '');
    }
  }, [open, suggestion, hasSuggestion]);

  const parsedAmount = (() => {
    const n = parseFloat(amount);
    return Number.isFinite(n) && n >= 0 ? n : null;
  })();

  const handleSave = async () => {
    if (parsedAmount === null) {
      toast({
        title: 'Invalid amount',
        description: 'Enter a number (0 or greater).',
        variant: 'destructive',
      });
      return;
    }
    if (!masterKolId) {
      toast({
        title: 'Missing KOL',
        description: 'No KOL profile linked to this content.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('master_kols')
        .update({ repost_rate: parsedAmount })
        .eq('id', masterKolId);

      if (error) throw error;

      toast({
        title: 'Repost rate set',
        description:
          parsedAmount === 0
            ? `${kolName}: reposts are free / WL`
            : `${kolName}: $${parsedAmount.toLocaleString()} per repost`,
      });

      onSaved?.(parsedAmount);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving repost rate:', err);
      toast({
        title: 'Save failed',
        description: err?.message ?? 'Failed to save repost rate',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set repost rate</DialogTitle>
          <DialogDescription>
            {currentRepostRate != null ? (
              <>Confirm the repost rate for <strong>{kolName}</strong>.</>
            ) : masterStandardRate != null ? (
              <>
                <strong>{kolName}</strong> just had content marked as a repost (QRT).
                Default suggestion is 50% of their standard rate — confirm or edit
                below to save as their repost rate for future budget calcs.
              </>
            ) : (
              <>
                Enter the repost rate for <strong>{kolName}</strong>. This rate
                will apply to every future QRT/repost in the Budget Dashboard.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="repost-rate-amount">Rate per repost (USD)</Label>
            <div className="relative mt-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="repost-rate-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-9 focus-brand"
                autoFocus
                disabled={saving}
              />
            </div>
            {masterStandardRate != null && currentRepostRate == null && (
              <p className="text-xs text-gray-500 mt-1">
                Standard rate: ${Number(masterStandardRate).toLocaleString()} · 50% suggestion: ${Number(suggestion).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Use 0 for free / WL / comped reposts.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || parsedAmount === null || !masterKolId}
            style={{ backgroundColor: 'var(--brand)', color: 'white' }}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
