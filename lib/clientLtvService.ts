import { supabase } from './supabase';

/**
 * Client LTV — what each relationship is actually worth.
 *
 * The distinction this whole module exists to preserve [Andy, 2026-09-01]:
 * the client's campaign budget is a PASS-THROUGH. Our fee is billed separately
 * on top, and unspent budget is refunded. So budget managed is a credential,
 * not income, and the residual between budget and spend is a debt rather than
 * a margin. Revenue is the fee alone.
 *
 * Reads the `client_ltv` view; writes fees onto the engagement period, which
 * is the row that already carries the commercial term.
 */

export interface ClientLtvRow {
  client_id: string;
  name: string;
  is_active: boolean;
  terms: number;
  first_term_start: string | null;
  last_term_end: string | null;
  months_engaged: number;
  budget_managed: number;
  spend_settled: number;
  spend_committed: number;
  budget_unspent: number;
  revenue: number;
  affiliate_cost: number;
  attributed_expenses: number;
  net_revenue: number;
  /** Terms with no fee recorded. Revenue reads $0 for these, which is not the
   *  same as having earned nothing — the UI must say which it is. */
  terms_missing_fee: number;
}

export interface TermRow {
  id: string;
  period_n: number;
  start_date: string | null;
  end_date: string | null;
  amount: number | null;
  scope: string | null;
  signed_date: string | null;
  fee_amount: number | null;
  fee_pct: number | null;
  fee_notes: string | null;
  affiliate_id: string | null;
  affiliate_amount: number | null;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const ClientLtvService = {
  async list(): Promise<ClientLtvRow[]> {
    const { data, error } = await (supabase as any).from('client_ltv').select('*');
    if (error) throw new Error(`Failed to load LTV: ${error.message}`);
    return ((data ?? []) as any[]).map(r => ({
      ...r,
      terms: num(r.terms),
      months_engaged: num(r.months_engaged),
      budget_managed: num(r.budget_managed),
      spend_settled: num(r.spend_settled),
      spend_committed: num(r.spend_committed),
      budget_unspent: num(r.budget_unspent),
      revenue: num(r.revenue),
      affiliate_cost: num(r.affiliate_cost),
      attributed_expenses: num(r.attributed_expenses),
      net_revenue: num(r.net_revenue),
      terms_missing_fee: num(r.terms_missing_fee),
    })) as ClientLtvRow[];
  },

  /** The terms behind one client's number, so a figure can be traced. */
  async terms(clientId: string): Promise<TermRow[]> {
    const { data, error } = await (supabase as any)
      .from('client_engagement_periods')
      .select('id, period_n, start_date, end_date, amount, scope, signed_date, '
        + 'fee_amount, fee_pct, fee_notes, affiliate_id, affiliate_amount, '
        + 'stint:client_stints!inner(client_id)')
      .eq('stint.client_id', clientId)
      .order('start_date', { ascending: true });
    if (error) throw new Error(`Failed to load terms: ${error.message}`);
    return ((data ?? []) as any[]).map(r => ({
      id: r.id, period_n: r.period_n,
      start_date: r.start_date, end_date: r.end_date,
      amount: r.amount === null ? null : Number(r.amount),
      scope: r.scope, signed_date: r.signed_date,
      fee_amount: r.fee_amount === null ? null : Number(r.fee_amount),
      fee_pct: r.fee_pct === null ? null : Number(r.fee_pct),
      fee_notes: r.fee_notes,
      affiliate_id: r.affiliate_id,
      affiliate_amount: r.affiliate_amount === null ? null : Number(r.affiliate_amount),
    }));
  },

  async setFee(periodId: string, patch: {
    fee_amount?: number | null; fee_pct?: number | null;
    affiliate_amount?: number | null; fee_notes?: string | null;
  }): Promise<void> {
    const { error } = await (supabase as any)
      .from('client_engagement_periods').update(patch).eq('id', periodId);
    if (error) throw new Error(`Could not save: ${error.message}`);
  },
};
