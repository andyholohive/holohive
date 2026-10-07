'use client';

/**
 * /clients/[id] — one client's dashboard: delivery, reach, Korean market,
 * creators, community and this week's lineup. Opened by clicking a client
 * card on /clients. Uses the clients layout (sidebar + auth); data comes
 * from /api/clients/[id]/dashboard (team roles only).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Building2, ExternalLink, LayoutDashboard, ListChecks, Megaphone } from 'lucide-react';
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
  const subtitle = !data
    ? 'Delivery, reach and the Korean market for this client'
    : week?.lifecycle === 'active' && week.totalWeeks
      ? `Week ${week.weekNumber} of ${week.totalWeeks}${data.startDate ? ` · since ${formatDate(data.startDate)}` : ''}`
      : week?.lifecycle === 'ended' ? 'Engagement ended' : data.startDate ? `Since ${formatDate(data.startDate)}` : 'No engagement dates on file';

  const header = (
    <>
      <div className="flex items-center gap-1.5 text-xs">
        <button onClick={() => router.push('/clients')}
          className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition">
          <ArrowLeft className="w-3.5 h-3.5" />Clients
        </button>
        <span className="text-ink-warm-300">/</span>
        <span className="text-ink-warm-700 font-medium uppercase text-[10px] tracking-[0.2em] truncate">{name ?? '…'} · Dashboard</span>
      </div>
      <PageHeader
        icon={LayoutDashboard}
        kicker="Clients · Dashboard"
        kickerDot={data && !data.client.isActive ? 'amber' : 'emerald'}
        title={name ?? 'Client dashboard'}
        subtitle={subtitle}
        actions={(
          <>
            {data && data.campaigns.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/campaigns?clientId=${id}`)}>
                <Megaphone className="h-4 w-4 mr-2" />View Campaigns
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push(`/clients/${id}/delivery-log`)}>
              <ListChecks className="h-4 w-4 mr-2" />Delivery Log
            </Button>
            <Button variant="brand" size="sm" onClick={() => window.open(`/public/portal/${id}`, '_blank', 'noopener,noreferrer')}>
              <ExternalLink className="h-4 w-4 mr-2" />View Portal
            </Button>
          </>
        )}
      />
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
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
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
