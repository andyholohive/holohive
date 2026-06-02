'use client';

/**
 * EditPaymentDialog — opens from the Budget Table view's row edit
 * pencil (via the `handleEditPayment` callback exposed through
 * `useCampaignDetail()`). Lets the user change KOL / amount / date /
 * method / linked content / transaction_id / notes on an existing
 * payment row.
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02. Owns
 * the form state (`newPaymentData`) + the open flag externally as
 * `open` / `onOpenChange` props paired with the original payment as
 * `payment`. The Update handler writes back to supabase and adjusts
 * the affected KOL's paid total.
 */

import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import {
  formatDateLocal,
  formatDisplayDate,
} from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { MultiSelect } from '@/components/campaign/MultiSelect';

interface EditPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The payment row being edited. The form pre-populates from this
   *  when the dialog opens. Null clears the form. */
  payment: any | null;
}

const EMPTY_FORM = {
  campaign_kol_id: '',
  amount: 0,
  payment_date: '',
  payment_method: 'Fiat',
  content_id: 'none' as string | string[],
  transaction_id: '',
  notes: '',
};

export function EditPaymentDialog({ open, onOpenChange, payment }: EditPaymentDialogProps) {
  const {
    campaignKOLs,
    setCampaignKOLs,
    contents,
    setPayments,
    toast,
  } = useCampaignDetail();

  const [form, setForm] = useState(EMPTY_FORM);

  // Pre-populate from `payment` whenever the dialog re-opens.
  useEffect(() => {
    if (payment) {
      setForm({
        campaign_kol_id: payment.campaign_kol_id || '',
        amount: payment.amount || 0,
        payment_date: payment.payment_date || '',
        payment_method: payment.payment_method || 'Fiat',
        content_id: payment.content_id || 'none',
        transaction_id: payment.transaction_id || '',
        notes: payment.notes || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [payment]);

  const handleUpdatePayment = async () => {
    if (!payment) return;
    try {
      const oldAmount = payment.amount;
      const newAmount = form.amount;

      const { error } = await supabase
        .from('payments')
        .update({
          campaign_kol_id: form.campaign_kol_id,
          amount: newAmount,
          payment_date: form.payment_date,
          payment_method: form.payment_method,
          content_id: (() => {
            if (Array.isArray(form.content_id)) {
              return form.content_id.length > 0 ? form.content_id : null;
            }
            return form.content_id === 'none' ? null : (form.content_id ? [form.content_id] : null);
          })(),
          transaction_id: form.transaction_id || null,
          notes: form.notes || null,
        } as any)
        .eq('id', payment.id);

      if (error) throw error;

      // Update the affected KOL's paid total.
      const currentKol = campaignKOLs.find(kol => kol.id === form.campaign_kol_id);
      const currentPaid = currentKol?.paid || 0;
      const newPaid = currentPaid - oldAmount + newAmount;

      await supabase
        .from('campaign_kols')
        .update({ paid: newPaid } as any)
        .eq('id', form.campaign_kol_id);

      setCampaignKOLs(prev => prev.map(kol =>
        kol.id === form.campaign_kol_id ? { ...kol, paid: newPaid } : kol,
      ));

      setPayments(prev => prev.map(p =>
        p.id === payment.id ? {
          ...p,
          campaign_kol_id: form.campaign_kol_id,
          amount: newAmount,
          payment_date: form.payment_date,
          payment_method: form.payment_method,
          content_id: form.content_id === 'none' ? null : form.content_id,
          transaction_id: form.transaction_id || null,
          notes: form.notes || null,
        } : p,
      ));

      onOpenChange(false);
      toast({ title: 'Success', description: 'Payment updated successfully.' });
    } catch (err) {
      console.error('Error updating payment:', err);
      toast({ title: 'Error', description: 'Failed to update payment.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Payment</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
          <div className="grid gap-2">
            <Label htmlFor="edit-kol">KOL</Label>
            <Select
              value={form.campaign_kol_id}
              onValueChange={(value) => setForm(prev => ({ ...prev, campaign_kol_id: value }))}
            >
              <SelectTrigger className="focus-brand">
                <SelectValue placeholder="Select KOL" />
              </SelectTrigger>
              <SelectContent>
                {campaignKOLs.map((kol: any) => (
                  <SelectItem key={kol.id} value={kol.id}>
                    {kol.master_kol?.name || 'Unknown KOL'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-amount">Amount (USD)</Label>
            <div className="relative w-full">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
              <Input
                id="edit-amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9,]*"
                className="focus-brand pl-6 w-full"
                value={form.amount ? Number(form.amount).toLocaleString('en-US') : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setForm(prev => ({ ...prev, amount: parseFloat(raw) || 0 }));
                }}
                placeholder="Enter amount"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Payment Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`focus-brand justify-start text-left font-normal h-9 ${form.payment_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.payment_date ? formatDisplayDate(form.payment_date) : 'Select payment date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="!bg-white border shadow-md w-auto p-0 z-50" align="start">
                <CalendarComponent
                  mode="single"
                  selected={form.payment_date ? new Date(form.payment_date) : undefined}
                  onSelect={date => setForm(prev => ({
                    ...prev,
                    payment_date: date ? formatDateLocal(date) : '',
                  }))}
                  initialFocus
                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-payment-method">Payment Method</Label>
            <Select
              value={form.payment_method}
              onValueChange={(value) => setForm(prev => ({ ...prev, payment_method: value }))}
            >
              <SelectTrigger className="focus-brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Token">Token</SelectItem>
                <SelectItem value="Fiat">Fiat</SelectItem>
                <SelectItem value="WL">WL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-content">Content</Label>
            <MultiSelect
              options={contents
                .filter((content: any) => content.campaign_kols_id === form.campaign_kol_id)
                .map((content: any) => content.id)}
              selected={Array.isArray(form.content_id) ? form.content_id : (form.content_id && form.content_id !== 'none' ? [form.content_id] : [])}
              onSelectedChange={(selectedIds) => setForm(prev => ({ ...prev, content_id: selectedIds as any }))}
              className="focus-brand"
              triggerContent={
                <div>
                  {(() => {
                    const selectedIds = Array.isArray(form.content_id) ? form.content_id : (form.content_id && form.content_id !== 'none' ? [form.content_id] : []);
                    if (selectedIds.length === 0) {
                      return <span className="text-ink-warm-400">Select content</span>;
                    }
                    const selectedContents = contents.filter((c: any) => selectedIds.includes(c.id));
                    return (
                      <span className="text-sm">
                        {selectedContents.length} content{selectedContents.length !== 1 ? 's' : ''} selected
                      </span>
                    );
                  })()}
                </div>
              }
              renderOption={(contentId) => {
                const content = contents.find((c: any) => c.id === contentId);
                if (!content) return contentId;
                return `${content.type || 'Content'} - ${content.platform || 'Unknown'}${content.activation_date ? ` (${formatDisplayDate(content.activation_date)})` : ''}`;
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-transaction-id">Transaction ID (Optional)</Label>
            <Input
              id="edit-transaction-id"
              value={form.transaction_id}
              onChange={(e) => setForm(prev => ({ ...prev, transaction_id: e.target.value }))}
              placeholder="Enter transaction ID"
              className="focus-brand"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-notes">Notes (Optional)</Label>
            <Textarea
              id="edit-notes"
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add any notes about this payment"
              rows={3}
              className="focus-brand"
            />
          </div>
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" onClick={handleUpdatePayment} disabled={!form.campaign_kol_id || form.amount <= 0}>
            Update Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
