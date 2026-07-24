'use client';

/**
 * SidebarCustomize — registry of every bookmark/hide-able sidebar item
 * and the dialog the user opens to manage them.
 *
 * Why a registry separate from the rendered sidebar JSX:
 *   - The customize dialog needs to iterate every item to show toggles.
 *   - The Bookmarks section at the top of the sidebar needs to look up
 *     a bookmarked href's icon + label to render it.
 *   - Centralizing these in one place avoids the alternative — a giant
 *     refactor of the existing JSX into data — while still giving us
 *     one source of truth for "what items exist."
 *
 * Visibility gating (role, guest, page-key) lives in the registry as
 * declarative flags so isItemAvailable() in the parent can mirror the
 * existing if-checks without us having to duplicate the predicates.
 */

import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Star,
  Eye,
  EyeOff,
  RotateCcw,
  // Item icons (mirror Sidebar.tsx's imports)
  Users, Megaphone, Crown, List, Building2, Shield, MessageSquare, Sparkles,
  FileText, ClipboardList, Sliders, TrendingUp, Handshake, UserPlus,
  Archive, Link2, BookOpen, CheckCircle, ListTodo, Target, Inbox,
  Calendar, Bell, Radar, Bot, BarChart3, Settings, Compass, Wallet,
  DollarSign,
} from 'lucide-react';

export type NavItemDef = {
  /** URL the item links to. Doubles as the unique key in bookmark/hide
   *  state — never change a registered href without a migration. */
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Display group inside the customize dialog. Match the SectionDivider
   *  groupings in Sidebar.tsx so the dialog looks like the sidebar. */
  section: string;
  /** Hide from guests entirely — used for items like Holo GPT, Team,
   *  Templates, the whole Admin section. */
  notForGuest?: boolean;
  /** Required role tier. 'admin' = admin OR super_admin; 'super_admin'
   *  = super_admin only. Mirrors existing role checks at call sites. */
  requiredRole?: 'admin' | 'super_admin';
  /** Page-key for the useGuestPermissions canView() check. When present,
   *  guests who don't have view permission for this key get filtered out
   *  in the customize dialog (and from their Bookmarks render). */
  pageKey?: string;
};

/**
 * Single source of truth for every bookmark/hide-able nav item.
 *
 * Order = display order in the customize dialog (sections grouped as
 * encountered). Sub-nav items under /tasks are intentionally excluded
 * — they're tied to the parent and bookmarking them individually would
 * be confusing.
 *
 * IMPORTANT: only include items that are ACTUALLY rendered by
 * Sidebar.tsx for some user. Items that are globally commented out
 * (e.g. /chat / Holo GPT, removed 2026-05-05) must be omitted here too
 * — otherwise they'd appear in the customize dialog as toggleable but
 * wouldn't show up in the sidebar even when bookmarked, since the
 * Bookmarks section is gated on the same registry. If you re-enable
 * such an item in Sidebar.tsx, add it back here. */
