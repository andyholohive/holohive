'use client';

/**
 * EngagementTab — 5th tab inside the Client Context modal.
 *
 * Shipping the missing editor for the Stint + Period substrate. Before
 * this, the only way to add or correct stints/periods was direct
 * Supabase Studio edits. The lapse cron + dashboard coverage pills
 * already consume this data; this tab is the manual write surface.
 *
 * Layout:
 *   - Outer header: "Add Stint" button (brand)
 *   - One Card per stint, newest first
 *     • Card header: stint dates, status pill, coverage tone pill, edit/delete
 *     • Card body: Periods table + "Add Period" button
 *   - Add/Edit dialogs for both stints and periods
 *
 * Per CLAUDE.md conventions:
 *   - Table primitives, not raw <table>
 *   - StatusBadge for all status pills (mapped from the 9-tone palette)
 *   - Popover + Calendar for dates — never <Input type="date">
 *   - formatDate / toIsoDate from lib/dateFormat (mm/dd/yyyy)
 *   - focus-brand on inputs, brand variant on primary CTAs
 *   - EmptyState, Skeleton wrappers
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Handshake, Plus, Pencil, Trash2, Calendar as CalIcon, ChevronDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate, toIsoDate } from '@/lib/dateFormat';
import {
  fetchClientEngagement, createStint, updateStint, deleteStint,
  createPeriod, updatePeriod, deletePeriod, nextPeriodN,
  type StintWithPeriods, type ClientStint, type EngagementPeriod,
} from '@/lib/clientEngagementService';

// ─── Status palette ─────────────────────────────────────────────────

const STINT_STATUS_TONE: Record<string, BadgeTone> = {
  active: 'brand',
  ended: 'neutral',
};

const COVERAGE_TONE: Record<string, BadgeTone> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
};

// ─── Date helpers ───────────────────────────────────────────────────

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  // Parse as local date to avoid the UTC-shift "off-by-one" bug — `new
  // Date('2026-06-23')` parses as UTC midnight which renders as the
  // previous day in negative-offset timezones.
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

// ─── Form types ─────────────────────────────────────────────────────

type StintForm = {
  start_date: Date | undefined;
  end_date: Date | undefined;
  status: 'active' | 'ended';
  ended_reason: string;
  notes: string;
};

const EMPTY_STINT_FORM: StintForm = {
  start_date: undefined,
  end_date: undefined,
  status: 'active',
  ended_reason: '',
  notes: '',
};

type PeriodForm = {
  period_n: number;
  start_date: Date | undefined;
  end_date: Date | undefined;
  // amount is stored formatted with thousands separators ("12,500") so
  // the input always renders with commas as the user types; parsed
  // back to a plain number via parseAmount() at save time.
  amount: string;
  notes: string;
};

const EMPTY_PERIOD_FORM: PeriodForm = {
  period_n: 1,
  start_date: undefined,
  end_date: undefined,
  amount: '',
  notes: '',
};

// ─── Amount formatting helpers ──────────────────────────────────────
// Display value carries commas while typing — strip them at save time.
// One decimal point + up to 2 decimals (USD cents). Anything else is
// dropped silently so paste-from-spreadsheet stays forgiving.
function formatAmountInput(raw: string): string {
  const digitsOnly = raw.replace(/[^0-9.]/g, '');
  if (!digitsOnly) return '';
  const [intPart, ...decimalParts] = digitsOnly.split('.');
  const formattedInt = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (decimalParts.length === 0) return formattedInt;
  const decimalDigits = decimalParts.join('').slice(0, 2);
  return `${formattedInt}.${decimalDigits}`;
}

function parseAmount(formatted: string): number {
  const stripped = formatted.replace(/,/g, '');
  return Number(stripped);
}

// ─── Date field shared between dialogs ─────────────────────────────

function DateField({
  value, onChange, label, required = false, allowClear = false,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  label: string;
  required?: boolean;
  allowClear?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>
        {label} {required && <RequiredAsterisk />}
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full justify-start font-normal focus-brand"
          >
            <CalIcon className="mr-2 h-3.5 w-3.5" />
            {value ? formatDate(toIsoDate(value)) : 'Select date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[100]" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => onChange(d || undefined)}
            initialFocus
            classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
            modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
          />
        </PopoverContent>
      </Popover>
      {allowClear && value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs text-ink-warm-500 hover:text-rose-600 w-fit"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export function EngagementTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stints, setStints] = useState<StintWithPeriods[]>([]);
  const [expandedStintIds, setExpandedStintIds] = useState<Set<string>>(new Set());

  // Stint dialog state.
  const [stintDialogOpen, setStintDialogOpen] = useState(false);
  const [editingStint, setEditingStint] = useState<ClientStint | null>(null);
  const [stintForm, setStintForm] = useState<StintForm>(EMPTY_STINT_FORM);
  const [savingStint, setSavingStint] = useState(false);

  // Period dialog state.
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [periodDialogStintId, setPeriodDialogStintId] = useState<string | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<EngagementPeriod | null>(null);
  const [periodForm, setPeriodForm] = useState<PeriodForm>(EMPTY_PERIOD_FORM);
  const [savingPeriod, setSavingPeriod] = useState(false);

  // Delete confirmation.
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'stint'; id: string; label: string } | { kind: 'period'; id: string; label: string } | null
  >(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchClientEngagement(clientId);
      setStints(rows);
      // Expand the most-recent stint by default so the user sees periods
      // without an extra click. Don't auto-expand any others.
      if (rows.length > 0) {
        setExpandedStintIds(new Set([rows[0].id]));
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Failed to load engagement.';
      toast({ title: 'Could not load engagement', description: err, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ─── Stint actions ───────────────────────────────────────────────

  function openAddStint() {
    setEditingStint(null);
    setStintForm(EMPTY_STINT_FORM);
    setStintDialogOpen(true);
  }

  function openEditStint(stint: ClientStint) {
    setEditingStint(stint);
    setStintForm({
      start_date: parseIso(stint.start_date),
      end_date: parseIso(stint.end_date),
      status: (stint.status === 'ended' ? 'ended' : 'active'),
      ended_reason: stint.ended_reason ?? '',
      notes: stint.notes ?? '',
    });
    setStintDialogOpen(true);
  }

  async function saveStint() {
    if (!stintForm.start_date) {
      toast({ title: 'Start date required', variant: 'destructive' });
      return;
    }
    setSavingStint(true);
    try {
      // status + ended_reason are derived: status is auto-set by the
      // client_stints_derive_status DB trigger; we no longer expose
      // status/reason in the dialog (per Andy 2026-06-30). Sending
      // `status` is still safe — the trigger overrides on write — but
      // omitting `ended_reason` preserves any prior value (e.g.
      // "coverage_lapse" stamped by the cron) on edit.
      const payload = {
        client_id: clientId,
        start_date: toIsoDate(stintForm.start_date)!,
        end_date: stintForm.end_date ? toIsoDate(stintForm.end_date)! : null,
        notes: stintForm.notes.trim() || null,
      };
      if (editingStint) {
        await updateStint(editingStint.id, payload);
        toast({ title: 'Stint updated' });
      } else {
        await createStint(payload);
        toast({ title: 'Stint added' });
      }
      setStintDialogOpen(false);
      await load();
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Save failed.';
      toast({ title: 'Could not save stint', description: err, variant: 'destructive' });
    } finally {
      setSavingStint(false);
    }
  }

  // ─── Period actions ──────────────────────────────────────────────

  async function openAddPeriod(stintId: string) {
    setEditingPeriod(null);
    setPeriodDialogStintId(stintId);
    try {
      const n = await nextPeriodN(stintId);
      setPeriodForm({ ...EMPTY_PERIOD_FORM, period_n: n });
    } catch {
      setPeriodForm({ ...EMPTY_PERIOD_FORM, period_n: 1 });
    }
    setPeriodDialogOpen(true);
  }

  function openEditPeriod(period: EngagementPeriod) {
    setEditingPeriod(period);
    setPeriodDialogStintId(period.stint_id);
    setPeriodForm({
      period_n: period.period_n,
      start_date: parseIso(period.start_date),
      end_date: parseIso(period.end_date),
      amount: period.amount != null ? formatAmountInput(String(period.amount)) : '',
      notes: period.notes ?? '',
    });
    setPeriodDialogOpen(true);
  }

  async function savePeriod() {
    if (!periodDialogStintId) return;
    if (!periodForm.start_date || !periodForm.end_date) {
      toast({ title: 'Start + end dates required', variant: 'destructive' });
      return;
    }
    // [2026-06-26] Amount required (was optional with 0 fallback).
    if (periodForm.amount.trim() === '') {
      toast({ title: 'Amount required', variant: 'destructive' });
      return;
    }
    const amt = parseAmount(periodForm.amount);
    if (Number.isNaN(amt) || amt < 0) {
      toast({ title: 'Amount must be a non-negative number', variant: 'destructive' });
      return;
    }
    setSavingPeriod(true);
    try {
      // [2026-06-26] Save bug fix: scope has a CHECK constraint that
      // only allows ('initial','renewal','scope_add'). The old form
      // sent scope: '' (empty string) which violated CHECK and silently
      // failed every save. Omitting scope + signed_date from the
      // payload lets the DB default (scope='initial') apply on insert
      // and preserves existing values on update.
      const payload = {
        stint_id: periodDialogStintId,
        period_n: periodForm.period_n,
        start_date: toIsoDate(periodForm.start_date)!,
        end_date: toIsoDate(periodForm.end_date)!,
        amount: amt,
        notes: periodForm.notes.trim() || null,
      };
      if (editingPeriod) {
        await updatePeriod(editingPeriod.id, payload);
        toast({ title: 'Term updated' });
      } else {
        await createPeriod(payload);
        toast({ title: 'Term added' });
      }
      setPeriodDialogOpen(false);
      await load();
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Save failed.';
      toast({ title: 'Could not save term', description: err, variant: 'destructive' });
    } finally {
      setSavingPeriod(false);
    }
  }

  async function runDelete() {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === 'stint') {
        await deleteStint(confirmDelete.id);
        toast({ title: 'Stint deleted' });
      } else {
        await deletePeriod(confirmDelete.id);
        toast({ title: 'Term deleted' });
      }
      setConfirmDelete(null);
      await load();
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Delete failed.';
      toast({ title: 'Could not delete', description: err, variant: 'destructive' });
    }
  }

  function toggleExpanded(stintId: string) {
    setExpandedStintIds((prev) => {
      const next = new Set(prev);
      if (next.has(stintId)) next.delete(stintId);
      else next.add(stintId);
      return next;
    });
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-warm-900">Engagement</h3>
        <Button type="button" variant="brand" size="sm" onClick={openAddStint}>
          <Plus className="h-4 w-4 mr-2" />Add Stint
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ) : stints.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No stints yet"
          description="Add a stint to start tracking this client's engagement timeline."
        >
          <Button type="button" variant="brand" onClick={openAddStint}>
            <Plus className="h-4 w-4 mr-2" />Add First Stint
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {stints.map((stint) => {
            const isExpanded = expandedStintIds.has(stint.id);
            const coverageTone = stint.coverage?.coverage_tone
              ? (COVERAGE_TONE[stint.coverage.coverage_tone] ?? 'neutral')
              : null;
            const daysLeft = stint.coverage?.days_left;
            return (
              <Card key={stint.id} className="border-cream-200 overflow-hidden">
                {/* Header */}
                {(() => {
                  // [2026-07-02] Per Andy: the stint's own start_date /
                  // end_date were drifting from the actual engagement
                  // data (top said 5/5 while periods said 5/15). Derive
                  // the displayed dates from MIN/MAX of the periods so
                  // the header always mirrors what the terms table
                  // shows below. Falls back to the raw stint fields
                  // only when there are no periods yet.
                  const periodStarts = stint.periods.map(p => p.start_date).filter(Boolean).sort();
                  const periodEnds = stint.periods.map(p => p.end_date).filter(Boolean).sort();
                  const displayStart = periodStarts[0] ?? stint.start_date;
                  const displayEnd = periodEnds.length > 0
                    ? periodEnds[periodEnds.length - 1]
                    : stint.end_date;
                  return (
                <div className="p-3 border-b border-cream-100 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(stint.id)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    <ChevronDown
                      className={`h-4 w-4 text-ink-warm-400 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink-warm-900">
                        {formatDate(displayStart)}
                        {' → '}
                        {displayEnd ? formatDate(displayEnd) : 'Ongoing'}
                      </div>
                      <div className="text-xs text-ink-warm-500">
                        {stint.periods.length} term{stint.periods.length === 1 ? '' : 's'}
                        {stint.coverage?.covered_through && (
                          <> · Covered through {formatDate(stint.coverage.covered_through)}</>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge tone={STINT_STATUS_TONE[stint.status] ?? 'neutral'} size="sm">
                      {stint.status === 'ended' ? 'Ended' : 'Active'}
                    </StatusBadge>
                    {coverageTone && daysLeft != null && (
                      <StatusBadge tone={coverageTone} size="sm">
                        {daysLeft >= 0 ? `${daysLeft}d left` : `Lapsed ${Math.abs(daysLeft)}d ago`}
                      </StatusBadge>
                    )}
                    {/* [2026-07-02] Per Andy: no Edit pencil for stints —
                        the stint is now a derived container that mirrors
                        the underlying terms. Correct dates by editing
                        the terms instead. Delete stays for the "wrong
                        stint entirely, blow it away" case. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                      onClick={() =>
                        setConfirmDelete({
                          kind: 'stint',
                          id: stint.id,
                          label: `${formatDate(displayStart)} stint and all its ${stint.periods.length} term(s)`,
                        })
                      }
                      aria-label="Delete stint"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                  );
                })()}

                {/* Body */}
                {isExpanded && (
                  <div className="p-3 space-y-3">
                    {stint.notes && (
                      <p className="text-xs text-ink-warm-700 italic border-l-2 border-cream-300 pl-3">
                        {stint.notes}
                      </p>
                    )}
                    {stint.status === 'ended' && stint.ended_reason && (
                      <p className="text-xs text-ink-warm-500">
                        <span className="font-medium">Ended:</span> {stint.ended_reason}
                      </p>
                    )}
                    {stint.periods.length === 0 ? (
                      <EmptyState
                        icon={CalIcon}
                        title="No terms yet"
                        description="Add a term to extend coverage."
                      >
                        <Button type="button" variant="brand" size="sm" onClick={() => openAddPeriod(stint.id)}>
                          <Plus className="h-4 w-4 mr-2" />Add First Term
                        </Button>
                      </EmptyState>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-ink-warm-500 w-12">#</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-ink-warm-500">Dates</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-ink-warm-500 text-right">Amount</TableHead>
                              <TableHead className="h-9 py-2 w-20" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stint.periods.map((p) => (
                              <TableRow key={p.id} className="border-cream-100">
                                <TableCell className="py-2.5 font-mono text-xs text-ink-warm-700">{p.period_n}</TableCell>
                                <TableCell className="py-2.5 text-sm">
                                  {formatDate(p.start_date)} → {formatDate(p.end_date)}
                                </TableCell>
                                <TableCell className="py-2.5 text-sm text-right tabular-nums">
                                  {p.amount > 0 ? `$${Number(p.amount).toLocaleString('en-US')}` : <span className="text-ink-warm-400">—</span>}
                                </TableCell>
                                <TableCell className="py-2.5 text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => openEditPeriod(p)}
                                      aria-label="Edit term"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                                      onClick={() =>
                                        setConfirmDelete({
                                          kind: 'period',
                                          id: p.id,
                                          label: `Term ${p.period_n} (${formatDate(p.start_date)} → ${formatDate(p.end_date)})`,
                                        })
                                      }
                                      aria-label="Delete term"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openAddPeriod(stint.id)}
                          className="w-fit"
                        >
                          <Plus className="h-4 w-4 mr-2" />Add Term
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Stint dialog ─────────────────────────────────────────── */}
      <Dialog open={stintDialogOpen} onOpenChange={setStintDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingStint ? 'Edit Stint' : 'Add Stint'}</DialogTitle>
            <DialogDescription>
              A stint is one continuous engagement. End it when the client churns or pauses;
              start a fresh stint if they come back.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <DateField
                label="Start Date"
                required
                value={stintForm.start_date}
                onChange={(d) => setStintForm({ ...stintForm, start_date: d })}
              />
              <DateField
                label="End Date"
                allowClear
                value={stintForm.end_date}
                onChange={(d) => setStintForm({ ...stintForm, end_date: d })}
              />
            </div>
            {/* Status + ended_reason controls dropped per Andy 2026-06-30 —
                status is now auto-derived from end_date by the
                client_stints_derive_status DB trigger. Set an End Date
                to mark a stint as ended; leave it blank to keep active. */}
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                value={stintForm.notes}
                onChange={(e) => setStintForm({ ...stintForm, notes: e.target.value })}
                placeholder="Anything else worth knowing about this stint."
                className="focus-brand"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStintDialogOpen(false)}>Cancel</Button>
            <Button variant="brand" onClick={saveStint} disabled={savingStint}>
              {savingStint ? 'Saving…' : 'Save Stint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Period dialog ────────────────────────────────────────── */}
      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingPeriod ? 'Edit Term' : 'Add Term'}</DialogTitle>
            <DialogDescription>
              A term is one signed slice of work inside a stint. Add one per renewal or
              expansion; the dashboard reads the latest end-date as "covered through."
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Period # alone on its row — Signed Date hidden per
                Andy 2026-06-26 (rarely used; clutters the form). */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Term # <RequiredAsterisk /></Label>
                <Input
                  type="number"
                  min={1}
                  value={periodForm.period_n}
                  onChange={(e) => setPeriodForm({ ...periodForm, period_n: Number(e.target.value) || 1 })}
                  className="h-9 focus-brand"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Amount (USD) <RequiredAsterisk /></Label>
                {/* Text input with live thousands-separator formatting.
                    inputMode=decimal pops the numeric keypad on mobile.
                    Saved as a plain number via parseAmount(). */}
                <Input
                  type="text"
                  inputMode="decimal"
                  value={periodForm.amount}
                  onChange={(e) => setPeriodForm({ ...periodForm, amount: formatAmountInput(e.target.value) })}
                  placeholder="0"
                  className="h-9 focus-brand"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DateField
                label="Start Date"
                required
                value={periodForm.start_date}
                onChange={(d) => setPeriodForm({ ...periodForm, start_date: d })}
              />
              <DateField
                label="End Date"
                required
                value={periodForm.end_date}
                onChange={(d) => setPeriodForm({ ...periodForm, end_date: d })}
              />
            </div>
            {/* Scope textarea hidden per Andy 2026-06-26 — also fixes a
                silent save bug: the DB CHECK constraint only allows
                scope IN ('initial','renewal','scope_add'), so free
                text from this field would violate CHECK and every
                save would fail. DB default 'initial' now applies. */}
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                value={periodForm.notes}
                onChange={(e) => setPeriodForm({ ...periodForm, notes: e.target.value })}
                placeholder="Anything else about this period."
                className="focus-brand"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialogOpen(false)}>Cancel</Button>
            <Button variant="brand" onClick={savePeriod} disabled={savingPeriod}>
              {savingPeriod ? 'Saving…' : 'Save Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ──────────────────────────────────── */}
      <Dialog open={confirmDelete !== null} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.kind === 'stint' ? 'Stint' : 'Term'}</DialogTitle>
            <DialogDescription>
              This will permanently remove {confirmDelete?.label}. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={runDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
