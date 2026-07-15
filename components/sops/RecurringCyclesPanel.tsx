'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RefreshCw, Pause, Play, Trash2, Repeat, ChevronDown, ChevronRight } from 'lucide-react';
import { DeliverableService } from '@/lib/deliverableService';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';

type Cycle = Awaited<ReturnType<typeof DeliverableService.listRecurringDeliverables>>[number];

const DOW_LABEL: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly',
};

/**
 * [2026-07-15, per Bolt] Management panel for auto-generating deliverable
 * cycles (`recurring_deliverables`). Lets ops Pause/Resume or Delete a cycle
 * — the "stop function" that was missing, so a paused client (e.g. Altura)
 * stops generating. Complements the cron's automatic client-lapsed guard,
 * which is surfaced here as an "Auto-skipped" chip.
 *
 * Lives on /sops (where cycles are created via Run All). Collapsed by default
 * so it doesn't crowd the SOP list.
 */
export function RecurringCyclesPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Cycle | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await DeliverableService.listRecurringDeliverables();
    setCycles(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (c: Cycle) => {
    setBusyId(c.id);
    const ok = await DeliverableService.setRecurringActive(c.id, !c.active);
    setBusyId(null);
    if (!ok) {
      toast({ title: 'Update failed', description: 'Could not change the cycle status.', variant: 'destructive' });
      return;
    }
    setCycles((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
    toast({
      title: c.active ? 'Cycle paused' : 'Cycle resumed',
      description: `${c.client_name ?? 'Client'} · ${c.template_name ?? 'Template'}`,
    });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const c = pendingDelete;
    setBusyId(c.id);
    const ok = await DeliverableService.deleteRecurringDeliverable(c.id);
    setBusyId(null);
    setPendingDelete(null);
    if (!ok) {
      toast({ title: 'Delete failed', description: 'Could not remove the cycle.', variant: 'destructive' });
      return;
    }
    setCycles((prev) => prev.filter((x) => x.id !== c.id));
    toast({ title: 'Cycle deleted', description: 'Already-spawned tasks are untouched.' });
  };

  const activeCount = cycles.filter((c) => c.active && !c.client_lapsed).length;

  return (
    <Card className="border-cream-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-cream-50/60 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-ink-warm-400" /> : <ChevronRight className="h-4 w-4 text-ink-warm-400" />}
        <Repeat className="h-4 w-4 text-brand" />
        <span className="text-sm font-semibold text-ink-warm-900">Recurring Cycles</span>
        <span className="text-xs text-ink-warm-500">
          {loading ? '' : `${activeCount} active${cycles.length !== activeCount ? ` · ${cycles.length} total` : ''}`}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1 text-xs text-ink-warm-500 hover:text-brand"
          onClick={(e) => { e.stopPropagation(); load(); }}
          role="button"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="border-t border-cream-100">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : cycles.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No recurring cycles"
              description="Run an SOP with a recurring trigger to create one."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Client</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Template</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Cadence</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Last fired</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((c) => (
                  <TableRow key={c.id} className="border-gray-100">
                    <TableCell className="py-3 font-medium text-ink-warm-900">{c.client_name ?? '—'}</TableCell>
                    <TableCell className="py-3 text-ink-warm-700">{c.template_name ?? '—'}</TableCell>
                    <TableCell className="py-3 text-ink-warm-600">
                      {CADENCE_LABEL[c.cadence] ?? c.cadence} · {DOW_LABEL[c.day_of_week] ?? `Day ${c.day_of_week}`}
                    </TableCell>
                    <TableCell className="py-3">
                      {c.client_lapsed ? (
                        <StatusBadge tone="danger" size="sm">Auto-skipped</StatusBadge>
                      ) : c.active ? (
                        <StatusBadge tone="brand" size="sm">Active</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning" size="sm">Paused</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-ink-warm-600 tabular-nums">
                      {c.last_fired_at ? formatDate(c.last_fired_at) : '—'}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={busyId === c.id}
                          onClick={() => toggleActive(c)}
                        >
                          {c.active ? <><Pause className="h-3.5 w-3.5 mr-1" />Pause</> : <><Play className="h-3.5 w-3.5 mr-1" />Resume</>}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          disabled={busyId === c.id}
                          onClick={() => setPendingDelete(c)}
                          aria-label="Delete cycle"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && cycles.some((c) => c.client_lapsed) && (
            <p className="px-4 py-2 text-[11px] text-ink-warm-500 border-t border-cream-100">
              <span className="text-rose-600 font-medium">Auto-skipped</span> cycles won&apos;t generate — the client&apos;s engagement has lapsed. Resume automatically once coverage is renewed.
            </p>
          )}
        </div>
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recurring cycle?</DialogTitle>
            <DialogDescription>
              {pendingDelete && (
                <>Stop auto-generating <span className="font-medium">{pendingDelete.template_name}</span> for{' '}
                <span className="font-medium">{pendingDelete.client_name}</span>. Tasks already created stay put. This can&apos;t be undone.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busyId === pendingDelete?.id}>
              Delete cycle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
