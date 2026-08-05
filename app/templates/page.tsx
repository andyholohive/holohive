'use client';

/**
 * /templates — unified Templates hub (2026-06-03).
 *
 * Four tabs that consolidate what used to be separate entries
 * scattered across HQ:
 *   - Messages     (this page's original content — client message templates)
 *   - Tasks        (formerly /tasks/templates, admin-only)
 *   - Deliverables (formerly /tasks/deliverables/templates, admin-only)
 *   - Action Board (formerly /clients/templates, added 2026-08-05)
 *
 * Action Board joined late: it was a sub-route of /clients rather than
 * a sidebar entry, so the 2026-06-03 sweep didn't catch it. Reachable
 * only from a toolbar button on /clients and a "Manage templates…"
 * item inside the per-client Action Board dropdown, it left two places
 * to look for the same kind of thing.
 *
 * Tab visibility is role-gated: non-guest users see Messages; admin
 * (and super_admin) additionally see Tasks + Deliverables + Action
 * Board. Note this TIGHTENS access for Action Board, which previously
 * had no gate of its own — see canEditTemplates below. Default
 * landing tab is whichever the user picked last (localStorage), with
 * URL `?tab=` taking precedence so deep links still work. The old
 * /tasks/templates, /tasks/deliverables/templates and /clients/templates
 * routes now redirect to /templates?tab=tasks, ?tab=deliverables and
 * ?tab=action-board respectively for back-compat.
 *
 * Pattern matches /dashboard: PageHeader + outer Tabs strip + one
 * component per tab under ./_tabs/. Each tab self-contains its data
 * fetch + dialogs.
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare, Sparkles, FileText, Settings, AlertTriangle, ListChecks } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/contexts/AuthContext';
import { useGuestPermissions } from '@/hooks/useGuestPermissions';
import MessagesTab from './_tabs/MessagesTab';
import TaskTemplatesTab from './_tabs/TaskTemplatesTab';
import DeliverableTemplatesTab from './_tabs/DeliverableTemplatesTab';
import ActionBoardTemplatesTab from './_tabs/ActionBoardTemplatesTab';

type Tab = 'messages' | 'tasks' | 'deliverables' | 'action-board';
const VALID_TABS: readonly Tab[] = ['messages', 'tasks', 'deliverables', 'action-board'] as const;
const isValidTab = (s: string | null): s is Tab => !!s && (VALID_TABS as readonly string[]).includes(s);

const STORAGE_KEY = 'templates:last-tab';
const DEFAULT_TAB: Tab = 'messages';

export default function TemplatesPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const isGuest = userProfile?.role === 'guest';
  // [2026-07-24 per Andy] Members can be granted the Tasks + Deliverables
  // editors per-user (set on /team → Extra Access, page key '/templates').
  const { hasMemberGrant } = useGuestPermissions();
  const canEditTemplates = isAdmin || hasMemberGrant('/templates');

  // Hide tabs the user can't access. Messages is gated only on
  // non-guest; Tasks + Deliverables + Action Board are admin/super_admin
  // or a member with an explicit grant.
  //
  // [2026-08-05] Action Board rides the same gate. Its old home at
  // /clients/templates had NO role check — any signed-in user could
  // rename, reassign the default, or delete a global milestone template.
  // Grouping it with the other two template editors is the consistent
  // call; a member who needs it gets the '/templates' grant on /team.
  const allowedTabs: Tab[] = [
    ...(!isGuest ? (['messages'] as Tab[]) : []),
    ...(canEditTemplates ? (['tasks', 'deliverables', 'action-board'] as Tab[]) : []),
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
          kicker="Resources · Templates"
          kickerDot="amber"
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
        kicker="Resources · Templates"
        kickerDot="amber"
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
          {allowedTabs.includes('action-board') && (
            <TabsTrigger
              value="action-board"
              className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm font-medium px-4 py-2 text-ink-warm-500"
            >
              <ListChecks className="h-4 w-4 mr-2" />
              Action Board
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
        {allowedTabs.includes('action-board') && (
          <TabsContent value="action-board" className="mt-0">
            <Suspense fallback={null}>
              <ActionBoardTemplatesTab />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
