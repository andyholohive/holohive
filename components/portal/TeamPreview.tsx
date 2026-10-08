'use client';

/**
 * Team-only preview of the client dashboard's scorecard + market placement,
 * rendered inside the client portal [Andy 2026-10-08].
 *
 * Shown ONLY to a signed-in HHP team member viewing the portal, so the team
 * can see how these would read for the client before any client does. Two
 * gates, both must pass:
 *   1. a Supabase session in this browser (clients visiting the portal have
 *      none, so they never even make the request), and
 *   2. /api/clients/[id]/dashboard answering 200 — it requires the member,
 *      admin or super_admin role server-side.
 * Anything else renders nothing. The client-safe `audience` mode drops spend
 * and roster ranks regardless of what the payload carries.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Eye } from 'lucide-react';
import { Placement, Scorecard } from '@/components/clients/ClientDashboard';
import { PositionStudio } from '@/components/clients/position/PositionStudio';
import { JourneyTimeline } from '@/components/clients/position/JourneyTimeline';
import type { ClientDashboardData } from '@/lib/clientDashboard';

export function TeamPreview({ clientId, className = '' }: { clientId: string | null; className?: string }) {
  const [data, setData] = useState<ClientDashboardData | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const r = await fetch(`/api/clients/${clientId}/dashboard`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && d?.client) setData(d);
      } catch { /* not a team viewer, or the API is down: show nothing */ }
    })();
    return () => { alive = false; };
  }, [clientId]);

  if (!data) return null;

  return (
    <section className={`rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft/30 p-4 sm:p-5 ${className}`} aria-label="Team preview">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-deep">
          <Eye className="h-3.5 w-3.5" />Team preview · clients can&apos;t see this yet
        </p>
        <p className="text-xs text-ink-warm-500">Client-safe version: no spend, no channel names, no comparisons to named clients</p>
      </div>
      <div className="space-y-4">
        <Scorecard d={data} audience="client" />
        <JourneyTimeline d={data} />
        {data.position && <PositionStudio s={data.position} />}
        <Placement d={data} audience="client" />
      </div>
    </section>
  );
}
