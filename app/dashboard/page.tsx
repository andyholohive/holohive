'use client';

/**
 * /dashboard — Priority Dashboard v2 (single-pane accountability system)
 *
 * Four layers as of 2026-06-03:
 *   0. My Work             — "what do I owe today?" (personal scope, was /tasks/my-dashboard)
 *   1. Internal Success    — "are we executing?"
 *   2. Client Success      — "are clients getting results?"
 *   3. Renewals & Pipeline — renewals queue + sales pipeline snapshot
 *      (renamed from "Lead Success" per Jdot 2026-06-01)
 *
 * My Work was merged in 2026-06-03 — the old /tasks/my-dashboard sub-route
 * now redirects to /dashboard?tab=my-work. Rationale: most users open
 * the dashboard in the morning to check what they owe before zooming
 * out to team status, so putting personal scope first makes the page
 * the actual daily landing.
 *
 * Tabs 1-3 each call their dedicated /api/dashboard/v2/* endpoint with
 * a 60s in-memory cache on the server. Tab 0 (MyWork) pulls from
 * TaskService directly (small, per-user, no shared cache needed).
 *
 * The old LLM-snapshot dashboard was retired 2026-06-15 (route,
 * crons, and dashboard_snapshots/dashboard_self_reports/daily_standups
 * tables all dropped — see HHP Team Dashboard v2 spec § APPENDIX).
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import MyWorkTab from './_tabs/MyWorkTab';
import InternalTab from './_tabs/InternalTab';
import ClientTab from './_tabs/ClientTab';
import RenewalsPipelineTab from './_tabs/RenewalsPipelineTab';
import { MondayFormChip } from '@/components/dashboard/MondayFormChip';

type Layer = 'my-work' | 'internal' | 'client' | 'renewals-pipeline';
const VALID_LAYERS: readonly Layer[] = ['my-work', 'internal', 'client', 'renewals-pipeline'] as const;
const isValidLayer = (s: string | null): s is Layer => !!s && (VALID_LAYERS as readonly string[]).includes(s);

const STORAGE_KEY = 'dashboard:last-tab';
const DEFAULT_LAYER: Layer = 'my-work';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve the initial tab: URL param > localStorage > default ("my-work").
  // SSR-safe: we render the default on the first paint and reconcile in a
  // post-mount effect so hydration matches.
  const [layer, setLayer] = useState<Layer>(DEFAULT_LAYER);

  // On mount, prefer ?tab= (e.g. coming from a deep link or the
  // /tasks/my-dashboard redirect). Fall back to the last-selected
  // tab stored in localStorage.
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (isValidLayer(urlTab)) {
      setLayer(urlTab);
      return;
    }
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isValidLayer(saved)) setLayer(saved);
    }
    // searchParams is intentionally re-read once on mount; we don't want
    // to re-resolve every time the URL changes since the user clicking a
    // tab inside the page also updates ?tab=, which would otherwise
    // create a sync loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the selected tab + reflect it in the URL so the page is
  // shareable / bookmarkable at the per-tab level. Uses replace (not
  // push) so the back button doesn't accumulate one entry per tab
  // click.
  const handleLayerChange = (next: string) => {
    if (!isValidLayer(next)) return;
    setLayer(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title="Team Dashboard"
        subtitle="Real-time view of what's happening, what's at risk, and what's next."
        kicker="Pinned · Dashboard"
        kickerDot="amber"
        actions={<MondayFormChip />}
      />

      <Tabs value={layer} onValueChange={handleLayerChange} className="space-y-4">
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200 flex-wrap">
          {/* My Work — personal scope, ICs' daily landing. Sits first
              so the page opens to "what do I owe?" by default. */}
          <TabsTrigger
            value="my-work"
            className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500"
          >
            <span className="hidden sm:inline">My Work</span>
            <span className="sm:hidden">Me</span>
          </TabsTrigger>
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

        <TabsContent value="my-work" className="mt-0">
          <Suspense fallback={null}>
            <MyWorkTab />
          </Suspense>
        </TabsContent>
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
