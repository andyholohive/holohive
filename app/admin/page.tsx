'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Sliders, Bot, Archive, Settings } from 'lucide-react';

import FieldOptionsPage from '@/app/admin/field-options/page';
import McpPage from '@/app/mcp/page';
import ArchivePage from '@/app/archive/page';

/**
 * /admin — combined admin tools page.
 *
 * Replaces three separate sidebar entries (Field Options, Claude MCP,
 * Archive) with a single tabbed page. The original routes still work
 * for direct linking and backward-compat (the underlying page components
 * are imported from those routes), but the sidebar surfaces only this
 * one entry to reduce clutter.
 *
 * Tab state syncs with the ?tab= query param so a link like
 * /admin?tab=archive opens directly to the right view, and switching
 * tabs updates the URL without a full navigation.
 */

type AdminTab = 'field-options' | 'mcp' | 'archive';
const VALID_TABS: AdminTab[] = ['field-options', 'mcp', 'archive'];

function AdminPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get('tab') as AdminTab | null);
  const [tab, setTab] = useState<AdminTab>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'field-options'
  );

  // Keep URL in sync with tab so reloads + share-links land on the right view.
  useEffect(() => {
    const current = searchParams.get('tab');
    if (current === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/admin?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Admin Tools"
        subtitle="Field Options, Claude MCP, and Archive — combined into one tabbed page."
        kicker="Admin · Tools"
        kickerDot="brand"
      />

      {/* v11 tab chrome (cream-100 outer + cream-200 border + white
          active tile with shadow-card + brand text). Was unstyled
          shadcn default. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          <TabsTrigger
            value="field-options"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
          >
            <Sliders className="h-4 w-4" />
            Field Options
          </TabsTrigger>
          <TabsTrigger
            value="mcp"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
          >
            <Bot className="h-4 w-4" />
            Claude MCP
          </TabsTrigger>
          <TabsTrigger
            value="archive"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
          >
            <Archive className="h-4 w-4" />
            Archive
          </TabsTrigger>
        </TabsList>

        {/* Each TabsContent renders the existing page component. The
            original /admin/field-options, /mcp, and /archive routes
            keep working unchanged — this is purely a presentation
            wrapper. forceMount=false (default) means inactive tabs
            unmount, which avoids running their effects in the
            background and keeps the page fast. */}
        <TabsContent value="field-options" className="mt-4">
          <FieldOptionsPage />
        </TabsContent>
        <TabsContent value="mcp" className="mt-4">
          <McpPage />
        </TabsContent>
        <TabsContent value="archive" className="mt-4">
          <ArchivePage />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Structural skeleton for the Suspense fallback. Mirrors the loaded
// layout (PageHeader + tab strip + content card) so the kicker/title
// doesn't shift when `useSearchParams` resolves and the inner renders.
function AdminPageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Admin Tools"
        subtitle="Field Options, Claude MCP, and Archive — combined into one tabbed page."
        kicker="Admin · Tools"
        kickerDot="brand"
      />
      <Skeleton className="h-10 w-[320px] rounded-md" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

export default function AdminPage() {
  // useSearchParams requires a Suspense boundary in app router.
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <AdminPageInner />
    </Suspense>
  );
}
