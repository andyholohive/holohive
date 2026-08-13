'use client';

/**
 * Korea Signal · Client Watch (v7 panel).
 *
 * How much each live client is being talked about in the Korean Telegram
 * channels we crawl. Reads the standing corpus — zero Telegram calls.
 *
 * The window line under the header is not decoration. The crawler only
 * started covering most channels in late July 2026, so a low number and
 * "we weren't watching yet" are indistinguishable in the data. Stating
 * the window once, at the top, is what stops a CM reading a crawl
 * artifact as a performance difference; rows whose engagement predates
 * that date get their own marker, because for those the count genuinely
 * cannot describe the whole relationship.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/ui/kpi-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/dateFormat';
import { Radar, TrendingUp, TrendingDown, Minus, Info, Radio, Users, CalendarClock } from 'lucide-react';

type WatchRow = {
  client_id: string;
  client_name: string;
  is_ad_hoc: boolean;
  project_id: string | null;
  keywords: string[];
  mentions_7d: number;
  mentions_prev_7d: number;
  mentions_30d: number;
  channels_30d: number;
  engagement_started: string | null;
  predates_coverage: boolean;
};

type Payload = {
  corpus_window: { earliest: string | null; broad_since: string | null; latest: string | null; channels: number };
  untracked: string[];
  clients: WatchRow[];
};

function Delta({ now, prev }: { now: number; prev: number }) {
  if (now === prev) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-warm-400">
        <Minus className="h-3 w-3" />flat
      </span>
    );
  }
  const up = now > prev;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icon className="h-3 w-3" />{up ? '+' : ''}{now - prev}
    </span>
  );
}

export default function ClientWatchPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/intelligence/client-watch')
      .then(r => r.json())
      .then(j => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const header = (
    <PageHeader
      icon={Radar}
      title="Client Watch"
      subtitle="Korean Telegram coverage per client, from the channels we already crawl"
    />
  );

  if (loading) {
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

  const tracked = (data?.clients ?? []).filter(c => c.project_id);
  const win = data?.corpus_window;
  const total7 = tracked.reduce((s, c) => s + c.mentions_7d, 0);
  const totalPrev7 = tracked.reduce((s, c) => s + c.mentions_prev_7d, 0);
  const channels = new Set<number>();
  const anyPredating = tracked.some(c => c.predates_coverage);

  return (
    <div className="space-y-6">
      <Link href="/mindshare" className="inline-flex items-center text-xs text-gray-500 hover:text-brand transition-colors w-fit">
        Korea Signal
      </Link>
      {header}

      {/* The window statement — once, for the whole panel. */}
      {win?.broad_since && (
        <div className="flex items-start gap-2 rounded-lg border border-cream-200 bg-cream-50 px-4 py-3">
          <Info className="h-4 w-4 text-ink-warm-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-ink-warm-600">
            Counts cover <strong>{formatDate(win.broad_since)} → {win.latest ? formatDate(win.latest) : 'today'}</strong>{' '}
            across {win.channels} channels. Anything earlier wasn&apos;t being crawled — a low number here can mean
            &ldquo;quiet&rdquo; or &ldquo;before we were watching&rdquo;.
            {anyPredating && <> Rows marked <StatusBadge tone="warning" size="sm">Pre-dates</StatusBadge> began before that date, so their totals describe only part of the engagement.</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Clients tracked" value={tracked.length} sub={`${data?.untracked.length ?? 0} without a project`} accent="brand" />
        <KpiCard icon={Radio} label="Mentions (7d)" value={total7} sub={`${totalPrev7} the week before`} accent={total7 >= totalPrev7 ? 'emerald' : 'amber'} />
        <KpiCard icon={Radar} label="Mentions (30d)" value={tracked.reduce((s, c) => s + c.mentions_30d, 0)} sub="across all tracked clients" />
        <KpiCard icon={CalendarClock} label="Coverage since" value={win?.broad_since ? formatDate(win.broad_since) : '—'} sub={`${win?.channels ?? 0} channels crawled`} accent="sky" />
      </div>

      {tracked.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No clients tracked yet"
          description="A client needs a linked mindshare project with keywords before it can appear here."
        />
      ) : (
        <Card className="border-cream-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Client</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">This week</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">30 days</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Channels</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Tracking</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...tracked].sort((a, b) => b.mentions_30d - a.mentions_30d).map(c => (
                <TableRow key={c.client_id} className="border-gray-100">
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.client_name}</span>
                      {c.is_ad_hoc && <StatusBadge tone="neutral" size="sm">Ad-hoc</StatusBadge>}
                      {c.predates_coverage && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span><StatusBadge tone="warning" size="sm">Pre-dates</StatusBadge></span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Engagement began {c.engagement_started ? formatDate(c.engagement_started) : '—'}, before
                              coverage started {win?.broad_since ? formatDate(win.broad_since) : ''}. Earlier activity
                              was never crawled.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums font-medium">{c.mentions_7d}</span>
                      <Delta now={c.mentions_7d} prev={c.mentions_prev_7d} />
                    </div>
                  </TableCell>
                  <TableCell className="py-3 tabular-nums">{c.mentions_30d}</TableCell>
                  <TableCell className="py-3 tabular-nums">{c.channels_30d}</TableCell>
                  <TableCell className="py-3">
                    <span className="text-xs text-ink-warm-500">{c.keywords.join(' · ') || '—'}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {(data?.untracked.length ?? 0) > 0 && (
        <p className="text-xs text-ink-warm-400">
          Not tracked: {data!.untracked.join(', ')} — no mindshare project linked.
        </p>
      )}
    </div>
  );
}
