'use client';

/**
 * /initiatives — Backlog tab
 *
 * HHP bugs + feature requests, separated from /tasks so client deadlines
 * don't get buried under product feedback. Per the spec (Jdot, 2026-06-08):
 *   • Two item types: Bug + Request (Idea deferred — spec table only
 *     lists those two)
 *   • Lighter pipeline: New → Building → Ready for review → Live
 *   • Live transition gated to reporter + super_admin
 *   • Capture via this tab's + New button OR /bug, /req Telegram
 *     commands (Phase 3)
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Bug, Plus, Search, MoreHorizontal, Edit, Trash2,
  Paperclip, ArrowRight, Undo2, Bookmark, Copy, Check,
  ArrowUpAZ, ArrowDownAZ, Group as GroupIcon, Upload,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  BacklogService,
  type BacklogItem,
  type BacklogType,
  type BacklogArea,
  type BacklogStatus,
  BACKLOG_TYPE_LABELS,
  BACKLOG_AREA_LABELS,
  BACKLOG_STATUS_LABELS,
  getValidTransitions,
} from '@/lib/backlogService';
import BacklogItemDialog from './BacklogItemDialog';
import BacklogImportDialog from './BacklogImportDialog';
import BacklogSettingsDialog from './BacklogSettingsDialog';

// ─── Display helpers ─────────────────────────────────────────────────

// Type → palette tone. Bugs are rose so they read as "something
// broken"; Requests are info-sky so they read as "ask, not break."
const TYPE_TONE: Record<BacklogType, BadgeTone> = {
  bug: 'danger',
  request: 'info',
};

// Status → palette tone. Brand for "actively being worked on" so the
// in-progress row jumps off the page; success for the terminal Live
// state.
const STATUS_TONE: Record<BacklogStatus, BadgeTone> = {
  new: 'neutral',
  building: 'brand',
  ready_for_review: 'warning',
  live: 'success',
};

// Areas all read as neutral chips — no semantic ranking between them.
// Keeping the palette restrained here so type + status pills carry
// the visual weight per row.
const AREA_TONE_CLASS = 'bg-gray-100 text-ink-warm-700';

// Compact "Xd" age label — same convention we use on /initiatives'
// Freshness column. Color comes from the open/closed split, not age.
function ageLabel(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  return `${days}d`;
}

// Attachment counts get fetched in a batch per render so each row
// can show its paperclip chip without N+1 queries.
async function fetchAttachmentCounts(
  itemIds: string[],
): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {};
  const { data } = await (supabase as any)
    .from('backlog_attachments')
    .select('item_id')
    .in('item_id', itemIds);
  const counts: Record<string, number> = {};
  for (const row of (data || []) as Array<{ item_id: string }>) {
    counts[row.item_id] = (counts[row.item_id] || 0) + 1;
  }
  return counts;
}

// Phase 2 — saved-view shape. All view state is reflected into the
// query string so Quazo can bookmark the canonical "open items by age,
// grouped by type" view and any other slice she finds useful.
type SortMode = 'age_asc' | 'age_desc';
type GroupMode = 'none' | 'type' | 'type_area';

// Quazo's view per spec section 7: "Default sort: open items
// (everything not Live) by age, oldest first. Group by Type, then
// Area." Applied via the "Quazo's view" quick-button below.
const QUAZO_PRESET = {
  statusFilter: 'open' as const,
  typeFilter: 'all' as const,
  areaFilter: 'all' as const,
  search: '',
  sort: 'age_asc' as SortMode,
  group: 'type_area' as GroupMode,
};

export default function BacklogTab() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<BacklogItem[]>([]);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Filters + view state. Defaults to "open" (everything not Live)
  // since that's the primary use case — Andy / Quazo open this tab
  // to see what needs attention, not to browse the history of fixed
  // bugs. All view state hydrates from the URL on mount and persists
  // back on change so bookmarking works.
  const [statusFilter, setStatusFilter] = useState<BacklogStatus | 'open' | 'all'>('open');
  const [typeFilter, setTypeFilter] = useState<BacklogType | 'all'>('all');
  const [areaFilter, setAreaFilter] = useState<BacklogArea | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('age_desc');
  const [group, setGroup] = useState<GroupMode>('none');
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // Dialog state — null = closed, 'new' = create mode, object = edit.
  const [dialogState, setDialogState] = useState<null | 'new' | BacklogItem>(null);
  const [deletePending, setDeletePending] = useState<BacklogItem | null>(null);
  // Phase 6: bulk-import dialog. Super_admin-only; trigger gated below.
  const [importOpen, setImportOpen] = useState(false);
  // Phase 6.5: settings dialog (channel ID). Super_admin-only.
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await BacklogService.list({});
      setItems(rows);
      const counts = await fetchAttachmentCounts(rows.map(r => r.id));
      setAttachmentCounts(counts);
    } catch (err) {
      toast({
        title: 'Failed to load backlog',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // ─── URL state sync (Phase 2) ─────────────────────────────────────
  //
  // On mount: hydrate state from query params if present. We keep
  // both the parent tab param (`?tab=backlog`) and the backlog-
  // specific view params (`?status=open&sort=age_asc&...`) so a
  // single bookmark restores the whole context.
  //
  // The mount-only effect avoids a sync loop: filter changes call
  // router.replace which would re-trigger if this effect depended
  // on searchParams. Same pattern /dashboard uses for tab state.
  useEffect(() => {
    const s = searchParams.get('status');
    if (s === 'open' || s === 'all' || s === 'new' || s === 'building' || s === 'ready_for_review' || s === 'live') {
      setStatusFilter(s);
    }
    const t = searchParams.get('type');
    if (t === 'all' || t === 'bug' || t === 'request') setTypeFilter(t);
    const a = searchParams.get('area');
    if (a && (a === 'all' || a in BACKLOG_AREA_LABELS)) {
      setAreaFilter(a as BacklogArea | 'all');
    }
    const q = searchParams.get('q');
    if (q) setSearch(q);
    const so = searchParams.get('sort');
    if (so === 'age_asc' || so === 'age_desc') setSort(so);
    const g = searchParams.get('group');
    if (g === 'none' || g === 'type' || g === 'type_area') setGroup(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 4: deep-link support. When the URL has `?id=<item_id>`
  // (used by notification links + Telegram confirmations), fetch
  // that item and open the dialog on mount. We don't strip the param
  // from the URL afterward — the same link is still valid for the
  // back button.
  useEffect(() => {
    const deepLinkId = searchParams.get('id');
    if (!deepLinkId) return;
    BacklogService.getById(deepLinkId).then(it => {
      if (it) setDialogState(it);
    }).catch(err => {
      console.error('Deep-link item fetch failed:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect filters into the URL on change. router.replace (not push)
  // so the back button doesn't accumulate one entry per filter click.
  // Skips the initial render (when params already match) by hashing
  // the would-be URL and comparing to the current path.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'backlog');
    // Omit defaults to keep the URL minimal — bookmarks read cleaner.
    statusFilter === 'open' ? params.delete('status') : params.set('status', statusFilter);
    typeFilter === 'all' ? params.delete('type') : params.set('type', typeFilter);
    areaFilter === 'all' ? params.delete('area') : params.set('area', areaFilter);
    search.trim() ? params.set('q', search.trim()) : params.delete('q');
    sort === 'age_desc' ? params.delete('sort') : params.set('sort', sort);
    group === 'none' ? params.delete('group') : params.set('group', group);
    const nextUrl = `/initiatives?${params.toString()}`;
    // Only replace if the URL actually changed — saves a needless
    // history mutation each render.
    if (typeof window !== 'undefined' && nextUrl !== `${window.location.pathname}${window.location.search}`) {
      router.replace(nextUrl, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, areaFilter, search, sort, group]);

  // Client-side filtering + sorting — the spec calls for sub-second
  // response on filter toggles and the backlog is small (low hundreds
  // of rows forever). One server query + in-memory narrowing beats a
  // fresh round-trip per chip click.
  const filtered = useMemo(() => {
    return items.filter(it => {
      if (statusFilter === 'open' ? it.status === 'live' : statusFilter !== 'all' && it.status !== statusFilter) {
        return false;
      }
      if (typeFilter !== 'all' && it.type !== typeFilter) return false;
      if (areaFilter !== 'all' && it.area !== areaFilter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        if (
          !it.title.toLowerCase().includes(s)
          && !it.description.toLowerCase().includes(s)
        ) return false;
      }
      return true;
    }).sort((a, b) => {
      // Sort honors the URL-controlled `sort` state. The implicit
      // "live items always at the bottom" rule still applies because
      // Quazo's view explicitly filters those out and other views
      // typically want recent activity on top regardless of status.
      if (sort === 'age_asc') {
        // Oldest first — Quazo's "what's been sitting around" view.
        return a.created_at.localeCompare(b.created_at);
      }
      // age_desc — newest first, the conventional default.
      return b.created_at.localeCompare(a.created_at);
    });
  }, [items, statusFilter, typeFilter, areaFilter, search, sort]);

  // Phase 2 — grouped rendering for Quazo's view. When group is set,
  // we render section headers between row groups. Composite keys
  // ("bug · content_dashboard") flatten the spec's "Type then Area"
  // request into a single pass — much simpler than nested sections,
  // and reads identically to a CMs eye.
  const grouped = useMemo<Array<{ key: string; label: string; items: BacklogItem[] }>>(() => {
    if (group === 'none') return [{ key: 'all', label: '', items: filtered }];
    const map = new Map<string, BacklogItem[]>();
    const labels = new Map<string, string>();
    for (const it of filtered) {
      const key = group === 'type'
        ? it.type
        : `${it.type}::${it.area}`;
      const label = group === 'type'
        ? BACKLOG_TYPE_LABELS[it.type]
        : `${BACKLOG_TYPE_LABELS[it.type]} · ${BACKLOG_AREA_LABELS[it.area]}`;
      if (!map.has(key)) {
        map.set(key, []);
        labels.set(key, label);
      }
      map.get(key)!.push(it);
    }
    // Stable group order: bugs before requests, then alpha by area
    // label. Matches how Quazo writes the summary (bugs at top).
    const groupOrder = (key: string): number => {
      const [t, a] = key.split('::');
      const typeRank = t === 'bug' ? 0 : 1;
      const areaLabel = labels.get(key) || '';
      return typeRank * 1000 + areaLabel.charCodeAt(areaLabel.indexOf('·') + 2 || 0);
    };
    return Array.from(map.entries())
      .sort((a, b) => groupOrder(a[0]) - groupOrder(b[0]))
      .map(([key, items]) => ({ key, label: labels.get(key) || key, items }));
  }, [filtered, group]);

  const statusCounts = useMemo(() => {
    const counts = { all: items.length, open: 0, new: 0, building: 0, ready_for_review: 0, live: 0 };
    for (const it of items) {
      if (it.status !== 'live') counts.open++;
      counts[it.status]++;
    }
    return counts;
  }, [items]);

  // ─── Status transition helper ────────────────────────────────────
  // Quick-action menu items use this to bump status in one click.
  // Surfaces the actor's role so the service layer can enforce the
  // Live-transition gate consistently with the UI.
  //
  // Phase 4: a transition into ready_for_review fires the reporter-
  // verify notification + Telegram DM via /api/backlog/notify-verify.
  // The endpoint is idempotent (re-toggling won't spam), so we don't
  // need to track which items we've already pinged.
  const transition = async (item: BacklogItem, next: BacklogStatus) => {
    if (!userProfile) return;
    try {
      await BacklogService.transitionStatus(item.id, next, {
        id: userProfile.id,
        role: userProfile.role ?? null,
      });
      toast({
        title: `Moved to ${BACKLOG_STATUS_LABELS[next]}`,
        description: item.title,
      });
      if (next === 'ready_for_review') {
        // Fire-and-forget — the user shouldn't wait for the Telegram
        // round-trip. Errors get surfaced as a toast but don't block.
        fetch('/api/backlog/notify-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: item.id }),
        }).catch(err => {
          console.error('Notify-verify failed:', err);
        });
      }
      await refresh();
    } catch (err) {
      toast({
        title: 'Transition failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletePending) return;
    try {
      await BacklogService.delete(deletePending.id);
      toast({ title: 'Item deleted', description: deletePending.title });
      setDeletePending(null);
      await refresh();
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-2xl rounded-md" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Filter bar ─────────────────────────────────────────────
          Status as the primary filter via the Tabs primitive (same
          chrome as /clients' Active/Ad-hoc/Inactive filter). 'Open'
          gets the featured brand color since that's where the
          attention lives 95% of the time. Secondary filters (type +
          area + search) inline to the right. */}
      <Card className="border-cream-200 overflow-hidden">
        <div className="p-3 border-b border-cream-100 flex items-center gap-2 flex-wrap">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as BacklogStatus | 'open' | 'all')}>
            <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200 flex-wrap">
              <TabsTrigger
                value="open"
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm px-3 py-1.5 text-ink-warm-500"
              >
                Open
                <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{statusCounts.open}</span>
              </TabsTrigger>
              <TabsTrigger
                value="new"
                className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm px-3 py-1.5 text-ink-warm-500"
              >
                New
                <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{statusCounts.new}</span>
              </TabsTrigger>
              <TabsTrigger
                value="building"
                className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm px-3 py-1.5 text-ink-warm-500"
              >
                Building
                <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{statusCounts.building}</span>
              </TabsTrigger>
              <TabsTrigger
                value="ready_for_review"
                className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm px-3 py-1.5 text-ink-warm-500"
              >
                Ready
                <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{statusCounts.ready_for_review}</span>
              </TabsTrigger>
              <TabsTrigger
                value="live"
                className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm px-3 py-1.5 text-ink-warm-500"
              >
                Live
                <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{statusCounts.live}</span>
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm px-3 py-1.5 text-ink-warm-500"
              >
                All
                <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{statusCounts.all}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Type select */}
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as BacklogType | 'all')}>
            <SelectTrigger className="h-9 w-32 text-sm focus-brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="request">Request</SelectItem>
            </SelectContent>
          </Select>

          {/* Area select */}
          <Select value={areaFilter} onValueChange={(v) => setAreaFilter(v as BacklogArea | 'all')}>
            <SelectTrigger className="h-9 w-44 text-sm focus-brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {(Object.keys(BACKLOG_AREA_LABELS) as BacklogArea[]).map(a => (
                <SelectItem key={a} value={a}>{BACKLOG_AREA_LABELS[a]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
            <Input
              placeholder="Search title or description..."
              className="pl-10 h-9 focus-brand"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Super-admin-only Settings gear — Phase 6.5. Lives left
              of Import + New so it's findable but doesn't fight the
              primary CTAs for attention. Iconic to keep the toolbar
              compact. */}
          {userProfile?.role === 'super_admin' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0 ml-auto"
              onClick={() => setSettingsOpen(true)}
              title="Backlog settings"
              aria-label="Backlog settings"
            >
              <SettingsIcon className="h-4 w-4 text-ink-warm-600" />
            </Button>
          )}
          {/* Super-admin-only bulk import — Phase 6 of the spec. Sits
              left of the New-item primary CTA so the import path is
              findable but secondary. Hidden for everyone else; the
              regular New-item button is plenty. */}
          {userProfile?.role === 'super_admin' && (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => setImportOpen(true)}
              title="Bulk-create items from a paste"
            >
              <Upload className="h-4 w-4 mr-1.5" />Import
            </Button>
          )}
          <Button
            size="sm"
            variant="brand"
            className={`h-9 ${userProfile?.role === 'super_admin' ? '' : 'ml-auto'}`}
            onClick={() => setDialogState('new')}
          >
            <Plus className="h-4 w-4 mr-1.5" />New item
          </Button>
        </div>

        {/* ─── Phase 2 — View controls bar ───────────────────────────
            Sort + group-by + Quazo's saved view + share-URL. These
            live in their own row below the primary filter so the
            common "filter then go" path stays uncluttered, and the
            saved-view affordances are findable when needed. */}
        <div className="px-3 py-2 border-b border-cream-100 bg-cream-50/40 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[10px] uppercase tracking-wider text-ink-warm-500 font-semibold mr-1">View</span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger className="h-7 w-36 text-xs focus-brand">
              {sort === 'age_asc' ? <ArrowUpAZ className="h-3 w-3 mr-1.5 text-ink-warm-400" /> : <ArrowDownAZ className="h-3 w-3 mr-1.5 text-ink-warm-400" />}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="age_desc">Newest first</SelectItem>
              <SelectItem value="age_asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
          <Select value={group} onValueChange={(v) => setGroup(v as GroupMode)}>
            <SelectTrigger className="h-7 w-44 text-xs focus-brand">
              <GroupIcon className="h-3 w-3 mr-1.5 text-ink-warm-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="type">Group by type</SelectItem>
              <SelectItem value="type_area">Group by type + area</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setStatusFilter(QUAZO_PRESET.statusFilter);
              setTypeFilter(QUAZO_PRESET.typeFilter);
              setAreaFilter(QUAZO_PRESET.areaFilter);
              setSearch(QUAZO_PRESET.search);
              setSort(QUAZO_PRESET.sort);
              setGroup(QUAZO_PRESET.group);
            }}
            title="Open items, oldest first, grouped by type + area"
          >
            <Bookmark className="h-3 w-3 mr-1" />
            Quazo's view
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs ml-auto"
            onClick={() => {
              if (typeof window === 'undefined') return;
              navigator.clipboard.writeText(window.location.href).then(
                () => {
                  setCopyState('copied');
                  toast({ title: 'View URL copied' });
                  window.setTimeout(() => setCopyState('idle'), 1500);
                },
                () => toast({ title: 'Copy failed', variant: 'destructive' }),
              );
            }}
            title="Copy a shareable URL with all current filters"
          >
            {copyState === 'copied' ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
            {copyState === 'copied' ? 'Copied' : 'Copy URL'}
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Bug}
              title={items.length === 0 ? 'No backlog items yet' : 'Nothing matches'}
              description={items.length === 0
                ? 'Report a bug or request via /bug in Telegram, or click New item.'
                : 'Adjust your filters above.'}
            >
              {items.length === 0 && (
                <Button variant="brand" size="sm" onClick={() => setDialogState('new')}>
                  <Plus className="h-3.5 w-3.5 mr-1" />New item
                </Button>
              )}
            </EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                <TableHead className="h-9 py-2 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Title</TableHead>
                <TableHead className="h-9 py-2 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-24">Type</TableHead>
                <TableHead className="h-9 py-2 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-44">Area</TableHead>
                <TableHead className="h-9 py-2 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-40">Status</TableHead>
                <TableHead className="h-9 py-2 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-16">Age</TableHead>
                <TableHead className="h-9 py-2 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(g => (
                <Fragment key={g.key}>
                  {/* Group header row — only renders when grouping
                      is active (label is empty for the single-group
                      "no grouping" mode). Background distinguishes
                      it from data rows; col-span covers the whole
                      row so it acts as a section divider. */}
                  {g.label && (
                    <TableRow className="bg-cream-100 hover:bg-cream-100">
                      <TableCell colSpan={6} className="py-2 px-4">
                        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-700">
                          {g.label}
                        </span>
                        <span className="ml-2 text-[10px] text-ink-warm-500 tabular-nums">
                          {g.items.length} item{g.items.length === 1 ? '' : 's'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                  {g.items.map(it => {
                    const transitions = getValidTransitions(it.status);
                    const attachCount = attachmentCounts[it.id] || 0;
                    const canMoveLive = it.status === 'ready_for_review' && (
                      userProfile?.id === it.reporter_id
                      || userProfile?.role === 'super_admin'
                    );
                    return (
                  <TableRow
                    key={it.id}
                    className="border-cream-100 row-accent cursor-pointer"
                    onClick={() => setDialogState(it)}
                  >
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-warm-900 truncate">{it.title}</span>
                        {attachCount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-warm-500"
                            title={`${attachCount} attachment${attachCount === 1 ? '' : 's'}`}
                          >
                            <Paperclip className="h-3 w-3" />
                            {attachCount}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <StatusBadge tone={TYPE_TONE[it.type]} size="sm" bordered>
                        {BACKLOG_TYPE_LABELS[it.type]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] ${AREA_TONE_CLASS}`}>
                        {BACKLOG_AREA_LABELS[it.area]}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <StatusBadge tone={STATUS_TONE[it.status]} size="sm" bordered withDot={it.status === 'ready_for_review' ? 'pulse' : true}>
                        {BACKLOG_STATUS_LABELS[it.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-xs text-ink-warm-500 tabular-nums">
                      {ageLabel(it.created_at)}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Item actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setDialogState(it)}>
                            <Edit className="h-3.5 w-3.5 mr-2" /> Open / edit
                          </DropdownMenuItem>
                          {transitions.forward.map(next => {
                            // Hide forward-to-live for users who can't make it.
                            if (next === 'live' && !canMoveLive) return null;
                            return (
                              <DropdownMenuItem key={`fwd-${next}`} onClick={() => transition(it, next)}>
                                <ArrowRight className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                                Move to {BACKLOG_STATUS_LABELS[next]}
                              </DropdownMenuItem>
                            );
                          })}
                          {transitions.backward.map(prev => (
                            <DropdownMenuItem key={`back-${prev}`} onClick={() => transition(it, prev)}>
                              <Undo2 className="h-3.5 w-3.5 mr-2 text-ink-warm-500" />
                              Move back to {BACKLOG_STATUS_LABELS[prev]}
                            </DropdownMenuItem>
                          ))}
                          {userProfile?.role === 'super_admin' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeletePending(it)}
                                className="text-rose-600 focus:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create / edit dialog */}
      <BacklogItemDialog
        state={dialogState}
        onClose={() => {
          setDialogState(null);
          // Drop the deep-link param when the dialog closes — reload
          // shouldn't reopen the item. Preserves other view params.
          if (typeof window !== 'undefined' && searchParams.get('id')) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('id');
            router.replace(`/initiatives?${params.toString()}`, { scroll: false });
          }
        }}
        onSaved={refresh}
      />

      {/* Bulk-import dialog — super_admin gated inside the component
          itself; we render unconditionally so the Dialog primitive
          can manage its open/close transition. */}
      <BacklogImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={refresh}
      />

      {/* Settings dialog — Phase 6.5. Same super_admin gating pattern;
          the component itself returns null for non-super_admins. */}
      <BacklogSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Delete confirm — v11 destructive Dialog pattern matching
          /initiatives' "Delete Initiative?" confirm. Inlined here
          rather than extracted to a helper because the modal is
          dead-simple and extraction adds indirection without gain. */}
      <Dialog open={!!deletePending} onOpenChange={(open) => { if (!open) setDeletePending(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete backlog item?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              <strong>{deletePending?.title ?? ''}</strong> will be permanently deleted, along with its attachments. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeletePending(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
