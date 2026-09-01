'use client';

/**
 * Clients · Lifetime Value
 *
 * Budget managed and revenue are shown as separate numbers and never summed.
 * [Andy, 2026-09-01] The client's campaign budget is a pass-through — our fee
 * is billed on top and unspent budget is refunded — so budget is a credential,
 * the residual is a debt, and only the fee is income. A single "LTV" figure
 * would have to pick one of those three and would be wrong for the other two.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import {
  DollarSign, Wallet, Users, TrendingUp, ChevronRight, ChevronDown, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import {
  ClientLtvService, type ClientLtvRow, type TermRow,
} from '@/lib/clientLtvService';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export default function ClientLtvPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ClientLtvRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [terms, setTerms] = useState<Record<string, TermRow[]>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await ClientLtvService.list());
    } catch (err: any) {
      toast({ title: 'Could not load LTV', description: err?.message, variant: 'destructive' });
      setRows([]);
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  async function toggle(clientId: string) {
    if (open === clientId) { setOpen(null); return; }
    setOpen(clientId);
    if (!terms[clientId]) {
      try {
        const t = await ClientLtvService.terms(clientId);
        setTerms(prev => ({ ...prev, [clientId]: t }));
      } catch (err: any) {
        toast({ title: 'Could not load terms', description: err?.message, variant: 'destructive' });
      }
    }
  }

  async function saveFee(clientId: string, term: TermRow) {
    const raw = draft[term.id];
    if (raw === undefined) return;
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) {
      toast({ title: 'That is not a number', variant: 'destructive' });
      return;
    }
    setSaving(term.id);
    try {
      await ClientLtvService.setFee(term.id, { fee_amount: value });
      setTerms(prev => ({
        ...prev,
        [clientId]: (prev[clientId] ?? []).map(t =>
          t.id === term.id ? { ...t, fee_amount: value } : t),
      }));
      setDraft(prev => { const n = { ...prev }; delete n[term.id]; return n; });
      await load();
      toast({ title: 'Fee saved', duration: 1500 });
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
    } finally { setSaving(null); }
  }

  const totals = useMemo(() => {
    const r = rows ?? [];
    return {
      revenue: r.reduce((s, x) => s + x.net_revenue, 0),
      budget: r.reduce((s, x) => s + x.budget_managed, 0),
      unspent: r.reduce((s, x) => s + x.budget_unspent, 0),
      missing: r.reduce((s, x) => s + x.terms_missing_fee, 0),
      clients: r.length,
      renewed: r.filter(x => x.terms > 1).length,
    };
  }, [rows]);

  const header = (
    <>
      <Link href="/clients" className="inline-flex items-center text-xs text-gray-500 hover:text-brand transition-colors w-fit">
        <ArrowLeft className="h-3 w-3 mr-1" />Back to Clients
      </Link>
      <PageHeader
        icon={DollarSign}
        kicker="Clients · Lifetime Value"
        kickerDot="brand"
        title="Lifetime Value"
        subtitle="What each relationship earned — fees, not the budgets we ran"
      />
    </>
  );

  if (rows === null) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Revenue leads. Budget managed sits beside it and is never added to it. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp} label="Net Revenue" value={money(totals.revenue)}
          sub={totals.missing > 0 ? `${totals.missing} term(s) have no fee recorded` : 'fees, less commission'}
          accent={totals.missing > 0 ? 'amber' : 'brand'}
        />
        <KpiCard
          icon={Wallet} label="Budget Managed" value={money(totals.budget)}
          sub="client money, not income" accent="sky"
        />
        <KpiCard
          icon={AlertTriangle} label="Unspent Budget" value={money(totals.unspent)}
          sub="refundable to clients" accent={totals.unspent > 0 ? 'amber' : 'gray'}
        />
        <KpiCard
          icon={Users} label="Clients" value={totals.clients}
          sub={`${totals.renewed} renewed at least once`} accent="gray"
        />
      </div>

      {totals.missing > 0 && (
        <Card className="border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
          <b>{totals.missing} term(s) have no fee recorded</b>, so those clients read $0 revenue —
          which is not the same as having earned nothing. Open a client and fill the fee to fix it.
        </Card>
      )}

      <SectionHeader
        label="By Client" dot="brand"
        counter={`01 — ${rows.length} clients · click a row for its terms`} first
      />

      {rows.length === 0 ? (
        <EmptyState icon={DollarSign} title="No engagements yet"
          description="Clients appear here once they have a stint with a term." />
      ) : (
        <Card className="border-cream-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  {['Client', 'Terms', 'Months', 'Budget Managed', 'Spent', 'Unspent', 'Revenue', 'Net', ''].map(h => (
                    <th key={h} className="text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 last:border-r-0 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => b.net_revenue - a.net_revenue || b.budget_managed - a.budget_managed)
                  .map(r => (
                  <>
                    <tr
                      key={r.client_id}
                      className="border-b border-cream-100 hover:bg-cream-50/60 cursor-pointer"
                      onClick={() => toggle(r.client_id)}
                    >
                      <td className="py-3 px-4 border-r border-cream-200">
                        <span className="flex items-center gap-2">
                          {open === r.client_id
                            ? <ChevronDown className="h-3.5 w-3.5 text-ink-warm-400" />
                            : <ChevronRight className="h-3.5 w-3.5 text-ink-warm-300" />}
                          <span className="font-medium text-ink-warm-900">{r.name}</span>
                          {!r.is_active && <StatusBadge tone="neutral" size="sm">Ended</StatusBadge>}
                        </span>
                      </td>
                      <td className="py-3 px-4 border-r border-cream-200 tabular-nums">{r.terms}</td>
                      <td className="py-3 px-4 border-r border-cream-200 tabular-nums">{r.months_engaged}</td>
                      <td className="py-3 px-4 border-r border-cream-200 tabular-nums">{money(r.budget_managed)}</td>
                      <td className="py-3 px-4 border-r border-cream-200 tabular-nums text-ink-warm-500">
                        {money(r.spend_settled)}
                        {r.spend_committed > 0 && (
                          <span className="text-[11px] text-amber-600"> +{money(r.spend_committed)} due</span>
                        )}
                      </td>
                      <td className="py-3 px-4 border-r border-cream-200 tabular-nums">
                        {r.budget_unspent > 0
                          ? <span className="text-amber-700">{money(r.budget_unspent)}</span>
                          : <span className="text-ink-warm-300">—</span>}
                      </td>
                      <td className="py-3 px-4 border-r border-cream-200 tabular-nums font-semibold">
                        {r.terms_missing_fee > 0 && r.revenue === 0
                          ? <span className="text-amber-600 font-normal">not recorded</span>
                          : money(r.revenue)}
                      </td>
                      <td className="py-3 px-4 border-r border-cream-200 tabular-nums font-semibold">
                        {r.revenue === 0 ? <span className="text-ink-warm-300">—</span> : money(r.net_revenue)}
                      </td>
                      <td className="py-3 px-2" />
                    </tr>

                    {open === r.client_id && (
                      <tr key={`${r.client_id}-terms`} className="bg-cream-50/40">
                        <td colSpan={9} className="px-4 py-3">
                          {!terms[r.client_id] ? (
                            <Skeleton className="h-16 rounded-md" />
                          ) : (
                            <div className="space-y-2">
                              {terms[r.client_id].map(t => (
                                <div key={t.id} className="flex items-center gap-3 flex-wrap text-xs bg-white border border-cream-200 rounded-md px-3 py-2">
                                  <span className="font-semibold text-ink-warm-700">Term {t.period_n}</span>
                                  <span className="text-ink-warm-500">
                                    {t.start_date ? formatDate(t.start_date) : '—'}
                                    {t.end_date ? ` → ${formatDate(t.end_date)}` : ''}
                                  </span>
                                  {t.scope && <StatusBadge tone="slate" size="sm">{t.scope}</StatusBadge>}
                                  <span className="text-ink-warm-500">
                                    budget {t.amount ? money(t.amount) : '—'}
                                  </span>
                                  <span className="ml-auto flex items-center gap-2">
                                    <span className="text-ink-warm-500">our fee</span>
                                    <Input
                                      className="h-8 w-28 focus-brand text-xs"
                                      placeholder="0"
                                      value={draft[t.id] ?? (t.fee_amount ?? '')}
                                      onChange={e => setDraft(p => ({ ...p, [t.id]: e.target.value }))}
                                      onClick={e => e.stopPropagation()}
                                    />
                                    <Button
                                      size="sm" variant="brand" className="h-8"
                                      disabled={saving === t.id || draft[t.id] === undefined}
                                      onClick={e => { e.stopPropagation(); void saveFee(r.client_id, t); }}
                                    >
                                      {saving === t.id ? 'Saving…' : 'Save'}
                                    </Button>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
