'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

export interface SetPaymentTermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  campaignKolId: string;
  masterKolId: string | null | undefined;
  kolName: string;

  /** Latest payment amount for this KOL (from any campaign). */
  latestPaymentAmount?: number | null;
  /** KOL's standard_rate stored on the master profile. */
  masterStandardRate?: number | null;
  /** Current agreed_rate on this campaign_kol (edit mode). */
  currentAgreedRate?: number | null;

  /**
   * Called after agreed_rate is saved successfully.
   * Receives the saved rate and whether master_kols.standard_rate was also updated.
   */
  onSaved?: (rate: number, updatedMaster: boolean) => void;
}

/**
 * Prompt the user to set payment terms for a KOL in a campaign.
 *
 * Behavior:
 *  - No prior data (no latest payment, no master standard rate) → "Enter the budget"
 *  - Prior data exists → pre-filled with the best suggestion (priority:
 *    currentAgreedRate > masterStandardRate > latestPaymentAmount), editable.
 *  - Offers a checkbox to also save the value to master_kols.standard_rate
 *    when it's new/different from what's there today.
 *
 * Writes to:
 *  - campaign_kols.agreed_rate (always)
 *  - master_kols.standard_rate (when checkbox is checked)
 */
export default function SetPaymentTermsDialog({
  open,
  onOpenChange,
  campaignKolId,
  masterKolId,
  kolName,
  latestPaymentAmount,
  masterStandardRate,
  currentAgreedRate,
  onSaved,
}: SetPaymentTermsDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [updateMaster, setUpdateMaster] = useState(false);
  const [saving, setSaving] = useState(false);

  const suggestion =
    currentAgreedRate ??
    masterStandardRate ??
    latestPaymentAmount ??
    null;

  const hasSuggestion = suggestion !== null && suggestion !== undefined;
  const source: 'current' | 'master' | 'latest' | null =
    currentAgreedRate != null ? 'current' :
    masterStandardRate != null ? 'master' :
    latestPaymentAmount != null ? 'latest' :
    null;

  // Reset state when dialog opens with new props
  useEffect(() => {
    if (open) {
      setAmount(hasSuggestion ? String(suggestion) : '');
      // Default the "update master" checkbox on when master is currently empty
      // and we're entering a brand-new rate.
      setUpdateMaster(masterStandardRate == null);
    }
  }, [open, suggestion, hasSuggestion, masterStandardRate]);

  const parsedAmount = (() => {
    const n = parseFloat(amount);
    return Number.isFinite(n) && n >= 0 ? n : null;
  })();

  const differsFromMaster =
    masterStandardRate == null || parsedAmount !== masterStandardRate;

  // Only offer the "update master" checkbox when it would actually do something
  const showMasterToggle = !!masterKolId && differsFromMaster;

  const handleSave = async () => {
    if (parsedAmount === null) {
      toast({
        title: 'Invalid amount',
        description: 'Enter a number (0 or greater).',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // 1. Save to campaign_kols.agreed_rate
      const { error: ckError } = await (supabase as any)
        .from('campaign_kols')
        .update({ agreed_rate: parsedAmount })
        .eq('id', campaignKolId);

      if (ckError) throw ckError;

      // 2. Optionally update master_kols.standard_rate
      let updatedMaster = false;
      if (updateMaster && masterKolId && differsFromMaster) {
        const { error: mkError } = await (supabase as any)
          .from('master_kols')
          .update({ standard_rate: parsedAmount })
          .eq('id', masterKolId);

        if (mkError) {
          // Campaign update succeeded but master update failed — surface the error
          // but don't roll back the campaign change (it's still useful).
          console.error('Failed to update master standard rate:', mkError);
          toast({
            title: 'Saved campaign rate',
            description: 'But failed to update master standard rate — please retry from the KOL profile.',
            variant: 'destructive',
          });
        } else {
          updatedMaster = true;
        }
      }

      toast({
        title: 'Payment terms set',
        description:
          parsedAmount === 0
            ? `${kolName}: free / WL`
            : `${kolName}: $${parsedAmount.toLocaleString()} per content`,
      });

      onSaved?.(parsedAmount, updatedMaster);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving payment terms:', err);
      toast({
        title: 'Error',
        description: err?.message ?? 'Failed to save payment terms',
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
          <DialogTitle>Set payment terms</DialogTitle>
          <DialogDescription>
            {hasSuggestion ? (
              <>
                Confirm the rate for <strong>{kolName}</strong>. We pre-filled it
                based on{' '}
                {source === 'current'
                  ? 'the current campaign rate'
                  : source === 'master'
                  ? "this KOL's standard rate"
                  : 'their most recent payment'}
                .
              </>
            ) : (
              <>
                Enter the budget for <strong>{kolName}</strong>. This rate will
                pre-fill payment rows whenever new content is added for them.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="payment-terms-amount">Rate per content (USD)</Label>
            <div className="relative mt-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="payment-terms-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-9 auth-input"
                autoFocus
                disabled={saving}
              />
            </div>
            {hasSuggestion && source !== 'current' && (
              <p className="text-xs text-gray-500 mt-1">
                {source === 'master' ? 'Standard rate' : 'Latest payment'}:
                {' '}${Number(suggestion).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Use 0 for free / WL / comped placements.
            </p>
          </div>

          {showMasterToggle && (
            <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <Checkbox
                id="update-master"
                checked={updateMaster}
                onCheckedChange={(v) => setUpdateMaster(v === true)}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label
                  htmlFor="update-master"
                  className="text-sm font-medium cursor-pointer"
                >
                  Also save as {kolName}&apos;s standard rate
                </Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  {masterStandardRate == null
                    ? 'No standard rate is set on this KOL yet — save this one as default.'
                    : `Will replace the current standard rate of $${masterStandardRate.toLocaleString()}.`}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || parsedAmount === null}
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save terms
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
