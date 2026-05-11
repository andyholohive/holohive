'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sliders, Bot, Archive } from 'lucide-react';

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
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <TabsList>
          <TabsTrigger value="field-options" className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            Field Options
          </TabsTrigger>
          <TabsTrigger value="mcp" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Claude MCP
          </TabsTrigger>
          <TabsTrigger value="archive" className="flex items-center gap-2">
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

export default function AdminPage() {
  // useSearchParams requires a Suspense boundary in app router.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading...</div>}>
      <AdminPageInner />
    </Suspense>
  );
}
