'use client';

/**
 * EmbeddedBudgetTable — renders the campaign Budget tab's editable
 * payments table (`<BudgetTableView>`) anywhere OUTSIDE
 * `app/campaigns/[id]/page.tsx`.
 *
 * WHY a host component exists at all: `BudgetTableView` reads
 * everything it needs from `useCampaignDetail()`, and that hook
 * THROWS when unprovided — so the table can't simply be imported and
 * dropped into another screen. The only supported way to reuse it is
 * to stand up a second, minimal provider around it. This file is that
 * provider host: it owns real `useState` for campaign / campaignKOLs /
 * contents / payments and real supabase fetchers, so the table's
 * inline cell edits (which write straight to supabase and then call
 * `setPayments` / `setCampaignKOLs`) actually persist. That inline
 * editing model is precisely what makes the embed feasible — the page
 * isn't holding a save handler the table depends on.
 *
 * The fetch logic below is copied from the campaign page (fetchCampaign
 * / fetchCampaignKOLs / fetchPayments / fetchContents /
 * fetchKolTelegramChats / fetchLatestCosts) rather than re-derived,
 * because the table reads nested shapes like `kol.master_kol.wallet`.
 * A shape mismatch here renders blank cells instead of erroring, which
 * is the worst possible failure mode on a money surface.
 *
 * Created 2026-08-14.
 */

import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CampaignService, type CampaignWithDetails } from '@/lib/campaignService';
import { CampaignKOLService, type CampaignKOLWithDetails } from '@/lib/campaignKolService';
import { formatDate } from '@/lib/dateFormat';
import { useToast } from '@/hooks/use-toast';
import {
  CampaignDetailProvider,
  type KolTelegramChat,
  type PaymentNotificationTriggerOpts,
  type PricingSuggestionDialogState,
  type SelectedCell,
} from '@/contexts/CampaignDetailContext';
import { BudgetTableView } from '@/components/campaign/BudgetTableView';
import { EditPaymentDialog } from '@/components/campaign/EditPaymentDialog';
import { PaymentNotifyDialog } from '@/components/campaign/PaymentNotifyDialog';

interface EmbeddedBudgetTableProps {
  /** Campaign UUID or slug — resolved the same way the campaign page
   *  resolves its route param, so either form works. */
  campaignId: string;
}

