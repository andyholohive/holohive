'use client';

/**
 * /dashboard — Priority Dashboard v2 (single-pane accountability system)
 *
 * Three layers per Jdot's 2026-05-30 spec:
 *   1. Internal Success — "are we executing?"
 *   2. Client Success   — "are clients getting results?"
 *   3. Renewals & Pipeline — renewals queue + sales pipeline snapshot
 *      (renamed from "Lead Success" per Jdot 2026-06-01)
 *
 * Each tab is its own component in `./_tabs/`, calling its dedicated
 * API endpoint with a 60s in-memory cache on the server side.
 *
 * The old LLM-snapshot dashboard moved to /dashboard-legacy as a
 * 1-week safety net before archive.
 */

import { useState, Suspense } from 'react';
import { Activity } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import InternalTab from './_tabs/InternalTab';
import ClientTab from './_tabs/ClientTab';
import RenewalsPipelineTab from './_tabs/RenewalsPipelineTab';

type Layer = 'internal' | 'client' | 'renewals-pipeline';

export default function DashboardPage() {
  const [layer, setLayer] = useState<Layer>('internal');

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title="Priority Dashboard"
        subtitle="Real-time view of what's happening, what's at risk, and what's next."
        kicker="Operations · Live"
        kickerDot="brand"
      />

      <Tabs value={layer} onValueChange={v => setLayer(v as Layer)} className="space-y-4">
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          <TabsTrigger
            value="internal"
            className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500"
          >
            <span className="hidden sm:inline">Internal Success</span>
            <span className="sm:hidden">Internal</span>
          </TabsTrigger>
          <TabsTrigger
            value="client"
            className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500"
          >
            <span className="hidden sm:inline">Client Success</span>
            <span className="sm:hidden">Clients</span>
          </TabsTrigger>
          <TabsTrigger
            value="renewals-pipeline"
            className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500"
          >
            <span className="hidden sm:inline">Renewals &amp; Pipeline</span>
            <span className="sm:hidden">Renewals</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="mt-0">
          <Suspense fallback={null}>
            <InternalTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="client" className="mt-0">
          <Suspense fallback={null}>
            <ClientTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="renewals-pipeline" className="mt-0">
          <Suspense fallback={null}>
            <RenewalsPipelineTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