export const NAV_REGISTRY: NavItemDef[] = [
  // Pinned — HQ + Dashboard. Top-of-sidebar always-visible bucket
  // (2026-06-19 reorg).
  { href: '/tasks', label: 'HQ', icon: ListTodo, section: 'Pinned', notForGuest: true },
  { href: '/dashboard', label: 'Dashboard', icon: Compass, section: 'Pinned', notForGuest: true },

  // Clients — Clients + Campaigns + Delivery Logs.
  { href: '/clients', label: 'Clients', icon: Users, section: 'Clients', pageKey: '/clients' },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone, section: 'Clients', pageKey: '/campaigns' },
  { href: '/campaigns/overview', label: 'Campaign Overview', icon: BarChart3, section: 'Clients', pageKey: '/campaigns/overview' },
  { href: '/delivery-logs', label: 'Delivery Logs', icon: ClipboardList, section: 'Clients', pageKey: '/delivery-logs' },

  // KOLs — KOLs + Lists (Campaigns moved to Clients).
  { href: '/kols', label: 'KOLs', icon: Crown, section: 'KOLs', pageKey: '/kols' },
  { href: '/lists', label: 'Lists', icon: List, section: 'KOLs', pageKey: '/lists' },

  // Sales / CRM — pipeline + relationship surfaces only.
  { href: '/crm/sales-pipeline', label: 'Sales', icon: Target, section: 'Sales / CRM', pageKey: '/crm/sales-pipeline' },
  { href: '/crm/network', label: 'Network', icon: Handshake, section: 'Sales / CRM', pageKey: '/crm/network' },
  { href: '/crm/contacts', label: 'Contacts', icon: UserPlus, section: 'Sales / CRM', pageKey: '/crm/contacts' },
  { href: '/intelligence', label: 'Intelligence', icon: Radar, section: 'Sales / CRM', pageKey: '/intelligence' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, section: 'Sales / CRM', pageKey: '/analytics' },

  // Resources — Templates, SOPs, Initiatives, Team, Expenses, Links.
  { href: '/templates', label: 'Templates', icon: MessageSquare, section: 'Resources', notForGuest: true },
  { href: '/sops', label: 'SOPs', icon: BookOpen, section: 'Resources', requiredRole: 'admin' },
  { href: '/initiatives', label: 'Initiatives', icon: Target, section: 'Resources', notForGuest: true },
  { href: '/team', label: 'Team', icon: Shield, section: 'Resources', notForGuest: true },
  // [Expenses v1, 2026-05-29] Super-admin only.
  { href: '/expenses', label: 'Expenses', icon: DollarSign, section: 'Resources', requiredRole: 'super_admin' },
  { href: '/links', label: 'Links', icon: Link2, section: 'Resources', pageKey: '/links' },

  // Measurement — Mindshare + Wallet Analytics. Admin-only.
  { href: '/mindshare', label: 'Mindshare', icon: TrendingUp, section: 'Measurement', requiredRole: 'admin' },
  { href: '/wallets', label: 'Wallet Analytics', icon: Wallet, section: 'Measurement', requiredRole: 'admin' },

  // Logistics — Reminders + Submissions + Meetings + TG Chats + Forms.
  { href: '/reminders', label: 'Reminders', icon: Bell, section: 'Logistics' },
  { href: '/crm/submissions', label: 'Submissions', icon: Inbox, section: 'Logistics', pageKey: '/crm/submissions' },
  { href: '/crm/meetings', label: 'Meetings', icon: Calendar, section: 'Logistics', pageKey: '/crm/meetings' },
  { href: '/crm/telegram', label: 'TG Chats', icon: MessageSquare, section: 'Logistics', requiredRole: 'super_admin' },
  { href: '/forms', label: 'Forms', icon: ClipboardList, section: 'Logistics', requiredRole: 'admin' },

  // Admin Tools — combines Field Options + Claude MCP into one tabbed
  // page at /admin. Original routes (/admin/field-options, /mcp) still
  // work for direct links + bookmarks but are no longer surfaced
  // separately in the sidebar.
  { href: '/admin', label: 'Admin Tools', icon: Sliders, section: 'Admin', notForGuest: true },
  { href: '/admin/changelog', label: 'Changelog', icon: Sparkles, section: 'Admin', requiredRole: 'super_admin' },
  // [2026-06-08] Archive promoted out of the Admin Tools tabs to its
  // own sidebar entry — see Sidebar.tsx for the rationale.
  { href: '/archive', label: 'Archive', icon: Archive, section: 'Admin', notForGuest: true },
];

/** O(1) lookup by href, used when rendering the Bookmarks section. */
export const NAV_BY_HREF: Record<string, NavItemDef> =
  NAV_REGISTRY.reduce((acc, item) => { acc[item.href] = item; return acc; }, {} as Record<string, NavItemDef>);

export type AvailabilityCtx = {
  isGuest: boolean;
  role: string | undefined;
  /** From useGuestPermissions().canView. Returns true when guest can see. */
  canView: (pageKey: string) => boolean;
  /** From useGuestPermissions().hasMemberGrant — per-member extra-access
   *  grants (e.g. /sops). Optional so older callers stay valid. */
  hasMemberGrant?: (pageKey: string) => boolean;
};

