'use client';

/**
 * /attention — everything across active clients that is late, about to be
 * late, or waiting on someone: ending engagements, missing or draft weekly
 * lineups, missed slots, delivery-log drafts, Korea Signal reports awaiting
 * approval. Each row links to where it gets fixed. Rules live in lib/attention.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, Info, ListChecks, Radio, RefreshCw, Users, FileText, UserX, TrendingDown } from 'lucide-react';
import type { AttentionItem, AttentionKind, AttentionSeverity } from '@/lib/attention';

const HEAD = 'h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500';
const SEVERITY: Record<AttentionSeverity, { label: string; tone: BadgeTone }> = {
  urgent: { label: 'Urgent', tone: 'danger' },
  soon: { label: 'This week', tone: 'warning' },
  fyi: { label: 'FYI', tone: 'info' },
};
const KIND_ICON: Record<AttentionKind, React.ComponentType<{ className?: string }>> = {
  engagement: CalendarClock,
  lineup: ListChecks,
  slots: UserX,
  delivery: FileText,
  report: Radio,
  momentum: TrendingDown,
};
type Filter = 'all' | AttentionSeverity;

function InitialsAvatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return (
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md border border-cream-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${name} logo`} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-semibold text-white">
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

export default function AttentionPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/attention');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not load the list');
      setItems(d.items);
      // Momentum alerts load every client's dashboard, so they arrive second
      // and slot in by priority. A failure here just leaves them out.
      fetch('/api/attention?part=momentum').then((x) => (x.ok ? x.json() : null)).then((m) => {
        if (!m?.items?.length) return;
        const order: Record<AttentionSeverity, number> = { urgent: 0, soon: 1, fyi: 2 };
        setItems((prev) => [...(prev ?? []).filter((i) => i.kind !== 'momentum'), ...(m.items as AttentionItem[])]
          .sort((a, b) => order[a.severity] - order[b.severity] || a.clientName.localeCompare(b.clientName)));
      }).catch(() => {});
    } catch (e: any) {
      toast({ title: 'Could not load', description: e.message, variant: 'destructive' });
      setItems((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const count = (s: AttentionSeverity) => items?.filter((i) => i.severity === s).length ?? 0;
  const clients = useMemo(() => new Set(items?.filter((i) => i.severity !== 'fyi').map((i) => i.clientId)).size, [items]);
  const shown = items?.filter((i) => filter === 'all' || i.severity === filter) ?? [];

  const header = (
    <PageHeader
      icon={AlertTriangle}
      title="Needs Attention"
      subtitle="What's late or waiting across every active client, and where to fix it"
      actions={(
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />Refresh
        </Button>
      )}
    />
  );

  if (!items) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={AlertTriangle} label="Urgent" value={count('urgent')} accent="rose" topAccent sub="Late now, or ending within 7 days" />
        <KpiCard icon={Clock} label="This week" value={count('soon')} accent="amber" topAccent sub="Due soon or waiting on review" />
        <KpiCard icon={Info} label="FYI" value={count('fyi')} accent="sky" topAccent sub="Posts still due on confirmed lineups" />
        <KpiCard icon={Users} label="Clients affected" value={clients} accent="brand" topAccent sub="With an urgent or this-week item" />
      </div>

      {items.length === 0 ? (
        <Card className="border-cream-200">
          <EmptyState icon={CheckCircle2} title="Nothing needs attention" description="Every active client is on track: lineups set, terms current, nothing waiting on review." />
        </Card>
      ) : (
        <Card className="overflow-hidden border-cream-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
            {(['all', 'urgent', 'soon', 'fyi'] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? 'brand' : 'outline'} className="h-8" onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : SEVERITY[f].label}
                <span className="ml-1.5 tabular-nums opacity-80">{f === 'all' ? items.length : count(f)}</span>
              </Button>
            ))}
            <div className="ml-auto text-xs text-gray-500">{shown.length} item{shown.length === 1 ? '' : 's'}</div>
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing in this group" description="Pick another filter to see the rest." className="py-10" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className={`${HEAD} w-28`}>Priority</TableHead>
                    <TableHead className={`${HEAD} w-48`}>Client</TableHead>
                    <TableHead className={HEAD}>What</TableHead>
                    <TableHead className={`${HEAD} w-40 text-right`}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((it) => {
                    const Icon = KIND_ICON[it.kind];
                    return (
                      <TableRow key={it.id} className="border-gray-100">
                        <TableCell className="py-3"><StatusBadge tone={SEVERITY[it.severity].tone} size="sm">{SEVERITY[it.severity].label}</StatusBadge></TableCell>
                        <TableCell className="py-3">
                          <Link href={`/clients/${it.clientId}`} className="flex items-center gap-2.5 font-medium text-ink-warm-900 hover:text-brand">
                            <InitialsAvatar name={it.clientName} src={it.logoUrl} />
                            <span className="truncate">{it.clientName}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-start gap-2.5">
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-warm-400" />
                            <div className="min-w-0">
                              <p className="font-medium text-ink-warm-900">{it.title}</p>
                              <p className="text-xs text-ink-warm-500">{it.detail}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <Button asChild variant="ghost" size="sm" className="h-8 text-brand hover:text-brand-deep">
                            <Link href={it.href}>{it.hrefLabel}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
