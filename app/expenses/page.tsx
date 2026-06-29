'use client';

/**
 * Expenses (super_admin only)
 *
 * Three views in one page:
 *   - Header + stats strip (totals: this-month, unpaid, top type)
 *   - Filter bar + table (with bulk-select)
 *   - Slide-over detail with attachments + edit + delete
 *   - Add/Edit dialog with all 7 inputs
 *
 * Auth: page checks userProfile.role === 'super_admin'. Non-super-admins
 * see an "access denied" message instead of the redirect — easier for
 * Andy to debug if the wrong account is signed in.
 *
 * All data mutations go through /api/expenses/* which run their own
 * super_admin guard server-side. The client-side gate is UX only.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { formatDate as fmtDate } from '@/lib/dateFormat';
import {
  DollarSign, Plus, Trash2, Upload, X, FileText, Image as ImageIcon,
  Check, Download, Filter as FilterIcon, AlertCircle, Calendar as CalendarIcon,
  CreditCard, RefreshCw, Eye, TrendingUp,
} from 'lucide-react';

// ─── Types (mirror lib/expenseService.ts) ────────────────────────────
type Frequency = 'one_time' | 'daily' | 'weekly' | 'monthly';
type ExpenseType = 'travel' | 'software' | 'meals_drinks' | 'others';

interface Expense {
  id: string;
  template_id: string | null;
  is_template: boolean;
  user_id: string;
  amount_usd: number;
  frequency: Frequency;
  expense_type: ExpenseType;
  description: string;
  notes: string | null;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  expense_date: string | null;
  is_paid: boolean;
  paid_at: string | null;
  paid_by: string | null;
  paid_notes: string | null;
  deleted_at: string | null;
  created_by: string;
  created_at: string;
}

interface Attachment {
  id: string;
  expense_id: string;
  file_name: string;
  file_url: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_at: string;
}

interface SimpleUser { id: string; name: string; email: string }

const FREQ_LABEL: Record<Frequency, string> = {
  one_time: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};
const TYPE_LABEL: Record<ExpenseType, string> = {
  travel: 'Travel',
  software: 'Software',
  meals_drinks: 'Meals / Drinks',
  others: 'Others',
};
// v11: route expense types through the central StatusBadge tone palette
// instead of inline `bg-X-100 text-X-800` pairs. travel→info, software→purple,
// meals_drinks→warning, others→neutral preserves the original color intent.
const TYPE_TONES: Record<ExpenseType, BadgeTone> = {
  travel:        'info',
  software:      'purple',
  meals_drinks:  'warning',
  others:        'neutral',
};

const formatUSD = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(n);

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  return fmtDate(iso + (iso.length === 10 ? 'T00:00:00' : ''));
};

// ─── Component ───────────────────────────────────────────────────────
export default function ExpensesPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const isSuperAdmin = userProfile?.role === 'super_admin';

  // ─── State ─────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterUserId, setFilterUserId] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterFrequency, setFilterFrequency] = useState<string>('all');
  const [filterPaid, setFilterPaid] = useState<string>('all'); // 'all' | 'paid' | 'unpaid'
  const [filterPeriod, setFilterPeriod] = useState<string>('this_month'); // 'all' | 'this_month' | 'last_month' | 'this_year'

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<Attachment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ─── Fetchers ──────────────────────────────────────────────────
  const fetchExpenses = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('include_templates', 'false');
      // Period filter
      const now = new Date();
      if (filterPeriod === 'this_month') {
        params.set('from_date', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      } else if (filterPeriod === 'last_month') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        params.set('from_date', `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-01`);
        params.set('to_date',   `${lmEnd.getFullYear()}-${String(lmEnd.getMonth() + 1).padStart(2, '0')}-${String(lmEnd.getDate()).padStart(2, '0')}`);
      } else if (filterPeriod === 'this_year') {
        params.set('from_date', `${now.getFullYear()}-01-01`);
      }

      if (filterUserId !== 'all') params.set('user_id', filterUserId);
      if (filterType !== 'all') params.set('expense_type', filterType);
      if (filterFrequency !== 'all') params.set('frequency', filterFrequency);
      if (filterPaid === 'paid') params.set('paid', 'true');
      if (filterPaid === 'unpaid') params.set('paid', 'false');

      const r = await fetch(`/api/expenses?${params.toString()}`, { cache: 'no-store' });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`${r.status}: ${body.slice(0, 200)}`);
      }
      const data = await r.json();
      setExpenses(data.expenses || []);
    } catch (err: any) {
      console.error('[expenses] fetch', err);
      toast({ title: 'Failed to load', description: err?.message || 'Unknown', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, filterUserId, filterType, filterFrequency, filterPaid, filterPeriod, toast]);

  const fetchUsers = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('users')
      .select('id, name, email')
      .eq('is_active', true)
      .order('name');
    setUsers((data || []) as SimpleUser[]);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  // ─── Derived ──────────────────────────────────────────────────
  const totalThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return expenses
      .filter(e => e.expense_date && e.expense_date >= monthStart)
      .reduce((s, e) => s + Number(e.amount_usd), 0);
  }, [expenses]);

  const totalUnpaid = useMemo(() =>
    expenses.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.amount_usd), 0),
  [expenses]);

  const topType = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const e of expenses) {
      if (!e.is_template) {
        sums[e.expense_type] = (sums[e.expense_type] || 0) + Number(e.amount_usd);
      }
    }
    const entries = Object.entries(sums).sort((a, b) => b[1] - a[1]);
    return entries[0] ?? null;
  }, [expenses]);

  const userById = useMemo(() => {
    const m = new Map<string, SimpleUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  // ─── Selection handlers ───────────────────────────────────────
  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => setSelected(new Set(expenses.map(e => e.id)));
  const clearSelection = () => setSelected(new Set());

  // ─── Bulk mark paid ───────────────────────────────────────────
  const bulkMarkPaid = async (unpaid = false) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      const r = await fetch('/api/expenses/bulk-mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, unpaid }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      toast({
        title: unpaid ? `Marked ${data.updated} unpaid` : `Marked ${data.updated} paid`,
        description: `${data.requested - data.updated} skipped (templates / not eligible)`,
      });
      clearSelection();
      fetchExpenses();
    } catch (err: any) {
      toast({ title: 'Bulk update failed', description: err?.message, variant: 'destructive' });
    }
  };

  // ─── Open detail ──────────────────────────────────────────────
  const openDetail = async (e: Expense) => {
    setDetailExpense(e);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/expenses/${e.id}`, { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        setDetailAttachments(data.attachments || []);
      }
    } finally {
      setDetailLoading(false);
    }
  };
  const closeDetail = () => {
    setDetailOpen(false);
    setDetailExpense(null);
    setDetailAttachments([]);
  };

  // ─── CSV export ───────────────────────────────────────────────
  const exportCsv = () => {
    const headers = ['Date', 'User', 'Amount USD', 'Type', 'Frequency', 'Description', 'Paid', 'Paid At', 'Notes'];
    const rows = expenses.map(e => [
      e.expense_date || '',
      userById.get(e.user_id)?.name || e.user_id,
      e.amount_usd,
      TYPE_LABEL[e.expense_type],
      FREQ_LABEL[e.frequency],
      e.description.replace(/[\r\n]+/g, ' '),
      e.is_paid ? 'Yes' : 'No',
      e.paid_at ? new Date(e.paid_at).toISOString().slice(0, 10) : '',
      (e.notes || '').replace(/[\r\n]+/g, ' '),
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render guards ────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={DollarSign}
          title="Expenses"
          subtitle="Reimbursable spend tracking · super-admin only"
          kicker="Resources · Expenses"
          kickerDot="amber"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={DollarSign}
          title="Expenses"
          subtitle="Reimbursable spend tracking · super-admin only"
          kicker="Resources · Expenses"
          kickerDot="amber"
        />
        <EmptyState
          icon={AlertCircle}
          title="Super-admin only"
          description={`Expense tracking is restricted to super-admin accounts. Your current role: ${userProfile?.role || 'unknown'}. Ask Andy if you need access.`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DollarSign}
        title="Expenses"
        subtitle="Reimbursable spend tracking · super-admin only"
        kicker="Resources · Expenses"
        kickerDot="amber"
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
            <Button variant="brand" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Expense
            </Button>
          </>
        )}
      />

      {/* ─── KPI strip — matches /wallets KpiCard pattern ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          icon={DollarSign}
          label="This month"
          value={formatUSD(totalThisMonth)}
          sub={expenses.filter(e => e.expense_date && e.expense_date >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10)).length + ' expenses'}
        />
        <KpiCard
          icon={CreditCard}
          label="Unpaid"
          value={formatUSD(totalUnpaid)}
          sub={`${expenses.filter(e => !e.is_paid).length} pending reimbursement`}
          accent={totalUnpaid > 0 ? 'amber' : 'gray'}
        />
        <KpiCard
          icon={TrendingUp}
          label="Top category"
          value={topType ? TYPE_LABEL[topType[0] as ExpenseType] : '—'}
          sub={topType ? formatUSD(topType[1]) : 'No spend yet'}
        />
      </div>

      {/* ─── Bulk action bar (sticky when selection exists) ───
          v11 canonical bulk-bar: Card with `accent-l-brand` left stripe +
          `dot bg-brand` indicator + `mono uppercase tracking-[0.14em]`
          sub-label. Mirrors the pattern in /kols and /campaigns. Sticky
          so it follows the user as the table scrolls. */}
      {selected.size > 0 && (
        <Card className="sticky top-0 z-20 p-4 accent-l-brand">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="dot bg-brand" aria-hidden />
              <span className="text-sm font-semibold text-ink-warm-900">
                {selected.size} expense{selected.size === 1 ? '' : 's'} selected
              </span>
            </div>
            <div className="h-4 w-px bg-cream-200" />
            <span className="text-[11px] mono uppercase tracking-[0.14em] text-ink-warm-500">
              Bulk Actions
            </span>
            <Button size="sm" variant="outline" onClick={selectAllVisible}>Select All Visible</Button>
            <Button size="sm" variant="outline" onClick={clearSelection}>Clear</Button>
            <div className="ml-auto flex items-center gap-2">
              {/* deliberate emerald variant for Mark Paid affordance — not the brand CTA.
                  Mirrors the Mark Paid button in DetailDialog's status row. */}
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => bulkMarkPaid(false)}>
                <Check className="h-3.5 w-3.5 mr-1" /> Mark Paid
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMarkPaid(true)}>
                Mark Unpaid
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Section header (v11 chapter divider) ─── */}
      <SectionHeader
        label="Expenses"
        dot="brand"
        counter={`${expenses.length} of ${expenses.length} expense${expenses.length === 1 ? '' : 's'}${
          (filterUserId !== 'all' || filterType !== 'all' || filterFrequency !== 'all' || filterPaid !== 'all' || filterPeriod !== 'all')
            ? ' · filtered'
            : ''
        }`}
        first
      />

      {/* ─── Filters + Table in one card (matches /wallets pattern) ─── */}
      <Card className="border-cream-200 overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-cream-100 flex items-center gap-3 flex-wrap">
          <FilterIcon className="h-4 w-4 text-ink-warm-400 flex-shrink-0" />
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="w-[140px] h-9 text-sm focus-brand"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="last_month">Last month</SelectItem>
              <SelectItem value="this_year">This year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterUserId} onValueChange={setFilterUserId}>
            <SelectTrigger className="w-auto min-w-[160px] h-9 text-sm focus-brand gap-2"><SelectValue placeholder="User" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px] h-9 text-sm focus-brand"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(['travel','software','meals_drinks','others'] as ExpenseType[]).map(t =>
                <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterFrequency} onValueChange={setFilterFrequency}>
            <SelectTrigger className="w-[140px] h-9 text-sm focus-brand"><SelectValue placeholder="Frequency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(['one_time','daily','weekly','monthly'] as Frequency[]).map(f =>
                <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPaid} onValueChange={setFilterPaid}>
            <SelectTrigger className="w-[120px] h-9 text-sm focus-brand"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All paid</SelectItem>
              <SelectItem value="paid">Paid only</SelectItem>
              <SelectItem value="unpaid">Unpaid only</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-ink-warm-500">{expenses.length} expenses</div>
        </div>

        {/* Table body */}
        {loading ? (
          <div className="p-10">
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No expenses match these filters"
            description="Try widening the date range or clearing a filter."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-10"></TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[110px]">Date</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[140px]">User</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[110px] text-right">Amount</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[140px]">Type</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[110px]">Frequency</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Description</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[90px]">Paid?</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map(e => {
                const u = userById.get(e.user_id);
                const isSelected = selected.has(e.id);
                return (
                  <TableRow
                    key={e.id}
                    className={`border-cream-100 hover:bg-cream-50 cursor-pointer ${isSelected ? 'bg-brand-light/40' : ''}`}
                    onClick={() => openDetail(e)}
                  >
                    <TableCell className="py-3.5 px-5 w-10" onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelected(e.id)} />
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-sm text-ink-warm-700">{formatDate(e.expense_date)}</TableCell>
                    <TableCell className="py-3.5 px-5 text-sm">{u?.name || <span className="text-ink-warm-400">{e.user_id.slice(0, 8)}…</span>}</TableCell>
                    <TableCell className="py-3.5 px-5 text-right font-semibold tabular-nums">{formatUSD(Number(e.amount_usd))}</TableCell>
                    <TableCell className="py-3.5 px-5">
                      <StatusBadge tone={TYPE_TONES[e.expense_type]}>
                        {TYPE_LABEL[e.expense_type]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-xs text-ink-warm-700">
                      {e.frequency === 'one_time' ? (
                        FREQ_LABEL[e.frequency]
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <RefreshCw className="h-3 w-3 text-violet-500" /> {FREQ_LABEL[e.frequency]}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-sm text-ink-warm-700 max-w-md truncate" title={e.description}>{e.description}</TableCell>
                    <TableCell className="py-3.5 px-5">
                      {e.is_paid ? (
                        <StatusBadge tone="success">Paid</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">Unpaid</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openDetail(e)}>
                        <Eye className="h-3.5 w-3.5 text-ink-warm-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ─── Add Expense dialog ─── */}
      <AddExpenseDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        users={users}
        defaultUserId={userProfile?.id || ''}
        onCreated={() => { setAddOpen(false); fetchExpenses(); }}
      />

      {/* ─── Detail slide-over (modal for now) ─── */}
      {detailOpen && detailExpense && (
        <DetailDialog
          expense={detailExpense}
          attachments={detailAttachments}
          loading={detailLoading}
          users={users}
          onClose={closeDetail}
          onRefresh={async () => {
            await fetchExpenses();
            // refresh detail too
            const r = await fetch(`/api/expenses/${detailExpense.id}`, { cache: 'no-store' });
            if (r.ok) {
              const data = await r.json();
              setDetailExpense(data.expense);
              setDetailAttachments(data.attachments || []);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── DateField (matches /clients date-picker pattern: Popover + Button
//     trigger + Calendar widget with brand-teal selection). Wraps the
//     project-standard pattern so the form code stays compact. Value is
//     stored as 'YYYY-MM-DD' string for direct API submission. ───
function DateField({
  value, onChange, placeholder, allowClear,
}: {
  value: string;                             // 'YYYY-MM-DD' or empty
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full justify-start font-normal focus-brand"
          style={{ color: value ? '#111827' : '#9ca3af' }}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value
            ? fmtDate(selectedDate!)
            : (placeholder || 'Select date')}
          {allowClear && value && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(''); }}
              className="ml-auto opacity-50 hover:opacity-100"
              aria-label="Clear date"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
        <CalendarPicker
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) { onChange(''); return; }
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            onChange(`${y}-${m}-${d}`);
          }}
          initialFocus
          classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
          modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Add Expense dialog ──────────────────────────────────────────────
function AddExpenseDialog({
  open, onClose, users, defaultUserId, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  users: SimpleUser[];
  defaultUserId: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [userId, setUserId] = useState(defaultUserId);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('one_time');
  const [expenseType, setExpenseType] = useState<ExpenseType>('travel');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [recurrenceStart, setRecurrenceStart] = useState(new Date().toISOString().slice(0, 10));
  const [recurrenceEnd, setRecurrenceEnd] = useState('');

  useEffect(() => {
    if (open) {
      setUserId(defaultUserId);
      setAmount('');
      setFrequency('one_time');
      setExpenseType('travel');
      setDescription('');
      setNotes('');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setRecurrenceStart(new Date().toISOString().slice(0, 10));
      setRecurrenceEnd('');
    }
  }, [open, defaultUserId]);

  const submit = async () => {
    if (!userId || !amount || !description) {
      toast({ title: 'Missing fields', description: 'User, amount, and description required', variant: 'destructive' });
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const body: any = {
        user_id: userId,
        amount_usd: amt,
        frequency,
        expense_type: expenseType,
        description,
        notes: notes || null,
      };
      if (frequency === 'one_time') {
        body.expense_date = expenseDate;
      } else {
        body.recurrence_start_date = recurrenceStart;
        if (recurrenceEnd) body.recurrence_end_date = recurrenceEnd;
      }
      const r = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: 'Expense created' });
      onCreated();
    } catch (err: any) {
      toast({ title: 'Create failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* v11 canonical scroll model: flex-col so the footer stays visible
          while the body scrolls on short viewports. */}
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-brand" />
            Add Expense
          </DialogTitle>
          <DialogDescription>
            Recurring expenses generate a row immediately + one each period via cron.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4 py-2">
          <div>
            <Label>User <RequiredAsterisk /></Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-9 focus-brand"><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (USD) <RequiredAsterisk /></Label>
              <Input
                type="number" step="0.01" min="0"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 focus-brand"
              />
            </div>
            <div>
              <Label>Frequency <RequiredAsterisk /></Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger className="h-9 focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['one_time','daily','weekly','monthly'] as Frequency[]).map(f =>
                    <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type <RequiredAsterisk /></Label>
              <Select value={expenseType} onValueChange={(v) => setExpenseType(v as ExpenseType)}>
                <SelectTrigger className="h-9 focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['travel','software','meals_drinks','others'] as ExpenseType[]).map(t =>
                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {frequency === 'one_time' ? (
              <div>
                <Label>Date <RequiredAsterisk /></Label>
                <DateField value={expenseDate} onChange={setExpenseDate} placeholder="Select date" />
              </div>
            ) : (
              <div>
                <Label>Start Date <RequiredAsterisk /></Label>
                <DateField value={recurrenceStart} onChange={setRecurrenceStart} placeholder="Select start date" />
              </div>
            )}
          </div>

          {frequency !== 'one_time' && (
            <div>
              <Label>End Date (Optional)</Label>
              <DateField value={recurrenceEnd} onChange={setRecurrenceEnd} placeholder="No end date" allowClear />
              <p className="text-[11px] text-ink-warm-500 mt-1">Leave empty for indefinite. Cron stops generating after this date.</p>
            </div>
          )}

          <div>
            <Label>Description <RequiredAsterisk /></Label>
            <Input
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What was this for?"
              className="h-9 focus-brand"
            />
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Anything else worth knowing"
              className="focus-brand"
            />
          </div>

          <p className="text-[11px] text-ink-warm-500">
            Attachments can be added after creating — open the detail view.
          </p>
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="brand" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail dialog ───────────────────────────────────────────────────
function DetailDialog({
  expense, attachments, loading, users, onClose, onRefresh,
}: {
  expense: Expense;
  attachments: Attachment[];
  loading: boolean;
  users: SimpleUser[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // [v11 destructive Dialog] confirm() replaced by deletePending state +
  // confirmDelete below. softDelete keeps the soft-delete (no hard
  // erase), but the UX is now a styled Dialog. 2026-06-05.
  const [deleteExpensePending, setDeleteExpensePending] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState(false);
  const [deleteAttachmentPending, setDeleteAttachmentPending] = useState<Attachment | null>(null);
  const [deletingAttachment, setDeletingAttachment] = useState(false);

  const userById = useMemo(() => {
    const m = new Map<string, SimpleUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const togglePaid = async () => {
    try {
      const r = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_paid: !expense.is_paid }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: expense.is_paid ? 'Marked unpaid' : 'Marked paid' });
      await onRefresh();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const softDelete = () => {
    setDeleteExpensePending(true);
  };

  const confirmSoftDelete = async () => {
    setDeletingExpense(true);
    try {
      const r = await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: 'Deleted' });
      setDeleteExpensePending(false);
      onClose();
      await onRefresh();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    } finally {
      setDeletingExpense(false);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/expenses/${expense.id}/attachments`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: 'Uploaded', description: file.name });
      await onRefresh();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message?.slice(0, 200), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const viewAttachment = async (att: Attachment) => {
    try {
      const r = await fetch(`/api/expenses/attachments/${att.id}`);
      if (!r.ok) throw new Error('Sign URL failed');
      const data = await r.json();
      window.open(data.signed_url, '_blank');
    } catch (err: any) {
      toast({ title: 'Open failed', description: err?.message, variant: 'destructive' });
    }
  };

  const deleteAttachment = (att: Attachment) => {
    setDeleteAttachmentPending(att);
  };

  const confirmDeleteAttachment = async () => {
    if (!deleteAttachmentPending) return;
    setDeletingAttachment(true);
    try {
      const r = await fetch(`/api/expenses/attachments/${deleteAttachmentPending.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await r.text());
      setDeleteAttachmentPending(null);
      await onRefresh();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    } finally {
      setDeletingAttachment(false);
    }
  };

  const user = userById.get(expense.user_id);

  return (
    <>

    <Dialog open onOpenChange={(v) => !v && onClose()}>
      {/* v11 canonical scroll model: header + scrolling body + sticky footer.
          DialogContent itself is flex-col so the footer's `border-t` stays
          visible while the body content scrolls. */}
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-brand" />
            Expense Details
          </DialogTitle>
          <DialogDescription>
            Submitted by {user?.name || 'Unknown'} · {formatDate(expense.expense_date)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4 py-2">
          {/* Amount + type — read-view equivalent of the AddExpenseDialog's
              first form fields, made prominent because it's the most-glance-
              worthy info on this surface. */}
          <div className="flex items-baseline justify-between pb-3 border-b border-cream-100">
            <span className="text-2xl font-semibold text-ink-warm-900 tabular-nums">
              {formatUSD(Number(expense.amount_usd))}
            </span>
            <StatusBadge tone={TYPE_TONES[expense.expense_type]}>
              {TYPE_LABEL[expense.expense_type]}
            </StatusBadge>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-cream-50 border border-cream-200">
            {expense.is_paid ? (
              <>
                <StatusBadge tone="success">
                  <Check className="h-3 w-3" /> Paid
                </StatusBadge>
                <div className="flex-1">
                  <p className="text-xs text-ink-warm-500">{formatDate(expense.paid_at)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={togglePaid}>Mark Unpaid</Button>
              </>
            ) : (
              <>
                <StatusBadge tone="warning">
                  <AlertCircle className="h-3 w-3" /> Unpaid
                </StatusBadge>
                <div className="flex-1">
                  <p className="text-xs text-ink-warm-500">Reimbursement pending</p>
                </div>
                {/* deliberate emerald variant for Mark Paid affordance — matches the
                    Mark Paid button in the bulk action bar; not the brand CTA. */}
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={togglePaid}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Mark Paid
                </Button>
              </>
            )}
          </div>

          {/* Details — read-view fields mirror the AddExpenseDialog's form
              labels (same <Label> component, same default size) so the two
              dialogs feel like two faces of the same surface. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <Label className="text-ink-warm-500 font-normal">User</Label>
              <p className="text-sm text-ink-warm-900 mt-1">{user?.name || expense.user_id}</p>
              {user?.email && <p className="text-xs text-ink-warm-500">{user.email}</p>}
            </div>
            <div>
              <Label className="text-ink-warm-500 font-normal">Date</Label>
              <p className="text-sm text-ink-warm-900 mt-1 flex items-center gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5 text-ink-warm-400" />
                {formatDate(expense.expense_date)}
              </p>
            </div>
            <div className="col-span-2">
              <Label className="text-ink-warm-500 font-normal">Description</Label>
              <p className="text-sm text-ink-warm-900 mt-1">{expense.description}</p>
            </div>
            {expense.notes && (
              <div className="col-span-2">
                <Label className="text-ink-warm-500 font-normal">Notes</Label>
                <p className="text-sm text-ink-warm-700 mt-1 whitespace-pre-wrap">{expense.notes}</p>
              </div>
            )}
            <div className="col-span-2">
              <Label className="text-ink-warm-500 font-normal">Frequency</Label>
              <p className="text-sm text-ink-warm-900 mt-1 flex items-center gap-1.5">
                {expense.frequency !== 'one_time' && <RefreshCw className="h-3.5 w-3.5 text-violet-500" />}
                {FREQ_LABEL[expense.frequency]}
                {expense.template_id && (
                  <span className="text-xs text-ink-warm-500 ml-2">(instance of a recurring template)</span>
                )}
              </p>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-ink-warm-500 font-normal">
                Attachments ({attachments.length}/5)
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={uploading || attachments.length >= 5}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3 mr-1" />
                {uploading ? 'Uploading…' : 'Add Receipt'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            {loading ? (
              <div className="space-y-1.5 py-1">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-lg" />
                ))}
              </div>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-ink-warm-500 py-3">No receipts yet. Max 5 files, 10MB each. JPG/PNG/GIF/WebP/PDF.</p>
            ) : (
              <div className="space-y-1.5">
                {attachments.map(att => {
                  const isImage = att.mime_type?.startsWith('image/');
                  return (
                    <div key={att.id} className="flex items-center gap-2 p-2 bg-cream-50 border border-cream-200 rounded-lg text-sm">
                      {isImage ? <ImageIcon className="h-4 w-4 text-violet-500" /> : <FileText className="h-4 w-4 text-rose-500" />}
                      <span className="flex-1 truncate" title={att.file_name}>{att.file_name}</span>
                      <span className="text-xs text-ink-warm-500 tabular-nums">
                        {att.file_size_bytes ? `${Math.round(att.file_size_bytes / 1024)}KB` : '—'}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => viewAttachment(att)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => deleteAttachment(att)}>
                        <X className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0 flex justify-between sm:justify-between">
          <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={softDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete expense confirm — v11 destructive Dialog replacing the
        native confirm() that used to live in softDelete. The endpoint
        soft-deletes (DB row stays), so the copy reflects that.
        2026-06-05. */}
    <Dialog open={deleteExpensePending} onOpenChange={(open) => { if (!open) setDeleteExpensePending(false); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-rose-500" />
            Delete Expense?
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-warm-700 pt-2">
            Soft-deletes the expense — can be restored from the DB.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => setDeleteExpensePending(false)} disabled={deletingExpense}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmSoftDelete} disabled={deletingExpense}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {deletingExpense ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete attachment confirm — v11 destructive Dialog replacing the
        native confirm() that used to live in deleteAttachment.
        2026-06-05. */}
    <Dialog open={!!deleteAttachmentPending} onOpenChange={(open) => { if (!open) setDeleteAttachmentPending(null); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-rose-500" />
            Delete Attachment?
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-warm-700 pt-2">
            <strong>{deleteAttachmentPending?.file_name ?? ''}</strong> will be removed from this expense.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => setDeleteAttachmentPending(null)} disabled={deletingAttachment}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDeleteAttachment} disabled={deletingAttachment}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {deletingAttachment ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
