'use client';

/**
 * CampaignDetailContext
 *
 * Shared data + actions for the campaign detail page
 * (`app/campaigns/[id]/page.tsx`) and the child components being
 * broken out of it under `components/campaign/*` (Add KOLs / Add
 * Content / Record Payment dialogs first; tab bodies later).
 *
 * 2026-06-02 — Introduced as the first step of the structural
 * refactor that's lowering the page from ~11,800 lines toward
 * ~3,500. The page still owns the underlying useState calls; this
 * provider re-exposes that state + the fetchers + the toast hook so
 * the extracted dialogs don't need a 20-prop interface each.
 *
 * Convention: anything the **page itself** is the source of truth
 * for (form state, editMode, editing-card focus, view-mode toggles,
 * filters, sorts) stays in the page and is NOT in the context.
 * Only state genuinely shared across the page + child components
 * lives here.
 */

import { createContext, useContext } from 'react';
import type { CampaignWithDetails } from '@/lib/campaignService';
import type { CampaignKOLWithDetails } from '@/lib/campaignKolService';

// ───────────────────────────────────────────────────────────────────
// Cell-selection helpers — shared selection state across the page's
// big tables (KOL Dashboard + Budget payments). One table+rowId+field
// triple is "selected" at a time across the whole page.
// ───────────────────────────────────────────────────────────────────
export type SelectedCell = { table: string; rowId: string; field: string; value: any } | null;

/** Shape of the pricing-suggestion dialog state (lives on the page). */
export type PricingSuggestionDialogState = {
  open: boolean;
  kolId: string;
  kolName: string;
  masterKolId: string;
  latestCost: number;
  paymentIndex: number;
  /** For content-created payments, we track payment IDs instead of index. */
  paymentIds?: string[];
  mode: 'payment-dialog' | 'content-created';
} | null;

/** Telegram chat metadata, keyed by master_kol.id. */
export type KolTelegramChat = { chat_id: string; title: string | null };

/**
 * Arguments to `triggerPaymentNotification` — the side-effect the
 * Record Payment dialog fires when the user picks a payment date on
 * a KOL that has a linked Telegram chat + wallet + non-zero amount.
 * The page owns the actual notification confirmation sub-dialog and
 * uses these args to populate it.
 */
export type PaymentNotificationTriggerOpts = {
  kolId: string;
  kolName: string;
  paymentIndex: number;
  amount: number;
  wallet: string;
  chatId: string;
  chatTitle: string | null;
  date: Date;
  /** Linked contents on the payment — the message header uses their
   *  post (activation) date instead of the payment date when present. */
  contentIds?: string[];
};

/** Toast caller — kept loose to match the project's `useToast` hook. */
type ToastFn = (opts: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}) => void;

interface CampaignDetailContextType {
  // ─── Read-only data ────────────────────────────────────────────
  campaignId: string;
  campaign: CampaignWithDetails | null;
  campaignKOLs: CampaignKOLWithDetails[];
  /** Untyped on the page (any[]); keep loose until contents has a model. */
  contents: any[];
  /** Loading flag for the initial contents fetch. Used by the Content
   *  Dashboard Table view's skeleton-row block. */
  loadingContents: boolean;
  /** Untyped on the page (any[]); keep loose until payments has a model. */
  payments: any[];
  /** Loading flag for the initial payments fetch. Used by the Budget
   *  Table view's skeleton-row block. */
  loadingPayments: boolean;
  /** Available master KOLs not yet on this campaign. */
  availableKOLs: any[];
  /** Map of master_kol.id → latest cost from past payments. */
  latestCostMap: Map<string, number>;
  /** Map of campaign_kol.id → { name, removed } for the Budget tab
   *  payment-name lookup. Includes soft-deleted KOLs so historical
   *  payments to since-removed KOLs render with the original name +
   *  "(removed)" suffix instead of "Unknown KOL". */
  paymentKolNameLookup: Map<string, { name: string; removed: boolean }>;