export default function EmbeddedBudgetTable({ campaignId }: EmbeddedBudgetTableProps) {
  const { toast } = useToast();

  // ── Data the provider hands to BudgetTableView ────────────────────
  const [campaign, setCampaign] = useState<CampaignWithDetails | null>(null);
  const [campaignKOLs, setCampaignKOLs] = useState<CampaignKOLWithDetails[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [loadingContents, setLoadingContents] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [paymentKolNameLookup, setPaymentKolNameLookup] = useState<Map<string, { name: string; removed: boolean }>>(new Map());
  const [latestCostMap, setLatestCostMap] = useState<Map<string, number>>(new Map());
  const [kolTelegramChats, setKolTelegramChats] = useState<Record<string, KolTelegramChat>>({});

  /** Initial campaign resolve — gates the skeleton. Everything else
   *  loads behind the table's own per-section loading flags. */
  const [loadingCampaign, setLoadingCampaign] = useState(true);

  // ── Cell selection — reimplemented locally. It's pure UI state
  //    (one selected cell at a time), so there's nothing to share with
  //    the page. Matches the page's brand-ring treatment; the copied-
  //    cell variant is omitted because the copy/paste keyboard handler
  //    that sets it lives on the campaign page and isn't embedded. ──
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);

  const isCellSelected = useCallback(
    (table: string, rowId: string, field: string) =>
      selectedCell?.table === table && selectedCell?.rowId === rowId && selectedCell?.field === field,
    [selectedCell],
  );

  const getCellClassName = useCallback(
    (baseClass: string, table: string, rowId: string, field: string) =>
      isCellSelected(table, rowId, field) ? `${baseClass} ring-2 ring-brand bg-brand-soft` : baseClass,
    [isCellSelected],
  );

  const handleCellSelect = useCallback((table: string, rowId: string, field: string, value: any) => {
    setSelectedCell({ table, rowId, field, value });
  }, []);

  // ── Edit Payment dialog — rendered here so the row edit pencil
  //    works. EditPaymentDialog only reads campaignKOLs /
  //    setCampaignKOLs / contents / setPayments / toast from context,
  //    all of which this host genuinely owns, so it behaves
  //    identically to the campaign page's copy. ────────────────────
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [isEditingPayment, setIsEditingPayment] = useState(false);

  const handleEditPayment = useCallback((payment: any) => {
    setEditingPayment(payment);
    setIsEditingPayment(true);
  }, []);

  // ── Payment notification confirmation — same deal. The dialog is
  //    fully prop-driven, so hosting it here costs nothing but the
  //    four state slots the page also keeps. ──────────────────────
  const [pendingPaymentNotification, setPendingPaymentNotification] = useState<PaymentNotificationTriggerOpts | null>(null);
  const [paymentNotificationMessage, setPaymentNotificationMessage] = useState('');
  const [paymentNotifyDialogOpen, setPaymentNotifyDialogOpen] = useState(false);
  const [sendingPaymentNotification, setSendingPaymentNotification] = useState(false);

  // ── Fetchers ──────────────────────────────────────────────────────

  /** Helper: paid-total per campaign_kol_id, mirroring the page's
   *  `computePaymentSums`. */
  const computePaymentSums = (items: any[]) => {
    const sums: Record<string, number> = {};
    for (const p of items || []) {
      const key = p.campaign_kol_id;
      const amt = Number(p.amount) || 0;
      sums[key] = (sums[key] || 0) + amt;
    }
    return sums;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingCampaign(true);
        const fetched = await CampaignService.getCampaignByIdOrSlug(campaignId);
        if (alive) setCampaign(fetched);
      } catch (err) {
        console.error('Error fetching campaign:', err);
        if (alive) setCampaign(null);
      } finally {
        if (alive) setLoadingCampaign(false);
      }
    })();
    return () => { alive = false; };
  }, [campaignId]);

  /** Roster + the soft-delete-aware name lookup. Both come from the
   *  same call on the page so the two stay in lockstep — historical
   *  payments to removed KOLs must still render "Alice (removed)"
   *  rather than "Unknown KOL". */
  const fetchCampaignKOLs = useCallback(async (): Promise<CampaignKOLWithDetails[]> => {
    if (!campaign) return [];
    try {
      const [kols, allKols] = await Promise.all([
        CampaignKOLService.getCampaignKOLs(campaign.id),
        CampaignKOLService.getCampaignKOLsWithDeleted(campaign.id),
      ]);
      const sums = computePaymentSums(payments);
      const decorated: CampaignKOLWithDetails[] = payments.length > 0
        ? kols.map(k => ({ ...k, paid: sums[k.id] || 0 }))
        : kols;
      setCampaignKOLs(decorated);

      const lookup = new Map<string, { name: string; removed: boolean }>();
      for (const k of allKols as any[]) {
        lookup.set(k.id, { name: k.master_kol?.name || 'Unknown KOL', removed: !!k.deleted_at });
      }
      setPaymentKolNameLookup(lookup);
      return decorated;
    } catch (err) {
      console.error('Error fetching campaign KOLs:', err);
      return [];
    }
  }, [campaign, payments]);

  const fetchPayments = useCallback(async () => {
    if (!campaign?.id) return;
    setLoadingPayments(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      const list = data || [];
      setPayments(list);
      const sums = computePaymentSums(list);
      setCampaignKOLs(prev => prev.map(k => ({ ...k, paid: sums[k.id] || 0 })));
    } catch (err) {
      console.error('Error fetching payments:', err);
      toast({ title: 'Load failed', description: err instanceof Error ? err.message : 'Failed to fetch payments', variant: 'destructive' });
    } finally {
      setLoadingPayments(false);
    }
  }, [campaign?.id, toast]);

  const fetchContents = useCallback(async () => {
    if (!campaign?.id) return;
    setLoadingContents(true);
    try {
      const { data, error } = await supabase
        .from('contents')
        .select('*')
        .eq('campaign_id', campaign.id);
      if (error) throw error;
      setContents(data || []);
    } catch (err) {
      console.error('Error fetching contents:', err);
      setContents([]);
    } finally {
      setLoadingContents(false);
    }
  }, [campaign?.id]);

  /** Latest paid amount per master_kol_id. Deliberately cross-campaign
   *  (the question is "what did we last pay this creator anywhere") but
   *  scoped to this roster's ids, same as the page. */
  const fetchLatestCosts = useCallback(async (masterKolIds: string[]) => {
    if (!masterKolIds.length) { setLatestCostMap(new Map()); return; }
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, payment_date, campaign_kol:campaign_kols!inner(master_kol_id)')
        .not('payment_date', 'is', null)
        .gt('amount', 0)
        .in('campaign_kol.master_kol_id', masterKolIds)
        .order('payment_date', { ascending: false });
      if (!error && data) {
        const map = new Map<string, number>();
        for (const row of data) {
          const masterKolId = (row.campaign_kol as any)?.master_kol_id;
          if (masterKolId && !map.has(masterKolId)) map.set(masterKolId, row.amount);
        }
        setLatestCostMap(map);
      }
    } catch (err) {
      console.error('Error fetching latest costs:', err);
    }
  }, []);

  const fetchKolTelegramChats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_chats')
        .select('chat_id, title, master_kol_id')
        .not('master_kol_id', 'is', null);
      if (error) throw error;
      const chatsMap: Record<string, KolTelegramChat> = {};
      data?.forEach(chat => {
        if (chat.master_kol_id) chatsMap[chat.master_kol_id] = { chat_id: chat.chat_id, title: chat.title };
      });
      setKolTelegramChats(chatsMap);
    } catch (err) {
      console.error('Error fetching KOL telegram chats:', err);
    }
  }, []);

  // Kick off the dependent fetches once the campaign resolves. Keyed on
  // `campaign?.id` rather than the object so the roster refetch that
  // `fetchCampaignKOLs` re-creates on every `payments` change doesn't
  // loop this effect.
  useEffect(() => {
    if (!campaign?.id) return;
    void (async () => {
      const kols = await CampaignKOLService.getCampaignKOLs(campaign.id).catch(() => [] as CampaignKOLWithDetails[]);
      const masterKolIds = Array.from(new Set(kols.map(k => k.master_kol?.id).filter(Boolean) as string[]));
      void fetchLatestCosts(masterKolIds);
    })();
    void fetchCampaignKOLs();
    void fetchPayments();
    void fetchContents();
    void fetchKolTelegramChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id]);

  // ── Payment notification trigger + send ───────────────────────────

  const triggerPaymentNotification = useCallback((opts: PaymentNotificationTriggerOpts) => {
    setPendingPaymentNotification(opts);
    // Header date = the linked content's POST (activation) date, latest
    // wins; payment date is the fallback. Same copy as the campaign page
    // so a KOL can't tell which surface the message was sent from.
    const clientName = campaign?.client_name?.trim() || 'Holo Hive';
    const linkedPostDates = (opts.contentIds || [])
      .map(id => contents.find(c => c.id === id)?.activation_date)
      .filter(Boolean)
      .sort();
    const postDate = linkedPostDates.length > 0 ? linkedPostDates[linkedPostDates.length - 1] : null;
    const dateStr = postDate
      ? formatDate(postDate)
      : opts.date && !isNaN(opts.date.getTime())
        ? formatDate(opts.date)
        : 'Date TBD';
    setPaymentNotificationMessage(
      `${clientName} - Post (${dateStr})\n\n` +
      `$${opts.amount.toLocaleString()} has been deposited to ${opts.wallet}\n\n` +
      `Thank you for being part of the Holo Hive network 🙌`,
    );
    setPaymentNotifyDialogOpen(true);
  }, [campaign?.client_name, contents]);

  const sendPaymentNotification = async () => {
    if (!pendingPaymentNotification) return;
    setSendingPaymentNotification(true);
    try {
      const response = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: pendingPaymentNotification.chatId, message: paymentNotificationMessage }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send notification');
      }
      toast({ title: 'Notification sent', description: 'Payment notification sent to Telegram chat' });
    } catch (error: any) {
      console.error('Error sending payment notification:', error);
      toast({ title: 'Send failed', description: error?.message ?? 'Failed to send notification', variant: 'destructive' });
    } finally {
      setSendingPaymentNotification(false);
      setPaymentNotifyDialogOpen(false);
      setPendingPaymentNotification(null);
    }
  };

  // ── Inert context fields ──────────────────────────────────────────
  //
  // These exist only to satisfy the context interface. The rule applied
  // to each: if a user could TRIGGER it from the budget table, it must
  // say so out loud rather than silently doing nothing — a silent
  // no-op on a money surface is how a payment edit quietly vanishes.
  //
  // As it happens, `BudgetTableView` destructures none of these (it
  // takes 15 fields, all real above), and `EditPaymentDialog` /
  // `PaymentNotifyDialog` don't either — so none of them is reachable
  // from this embed. They stay silent no-ops, each annotated with why.
  // If a future edit to BudgetTableView starts consuming one, swap the
  // body for a toast pointing at the campaign page.

  /** UNREACHABLE — the tab strip lives on the campaign page; the
   *  budget table never calls this (only the KOL table's cross-tab
   *  jump does). */
  const setActiveTab = useCallback(() => {}, []) as React.Dispatch<React.SetStateAction<string>>;

  /** UNREACHABLE — paired with setActiveTab for the same cross-tab
   *  jump, which isn't part of the budget table. */
  const setContentsSearchTerm = useCallback(() => {}, []) as React.Dispatch<React.SetStateAction<string>>;

  /** UNREACHABLE — the Master KOL edit dialog opens from the KOL
   *  Dashboard table, not from any budget cell. */
  const openMasterKolEditDialog = useCallback((_kol: any) => {}, []);

  /** UNREACHABLE — the Payment Terms prompt fires from the Add-KOLs
   *  onboarding flow. Returns false = "dialog did not open", which is
   *  the honest answer here. */
  const openPaymentTermsForKol = useCallback((_kolId: string, _list?: CampaignKOLWithDetails[]) => false, []);

  /** UNREACHABLE — queue consumed by the payment-terms dialog above. */
  const setPaymentTermsQueue = useCallback(() => {}, []) as React.Dispatch<React.SetStateAction<string[]>>;

  /** UNREACHABLE — the pricing-suggestion dialog is fired by Record
   *  Payment / Add Content / the KOL table's cost cell, none embedded. */
  const setPricingSuggestionDialog = useCallback(() => {}, []) as React.Dispatch<React.SetStateAction<PricingSuggestionDialogState>>;

  /** UNREACHABLE — "available KOLs" only feeds the Add KOLs dialog.
   *  Left un-fetched so this embed doesn't pay for a query nothing
   *  reads; `availableKOLs` below stays empty for the same reason. */
  const fetchAvailableKOLs = useCallback(async () => {}, []);
  const availableKOLs: any[] = [];

  // ── Render ────────────────────────────────────────────────────────

  if (loadingCampaign) {
    return <Skeleton className="h-64 rounded-lg" />;
  }

  if (!campaign) {
    return (
      <EmptyState
        icon={DollarSign}
        title="Campaign not found"
        description="This campaign couldn't be loaded, so its payments can't be shown."
      />
    );
  }

  return (
    <CampaignDetailProvider value={{
      campaignId,
      campaign, setCampaign,
      campaignKOLs, setCampaignKOLs,
      contents, setContents, loadingContents,
      payments, setPayments, loadingPayments,
      availableKOLs,
      latestCostMap,
      paymentKolNameLookup,
      kolTelegramChats,
      fetchCampaignKOLs,
      fetchAvailableKOLs,
      fetchPayments,
      setPricingSuggestionDialog,
      triggerPaymentNotification,
      openPaymentTermsForKol,
      setPaymentTermsQueue,
      openMasterKolEditDialog,
      handleEditPayment,
      setActiveTab,
      setContentsSearchTerm,
      fetchContents,
      isCellSelected,
      getCellClassName,
      handleCellSelect,
      toast,
    }}>
      <BudgetTableView />

      <EditPaymentDialog
        open={isEditingPayment}
        onOpenChange={(open) => {
          setIsEditingPayment(open);
          if (!open) setEditingPayment(null);
        }}
        payment={editingPayment}
      />

      <PaymentNotifyDialog
        open={paymentNotifyDialogOpen}
        onOpenChange={setPaymentNotifyDialogOpen}
        kolName={pendingPaymentNotification?.kolName}
        chatTitle={pendingPaymentNotification?.chatTitle}
        message={paymentNotificationMessage}
        onMessageChange={setPaymentNotificationMessage}
        sending={sendingPaymentNotification}
        onSend={sendPaymentNotification}
        onSkip={() => {
          setPaymentNotifyDialogOpen(false);
          setPendingPaymentNotification(null);
        }}
      />
    </CampaignDetailProvider>
  );
}
