'use client';

/**
 * Layer 3 — Renewals & Pipeline (renamed from "Lead Success" per Jdot
 * 2026-06-01 — the layer is universally visible, so the role framing
 * was misleading).
 *
 * Reads /api/dashboard/v2/renewals-pipeline. The pipeline data flows
 * through `lib/dashboard/pipeline-source.ts` — when Yano's CRM rebuild
 * lands, only that file changes.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KpiCard } from '@/components/ui/kpi-card';
import { formatDate } from '@/lib/dateFormat';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import {
  SectionHeaderSkeleton, KpiCardSkeleton, TableCardSkeleton, ListCardSkeleton,
} from './SkeletonHelpers';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Calendar, TrendingUp, AlertCircle, Building2, DollarSign, Heart, Clock, FileText } from 'lucide-react';

type RenewalTone = 'red' | 'amber' | 'green';

type Renewal = {
  id: string;
  name: string;
  slug: string | null;
  engagement_start_date: string | null;
  engagement_end_date: string | null;
  tone: RenewalTone;
  daysLeft: number | null;
};

type Retention = {
  clientRetentionPct: number;
  activeClients: number;
  churnedClients: number;
  avgEngagementWeeks: number;
  totalContentDelivered: number;
};

type RenewalsPipelinePayload = {
  asOf: string;
  thresholds: { renewal_red_days: number; renewal_amber_days: number };
  retention: Retention;
  renewals: {
    all: Renewal[];
    countsByTone: { red: number; amber: number; green: number };
    upcomingMonths: Array<{ month: string; count: number }>;
    clientsWithoutEndDate: Array<{ id: string; name: string; slug: string | null }>;
  };
  pipeline: {
    totalOpenValue: number;
    totalOpenCount: number;
    countByStage: Array<{ stage: string; count: number; totalValue: number }>;
    recentMovement: Array<{
      id: string;
      name: string;
      stage: string;
      deal_value: number;
      last_movement_at: string | null;
    }>;
    activeStages: { count: number; totalValue: number };
  };
};

const toneToBadge: Record<RenewalTone, BadgeTone> = {
  red: 'danger',
  amber: 'warning',
  green: 'success',
};

const formatMonth = (key: string): string => {
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const formatMoney = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

export default function RenewalsPipelineTab() {
  const [data, setData] = useState<RenewalsPipelinePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/v2/renewals-pipeline');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <RenewalsPipelineSkeleton />;
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load Renewals & Pipeline"
        description={error}
      />
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* ── 01 Retention ────────────────────────────────────────────── */}
      {/* [2026-06-11] Per spec § 5.1 — top of Layer 3 is RETENTION metrics
          (the answer to "are we keeping clients?"), not the renewal/pipeline
          snapshot. That snapshot moved to section 02 below. */}
      <div className="space-y-4">
        <SectionHeader label="Retention" dot="emerald" counter="01 — Are we retaining and growing?" first />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard
            icon={Heart}
            label="Client Retention"
            value={`${data.retention.clientRetentionPct}%`}
            sub={`${data.retention.activeClients} active / ${data.retention.churnedClients} churned`}
            accent="emerald"
            topAccent
          />
          <KpiCard
            icon={Clock}
            label="Avg Engagement"
            value={`${data.retention.avgEngagementWeeks} wk`}
            sub={`across ${data.retention.activeClients} active client${data.retention.activeClients === 1 ? '' : 's'}`}
            accent="brand"
            topAccent
          />
          <KpiCard
            icon={FileText}
            label="Total Content Delivered"
            value={data.retention.totalContentDelivered}
            sub="all-time across active clients"
            accent="sky"
            topAccent
          />
        </div>
      </div>

      {/* ── 02 Snapshot ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Snapshot" dot="brand" counter="02 — Renewal counts · Pipeline value" />

      {/* Secondary snapshot KPIs — the renewal & pipeline ops counters.
          Lower-priority than retention but still useful at a glance. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={AlertCircle}
          label="Renewal: Red"
          value={data.renewals.countsByTone.red}
          sub={`within ${data.thresholds.renewal_red_days}d`}
          accent="rose"
          topAccent
        />
        <KpiCard
          icon={Calendar}
          label="Renewal: Amber"
          value={data.renewals.countsByTone.amber}
          sub={`within ${data.thresholds.renewal_amber_days}d`}
          accent="amber"
          topAccent
        />
        <KpiCard
          icon={Building2}
          label="Active Pipeline"
          value={data.pipeline.activeStages.count}
          sub={`${formatMoney(data.pipeline.activeStages.totalValue)} value`}
          accent="brand"
          topAccent
        />
        <KpiCard
          icon={DollarSign}
          label="Total Open"
          value={formatMoney(data.pipeline.totalOpenValue)}
          sub={`${data.pipeline.totalOpenCount} opps`}
          accent="sky"
          topAccent
        />
      </div>
      </div>

      {/* ── 03 Renewals ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Renewals" dot="rose" counter="03 — Queue · 90-day forward look" />

      {/* Renewals queue */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Calendar}
          title="Renewals Queue"
          subtitle={`${data.renewals.all.length} with end dates · sorted by urgency`}
        />

        {data.renewals.all.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Calendar}
              title="No upcoming renewals"
              description="All standard clients are either fresh or missing an end date."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Client</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Started</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Ends</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Days left</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Tone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.renewals.all.map(r => (
                <TableRow key={r.id} className="border-cream-100 row-accent cursor-pointer">
                  <TableCell className="py-3.5 px-5">
                    <Link
                      href={`/clients/${r.id}`}
                      className="font-medium text-ink-warm-900 hover:text-brand transition-colors"
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-sm text-ink-warm-700">
                    {r.engagement_start_date
                      ? formatDate(r.engagement_start_date)
                      : <span className="text-ink-warm-400">—</span>}
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-sm text-ink-warm-700">
                    {formatDate(r.engagement_end_date)}
                  </TableCell>
                  <TableCell className={`py-3 text-right tabular-nums ${r.tone === 'red' ? 'text-rose-600 font-semibold' : r.tone === 'amber' ? 'text-amber-700 font-medium' : 'text-ink-warm-700'}`}>
                    {r.daysLeft}d
                  </TableCell>
                  <TableCell className="py-3.5 px-5">
                    <StatusBadge tone={toneToBadge[r.tone]} size="sm" bordered withDot={r.tone === 'red' ? 'pulse' : true}>
                      {r.tone === 'red' ? 'Critical' : r.tone === 'amber' ? 'Soon' : 'Healthy'}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Forward look + missing end dates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={Calendar}
            title="Next 90 Days"
            subtitle="Renewals due by month"
          />

          {data.renewals.upcomingMonths.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Calendar} title="Quiet quarter" description="Nothing renewing in 90 days." />
            </div>
          ) : (
            <ul className="divide-y divide-cream-100">
              {data.renewals.upcomingMonths.map(m => (
                <li key={m.month} className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-warm-900">{formatMonth(m.month)}</span>
                  <span className="text-sm tabular-nums text-ink-warm-700">{m.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2 border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={AlertCircle}
            iconClassName="text-amber-500"
            title="Clients Without an End Date"
            subtitle="Won't fire renewal alerts — set end_date or flag ad-hoc"
          />

          {data.renewals.clientsWithoutEndDate.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Calendar} title="All set" description="Every standard client has an end date." />
            </div>
          ) : (
            <ul className="divide-y divide-cream-100">
              {data.renewals.clientsWithoutEndDate.map(c => (
                <li key={c.id} className="px-4 py-3 flex items-center justify-between">
                  <Link
                    href={`/clients/${c.id}`}
                    className="text-sm font-medium text-ink-warm-900 hover:text-brand transition-colors"
                  >
                    {c.name}
                  </Link>
                  <span className="text-xs text-amber-700 font-medium">Set end date</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      </div>

      {/* ── 03 Pipeline ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Pipeline" dot="violet" counter="04 — Open opps by stage" />

      {/* Pipeline snapshot */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={TrendingUp}
          title="Pipeline by Stage"
          subtitle="Open opportunities · Live"
          action={
            <Link
              href="/crm/sales-pipeline"
              className="text-xs font-medium text-brand hover:text-brand-dark transition-colors"
            >
              Open CRM →
            </Link>
          }
        />

        {data.pipeline.countByStage.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={TrendingUp}
              title="No open pipeline"
              description="Add opportunities in the CRM."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Stage</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Open opps</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Total value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.pipeline.countByStage.map(s => (
                <TableRow key={s.stage} className="border-cream-100">
                  <TableCell className="py-3.5 px-5 font-medium text-ink-warm-900 capitalize">
                    {s.stage.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums">{s.count}</TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">
                    {s.totalValue > 0 ? formatMoney(s.totalValue) : <span className="text-ink-warm-400">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      </div>
    </div>
  );
}

function RenewalsPipelineSkeleton() {
  return (
    <div className="space-y-8">
      {/* ── 01 Snapshot ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton first />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
        </div>
      </div>
      {/* ── 02 Renewals ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton />
        <TableCardSkeleton rows={4} cols={5} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ListCardSkeleton rows={3} />
          <div className="lg:col-span-2"><ListCardSkeleton rows={4} /></div>
        </div>
      </div>
      {/* ── 03 Pipeline ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton />
        <TableCardSkeleton rows={5} cols={3} />
      </div>
    </div>
  );
}
