'use client';

/**
 * ContentDashboardTableView — Table view of the Content Dashboard
 * tab. Renders the contents table with per-cell inline editing
 * (campaign_kol / activation_date / content_link / platform / type /
 * status / impressions / likes / retweets / comments / bookmarks),
 * per-column filter dropdowns, bulk-actions toolbar, search + cross-
 * tab nav prefill, and the bulk-delete confirmation flow (the dialog
 * itself stays on the page since it's also fired by the Content row
 * delete action).
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02 — final
 * big sub-piece of the Content Dashboard tab body. Companion to
 * ContentDashboardOverview.
 */

import { useEffect, useRef, useState } from 'react';
import ContentTagCell, { ClientFacingTagBadges, type ContentTag } from './ContentTagCell';
import { supabase as supabaseClient } from '@/lib/supabase';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar as CalendarIcon,
  ChevronDown,
  FileText,
  Search,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { announceContentTagsChanged } from '@/lib/contentTagSignal';
import { supabase } from '@/lib/supabase';
import { markLineupSlotPosted } from '@/lib/lineupSlotSync';
import { CampaignService } from '@/lib/campaignService';
import { KOLService } from '@/lib/kolService';
import {
  formatDateLocal,
  formatDisplayDate,
  getContentTypeColor,
  getNewContentTypeColor,
  getPlatformIcon,
} from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { MultiSelect } from '@/components/campaign/MultiSelect';
import SetRepostRateDialog from '@/components/campaign/SetRepostRateDialog';
import { ensureKolDeliverable } from '@/lib/kolDeliverableAutoAdd';

type ContentSortField =
  | 'kol' | 'activation_date' | 'content_link' | 'platform' | 'type'
  | 'status' | 'impressions' | 'likes' | 'retweets' | 'comments'
  | 'bookmarks' | null;

const contentStatusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  // [TG Bot Phase 2] Bot-approved, awaiting human verification. Inline
  // Verify/Reject buttons render in the Actions column when a row is in
  // this state. Hidden from public portal + showcase + reports + budget
  // CPM/CPE; counts toward nothing until verified.
  { value: 'pending_verification', label: 'Awaiting Verify' },
  { value: 'posted', label: 'Posted' },
];

