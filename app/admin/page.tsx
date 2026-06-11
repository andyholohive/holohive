'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Sliders, Bot, Settings, Tag as TagIcon, UserCheck } from 'lucide-react';

import FieldOptionsPage from '@/app/admin/field-options/page';
import McpPage from '@/app/mcp/page';
import ContentTagsPage from '@/app/admin/content-tags/page';
import LineupSettingsPage from '@/app/admin/lineup-settings/page';

/**
 * /admin — combined admin tools page.
 *
 * Combines Field Options + Claude MCP into a single tabbed page. The
 * original routes still work for direct linking + backward-compat (the
 * underlying page components are imported from those routes), but the
 * sidebar surfaces only this one entry to reduce clutter.
 *
 * [2026-06-08] Archive used to be a third tab here but was promoted to
 * its own sidebar entry — it's a destination view (search + restore for
 * archived clients / campaigns / KOLs), conceptually closer to a list
 * page than to the field/MCP config surfaces, and burying it inside
 * Admin Tools made it harder to find. /archive still works directly.
 *
 * Tab state syncs with the ?tab= query param so a link like
 * /admin?tab=mcp opens directly to the right view, and switching tabs
 * updates the URL without a full navigation.
 */

type AdminTab = 'field-options' | 'mcp' | 'content-tags' | 'lineup-settings';
const VALID_TABS: AdminTab[] = ['field-options', 'mcp', 'content-tags', 'lineup-settings'];

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
        subtitle="Field Options, Claude MCP, Content Tags, and Lineup Manager — combined into one tabbed page."
        kicker="Admin · Tools"
        kickerDot="brand"
      />

      {/* v11 underline tabs — same pattern as the campaign admin page,
          /clients, /intelligence, etc. Consistent across every tabbed
          surface in the app. Replaced the older pill-tile style. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <TabsList className="w-full justify-start gap-0.5 bg-transparent p-0 h-auto rounded-none border-b border-cream-200">
          <TabsTrigger
            value="field-options"
            className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t flex items-center gap-1.5"
          >
            <Sliders className="h-4 w-4" />
            Field Options
          </TabsTrigger>
          <TabsTrigger
            value="mcp"
            className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t flex items-center gap-1.5"
          >
            <Bot className="h-4 w-4" />
            Claude MCP
          </TabsTrigger>
          <TabsTrigger
            value="content-tags"
            className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t flex items-center gap-1.5"
          >
            <TagIcon className="h-4 w-4" />
            Content Tags
          </TabsTrigger>
          <TabsTrigger
            value="lineup-settings"
            className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t flex items-center gap-1.5"
          >
            <UserCheck className="h-4 w-4" />
            Lineup Manager
          </TabsTrigger>
        </TabsList>

        {/* Each TabsContent renders the existing page component. The
            original /admin/field-options and /mcp routes keep working
            unchanged — this is purely a presentation wrapper.
            forceMount=false (default) means inactive tabs unmount,
            which avoids running their effects in the background and
            keeps the page fast. */}
        <TabsContent value="field-options" className="mt-4">
          <FieldOptionsPage />
        </TabsContent>
        <TabsContent value="mcp" className="mt-4">
          <McpPage />
        </TabsContent>
        <TabsContent value="content-tags" className="mt-4">
          <ContentTagsPage />
        </TabsContent>
        <TabsContent value="lineup-settings" className="mt-4">
          <LineupSettingsPage />
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
        subtitle="Field Options, Claude MCP, Content Tags, and Lineup Manager — combined into one tabbed page."
        kicker="Admin · Tools"
        kickerDot="brand"
      />
      {/* Skeleton matches the v11 underline tab strip — a thin border-bottom
          line with no pill background. */}
      <Skeleton className="h-10 w-full rounded-none border-b border-cream-200 bg-transparent" />
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
