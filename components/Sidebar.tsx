'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Users, Megaphone, Crown, List, Building2, PanelLeftClose, PanelLeftOpen, Settings, LogOut, Shield, MessageSquare, Zap, User, FileText, ClipboardList, Sliders, DollarSign, TrendingUp, Handshake, UserPlus, Archive, Sparkles, Link2, ChevronLeft, ChevronRight, BookOpen, CheckCircle, Briefcase, ListTodo, Target, Inbox, Calendar, LayoutDashboard, ShieldCheck, ChevronDown, Bell, Radar, Bot, BarChart3, Star, SlidersHorizontal, Compass, Menu, X, Wallet } from 'lucide-react';
import { SidebarCustomizeDialog, NAV_BY_HREF, isItemAvailable, type AvailabilityCtx } from '@/components/SidebarCustomize';
import { useAuth } from '@/contexts/AuthContext';
import { useChangelog } from '@/contexts/ChangelogContext';
import { useGuestPermissions } from '@/hooks/useGuestPermissions';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDate } from '@/lib/dateFormat';
// [2026-06-11] NotificationBell removed per Andy's call. "This Week"
// snapshot on the portal becomes the visibility mechanism (driven by
// the curated Weekly Update tab landing in Post-Onboarding spec Phase 2).
// Clients don't actively check the portal — a bell is wasted UX.

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

  // [Mobile responsive, May 2026] Mobile-only state: when true, the
  // sidebar slides in from the left over the content with a dim
  // backdrop. Desktop (lg+) ignores this state entirely — the sidebar
  // is always in its docked position there. Tied to the hamburger
  // button in the header (lg:hidden).
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Close mobile sidebar whenever the route changes — otherwise users
  // tap a nav item and the sidebar stays open over the destination page.
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

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
    return formatDate(dateString);
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

  // ─── Auto-scroll + auto-expand active nav item to top ───────────
  // The sidebar's <nav> overflows scrollable when the nav list is
  // long. When a user navigates to a page whose link sits below the
  // current scroll viewport (e.g. Claude MCP, Archive, anything in
  // the Admin section), the active brand-color highlight ends up
  // off-screen — they have to scroll down to confirm which page
  // they're on.
  //
  // Three-step fix:
  //
  // STEP 1 — auto-expand the section that contains the active route.
  // CollapsibleSection's `{!isCollapsed && <div>{children}</div>}`
  // means children aren't rendered at all when the section is
  // collapsed; if the user has the section folded and navigates
  // INTO it, `data-nav-active` doesn't exist in the DOM and
  // scrollIntoView has nothing to find. We use a path-prefix
  // registry (SECTION_PREFIXES) to figure out which section owns
  // the current pathname, then flip its collapsed state to false
  // before the scroll runs.
  //
  // STEP 2 — double-rAF to wait for the auto-expand re-render. A
  // single requestAnimationFrame fires before React has committed
  // the state change from step 1, so the active element may still
  // not be in the DOM when we query for it. Two RAFs guarantee at
  // least one commit cycle has flushed. (One RAF is enough when
  // the section was already expanded; double-RAF only matters on
  // first navigation into a collapsed section.)
  //
  // STEP 3 — scrollIntoView({ block: 'start' }) pins the active
  // item to the TOP of the scroll viewport — "as high as possible"
  // so it's the most-prominent thing visible on the sidebar after
  // navigation. Was 'nearest' before, which only nudged the item
  // into view at the nearest edge (worked but kept the active item
  // wherever it happened to land — felt inconsistent). `behavior:
  // 'auto'` keeps it instant (no scroll-animation lag).
  //
  // Deps:
  //   - pathname:        the obvious trigger for in-app navigation
  //   - userProfile?.id: the nav is gated on userProfile (loading
  //     branch renders skeleton rows with no data-nav-active marker).
  //     Without this dep, when the profile loads AFTER first paint,
  //     the active item mounts but the effect doesn't re-fire and
  //     the sidebar stays scrolled to the top.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Section path-prefix registry. Keep in sync with CollapsibleSection
    // `id` values + the NavItems rendered inside each section.
    const SECTION_PREFIXES: Record<string, string[]> = {
      pinned:      ['/tasks', '/dashboard'],
      clients:     ['/clients', '/campaigns', '/delivery-logs'],
      kols:        ['/kols', '/lists'],
      crm:         ['/crm/sales-pipeline', '/crm/network', '/crm/contacts', '/intelligence', '/analytics'],
      resources:   ['/templates', '/sops', '/initiatives', '/team', '/expenses', '/links'],
      measurement: ['/mindshare', '/wallets'],
      logistics:   ['/reminders', '/crm/submissions', '/crm/meetings', '/crm/telegram', '/forms'],
      admin:       ['/admin', '/archive'],
    };

    // Find which section (if any) owns the current path.
    let owningSection: string | null = null;
    for (const [id, prefixes] of Object.entries(SECTION_PREFIXES)) {
      if (prefixes.some(p => pathname.startsWith(p))) {
        owningSection = id;
        break;
      }
    }

    // STEP 1: expand the owning section if it's currently collapsed.
    // Functional setState — only fires a re-render when something
    // actually changes, so non-collapsed paths are a no-op.
    if (owningSection && collapsedSections[owningSection]) {
      setCollapsedSections(prev => {
        if (!prev[owningSection!]) return prev;
        const next = { ...prev };
        delete next[owningSection!];
        return next;
      });
    }

    // STEP 2 + 3: double-rAF, then scroll to top.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const active = navRef.current?.querySelector('[data-nav-active="true"]');
        if (active && active instanceof HTMLElement) {
          active.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
    // collapsedSections intentionally excluded — it changes inside
    // this effect via setCollapsedSections, and including it would
    // re-fire the effect immediately after the expand, double-
    // running the scroll. The expand-then-scroll happens in two
    // commits within the same pathname/userProfile change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, userProfile?.id]);

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
    // [v11 design system, 2026-06-01]
    // - Active:  brand-soft bg + brand-deep text + 3px brand left rail
    //   (`.accent-l-brand`). Replaces the flat `bg-brand text-white` fill
    //   — softer, "you are here" without shouting.
    // - Inactive: quiet cream hover + ink-warm-700 text.
    // - Density: 13px text, 15px icons, h-8 row height — matches v11 mockup.
    const activeClass = isActive
      ? 'bg-brand-soft text-brand-deep accent-l-brand font-semibold'
      : 'hover:bg-cream-100 text-ink-warm-700';
    return (
      <Link href={href} legacyBehavior>
        <Button
          asChild
          variant="ghost"
          className={`w-full h-8 text-[13px] font-medium transition-colors ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-2.5'} ${activeClass}`}
          title={isSidebarCollapsed ? label : undefined}
        >
          <span data-nav-active={isActive ? 'true' : undefined}>
            <Icon className={`h-[15px] w-[15px] ${!isSidebarCollapsed ? 'mr-2.5' : ''}`} />
            {!isSidebarCollapsed && label}
          </span>
        </Button>
      </Link>
    );
  };

  /** A nested item under a NavItem (currently used by the HQ sub-nav).
   *  Smaller than NavItem (h-7 vs h-8, text-[12px] vs text-[13px], 13px
   *  icons vs 15px) but otherwise mirrors NavItem's v11 chrome so the
   *  HQ sub-menu reads as the same family as the top-level sidebar:
   *  active rows get brand-soft + brand-deep + 3px accent rail + bold;
   *  inactive rows hover to cream-100 with ink-warm-700 text.
   *
   *  `exact` matches the pathname exactly (for "/tasks") rather than
   *  starts-with (for "/tasks/admin" etc.) — so the parent /tasks
   *  doesn't stay highlighted when the user is on a deeper sub-route.
   *
   *  Marks active sub-items with `data-nav-active` for the scroll-
   *  to-active effect.
   *
   *  [2026-06-05] Used to skip this attribute under the assumption
   *  that "the parent NavItem already sets it via prefix match." That
   *  assumption broke for /templates and /sops — they're sub-items
   *  under the HQ NavItem (`/tasks`) but don't share the `/tasks`
   *  prefix, so the parent's `pathname.startsWith('/tasks')` check
   *  is false when the user is on them. Neither the parent NavItem
   *  nor this SubNavItem had the marker, so `scrollIntoView` had no
   *  target and the sidebar stayed wherever it was. Setting the
   *  attribute here makes /templates + /sops work; for sub-routes
   *  the parent DOES match (e.g. `/tasks/deliverables`), the parent
   *  NavItem still renders first in the DOM so `querySelector` picks
   *  it up — no regression on the normal case.
   *
   *  Pre-v11 the active state used shadcn's `secondary` variant
   *  (cream-ish fill, gray text) and the inactive used `ghost` — both
   *  bypass the brand palette and read as a different design family
   *  than NavItem. Updated 2026-06-03 to match the rest of the
   *  sidebar. */
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
    const activeClass = isActive
      ? 'bg-brand-soft text-brand-deep accent-l-brand font-semibold'
      : 'hover:bg-cream-100 text-ink-warm-700';
    return (
      <Link href={href} legacyBehavior>
        <Button
          asChild
          variant="ghost"
          className={`w-full justify-start h-7 px-2.5 text-[12px] font-medium transition-colors ${activeClass}`}
        >
          <span data-nav-active={isActive ? 'true' : undefined}>
            <Icon className="h-[13px] w-[13px] mr-2" />
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
  /**
   * v11 (2026-06-01): CollapsibleSection treatment — replaces the
   * icon + horizontal divider + chevron pattern with a colored dot +
   * uppercase label. Pulled directly from the v11 mockup sidebar.
   *
   * - Dot color is derived from `id` via SECTION_HUES — keeps each
   *   section visually scannable (People sky, CRM violet, Workspace amber).
   * - Label is derived from `id` via SECTION_LABELS — these are the
   *   real section names the user sees in the sidebar.
   * - Click anywhere on the row toggles collapse; chevron rotates.
   * - Icons-only collapsed mode (lg:w-16) hides labels and renders the
   *   children directly with no header at all (same as before).
   */
  const SECTION_LABELS: Record<string, string> = {
    bookmarks: 'Bookmarks',
    pinned: 'Pinned',
    clients: 'Clients',
    kols: 'KOLs',
    crm: 'Sales / CRM',
    resources: 'Resources',
    measurement: 'Measurement',
    logistics: 'Logistics',
    admin: 'Admin',
  };
  const SECTION_HUES: Record<string, string> = {
    bookmarks: 'bg-amber-500',
    pinned: 'bg-amber-500',
    clients: 'bg-sky-500',
    kols: 'bg-violet-500',
    crm: 'bg-violet-500',
    resources: 'bg-amber-500',
    measurement: 'bg-emerald-500',
    logistics: 'bg-sky-500',
    admin: 'bg-rose-500',
  };

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
    const label = SECTION_LABELS[id] || id.replace(/[-_]/g, ' ');
    const hue = SECTION_HUES[id] || 'bg-ink-warm-300';
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => toggleSection(id)}
          className="w-full flex items-center gap-2 px-2 py-1 group hover:opacity-80"
          title={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${hue} shrink-0`} />
          <span className="text-[10px] font-semibold uppercase text-ink-warm-700 tracking-[0.18em] leading-none">
            {label}
          </span>
          <div className="flex-1" />
          <ChevronDown
            className={`h-3 w-3 text-ink-warm-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
          />
        </button>
        {!isCollapsed && <div className="space-y-1">{children}</div>}
      </div>
    );
  };

  return (
    <div className="h-screen bg-cream-100 flex flex-col">
      {/* v11 (2026-06-01): topbar consolidated INTO the sidebar on desktop.
          On MOBILE only (`lg:hidden`), a thin 48px topbar strip houses the
          hamburger so it sits in flow above content — fixes the overlay
          issue where a floating button covered the PageHeader at narrow
          widths.

          - Desktop (lg+):    no topbar; sidebar's own header rail has the logo.
          - Mobile:           48px topbar with hamburger + condensed wordmark. */}
      <div className="lg:hidden flex-shrink-0 h-12 bg-cream-50/85 backdrop-blur-md border-b border-cream-200 px-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-10 w-10 p-0 -ml-1"
          onClick={() => setIsMobileSidebarOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5 text-ink-warm-700" />
        </Button>
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <Image src="/images/logo.png" alt="Holo Hive logo" width={24} height={24} />
          <span className="text-sm font-semibold text-ink-warm-900 tracking-tight truncate">Holo Hive</span>
        </Link>
      </div>
      <div className="flex flex-1 overflow-hidden relative">
        {/* [Mobile, May 2026] Backdrop overlay — only renders when the
            mobile sidebar is open. Click outside to close. Hidden on
            lg+ since the sidebar is docked there. */}
        {isMobileSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        {/* Sidebar — desktop docks it, mobile slides it in from the left
            as an overlay. On mobile the collapsed state is bypassed
            (always full width when shown). */}
        <aside
          className={`
            ${isSidebarCollapsed ? 'lg:w-16' : 'lg:w-64'}
            w-64 bg-white border-r border-cream-200 flex-shrink-0
            transition-all duration-300 ease-in-out
            fixed lg:relative h-full top-0 left-0 z-50 lg:z-auto
            ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="flex flex-col h-full">
            {/* v11 (2026-06-01): Unified sidebar header.
                - Logo + "Holo Hive" wordmark + version badge — top of
                  the sidebar on all viewports (no separate topbar).
                - Mobile close X — only on mobile, mirrors hamburger UX.
                - Collapsed-mode (lg:w-16): logo only, hide wordmark + badge. */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 flex-shrink-0">
              <Link href="/dashboard" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
                <Image src="/images/logo.png" alt="Holo Hive logo" width={32} height={32} priority />
                {!isSidebarCollapsed && (
                  <>
                    <span className="text-base font-semibold text-ink-warm-900 tracking-tight truncate">Holo Hive</span>
                    {latestVersion && (
                      <Badge
                        variant="secondary"
                        className="cursor-pointer bg-brand/10 text-brand hover:bg-brand/20 transition-colors text-[10px] px-1.5 py-0 shrink-0"
                        onClick={(e) => { e.preventDefault(); setIsChangelogOpen(true); }}
                      >
                        v{latestVersion}
                      </Badge>
                    )}
                  </>
                )}
              </Link>
              {/* Mobile close — hidden on lg+. */}
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden h-9 w-9 p-0 shrink-0"
                onClick={() => setIsMobileSidebarOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
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

              {/* Pinned Section — HQ + Dashboard. Replaces the old
                  Dashboard/Initiatives top group; HQ promoted out of
                  Workspace per the 2026-06-19 sidebar reorg. HQ's
                  sub-nav (All Tasks / Deliverables / Automations)
                  renders directly below it when the user is on an
                  HQ child route. */}
              {!guestHideAlways && (
                <CollapsibleSection id="pinned" icon={Star}>
                  <NavItem href="/tasks" icon={ListTodo} label="HQ" />
                  {!isSidebarCollapsed && pathname.startsWith('/tasks') && (
                    <div className="pl-6 space-y-0.5">
                      <SubNavItem href="/tasks" icon={ListTodo} label="All Tasks" exact />
                      <SubNavItem href="/tasks/deliverables" icon={Target} label="Deliverables" />
                      {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                        <SubNavItem href="/tasks/automations" icon={Zap} label="Automations" exact />
                      )}
                    </div>
                  )}
                  <NavItem href="/dashboard" icon={Compass} label="Dashboard" />
                </CollapsibleSection>
              )}

              {/* Clients Section — Clients + Campaigns + Delivery Logs.
                  Per the 2026-06-19 reorg: Campaigns moved out of the
                  KOLs section, Delivery Logs out of Documents, Team
                  out (now under Resources). */}
              {!guestHideSection(['/clients', '/campaigns', '/delivery-logs']) && (
                <CollapsibleSection id="clients" icon={Users}>
                  {!guestHide('/clients') && <NavItem href="/clients" icon={Users} label="Clients" />}
                  {!guestHide('/campaigns') && <NavItem href="/campaigns" icon={Megaphone} label="Campaigns" />}
                  {!guestHide('/delivery-logs') && <NavItem href="/delivery-logs" icon={ClipboardList} label="Delivery Logs" />}
                </CollapsibleSection>
              )}

              {/* KOLs Section — just KOLs + Lists; Campaigns moved to
                  the Clients section. */}
              {!guestHideSection(['/kols', '/lists']) && (
                <CollapsibleSection id="kols" icon={Crown}>
                  {!guestHide('/kols') && <NavItem href="/kols" icon={Crown} label="KOLs" />}
                  {!guestHide('/lists') && <NavItem href="/lists" icon={List} label="Lists" />}
                </CollapsibleSection>
              )}

              {/* Sales / CRM Section — pipeline + relationship
                  surfaces only. Submissions / Meetings / TG Chats
                  moved to Logistics per the 2026-06-19 reorg. */}
              {!guestHideSection(['/crm/sales-pipeline', '/crm/network', '/crm/contacts', '/intelligence', '/analytics']) && (
                <CollapsibleSection id="crm" icon={DollarSign}>
                  {!guestHide('/crm/sales-pipeline') && <NavItem href="/crm/sales-pipeline" icon={Target} label="Sales" />}
                  {!guestHide('/crm/network') && <NavItem href="/crm/network" icon={Handshake} label="Network" />}
                  {!guestHide('/crm/contacts') && <NavItem href="/crm/contacts" icon={UserPlus} label="Contacts" />}
                  {!guestHide('/intelligence') && <NavItem href="/intelligence" icon={Radar} label="Intelligence" />}
                  {/* Analytics — team dashboard with KPIs, pipeline funnel,
                      owner workload, recent activity, health alerts.
                      Reads /api/analytics/dashboard in one call. */}
                  {!guestHide('/analytics') && <NavItem href="/analytics" icon={BarChart3} label="Analytics" />}
                </CollapsibleSection>
              )}

              {/* Resources Section — Templates, SOPs, Initiatives,
                  Team, Expenses, Links. The "stuff we use to do the
                  work" bucket per the 2026-06-19 reorg. Templates +
                  SOPs are also reachable from the HQ sub-nav, but
                  they get top-level entries here for direct access. */}
              {!guestHideAlways && (
                <CollapsibleSection id="resources" icon={BookOpen}>
                  <NavItem href="/templates" icon={MessageSquare} label="Templates" />
                  {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && <NavItem href="/sops" icon={BookOpen} label="SOPs" />}
                  <NavItem href="/initiatives" icon={Target} label="Initiatives" />
                  {!isGuest && <NavItem href="/team" icon={Shield} label="Team" />}
                  {/* [Expenses v1, 2026-05-29] Super-admin only. Reimbursable
                      spend tracking with recurrence (daily/weekly/monthly
                      instance generation via cron) + per-instance paid
                      tracking + receipt attachments. */}
                  {userProfile?.role === 'super_admin' && <NavItem href="/expenses" icon={DollarSign} label="Expenses" />}
                  {!guestHide('/links') && <NavItem href="/links" icon={Link2} label="Links" />}
                </CollapsibleSection>
              )}

              {/* Measurement Section — Mindshare + Wallet Analytics.
                  Admin-only audience-insight tools. */}
              {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                <CollapsibleSection id="measurement" icon={TrendingUp}>
                  <NavItem href="/mindshare" icon={TrendingUp} label="Mindshare" />
                  {/* [Wallet Analytics v1, May 2026] Admin-only campaign-
                      participant intelligence — imported from the
                      Data Bank xlsx (1,197 wallets). */}
                  <NavItem href="/wallets" icon={Wallet} label="Wallet Analytics" />
                </CollapsibleSection>
              )}

              {/* Logistics Section — Reminders + the "things that need
                  to happen" bucket: Submissions, Meetings, TG Chats,
                  Forms. Pulled out of CRM + Documents + Workspace per
                  the 2026-06-19 reorg. */}
              {!guestHideSection(['/reminders', '/crm/submissions', '/crm/meetings']) && (
                <CollapsibleSection id="logistics" icon={Bell}>
                  <NavItem href="/reminders" icon={Bell} label="Reminders" />
                  {!guestHide('/crm/submissions') && <NavItem href="/crm/submissions" icon={Inbox} label="Submissions" />}
                  {!guestHide('/crm/meetings') && <NavItem href="/crm/meetings" icon={Calendar} label="Meetings" />}
                  {userProfile?.role === 'super_admin' && <NavItem href="/crm/telegram" icon={MessageSquare} label="TG Chats" />}
                  {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && <NavItem href="/forms" icon={ClipboardList} label="Forms" />}
                </CollapsibleSection>
              )}

              {/* Admin Section — hidden for guests */}
              {!guestHideAlways && (
                <CollapsibleSection id="admin" icon={Settings}>
                  {/* "Admin Tools" entry — combines Field Options +
                      Claude MCP into a tabbed /admin page. Original
                      routes (/admin/field-options, /mcp) still work for
                      direct linking + bookmarks.

                      [2026-06-08] Archive was promoted out of the
                      Admin Tools tabs into its own NavItem below —
                      it's a destination view (search + restore of
                      archived records), not a config surface, so it
                      reads better as its own sidebar entry. Sitting as
                      the last item in the lowest section also matches
                      the "rarely used, easy to find when needed"
                      mental model for archived content. */}
                  <NavItem href="/admin" icon={Sliders} label="Admin Tools" />
                  {userProfile?.role === 'super_admin' && <NavItem href="/admin/changelog" icon={Sparkles} label="Changelog" />}
                  <NavItem href="/archive" icon={Archive} label="Archive" />
                </CollapsibleSection>
              )}

              </>}
            </nav>
            {/* v11 (2026-06-01): User block — moved here from the old
                top-right of the (now-deleted) topbar. Avatar + name + role
                + dropdown for Settings / Sign out. Collapsed mode shows
                just the avatar.

                Sits above the customize/collapse controls, separated by
                a cream hairline. The whole row is the dropdown trigger
                so users get a big tap target. */}
            {userProfile && (
              <div className="px-3 py-3 border-t border-cream-200 space-y-1">
                {/* [2026-06-11] NotificationBell removed — see comment at top. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`w-full flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-cream-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${isSidebarCollapsed ? 'justify-center' : ''}`}
                      title={isSidebarCollapsed ? `${userProfile.name || userProfile.email || 'User'}` : undefined}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        {userProfile?.profile_photo_url ? (
                          <AvatarImage src={userProfile.profile_photo_url} alt={userProfile?.name || userProfile?.email || 'User'} />
                        ) : null}
                        <AvatarFallback className="bg-brand text-white text-xs font-semibold">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                      {!isSidebarCollapsed && (
                        <>
                          <div className="min-w-0 flex-1 text-left leading-tight">
                            <div className="text-[13px] font-semibold text-ink-warm-900 truncate">
                              {userProfile.name || userProfile.email}
                            </div>
                            <div className="text-[10px] text-ink-warm-500 mono uppercase tracking-[0.1em] truncate">
                              {userProfile.role || 'member'}
                            </div>
                          </div>
                          <ChevronDown className="h-3.5 w-3.5 text-ink-warm-400 shrink-0" />
                        </>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={isSidebarCollapsed ? 'start' : 'end'} side="top">
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
            )}
            {/* Bottom controls: customize + collapse. Side-by-side when
                expanded, stacked when collapsed (icons-only). Customize
                hidden for guests since they can't meaningfully use it
                (their nav is permission-gated to a tiny subset). */}
            <div className="px-3 py-2 border-t border-cream-200 flex-shrink-0">
              <div className={`flex ${isSidebarCollapsed ? 'flex-col gap-1' : 'justify-center gap-1'}`}>
                {!guestHideAlways && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCustomizeOpen(true)}
                    className="hover:bg-cream-100 w-auto px-2"
                    title="Customize sidebar"
                    aria-label="Customize sidebar"
                  >
                    {/* Icon-only — text label removed at user request 2026-05-05.
                        The title attribute provides hover affordance, aria-label
                        keeps screen readers informed. */}
                    <SlidersHorizontal className="h-4 w-4 text-ink-warm-500" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSidebarToggle}
                  className="hover:bg-cream-100 w-auto px-2"
                  title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {isSidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4 text-ink-warm-500" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4 text-ink-warm-500" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </aside>
        {/* Main Content — [Mobile] min-w-0 so flex shrinks correctly
            when the sidebar floats above it on mobile. Reduced padding
            on smallest screens (p-4) so cards/tables have more room. */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">{children}</main>
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