export function ContentDashboardTableView() {
  // Section 7.5 — fetch the global active-tags list once at the
  // table level and pass to every TagCell. Skips N per-row
  // round-trips to content_tags (which is a tiny table, ~5 rows,
  // but avoiding 50 duplicate queries on a busy campaign is free
  // perf). Per-row assignments still fetch per-cell because they
  // diverge per row.
  const [globalTags, setGlobalTags] = useState<ContentTag[]>([]);

  // First-time repost-rate confirm dialog. Opens when a content row's
  // type is changed to 'Repost' and the linked KOL has no repost_rate set
  // on master_kols yet. Pre-fills with 50% of standard_rate per spec.
  // Once accepted, future Repost flips for the same KOL skip the dialog.
  const [repostRateDialog, setRepostRateDialog] = useState<{
    open: boolean;
    masterKolId: string;
    kolName: string;
    standardRate: number | null;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    (supabaseClient as any)
      .from('content_tags')
      .select('id, name, visibility, color')
      .is('archived_at', null)
      .order('name')
      .then(({ data }: any) => {
        if (alive) setGlobalTags((data || []) as ContentTag[]);
      });
    return () => { alive = false; };
  }, []);

  const {
    campaign,
    setCampaign,
    campaignKOLs,
    contents,
    setContents,
    payments,
    setPayments,
    loadingContents,
    fetchPayments,
    contentsSearchTerm,
    setContentsSearchTerm,
    getCellClassName,
    handleCellSelect,
    toast,
  } = useCampaignDetail() as any;

  const fieldOptions = KOLService.getFieldOptions();

  // ── Filter / sort / selection state ─────────────────────────────
  const [contentFilters, setContentFilters] = useState({
    kol_ids: [] as string[],
    platforms: [] as string[],
    types: [] as string[],
    statuses: [] as string[],
    impressions_operator: '' as string,
    impressions_value: '' as string,
    likes_operator: '' as string,
    likes_value: '' as string,
    retweets_operator: '' as string,
    retweets_value: '' as string,
    comments_operator: '' as string,
    comments_value: '' as string,
    bookmarks_operator: '' as string,
    bookmarks_value: '' as string,
  });
  // Default sort: Activation Date descending (newest at top). Rows
  // with no activation_date fall to the bottom because the sort coerces
  // null → 0 which sorts last in desc. Users can still click any
  // column header or pick a different SortBy from the dropdown — that
  // override stays in place until reload.
  const [contentSort, setContentSort] = useState<{ field: ContentSortField; direction: 'asc' | 'desc' }>({ field: 'activation_date', direction: 'desc' });
  const [selectedContents, setSelectedContents] = useState<string[]>([]);
  // Bumped after regrouping so every ContentTagCell remounts and refetches its
  // assignments — the cells own their tag state, so nothing else would show it.
  const [tagRefreshKey, setTagRefreshKey] = useState(0);
  const [bulkContentStatus, setBulkContentStatus] = useState('');
  const [bulkContentPlatform, setBulkContentPlatform] = useState('');
  const [bulkContentType, setBulkContentType] = useState('');
  const [bulkContentActivationDate, setBulkContentActivationDate] = useState('');

  // ── Inline cell-edit state ──────────────────────────────────────
  const [editingContentCell, setEditingContentCell] = useState<{ contentId: string; field: string } | null>(null);
  const [editingContentValue, setEditingContentValue] = useState<any>(null);

  // ── Delete-confirmation state ──────────────────────────────────
  // The Content bulk-delete dialog is rendered by the page (because
  // it's also fired from the contents row delete pencil); we expose a
  // local setter so the bulk toolbar's Delete button can open it.
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  // [2026-08-10] Single-row delete used to fire immediately and never touch
  // payments — that's how a $200 Venice payment ended up pointing at a content
  // row that no longer existed. `payments.content_id` is a uuid[], so Postgres
  // can't hold a foreign key on it and nothing catches this at the DB layer.
  // Now it asks, and the caller picks.
  const [deleteContentPending, setDeleteContentPending] = useState<any | null>(null);

  // Table scroll ref — internal to this component (sticky scrollbar
  // remains a page-level concern via the page's contentTableRef but
  // we keep a local ref here for the component's own structure).
  const contentTableRef = useRef<HTMLDivElement>(null);

  // ── Derived: filteredContents + sortedContents ─────────────────
  const filteredContents = (() => {
    let filtered = contents.filter((content: any) => {
      // Search term filter
      if (contentsSearchTerm) {
        const search = contentsSearchTerm.toLowerCase();
        const kol = campaignKOLs.find((k: any) => k.id === content.campaign_kols_id);
        const kolName = kol?.master_kol?.name?.toLowerCase() || '';
        const platform = (content.platform || '').toLowerCase();
        const type = (content.type || '').toLowerCase();
        const status = (content.status || '').toLowerCase();
        const link = (content.content_link || '').toLowerCase();
        if (
          !kolName.includes(search) &&
          !platform.includes(search) &&
          !type.includes(search) &&
          !status.includes(search) &&
          !link.includes(search)
        ) return false;
      }
      // Per-column filters
      if (contentFilters.kol_ids.length > 0 && !contentFilters.kol_ids.includes(content.campaign_kols_id)) return false;
      if (contentFilters.platforms.length > 0 && !contentFilters.platforms.includes(content.platform)) return false;
      if (contentFilters.types.length > 0 && !contentFilters.types.includes(content.type)) return false;
      if (contentFilters.statuses.length > 0 && !contentFilters.statuses.includes(content.status)) return false;
      return true;
    });

    if (contentSort.field) {
      const dir = contentSort.direction === 'asc' ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        let av: any;
        let bv: any;
        switch (contentSort.field) {
          case 'kol': {
            const ak = campaignKOLs.find((k: any) => k.id === a.campaign_kols_id);
            const bk = campaignKOLs.find((k: any) => k.id === b.campaign_kols_id);
            av = ak?.master_kol?.name || '';
            bv = bk?.master_kol?.name || '';
            break;
          }
          case 'activation_date':
            av = a.activation_date ? new Date(a.activation_date).getTime() : 0;
            bv = b.activation_date ? new Date(b.activation_date).getTime() : 0;
            break;
          case 'impressions':
          case 'likes':
          case 'retweets':
          case 'comments':
          case 'bookmarks':
            av = a[contentSort.field] ?? 0;
            bv = b[contentSort.field] ?? 0;
            break;
          default:
            av = a[contentSort.field as string] || '';
            bv = b[contentSort.field as string] || '';
            break;
        }
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return filtered;
  })();

  const toggleContentSort = (field: Exclude<ContentSortField, null>) => {
    setContentSort(prev => {
      if (prev.field !== field) return { field, direction: 'asc' };
      if (prev.direction === 'asc') return { field, direction: 'desc' };
      return { field: null, direction: 'asc' };
    });
  };

  const contentSortIndicator = (field: Exclude<ContentSortField, null>) => {
    if (contentSort.field !== field) {
      return <ArrowUpDown className="inline-block h-3 w-3 ml-1 opacity-30" />;
    }
    return contentSort.direction === 'asc'
      ? <ArrowUp className="inline-block h-3 w-3 ml-1" />
      : <ArrowDown className="inline-block h-3 w-3 ml-1" />;
  };

  const handleSelectAllContents = () => {
    const allIds = filteredContents.map((c: any) => c.id);
    if (allIds.every((id: string) => selectedContents.includes(id))) {
      setSelectedContents(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedContents(prev => Array.from(new Set([...prev, ...allIds])));
    }
  };

  // ── Inline cell save (writes to supabase + local state) ───────
  const handleContentCellSaveImmediate = async (content: any, field: string, newValue: any) => {
    // Update local state immediately for responsiveness.
    setContents((prev: any[]) => prev.map(c => c.id === content.id ? { ...c, [field]: newValue } : c));

    // If this is a new row (created via the Add Content inline flow),
    // insert it as a fresh row instead of updating.
    if (content.isNew) {
      const updatedContent = { ...content, [field]: newValue };
      try {
        const payload = {
          campaign_id: campaign?.id,
          campaign_kols_id: updatedContent.campaign_kols_id || null,
          activation_date: updatedContent.activation_date || null,
          content_link: updatedContent.content_link || null,
          platform: updatedContent.platform || null,
          type: updatedContent.type || null,
          status: updatedContent.status || null,
          impressions: updatedContent.impressions ? Number(updatedContent.impressions) : null,
          likes: updatedContent.likes ? Number(updatedContent.likes) : null,
          retweets: updatedContent.retweets ? Number(updatedContent.retweets) : null,
          comments: updatedContent.comments ? Number(updatedContent.comments) : null,
          bookmarks: updatedContent.bookmarks ? Number(updatedContent.bookmarks) : null,
        };
        const { error, data } = await supabase.from('contents').insert(payload as any).select();
        if (error) {
          console.error('Error inserting content:', error);
          return;
        }
        if (data && data.length > 0) {
          const newContent: any = data[0];
          const kol = campaignKOLs.find((k: any) => k.id === newContent.campaign_kols_id);
          const contentWithKol = {
            ...newContent,
            master_kol: kol?.master_kol,
            isNew: false,
          };
          setContents((prev: any[]) => prev.map(c => c.id === content.id ? contentWithKol : c));
          // [2026-07-06] Best-effort: mark this KOL's slot in the current
          // week's lineup as posted (feeds the Thursday deadline ping).
          if (campaign?.id && newContent.campaign_kols_id) {
            void markLineupSlotPosted(supabase as any, {
              campaignId: campaign.id,
              campaignKolsId: newContent.campaign_kols_id,
              dateIso: newContent.activation_date || null,
            });
          }
        }
      } catch (err) {
        console.error('Error saving new content:', err);
      }
    } else {
      try {
        await supabase.from('contents').update({ [field]: newValue } as any).eq('id', content.id);
      } catch (err) {
        console.error('Error updating content:', err);
      }
    }

    // First-time repost-rate prompt — when a content type flips to
    // 'Repost' and the linked KOL has no master_kols.repost_rate yet,
    // open the confirm dialog pre-filled with 50% of standard_rate.
    // Subsequent Reposts for the same KOL skip the dialog (the rate is
    // already locked in for the budget to use).
    if (field === 'type' && newValue === 'Repost') {
      const mk = (content as any).master_kol;
      if (mk?.id && mk?.repost_rate == null) {
        setRepostRateDialog({
          open: true,
          masterKolId: mk.id,
          kolName: mk.name || 'KOL',
          standardRate: mk.standard_rate ?? null,
        });
      }
    }

    // Auto-add the content type to the KOL's master_kols.deliverables
    // list (idempotent). When a KOL gets their first Post / Repost
    // / Video / etc. on any campaign, the corresponding label
    // appears in /kols → Content Type column without manual entry.
    // Mirror in local state so the next inline read sees the new value.
    if (field === 'type' && typeof newValue === 'string') {
      const mk = (content as any).master_kol;
      if (mk?.id) {
        const merged = await ensureKolDeliverable(supabase as any, mk.id, newValue);
        if (merged) {
          setContents((prev: any[]) => prev.map((c) =>
            c.master_kol?.id === mk.id
              ? { ...c, master_kol: { ...c.master_kol, deliverables: merged } }
              : c
          ));
        }
      }
    }

    // Auto-update campaign status to Active when content is posted.
    // [2026-08-05] Skipped once the status has been set by hand — otherwise
    // the next posted link silently reverts a deliberate correction, which is
    // the failure the manual override exists to prevent.
    if (field === 'status' && newValue?.toLowerCase() === 'posted' && campaign?.status === 'Planning'
        && !(campaign as any)?.status_manual_at) {
      try {
        await CampaignService.updateCampaign(campaign.id, { status: 'Active' });
        setCampaign((prev: any) => prev ? { ...prev, status: 'Active' } : null);
      } catch (err) {
        console.error('Error auto-updating campaign status:', err);
      }
    }

    setEditingContentCell(null);
    setEditingContentValue(null);
  };

  const handleContentCellSave = async () => {
    if (!editingContentCell) return;
    const { contentId, field } = editingContentCell;
    const content = contents.find((c: any) => c.id === contentId);
    if (!content) return;
    await handleContentCellSaveImmediate(content, field, editingContentValue);
  };

  const handleContentCellCancel = () => {
    setEditingContentCell(null);
    setEditingContentValue(null);
  };

  // ── Bulk delete (operates on selectedContents + linked payments)
  const handleBulkDeleteContents = async () => {
    if (selectedContents.length === 0) return;
    setShowBulkDeleteDialog(false);
    const toDelete = selectedContents;
    const linkedPaymentIds = payments
      .filter((p: any) => {
        const ids = Array.isArray(p.content_id) ? p.content_id : (p.content_id ? [p.content_id] : []);
        return ids.some((id: string) => toDelete.includes(id));
      })
      .map((p: any) => p.id);

    const prevContents = [...contents];
    setContents((prev: any[]) => prev.filter(c => !toDelete.includes(c.id)));
    setPayments((prev: any[]) => prev.filter(p => !linkedPaymentIds.includes(p.id)));
    try {
      if (linkedPaymentIds.length > 0) {
        await Promise.all(linkedPaymentIds.map((id: string) => supabase.from('payments').delete().eq('id', id)));
      }
      await Promise.all(toDelete.map((cid: string) => supabase.from('contents').delete().eq('id', cid)));
      toast({
        title: 'Contents deleted',
        description: linkedPaymentIds.length > 0
          ? `${toDelete.length} content item${toDelete.length !== 1 ? 's' : ''} and ${linkedPaymentIds.length} linked payment${linkedPaymentIds.length !== 1 ? 's' : ''} deleted.`
          : `${toDelete.length} content item${toDelete.length !== 1 ? 's' : ''} deleted.`,
        variant: 'destructive',
      });
      setSelectedContents([]);
    } catch (err) {
      console.error('Error deleting contents:', err);
      setContents(prevContents);
      fetchPayments();
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Failed to delete some content items', variant: 'destructive' });
    }
  };

  // ── Helpers expected by the inline JSX ─────────────────────────
  const handleBulkContentStatusUpdate = async () => {
    if (!bulkContentStatus || selectedContents.length === 0) return;
    try {
      await Promise.all(selectedContents.map(id =>
        supabase.from('contents').update({ status: bulkContentStatus } as any).eq('id', id),
      ));
      setContents((prev: any[]) => prev.map(c => selectedContents.includes(c.id) ? { ...c, status: bulkContentStatus } : c));
      setSelectedContents([]);
      setBulkContentStatus('');
      toast({ title: 'Status updated' });
    } catch (err) {
      console.error('Error bulk-updating content status:', err);
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Failed to update status', variant: 'destructive' });
    }
  };

  // Alias used by the inline JSX (kept for readability of the JSX).
  const handleBulkStatusChange = handleBulkContentStatusUpdate;

  const handleBulkContentTypeUpdate = async () => {
    if (!bulkContentType || selectedContents.length === 0) return;
    try {
      await Promise.all(selectedContents.map(id =>
        supabase.from('contents').update({ type: bulkContentType } as any).eq('id', id),
      ));
      setContents((prev: any[]) => prev.map(c => selectedContents.includes(c.id) ? { ...c, type: bulkContentType } : c));

      // First-time repost-rate prompt — fire once for the first
      // selected-and-bulk-typed-to-Repost KOL that has no repost_rate yet.
      // Bulk path is rare so a single prompt is fine; the second Repost
      // for the same KOL silently uses the just-saved rate.
      if (bulkContentType === 'Repost') {
        const affected = contents.filter((c: any) => selectedContents.includes(c.id));
        const needs = affected.find((c: any) => c.master_kol?.id && c.master_kol?.repost_rate == null);
        if (needs) {
          setRepostRateDialog({
            open: true,
            masterKolId: needs.master_kol.id,
            kolName: needs.master_kol.name || 'KOL',
            standardRate: needs.master_kol.standard_rate ?? null,
          });
        }
      }

      // Auto-add the bulk content type to each affected KOL's
      // master_kols.deliverables. Dedupe by master_kol_id so we don't
      // hit the same KOL N times for N selected contents.
      const affected = contents.filter((c: any) => selectedContents.includes(c.id));
      const masterIds: string[] = Array.from(new Set(
        affected
          .map((c: any) => (c.master_kol?.id as string | undefined))
          .filter((v: string | undefined): v is string => !!v),
      )) as string[];
      await Promise.all(masterIds.map((mkId: string) =>
        ensureKolDeliverable(supabase as any, mkId, bulkContentType),
      ));

      setSelectedContents([]);
      setBulkContentType('');
      toast({ title: 'Type updated' });
    } catch (err) {
      console.error('Error bulk-updating content type:', err);
    }
  };

  const handleBulkActivationDateUpdate = async () => {
    if (!bulkContentActivationDate || selectedContents.length === 0) return;
    try {
      await Promise.all(selectedContents.map(id =>
        supabase.from('contents').update({ activation_date: bulkContentActivationDate } as any).eq('id', id),
      ));
      setContents((prev: any[]) => prev.map(c => selectedContents.includes(c.id) ? { ...c, activation_date: bulkContentActivationDate } : c));
      setSelectedContents([]);
      setBulkContentActivationDate('');
      toast({ title: 'Date updated' });
    } catch (err) {
      console.error('Error bulk-updating activation date:', err);
    }
  };

  const handleBulkContentPlatformUpdate = async () => {
    if (!bulkContentPlatform || selectedContents.length === 0) return;
    try {
      await Promise.all(selectedContents.map(id =>
        supabase.from('contents').update({ platform: bulkContentPlatform } as any).eq('id', id),
      ));
      setContents((prev: any[]) => prev.map(c => selectedContents.includes(c.id) ? { ...c, platform: bulkContentPlatform } : c));
      setSelectedContents([]);
      setBulkContentPlatform('');
      toast({ title: 'Platform updated' });
    } catch (err) {
      console.error('Error bulk-updating content platform:', err);
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Failed to update platform', variant: 'destructive' });
    }
  };

  // ── Group the selected rows into one numbered multi-post set ─────
  //
  // [2026-08-03] Replaces hand-typing "1 / 5" into every row. Both numbers are
  // now DERIVED from the group: sequence_n is the row's position by posted
  // date, sequence_of is the member count. That is the whole point — the old
  // way let the two drift ("Post 3 of 5" next to "Post 4 of 7"), and adding a
  // 6th post meant re-editing five separate "of" values by hand.
  //
  // `multipost_group_id` already existed on content_tag_assignments but was
  // dead — addTag hardcoded it to null and nothing read it. This is the
  // consumer it never got.
  const handleGroupAsMultiPost = async () => {
    const tag = globalTags.find((t: ContentTag) => t.name === 'Multi-Post');
    if (!tag) {
      toast({ title: 'No "Multi-Post" tag', description: 'Create it in the tag manager first.', variant: 'destructive' });
      return;
    }
    if (selectedContents.length < 2) {
      toast({ title: 'Select at least 2 posts', description: 'A multi-post set needs more than one piece.', variant: 'destructive' });
      return;
    }
    try {
      // Order by posted date, earliest first. Undated rows sort last rather
      // than to the front — a missing date shouldn't claim "Post 1".
      const ordered = selectedContents
        .map(id => contents.find((c: any) => c.id === id))
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const da = a.activation_date, db = b.activation_date;
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da < db ? -1 : da > db ? 1 : 0;
        });

      const groupId = crypto.randomUUID();
      const total = ordered.length;

      // Reuse an existing Multi-Post assignment on a row if it has one, so
      // re-grouping doesn't leave a duplicate chip behind.
      const { data: existing } = await (supabase as any)
        .from('content_tag_assignments')
        .select('id, content_id')
        .eq('tag_id', tag.id)
        .in('content_id', ordered.map((c: any) => c.id));
      const existingByContent = new Map<string, string>(
        (existing ?? []).map((r: any) => [r.content_id, r.id]),
      );

      await Promise.all(ordered.map((c: any, i: number) => {
        const fields = { sequence_n: i + 1, sequence_of: total, multipost_group_id: groupId };
        const priorId = existingByContent.get(c.id);
        return priorId
          ? (supabase as any).from('content_tag_assignments').update(fields).eq('id', priorId)
          : (supabase as any).from('content_tag_assignments').insert({ content_id: c.id, tag_id: tag.id, ...fields });
      }));

      setSelectedContents([]);
      toast({ title: `Grouped as Post 1–${total} of ${total}` });
      setTagRefreshKey(k => k + 1);
      announceContentTagsChanged();
    } catch (err) {
      console.error('Error grouping multi-post:', err);
      toast({ title: 'Grouping failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  /** Payments whose content_id array references this content row. */
  const linkedPaymentsFor = (contentId: string) =>
    payments.filter((p: any) => {
      const ids = Array.isArray(p.content_id) ? p.content_id : (p.content_id ? [p.content_id] : []);
      return ids.includes(contentId);
    });

  /** Split linked payments into ones that ONLY cover this content (safe to
   *  delete) and ones that also cover other posts (unlink this id instead —
   *  deleting the row would wipe the other posts' payment too). content_id is
   *  an array precisely so a multipost group can share one payment. */
  const splitLinkedPayments = (contentId: string) => {
    const linked = linkedPaymentsFor(contentId);
    const sole: any[] = [];
    const shared: any[] = [];
    for (const p of linked) {
      const ids = Array.isArray(p.content_id) ? p.content_id : (p.content_id ? [p.content_id] : []);
      (ids.length > 1 ? shared : sole).push(p);
    }
    return { linked, sole, shared };
  };

  const handleDeleteContent = async (contentId: string, alsoDeletePayments: boolean) => {
    const { sole, shared } = alsoDeletePayments
      ? splitLinkedPayments(contentId)
      : { sole: [] as any[], shared: [] as any[] };
    const prevContents = [...contents];
    setDeleteContentPending(null);
    setContents((prev: any[]) => prev.filter(c => c.id !== contentId));
    if (sole.length > 0) {
      const ids = sole.map((p: any) => p.id);
      setPayments((prev: any[]) => prev.filter(p => !ids.includes(p.id)));
    }
    try {
      // Payments first: if this throws we still have the content row, which is
      // the recoverable direction. The reverse leaves an orphan.
      if (sole.length > 0) {
        await Promise.all(sole.map((p: any) => supabase.from('payments').delete().eq('id', p.id)));
      }
      if (shared.length > 0) {
        await Promise.all(shared.map((p: any) => {
          const ids = (Array.isArray(p.content_id) ? p.content_id : [p.content_id])
            .filter((id: string) => id !== contentId);
          return supabase.from('payments').update({ content_id: ids } as any).eq('id', p.id);
        }));
      }
      const { error } = await supabase.from('contents').delete().eq('id', contentId);
      if (error) throw error;
      const bits: string[] = [];
      if (sole.length > 0) bits.push(`${sole.length} payment${sole.length !== 1 ? 's' : ''} deleted`);
      if (shared.length > 0) bits.push(`${shared.length} unlinked (also covers other posts)`);
      toast({
        title: 'Content deleted',
        description: bits.length > 0 ? bits.join(', ') + '.' : undefined,
        variant: 'destructive',
      });
    } catch (err) {
      console.error('Error deleting content:', err);
      setContents(prevContents);
      fetchPayments();
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  /** [TG Bot Phase 2] Flip a pending_verification row to 'posted'. Bot-approved
   *  content only counts toward CPM/CPE/Top Post/portal feeds once a team
   *  member has eyeballed it and clicked Verify. */
  const handleVerifyContent = async (contentId: string) => {
    try {
      const { error } = await supabase
        .from('contents')
        .update({ status: 'posted' } as any)
        .eq('id', contentId);
      if (error) throw error;
      setContents((prev: any[]) => prev.map(c => c.id === contentId ? { ...c, status: 'posted' } : c));
      toast({ title: 'Verified', description: 'Content now counts toward metrics.' });
    } catch (err) {
      console.error('Error verifying content:', err);
      toast({ title: 'Verify failed', description: err instanceof Error ? err.message : 'Could not flip to posted', variant: 'destructive' });
    }
  };

  /** Inline cell renderer. Patterns:
   *  - select fields (platform / type / status) → always-editable Select
   *  - activation_date → Popover + Calendar
   *  - text/number → double-click → Input. */
  const renderEditableContentCell = (value: any, field: string, content: any) => {
    const isEditing = editingContentCell?.contentId === content.id && editingContentCell?.field === field;
    // [2026-06-05] `notes` added to textFields — it was rendered with
    // the double-click affordance in the JSX (cursor-pointer +
    // onDoubleClick wired to setEditingContentCell), but the cell
    // never entered edit mode because the `textFields.includes(field)`
    // check below excluded it. Result: double-click was a no-op and
    // the notes column was effectively read-only.
    const textFields = ['content_link', 'notes'];
    const numberFields = ['impressions', 'likes', 'retweets', 'comments', 'bookmarks'];

    // KOL select
    if (field === 'campaign_kols_id') {
      return (
        <Select value={value || ''} onValueChange={async v => {
          await handleContentCellSaveImmediate(content, field, v);
        }}>
          <SelectTrigger className="border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none" style={{ minWidth: 120 }}>
            <SelectValue>
              {campaignKOLs.find((k: any) => k.id === value)?.master_kol?.name || '-'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {campaignKOLs.map((kol: any) => (
              <SelectItem key={kol.id} value={kol.id}>{kol.master_kol?.name || 'Unknown'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Platform / Type / Status — always-editable selects.
    // [2026-06-05] Status now uses the {value, label} object form so
    // the dropdown shows Title Case ("Pending"/"Scheduled"/"Posted")
    // while still storing the lowercase DB value. Platform / Type
    // pass through unchanged because their fieldOptions are already
    // Title Case canonical strings.
    if (field === 'platform' || field === 'type' || field === 'status') {
      const options: Array<{ value: string; label: string }> = field === 'platform'
        ? (fieldOptions.platforms as string[]).map(v => ({ value: v, label: v }))
        : field === 'type'
          ? (fieldOptions.deliverables as string[]).map(v => ({ value: v, label: v }))
          : contentStatusOptions;
      const colorFn = field === 'type' ? getContentTypeColor : null;
      const currentLabel = options.find(o => o.value === value)?.label ?? value;
      return (
        <Select value={value || ''} onValueChange={async v => {
          await handleContentCellSaveImmediate(content, field, v);
        }}>
          <SelectTrigger className={`border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none ${colorFn && value ? colorFn(value) : ''}`} style={{ minWidth: 90 }}>
            <SelectValue>{currentLabel || '-'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Activation date
    if (field === 'activation_date') {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`w-full text-left px-1 py-1 ${value ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
            >
              {value ? formatDisplayDate(value) : 'Select date'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="!bg-white border shadow-md w-auto p-0 z-50" align="start">
            <CalendarComponent
              mode="single"
              selected={value ? new Date(value) : undefined}
              onSelect={(date) => handleContentCellSaveImmediate(content, field, date ? formatDateLocal(date) : '')}
              initialFocus
              classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
              modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
            />
          </PopoverContent>
        </Popover>
      );
    }

    // Text / number — double-click to edit
    if (isEditing && (textFields.includes(field) || numberFields.includes(field))) {
      return (
        <Input
          type={numberFields.includes(field) ? 'number' : 'text'}
          value={editingContentValue ?? ''}
          onChange={(e) => setEditingContentValue(e.target.value)}
          onBlur={() => handleContentCellSave()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleContentCellSave();
            if (e.key === 'Escape') handleContentCellCancel();
          }}
          className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
          style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
          autoFocus
        />
      );
    }

    // content_link renders as a clickable link (single-click opens in a
    // new tab); double-click still enters edit mode, matching the /kols
    // Link column. Other text/number cells render plain.
    const displayContent = field === 'content_link' && value
      ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      )
      : (numberFields.includes(field) && value != null ? Number(value).toLocaleString() : (value || '-'));

    return (
      <div
        className="cursor-pointer w-full h-full flex items-center px-1 py-1"
        onDoubleClick={() => {
          if (textFields.includes(field) || numberFields.includes(field)) {
            setEditingContentCell({ contentId: content.id, field });
            setEditingContentValue(value);
          }
        }}
        title={textFields.includes(field) || numberFields.includes(field) ? 'Double-click to edit' : undefined}
      >
        {displayContent}
      </div>
    );
  };

  // ── Backwards-compat aliases (the inline JSX uses these names) ─
  // contentsSearchTerm is read from context above.
  // setContentsSearchTerm too.

  return (
    <>
                <div className="flex items-center justify-between mb-2 gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                    <Input
                      placeholder="Search Contents by KOL, platform, or status..."
                      className="pl-10 focus-brand"
                      value={contentsSearchTerm}
                      onChange={e => setContentsSearchTerm(e.target.value)}
                    />
                  </div>
                  {/* Sort Menu */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-warm-500">Sort by:</span>
                    <Select
                      value={contentSort.field ?? undefined}
                      onValueChange={(value: string) => setContentSort(prev => ({ ...prev, field: value as ContentSortField }))}
                    >
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_at">Date Added</SelectItem>
                        <SelectItem value="kol">KOL Name</SelectItem>
                        <SelectItem value="platform">Platform</SelectItem>
                        <SelectItem value="type">Type</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="activation_date">Activation Date</SelectItem>
                        <SelectItem value="impressions">Views</SelectItem>
                        <SelectItem value="likes">Reactions</SelectItem>
                        <SelectItem value="retweets">Shares</SelectItem>
                        <SelectItem value="comments">Replies</SelectItem>
                        <SelectItem value="bookmarks">Saves</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-2"
                      onClick={() => setContentSort(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                    >
                      {contentSort.direction === 'asc' ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                        </svg>
                      )}
                    </Button>
                  </div>
                </div>
                {selectedContents.length > 0 && (
                <div className="mb-6 mt-6">
                  <div className="bg-white border border-cream-200 rounded-[14px] p-6 shadow-card">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-cream-500 rounded-full"></div>
                        <span className="text-sm font-semibold text-ink-warm-700">{selectedContents.length} Content{selectedContents.length !== 1 ? 's' : ''} selected</span>
                      </div>
                      <div className="h-4 w-px bg-cream-300"></div>
                      <span className="text-xs text-ink-warm-700 font-medium">Bulk Edit Fields</span>
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-ink-warm-700 border-cream-300 hover:bg-cream-50"
                          onClick={handleSelectAllContents}
                        >
                          {filteredContents.length > 0 && filteredContents.every((content: any) => selectedContents.includes(content.id)) ? 'Deselect All' : 'Select All'}
                        </Button>
                      </div>
                      <div className="min-w-[120px] flex flex-col items-end justify-end">
                        <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Platform</span>
                        <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                          <Select value={bulkContentPlatform} onValueChange={v => setBulkContentPlatform(v)}>
                            <SelectTrigger
                              className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldOptions.platforms.map(platform => (
                                <SelectItem key={platform} value={platform}>{platform}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="min-w-[120px] flex flex-col items-end justify-end">
                        <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Type</span>
                        <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                          <Select value={bulkContentType} onValueChange={v => setBulkContentType(v)}>
                            <SelectTrigger
                              className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldOptions.deliverables.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="min-w-[120px] flex flex-col items-end justify-end">
                        <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Status</span>
                        <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                          <Select value={bulkContentStatus} onValueChange={v => setBulkContentStatus(v)}>
                            <SelectTrigger
                              className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {contentStatusOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="min-w-[140px] flex flex-col items-end justify-end">
                        <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Activation Date</span>
                        <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                className="h-7 px-0 py-0 text-xs font-semibold text-black hover:bg-transparent"
                              >
                                {bulkContentActivationDate ? formatDisplayDate(bulkContentActivationDate) : 'Select'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={bulkContentActivationDate ? new Date(bulkContentActivationDate) : undefined}
                                onSelect={date => setBulkContentActivationDate(date ? formatDateLocal(date) : '')}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex flex-col items-end justify-end">
                          <div className="h-5"></div>
                          <Button
                            size="sm"
                            variant="brand" className="whitespace-nowrap"
                            disabled={selectedContents.length === 0 || (!bulkContentStatus && !bulkContentPlatform && !bulkContentType && !bulkContentActivationDate)}
                            onClick={handleBulkStatusChange}
                          >
                            Apply
                          </Button>
                        </div>
                        <div className="flex flex-col items-end justify-end">
                          <div className="h-5"></div>
                          {/* Numbers the set automatically — see handleGroupAsMultiPost. */}
                          <Button
                            size="sm"
                            variant="outline" className="whitespace-nowrap"
                            disabled={selectedContents.length < 2}
                            onClick={handleGroupAsMultiPost}
                          >
                            Group as Multi-Post
                          </Button>
                        </div>
                        <div className="flex flex-col items-end justify-end">
                          <div className="h-5"></div>
                          <Button
                            size="sm"
                            variant="destructive" className="whitespace-nowrap"
                            disabled={selectedContents.length === 0}
                            onClick={() => setShowBulkDeleteDialog(true)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-ink-warm-500 font-medium ml-auto whitespace-nowrap">
                        {selectedContents.length > 0 && `${selectedContents.length} item${selectedContents.length !== 1 ? 's' : ''} selected`}
                      </div>
                    </div>
                  </div>
                </div>
                )}
                {loadingContents ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-center whitespace-nowrap">#</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-left select-none">KOL</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Platform</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Type</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Status</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Activation Date</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Content Link</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Views</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Views</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.impressions_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, impressions_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.impressions_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, impressions_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.impressions_operator || contentFilters.impressions_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, impressions_operator: '', impressions_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.impressions_operator && contentFilters.impressions_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Reactions</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Reactions</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.likes_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, likes_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.likes_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, likes_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.likes_operator || contentFilters.likes_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, likes_operator: '', likes_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.likes_operator && contentFilters.likes_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Shares</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Shares</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.retweets_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, retweets_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.retweets_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, retweets_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.retweets_operator || contentFilters.retweets_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, retweets_operator: '', retweets_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.retweets_operator && contentFilters.retweets_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Replies</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Replies</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.comments_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, comments_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.comments_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, comments_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.comments_operator || contentFilters.comments_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, comments_operator: '', comments_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.comments_operator && contentFilters.comments_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Saves</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Saves</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.bookmarks_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, bookmarks_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.bookmarks_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, bookmarks_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.bookmarks_operator || contentFilters.bookmarks_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, bookmarks_operator: '', bookmarks_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.bookmarks_operator && contentFilters.bookmarks_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none" style={{ minWidth: '150px' }}>Notes</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            {[...Array(13)].map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : contents.length === 0 ? (
                  <div className="text-center py-8 text-ink-warm-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-ink-warm-300" />
                    <p className="text-lg font-medium mb-2">No content created yet</p>
                    <p className="text-sm text-ink-warm-400">Content created for this campaign will appear here.</p>
                  </div>
                ) : (
                  // [&>div]:overflow-visible neutralizes the shadcn Table's own
                  // overflow-auto wrapper so THIS div is the sole scroller —
                  // required for the sticky header below to actually pin.
                  <div ref={contentTableRef} className="border rounded-lg [&>div]:overflow-visible" style={{ overflow: 'auto', overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh' }}>
                    <Table className="min-w-full" style={{ tableLayout: 'auto', width: 'auto', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                      {/* Frozen header row — stays visible while scrolling long content lists. */}
                      <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-cream-50 [&_th]:border-b [&_th]:border-cream-200">
                        <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-center whitespace-nowrap group cursor-pointer hover:bg-cream-100 transition-colors px-4" style={{ minWidth: '60px', width: '60px' }} onClick={handleSelectAllContents}>
                            <span className="group-hover:hidden">#</span>
                            <Checkbox
                              className="hidden group-hover:inline-flex"
                              checked={filteredContents.length > 0 && filteredContents.every((content: any) => selectedContents.includes(content.id))}
                            />
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-left select-none">KOL</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Platform</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Platform</div>
                                    {['X','Telegram','YouTube','Facebook','TikTok'].map((platform) => (
                                      <div
                                        key={platform}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newPlatforms = contentFilters.platforms.includes(platform)
                                            ? contentFilters.platforms.filter(p => p !== platform)
                                            : [...contentFilters.platforms, platform];
                                          setContentFilters(prev => ({ ...prev, platform: newPlatforms }));
                                        }}
                                      >
                                        <Checkbox checked={contentFilters.platforms.includes(platform)} />
                                        <div className="flex items-center gap-1" title={platform}>
                                          {getPlatformIcon(platform)}
                                        </div>
                                      </div>
                                    ))}
                                    {contentFilters.platforms.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, platform: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {contentFilters.platforms.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.platforms.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Type</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Type</div>
                                    {['Video','Thread','Post','Story','Reel','Short'].map((type) => (
                                      <div
                                        key={type}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newTypes = contentFilters.types.includes(type)
                                            ? contentFilters.types.filter(t => t !== type)
                                            : [...contentFilters.types, type];
                                          setContentFilters(prev => ({ ...prev, type: newTypes }));
                                        }}
                                      >
                                        <Checkbox checked={contentFilters.types.includes(type)} />
                                        <span className="text-sm">{type}</span>
                                      </div>
                                    ))}
                                    {contentFilters.types.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, type: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {contentFilters.types.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.types.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Status</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Status</div>
                                    {contentStatusOptions.map((option) => (
                                      <div
                                        key={option.value}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newStatuses = contentFilters.statuses.includes(option.value)
                                            ? contentFilters.statuses.filter(s => s !== option.value)
                                            : [...contentFilters.statuses, option.value];
                                          setContentFilters(prev => ({ ...prev, status: newStatuses }));
                                        }}
                                      >
                                        <Checkbox checked={contentFilters.statuses.includes(option.value)} />
                                        <span className="text-sm">{option.label}</span>
                                      </div>
                                    ))}
                                    {contentFilters.statuses.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, status: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {contentFilters.statuses.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.statuses.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Activation Date</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Content Link</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Views</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Views</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.impressions_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, impressions_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.impressions_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, impressions_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.impressions_operator || contentFilters.impressions_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, impressions_operator: '', impressions_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.impressions_operator && contentFilters.impressions_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Reactions</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Reactions</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.likes_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, likes_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.likes_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, likes_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.likes_operator || contentFilters.likes_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, likes_operator: '', likes_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.likes_operator && contentFilters.likes_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Shares</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Shares</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.retweets_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, retweets_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.retweets_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, retweets_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.retweets_operator || contentFilters.retweets_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, retweets_operator: '', retweets_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.retweets_operator && contentFilters.retweets_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Replies</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Replies</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.comments_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, comments_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.comments_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, comments_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.comments_operator || contentFilters.comments_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, comments_operator: '', comments_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.comments_operator && contentFilters.comments_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Saves</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Saves</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.bookmarks_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, bookmarks_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.bookmarks_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, bookmarks_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.bookmarks_operator || contentFilters.bookmarks_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, bookmarks_operator: '', bookmarks_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.bookmarks_operator && contentFilters.bookmarks_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          {/* Section 7.5 — Tags column. Chips render
                              inline; click + Add to assign more from
                              the popover. Client-facing tags appear
                              on the public page; internal tags stay
                              admin-only. */}
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none" style={{ minWidth: '180px' }}>Tags</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none" style={{ minWidth: '150px' }}>Notes</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white">
                        {filteredContents.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={15} className="text-center py-12">
                              <div className="flex flex-col items-center justify-center text-ink-warm-500">
                                <FileText className="h-12 w-12 mb-4 text-ink-warm-300" />
                                <p className="text-lg font-medium mb-2">No content matches your filters</p>
                                <p className="text-sm text-ink-warm-400 mb-4">Try adjusting your filter criteria</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setContentFilters({
                                      kol_ids: [],
                                      platforms: [],
                                      types: [],
                                      statuses: [],
                                      impressions_operator: '',
                                      impressions_value: '',
                                      likes_operator: '',
                                      likes_value: '',
                                      retweets_operator: '',
                                      retweets_value: '',
                                      comments_operator: '',
                                      comments_value: '',
                                      bookmarks_operator: '',
                                      bookmarks_value: ''
                                    });
                                    setContentsSearchTerm('');
                                  }}
                                >
                                  Reset All Filters
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredContents.map((content: any, index: number) => {
                          const kol = campaignKOLs.find((k: any) => k.id === content.campaign_kols_id);
                          // [TG Bot Phase 2] Amber tint highlights rows that bot-approved
                          // but a team member hasn't verified yet. Inline Verify button
                          // sits in the Actions column.
                          const isPendingVerify = content.status === 'pending_verification';
                          const rowBg = isPendingVerify
                            ? 'bg-amber-50/60'
                            : (index % 2 === 0 ? 'bg-white' : 'bg-cream-50');
                          return (
                            <TableRow key={content.id} className={`${rowBg} hover:bg-cream-100 transition-colors border-b border-cream-200`}>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 px-4 py-2 overflow-hidden text-center text-ink-warm-700 group`} style={{ verticalAlign: 'middle', minWidth: '60px', width: '60px' }}>
                                <div className="flex items-center justify-center w-full h-full">
                                  {selectedContents.includes(content.id) ? (
                                    <Checkbox
                                      checked={true}
                                      onCheckedChange={checked => {
                                        setSelectedContents(prev => checked ? [...prev, content.id] : prev.filter(id => id !== content.id));
                                      }}
                                      className="mx-auto"
                                    />
                                  ) : (
                                    <>
                                      <span className="block group-hover:hidden w-full text-center">{index + 1}</span>
                                      <span className="hidden group-hover:flex w-full justify-center">
                                        <Checkbox
                                          checked={selectedContents.includes(content.id)}
                                          onCheckedChange={checked => {
                                            setSelectedContents(prev => checked ? [...prev, content.id] : prev.filter(id => id !== content.id));
                                          }}
                                          className="mx-auto"
                                        />
                                      </span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden text-ink-warm-700 group`} style={{ verticalAlign: 'middle', fontWeight: 'bold', width: '20%' }}>
                                <div className="flex items-center w-full h-full">
                                  {renderEditableContentCell(content.campaign_kols_id, 'campaign_kols_id', content)}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.platform, 'platform', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.type, 'type', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.status, 'status', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'activation_date')}
                                onClick={(e) => {
                                  // Don't select if clicking on input during edit
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'activation_date') {
                                    handleCellSelect('contents', content.id, 'activation_date', content.activation_date);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.activation_date, 'activation_date', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'content_link')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'content_link') {
                                    handleCellSelect('contents', content.id, 'content_link', content.content_link);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.content_link, 'content_link', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'impressions')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'impressions') {
                                    handleCellSelect('contents', content.id, 'impressions', content.impressions);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.impressions, 'impressions', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'likes')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'likes') {
                                    handleCellSelect('contents', content.id, 'likes', content.likes);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.likes, 'likes', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'retweets')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'retweets') {
                                    handleCellSelect('contents', content.id, 'retweets', content.retweets);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.retweets, 'retweets', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'comments')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'comments') {
                                    handleCellSelect('contents', content.id, 'comments', content.comments);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.comments, 'comments', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'bookmarks')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'bookmarks') {
                                    handleCellSelect('contents', content.id, 'bookmarks', content.bookmarks);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.bookmarks, 'bookmarks', content)}
                              </TableCell>
                              {/* Section 7.5 — Tags cell. Self-contained
                                  in ContentTagCell so the assignment +
                                  picker logic doesn't bloat this file. */}
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-visible`}>
                                <ContentTagCell key={tagRefreshKey} contentId={content.id} tags={globalTags} />
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'notes')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'notes') {
                                    handleCellSelect('contents', content.id, 'notes', content.notes);
                                  }
                                }}
                              >
                                {/* Client-facing tag badges — parity with the
                                    public campaign page's Notes cell. Lets
                                    the team see at a glance which content
                                    the client sees as showcase-tagged. */}
                                <ClientFacingTagBadges contentId={content.id} tags={globalTags} />
                                {renderEditableContentCell(content.notes, 'notes', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} p-2 overflow-hidden`}>
                                <div className="flex items-center gap-1">
                                  {content.status === 'pending_verification' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                                      onClick={() => handleVerifyContent(content.id)}
                                      title="Verify — flip to Posted and count toward metrics"
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Verify
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => setDeleteContentPending(content)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

      {/* Bulk Delete confirmation — moved from the page's trailing
          dialog cluster into the component on 2026-06-02 so the
          delete flow is fully Table-view-internal. */}
      {/* Single-row content delete. Always confirms, and when payments point at
          this content it makes the choice explicit rather than silently
          orphaning them. "Content only" stays available — a payment that has
          actually been sent shouldn't vanish because the post came down — but
          the consequence is spelled out. [2026-08-10] */}
      <Dialog open={!!deleteContentPending} onOpenChange={(o) => { if (!o) setDeleteContentPending(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this content?</DialogTitle>
          </DialogHeader>
          {(() => {
            const pending = deleteContentPending;
            if (!pending) return null;
            const { linked, sole, shared } = splitLinkedPayments(pending.id);
            const total = sole.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
            return (
              <>
                <div className="text-sm text-ink-warm-700 mt-2 space-y-1">
                  {pending.content_link && (
                    <p className="font-mono text-xs break-all text-gray-500">{pending.content_link}</p>
                  )}
                  <p>This can&apos;t be undone.</p>
                </div>

                {linked.length > 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm mt-1">
                    <p className="font-medium text-amber-800">
                      {linked.length} payment{linked.length !== 1 ? 's' : ''} linked to this content
                    </p>
                    {sole.length > 0 && (
                      <p className="text-amber-700 mt-1 tabular-nums">
                        ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} would be deleted
                      </p>
                    )}
                    {shared.length > 0 && (
                      <p className="text-amber-700 mt-1">
                        {shared.length} of them also cover{shared.length === 1 ? 's' : ''} other posts — that payment is
                        unlinked from this one, not deleted.
                      </p>
                    )}
                    <p className="text-amber-700 mt-2 text-xs">
                      Keeping them leaves the payment with no content behind it — it stays
                      on the campaign&apos;s budget but disappears from any per-post reporting.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">No payments are linked to this content.</p>
                )}

                <DialogFooter className="border-t border-cream-100 pt-3 mt-0 gap-2">
                  <Button variant="outline" onClick={() => setDeleteContentPending(null)}>Cancel</Button>
                  {linked.length > 0 && (
                    <Button variant="outline" onClick={() => handleDeleteContent(pending.id, false)}>
                      Content only
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => handleDeleteContent(pending.id, true)}>
                    {linked.length > 0
                      ? `Delete content + ${linked.length} payment${linked.length !== 1 ? 's' : ''}`
                      : 'Delete content'}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
          </DialogHeader>
          {(() => {
            const linkedPayments = payments.filter((p: any) => {
              const ids = Array.isArray(p.content_id) ? p.content_id : (p.content_id ? [p.content_id] : []);
              return ids.some((id: string) => selectedContents.includes(id));
            });
            return (
              <>
                <div className="text-sm text-ink-warm-700 mt-2 mb-2">
                  Are you sure you want to delete {selectedContents.length} content item{selectedContents.length !== 1 ? 's' : ''}?
                </div>
                {linkedPayments.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-amber-800">
                      {linkedPayments.length} linked payment{linkedPayments.length !== 1 ? 's' : ''} will also be deleted
                    </p>
                    <p className="text-amber-700 mt-1">
                      Total: ${linkedPayments
                        .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </>
            );
          })()}
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDeleteContents}>
              Delete Content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* First-time repost-rate confirm — fires when a content type is
          set to 'Repost' for a KOL whose repost_rate isn't on file yet.
          Pre-fills with 50% of standard_rate. Once saved, the Budget
          Dashboard picks up the new rate for every Repost row. */}
      {repostRateDialog && (
        <SetRepostRateDialog
          open={repostRateDialog.open}
          onOpenChange={(open) => {
            if (!open) setRepostRateDialog(null);
          }}
          masterKolId={repostRateDialog.masterKolId}
          kolName={repostRateDialog.kolName}
          masterStandardRate={repostRateDialog.standardRate}
          onSaved={(rate) => {
            // Reflect the saved repost_rate locally so the budget +
            // future Repost flips on the same KOL pick it up without a
            // page refresh. campaignKOLs[].master_kol is the source
            // of truth that contents[].master_kol points at.
            setContents((prev: any[]) => prev.map((c) =>
              c.master_kol?.id === repostRateDialog.masterKolId
                ? { ...c, master_kol: { ...c.master_kol, repost_rate: rate } }
                : c
            ));
            setRepostRateDialog(null);
          }}
        />
      )}
    </>
  );
}