/**
 * Mirror of the visibility checks in Sidebar.tsx. Returns true if the
 * current user has access to the given href.
 *
 * Keep this in sync if you change role/guest gating in Sidebar.tsx — a
 * mismatch would let a user "bookmark" something they can't actually
 * navigate to (or vice versa). */
export function isItemAvailable(item: NavItemDef, ctx: AvailabilityCtx): boolean {
  if (item.notForGuest && ctx.isGuest) return false;
  if (item.requiredRole === 'admin' && !(ctx.role === 'admin' || ctx.role === 'super_admin' || ctx.hasMemberGrant?.(item.href))) return false;
  if (item.requiredRole === 'super_admin' && ctx.role !== 'super_admin') return false;
  // pageKey + isGuest: only block if guest user explicitly lacks access.
  // Non-guests aren't subject to canView; they see everything role-allowed.
  if (item.pageKey && ctx.isGuest && !ctx.canView(item.pageKey)) return false;
  return true;
}

interface SidebarCustomizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarkedHrefs: string[];
  hiddenHrefs: string[];
  onToggleBookmark: (href: string) => void;
  onToggleHidden: (href: string) => void;
  onReset: () => void;
  ctx: AvailabilityCtx;
}

export function SidebarCustomizeDialog({
  open,
  onOpenChange,
  bookmarkedHrefs,
  hiddenHrefs,
  onToggleBookmark,
  onToggleHidden,
  onReset,
  ctx,
}: SidebarCustomizeDialogProps) {
  // Group available items by section. Filtering happens here so a guest
  // never sees an item they can't access in the customize dialog.
  const sections = useMemo(() => {
    const grouped: Record<string, NavItemDef[]> = {};
    const order: string[] = [];
    for (const item of NAV_REGISTRY) {
      if (!isItemAvailable(item, ctx)) continue;
      if (!grouped[item.section]) {
        grouped[item.section] = [];
        order.push(item.section);
      }
      grouped[item.section].push(item);
    }
    return order.map(name => ({ name, items: grouped[name] }));
  }, [ctx]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* v11 dialog: max-h-[85vh] + flex-col, inner scroll surface
          flex-1 overflow-y-auto, footer pinned with border-t. Matches
          IntelligenceAlertsDialog / IntelligenceScheduleDialog. The
          icon now sits inside DialogTitle (not a side div) so it
          aligns with the title baseline like other v11 dialogs.
          2026-06-03. */}
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-brand" />
            Customize Sidebar
          </DialogTitle>
          <DialogDescription>
            Star items to pin them to the top. Hide items you don't use.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4 py-2">
          {sections.map(({ name, items }) => (
            <div key={name}>
              <h4 className="text-[11px] font-semibold text-ink-warm-500 uppercase tracking-wider mb-1.5 px-2">
                {name}
              </h4>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isBookmarked = bookmarkedHrefs.includes(item.href);
                  const isHidden = hiddenHrefs.includes(item.href);
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.href}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-cream-50"
                    >
                      <div className={`flex items-center gap-2 text-sm ${isHidden ? 'text-ink-warm-400 line-through' : 'text-ink-warm-800'}`}>
                        <Icon className={`h-4 w-4 ${isHidden ? 'text-ink-warm-300' : 'text-ink-warm-500'}`} />
                        <span>{item.label}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => onToggleBookmark(item.href)}
                          title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                        >
                          <Star
                            className={`h-3.5 w-3.5 ${
                              isBookmarked
                                ? 'fill-yellow-400 text-yellow-500'
                                : 'text-ink-warm-300'
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => onToggleHidden(item.href)}
                          title={isHidden ? 'Show in sidebar' : 'Hide from sidebar'}
                        >
                          {isHidden ? (
                            <EyeOff className="h-3.5 w-3.5 text-rose-500" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 text-ink-warm-300" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0 flex-row justify-between sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={bookmarkedHrefs.length === 0 && hiddenHrefs.length === 0}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
          <Button variant="brand" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
