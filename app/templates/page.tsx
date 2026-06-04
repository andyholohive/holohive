'use client';

/**
 * /templates — unified Templates hub (2026-06-03).
 *
 * Three tabs that consolidate what used to be three separate sidebar
 * entries scattered across HQ:
 *   - Messages     (this page's original content — client message templates)
 *   - Tasks        (formerly /tasks/templates, admin-only)
 *   - Deliverables (formerly /tasks/deliverables/templates, admin-only)
 *
 * Tab visibility is role-gated: non-guest users see Messages; admin
 * (and super_admin) additionally see Tasks + Deliverables. Default
 * landing tab is whichever the user picked last (localStorage), with
 * URL `?tab=` taking precedence so deep links still work. The old
 * /tasks/templates and /tasks/deliverables/templates routes now
 * redirect to /templates?tab=tasks and /templates?tab=deliverables
 * respectively for back-compat.
 *
 * Pattern matches /dashboard: PageHeader + outer Tabs strip + one
 * component per tab under ./_tabs/. Each tab self-contains its data
 * fetch + dialogs.
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare, Sparkles, FileText, Settings, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/contexts/AuthContext';
import MessagesTab from './_tabs/MessagesTab';
import TaskTemplatesTab from './_tabs/TaskTemplatesTab';
import DeliverableTemplatesTab from './_tabs/DeliverableTemplatesTab';

type Tab = 'messages' | 'tasks' | 'deliverables';
const VALID_TABS: readonly Tab[] = ['messages', 'tasks', 'deliverables'] as const;
const isValidTab = (s: string | null): s is Tab => !!s && (VALID_TABS as readonly string[]).includes(s);

const STORAGE_KEY = 'templates:last-tab';
const DEFAULT_TAB: Tab = 'messages';

export default function TemplatesPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const isGuest = userProfile?.role === 'guest';

  // Hide tabs the user can't access. Messages is gated only on
  // non-guest; Tasks + Deliverables are admin/super_admin only.
  const allowedTabs: Tab[] = [
    ...(!isGuest ? (['messages'] as Tab[]) : []),
    ...(isAdmin ? (['tasks', 'deliverables'] as Tab[]) : []),
  ];

  const [activeTab, setActiveTab] = useState<Tab>(DEFAULT_TAB);

  // Resolve tab on mount: URL ?tab= wins, then localStorage, then
  // default. If the saved/URL tab isn't in the user's allowedTabs,
  // fall back to the first allowed tab (so a guest who somehow
  // lands on ?tab=tasks doesn't see a phantom empty page).
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    let resolved: Tab | null = null;
    if (isValidTab(urlTab) && allowedTabs.includes(urlTab)) {
      resolved = urlTab;
    } else if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isValidTab(saved) && allowedTabs.includes(saved)) {
        resolved = saved;
      }
    }
    if (!resolved && allowedTabs.length > 0) resolved = allowedTabs[0];
    if (resolved) setActiveTab(resolved);
    // searchParams + allowedTabs intentionally re-read once on mount.
    // We don't want a sync loop when the user clicks a tab inside the
    // page (which also updates ?tab=). allowedTabs derives from
    // userProfile which is stable post-load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.role]);

  const handleTabChange = (next: string) => {
    if (!isValidTab(next) || !allowedTabs.includes(next)) return;
    setActiveTab(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/templates?${params.toString()}`, { scroll: false });
  };

  // No allowed tabs (guest user without messages access — unlikely but
  // defensible). Show a v10-style locked-out screen.
  if (allowedTabs.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={FileText}
          title="Templates"
          subtitle="Pre-built artifacts the team reuses across messages, tasks, and workflows"
          kicker="Workspace · Templates"
          kickerDot="brand"
        />
        <div className="bg-cream-50 border border-cream-200 rounded-lg p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <p className="text-ink-warm-700 font-medium">No template access for this account.</p>
          <p className="text-ink-warm-500 text-sm mt-1">Reach out to an admin if you think this is a mistake.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Templates"
        subtitle="Pre-built artifacts the team reuses across messages, tasks, and workflows"
        kicker="Workspace · Templates"
        kickerDot="brand"
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          {allowedTabs.includes('messages') && (
            <TabsTrigger
              value="messages"
              className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Messages
            </TabsTrigger>
          )}
          {allowedTabs.includes('tasks') && (
            <TabsTrigger
              value="tasks"
              className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Tasks
            </TabsTrigger>
          )}
          {allowedTabs.includes('deliverables') && (
            <TabsTrigger
              value="deliverables"
              className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500"
            >
              <Settings className="h-4 w-4 mr-2" />
              Deliverables
            </TabsTrigger>
          )}
        </TabsList>

        {allowedTabs.includes('messages') && (
          <TabsContent value="messages" className="mt-0">
            <Suspense fallback={null}>
              <MessagesTab />
            </Suspense>
          </TabsContent>
        )}
        {allowedTabs.includes('tasks') && (
          <TabsContent value="tasks" className="mt-0">
            <Suspense fallback={null}>
              <TaskTemplatesTab />
            </Suspense>
          </TabsContent>
        )}
        {allowedTabs.includes('deliverables') && (
          <TabsContent value="deliverables" className="mt-0">
            <Suspense fallback={null}>
              <DeliverableTemplatesTab />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
