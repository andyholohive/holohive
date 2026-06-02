'use client';

/**
 * Layer 2 — Client Success. Renders the payload from
 * /api/dashboard/v2/client. "Are clients getting results?"
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import {
  SectionHeaderSkeleton, TableCardSkeleton, ListCardSkeleton,
} from './SkeletonHelpers';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Users, FileText, AlertCircle, MessageCircle, Tag } from 'lucide-react';

/**
 * v11 (matches the revamp mockup exactly): client avatar = logo image
 * when available, otherwise a colored letter tile. Color of the fallback
 * tile is driven by **renewal tone** (not a hash), so the avatar visually
 * encodes the client's state — same pattern as the mockup:
 *   Active / green   → brand-soft
 *   Amber soon       → amber-50
 *   Red critical     → rose-50
 *   No end date      → sky-50 (treated as "onboarding-style" neutral)
 */
const STATUS_TILE: Record<RenewalTone | 'unknown', string> = {
  green:   'bg-brand-soft text-brand-deep',
  amber:   'bg-amber-50  text-amber-700',
  red:     'bg-rose-50   text-rose-700',
  unknown: 'bg-sky-50    text-sky-700',
};

function ClientLogoTile({ row }: { row: ClientHealthRow }) {
  const tone = row.renewal_days_left === null ? 'unknown' : row.renewal_tone;
  const letter = (row.name || '?').trim().charAt(0).toUpperCase();
  if (row.logo_url) {
    return (
      <div className="w-7 h-7 rounded-md overflow-hidden border border-cream-200 shrink-0 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.logo_url} alt={`${row.name} logo`} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0 ${STATUS_TILE[tone]}`}>
      {letter}
    </div>
  );
}

type RenewalTone = 'red' | 'amber' | 'green';

type ClientHealthRow = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  engagement_start_date: string | null;
  engagement_end_date: string | null;
  renewal_tone: RenewalTone;
  renewal_days_left: number | null;
  openTasks: number;
  overdueTasks: number;
  completedThisWeek: number;
  contentPostedThisWeek: number;
  is_whitelisted: boolean;
};

type CallNote = {
  id: string;
  client_id: string;
  title: string | null;
  meeting_date: string | null;
  attendees: string | null;
  openHhActionItems: number;
};

type ClientPayload = {
  asOf: string;
  thresholds: { renewal_red_days: number; renewal_amber_days: number };
  clientHealth: ClientHealthRow[];
  callNotes: CallNote[];
  adHocClients: Array<{ id: string; name: string; slug: string | null }>;
};

const renewalTone: Record<RenewalTone, BadgeTone> = {
  red: 'danger',
  amber: 'warning',
  green: 'success',
};

const renewalLabel = (row: ClientHealthRow): string => {
  if (row.renewal_days_left === null) return 'No end date';
  if (row.renewal_days_left < 0) return `${Math.abs(row.renewal_days_left)}d overdue`;
  return `${row.renewal_days_left}d`;
};

export default function ClientTab() {
  const [data, setData] = useState<ClientPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/v2/client');
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

  if (loading) return <ClientTabSkeleton />;
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load Client Success"
        description={error}
      />
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* ── 01 Health ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Engagements" dot="brand" counter="01 — Client health · Renewal tone" first />

      {/* Client Health table */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Users}
          title="Client Health"
          subtitle={`${data.clientHealth.length} standard engagement${data.clientHealth.length === 1 ? '' : 's'}${data.adHocClients.length > 0 ? ` · ${data.adHocClients.length} ad-hoc excluded` : ''}`}
        />

        {data.clientHealth.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title="No standard clients"
              description="Activate a client to see them here."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Client</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Open</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Overdue</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Done (wk)</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Posted (wk)</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Renewal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clientHealth.map(c => (
                <TableRow key={c.id} className="border-cream-100 row-accent cursor-pointer">
                  <TableCell className="py-3.5 px-5">
                    <Link href={`/clients/${c.id}`} className="group flex items-center gap-2.5">
                      <ClientLogoTile row={c} />
                      <div className="min-w-0">
                        <div className="font-medium text-ink-warm-900 group-hover:text-brand transition-colors truncate">
                          {c.name}
                        </div>
                        {c.slug && (
                          <div className="text-[11px] text-ink-warm-400 mono truncate">{c.slug}</div>
                        )}
                      </div>
                      {c.is_whitelisted && (
                        <span className="ml-1 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold shrink-0">whitelisted</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">{c.openTasks}</TableCell>
                  <TableCell className={`py-3.5 px-5 text-right tabular-nums ${c.overdueTasks > 0 ? 'text-rose-600 font-semibold' : 'text-ink-warm-700'}`}>
                    {c.overdueTasks}
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums text-emerald-700">{c.completedThisWeek}</TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">{c.contentPostedThisWeek}</TableCell>
                  <TableCell className="py-3.5 px-5">
                    <StatusBadge tone={renewalTone[c.renewal_tone]} size="sm" bordered withDot={c.renewal_tone === 'red' ? 'pulse' : true}>
                      {renewalLabel(c)}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      </div>

      {/* ── 02 Conversations ───────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Conversations" dot="sky" counter="02 — Call notes · Ad-hoc clients" />

      {/* Call notes + ad-hoc clients side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={MessageCircle}
            iconClassName="text-sky-500"
            title="Recent Call Notes"
            subtitle={`${data.callNotes.length} logged`}
          />

          {data.callNotes.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={MessageCircle}
                title="No recent call notes"
                description="Log a meeting on a client to see it here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-cream-100">
              {data.callNotes.map(n => (
                <li key={n.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/clients/${n.client_id}`}
                        className="text-sm font-medium text-ink-warm-900 hover:text-brand transition-colors truncate block"
                      >
                        {n.title || 'Untitled meeting'}
                      </Link>
                      <div className="text-xs text-ink-warm-500 mt-0.5">
                        {n.meeting_date}
                        {n.attendees && <span className="ml-2">· {n.attendees}</span>}
                      </div>
                    </div>
                    {n.openHhActionItems > 0 && (
                      <StatusBadge tone="warning" size="sm" bordered withDot>
                        {n.openHhActionItems} open
                      </StatusBadge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={Tag}
            iconClassName="text-purple-500"
            title="Ad-Hoc Clients"
            subtitle="Excluded from rollups"
          />

          {data.adHocClients.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Tag}
                title="None"
                description="No ad-hoc engagements."
              />
            </div>
          ) : (
            <ul className="divide-y divide-cream-100">
              {data.adHocClients.map(c => (
                <li key={c.id} className="px-4 py-3 flex items-center justify-between">
                  <Link
                    href={`/clients/${c.id}`}
                    className="text-sm font-medium text-ink-warm-900 hover:text-brand transition-colors"
                  >
                    {c.name}
                  </Link>
                  <StatusBadge tone="purple" size="sm" bordered withDot>Ad-hoc</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      </div>
    </div>
  );
}

function ClientTabSkeleton() {
  return (
    <div className="space-y-8">
      {/* ── 01 Engagements ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton first />
        <TableCardSkeleton rows={5} cols={6} />
      </div>
      {/* ── 02 Conversations ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><ListCardSkeleton rows={4} /></div>
          <ListCardSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}
