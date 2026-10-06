'use client';

/**
 * Recurring expense templates — the management surface for them.
 *
 * [Andy 2026-09-27] There wasn't one. The ledger hard-codes
 * include_templates=false, so once a recurring expense was created it became
 * invisible: no way to see it, end it, or stop it. The only exits were
 * editing the row by hand or deleting it, which takes the history with it.
 *
 * Pause is deliberately not recurrence_end_date. An end date says the
 * recurrence is over and reads as history; pause says "not this month, keep
 * it". Collapsing the two would make a cancelled subscription and a
 * temporarily-stopped one the same record.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { RefreshCw, Pause, Play, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Template = {
  id: string;
  description: string;
  amount_usd: string | number;
  frequency: string;
  expense_type: string;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  paused_at: string | null;
};

const formatUSD = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function RecurringTemplatesPanel({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Template[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses?templates_only=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setRows((data.expenses ?? []) as Template[]);
    } catch (err) {
      toast({
        title: 'Could not load recurring expenses',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setRows([]);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const togglePause = async (t: Template) => {
    const next = !t.paused_at;
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/expenses/${t.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast({
        title: next ? 'Recurring expense paused' : 'Recurring expense resumed',
        description: next
          ? `${t.description} won't generate again until you resume it.`
          : `${t.description} will generate on its next due date.`,
      });
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: next ? 'Pause failed' : 'Resume failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  // Delete = stop for good. The service soft-deletes the template and its
  // upcoming copies; past expenses stay so reports keep their numbers.
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null);
  const remove = async (t: Template) => {
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/expenses/${t.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast({ title: 'Recurring expense deleted', description: `${t.description} won't generate again. Past expenses are kept.` });
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  const activeCount = (rows ?? []).filter(r => !r.paused_at && !ended(r)).length;

  return (
    <div className="space-y-3">
      <SectionHeader
        label="Recurring"
        dot="brand"
        counter={rows === null
          ? ''
          : `${rows.length} template${rows.length === 1 ? '' : 's'} · ${activeCount} generating`}
      />

      {rows === null ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="No recurring expenses"
          description="Create one with a frequency other than one-off and it will appear here."
        />
      ) : (
        <Card className="border-cream-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Description</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Amount</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Every</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Since</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">State</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(t => {
                  const isEnded = ended(t);
                  const isPaused = !!t.paused_at;
                  return (
                    <TableRow key={t.id} className="border-gray-100">
                      <TableCell className="py-3 font-medium">{t.description}</TableCell>
                      <TableCell className="py-3 text-right tabular-nums">{formatUSD(Number(t.amount_usd || 0))}</TableCell>
                      <TableCell className="py-3 capitalize">{t.frequency}</TableCell>
                      <TableCell className="py-3 tabular-nums">
                        {t.recurrence_start_date ? formatDate(t.recurrence_start_date) : '—'}
                      </TableCell>
                      <TableCell className="py-3">
                        {isEnded ? (
                          <StatusBadge tone="neutral" size="sm">
                            Ended {t.recurrence_end_date ? formatDate(t.recurrence_end_date) : ''}
                          </StatusBadge>
                        ) : isPaused ? (
                          <StatusBadge tone="warning" size="sm">
                            Paused {formatDate(t.paused_at!)}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="success" size="sm">Generating</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        {/* An ended recurrence has nothing to pause — the end
                            date already stopped it, and offering Pause there
                            would imply resuming could restart it. */}
                        <div className="inline-flex items-center gap-1.5">
                          {!isEnded && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 focus-brand"
                              disabled={busyId === t.id}
                              onClick={() => togglePause(t)}
                            >
                              {isPaused
                                ? <><Play className="h-3.5 w-3.5 mr-1" />Resume</>
                                : <><Pause className="h-3.5 w-3.5 mr-1" />Pause</>}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            aria-label={`Delete ${t.description}`}
                            disabled={busyId === t.id}
                            onClick={() => setConfirmDelete(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.description}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops for good and removes any upcoming copies. Expenses it already created stay, so past months don’t change.
              To stop it for a while instead, use Pause.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (confirmDelete) void remove(confirmDelete); }}
            >
              Delete recurring expense
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Past its end date — stopped for good, not pausable. */
function ended(t: Template): boolean {
  if (!t.recurrence_end_date) return false;
  return t.recurrence_end_date < new Date().toISOString().slice(0, 10);
}
