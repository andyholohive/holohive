'use client';

/**
 * /clients/[id] — one client's dashboard: delivery, reach, Korean market,
 * creators, community and this week's lineup. Opened by clicking a client
 * card on /clients. Uses the clients layout (sidebar + auth); data comes
 * from /api/clients/[id]/dashboard (team roles only).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Building2, ExternalLink, ListChecks, Megaphone } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import { ClientDashboard } from '@/components/clients/ClientDashboard';
import type { ClientDashboardData } from '@/lib/clientDashboard';

export default function ClientDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClientDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/clients/${id}/dashboard`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Could not load this client'); return d; })
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [id]);

  const name = data?.client.name;
  const week = data?.week;
  const progress = week?.totalWeeks ? Math.min(week.weekNumber / week.totalWeeks, 1) : null;

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {data && data.campaigns.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => router.push(`/campaigns?clientId=${id}`)}>
          <Megaphone className="h-4 w-4 mr-2" />Campaigns
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => router.push(`/clients/${id}/delivery-log`)}>
        <ListChecks className="h-4 w-4 mr-2" />Delivery Log
      </Button>
      <Button variant="brand" size="sm" onClick={() => window.open(`/public/portal/${id}`, '_blank', 'noopener,noreferrer')}>
        <ExternalLink className="h-4 w-4 mr-2" />View Portal
      </Button>
    </div>
  );

  // Editorial hero — the campaign page's pattern (logo tile, kicker, serif
  // title with an italic brand tail, inline meta row), so a client reads
  // like the campaigns it owns.
  const header = (
    <>
      <div className="flex items-center gap-1.5 text-xs">
        <button onClick={() => router.push('/clients')}
          className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition">
          <ArrowLeft className="w-3.5 h-3.5" />Clients
        </button>
        <span className="text-ink-warm-300">/</span>
        <span className="text-ink-warm-700 font-medium uppercase text-[10px] tracking-[0.2em] truncate">{name ?? '…'}</span>
      </div>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-5 min-w-0 flex-1">
          {data?.client.logoUrl ? (
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-cream-200 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.client.logoUrl} alt={name ?? 'Client'} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-xl text-white flex items-center justify-center text-xl font-semibold shrink-0 bg-gradient-to-br from-brand to-brand-dark shadow-btn-brand" aria-hidden>
              {(name || 'C').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-warm-500">
              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${data && !data.client.isActive ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden />
              <span>Clients · Dashboard</span>
            </div>
            {name ? (
              <h1 className="display-serif text-[32px] text-ink-warm-900 leading-[1.1] tracking-tight">
                {name} <span className="display-serif-italic text-brand">in Korea.</span>
              </h1>
            ) : (
              <Skeleton className="h-9 w-64" />
            )}
            {data && (
              <div className="flex items-center gap-2.5 mt-4 text-xs flex-wrap">
                <StatusBadge tone={data.client.isActive ? 'brand' : 'neutral'} size="sm">{data.client.isActive ? 'Active' : 'Inactive'}</StatusBadge>
                {week && (
                  <span className="inline-flex items-center gap-2 text-ink-warm-700">
                    {week.lifecycle === 'ended' ? 'Ended · ' : ''}Week <span className="mono tabular-nums font-medium text-ink-warm-900">{week.weekNumber}</span>
                    {week.totalWeeks !== null && <>of <span className="mono tabular-nums font-medium text-ink-warm-900">{week.totalWeeks}</span></>}
                    {progress !== null && (
                      <span className="inline-block h-1 w-20 overflow-hidden rounded-full bg-cream-200" aria-hidden>
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
                      </span>
                    )}
                  </span>
                )}
                {data.startDate && (
                  <>
                    <span className="text-ink-warm-300">·</span>
                    <span className="text-ink-warm-500">Since <span className="mono text-ink-warm-700">{formatDate(data.startDate)}</span></span>
                  </>
                )}
                {data.campaigns.length > 0 && (
                  <>
                    <span className="text-ink-warm-300">·</span>
                    <span className="text-ink-warm-500">{data.campaigns.length} campaign{data.campaigns.length === 1 ? '' : 's'}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {actions}
      </div>
    </>
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="border-cream-200"><EmptyState icon={Building2} title="Couldn't load this client" description={error} /></Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
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
      <ClientDashboard d={data} />
    </div>
  );
}
