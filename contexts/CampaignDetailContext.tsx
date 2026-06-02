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

/** Toast caller — kept loose to match the project's `useToast` hook. */
type ToastFn = (opts: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

interface CampaignDetailContextType {
  // ─── Read-only data ────────────────────────────────────────────
  campaignId: string;
  campaign: CampaignWithDetails | null;
  campaignKOLs: CampaignKOLWithDetails[];
  /** Untyped on the page (any[]); keep loose until contents has a model. */
  contents: any[];
  /** Untyped on the page (any[]); keep loose until payments has a model. */
  payments: any[];
  /** Available master KOLs not yet on this campaign. */
  availableKOLs: any[];
  /** Map of master_kol.id → latest cost from past payments. */
  latestCostMap: Map<string, number>;

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
