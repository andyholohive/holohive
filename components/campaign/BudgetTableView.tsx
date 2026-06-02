'use client';

/**
 * BudgetTableView — the Table view of the Budget tab. Renders the
 * payments table with per-cell inline editing, per-column filter
 * dropdowns, bulk-action toolbar, the Overdue quick filter, CSV
 * export, and the bulk-delete + single-delete confirmation dialogs.
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02 — the
 * last big sub-piece of the Budget tab body. Companion to
 * BudgetOverview (the read-only Graph view). Reads `campaign`,
 * `campaignKOLs`, `payments`, `contents`, `paymentKolNameLookup`,
 * `kolTelegramChats`, `setPayments`, `setCampaignKOLs`,
 * `triggerPaymentNotification`, plus the cell-selection helpers, all
 * from `useCampaignDetail()`. Internal state owns the sort + filter
 * + selection + inline-edit + delete-dialog slots.
 */

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar as CalendarIcon,
  ChevronDown,
  Copy,
  DollarSign,
  Download,
  Edit,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

type PaymentSortField = 'kol' | 'wallet' | 'amount' | 'payment_date' | 'date' | 'payment_method' | 'method' | 'content' | 'notes' | null;

export function BudgetTableView() {
  const {
    campaign,
    campaignKOLs,
    setCampaignKOLs,
    contents,
    payments,
    setPayments,
    loadingPayments,
    paymentKolNameLookup,
    kolTelegramChats,
    triggerPaymentNotification,
    handleEditPayment,
    isCellSelected,
    getCellClassName,
    handleCellSelect,
    toast,
  } = useCampaignDetail();

  // ── Filter / sort / search state ───────────────────────────────
  const [paymentsSearchTerm, setPaymentsSearchTerm] = useState('');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [paymentSort, setPaymentSort] = useState<{ field: PaymentSortField; direction: 'asc' | 'desc' }>({ field: null, direction: 'asc' });
  const [paymentFilters, setPaymentFilters] = useState({
    kol_ids: [] as string[],
    payment_methods: [] as string[],
    has_content: '' as string,
    amount_operator: '' as string,
    amount_value: '' as string,
  });

  // ── Bulk-action state ──────────────────────────────────────────
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState('');

  // ── Inline cell-edit state ─────────────────────────────────────
  const [editingPaymentCell, setEditingPaymentCell] = useState<{ paymentId: string; field: string } | null>(null);
  const [editingPaymentValue, setEditingPaymentValue] = useState<any>(null);

  // Wallet cell uses its own state because master_kol.wallet lives
  // on a different table from payments — the edit handler has to
  // update master_kols, not payments.
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [editingWallet, setEditingWallet] = useState<{ [key: string]: string }>({});
  const walletOpenedAtRef = useRef<Record<string, number>>({});
  const walletInputRef = useRef<HTMLInputElement | null>(null);

  // ── Delete dialog state ────────────────────────────────────────
  const [showPaymentDeleteDialog, setShowPaymentDeleteDialog] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<any | null>(null);
  const [showBulkDeletePaymentsDialog, setShowBulkDeletePaymentsDialog] = useState(false);

  // Table scroll ref — internal to this component.
  const paymentTableRef = useRef<HTMLDivElement>(null);

  // ── Derived ────────────────────────────────────────────────────

  /** Payment classification used by the Overdue quick filter +
   *  the per-row indicator badge. Mirrors the payment_reminder
   *  rule's intent (paid = date set; overdue = unpaid + content
   *  posted; pending = unpaid + content not yet live). */
  const getPaymentStatus = (payment: any): 'paid' | 'overdue' | 'pending' => {
    if (payment.payment_date) return 'paid';
    const contentIds: string[] = Array.isArray(payment.content_id)
      ? payment.content_id
      : (payment.content_id ? [payment.content_id] : []);
    if (contentIds.length === 0) return 'pending';
    const hasPostedLinkedContent = contentIds.some(cid => {
      const c = contents.find((co: any) => co.id === cid);
      return c && typeof c.status === 'string' && c.status.toLowerCase() === 'posted';
    });
    return hasPostedLinkedContent ? 'overdue' : 'pending';
  };

  const overdueCount = payments.filter(p => getPaymentStatus(p) === 'overdue').length;

  // ── Sort + filter handlers ─────────────────────────────────────

  const togglePaymentSort = (field: Exclude<PaymentSortField, null>) => {
    setPaymentSort(prev => {
      if (prev.field !== field) return { field, direction: 'asc' };
      if (prev.direction === 'asc') return { field, direction: 'desc' };
      return { field: null, direction: 'asc' };
    });
  };

  const paymentSortIndicator = (field: Exclude<PaymentSortField, null>) => {
    if (paymentSort.field !== field) {
      return <ArrowUpDown className="inline-block h-3 w-3 ml-1 opacity-30" />;
    }
    return paymentSort.direction === 'asc'
      ? <ArrowUp className="inline-block h-3 w-3 ml-1" />
      : <ArrowDown className="inline-block h-3 w-3 ml-1" />;
  };

  /** Filtered + sorted payments — single derivation used by every
   *  consumer (the row render, the bulk-select-all helper, the
   *  count badge, the CSV export). */
  const getFilteredPayments = (): any[] => {
    let filtered = payments.filter(payment => {
      // Search term
      if (paymentsSearchTerm) {
        const search = paymentsSearchTerm.toLowerCase();
        const lookup = payment.campaign_kol_id ? paymentKolNameLookup.get(payment.campaign_kol_id) : undefined;
        const kolName = lookup?.name || payment.recipient_name || '';
        if (
          !kolName.toLowerCase().includes(search) &&
          !(payment.payment_method || '').toLowerCase().includes(search) &&
          !(payment.notes || '').toLowerCase().includes(search) &&
          !(payment.transaction_id || '').toLowerCase().includes(search)
        ) return false;
      }
      // KOL filter
      if (paymentFilters.kol_ids.length > 0 && !paymentFilters.kol_ids.includes(payment.campaign_kol_id)) return false;
      // Method filter
      if (paymentFilters.payment_methods.length > 0 && !paymentFilters.payment_methods.includes(payment.payment_method)) return false;
      // Content filter
      if (paymentFilters.has_content === 'with') {
        const ids = Array.isArray(payment.content_id) ? payment.content_id : (payment.content_id ? [payment.content_id] : []);
        if (ids.length === 0) return false;
      } else if (paymentFilters.has_content === 'without') {
        const ids = Array.isArray(payment.content_id) ? payment.content_id : (payment.content_id ? [payment.content_id] : []);
        if (ids.length > 0) return false;
      }
      // Amount filter
      if (paymentFilters.amount_operator && paymentFilters.amount_value) {
        const v = parseFloat(paymentFilters.amount_value);
        if (paymentFilters.amount_operator === '>') {
          if (!(payment.amount > v)) return false;
        } else if (paymentFilters.amount_operator === '<') {
          if (!(payment.amount < v)) return false;
        } else if (paymentFilters.amount_operator === '=') {
          if (payment.amount !== v) return false;
        }
      }
      // Overdue
      if (showOverdueOnly && getPaymentStatus(payment) !== 'overdue') return false;
      return true;
    });

    if (paymentSort.field) {
      const dir = paymentSort.direction === 'asc' ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        let av: any;
        let bv: any;
        switch (paymentSort.field) {
          case 'kol': {
            const al = paymentKolNameLookup.get(a.campaign_kol_id);
            const bl = paymentKolNameLookup.get(b.campaign_kol_id);
            av = al?.name || a.recipient_name || '';
            bv = bl?.name || b.recipient_name || '';
            break;
          }
          case 'wallet': {
            const ak = campaignKOLs.find(k => k.id === a.campaign_kol_id);
            const bk = campaignKOLs.find(k => k.id === b.campaign_kol_id);
            av = (ak?.master_kol as any)?.wallet || '';
            bv = (bk?.master_kol as any)?.wallet || '';
            break;
          }
          case 'amount':
            av = a.amount ?? 0;
            bv = b.amount ?? 0;
            break;
          case 'payment_date':
            av = a.payment_date ? new Date(a.payment_date).getTime() : 0;
            bv = b.payment_date ? new Date(b.payment_date).getTime() : 0;
            break;
          case 'payment_method':
            av = a.payment_method || '';
            bv = b.payment_method || '';
            break;
          case 'notes':
            av = a.notes || '';
            bv = b.notes || '';
            break;
          default:
            return 0;
        }
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    return filtered;
  };

  // ── Bulk action helpers ────────────────────────────────────────

  const handleSelectAllPayments = () => {
    const filtered = getFilteredPayments();
    const allIds = filtered.map(p => p.id);
    if (allIds.every(id => selectedPayments.includes(id))) {
      setSelectedPayments(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedPayments(prev => Array.from(new Set([...prev, ...allIds])));
    }
  };

  const handleBulkPaymentMethodChange = async () => {
    if (!bulkPaymentMethod || selectedPayments.length === 0) return;
    try {
      await Promise.all(selectedPayments.map(id =>
        supabase.from('payments').update({ payment_method: bulkPaymentMethod } as any).eq('id', id),
      ));
      setPayments(prev => prev.map(p => selectedPayments.includes(p.id) ? { ...p, payment_method: bulkPaymentMethod } : p));
      toast({ title: 'Method updated', description: `${selectedPayments.length} payment${selectedPayments.length !== 1 ? 's' : ''} updated` });
      setSelectedPayments([]);
      setBulkPaymentMethod('');
    } catch (err) {
      console.error('Error bulk-updating payments:', err);
      toast({ title: 'Error', description: 'Failed to update payments', variant: 'destructive' });
    }
  };

  // ── Inline cell save (text + select + date) ───────────────────

  const handlePaymentCellSave = async (payment: any, field: string, newValue: any) => {
    try {
      const saveValue = field === 'amount' ? (Number(newValue) || 0) : newValue;
      await supabase.from('payments').update({ [field]: saveValue } as any).eq('id', payment.id);
      setPayments(prev => prev.map(p => p.id === payment.id ? { ...p, [field]: saveValue } : p));

      setEditingPaymentCell(null);
      setEditingPaymentValue(null);

      // Telegram notification trigger when setting payment_date.
      if (field === 'payment_date' && newValue) {
        const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
        const masterKolId = kol?.master_kol?.id;
        const telegramChat = masterKolId ? kolTelegramChats[masterKolId] : null;
        const wallet = (kol?.master_kol as any)?.wallet;
        const amount = payment.amount;

        if (!telegramChat) {
          toast({ title: 'No Telegram chat linked', description: `${kol?.master_kol?.name || 'This KOL'} doesn't have a linked Telegram chat` });
        } else if (!wallet) {
          toast({ title: 'No wallet address', description: `${kol?.master_kol?.name || 'This KOL'} doesn't have a wallet address set` });
        } else if (!amount || amount <= 0) {
          toast({ title: 'No payment amount', description: 'Payment has no amount set' });
        } else {
          triggerPaymentNotification({
            kolId: payment.campaign_kol_id,
            kolName: kol?.master_kol?.name || 'Unknown KOL',
            paymentIndex: -1,
            amount,
            wallet,
            chatId: telegramChat.chat_id,
            chatTitle: telegramChat.title,
            date: new Date(newValue),
          });
          return;
        }
      }

      toast({ title: 'Success', description: 'Payment updated successfully' });
    } catch (error) {
      console.error('Error updating payment:', error);
      toast({ title: 'Error', description: 'Failed to update payment', variant: 'destructive' });
    }
  };

  // ── Renderer for editable payment cells ───────────────────────
  const renderEditablePaymentCell = (value: any, field: string, payment: any) => {
    const isEditing = editingPaymentCell?.paymentId === payment.id && editingPaymentCell?.field === field;
    const textFields = ['notes', 'transaction_id'];
    const numberFields = ['amount'];

    // payment_method: always-editable select.
    if (field === 'payment_method') {
      return (
        <Select
          value={value || ''}
          onValueChange={async v => {
            setEditingPaymentCell({ paymentId: payment.id, field });
            setEditingPaymentValue(v);
            await handlePaymentCellSave(payment, field, v);
          }}
        >
          <SelectTrigger className="border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none" style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}>
            <SelectValue>{value || '-'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Token">Token</SelectItem>
            <SelectItem value="Fiat">Fiat</SelectItem>
            <SelectItem value="WL">WL</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    // payment_date: popover + Calendar (always editable).
    if (field === 'payment_date') {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`w-full text-left px-1 py-1 ${value ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
            >
              {value ? formatDisplayDate(value) : 'Select date'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="!bg-white border shadow-md w-auto p-0 z-50" align="start">
            <CalendarComponent
              mode="single"
              selected={value ? new Date(value) : undefined}
              onSelect={(date) => handlePaymentCellSave(payment, field, date ? formatDateLocal(date) : '')}
              initialFocus
              classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
              modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
            />
          </PopoverContent>
        </Popover>
      );
    }

    // text / number fields: double-click to edit.
    if (isEditing && (textFields.includes(field) || numberFields.includes(field))) {
      return (
        <Input
          type={numberFields.includes(field) ? 'number' : 'text'}
          value={editingPaymentValue ?? ''}
          onChange={(e) => setEditingPaymentValue(e.target.value)}
          onBlur={() => handlePaymentCellSave(payment, field, editingPaymentValue)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handlePaymentCellSave(payment, field, editingPaymentValue);
            if (e.key === 'Escape') {
              setEditingPaymentCell(null);
              setEditingPaymentValue(null);
            }
          }}
          className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
          style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
          autoFocus
        />
      );
    }

    return (
      <div
        className="cursor-pointer w-full h-full flex items-center px-1 py-1"
        onDoubleClick={() => {
          if (textFields.includes(field) || numberFields.includes(field)) {
            setEditingPaymentCell({ paymentId: payment.id, field });
            setEditingPaymentValue(value);
          }
        }}
        title={textFields.includes(field) || numberFields.includes(field) ? 'Double-click to edit' : undefined}
      >
        {numberFields.includes(field) && value ? `$${Number(value).toLocaleString()}` : (value || '-')}
      </div>
    );
  };

  // ── Wallet inline edit (writes to master_kols, not payments) ──

  const handleWalletChange = (kolId: string, value: string) => {
    setEditingWallet(prev => ({ ...prev, [kolId]: value }));
  };

  const handleWalletSave = async (kolId: string) => {
    const wallet = editingWallet[kolId] ?? '';
    try {
      const campaignKOL = campaignKOLs.find(kol => kol.id === kolId);
      if (!campaignKOL?.master_kol?.id) return;
      const currentWallet = (campaignKOL.master_kol as any).wallet ?? '';
      if (wallet === currentWallet) {
        // Spurious blur right after autoFocus — guard via timestamp.
        const openedAt = walletOpenedAtRef.current[kolId];
        if (openedAt && Date.now() - openedAt < 300) {
          walletInputRef.current?.focus();
          return;
        }
        setEditingWalletId(null);
        return;
      }
      await supabase.from('master_kols').update({ wallet: wallet || null } as any).eq('id', campaignKOL.master_kol.id);
      // Reflect back into local campaignKOLs so the cell re-renders.
      setCampaignKOLs(prev => prev.map(k => k.id === kolId ? { ...k, master_kol: { ...k.master_kol, wallet } } : k));
      setEditingWalletId(null);
      toast({ title: 'Wallet updated' });
    } catch (error) {
      console.error('Error updating wallet:', error);
      toast({ title: 'Error', description: 'Failed to update wallet', variant: 'destructive' });
    }
  };

  // ── Delete handlers ────────────────────────────────────────────

  const handleDeletePayment = async (paymentId: string) => {
    try {
      const paymentToDel = payments.find(p => p.id === paymentId);
      if (!paymentToDel) return;
      await supabase.from('payments').delete().eq('id', paymentId);
      setPayments(prev => prev.filter(p => p.id !== paymentId));

      // Decrement the KOL's paid total.
      if (paymentToDel.campaign_kol_id && paymentToDel.amount) {
        const kol = campaignKOLs.find(k => k.id === paymentToDel.campaign_kol_id);
        if (kol) {
          const newPaid = Math.max(0, (kol.paid || 0) - paymentToDel.amount);
          await supabase.from('campaign_kols').update({ paid: newPaid } as any).eq('id', paymentToDel.campaign_kol_id);
          setCampaignKOLs(prev => prev.map(k => k.id === paymentToDel.campaign_kol_id ? { ...k, paid: newPaid } : k));
        }
      }

      toast({ title: 'Payment deleted' });
    } catch (err) {
      console.error('Error deleting payment:', err);
      toast({ title: 'Error', description: 'Failed to delete payment', variant: 'destructive' });
    }
  };

  // ── CSV export ─────────────────────────────────────────────────

  const exportPaymentsToCSV = () => {
    const filteredPayments = getFilteredPayments();
    if (filteredPayments.length === 0) {
      toast({ title: 'No data', description: 'No payments to export', variant: 'destructive' });
      return;
    }

    const headers = ['Name', 'Wallet', 'Amount (USD)', 'Payment Date', 'Payment Method', 'Transaction ID', 'Content', 'Notes'];
    const rows = filteredPayments.map(payment => {
      const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
      const lookupEntry = payment.campaign_kol_id ? paymentKolNameLookup.get(payment.campaign_kol_id) : undefined;
      const name = payment.campaign_kol_id
        ? (lookupEntry ? (lookupEntry.removed ? `${lookupEntry.name} (removed)` : lookupEntry.name) : 'Unknown KOL')
        : (payment.recipient_name || 'Unknown');
      const wallet = payment.campaign_kol_id
        ? ((kol?.master_kol as any)?.wallet || '')
        : (payment.wallet || '');
      const contentIds = Array.isArray(payment.content_id) ? payment.content_id : (payment.content_id ? [payment.content_id] : []);
      const contentNames = contentIds.map((id: string) => {
        const content = contents.find(c => c.id === id);
        return content ? `${content.platform || ''} - ${content.content_type || ''}` : id;
      }).join('; ');

      return [
        name,
        wallet,
        payment.amount || 0,
        payment.payment_date ? formatDisplayDate(payment.payment_date) : '',
        payment.payment_method || '',
        payment.transaction_id || '',
        contentNames,
        payment.notes || '',
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(cell => {
      const s = String(cell ?? '');
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `payments-${campaign?.name || 'campaign'}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                        <Input
                          placeholder="Search Payments by KOL, method, or notes..."
                          className="pl-10 focus-brand"
                          value={paymentsSearchTerm}
                          onChange={e => setPaymentsSearchTerm(e.target.value)}
                        />
                      </div>
                      {/* Overdue quick filter — content is posted but payment isn't recorded */}
                      <Button
                        variant={showOverdueOnly ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={() => setShowOverdueOnly(v => !v)}
                        className={showOverdueOnly ? '' : 'text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700'}
                        title={showOverdueOnly ? 'Showing overdue only — click to clear' : 'Show only payments where content is posted but payment is missing'}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                        {showOverdueOnly ? 'Overdue only' : 'Overdue'}
                        <span className={`ml-1.5 text-[10px] font-bold ${showOverdueOnly ? 'opacity-90' : ''}`}>
                          {overdueCount}
                        </span>
                      </Button>
                    </div>
                {selectedPayments.length > 0 && (
                <div className="mb-6 mt-6">
                  <div className="bg-white border border-cream-200 rounded-[14px] p-6 shadow-card">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-cream-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-ink-warm-700">{selectedPayments.length} Payment{selectedPayments.length !== 1 ? 's' : ''} selected</span>
                    </div>
                    <div className="h-4 w-px bg-cream-300"></div>
                    <span className="text-xs text-ink-warm-700 font-medium">Bulk Edit Fields</span>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col items-end justify-end">
                      <div className="h-5"></div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-ink-warm-700 border-cream-300 hover:bg-cream-50"
                        onClick={handleSelectAllPayments}
                      >
                        {(() => {
                          const filteredPayments = payments.filter(payment => {
                            const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                            const search = paymentsSearchTerm.toLowerCase();
                            return (
                              !search ||
                              (kol?.master_kol?.name?.toLowerCase().includes(search)) ||
                              (payment.payment_method?.toLowerCase().includes(search)) ||
                              (payment.notes?.toLowerCase().includes(search))
                            );
                          });
                          const allSelected = filteredPayments.length > 0 && filteredPayments.every(p => selectedPayments.includes(p.id));
                          return allSelected ? 'Deselect All' : 'Select All';
                        })()}
                      </Button>
                    </div>
                    <div className="min-w-[120px] flex flex-col items-end justify-end">
                      <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Payment Method</span>
                      <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                        <Select value={bulkPaymentMethod || ''} onValueChange={v => setBulkPaymentMethod(v)}>
                          <SelectTrigger
                            className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                            style={{ outline: 'none', boxShadow: 'none' }}
                          >
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Token">Token</SelectItem>
                            <SelectItem value="Fiat">Fiat</SelectItem>
                            <SelectItem value="WL">WL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          variant="brand" className="whitespace-nowrap"
                          disabled={selectedPayments.length === 0 || !bulkPaymentMethod}
                          onClick={handleBulkPaymentMethodChange}
                        >
                          Apply
                        </Button>
                      </div>
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          variant="destructive" className="whitespace-nowrap"
                          disabled={selectedPayments.length === 0}
                          onClick={() => setShowBulkDeletePaymentsDialog(true)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-ink-warm-500 font-medium ml-auto whitespace-nowrap">
                      {selectedPayments.length > 0 && `${selectedPayments.length} item${selectedPayments.length !== 1 ? 's' : ''} selected`}
                    </div>
                  </div>
                  </div>
                </div>
                )}
                {loadingPayments ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-[250px]" />
                          <Skeleton className="h-4 w-[200px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {payments.length === 0 ? (
                      <div className="text-center py-8 text-ink-warm-500">
                        <DollarSign className="h-12 w-12 mx-auto mb-4 text-ink-warm-300" />
                        <p className="text-lg font-medium mb-2">No payments recorded</p>
                        <p className="text-sm text-ink-warm-400">Payments recorded for this campaign will appear here.</p>
                      </div>
                    ) : (
                      <div ref={paymentTableRef} className="border rounded-lg" style={{ overflow: 'auto', overflowX: 'auto', overflowY: 'auto' }}>
                        <Table className="min-w-full" style={{ tableLayout: 'auto', width: 'auto', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                          <TableHeader>
                            <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-center whitespace-nowrap group cursor-pointer hover:bg-cream-100 transition-colors w-14 min-w-[3.5rem]" onClick={handleSelectAllPayments}>
                                <span className="group-hover:hidden">#</span>
                                <Checkbox
                                  className="hidden group-hover:inline-flex"
                                  checked={(() => {
                                    const filteredPayments = getFilteredPayments();
                                    return filteredPayments.length > 0 && filteredPayments.every(p => selectedPayments.includes(p.id));
                                  })()}
                                />
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-left select-none">
                                <div className="flex items-center gap-1 group">
                                  <button
                                    type="button"
                                    onClick={() => togglePaymentSort('kol')}
                                    className="flex items-center gap-1 hover:text-ink-warm-900"
                                    title="Sort by KOL name"
                                  >
                                    <span>KOL</span>
                                    {paymentSort.field === 'kol' ? (
                                      paymentSort.direction === 'asc'
                                        ? <ArrowUp className="h-3 w-3" />
                                        : <ArrowDown className="h-3 w-3" />
                                    ) : (
                                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                                    )}
                                  </button>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[250px] p-0" align="start">
                                      <div className="p-3">
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter KOL</div>
                                        <div className="max-h-48 overflow-y-auto space-y-1">
                                          {campaignKOLs.map((kol) => (
                                            <div
                                              key={kol.id}
                                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                              onClick={() => {
                                                const newKolIds = paymentFilters.kol_ids.includes(kol.id)
                                                  ? paymentFilters.kol_ids.filter(id => id !== kol.id)
                                                  : [...paymentFilters.kol_ids, kol.id];
                                                setPaymentFilters(prev => ({ ...prev, kol_ids: newKolIds }));
                                              }}
                                            >
                                              <Checkbox checked={paymentFilters.kol_ids.includes(kol.id)} />
                                              <span className="text-sm">{kol.master_kol.name}</span>
                                            </div>
                                          ))}
                                        </div>
                                        {paymentFilters.kol_ids.length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full mt-2 text-xs"
                                            onClick={() => setPaymentFilters(prev => ({ ...prev, kol_ids: [] }))}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {paymentFilters.kol_ids.length > 0 && (
                                    <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {paymentFilters.kol_ids.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                                <button
                                  type="button"
                                  onClick={() => togglePaymentSort('wallet')}
                                  className="flex items-center gap-1 group hover:text-ink-warm-900"
                                  title="Sort by wallet address"
                                >
                                  <span>Wallet</span>
                                  {paymentSort.field === 'wallet' ? (
                                    paymentSort.direction === 'asc'
                                      ? <ArrowUp className="h-3 w-3" />
                                      : <ArrowDown className="h-3 w-3" />
                                  ) : (
                                    <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                                  )}
                                </button>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                                <div className="flex items-center gap-1 group">
                                  <button
                                    type="button"
                                    onClick={() => togglePaymentSort('amount')}
                                    className="flex items-center gap-1 hover:text-ink-warm-900"
                                    title="Sort by amount"
                                  >
                                    <span>Amount</span>
                                    {paymentSort.field === 'amount' ? (
                                      paymentSort.direction === 'asc'
                                        ? <ArrowUp className="h-3 w-3" />
                                        : <ArrowDown className="h-3 w-3" />
                                    ) : (
                                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                                    )}
                                  </button>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0" align="start">
                                      <div className="p-3">
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Amount (USD)</div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <Select
                                            value={paymentFilters.amount_operator}
                                            onValueChange={(value) => setPaymentFilters(prev => ({ ...prev, amount_operator: value }))}
                                          >
                                            <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                              <SelectValue placeholder="=" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value=">">{'>'}</SelectItem>
                                              <SelectItem value="<">{'<'}</SelectItem>
                                              <SelectItem value="=">=</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <Input
                                            type="number"
                                            placeholder="Value"
                                            value={paymentFilters.amount_value}
                                            onChange={(e) => setPaymentFilters(prev => ({ ...prev, amount_value: e.target.value }))}
                                            className="h-8 text-xs focus-brand"
                                          />
                                        </div>
                                        {(paymentFilters.amount_operator || paymentFilters.amount_value) && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full text-xs"
                                            onClick={() => setPaymentFilters(prev => ({ ...prev, amount_operator: '', amount_value: '' }))}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {(paymentFilters.amount_operator && paymentFilters.amount_value) && (
                                    <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      1
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                                <button
                                  type="button"
                                  onClick={() => togglePaymentSort('date')}
                                  className="flex items-center gap-1 group hover:text-ink-warm-900"
                                  title="Sort by payment date (unpaid rows sort last)"
                                >
                                  <span>Payment Date</span>
                                  {paymentSort.field === 'date' ? (
                                    paymentSort.direction === 'asc'
                                      ? <ArrowUp className="h-3 w-3" />
                                      : <ArrowDown className="h-3 w-3" />
                                  ) : (
                                    <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                                  )}
                                </button>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                                <div className="flex items-center gap-1 group">
                                  <button
                                    type="button"
                                    onClick={() => togglePaymentSort('method')}
                                    className="flex items-center gap-1 hover:text-ink-warm-900"
                                    title="Sort by payment method"
                                  >
                                    <span>Method</span>
                                    {paymentSort.field === 'method' ? (
                                      paymentSort.direction === 'asc'
                                        ? <ArrowUp className="h-3 w-3" />
                                        : <ArrowDown className="h-3 w-3" />
                                    ) : (
                                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                                    )}
                                  </button>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0" align="start">
                                      <div className="p-3">
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Method</div>
                                        {['Token', 'Fiat', 'WL'].map((method) => (
                                          <div
                                            key={method}
                                            className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                            onClick={() => {
                                              const newMethods = paymentFilters.payment_methods.includes(method)
                                                ? paymentFilters.payment_methods.filter(m => m !== method)
                                                : [...paymentFilters.payment_methods, method];
                                              setPaymentFilters(prev => ({ ...prev, payment_methods: newMethods }));
                                            }}
                                          >
                                            <Checkbox checked={paymentFilters.payment_methods.includes(method)} />
                                            <span className="text-sm">{method}</span>
                                          </div>
                                        ))}
                                        {paymentFilters.payment_methods.length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full mt-2 text-xs"
                                            onClick={() => setPaymentFilters(prev => ({ ...prev, payment_methods: [] }))}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {paymentFilters.payment_methods.length > 0 && (
                                    <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {paymentFilters.payment_methods.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                                <div className="flex items-center gap-1 group">
                                  <button
                                    type="button"
                                    onClick={() => togglePaymentSort('content')}
                                    className="flex items-center gap-1 hover:text-ink-warm-900"
                                    title="Sort by linked content count"
                                  >
                                    <span>Content</span>
                                    {paymentSort.field === 'content' ? (
                                      paymentSort.direction === 'asc'
                                        ? <ArrowUp className="h-3 w-3" />
                                        : <ArrowDown className="h-3 w-3" />
                                    ) : (
                                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                                    )}
                                  </button>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0" align="start">
                                      <div className="p-3">
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Content</div>
                                        <div
                                          className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                          onClick={() => {
                                            setPaymentFilters(prev => ({
                                              ...prev,
                                              has_content: prev.has_content === 'yes' ? '' : 'yes'
                                            }));
                                          }}
                                        >
                                          <Checkbox checked={paymentFilters.has_content === 'yes'} />
                                          <span className="text-sm">Has content linked</span>
                                        </div>
                                        <div
                                          className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                          onClick={() => {
                                            setPaymentFilters(prev => ({
                                              ...prev,
                                              has_content: prev.has_content === 'no' ? '' : 'no'
                                            }));
                                          }}
                                        >
                                          <Checkbox checked={paymentFilters.has_content === 'no'} />
                                          <span className="text-sm">No content linked</span>
                                        </div>
                                        {paymentFilters.has_content && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full mt-2 text-xs"
                                            onClick={() => setPaymentFilters(prev => ({ ...prev, has_content: '' }))}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {paymentFilters.has_content && (
                                    <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      1
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                                <button
                                  type="button"
                                  onClick={() => togglePaymentSort('notes')}
                                  className="flex items-center gap-1 group hover:text-ink-warm-900"
                                  title="Sort by notes"
                                >
                                  <span>Notes</span>
                                  {paymentSort.field === 'notes' ? (
                                    paymentSort.direction === 'asc'
                                      ? <ArrowUp className="h-3 w-3" />
                                      : <ArrowDown className="h-3 w-3" />
                                  ) : (
                                    <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                                  )}
                                </button>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="bg-white">
                            {getFilteredPayments().map((payment, index) => (
                              <TableRow key={payment.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} hover:bg-cream-100 transition-colors border-b border-cream-200`}>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 py-2 px-5 overflow-hidden text-center text-ink-warm-700 group w-14 min-w-[3.5rem]`} style={{ verticalAlign: 'middle' }}>
                                  <div className="flex items-center justify-center w-full h-full">
                                    {selectedPayments.includes(payment.id) ? (
                                      <Checkbox
                                        checked={true}
                                        onCheckedChange={checked => {
                                          setSelectedPayments(prev => checked ? [...prev, payment.id] : prev.filter(id => id !== payment.id));
                                        }}
                                        className="mx-auto"
                                      />
                                    ) : (
                                      <>
                                        <span className="block group-hover:hidden w-full text-center">{index + 1}</span>
                                        <span className="hidden group-hover:flex w-full justify-center">
                                          <Checkbox
                                            checked={selectedPayments.includes(payment.id)}
                                            onCheckedChange={checked => {
                                              setSelectedPayments(prev => checked ? [...prev, payment.id] : prev.filter(id => id !== payment.id));
                                            }}
                                            className="mx-auto"
                                          />
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell
                                  className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden text-ink-warm-700 cursor-pointer`, 'payments', payment.id, 'kol_name')}
                                  style={{ verticalAlign: 'middle', fontWeight: 'bold' }}
                                  onClick={() => {
                                    // Use the lookup so the cell name on the selected-cell tooltip
                                    // includes "(removed)" when applicable. Falls back to
                                    // recipient_name for Other Expense payments.
                                    const lookupEntry = payment.campaign_kol_id ? paymentKolNameLookup.get(payment.campaign_kol_id) : undefined;
                                    const displayName = payment.campaign_kol_id
                                      ? (lookupEntry ? (lookupEntry.removed ? `${lookupEntry.name} (removed)` : lookupEntry.name) : 'Unknown KOL')
                                      : payment.recipient_name || 'Unknown';
                                    handleCellSelect('payments', payment.id, 'kol_name', displayName);
                                  }}
                                >
                                  <div className="flex items-center w-full h-full gap-2 flex-wrap">
                                    {payment.campaign_kol_id ? (() => {
                                      // Look up the KOL name via the soft-delete-aware
                                      // lookup map so historical payments to since-removed
                                      // KOLs still show the right name with a "(removed)"
                                      // suffix instead of "Unknown KOL".
                                      const entry = paymentKolNameLookup.get(payment.campaign_kol_id);
                                      if (!entry) return 'Unknown KOL';
                                      return (
                                        <>
                                          <span>{entry.name}</span>
                                          {entry.removed && (
                                            <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500 italic pointer-events-none">
                                              (removed)
                                            </span>
                                          )}
                                        </>
                                      );
                                    })() : (
                                      <>
                                        <span>{payment.recipient_name || 'Unknown'}</span>
                                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded pointer-events-none">
                                          Expense
                                        </span>
                                      </>
                                    )}
                                    {(() => {
                                      const status = getPaymentStatus(payment);
                                      if (status === 'overdue') {
                                        return (
                                          <span
                                            className="inline-flex items-center gap-1 text-[10px] font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded pointer-events-none"
                                            title="Content is posted but payment hasn't been recorded"
                                          >
                                            <AlertTriangle className="h-2.5 w-2.5" />
                                            Overdue
                                          </span>
                                        );
                                      }
                                      if (status === 'paid') {
                                        return (
                                          <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded pointer-events-none">
                                            Paid
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </TableCell>
                                <TableCell
                                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`}
                                  onClick={() => {
                                    if (payment.campaign_kol_id) {
                                      // For KOL payments - edit master KOL wallet
                                      if (editingWalletId !== payment.campaign_kol_id) {
                                        const currentWallet = campaignKOLs.find(kol => kol.id === payment.campaign_kol_id)?.master_kol?.wallet || '';
                                        setEditingWallet({ [payment.campaign_kol_id]: currentWallet });
                                        setEditingWalletId(payment.campaign_kol_id);
                                        // [Wallet edit fix] Stamp the open
                                        // moment so handleWalletSave can
                                        // tell a spurious blur (right after
                                        // mount) from a real click-away.
                                        walletOpenedAtRef.current[payment.campaign_kol_id] = Date.now();
                                      }
                                    } else {
                                      // For non-KOL payments - edit payment wallet
                                      if (editingPaymentCell?.paymentId !== payment.id || editingPaymentCell?.field !== 'wallet') {
                                        handleCellSelect('payments', payment.id, 'wallet', payment.wallet);
                                      }
                                    }
                                  }}
                                >
                                  {payment.campaign_kol_id ? (
                                    editingWalletId === payment.campaign_kol_id ? (
                                      <Input
                                        ref={walletInputRef}
                                        type="text"
                                        value={editingWallet[payment.campaign_kol_id] || ''}
                                        onChange={e => setEditingWallet({ ...editingWallet, [payment.campaign_kol_id]: e.target.value })}
                                        onBlur={() => handleWalletSave(payment.campaign_kol_id)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleWalletSave(payment.campaign_kol_id);
                                          if (e.key === 'Escape') { setEditingWalletId(null); setEditingWallet({}); }
                                        }}
                                        className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
                                        style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
                                        autoFocus
                                        onClick={e => e.stopPropagation()}
                                      />
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <div className="truncate flex-1" title={campaignKOLs.find(kol => kol.id === payment.campaign_kol_id)?.master_kol?.wallet ?? undefined}>
                                          {campaignKOLs.find(kol => kol.id === payment.campaign_kol_id)?.master_kol?.wallet || <span className="text-ink-warm-400 italic">No wallet</span>}
                                        </div>
                                        {campaignKOLs.find(kol => kol.id === payment.campaign_kol_id)?.master_kol?.wallet && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const wallet = campaignKOLs.find(kol => kol.id === payment.campaign_kol_id)?.master_kol?.wallet;
                                              if (wallet) {
                                                navigator.clipboard.writeText(wallet);
                                                toast({ title: 'Copied', description: 'Wallet address copied to clipboard' });
                                              }
                                            }}
                                            className="p-1 hover:bg-cream-200 rounded flex-shrink-0"
                                            title="Copy wallet address"
                                          >
                                            <Copy className="h-3 w-3 text-ink-warm-500" />
                                          </button>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    editingPaymentCell?.paymentId === payment.id && editingPaymentCell?.field === 'wallet' ? (
                                      <Input
                                        type="text"
                                        value={editingPaymentValue ?? ''}
                                        onChange={e => setEditingPaymentValue(e.target.value)}
                                        onBlur={() => handlePaymentCellSave(payment, 'wallet', editingPaymentValue)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handlePaymentCellSave(payment, 'wallet', editingPaymentValue);
                                          if (e.key === 'Escape') { setEditingPaymentCell(null); setEditingPaymentValue(null); }
                                        }}
                                        className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
                                        style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
                                        autoFocus
                                        onClick={e => e.stopPropagation()}
                                      />
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <div className="truncate flex-1" title={payment.wallet ?? undefined}>
                                          {payment.wallet || <span className="text-ink-warm-400 italic">No wallet</span>}
                                        </div>
                                        {payment.wallet && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigator.clipboard.writeText(payment.wallet!);
                                              toast({ title: 'Copied', description: 'Wallet address copied to clipboard' });
                                            }}
                                            className="p-1 hover:bg-cream-200 rounded flex-shrink-0"
                                            title="Copy wallet address"
                                          >
                                            <Copy className="h-3 w-3 text-ink-warm-500" />
                                          </button>
                                        )}
                                      </div>
                                    )
                                  )}
                                </TableCell>
                                <TableCell
                                  className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'payments', payment.id, 'amount')}
                                  onClick={() => {
                                    if (editingPaymentCell?.paymentId !== payment.id || editingPaymentCell?.field !== 'amount') {
                                      handleCellSelect('payments', payment.id, 'amount', payment.amount);
                                    }
                                  }}
                                >
                                  {renderEditablePaymentCell(payment.amount, 'amount', payment)}
                                </TableCell>
                                <TableCell
                                  className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'payments', payment.id, 'payment_date')}
                                  onClick={() => {
                                    if (editingPaymentCell?.paymentId !== payment.id || editingPaymentCell?.field !== 'payment_date') {
                                      handleCellSelect('payments', payment.id, 'payment_date', payment.payment_date);
                                    }
                                  }}
                                >
                                  {renderEditablePaymentCell(payment.payment_date, 'payment_date', payment)}
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                  {renderEditablePaymentCell(payment.payment_method, 'payment_method', payment)}
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                  {payment.campaign_kol_id ? (
                                  <MultiSelect
                                    options={contents
                                      .filter(content => content.campaign_kols_id === payment.campaign_kol_id)
                                      .map(content => content.id)}
                                    selected={Array.isArray(payment.content_id) ? payment.content_id : (payment.content_id ? [payment.content_id] : [])}
                                    onSelectedChange={async (selectedIds) => {
                                      try {
                                        const newContentIds = selectedIds.length > 0 ? selectedIds : null;
                                        await supabase
                                          .from('payments')
                                          .update({ content_id: newContentIds })
                                          .eq('id', payment.id);

                                        setPayments(prev => prev.map(p =>
                                          p.id === payment.id ? { ...p, content_id: newContentIds } : p
                                        ));

                                        toast({
                                          title: 'Success',
                                          description: 'Content link updated successfully'
                                        });
                                      } catch (error) {
                                        console.error('Error updating content link:', error);
                                        toast({
                                          title: 'Error',
                                          description: 'Failed to update content link',
                                          variant: 'destructive'
                                        });
                                      }
                                    }}
                                    className="border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 text-xs font-medium"
                                    triggerContent={
                                      <div className="min-w-[150px]">
                                        {(() => {
                                          const contentIds = Array.isArray(payment.content_id) ? payment.content_id : (payment.content_id ? [payment.content_id] : []);
                                          if (contentIds.length === 0) {
                                            return <span className="text-ink-warm-400 italic">No content linked</span>;
                                          }
                                          if (contentIds.length === 1) {
                                            const content = contents.find(c => c.id === contentIds[0]);
                                            return content ?
                                              <span className="text-xs">{content.type || 'Content'} - {content.platform || 'Unknown'}{content.activation_date ? ` (${formatDisplayDate(content.activation_date)})` : ''}</span> :
                                              <span className="text-xs">Content not found</span>;
                                          }
                                          return <span className="text-xs">{contentIds.length} contents linked</span>;
                                        })()}
                                      </div>
                                    }
                                    renderOption={(contentId) => {
                                      const content = contents.find(c => c.id === contentId);
                                      if (!content) return contentId;
                                      return `${content.type || 'Content'} - ${content.platform || 'Unknown'}${content.activation_date ? ` (${formatDisplayDate(content.activation_date)})` : ''}`;
                                    }}
                                  />
                                  ) : (
                                    <span className="text-ink-warm-400 italic">N/A</span>
                                  )}
                                </TableCell>
                                <TableCell
                                  className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'payments', payment.id, 'notes')}
                                  onClick={() => {
                                    if (editingPaymentCell?.paymentId !== payment.id || editingPaymentCell?.field !== 'notes') {
                                      handleCellSelect('payments', payment.id, 'notes', payment.notes);
                                    }
                                  }}
                                >
                                  {renderEditablePaymentCell(payment.notes, 'notes', payment)}
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} p-2 overflow-hidden`}>
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={() => handleEditPayment(payment)}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => { setPaymentToDelete(payment); setShowPaymentDeleteDialog(true); }}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
                  </>

      {/* Delete confirmation — single payment */}
      <Dialog open={showPaymentDeleteDialog} onOpenChange={setShowPaymentDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete payment?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-ink-warm-700 mt-2 mb-2">
            Are you sure you want to delete this payment? This action can't be undone.
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => { setShowPaymentDeleteDialog(false); setPaymentToDelete(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (paymentToDelete) {
                await handleDeletePayment(paymentToDelete.id);
              }
              setShowPaymentDeleteDialog(false);
              setPaymentToDelete(null);
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — bulk */}
      <Dialog open={showBulkDeletePaymentsDialog} onOpenChange={setShowBulkDeletePaymentsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedPayments.length} payment{selectedPayments.length !== 1 ? 's' : ''}?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-ink-warm-700 mt-2 mb-2">
            This will permanently delete the selected payments. KOL paid totals will be decremented accordingly.
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowBulkDeletePaymentsDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowBulkDeletePaymentsDialog(false);
              try {
                await Promise.all(selectedPayments.map(id => handleDeletePayment(id)));
                toast({ title: `${selectedPayments.length} payment${selectedPayments.length !== 1 ? 's' : ''} deleted`, variant: 'destructive' });
                setSelectedPayments([]);
              } catch (err) {
                toast({ title: 'Error', description: 'Failed to delete payments', variant: 'destructive' });
              }
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
