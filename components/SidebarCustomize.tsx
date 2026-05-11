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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Star,
  Eye,
  EyeOff,
  RotateCcw,
  // Item icons (mirror Sidebar.tsx's imports)
  Users, Megaphone, Crown, List, Building2, Shield, MessageSquare, Sparkles,
  FileText, ClipboardList, Sliders, TrendingUp, Handshake, UserPlus,
  Archive, Link2, BookOpen, CheckCircle, ListTodo, Target, Inbox,
  Calendar, Bell, Radar, Bot, BarChart3, Settings, Compass,
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
  // Priority Dashboard at the very top — company-operating view that
  // anyone in the team can open for visibility (added 2026-05-07).
  { href: '/dashboard', label: 'Dashboard', icon: Compass, section: 'Top', notForGuest: true },

  { href: '/team', label: 'Team', icon: Shield, section: 'People', notForGuest: true },
  { href: '/clients', label: 'Clients', icon: Users, section: 'People', pageKey: '/clients' },

  { href: '/kols', label: 'KOLs', icon: Crown, section: 'KOLs', pageKey: '/kols' },
  { href: '/lists', label: 'Lists', icon: List, section: 'KOLs', pageKey: '/lists' },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone, section: 'KOLs', pageKey: '/campaigns' },

  { href: '/crm/sales-pipeline', label: 'Sales', icon: Target, section: 'CRM', pageKey: '/crm/sales-pipeline' },
  { href: '/intelligence', label: 'Intelligence', icon: Radar, section: 'CRM', pageKey: '/intelligence' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, section: 'CRM', pageKey: '/analytics' },
  { href: '/crm/network', label: 'Network', icon: Handshake, section: 'CRM', pageKey: '/crm/network' },
  { href: '/crm/contacts', label: 'Contacts', icon: UserPlus, section: 'CRM', pageKey: '/crm/contacts' },
  { href: '/crm/submissions', label: 'Submissions', icon: Inbox, section: 'CRM', pageKey: '/crm/submissions' },
  { href: '/crm/meetings', label: 'Meetings', icon: Calendar, section: 'CRM', pageKey: '/crm/meetings' },
  { href: '/crm/telegram', label: 'TG Chats', icon: MessageSquare, section: 'CRM', requiredRole: 'super_admin' },

  { href: '/daily-standup', label: 'Daily Stand-Up', icon: CheckCircle, section: 'Workspace' },
  { href: '/tasks', label: 'HQ', icon: ListTodo, section: 'Workspace' },
  { href: '/reminders', label: 'Reminders', icon: Bell, section: 'Workspace' },

  { href: '/delivery-logs', label: 'Delivery Logs', icon: ClipboardList, section: 'Documents', pageKey: '/delivery-logs' },
  { href: '/mindshare', label: 'Mindshare', icon: TrendingUp, section: 'Documents', requiredRole: 'admin' },
  { href: '/forms', label: 'Forms', icon: ClipboardList, section: 'Documents', requiredRole: 'admin' },
  { href: '/links', label: 'Links', icon: Link2, section: 'Documents', pageKey: '/links' },
  { href: '/templates', label: 'Templates', icon: MessageSquare, section: 'Documents', notForGuest: true },
  { href: '/sops', label: 'SOPs', icon: BookOpen, section: 'Documents', requiredRole: 'admin' },

  // Admin Tools — combines Field Options + Claude MCP + Archive into one
  // tabbed page at /admin. Original routes (/admin/field-options, /mcp,
  // /archive) still work for direct links + bookmarks but are no longer
  // surfaced separately in the sidebar.
  { href: '/admin', label: 'Admin Tools', icon: Sliders, section: 'Admin', notForGuest: true },
  { href: '/admin/changelog', label: 'Changelog', icon: Sparkles, section: 'Admin', requiredRole: 'super_admin' },
];

/** O(1) lookup by href, used when rendering the Bookmarks section. */
export const NAV_BY_HREF: Record<string, NavItemDef> =
  NAV_REGISTRY.reduce((acc, item) => { acc[item.href] = item; return acc; }, {} as Record<string, NavItemDef>);

export type AvailabilityCtx = {
  isGuest: boolean;
  role: string | undefined;
  /** From useGuestPermissions().canView. Returns true when guest can see. */
  canView: (pageKey: string) => boolean;
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
  if (item.requiredRole === 'admin' && !(ctx.role === 'admin' || ctx.role === 'super_admin')) return false;
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
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand" />
            <DialogTitle>Customize Sidebar</DialogTitle>
          </div>
          <DialogDescription>
            Star items to pin them to the top. Hide items you don't use.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-2">
            {sections.map(({ name, items }) => (
              <div key={name}>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
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
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50"
                      >
                        <div className={`flex items-center gap-2 text-sm ${isHidden ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                          <Icon className={`h-4 w-4 ${isHidden ? 'text-gray-300' : 'text-gray-500'}`} />
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
                                  : 'text-gray-300'
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
                              <EyeOff className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <Eye className="h-3.5 w-3.5 text-gray-300" />
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
        </ScrollArea>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={bookmarkedHrefs.length === 0 && hiddenHrefs.length === 0}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
