'use client';

/**
 * RecordPaymentDialog — extracted from `app/campaigns/[id]/page.tsx`
 * on 2026-06-02 as the third dialog moved into its own file (after
 * AddKOLsDialog and the Add Content dead-code scrub).
 *
 * Owns all form state for both modes (KOL Payment / Other Expense)
 * and both submit handlers. Reads shared data + writes back via
 * `useCampaignDetail()`. The page provides one side-effect callback
 * — `triggerPaymentNotification` — that the dialog calls after a
 * date is picked on a KOL with a linked Telegram chat + wallet +
 * non-zero amount; the actual notification confirmation sub-dialog
 * stays on the page where it already lives.
 *
 * Trigger button stays in the Budget tab's toolbar; the page renders
 * the button + this component side-by-side and threads `open` /
 * `onOpenChange` between them.
 */

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
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
import { Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  formatDateLocal,
  formatDisplayDate,
} from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { MultiSelect } from '@/components/campaign/MultiSelect';

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Imperative handle for the page-level pricing-suggestion dialog to
 * push an accepted suggestion ("use $X for this KOL's payment") back
 * into this dialog's internal form state. The pricing dialog lives
 * on the page because it's also fired from the Content table cell
 * editor (different flow), so it can't access the form state via
 * normal React composition. The `forwardRef` + `useImperativeHandle`
 * pattern keeps the dialog's internal state encapsulated while still
 * letting the page poke a known method when needed.
 */
export interface RecordPaymentDialogHandle {
  applyPricingSuggestion: (kolId: string, paymentIndex: number, amount: number) => void;
}

type PerPaymentRow = {
  amount: number;
  payment_date: string;
  payment_method: string;
  content_id: string | string[];
  transaction_id: string;
  notes: string;
};

type MultiKOLPayments = {
  [kolId: string]: {
    number_of_payments: number;
    payments: PerPaymentRow[];
  };
};

const EMPTY_PAYMENT_ROW: PerPaymentRow = {
  amount: 0,
  payment_date: '',
  payment_method: 'Fiat',
  content_id: 'none',
  transaction_id: '',
  notes: '',
};

// [2026-06-23] Widened to include 'activation' + 'prize_pool' so the
// Budget Dashboard's Activation tile can read non-zero. Prior to this,
// every Other-Expense write defaulted to 'other' and totals.activation
// was structurally pinned at $0 (BudgetDashboardV2.tsx:67).
type NonKolCategory = 'activation' | 'prize_pool' | 'operational' | 'other';

const NON_KOL_CATEGORY_OPTIONS: { value: NonKolCategory; label: string }[] = [
  { value: 'activation',  label: 'Activation' },
  { value: 'prize_pool',  label: 'Prize Pool' },
  { value: 'operational', label: 'Operational' },
  { value: 'other',       label: 'Other' },
];

const DEFAULT_NON_KOL_PAYMENT = {
  recipient_name: '',
  payment_category: 'other' as NonKolCategory,
  amount: 0,
  payment_date: '',
  payment_method: 'Fiat',
  transaction_id: '',
  wallet: '',
  notes: '',
};