  // ─── Setters (state lives on the page) ─────────────────────────
  setCampaign: React.Dispatch<React.SetStateAction<CampaignWithDetails | null>>;
  setCampaignKOLs: React.Dispatch<React.SetStateAction<CampaignKOLWithDetails[]>>;
  setContents: React.Dispatch<React.SetStateAction<any[]>>;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;

  // ─── Async fetchers (refetch from supabase) ────────────────────
  fetchCampaignKOLs: () => Promise<void>;
  fetchAvailableKOLs: () => Promise<void>;
  fetchPayments: () => Promise<void>;

  // ─── Pricing-suggestion sub-dialog (used by Record Payment +
  //     Add Content + the inline cost field on the KOL table) ────
  setPricingSuggestionDialog: React.Dispatch<React.SetStateAction<PricingSuggestionDialogState>>;

  // ─── Telegram chats keyed by master_kol.id; consumed by the
  //     Record Payment dialog's `handlePaymentDateSelect` flow. ──
  kolTelegramChats: Record<string, KolTelegramChat>;

  // ─── Side-effect: open the Payment Notification confirmation
  //     sub-dialog (rendered on the page). Called by the Record
  //     Payment dialog after a date is picked, when the KOL has a
  //     linked Telegram chat + wallet + non-zero amount. ─────────
  triggerPaymentNotification: (opts: PaymentNotificationTriggerOpts) => void;

  // ─── Payment-terms dialog (rendered on the page) ──────────────
  /** Open the Payment Terms dialog for one KOL. Returns true if the
   *  dialog actually opened (KOL exists and has no agreed_rate yet). */
  openPaymentTermsForKol: (kolId: string, list?: CampaignKOLWithDetails[]) => boolean;
  /** Enqueue follow-up KOLs so the page fires the terms dialog for
   *  each in sequence as the previous one closes. Used by the
   *  bulk-onboarding flow + the in-dialog "Next" button. */
  setPaymentTermsQueue: React.Dispatch<React.SetStateAction<string[]>>;

  // ─── Master KOL edit dialog (rendered on the page) ────────────
  /** Open the Master KOL edit dialog for a KOL. The dialog itself
   *  lives in the page's trailing dialog cluster — this is the
   *  side-effect trigger the Table view uses to open it. */
  openMasterKolEditDialog: (kol: any) => void;

  // ─── Edit Payment dialog (rendered on the page) ───────────────
  /** Open the Edit Payment dialog. Used by the Budget Table's row
   *  edit pencil. */
  handleEditPayment: (payment: any) => void;

  // ─── Cross-tab navigation primitives ──────────────────────────
  /** Switch the main tab strip's selected tab. Used by the Table
   *  view's "View contents for this KOL" jump. */
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  /** Pre-fill the Content Dashboard's search box. Used by the same
   *  cross-tab jump so the contents tab opens already filtered. */
  setContentsSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  /** Refetch contents after the Table view's quick-add-content
   *  flow inserts new rows. */
  fetchContents: () => Promise<void>;

  // ─── Cell-selection helpers (shared by KOL Table + Budget table)
  isCellSelected: (table: string, rowId: string, field: string) => boolean;
  getCellClassName: (baseClass: string, table: string, rowId: string, field: string) => string;
  handleCellSelect: (table: string, rowId: string, field: string, value: any) => void;

  // ─── Notifications ─────────────────────────────────────────────
  toast: ToastFn;
}

const CampaignDetailContext = createContext<CampaignDetailContextType | null>(null);

export function useCampaignDetail(): CampaignDetailContextType {
  const ctx = useContext(CampaignDetailContext);
  if (!ctx) {
    throw new Error('useCampaignDetail must be used inside <CampaignDetailProvider>');
  }
  return ctx;
}

export const CampaignDetailProvider = CampaignDetailContext.Provider;
