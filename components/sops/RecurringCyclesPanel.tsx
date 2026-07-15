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
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Pause, Play, Trash2, Repeat, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { DeliverableService } from '@/lib/deliverableService';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';

const UNASSIGNED = '__unassigned__';

/** Per-step assignee editor for one recurring cycle. Loads the template's
 *  steps + current map, saves the step->user map back. */
function AssigneesDialog({
  cycle, teamMembers, onClose, onSaved,
}: {
  cycle: { id: string; client_name: string | null; template_name: string | null } | null;
  teamMembers: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (cycleId: string, assignedCount: number) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState<Array<{ id: string; step_name: string; step_order: number }>>([]);
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cycle) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cfg = await DeliverableService.getRecurringAssigneeConfig(cycle.id);
      if (cancelled) return;
      setSteps(cfg.steps);
      setMap(cfg.assignees);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cycle]);

  const save = async () => {
    if (!cycle) return;
    setSaving(true);
    // Strip empty selections so the stored map only holds real assignments.
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) if (v) clean[k] = v;
    const ok = await DeliverableService.setRecurringStepAssignees(cycle.id, clean);
    setSaving(false);
    if (!ok) {
      toast({ title: 'Save failed', description: 'Could not save assignees.', variant: 'destructive' });
      return;
    }
    onSaved(cycle.id, Object.keys(clean).length);
    toast({ title: 'Assignees saved', description: 'Applies automatically every cycle.' });
    onClose();
  };

  return (
    <Dialog open={!!cycle} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assignees</DialogTitle>
          <DialogDescription>
            {cycle && <>{cycle.template_name} · {cycle.client_name} — set once, auto-assigns every cycle. No notifications fire on spawn.</>}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
          </div>
        ) : steps.length === 0 ? (
          <p className="text-sm text-ink-warm-500 py-4">This template has no steps.</p>
        ) : (
          <div className="space-y-2 py-1 max-h-[50vh] overflow-y-auto">
            {steps.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-sm text-ink-warm-800 flex-1 min-w-0 truncate">
                  <span className="text-ink-warm-400 tabular-nums mr-1">{s.step_order}.</span>{s.step_name}
                </span>
                <Select
                  value={map[s.id] || UNASSIGNED}
                  onValueChange={(v) => setMap((prev) => ({ ...prev, [s.id]: v === UNASSIGNED ? '' : v }))}
                >
                  <SelectTrigger className="h-8 w-44 focus-brand text-xs">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="brand" onClick={save} disabled={saving || loading}>Save assignees</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [assigneeCycle, setAssigneeCycle] = useState<Cycle | null>(null);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await DeliverableService.listRecurringDeliverables();
    setCycles(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Team members for the assignee pickers (active users, name-sorted).
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('users')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      setTeamMembers(((data ?? []) as any[]).map((u) => ({ id: u.id, name: u.name })));
    })();
  }, []);

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
                          onClick={() => setAssigneeCycle(c)}
                        >
                          <Users className="h-3.5 w-3.5 mr-1" />
                          {c.assigned_count > 0 ? `${c.assigned_count} assigned` : 'Assign'}
                        </Button>
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

      <AssigneesDialog
        cycle={assigneeCycle}
        teamMembers={teamMembers}
        onClose={() => setAssigneeCycle(null)}
        onSaved={(cycleId, assignedCount) =>
          setCycles((prev) => prev.map((x) => (x.id === cycleId ? { ...x, assigned_count: assignedCount } : x)))
        }
      />
    </Card>
  );
}
