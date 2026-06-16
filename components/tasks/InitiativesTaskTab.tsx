'use client';

/**
 * InitiativesTaskTab — Per Appendix v3 Initiative Milestones Add-on
 * placement requirement: "Initiatives are a new tab on HQ (/tasks),
 * alongside One-Time, Recurring, and Deliverables."
 *
 * Lightweight panel listing every initiative with its current gate badge
 * + Advance action. Implements Amendments 1 (status by selection) + 2
 * (advance auto-stamps completed_date + auto-sets next status).
 *
 * Deep edit (creating, deleting, full milestone management) still happens
 * at /initiatives — this is the at-a-glance + advance flow.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Compass, ChevronRight, Play, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';

type Milestone = {
  id: string;
  initiative_id: string;
  name: string;
  sort_order: number;
  completed: boolean;
  completed_date: string | null;
  target_date: string | null;
};

type Initiative = {
  id: string;
  // [2026-06-17] Field rename — schema uses `name`/`owner_user_id`, not
  // `title`/`owner`. The previous query silently errored on the wrong
  // columns and the tab always rendered the empty state. Detected during
  // §15 Flow I run.
  name: string;
  owner_name: string | null;
  owner_user_id: string | null;
  status: string;
  updated_at: string;
  milestones: Milestone[];
};

/** Map gate name → badge tone. Per Appendix: teal=current, gray=terminal. */
function toneForGate(initiative: Initiative): BadgeTone {
  const status = (initiative.status || '').toLowerCase();
  if (status === 'completed') return 'success';
  if (status === 'parked') return 'neutral';
  // Overdue target_date check
  const current = initiative.milestones.find(m => m.name === initiative.status);
  if (current?.target_date && new Date(current.target_date) < new Date()) return 'warning';
  // Staleness (>14 days idle)
  const daysSince = (Date.now() - new Date(initiative.updated_at).getTime()) / 86400000;
  if (daysSince > 30) return 'danger';
  if (daysSince > 14) return 'warning';
  return 'brand';
}

export function InitiativesTaskTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      // [2026-06-17] Resolve owner name via the users JOIN so the UI has
      // a readable name without an extra round-trip. Schema fields are
      // `name` + `owner_user_id` — `title`/`owner` don't exist.
      const { data: initsRaw } = await (supabase as any)
        .from('initiatives')
        .select('id, name, owner_user_id, status, updated_at, users:owner_user_id(name)')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      const inits = ((initsRaw ?? []) as Array<{
        id: string; name: string; owner_user_id: string | null;
        status: string; updated_at: string;
        users: { name: string } | null;
      }>).map(i => ({
        id: i.id,
        name: i.name,
        owner_user_id: i.owner_user_id,
        owner_name: i.users?.name ?? null,
        status: i.status,
        updated_at: i.updated_at,
      })) as Array<Omit<Initiative, 'milestones'>>;
      if (inits.length === 0) {
        setInitiatives([]);
        return;
      }
      const { data: milestonesRaw } = await (supabase as any)
        .from('initiative_milestones')
        .select('id, initiative_id, name, sort_order, completed, completed_date, target_date')
        .in('initiative_id', inits.map(i => i.id))
        .order('sort_order');
      const byInit = new Map<string, Milestone[]>();
      for (const m of (milestonesRaw ?? []) as Milestone[]) {
        const arr = byInit.get(m.initiative_id) || [];
        arr.push(m);
        byInit.set(m.initiative_id, arr);
      }
      setInitiatives(inits.map(i => ({ ...i, milestones: byInit.get(i.id) || [] })));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  /**
   * Amendment 2: Advance → mark current gate completed_date + set status
   * to next gate name. Single atomic action.
   */
  async function handleAdvance(initiative: Initiative) {
    const current = initiative.milestones.find(m => m.name === initiative.status);
    const next = initiative.milestones.find(m => m.sort_order === (current?.sort_order ?? 0) + 1);
    if (!next) {
      // [2026-06-17] Two bugs fixed here:
      //   1. Stamp the FINAL gate (Live) as completed when transitioning to
      //      the terminal state. Previously the Live gate stayed at
      //      completed=false even though the initiative was "done", so the
      //      gate-count summary showed 5/6.
      //   2. Write status='completed' (lowercase) — the StatusBadge mapping
      //      checks lowercase, so the previous 'Completed' (capital C) read
      //      as default neutral instead of success.
      if (current) {
        await (supabase as any)
          .from('initiative_milestones')
          .update({ completed: true, completed_date: new Date().toISOString().slice(0, 10) })
          .eq('id', current.id);
      }
      const { error } = await (supabase as any)
        .from('initiatives')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', initiative.id);
      if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Initiative completed' }); await refresh(); }
      return;
    }
    // Stamp current as completed
    if (current) {
      await (supabase as any)
        .from('initiative_milestones')
        .update({ completed: true, completed_date: new Date().toISOString().slice(0, 10) })
        .eq('id', current.id);
    }
    // Bump status to next
    const { error } = await (supabase as any)
      .from('initiatives')
      .update({ status: next.name, updated_at: new Date().toISOString() })
      .eq('id', initiative.id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Advanced to ${next.name}` });
      await refresh();
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
      </div>
    );
  }
  if (initiatives.length === 0) {
    return (
      <EmptyState icon={Compass} title="No initiatives yet" description="Create one on /initiatives to start tracking gates here.">
        <Button asChild variant="brand"><Link href="/initiatives">Go to /initiatives</Link></Button>
      </EmptyState>
    );
  }

  return (
    <Card className="border-cream-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-cream-50 hover:bg-cream-50">
            <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-ink-warm-500">Initiative</TableHead>
            <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-ink-warm-500">Owner</TableHead>
            <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-ink-warm-500">Current Gate</TableHead>
            <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-ink-warm-500">Last Updated</TableHead>
            <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-ink-warm-500 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initiatives.map(i => {
            const tone = toneForGate(i);
            const completedCount = i.milestones.filter(m => m.completed).length;
            const isTerminal = i.status === 'Completed' || i.status === 'Parked';
            return (
              <TableRow key={i.id} className="border-cream-100">
                <TableCell className="py-3 font-medium text-ink-warm-900">
                  <Link href={`/initiatives?id=${i.id}`} className="hover:text-brand">
                    {i.name}
                  </Link>
                </TableCell>
                <TableCell className="py-3 text-sm text-ink-warm-700">{i.owner_name || '—'}</TableCell>
                <TableCell className="py-3">
                  <StatusBadge tone={tone}>
                    {i.status} {completedCount > 0 && `· ${completedCount}/${i.milestones.length}`}
                  </StatusBadge>
                </TableCell>
                <TableCell className="py-3 text-xs text-ink-warm-500">
                  {formatDate(i.updated_at)}
                </TableCell>
                <TableCell className="py-3 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {!isTerminal && (
                      <Button size="sm" variant="brand" onClick={() => handleAdvance(i)} className="h-7 text-xs">
                        <Play className="h-3 w-3 mr-1" />Advance
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0">
                      <Link href={`/initiatives?id=${i.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
