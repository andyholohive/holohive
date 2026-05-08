'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Users, Megaphone, Crown, List, Building2, PanelLeftClose, PanelLeftOpen, Settings, LogOut, Shield, MessageSquare, Zap, User, FileText, ClipboardList, Sliders, DollarSign, TrendingUp, Handshake, UserPlus, Archive, Sparkles, Link2, ChevronLeft, ChevronRight, BookOpen, CheckCircle, Briefcase, ListTodo, Target, Inbox, Calendar, LayoutDashboard, ShieldCheck, ChevronDown, Bell, Radar, Bot, BarChart3, Star, SlidersHorizontal, Compass } from 'lucide-react';
import { SidebarCustomizeDialog, NAV_BY_HREF, isItemAvailable, type AvailabilityCtx } from '@/components/SidebarCustomize';
import { useAuth } from '@/contexts/AuthContext';
import { useChangelog } from '@/contexts/ChangelogContext';
import { useGuestPermissions } from '@/hooks/useGuestPermissions';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  children: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, signOut, loading: authLoading } = useAuth();
  const { isGuest, canView, loading: guestLoading } = useGuestPermissions();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sidebarCollapsed');
      return stored === 'true';
    }
    return false;
  });
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [changelogPage, setChangelogPage] = useState(0);
  const changelogsPerPage = 3;

  // ─── Sidebar customization (bookmarks + hidden) ──────────────────
  // Per-browser persistence in localStorage. We don't key by user.id
  // because every other sidebar pref (sidebarCollapsed) follows the
  // same pattern — if multiple people share a machine, that's already
  // a bigger problem than misaligned bookmarks.
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [bookmarkedHrefs, setBookmarkedHrefs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('sidebar_bookmarks');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [hiddenHrefs, setHiddenHrefs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('sidebar_hidden');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist on every change. Two effects (not one) because each set is
  // updated independently; fewer wasted writes than serializing both.
  useEffect(() => {
    try { localStorage.setItem('sidebar_bookmarks', JSON.stringify(bookmarkedHrefs)); } catch {}
  }, [bookmarkedHrefs]);
  useEffect(() => {
    try { localStorage.setItem('sidebar_hidden', JSON.stringify(hiddenHrefs)); } catch {}
  }, [hiddenHrefs]);

  const toggleBookmark = (href: string) => {
    setBookmarkedHrefs(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href],
    );
  };
  const toggleHidden = (href: string) => {
    setHiddenHrefs(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href],
    );
  };
  const resetCustomization = () => {
    setBookmarkedHrefs([]);
    setHiddenHrefs([]);
  };

  // O(1) hidden lookup used inside NavItem render. Set rebuilt only
  // when the array changes, not on every render.
  const hiddenSet = React.useMemo(() => new Set(hiddenHrefs), [hiddenHrefs]);

  // ─── Per-section collapse state ──────────────────────────────────
  // Each top-level group (Bookmarks, People, KOLs, CRM, Workspace,
  // Documents, Admin) can be independently collapsed by clicking its
  // header. Default = all expanded so the change is non-disruptive.
  // Stored as { [sectionId]: true } where presence means collapsed.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem('sidebar_collapsed_sections');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed_sections', JSON.stringify(collapsedSections)); } catch {}
  }, [collapsedSections]);
  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Get changelog data from context (fetched once at app level)
  const { changelogs, latestVersion } = useChangelog();

  // Format date for changelog display
  const formatChangelogDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Render changelog content
  const renderChangelogContent = (content: string) => {
    return content.split('\n').map((line, index) => {
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <li key={index} className="ml-4 text-gray-700 text-sm">
            {line.trim().substring(2)}
          </li>
        );
      }
      if (line.trim().startsWith('### ')) {
        return (
          <h4 key={index} className="font-semibold text-gray-900 mt-3 mb-1 text-sm">
            {line.trim().substring(4)}
          </h4>
        );
      }
      if (line.trim().startsWith('## ')) {
        return (
          <h3 key={index} className="font-bold text-gray-900 mt-4 mb-2 text-sm">
            {line.trim().substring(3)}
          </h3>
        );
      }
      if (line.trim() === '') {
        return <div key={index} className="h-2" />;
      }
      return (
        <p key={index} className="text-gray-700 text-sm">
          {line}
        </p>
      );
    });
  };

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed(prev => {
      localStorage.setItem('sidebarCollapsed', String(!prev));
      return !prev;
    });
  };

  // Helper function to get user initials
  const getUserInitials = () => {
    if (userProfile?.name) {
      return userProfile.name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2);
    }
    return userProfile?.email?.charAt(0).toUpperCase() || 'U';
  };

  // For guests: don't show any restricted nav until permissions are loaded
  const isGuestUser = userProfile?.role === 'guest';
  const guestStillLoading = isGuestUser && guestLoading;

  // Helper: hide nav items guests can't access (or still loading)
  const guestHide = (pageKey: string) => guestStillLoading || (isGuestUser && !canView(pageKey));

  // Helper: hide entire sections when guest has no access to any item in it
  const guestHideSection = (pageKeys: string[]) => guestStillLoading || (isGuestUser && pageKeys.every(k => !canView(k)));

  // Helper: hide items that guests should never see
  const guestHideAlways = guestStillLoading || isGuestUser;

  // ─── Auto-scroll active nav item into view ───────────────────────
  // The sidebar's <nav> overflows scrollable when the nav list is
  // long. When a user navigates to a page whose link sits below the
  // current scroll viewport (e.g. Claude MCP, Archive, anything in
  // the Admin section), the active brand-color highlight ends up
  // off-screen — they have to scroll down to confirm which page
  // they're on.
  //
  // Fix: on every pathname change, find the element marked
  // data-nav-active="true" inside the nav and scroll it into view
  // with `block: 'nearest'` (only scrolls if needed; no-op when
  // already visible). Smooth behavior so it feels intentional, not
  // jarring. requestAnimationFrame waits for React to commit the
  // new active state to the DOM before we measure.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const active = navRef.current?.querySelector('[data-nav-active="true"]');
      if (active && active instanceof HTMLElement) {
        active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  // ─── Nav-item helpers ──────────────────────────────────────────────
  // Extract the repeated <Link><Button>...</Button></Link> pattern that
  // appears 24 times in the main nav and 7 times in the Tasks sub-nav.
  // Per-item gating (guestHide / role checks) stays at the call site —
  // these helpers only own rendering, so the gating logic remains
  // visible and easy to audit.
  //
  // Why local closures instead of separate exports: they capture
  // pathname + isSidebarCollapsed from the parent component scope so
  // call sites don't have to thread those props through every item.
  // Sidebar is the only consumer; if we ever build a mobile-drawer
  // nav, these become a candidate for extraction.

  /** A single top-level nav item. The data-nav-active marker on the
   *  inner span is what the scroll-into-view effect queries for.
   *
   *  Returns null when the user has hidden this item via the customize
   *  dialog. The `force` prop bypasses the hidden check — used by the
   *  Bookmarks section so a bookmarked item still shows even if its
   *  original location is hidden. (User intent: bookmark = "I want this
   *  visible at the top," hide = "I don't want this in its original
   *  spot." Bookmarks win.) */
  const NavItem = ({
    href,
    icon: Icon,
    label,
    force = false,
  }: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    force?: boolean;
  }) => {
    if (!force && hiddenSet.has(href)) return null;
    const isActive = pathname.startsWith(href);
    return (
      <Link href={href} legacyBehavior>
        <Button
          asChild
          variant={isActive ? 'default' : 'ghost'}
          className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
          style={isActive ? { backgroundColor: '#3e8692', color: 'white' } : {}}
          title={isSidebarCollapsed ? label : undefined}
        >
          <span data-nav-active={isActive ? 'true' : undefined}>
            <Icon className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
            {!isSidebarCollapsed && label}
          </span>
        </Button>
      </Link>
    );
  };

  /** A nested item under a NavItem (currently used by the Tasks
   *  sub-nav). Smaller, indented, uses 'secondary' variant for active
   *  state instead of the brand-color default. `exact` matches the
   *  pathname exactly (for "/tasks") rather than starts-with (for
   *  "/tasks/admin" etc.).
   *
   *  Note: a sub-nav item never sets data-nav-active because the
   *  parent NavItem already does (its prefix match catches the sub-
   *  route too). Otherwise we'd scroll twice and the nav would land
   *  on the sub-item, which buries the parent. */
  const SubNavItem = ({
    href,
    icon: Icon,
    label,
    exact = false,
  }: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    exact?: boolean;
  }) => {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link href={href} legacyBehavior>
        <Button
          asChild
          variant={isActive ? 'secondary' : 'ghost'}
          className="w-full justify-start h-7 text-xs"
        >
          <span>
            <Icon className="h-3.5 w-3.5 mr-2" />
            {label}
          </span>
        </Button>
      </Link>
    );
  };

  /** Visual section divider: small icon + horizontal rule. Hidden when
   *  the sidebar is collapsed (icons-only mode would just show a
   *  random floating icon, which is noise).
   *
   *  Kept as a fallback for places that need a non-collapsible divider
   *  in the future. All current sections route through CollapsibleSection
   *  below. */
  const SectionDivider = ({
    icon: Icon,
  }: {
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    if (isSidebarCollapsed) return null;
    return (
      <div className="flex items-center space-x-2">
        <Icon className="h-4 w-4 text-gray-400" />
        <div className="flex-1 h-px bg-gray-200"></div>
      </div>
    );
  };

  /** Collapsible section wrapper: clickable header (icon + horizontal
   *  rule + chevron) that toggles its children's visibility. Used for
   *  every top-level group in the sidebar.
   *
   *  When the whole sidebar is collapsed (`isSidebarCollapsed` = true),
   *  there's no header — children render as a flat list of icon-only
   *  items, matching the old SectionDivider behavior. Per-section
   *  collapse only applies in expanded mode where there's a header to
   *  click. */
  const CollapsibleSection = ({
    id,
    icon: Icon,
    children,
  }: {
    id: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
  }) => {
    if (isSidebarCollapsed) {
      // Icons-only mode: no header, no collapse — render items directly.
      return <div className="space-y-2">{children}</div>;
    }
    const isCollapsed = !!collapsedSections[id];
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => toggleSection(id)}
          className="w-full flex items-center space-x-2 group hover:opacity-80"
          title={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          <Icon className="h-4 w-4 text-gray-400" />
          <div className="flex-1 h-px bg-gray-200"></div>
          <ChevronDown
            className={`h-3 w-3 text-gray-400 transition-transform duration-200 ${
              isCollapsed ? '-rotate-90' : ''
            }`}
          />
        </button>
        {!isCollapsed && children}
      </div>
    );
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <Image src="/images/logo.png" alt="Logo" width={36} height={36} />
              <span className="ml-2 text-xl font-semibold text-gray-800">Holo Hive</span>
              {latestVersion && (
                <Badge
                  variant="secondary"
                  className="ml-2 cursor-pointer bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
                  onClick={() => setIsChangelogOpen(true)}
                >
                  v{latestVersion}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 rounded-full hover:bg-transparent active:bg-transparent focus:bg-transparent focus-visible:ring-0 data-[state=open]:bg-transparent"
                >
                  <Avatar className="h-8 w-8">
                    {userProfile?.profile_photo_url ? (
                      <AvatarImage src={userProfile.profile_photo_url} alt={userProfile?.name || userProfile?.email || 'User'} />
                    ) : null}
                    <AvatarFallback className="bg-gray-200 text-gray-800 text-xs font-semibold">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-300 ease-in-out`}>
          <div className="flex flex-col h-full">
            {/* Navigation */}
            <nav ref={navRef} className="p-4 space-y-4 flex-1 overflow-y-auto">
              {!userProfile ? (
                <div className="space-y-3 py-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
                </div>
              ) : <>
              {/* Holo GPT — hidden from sidebar (still reachable at /chat).
                  Was here, removed at user request 2026-05-05. Restore by
                  un-commenting; the !guestHideAlways guard is still correct. */}
              {/* {!guestHideAlways && (
                <div className="space-y-2">
                  <NavItem href="/chat" icon={Sparkles} label="Holo GPT" />
                </div>
              )} */}

              {/* Priority Dashboard — top of sidebar (above bookmarks
                  even). Company-operating view; anyone with non-guest
                  access can open it. Added 2026-05-07. */}
              {!guestHideAlways && (
                <div className="space-y-2">
                  <NavItem href="/dashboard" icon={Compass} label="Dashboard" />
                </div>
              )}

              {/* Bookmarks — user-pinned items at the top. Renders only
                  when the user has bookmarked anything. Each item is
                  filtered through isItemAvailable so a user who lost
                  access (role downgrade, etc.) doesn't see broken links.
                  Uses force=true on NavItem so a bookmarked item still
                  appears even if it's also marked hidden. */}
              {(() => {
                const ctx: AvailabilityCtx = {
                  isGuest: isGuestUser,
                  role: userProfile?.role,
                  canView,
                };
                const visible = bookmarkedHrefs
                  .map(href => NAV_BY_HREF[href])
                  .filter(item => item && isItemAvailable(item, ctx));
                if (visible.length === 0) return null;
                return (
                  <CollapsibleSection id="bookmarks" icon={Star}>
                    {visible.map(item => (
                      <NavItem
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
                        force
                      />
                    ))}
                  </CollapsibleSection>
                );
              })()}

              {/* People Section */}
              {!guestHideSection(['/clients']) && (
                <CollapsibleSection id="people" icon={User}>
                  {!isGuest && <NavItem href="/team" icon={Shield} label="Team" />}
                  {!guestHide('/clients') && <NavItem href="/clients" icon={Users} label="Clients" />}
                </CollapsibleSection>
              )}

              {/* KOLs Section */}
              {!guestHideSection(['/kols', '/lists', '/campaigns']) && (
                <CollapsibleSection id="kols" icon={Crown}>
                  {!guestHide('/kols') && <NavItem href="/kols" icon={Crown} label="KOLs" />}
                  {!guestHide('/lists') && <NavItem href="/lists" icon={List} label="Lists" />}
                  {!guestHide('/campaigns') && <NavItem href="/campaigns" icon={Megaphone} label="Campaigns" />}
                </CollapsibleSection>
              )}

              {/* CRM Section */}
              {!guestHideSection(['/crm/sales-pipeline', '/intelligence', '/crm/network', '/crm/contacts', '/crm/submissions', '/crm/meetings']) && (
                <CollapsibleSection id="crm" icon={DollarSign}>
                  {!guestHide('/crm/sales-pipeline') && <NavItem href="/crm/sales-pipeline" icon={Target} label="Sales" />}
                  {!guestHide('/intelligence') && <NavItem href="/intelligence" icon={Radar} label="Intelligence" />}
                  {/* Analytics — team dashboard with KPIs, pipeline funnel,
                      owner workload, recent activity, health alerts.
                      Reads /api/analytics/dashboard in one call. */}
                  {!guestHide('/analytics') && <NavItem href="/analytics" icon={BarChart3} label="Analytics" />}
                  {!guestHide('/crm/network') && <NavItem href="/crm/network" icon={Handshake} label="Network" />}
                  {!guestHide('/crm/contacts') && <NavItem href="/crm/contacts" icon={UserPlus} label="Contacts" />}
                  {!guestHide('/crm/submissions') && <NavItem href="/crm/submissions" icon={Inbox} label="Submissions" />}
                  {!guestHide('/crm/meetings') && <NavItem href="/crm/meetings" icon={Calendar} label="Meetings" />}
                  {userProfile?.role === 'super_admin' && <NavItem href="/crm/telegram" icon={MessageSquare} label="TG Chats" />}
                </CollapsibleSection>
              )}

              {/* Workspace Section */}
              {!guestHideSection(['/daily-standup', '/tasks']) && (
                <CollapsibleSection id="workspace" icon={Briefcase}>
                  <NavItem href="/daily-standup" icon={CheckCircle} label="Daily Stand-Up" />
                  <NavItem href="/tasks" icon={ListTodo} label="Tasks" />
                  {/* Task sub-nav — visible only when expanded AND on a /tasks route */}
                  {!isSidebarCollapsed && pathname.startsWith('/tasks') && (
                    <div className="pl-6 space-y-0.5">
                      <SubNavItem href="/tasks" icon={ListTodo} label="All Tasks" exact />
                      <SubNavItem href="/tasks/my-dashboard" icon={LayoutDashboard} label="My Dashboard" exact />
                      <SubNavItem href="/tasks/deliverables" icon={Target} label="Deliverables" />
                      {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                        <>
                          <SubNavItem href="/tasks/admin" icon={ShieldCheck} label="Admin Overview" exact />
                          <SubNavItem href="/tasks/automations" icon={Zap} label="Automations" exact />
                          <SubNavItem href="/tasks/templates" icon={FileText} label="Templates" exact />
                          <SubNavItem href="/tasks/deliverables/templates" icon={Sliders} label="Deliverable Templates" exact />
                        </>
                      )}
                    </div>
                  )}
                  <NavItem href="/reminders" icon={Bell} label="Reminders" />
                </CollapsibleSection>
              )}

              {/* Documents Section */}
              {!guestHideSection(['/delivery-logs', '/links']) && (
                <CollapsibleSection id="documents" icon={FileText}>
                  {!guestHide('/delivery-logs') && <NavItem href="/delivery-logs" icon={ClipboardList} label="Delivery Logs" />}
                  {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && <NavItem href="/mindshare" icon={TrendingUp} label="Mindshare" />}
                  {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && <NavItem href="/forms" icon={ClipboardList} label="Forms" />}
                  {!guestHide('/links') && <NavItem href="/links" icon={Link2} label="Links" />}
                  {!guestHideAlways && <NavItem href="/templates" icon={MessageSquare} label="Templates" />}
                  {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && <NavItem href="/sops" icon={BookOpen} label="SOPs" />}
                </CollapsibleSection>
              )}

              {/* Admin Section — hidden for guests */}
              {!guestHideAlways && (
                <CollapsibleSection id="admin" icon={Settings}>
                  <NavItem href="/admin/field-options" icon={Sliders} label="Field Options" />
                  {/* Claude MCP Cookbook — reference page for the AI
                      connector (example prompts for every tool). Sits
                      in the Admin section because it's a settings/help-
                      style item, but visible to everyone since the
                      connector itself is. */}
                  <NavItem href="/mcp" icon={Bot} label="Claude MCP" />
                  {userProfile?.role === 'super_admin' && <NavItem href="/admin/changelog" icon={Sparkles} label="Changelog" />}
                  <NavItem href="/archive" icon={Archive} label="Archive" />
                </CollapsibleSection>
              )}

              </>}
            </nav>
            {/* Bottom controls: customize + collapse. Side-by-side when
                expanded, stacked when collapsed (icons-only). Customize
                hidden for guests since they can't meaningfully use it
                (their nav is permission-gated to a tiny subset). */}
            <div className="p-4 border-t border-gray-200">
              <div className={`flex ${isSidebarCollapsed ? 'flex-col gap-1' : 'justify-center gap-1'}`}>
                {!guestHideAlways && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCustomizeOpen(true)}
                    className="hover:bg-gray-100 w-auto px-2"
                    title="Customize sidebar"
                    aria-label="Customize sidebar"
                  >
                    {/* Icon-only — text label removed at user request 2026-05-05.
                        The title attribute provides hover affordance, aria-label
                        keeps screen readers informed. */}
                    <SlidersHorizontal className="h-4 w-4 text-gray-600" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSidebarToggle}
                  className="hover:bg-gray-100 w-auto px-2"
                  title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {isSidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4 text-gray-600" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4 text-gray-600" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </aside>
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {/* Customize Sidebar Dialog */}
      <SidebarCustomizeDialog
        open={isCustomizeOpen}
        onOpenChange={setIsCustomizeOpen}
        bookmarkedHrefs={bookmarkedHrefs}
        hiddenHrefs={hiddenHrefs}
        onToggleBookmark={toggleBookmark}
        onToggleHidden={toggleHidden}
        onReset={resetCustomization}
        ctx={{ isGuest: isGuestUser, role: userProfile?.role, canView }}
      />

      {/* Changelog History Dialog */}
      <Dialog open={isChangelogOpen} onOpenChange={(open) => {
        setIsChangelogOpen(open);
        if (open) setChangelogPage(0);
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" />
              <DialogTitle className="text-xl">Changelog</DialogTitle>
            </div>
            <DialogDescription>
              Version history and updates
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-6">
              {changelogs
                .slice(changelogPage * changelogsPerPage, (changelogPage + 1) * changelogsPerPage)
                .map((changelog, idx) => (
                <div key={changelog.id} className={idx > 0 ? 'border-t pt-6' : ''}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant="secondary"
                      className="bg-brand/10 text-brand"
                    >
                      v{changelog.version}
                    </Badge>
                    {changelog.published_at && (
                      <span className="text-sm text-gray-500">
                        {formatChangelogDate(changelog.published_at)}
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 mb-2">
                    {changelog.title}
                  </h3>
                  <div className="space-y-1">
                    {renderChangelogContent(changelog.content)}
                  </div>
                </div>
              ))}
              {changelogs.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No changelogs available yet.
                </p>
              )}
            </div>
          </ScrollArea>
          {changelogs.length > changelogsPerPage && (
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChangelogPage(p => Math.max(0, p - 1))}
                disabled={changelogPage === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {changelogPage + 1} of {Math.ceil(changelogs.length / changelogsPerPage)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChangelogPage(p => Math.min(Math.ceil(changelogs.length / changelogsPerPage) - 1, p + 1))}
                disabled={changelogPage >= Math.ceil(changelogs.length / changelogsPerPage) - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 