export const RecordPaymentDialog = forwardRef<RecordPaymentDialogHandle, RecordPaymentDialogProps>(function RecordPaymentDialog(
  { open, onOpenChange },
  ref,
) {
  const {
    campaign,
    campaignKOLs,
    setCampaignKOLs,
    contents,
    latestCostMap,
    kolTelegramChats,
    fetchPayments,
    setPricingSuggestionDialog,
    triggerPaymentNotification,
    toast,
  } = useCampaignDetail();

  const [paymentType, setPaymentType] = useState<'kol' | 'other'>('kol');
  const [selectedKOLsForPayment, setSelectedKOLsForPayment] = useState<string[]>([]);
  const [multiKOLPayments, setMultiKOLPayments] = useState<MultiKOLPayments>({});
  const [nonKOLPayment, setNonKOLPayment] = useState(DEFAULT_NON_KOL_PAYMENT);

  // Exposed to the page so the pricing-suggestion sub-dialog can push
  // an accepted amount back into our `multiKOLPayments` form. See the
  // RecordPaymentDialogHandle interface above for the contract.
  useImperativeHandle(ref, () => ({
    applyPricingSuggestion: (kolId, paymentIndex, amount) => {
      setMultiKOLPayments(prev => {
        const currentPayments = [...(prev[kolId]?.payments || [])];
        if (currentPayments[paymentIndex]) {
          currentPayments[paymentIndex] = {
            ...currentPayments[paymentIndex],
            amount,
          };
        }
        return {
          ...prev,
          [kolId]: { ...prev[kolId], payments: currentPayments },
        };
      });
    },
  }), []);

  // ── Reset form state when the dialog closes. Called from Cancel
  //    button + the Dialog's `onOpenChange(false)`. Keeps "open it
  //    again" in a clean state. ─────────────────────────────────
  const resetForm = () => {
    setSelectedKOLsForPayment([]);
    setMultiKOLPayments({});
    setPaymentType('kol');
    setNonKOLPayment(DEFAULT_NON_KOL_PAYMENT);
  };

  // ── Date-selection side effect: set the date in form state, then
  //    if the KOL has linked Telegram + wallet + non-zero amount,
  //    fire the page's Payment Notification confirmation sub-dialog
  //    via the context callback. ────────────────────────────────
  const handlePaymentDateSelect = (
    date: Date | undefined,
    kolId: string,
    paymentIndex: number,
    payment: PerPaymentRow,
  ) => {
    if (!date) {
      setMultiKOLPayments(prev => {
        const newPayments = [...(prev[kolId]?.payments || [])];
        newPayments[paymentIndex] = { ...newPayments[paymentIndex], payment_date: '' };
        return { ...prev, [kolId]: { ...prev[kolId], payments: newPayments } };
      });
      return;
    }

    const kol = campaignKOLs.find(k => k.id === kolId);
    const masterKolId = kol?.master_kol?.id;
    const telegramChat = masterKolId ? kolTelegramChats[masterKolId] : null;
    const wallet = (kol?.master_kol as any)?.wallet;
    const amount = payment.amount;

    // Always set the date first.
    setMultiKOLPayments(prev => {
      const newPayments = [...(prev[kolId]?.payments || [])];
      newPayments[paymentIndex] = { ...newPayments[paymentIndex], payment_date: formatDateLocal(date) };
      return { ...prev, [kolId]: { ...prev[kolId], payments: newPayments } };
    });

    if (!telegramChat) {
      toast({
        title: 'No Telegram chat linked',
        description: `${kol?.master_kol?.name || 'This KOL'} doesn't have a linked Telegram chat`,
      });
      return;
    }
    if (!wallet) {
      toast({
        title: 'No wallet address',
        description: `${kol?.master_kol?.name || 'This KOL'} doesn't have a wallet address set`,
      });
      return;
    }
    if (!amount || amount <= 0) {
      toast({
        title: 'No payment amount',
        description: 'Please enter a payment amount first',
      });
      return;
    }

    triggerPaymentNotification({
      kolId,
      kolName: kol?.master_kol?.name || 'Unknown KOL',
      paymentIndex,
      amount,
      wallet,
      chatId: telegramChat.chat_id,
      chatTitle: telegramChat.title,
      date,
    });
  };

  // ── Submit: batch-insert payments for all selected KOLs, then
  //    update each KOL's `paid` total and refetch the payment list.
  const handleAddMultiKOLPayments = async () => {
    if (selectedKOLsForPayment.length === 0) {
      toast({ title: 'No KOL selected', description: 'Select at least one KOL.', variant: 'destructive' });
      return;
    }

    const missingData = selectedKOLsForPayment.filter(kolId => {
      const kolData = multiKOLPayments[kolId];
      if (!kolData || !kolData.payments) return true;
      return kolData.payments.some(p => !p.amount || p.amount <= 0);
    });

    if (missingData.length > 0) {
      toast({ title: 'Missing amounts', description: 'Fill in amount for all payments.', variant: 'destructive' });
      return;
    }

    try {
      const paymentInserts = selectedKOLsForPayment.flatMap(kolId => {
        const kolData = multiKOLPayments[kolId];
        if (!kolData || !kolData.payments) return [];

        return kolData.payments.map(payment => ({
          campaign_id: campaign?.id,
          campaign_kol_id: kolId,
          amount: payment.amount,
          payment_date: payment.payment_date || new Date().toISOString().split('T')[0],
          payment_method: payment.payment_method || 'Token',
          content_id: (() => {
            if (Array.isArray(payment.content_id)) {
              return payment.content_id.length > 0 ? payment.content_id : null;
            }
            return payment.content_id === 'none' ? null : (payment.content_id ? [payment.content_id] : null);
          })(),
          transaction_id: payment.transaction_id || null,
          notes: payment.notes || null,
        }));
      });

      const { error } = await supabase
        .from('payments')
        .insert(paymentInserts as any)
        .select();

      if (error) throw error;

      // Update each KOL's paid total.
      for (const kolId of selectedKOLsForPayment) {
        const kolData = multiKOLPayments[kolId];
        if (!kolData || !kolData.payments) continue;

        const currentKol = campaignKOLs.find(kol => kol.id === kolId);
        const currentPaid = currentKol?.paid || 0;
        const totalAmount = kolData.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const newPaid = currentPaid + totalAmount;

        await supabase
          .from('campaign_kols')
          .update({ paid: newPaid })
          .eq('id', kolId);

        setCampaignKOLs(prev => prev.map(kol =>
          kol.id === kolId ? { ...kol, paid: newPaid } : kol,
        ));
      }

      fetchPayments();
      resetForm();
      onOpenChange(false);
      toast({
        title: 'Payments recorded',
        description: `${paymentInserts.length} payment record(s) created for ${selectedKOLsForPayment.length} KOL(s).`,
      });
    } catch (err) {
      console.error('Error adding payments:', err);
      toast({ title: 'Record failed', description: err instanceof Error ? err.message : 'Failed to record payments', variant: 'destructive' });
    }
  };

  const handleAddNonKOLPayment = async () => {
    if (!nonKOLPayment.recipient_name.trim()) {
      toast({ title: 'Recipient required', variant: 'destructive' });
      return;
    }
    if (!nonKOLPayment.amount || nonKOLPayment.amount <= 0) {
      toast({ title: 'Valid amount required', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase
        .from('payments')
        .insert({
          campaign_id: campaign?.id,
          campaign_kol_id: null,
          recipient_name: nonKOLPayment.recipient_name.trim(),
          payment_category: nonKOLPayment.payment_category,
          amount: nonKOLPayment.amount,
          payment_date: nonKOLPayment.payment_date || new Date().toISOString().split('T')[0],
          payment_method: nonKOLPayment.payment_method || 'Token',
          transaction_id: nonKOLPayment.transaction_id || null,
          wallet: nonKOLPayment.wallet || null,
          notes: nonKOLPayment.notes || null,
        } as any)
        .select();

      if (error) throw error;

      fetchPayments();
      resetForm();
      onOpenChange(false);
      toast({ title: 'Payment recorded' });
    } catch (err) {
      console.error('Error adding non-KOL payment:', err);
      toast({ title: 'Record failed', description: err instanceof Error ? err.message : 'Failed to record payment', variant: 'destructive' });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Record Payment(s)</DialogTitle>
          <p className="text-sm text-ink-warm-500 mt-1">
            {paymentType === 'kol' ? 'Select one or more KOLs and enter payment details for each' : 'Record a non-KOL expense or payment'}
          </p>
        </DialogHeader>

        {/* Payment Type Toggle */}
        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            variant={paymentType === 'kol' ? 'brand' : 'outline'}
            size="sm"
            onClick={() => setPaymentType('kol')}
          >
            KOL Payment
          </Button>
          <Button
            type="button"
            variant={paymentType === 'other' ? 'brand' : 'outline'}
            size="sm"
            onClick={() => setPaymentType('other')}
          >
            Other Expense
          </Button>
        </div>

        <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
          {paymentType === 'kol' ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="kol-select">Select KOLs</Label>
              <div className="border border-cream-200 rounded-[14px] p-3 max-h-64 overflow-y-auto space-y-2 bg-cream-50/30">
                {campaignKOLs.map((kol) => (
                  <div
                    key={kol.id}
                    className="flex items-center space-x-3 p-2 hover:bg-cream-50 rounded"
                  >
                    <Checkbox
                      checked={selectedKOLsForPayment.includes(kol.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedKOLsForPayment(prev => [...prev, kol.id]);
                          setMultiKOLPayments(prev => ({
                            ...prev,
                            [kol.id]: {
                              number_of_payments: 1,
                              payments: [{ ...EMPTY_PAYMENT_ROW }],
                            },
                          }));
                          // Suggestion dialog if KOL has a latest cost.
                          const masterKolId = kol.master_kol?.id;
                          const latestCost = masterKolId ? latestCostMap.get(masterKolId) : undefined;
                          if (latestCost && latestCost > 0) {
                            setPricingSuggestionDialog({
                              open: true,
                              kolId: kol.id,
                              kolName: kol.master_kol?.name || 'Unknown',
                              masterKolId: masterKolId!,
                              latestCost,
                              paymentIndex: 0,
                              mode: 'payment-dialog',
                            });
                          }
                        } else {
                          setSelectedKOLsForPayment(prev => prev.filter(id => id !== kol.id));
                          setMultiKOLPayments(prev => {
                            const next = { ...prev };
                            delete next[kol.id];
                            return next;
                          });
                        }
                      }}
                    />
                    <span className="font-medium flex-1">
                      {kol.master_kol.name}
                      {latestCostMap.get(kol.master_kol?.id) != null && latestCostMap.get(kol.master_kol?.id)! > 0 && (
                        <span className="ml-2 text-xs text-ink-warm-500">
                          (Latest: ${latestCostMap.get(kol.master_kol?.id)?.toLocaleString()})
                        </span>
                      )}
                    </span>
                    {selectedKOLsForPayment.includes(kol.id) && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-ink-warm-700 whitespace-nowrap">Payments:</Label>
                        <Input
                          type="number"
                          min="1"
                          className="w-16 h-8 text-xs"
                          value={multiKOLPayments[kol.id]?.number_of_payments || 1}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const num = Math.max(1, parseInt(e.target.value) || 1);
                            setMultiKOLPayments(prev => {
                              const currentPayments = prev[kol.id]?.payments || [];
                              const newPayments = Array.from({ length: num }, (_, i) => (
                                currentPayments[i] || { ...EMPTY_PAYMENT_ROW }
                              ));
                              return {
                                ...prev,
                                [kol.id]: { number_of_payments: num, payments: newPayments },
                              };
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Per-KOL payment details */}
            {selectedKOLsForPayment.length > 0 && (
              <div className="space-y-6 border-t pt-4">
                <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Payment Details</h3>
                {selectedKOLsForPayment.map((kolId) => {
                  const kol = campaignKOLs.find(k => k.id === kolId);
                  if (!kol) return null;
                  const kolData = multiKOLPayments[kolId];
                  if (!kolData) return null;
                  const numberOfPayments = kolData.number_of_payments || 1;
                  const payments = kolData.payments || [];

                  return (
                    <div key={kolId} className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-cream-200">
                        <h4 className="display-serif text-[15px] text-brand-deep leading-tight">{kol.master_kol.name}</h4>
                        <span className="text-sm text-ink-warm-500">({numberOfPayments} payment{numberOfPayments > 1 ? 's' : ''})</span>
                      </div>

                      {payments.map((payment, paymentIndex) => (
                        <div key={paymentIndex} className="border border-cream-200 rounded-[14px] p-4 space-y-4 bg-cream-50/60 shadow-card">
                          {numberOfPayments > 1 && (
                            <div className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500 border-b border-cream-200 pb-2">
                              Payment {paymentIndex + 1} of {numberOfPayments}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label>Amount (USD) <RequiredAsterisk /></Label>
                              <div className="relative w-full">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9,]*"
                                  className="focus-brand pl-6 w-full"
                                  value={payment.amount ? Number(payment.amount).toLocaleString('en-US') : ''}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                    setMultiKOLPayments(prev => {
                                      const newPayments = [...(prev[kolId]?.payments || [])];
                                      newPayments[paymentIndex] = { ...newPayments[paymentIndex], amount: parseFloat(raw) || 0 };
                                      return { ...prev, [kolId]: { ...prev[kolId], payments: newPayments } };
                                    });
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
                                    className={`focus-brand justify-start text-left font-normal h-9 ${payment.payment_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {payment.payment_date ? formatDisplayDate(payment.payment_date) : 'Select payment date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="!bg-white border shadow-md w-auto p-0 z-50" align="start">
                                  <CalendarComponent
                                    mode="single"
                                    selected={payment.payment_date ? new Date(payment.payment_date) : undefined}
                                    onSelect={date => handlePaymentDateSelect(date, kolId, paymentIndex, payment)}
                                    initialFocus
                                    classNames={{
                                      day_selected: 'text-white hover:text-white focus:text-white',
                                    }}
                                    modifiersStyles={{
                                      selected: { backgroundColor: '#3e8692' },
                                    }}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>

                            <div className="grid gap-2">
                              <Label>Payment Method</Label>
                              <Select
                                value={payment.payment_method || 'Token'}
                                onValueChange={(value) => {
                                  setMultiKOLPayments(prev => {
                                    const newPayments = [...(prev[kolId]?.payments || [])];
                                    newPayments[paymentIndex] = { ...newPayments[paymentIndex], payment_method: value };
                                    return { ...prev, [kolId]: { ...prev[kolId], payments: newPayments } };
                                  });
                                }}
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
                              <Label>Content</Label>
                              <MultiSelect
                                options={contents
                                  .filter(content => content.campaign_kols_id === kolId)
                                  .map(content => content.id)}
                                selected={Array.isArray(payment.content_id) ? payment.content_id : (payment.content_id ? [payment.content_id] : [])}
                                onSelectedChange={(selectedIds) => {
                                  setMultiKOLPayments(prev => {
                                    const newPayments = [...(prev[kolId]?.payments || [])];
                                    newPayments[paymentIndex] = { ...newPayments[paymentIndex], content_id: selectedIds };
                                    return { ...prev, [kolId]: { ...prev[kolId], payments: newPayments } };
                                  });
                                }}
                                className="focus-brand"
                                triggerContent={
                                  <div>
                                    {(() => {
                                      const selectedIds = Array.isArray(payment.content_id) ? payment.content_id : (payment.content_id ? [payment.content_id] : []);
                                      if (selectedIds.length === 0) {
                                        return <span className="text-ink-warm-400">Select content</span>;
                                      }
                                      const selectedContents = contents.filter(c => selectedIds.includes(c.id));
                                      return (
                                        <span className="text-sm">
                                          {selectedContents.length} content{selectedContents.length !== 1 ? 's' : ''} selected
                                        </span>
                                      );
                                    })()}
                                  </div>
                                }
                                renderOption={(contentId) => {
                                  const content = contents.find(c => c.id === contentId);
                                  if (!content) return contentId;
                                  return `${content.type || 'Content'} - ${content.platform || 'Unknown'}${content.activation_date ? ` (${formatDisplayDate(content.activation_date)})` : ''}`;
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid gap-2">
                            <Label>Transaction ID (Optional)</Label>
                            <Input
                              value={payment.transaction_id || ''}
                              onChange={(e) => {
                                setMultiKOLPayments(prev => {
                                  const newPayments = [...(prev[kolId]?.payments || [])];
                                  newPayments[paymentIndex] = { ...newPayments[paymentIndex], transaction_id: e.target.value };
                                  return { ...prev, [kolId]: { ...prev[kolId], payments: newPayments } };
                                });
                              }}
                              placeholder="Enter transaction ID"
                              className="focus-brand"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label>Notes (Optional)</Label>
                            <Textarea
                              value={payment.notes || ''}
                              onChange={(e) => {
                                setMultiKOLPayments(prev => {
                                  const newPayments = [...(prev[kolId]?.payments || [])];
                                  newPayments[paymentIndex] = { ...newPayments[paymentIndex], notes: e.target.value };
                                  return { ...prev, [kolId]: { ...prev[kolId], payments: newPayments } };
                                });
                              }}
                              placeholder="Add any notes about this payment"
                              rows={2}
                              className="focus-brand"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
          ) : (
          /* Non-KOL Payment Form */
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Recipient Name <RequiredAsterisk /></Label>
              <Input
                placeholder="e.g., Venue Rental, Equipment, Agency Fee"
                value={nonKOLPayment.recipient_name}
                onChange={(e) => setNonKOLPayment(prev => ({ ...prev, recipient_name: e.target.value }))}
                className="focus-brand"
              />
            </div>

            {/* Category — drives which Budget Dashboard tile this rolls
                up under: 'activation' + 'prize_pool' → Activation tile,
                'operational' + 'other' → Expenses tile. */}
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={nonKOLPayment.payment_category}
                onValueChange={(value) => setNonKOLPayment(prev => ({ ...prev, payment_category: value as NonKolCategory }))}
              >
                <SelectTrigger className="focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NON_KOL_CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Amount (USD) <RequiredAsterisk /></Label>
                <div className="relative w-full">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9,]*"
                    className="focus-brand pl-6 w-full"
                    value={nonKOLPayment.amount ? Number(nonKOLPayment.amount).toLocaleString('en-US') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setNonKOLPayment(prev => ({ ...prev, amount: parseFloat(raw) || 0 }));
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
                      className={`focus-brand justify-start text-left font-normal h-9 ${nonKOLPayment.payment_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {nonKOLPayment.payment_date ? formatDisplayDate(nonKOLPayment.payment_date) : 'Select payment date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="!bg-white border shadow-md w-auto p-0 z-50" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={nonKOLPayment.payment_date ? new Date(nonKOLPayment.payment_date) : undefined}
                      onSelect={date => {
                        setNonKOLPayment(prev => ({ ...prev, payment_date: date ? formatDateLocal(date) : '' }));
                      }}
                      initialFocus
                      classNames={{
                        day_selected: 'text-white hover:text-white focus:text-white',
                      }}
                      modifiersStyles={{
                        selected: { backgroundColor: '#3e8692' },
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Payment Method</Label>
                <Select
                  value={nonKOLPayment.payment_method}
                  onValueChange={(value) => setNonKOLPayment(prev => ({ ...prev, payment_method: value }))}
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
                <Label>Transaction ID</Label>
                <Input
                  placeholder="Optional"
                  value={nonKOLPayment.transaction_id}
                  onChange={(e) => setNonKOLPayment(prev => ({ ...prev, transaction_id: e.target.value }))}
                  className="focus-brand"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Wallet</Label>
              <Input
                placeholder="Optional wallet address"
                value={nonKOLPayment.wallet}
                onChange={(e) => setNonKOLPayment(prev => ({ ...prev, wallet: e.target.value }))}
                className="focus-brand"
              />
            </div>

            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes"
                value={nonKOLPayment.notes}
                onChange={(e) => setNonKOLPayment(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                className="focus-brand"
              />
            </div>
          </div>
          )}
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => {
            resetForm();
            onOpenChange(false);
          }}>
            Cancel
          </Button>
          <Button
            variant="brand"
            onClick={paymentType === 'kol' ? handleAddMultiKOLPayments : handleAddNonKOLPayment}
            disabled={paymentType === 'kol' ? selectedKOLsForPayment.length === 0 : !nonKOLPayment.recipient_name.trim() || !nonKOLPayment.amount}
          >
            {paymentType === 'kol'
              ? `Record ${selectedKOLsForPayment.length > 0 ? `${selectedKOLsForPayment.length} Payment${selectedKOLsForPayment.length > 1 ? 's' : ''}` : 'Payment'}`
              : 'Record Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
