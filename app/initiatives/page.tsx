'use client';

/**
 * /initiatives — Initiatives + Backlog workspace.
 *
 * [2026-07-14] Initiatives + Specs merged into one entity (Plan A): a
 * spec IS an initiative, gated by `specs.is_initiative`. The Initiatives
 * tab renders the initiative-aware SpecsTab (scope toggle, promote star,
 * per-card gate/owner/status badge). The old standalone initiatives
 * table + its CRUD dialogs were removed in this fold — creation now goes
 * through SpecsTab's own "New spec" toolbar, and promote/demote is the
 * star toggle. Status/gate advance still lives on /tasks
 * (InitiativesTaskTab). URL state syncs via ?tab= so links + back-button
 * work; a legacy ?tab=specs deep link falls back to 'initiatives'.
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Compass, Bug } from 'lucide-react';
import BacklogTab from './_tabs/BacklogTab';
import SpecsTab from './_tabs/SpecsTab';

type SpaceTab = 'initiatives' | 'backlog';
const VALID_TABS: readonly SpaceTab[] = ['initiatives', 'backlog'] as const;
const isValidTab = (s: string | null): s is SpaceTab =>
  !!s && (VALID_TABS as readonly string[]).includes(s);

// Wrapper so we can hold the Suspense boundary required by
// useSearchParams in the App Router.
export default function InitiativesPage() {
  return (
    <Suspense fallback={<InitiativesPageSkeleton />}>
      <InitiativesPageInner />
    </Suspense>
  );
}

function InitiativesPageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Compass}
        title="Initiatives"
        subtitle="Strategic threads the team owns. Drives the dashboard's Initiative Tracker."
        kicker="Resources · Initiatives"
        kickerDot="amber"
      />
      <Skeleton className="h-10 w-[280px] rounded-md" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

function InitiativesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── Tab state with URL sync ────────────────────────────────────
  // Default to 'initiatives' on first visit, but respect ?tab= so
  // deep links and back-button work. Only read URL once on mount;
  // changing the tab in-page does a router.replace which would
  // re-trigger this effect → infinite loop. Same pattern as /dashboard.
  const [tab, setTab] = useState<SpaceTab>('initiatives');
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (isValidTab(urlTab)) setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleTabChange = (next: string) => {
    if (!isValidTab(next)) return;
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/initiatives?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Compass}
        title="Initiatives"
        subtitle="Strategic threads + HHP backlog. Initiatives drive the dashboard's Initiative Tracker; Backlog captures bugs & requests."
        kicker="Resources · Initiatives"
        kickerDot="amber"
      />

      {/* Tab strip — page-level tabs (not popup), so v11 chrome with
          border-cream-200 outer + brand active text matches /clients
          and /dashboard. */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          <TabsTrigger
            value="initiatives"
            className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500 flex items-center gap-1.5"
          >
            <Compass className="h-4 w-4" />
            Initiatives
          </TabsTrigger>
          <TabsTrigger
            value="backlog"
            className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500 flex items-center gap-1.5"
          >
            <Bug className="h-4 w-4" />
            Backlog
          </TabsTrigger>
        </TabsList>

        {/* Merged Initiatives tab — the initiative-aware SpecsTab. Each
            spec can be a promoted initiative (star); the "Initiatives"
            scope filter defaults on so this opens on the strategic list. */}
        <TabsContent value="initiatives" className="mt-4">
          <SpecsTab />
        </TabsContent>

        <TabsContent value="backlog" className="mt-4">
          <BacklogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
