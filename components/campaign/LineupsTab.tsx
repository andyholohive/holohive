'use client';

/**
 * Lineups tab on the campaign admin page.
 *
 * HHP Lineup Manager Spec (Jdot, 2026-06-01). Per-week KOL selection
 * with angle groupings + state machine (Draft → Proposed → Confirmed
 * → Completed). Self-contained component so the campaign admin page
 * doesn't grow.
 *
 * Feature inventory after Day 5 polish:
 *   • Week selector with status badges + current-week preselect
 *   • Roster panel (left): full campaign roster + performance data,
 *     search
 *   • Lineup panel (right): drag-and-drop assignment via @dnd-kit,
 *     drag-reorder within angles
 *   • Actions bar (status-gated): Save Draft / Propose / Confirm /
 *     Unlock / Duplicate
 *   • Audit log popover from the actions bar
 *   • Read-only summary panel for confirmed/completed lineups
 *   • TG notifications fire on every state transition via
 *     /api/lineups/[lineupId]/notify
 *
 * Notes:
 *   • DnD-kit is configured for click-or-drag — single-click on the
 *     KOL "+ A" button still works for keyboard users; drag for
 *     pointer fluency. Keeps accessibility from regressing vs the
 *     previous button-only iteration.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Plus, X, ChevronDown, Send, CheckCircle2, Unlock, Copy,
  Save, Users, Activity, Trash2, Edit2, History, GripVertical,
  AlertTriangle, ListChecks,
} from 'lucide-react';
import {
  DndContext, DragOverlay, type DragEndEvent, type DragStartEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  sortableKeyboardCoordinates, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/dateFormat';
import {
  LineupManagerService,
  type LineupStatus,
  type LineupFull,
  type CampaignLineup,
  type LineupActivityLogRow,
  type LineupActivityAction,
  mondayOfCampaignWeek,
  currentWeekNumber,
} from '@/lib/lineupManagerService';

// ─── Types specific to this UI ─────────────────────────────────────

type RosterKol = {
  id: string;           // master_kol id (used as drag id)
  campaign_kol_id: string;
  name: string;
  link: string | null;
  followers: number | null;
  platform: string[] | null;
  // region intentionally kept on the row for filtering but no longer
  // rendered per Jdot 2026-06-11 — keeps the meta line scannable.
  region: string | null;
  hh_status: string | null;
  // Performance aggregates this campaign. Engagement rate is shown
  // instead of total engagements per Jdot 2026-06-11 — relative
  // signal reads better than absolute volume when comparing KOLs
  // mid-campaign.
  content_count: number;
  total_views: number;
  total_engagements: number;
  // Activation recency — last week_number this KOL was in a confirmed
  // lineup, or null if never.
  last_active_week: number | null;
};

const STATUS_TONE: Record<LineupStatus, BadgeTone> = {
  draft:     'neutral',
  proposed:  'warning',
  confirmed: 'success',
  completed: 'info',
};

const STATUS_LABEL: Record<LineupStatus, string> = {
  draft:     'Draft',
  proposed:  'Proposed',
  confirmed: 'Confirmed',
  completed: 'Completed',
};

const ACTION_LABEL: Record<LineupActivityAction, string> = {
  draft_saved:    'Draft saved',
  proposed:       'Proposed',
  confirmed:      'Confirmed',
  completed:      'Marked completed',
  unlocked:       'Unlocked',
  duplicated:     'Duplicated',
  kol_added:      'KOL added',
  kol_removed:    'KOL removed',
  angle_added:    'Angle added',
  angle_removed:  'Angle removed',
  angle_renamed:  'Angle renamed',
  slot_reordered: 'Slots reordered',
};

function shortNum(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

// ─── Component ──────────────────────────────────────────────────────

export default function LineupsTab({
  campaignId,
  campaignStartDate,
  campaignEndDate,
  currentUserId,
  currentUserName,
  campaignName,
}: {
  campaignId: string;
  campaignStartDate: string;
  campaignEndDate: string;
  currentUserId: string | null;
  currentUserName: string;
  campaignName: string;
}) {
  const { toast } = useToast();
  const service = useMemo(() => new LineupManagerService(supabase as any), []);

  // ─── State ────────────────────────────────────────────────────────
  const [allLineups, setAllLineups] = useState<CampaignLineup[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [lineup, setLineup] = useState<LineupFull | null>(null);
  const [roster, setRoster] = useState<RosterKol[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterSearch, setRosterSearch] = useState('');
  const [busy, setBusy] = useState(false);
  // DnD overlay item — the KOL being dragged, for the ghost preview.
  const [draggingKolId, setDraggingKolId] = useState<string | null>(null);

  // ─── Custom dialog state (replaces native window.prompt/confirm) ──
  // Rename angle dialog
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Delete angle confirm
  const [deleteAngleTarget, setDeleteAngleTarget] = useState<{ id: string; name: string; slotCount: number } | null>(null);
  // Unlock confirmed lineup
  const [unlockOpen, setUnlockOpen] = useState(false);
  // Delete whole lineup confirm
  const [deleteLineupOpen, setDeleteLineupOpen] = useState(false);

  // ─── Derived ──────────────────────────────────────────────────────

  const totalWeeks = useMemo(() => {
    if (!campaignStartDate || !campaignEndDate) return 1;
    const start = new Date(campaignStartDate + 'T00:00:00Z');
    const end = new Date(campaignEndDate + 'T00:00:00Z');
    if (end <= start) return 1;
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(1, Math.ceil(days / 7));
  }, [campaignStartDate, campaignEndDate]);

  const lineupByWeek = useMemo(() => {
    const m = new Map<number, CampaignLineup>();
    for (const l of allLineups) m.set(l.week_number, l);
    return m;
  }, [allLineups]);

  const selectedKolIds = useMemo(() => {
    const s = new Set<string>();
    if (!lineup) return s;
    for (const angle of lineup.angles) {
      for (const slot of angle.slots) s.add(slot.kol_id);
    }
    return s;
  }, [lineup]);

  const filteredRoster = useMemo(() => {
    if (!rosterSearch.trim()) return roster;
    const q = rosterSearch.toLowerCase();
    return roster.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.region && r.region.toLowerCase().includes(q)) ||
      (r.platform && r.platform.some(p => p.toLowerCase().includes(q))),
    );
  }, [roster, rosterSearch]);

  /** Roster lookup by master_kol id — used by drag-to-drop. */
  const rosterById = useMemo(() => {
    const m = new Map<string, RosterKol>();
    for (const r of roster) m.set(r.id, r);
    return m;
  }, [roster]);

  // ─── DnD sensors ─────────────────────────────────────────────────

  const sensors = useSensors(
    // Slight activation distance so a single click on the KOL row
    // doesn't accidentally start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ─── Initial load (single fetch — no double-flash) ───────────────
  //
  // Originally split across two useEffects (roster+list, then per-week
  // full lineup), which made the tab appear to load twice when clicked.
  // Now merged: we load everything serially, then derive the current
  // week's full lineup in the same effect before setLoading(false).
  //
  // Dep is `campaignId` only — campaignStartDate may be a Date object
  // created on parent renders, which would cause this effect to refire
  // every time the parent updates anything. We snapshot it via ref.

  const campaignStartDateRef = useRef(campaignStartDate);
  campaignStartDateRef.current = campaignStartDate;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [lineups, rosterRows] = await Promise.all([
          service.listForCampaign(campaignId),
          fetchRosterWithPerformance(campaignId),
        ]);
        setAllLineups(lineups);
        setRoster(rosterRows);
        const curr = currentWeekNumber(campaignStartDateRef.current) || 1;
        const week = Math.max(1, Math.min(curr, totalWeeks));
        setSelectedWeek(week);
        // Fetch the selected week's full lineup right here so loading
        // stays true until both phases finish.
        const existing = lineups.find(l => l.week_number === week);
        if (existing) {
          const full = await service.getLineupFull(existing.id);
          setLineup(full);
        } else {
          setLineup(null);
        }
      } catch (err: any) {
        toast({ title: 'Failed to load lineups', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // ─── Switch weeks (no spinner — fires when user changes the week) ──

  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        const existing = lineupByWeek.get(selectedWeek);
        if (existing) {
          const full = await service.getLineupFull(existing.id);
          setLineup(full);
        } else {
          setLineup(null);
        }
      } catch (err: any) {
        toast({ title: 'Load failed', description: err?.message, variant: 'destructive' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, allLineups]);

  // ─── Helpers ─────────────────────────────────────────────────────

  async function refreshLineup() {
    if (!lineup) return;
    const fresh = await service.getLineupFull(lineup.id);
    setLineup(fresh);
  }

  async function refreshAll() {
    const list = await service.listForCampaign(campaignId);
    setAllLineups(list);
    if (lineup) {
      const fresh = await service.getLineupFull(lineup.id);
      setLineup(fresh);
    }
  }

  async function handleStartLineup() {
    setBusy(true);
    try {
      const weekOf = mondayOfCampaignWeek(campaignStartDate, selectedWeek);
      const created = await service.getOrCreateForWeek(
        campaignId, selectedWeek, weekOf, currentUserId,
      );
      const full = await service.getLineupFull(created.id);
      setLineup(full);
      setAllLineups(prev => [created, ...prev]);
      toast({ title: `Week ${selectedWeek} draft started` });
    } catch (err: any) {
      toast({ title: 'Failed to start lineup', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAngle() {
    if (!lineup) return;
    // Per Andy 2026-06-18: number angles instead of lettering them.
    // Naming is 1-indexed and follows the position the new angle will occupy.
    const nextNumber = lineup.angles.length + 1;
    setBusy(true);
    try {
      await service.createAngle(lineup.id, `Angle ${nextNumber}`, lineup.angles.length, currentUserId);
      await refreshLineup();
    } catch (err: any) {
      toast({ title: 'Failed to add angle', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddKolToAngle(angleId: string, kolId: string) {
    setBusy(true);
    try {
      const angle = lineup?.angles.find(a => a.id === angleId);
      const nextOrder = angle ? angle.slots.length : 0;
      await service.addSlot(angleId, kolId, nextOrder, currentUserId);
      await refreshLineup();
    } catch (err: any) {
      toast({ title: 'Failed to add KOL', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSlot(slotId: string) {
    setBusy(true);
    try {
      await service.removeSlot(slotId, currentUserId);
      await refreshLineup();
    } catch (err: any) {
      toast({ title: 'Failed to remove KOL', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  /** Open the confirm-delete-angle dialog. Actual delete fires on confirm. */
  function handleRemoveAngle(angleId: string) {
    if (!lineup) return;
    const angle = lineup.angles.find(a => a.id === angleId);
    if (!angle) return;
    setDeleteAngleTarget({
      id: angle.id,
      name: angle.angle_name,
      slotCount: angle.slots.length,
    });
  }

  async function confirmDeleteAngle() {
    if (!deleteAngleTarget) return;
    setBusy(true);
    try {
      await service.deleteAngle(deleteAngleTarget.id, currentUserId);
      await refreshLineup();
      setDeleteAngleTarget(null);
    } catch (err: any) {
      toast({ title: 'Failed to remove angle', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  /** Open the rename-angle dialog. Actual rename fires on save. */
  function handleRenameAngle(angleId: string, currentName: string) {
    setRenameTarget({ id: angleId, name: currentName });
    setRenameValue(currentName);
  }

  async function confirmRenameAngle() {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    setBusy(true);
    try {
      await service.renameAngle(renameTarget.id, trimmed, currentUserId);
      await refreshLineup();
      setRenameTarget(null);
    } catch (err: any) {
      toast({ title: 'Failed to rename', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handlePropose() {
    if (!lineup) return;
    setBusy(true);
    try {
      await service.propose(lineup.id, currentUserId);
      await refreshAll();
      toast({ title: 'Lineup proposed', description: 'Sending TG DM to the approver…' });
      await notifyTransition(lineup.id, 'proposed', toast);
    } catch (err: any) {
      toast({ title: 'Propose failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!lineup) return;
    setBusy(true);
    try {
      const result = await service.confirm(lineup.id, currentUserId);
      await refreshAll();
      const desc =
        result.autoAddedKols.length > 0
          ? `Locked. Auto-added ${result.autoAddedKols.length} new KOL${result.autoAddedKols.length === 1 ? '' : 's'} to the tracker.`
          : 'Locked.';
      toast({ title: `Week ${lineup.week_number} confirmed`, description: desc });
      if (result.sideEffectErrors.length > 0) {
        toast({
          title: 'Some side effects failed',
          description: result.sideEffectErrors.join('; '),
          variant: 'destructive',
        });
      }
      await notifyTransition(lineup.id, 'confirmed', toast);
    } catch (err: any) {
      toast({ title: 'Confirm failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  /** Open the unlock confirmation dialog. Actual unlock fires on confirm. */
  function handleUnlock() {
    if (!lineup) return;
    setUnlockOpen(true);
  }

  async function confirmUnlock() {
    if (!lineup) return;
    setBusy(true);
    try {
      const idForNotify = lineup.id;
      await service.unlock(lineup.id, currentUserId);
      await refreshAll();
      setUnlockOpen(false);
      toast({ title: 'Lineup unlocked', description: 'Reverted to draft.' });
      await notifyTransition(idForNotify, 'unlocked', toast);
    } catch (err: any) {
      toast({ title: 'Unlock failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  /** Open the destructive delete-lineup confirmation. */
  function handleDeleteLineup() {
    if (!lineup) return;
    setDeleteLineupOpen(true);
  }

  async function confirmDeleteLineup() {
    if (!lineup) return;
    setBusy(true);
    try {
      const deletedWeek = lineup.week_number;
      await service.deleteLineup(lineup.id, currentUserId);
      // Clear local state and refresh the master list.
      setLineup(null);
      setAllLineups(prev => prev.filter(l => l.id !== lineup.id));
      setDeleteLineupOpen(false);
      toast({
        title: `Week ${deletedWeek} lineup deleted`,
        description: 'Angles, KOL slots, and the audit log were removed.',
      });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    if (!lineup) return;
    setBusy(true);
    try {
      const next = await service.duplicateToNextWeek(lineup.id, currentUserId);
      await refreshAll();
      toast({ title: `Duplicated to Week ${next.week_number}` });
      setSelectedWeek(next.week_number);
    } catch (err: any) {
      toast({ title: 'Duplicate failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  // ─── DnD handlers ────────────────────────────────────────────────

  function handleDragStart(e: DragStartEvent) {
    setDraggingKolId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setDraggingKolId(null);
    if (!lineup || !e.over) return;
    const kolId = String(e.active.id);
    const overId = String(e.over.id);

    // Drop target is either `angle:<id>` (drop on angle to add) or
    // `slot:<id>` (drop on existing slot to reorder within angle).
    if (overId.startsWith('angle:')) {
      const angleId = overId.slice('angle:'.length);
      // If kol is already in this angle, no-op.
      const angle = lineup.angles.find(a => a.id === angleId);
      if (!angle) return;
      if (angle.slots.some(s => s.kol_id === kolId)) return;
      // If kol is in another angle, move it (remove + add).
      const sourceSlot = lineup.angles
        .flatMap(a => a.slots)
        .find(s => s.kol_id === kolId);
      if (sourceSlot) {
        // Move between angles: remove from source, add to target.
        try {
          await service.removeSlot(sourceSlot.id, currentUserId);
        } catch { /* swallow */ }
      }
      await handleAddKolToAngle(angleId, kolId);
      return;
    }

    if (overId.startsWith('slot:')) {
      const targetSlotId = overId.slice('slot:'.length);
      // Find which angle the target slot belongs to.
      const targetAngle = lineup.angles.find(a => a.slots.some(s => s.id === targetSlotId));
      if (!targetAngle) return;
      const sourceSlot = lineup.angles
        .flatMap(a => a.slots)
        .find(s => s.kol_id === kolId);
      // Drag from roster to existing slot → add to that angle.
      if (!sourceSlot) {
        await handleAddKolToAngle(targetAngle.id, kolId);
        return;
      }
      // Reorder within the same angle.
      if (sourceSlot.angle_id === targetAngle.id) {
        const oldIdx = targetAngle.slots.findIndex(s => s.id === sourceSlot.id);
        const newIdx = targetAngle.slots.findIndex(s => s.id === targetSlotId);
        if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
        const reordered = arrayMove(targetAngle.slots, oldIdx, newIdx);
        try {
          await service.reorderSlots(targetAngle.id, reordered.map(s => s.id), currentUserId);
          await refreshLineup();
        } catch (err: any) {
          toast({ title: 'Reorder failed', description: err?.message, variant: 'destructive' });
        }
        return;
      }
      // Drag across angles, dropping on a slot → treat as add to the target angle.
      try {
        await service.removeSlot(sourceSlot.id, currentUserId);
      } catch { /* swallow */ }
      await handleAddKolToAngle(targetAngle.id, kolId);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 rounded-md max-w-[300px]" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  const isEditable = lineup
    ? lineup.status === 'draft' || lineup.status === 'proposed'
    : false;
  const isReadOnlySummary = lineup
    ? lineup.status === 'confirmed' || lineup.status === 'completed'
    : false;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* ─── Header — v11 kicker pattern matching BacklogTab / SpecsTab ─── */}
        <div className="flex items-start justify-between gap-3 flex-wrap pb-3 border-b border-cream-200">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-brand mb-1">
              Campaign · Lineups
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-ink-warm-900">
                Week {selectedWeek}
              </h2>
              {lineup && (
                <StatusBadge tone={STATUS_TONE[lineup.status]}>
                  {STATUS_LABEL[lineup.status]}
                </StatusBadge>
              )}
              {lineup?.confirmed_at && (
                <span className="text-[11px] text-ink-warm-500">
                  Confirmed {formatDateTime(lineup.confirmed_at)}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-warm-500 mt-1">
              Pick KOLs from the roster, group by angle, propose for approval.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Select value={String(selectedWeek)} onValueChange={(v) => setSelectedWeek(parseInt(v, 10))}>
              <SelectTrigger className="w-[160px] h-9 focus-brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(n => {
                  const existing = lineupByWeek.get(n);
                  return (
                    <SelectItem key={n} value={String(n)}>
                      Week {n}
                      {existing && (
                        <span className="ml-2 text-[10px] text-ink-warm-500">
                          · {STATUS_LABEL[existing.status]}
                        </span>
                      )}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ─── Actions row — status-gated ─── */}
        {lineup && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {lineup.status === 'draft' && (
              <>
                <Button size="sm" variant="outline" onClick={() => toast({ title: 'Saved' })}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Save Draft
                </Button>
                <Button size="sm" variant="brand" onClick={handlePropose} disabled={busy || lineup.angles.length === 0}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Propose
                </Button>
              </>
            )}
            {lineup.status === 'proposed' && (
              <Button size="sm" variant="brand" onClick={handleConfirm} disabled={busy}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Confirm
              </Button>
            )}
            {lineup.status === 'confirmed' && (
              <Button size="sm" variant="outline" onClick={handleUnlock} disabled={busy}>
                <Unlock className="h-3.5 w-3.5 mr-1" />
                Unlock
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleDuplicate} disabled={busy} title="Copy this week's lineup as next week's draft">
              <Copy className="h-3.5 w-3.5 mr-1" />
              Duplicate to next week
            </Button>
            <AuditLogButton lineupId={lineup.id} service={service} />
            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDeleteLineup}
                disabled={busy}
                className="border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                title="Delete this lineup entirely"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete lineup
              </Button>
            </div>
          </div>
        )}

        {/* ─── Body ─── */}
        {!lineup ? (
          <div className="border border-cream-200 rounded-lg bg-white">
            <EmptyState
              icon={ListChecks}
              title={`No lineup for Week ${selectedWeek} yet`}
              description="Start a draft, pick KOLs from the roster, propose for review."
              className="py-12"
            >
              <Button variant="brand" onClick={handleStartLineup} disabled={busy}>
                <Plus className="h-4 w-4 mr-1.5" />
                Start lineup for Week {selectedWeek}
              </Button>
            </EmptyState>
          </div>
        ) : isReadOnlySummary ? (
          <SummaryView lineup={lineup} rosterById={rosterById} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ─── Left: Roster ─── */}
            <div className="border border-cream-200 rounded-lg bg-white overflow-hidden flex flex-col max-h-[calc(100vh-280px)]">
              <div className="px-4 py-3 border-b border-cream-200 flex items-center gap-2 shrink-0">
                <Users className="h-3.5 w-3.5 text-brand" />
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-700">
                  Campaign Roster
                </p>
                <span className="text-[10px] text-ink-warm-500 ml-auto tabular-nums">
                  {filteredRoster.length} of {roster.length}
                </span>
              </div>
              <div className="px-3 py-2 border-b border-cream-100 shrink-0">
                <Input
                  placeholder="Search by name or platform…"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  className="focus-brand h-9 text-sm"
                />
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-cream-100">
                {filteredRoster.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No KOLs match"
                    description="Try widening the search."
                    className="py-10"
                  />
                ) : (
                  filteredRoster.map(kol => (
                    <RosterRow
                      key={kol.id}
                      kol={kol}
                      alreadyIn={selectedKolIds.has(kol.id)}
                      angles={lineup.angles}
                      isEditable={isEditable}
                      onAddToAngle={handleAddKolToAngle}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ─── Right: Lineup builder ─── */}
            <div className="border border-cream-200 rounded-lg bg-white overflow-hidden flex flex-col max-h-[calc(100vh-280px)]">
              <div className="px-4 py-3 border-b border-cream-200 flex items-center gap-2 shrink-0">
                <ListChecks className="h-3.5 w-3.5 text-brand" />
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-700">
                  Week {lineup.week_number} Lineup
                </p>
                <span className="text-[10px] text-ink-warm-500 ml-auto tabular-nums">
                  {selectedKolIds.size} KOL{selectedKolIds.size === 1 ? '' : 's'}
                </span>
              </div>
              <div className="overflow-y-auto flex-1 p-3 space-y-3">
                {lineup.angles.length === 0 && (
                  <EmptyState
                    icon={ChevronDown}
                    title="No angles yet"
                    description="Add one to start placing KOLs (or drag a KOL onto the area below once an angle exists)."
                    className="py-8"
                  />
                )}
                {lineup.angles.map(angle => (
                  <AngleCard
                    key={angle.id}
                    angle={angle}
                    rosterById={rosterById}
                    isEditable={isEditable}
                    onRename={handleRenameAngle}
                    onRemove={handleRemoveAngle}
                    onRemoveSlot={handleRemoveSlot}
                  />
                ))}
                {isEditable && (
                  <Button size="sm" variant="outline" onClick={handleAddAngle} disabled={busy} className="w-full focus-brand">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add angle
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Drag overlay (ghost during drag) ─── */}
      <DragOverlay>
        {draggingKolId ? (() => {
          const k = rosterById.get(draggingKolId);
          if (!k) return null;
          return (
            <div className="bg-white border border-brand/40 shadow-lg rounded-md px-3 py-1.5 text-sm font-medium text-ink-warm-900">
              {k.name}
            </div>
          );
        })() : null}
      </DragOverlay>

      {/* ─── Rename angle dialog ─── */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename angle</DialogTitle>
            <DialogDescription>
              Update the name for this angle. KOLs and ordering stay put.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="angle-rename-input">
              Angle name <RequiredAsterisk />
            </Label>
            <Input
              id="angle-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameValue.trim()) {
                  e.preventDefault();
                  void confirmRenameAngle();
                }
              }}
              className="focus-brand"
              autoFocus
              disabled={busy}
            />
          </div>
          <DialogFooter className="border-t border-cream-200 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenameTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={() => void confirmRenameAngle()}
              disabled={busy || !renameValue.trim()}
            >
              {busy ? 'Saving…' : 'Save name'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete angle confirm ─── */}
      <Dialog
        open={!!deleteAngleTarget}
        onOpenChange={(open) => { if (!open) setDeleteAngleTarget(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-600" />
              Remove angle?
            </DialogTitle>
            <DialogDescription>
              {deleteAngleTarget && (
                <>
                  This removes <span className="font-medium text-ink-warm-900">{deleteAngleTarget.name}</span>
                  {deleteAngleTarget.slotCount > 0 && (
                    <> and unassigns {deleteAngleTarget.slotCount} KOL slot{deleteAngleTarget.slotCount === 1 ? '' : 's'}</>
                  )}
                  . You can re-add the angle later, but the KOL ordering will be lost.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-200 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteAngleTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void confirmDeleteAngle()}
              disabled={busy}
            >
              {busy ? 'Removing…' : 'Remove angle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Unlock confirmed lineup confirm ─── */}
      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-4 w-4 text-brand" />
              Unlock this lineup?
            </DialogTitle>
            <DialogDescription>
              The lineup goes back to Draft so you can edit it. The TG proposer DM
              will be re-sent if you propose again. Side effects from the original
              confirmation (auto-added KOLs, ops chat post) are NOT reverted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-200 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUnlockOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={() => void confirmUnlock()}
              disabled={busy}
            >
              {busy ? 'Unlocking…' : 'Unlock & revert to draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete WHOLE lineup confirm — destructive ─── */}
      <Dialog open={deleteLineupOpen} onOpenChange={setDeleteLineupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              Delete Week {lineup?.week_number} lineup?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the lineup record, every angle, every KOL slot,
              and the full audit log for this week. Auto-added campaign KOLs and any
              TG posts already sent will NOT be undone — clean those up separately
              if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-700">
            This cannot be undone.
          </div>
          <DialogFooter className="border-t border-cream-200 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteLineupOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void confirmDeleteLineup()}
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete lineup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function RosterRow({
  kol, alreadyIn, angles, isEditable, onAddToAngle,
}: {
  kol: RosterKol;
  alreadyIn: boolean;
  angles: LineupFull['angles'];
  isEditable: boolean;
  onAddToAngle: (angleId: string, kolId: string) => void;
}) {
  // Roster rows are draggable so they can be dropped onto angles.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: kol.id,
    disabled: !isEditable || alreadyIn,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  // Engagement rate = total engagements / total views, expressed as %.
  // Per Jdot 2026-06-11 — replaces the raw engagement count which
  // doesn't scale across KOLs with different reach. NaN-safe.
  const engagementRatePct = kol.total_views > 0
    ? (kol.total_engagements / kol.total_views) * 100
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`px-3 py-2 hover:bg-cream-50/40 transition-colors ${alreadyIn ? 'opacity-50' : ''} ${isDragging ? 'opacity-30' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle — only when editable + not already in */}
        {isEditable && !alreadyIn && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="shrink-0 text-ink-warm-300 hover:text-ink-warm-500 cursor-grab active:cursor-grabbing mt-1"
            title="Drag to an angle"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-warm-900 truncate">
            {kol.name}
            {alreadyIn && (
              <span className="ml-1.5 text-[10px] font-normal text-brand">· In lineup</span>
            )}
          </p>
          {/* Meta line — region intentionally hidden per Jdot 2026-06-11.
              Region is still searchable via the search box. */}
          <div className="flex items-center gap-2 text-[10px] text-ink-warm-500 mt-0.5">
            {kol.platform && kol.platform.length > 0 && (
              <span>{kol.platform.join('/')}</span>
            )}
            {kol.followers != null && (
              <>
                {kol.platform && kol.platform.length > 0 && <span>·</span>}
                <span className="tabular-nums">{shortNum(kol.followers)} followers</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-ink-warm-600">
            <span title="Content posted this campaign">
              <Activity className="h-2.5 w-2.5 inline mr-0.5 text-ink-warm-400" />
              <span className="tabular-nums">{kol.content_count}</span>
            </span>
            <span title="Total views this campaign">
              <span className="tabular-nums">{shortNum(kol.total_views)}</span>{' '}
              <span className="text-ink-warm-400">views</span>
            </span>
            {/* Engagement rate % — replaces total engagement count
                per Jdot 2026-06-11. Relative signal compares cleanly
                across KOLs with different reach. */}
            <span title={`Engagement rate (engagements / views) — ${kol.total_engagements.toLocaleString()} engagements on ${kol.total_views.toLocaleString()} views`}>
              {engagementRatePct != null ? (
                <>
                  <span className="tabular-nums">{engagementRatePct.toFixed(1)}%</span>{' '}
                  <span className="text-ink-warm-400">ER</span>
                </>
              ) : (
                <span className="text-ink-warm-400">— ER</span>
              )}
            </span>
            {kol.last_active_week != null && (
              <span title="Last week confirmed in a lineup" className="ml-auto text-[10px] text-ink-warm-500">
                Last: Wk {kol.last_active_week}
              </span>
            )}
          </div>
        </div>
        {/* Per-angle add buttons. Availability cycle removed per Jdot
            2026-06-11. */}
        {isEditable && !alreadyIn && angles.length > 0 && (
          <div className="flex flex-col gap-1 shrink-0">
            {angles.map(angle => (
              <button
                key={angle.id}
                type="button"
                onClick={() => onAddToAngle(angle.id, kol.id)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand hover:bg-brand/20 transition-colors whitespace-nowrap"
                title={`Add to ${angle.angle_name}`}
              >
                + {angle.angle_name.replace(/^Angle /, '')}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AngleCard({
  angle, rosterById, isEditable, onRename, onRemove, onRemoveSlot,
}: {
  angle: LineupFull['angles'][number];
  rosterById: Map<string, RosterKol>;
  isEditable: boolean;
  onRename: (angleId: string, current: string) => void;
  onRemove: (angleId: string) => void;
  onRemoveSlot: (slotId: string) => void;
}) {
  // Angle cards are drop targets for KOLs being dragged onto them.
  const { isOver, setNodeRef } = useDroppable({
    id: `angle:${angle.id}`,
    disabled: !isEditable,
  });

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-md overflow-hidden transition-colors ${isOver ? 'border-brand bg-brand/5' : 'border-cream-200'}`}
    >
      <div className="px-3 py-2 border-b border-cream-100 bg-cream-50/40 flex items-center gap-2">
        <p className="text-sm font-medium text-ink-warm-900">{angle.angle_name}</p>
        <span className="text-[10px] text-ink-warm-500 tabular-nums">
          {angle.slots.length} KOL{angle.slots.length === 1 ? '' : 's'}
        </span>
        {isEditable && (
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onRename(angle.id, angle.angle_name)}
              className="text-ink-warm-400 hover:text-brand h-6 w-6 inline-flex items-center justify-center"
              title="Rename angle"
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(angle.id)}
              className="text-ink-warm-400 hover:text-rose-600 h-6 w-6 inline-flex items-center justify-center"
              title="Remove angle"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      <SortableContext
        items={angle.slots.map(s => `slot:${s.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="divide-y divide-cream-100">
          {angle.slots.length === 0 ? (
            <li className="px-3 py-3 text-[11px] text-ink-warm-500 italic">
              {isEditable ? 'Drag a KOL here or use the + button.' : 'Empty.'}
            </li>
          ) : (
            angle.slots.map(slot => (
              <SortableSlot
                key={slot.id}
                slot={slot}
                rosterKol={rosterById.get(slot.kol_id)}
                isEditable={isEditable}
                onRemove={onRemoveSlot}
              />
            ))
          )}
        </ul>
      </SortableContext>
    </div>
  );
}

function SortableSlot({
  slot, rosterKol, isEditable, onRemove,
}: {
  slot: LineupFull['angles'][number]['slots'][number];
  rosterKol: RosterKol | undefined;
  isEditable: boolean;
  onRemove: (slotId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `slot:${slot.id}`,
    disabled: !isEditable,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="px-3 py-2 flex items-center gap-2 bg-white">
      {isEditable && (
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="text-ink-warm-300 hover:text-ink-warm-500 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      )}
      <span className="text-sm text-ink-warm-900 truncate flex-1">
        {rosterKol?.name || slot.kol_id.slice(0, 8)}
      </span>
      {rosterKol && rosterKol.followers != null && (
        <span className="text-[10px] text-ink-warm-500 tabular-nums">
          {shortNum(rosterKol.followers)}
        </span>
      )}
      {isEditable && (
        <button
          type="button"
          onClick={() => onRemove(slot.id)}
          className="text-ink-warm-400 hover:text-rose-600 h-6 w-6 inline-flex items-center justify-center shrink-0"
          title="Remove from lineup"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}

// ─── Summary view (confirmed/completed) ────────────────────────────

function SummaryView({
  lineup,
  rosterById,
}: {
  lineup: LineupFull;
  rosterById: Map<string, RosterKol>;
}) {
  const totalKols = lineup.angles.reduce((s, a) => s + a.slots.length, 0);
  return (
    <div className="border border-cream-200 rounded-lg bg-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap pb-3 border-b border-cream-100">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-brand mb-1">
            Week {lineup.week_number} · Summary
          </p>
          <p className="text-lg font-bold text-ink-warm-900">
            {totalKols} KOL{totalKols === 1 ? '' : 's'} across {lineup.angles.length} angle{lineup.angles.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="text-right text-xs text-ink-warm-500">
          {lineup.confirmed_at && (
            <p>Confirmed {formatDateTime(lineup.confirmed_at)}</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {lineup.angles.map(angle => (
          <div key={angle.id} className="border border-cream-200 rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b border-cream-200 flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-700">
                {angle.angle_name}
              </p>
              <span className="text-[10px] text-ink-warm-500 tabular-nums">
                {angle.slots.length} KOL{angle.slots.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="divide-y divide-cream-100">
              {angle.slots.map(slot => {
                const k = rosterById.get(slot.kol_id);
                return (
                  <li key={slot.id} className="px-3 py-2 flex items-center gap-2">
                    <span className="text-sm text-ink-warm-900 truncate flex-1">
                      {k?.name || slot.kol_id.slice(0, 8)}
                    </span>
                    {slot.status === 'posted' && (
                      <StatusBadge tone="success" size="sm">Posted</StatusBadge>
                    )}
                    {slot.status === 'missed' && (
                      <StatusBadge tone="danger" size="sm">Missed</StatusBadge>
                    )}
                    {slot.status === 'pending' && (
                      <StatusBadge tone="neutral" size="sm">Pending</StatusBadge>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {lineup.status === 'completed' && (
        <div className="border-t border-cream-100 pt-3 text-xs text-ink-warm-500">
          {(() => {
            const posted = lineup.angles.flatMap(a => a.slots).filter(s => s.status === 'posted').length;
            return <p>{posted} of {totalKols} KOLs posted.</p>;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Audit log popover ─────────────────────────────────────────────

function AuditLogButton({
  lineupId,
  service,
}: {
  lineupId: string;
  service: LineupManagerService;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LineupActivityLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    service.getActivityLog(lineupId)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, lineupId, service]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Audit log">
          <History className="h-3.5 w-3.5 mr-1" />
          Audit
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end">
        <div className="p-3 border-b border-cream-100">
          <p className="text-sm font-semibold text-ink-warm-900">Activity log</p>
          <p className="text-[11px] text-ink-warm-500">Reverse chronological. Limit: latest 200.</p>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-6 rounded" />
              <Skeleton className="h-6 rounded" />
              <Skeleton className="h-6 rounded" />
            </div>
          ) : !rows || rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-ink-warm-500 italic">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-cream-100">
              {rows.slice(0, 200).map(r => (
                <li key={r.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-ink-warm-900">{ACTION_LABEL[r.action]}</p>
                    <span className="text-[10px] text-ink-warm-500 tabular-nums shrink-0">
                      {formatDateTime(r.ts)}
                    </span>
                  </div>
                  {r.details && (
                    <p className="text-[11px] text-ink-warm-500 mt-0.5">{r.details}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── TG notification dispatch ──────────────────────────────────────

async function notifyTransition(
  lineupId: string,
  event: 'proposed' | 'confirmed' | 'unlocked',
  toast: (args: { title: string; description?: string; variant?: 'destructive' }) => void,
): Promise<void> {
  try {
    const res = await fetch(`/api/lineups/${lineupId}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({
        title: 'Notification failed',
        description: json?.error || `HTTP ${res.status}`,
        variant: 'destructive',
      });
      return;
    }
    if (json?.skipped) {
      toast({
        title: 'Notification skipped',
        description: json.reason || 'Bot dispatch not configured for this event.',
      });
      return;
    }
    if (json?.ok) {
      const label =
        event === 'proposed' ? 'Approver DM' :
        event === 'confirmed' ? 'Ops chat post' :
        'Proposer DM';
      toast({
        title: `${label} sent`,
        description: json.recipient ? `→ ${json.recipient}` : undefined,
      });
    }
  } catch (err: any) {
    toast({
      title: 'Notification failed',
      description: err?.message || 'Network error',
      variant: 'destructive',
    });
  }
}

// ─── Roster fetch with performance data ────────────────────────────

async function fetchRosterWithPerformance(campaignId: string): Promise<RosterKol[]> {
  // Hidden KOLs are intentionally excluded — they shouldn't appear in the
  // lineup builder roster panel since hidden = "not part of this campaign
  // in any user-facing sense." Per Andy 2026-06-18.
  const { data: kolRows, error: kErr } = await (supabase as any)
    .from('campaign_kols')
    .select(`
      id, hh_status,
      master_kol:master_kols(id, name, link, followers, platform, region)
    `)
    .eq('campaign_id', campaignId)
    .or('hidden.is.null,hidden.eq.false')
    .is('deleted_at', null);
  if (kErr) throw kErr;

  type Row = {
    id: string;
    hh_status: string | null;
    master_kol: {
      id: string;
      name: string;
      link: string | null;
      followers: number | null;
      platform: string[] | null;
      region: string | null;
    } | null;
  };

  const rows = (kolRows || []) as Row[];
  if (rows.length === 0) return [];

  const campaignKolIds = rows.map(r => r.id);
  const { data: contentAgg } = await (supabase as any)
    .from('contents')
    .select('campaign_kols_id, impressions, likes, comments, retweets, bookmarks')
    .in('campaign_kols_id', campaignKolIds);
  const aggByKolId = new Map<string, { count: number; views: number; eng: number }>();
  for (const c of (contentAgg || []) as Array<{
    campaign_kols_id: string;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
    retweets: number | null;
    bookmarks: number | null;
  }>) {
    const prev = aggByKolId.get(c.campaign_kols_id) || { count: 0, views: 0, eng: 0 };
    aggByKolId.set(c.campaign_kols_id, {
      count: prev.count + 1,
      views: prev.views + (c.impressions || 0),
      eng: prev.eng + (c.likes || 0) + (c.comments || 0) + (c.retweets || 0) + (c.bookmarks || 0),
    });
  }

  const masterKolIds = rows.map(r => r.master_kol?.id).filter(Boolean) as string[];
  const { data: lineupHist } = await (supabase as any)
    .from('lineup_slots')
    .select('kol_id, lineup_angles!inner(lineup_id, campaign_lineups!inner(week_number, campaign_id, status))')
    .in('kol_id', masterKolIds.length > 0 ? masterKolIds : ['00000000-0000-0000-0000-000000000000']);
  const lastWeekByKol = new Map<string, number>();
  for (const row of (lineupHist || []) as any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
    const lineup = row.lineup_angles?.campaign_lineups;
    if (!lineup || lineup.campaign_id !== campaignId) continue;
    if (lineup.status !== 'confirmed' && lineup.status !== 'completed') continue;
    const wn = lineup.week_number as number;
    const prev = lastWeekByKol.get(row.kol_id);
    if (prev == null || wn > prev) lastWeekByKol.set(row.kol_id, wn);
  }

  return rows
    .filter(r => r.master_kol)
    .map(r => {
      const mk = r.master_kol!;
      const agg = aggByKolId.get(r.id) || { count: 0, views: 0, eng: 0 };
      return {
        id: mk.id,
        campaign_kol_id: r.id,
        name: mk.name,
        link: mk.link,
        followers: mk.followers,
        platform: mk.platform,
        region: mk.region,
        hh_status: r.hh_status,
        content_count: agg.count,
        total_views: agg.views,
        total_engagements: agg.eng,
        last_active_week: lastWeekByKol.get(mk.id) ?? null,
      } as RosterKol;
    })
    .sort((a, b) => (b.followers || 0) - (a.followers || 0));
}
