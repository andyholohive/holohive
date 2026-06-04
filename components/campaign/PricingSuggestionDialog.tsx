'use client';

/**
 * PricingSuggestionDialog — opens when a KOL with prior payments is
 * selected in the Record Payment dialog OR when content is created
 * that auto-spawns payment rows. Asks the user whether to use the
 * KOL's last payment amount.
 *
 * Two modes:
 *   - `payment-dialog`: accepts the suggestion and pushes the amount
 *     back into the Record Payment dialog via an imperative handle.
 *   - `content-created`: accepts the suggestion and writes the
 *     amount to the auto-created payment rows in the DB.
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02. The
 * dialog state slice (`pricingSuggestionDialog`) lives on the page
 * because both the Record Payment dialog and the Content table
 * cell editor fire it.
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
import { supabase } from '@/lib/supabase';
import type {
  PricingSuggestionDialogState,
} from '@/contexts/CampaignDetailContext';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import type { RecordPaymentDialogHandle } from '@/components/campaign/RecordPaymentDialog';

interface PricingSuggestionDialogProps {
  state: PricingSuggestionDialogState;
  onClose: () => void;
  /** Imperative handle to the Record Payment dialog, used to push
   *  the accepted amount back into its internal form. */
  recordPaymentDialogRef: React.RefObject<RecordPaymentDialogHandle>;
}

export function PricingSuggestionDialog({
  state,
  onClose,
  recordPaymentDialogRef,
}: PricingSuggestionDialogProps) {
  const { campaignKOLs, setCampaignKOLs, fetchPayments, toast } = useCampaignDetail();

  const onAccept = async () => {
    if (!state) return;
    const { kolId, latestCost, paymentIndex, paymentIds, mode } = state;

    if (mode === 'payment-dialog') {
      // Push the accepted amount back into the Record Payment dialog's
      // internal form via its imperative handle. The dialog owns
      // `multiKOLPayments`.
      recordPaymentDialogRef.current?.applyPricingSuggestion(kolId, paymentIndex, latestCost);
    } else if (mode === 'content-created' && paymentIds && paymentIds.length > 0) {
      // Update the auto-created payment rows in the DB.
      try {
        for (const paymentId of paymentIds) {
          await supabase
            .from('payments')
            .update({ amount: latestCost } as any)
            .eq('id', paymentId);
        }
        // Also bump the KOL's paid total.
        const kol = campaignKOLs.find(k => k.id === kolId);
        if (kol) {
          const currentPaid = kol.paid || 0;
          const newPaid = currentPaid + (latestCost * paymentIds.length);
          await supabase
            .from('campaign_kols')
            .update({ paid: newPaid } as any)
            .eq('id', kolId);
          setCampaignKOLs(prev => prev.map(k =>
            k.id === kolId ? { ...k, paid: newPaid } : k,
          ));
        }
        fetchPayments();
        toast({
          title: 'Payments updated',
          description: `Updated ${paymentIds.length} payment(s) to $${latestCost.toLocaleString()}.`,
        });
      } catch (error) {
        console.error('Error updating payments:', error);
        toast({
          title: 'Update failed',
          description: error instanceof Error ? error.message : 'Failed to update payment amounts',
          variant: 'destructive',
        });
      }
    }
    onClose();
  };

  return (
    <Dialog open={state?.open || false} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Use Latest Pricing?</DialogTitle>
          <DialogDescription>
            {state?.kolName}'s last payment was <strong>${state?.latestCost?.toLocaleString()}</strong>. Would you like to use this amount?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onClose}>
            No, Enter Manually
          </Button>
          <Button variant="brand" onClick={onAccept}>
            Yes, Use ${state?.latestCost?.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
