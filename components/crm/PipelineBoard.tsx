'use client';

/**
 * Pipeline v1.3 board — six-stage deal funnel, drag-and-drop.
 *
 * Extracted from the page so the page file stays small (CLAUDE.md: target
 * <1,500 lines; the board it replaces is 3,168).
 *
 * Cards read from `crm_opportunities.pipeline_stage`, which the legacy Sales
 * board does not write — see lib/pipelineV13Service.ts for why the two
 * vocabularies live side by side during the changeover.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, closestCorners, PointerSensor,
  useSensor, useSensors, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { Target, Send, ChevronsLeftRight, Archive } from 'lucide-react';
import {
  PipelineV13Service, BOARD_STAGES, STAGE_LABELS, STAGE_WIN_PCT, LOSS_REASONS,
  FIT_SUB_REASONS,
  daysIdle, isStalled, type PipelineDeal, type PipelineStage,
} from '@/lib/pipelineV13Service';

const money = (n: number | null) =>
  n === null || n === 0 ? '$0' : `$${Math.round(n).toLocaleString('en-US')}`;

/** Sources carry a tone so a board can be read by colour before text. */
const SOURCE_TONES: Record<string, BadgeTone> = {
  cold_outbound: 'slate', referral: 'purple', inbound: 'success',
  event: 'info', discovery: 'brand',
};

/** Written-out labels rather than the stored key. The column holds
 *  'cold_outbound'; nobody should read that on a card. Anything not listed
 *  falls back to Title Case so a new source value still reads properly
 *  instead of showing up as snake_case. */
const SOURCE_LABELS: Record<string, string> = {
  cold_outbound: 'Cold Outbound',
  referral: 'Referral',
  inbound: 'Inbound',
  event: 'Event',
  discovery: 'Discovery',
};

const titleCase = (v: string) =>
  v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const sourceLabel = (v: string) => SOURCE_LABELS[v] ?? titleCase(v);

/** Where this deal stands on the Outreach board. Its own vocabulary, shortened
 *  to fit a card — the full status lives on /crm/outreach. */
const OUTREACH_CHIP: Record<string, string> = {
  lead: 'Lead',
  lead_trial: 'Trial',
  response_interested: 'Interested',
  response_referred: 'Referred',
  team_engaged: 'Team Engaged',
};

function OutreachChip({ status }: { status: string }) {
  return (
    <StatusBadge tone="brand" size="sm">
      {OUTREACH_CHIP[status] ?? titleCase(status)}
    </StatusBadge>
  );
}

/** Initials for the owner dot. Local helper, not a shadow of the shared
 *  Avatar primitive — see CLAUDE.md. */
function ownerInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w.charAt(0).toUpperCase()).join('').slice(0, 2);
}

function DealCard({
  deal, dragging, onSaveValue,
}: {
  deal: PipelineDeal;
  dragging?: boolean;
  /** Absent in the drag overlay, where editing makes no sense. */
  onSaveValue?: (id: string, value: number | null) => Promise<void>;
}) {
  const idle = daysIdle(deal);
  const stalled = isStalled(deal);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = async () => {
    setEditing(false);
    if (!onSaveValue) return;
    const raw = draft.trim();
    const next = raw === '' ? null : Number(raw.replace(/[$,]/g, ''));
    if (next !== null && !Number.isFinite(next)) return;
    if (next === deal.deal_value) return;
    await onSaveValue(deal.id, next);
  };

  return (
    <div
      className={`group/card rounded-lg border bg-white transition-all ${
        stalled ? 'border-rose-200' : 'border-cream-200'
      } ${dragging ? 'shadow-card rotate-1' : 'hover:border-cream-300 hover:shadow-card'}`}
    >
      {/* A hairline in the stage's own colour, so a card that has been dragged
          out of its column is obvious before you read anything on it. */}
      <div className={`h-0.5 rounded-t-lg ${stalled ? 'bg-rose-300' : 'bg-brand/30'}`} />

      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-ink-warm-900 leading-snug break-words">
            {deal.name}
          </span>
          <span
            className={`text-[10px] tabular-nums flex-shrink-0 mt-0.5 ${
              stalled ? 'text-rose-600 font-semibold' : 'text-ink-warm-300'
            }`}
            title={stalled ? `No activity for ${idle} days` : `Last activity ${idle} days ago`}
          >
            {idle}d
          </span>
        </div>

        {/* Value is editable in place. It was the loudest thing on every card
            while being the one field nobody had filled — a warning you cannot
            act on from where you are reading it is just noise, so it is now a
            quiet prompt that turns into an input. */}
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void commit(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            onPointerDown={e => e.stopPropagation()}
            className="h-7 text-sm focus-brand"
            placeholder="0"
          />
        ) : (
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => {
              if (!onSaveValue) return;
              setDraft(deal.deal_value ? String(deal.deal_value) : '');
              setEditing(true);
            }}
            className="text-left w-full"
          >
            {deal.deal_value ? (
              <span className="text-base font-bold tabular-nums text-ink-warm-900">
                {money(deal.deal_value)}
              </span>
            ) : (
              <span className="text-xs text-ink-warm-300 group-hover/card:text-brand transition-colors">
                + Add value
              </span>
            )}
          </button>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          {deal.source && (
            <StatusBadge tone={SOURCE_TONES[deal.source] ?? 'neutral'} size="sm">
              {sourceLabel(deal.source)}
            </StatusBadge>
          )}
          {deal.outreach_status && <OutreachChip status={deal.outreach_status} />}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-cream-100">
          <span className="flex items-center gap-1.5 min-w-0" title={deal.owner_name ?? 'Unassigned'}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
              deal.owner_name ? 'bg-brand-light text-brand' : 'bg-cream-100 text-ink-warm-300'
            }`}>
              {ownerInitials(deal.owner_name)}
            </span>
            <span className="text-[11px] text-ink-warm-500 truncate">
              {deal.owner_name ?? 'Unassigned'}
            </span>
          </span>
          {deal.next_action_at && (
            <span className="text-[10px] text-ink-warm-400 flex-shrink-0 tabular-nums">
              {formatDate(deal.next_action_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableCard({
  deal, onSaveValue,
}: {
  deal: PipelineDeal;
  onSaveValue: (id: string, value: number | null) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      /* select-none / touch-none: without them a press-and-move selects the
         card's text instead of starting the drag — the pointer sensor never
         activates and the card just highlights. touch-none is what makes drag
         work at all on a trackpad-less touch screen. */
      className={`cursor-grab active:cursor-grabbing select-none touch-none ${isDragging ? 'opacity-40' : ''}`}
    >
      <DealCard deal={deal} onSaveValue={onSaveValue} />
    </div>
  );
}

function Column({
  stage, deals, collapsed, onToggle, onSaveValue,
}: {
  stage: PipelineStage;
  deals: PipelineDeal[];
  collapsed: boolean;
  onToggle: () => void;
  onSaveValue: (id: string, value: number | null) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const value = deals.reduce((s, d) => s + (d.deal_value ?? 0), 0);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        ref={setNodeRef}
        className={`w-12 rounded-lg border ${isOver ? 'border-brand bg-brand-light' : 'border-cream-200 bg-cream-50'} flex flex-col items-center py-3 gap-2`}
        title={`${STAGE_LABELS[stage]} — click to expand`}
      >
        <span className="text-xs font-bold tabular-nums text-ink-warm-700">{deals.length}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-warm-500 [writing-mode:vertical-rl]">
          {STAGE_LABELS[stage]}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border flex flex-col min-h-[200px] ${
        isOver ? 'border-brand bg-brand-light/40' : 'border-cream-200 bg-cream-50/40'
      } transition-colors`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="group px-3 py-2.5 text-left border-b border-cream-200 bg-cream-50 hover:bg-cream-100/70 rounded-t-lg transition-colors"
        title="Collapse this column"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
            {STAGE_LABELS[stage]}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold tabular-nums text-ink-warm-700 bg-cream-100 rounded-full px-1.5">
              {deals.length}
            </span>
            <ChevronsLeftRight className="h-3 w-3 text-ink-warm-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        </div>
        <div className="text-[11px] text-ink-warm-500 tabular-nums mt-0.5 flex items-center gap-1.5">
          <span className={value > 0 ? 'font-semibold text-ink-warm-700' : 'text-ink-warm-300'}>
            {value > 0 ? money(value) : 'no value yet'}
          </span>
          <span className="text-ink-warm-300">·</span>
          <span>{STAGE_WIN_PCT[stage]}%</span>
        </div>
      </button>
      <div className="p-2 space-y-2 flex-1">
        {deals.map(d => <DraggableCard key={d.id} deal={d} onSaveValue={onSaveValue} />)}
      </div>
    </div>
  );
}

/** Drop target for an outcome. Separate from the columns because closing is
 *  not the same kind of move as advancing — it ends the deal and, for a loss,
 *  demands a reason. */
function OutcomeZone({ id, label, tone }: { id: string; label: string; tone: 'won' | 'lost' }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const base = tone === 'won'
    ? 'border-emerald-300 text-emerald-700 bg-emerald-50/60'
    : 'border-rose-300 text-rose-700 bg-rose-50/60';
  const over = tone === 'won' ? 'border-emerald-500 bg-emerald-100' : 'border-rose-500 bg-rose-100';
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 rounded-lg border border-dashed px-4 py-3 text-center text-xs font-medium transition-colors ${isOver ? over : base}`}
    >
      {label}
    </div>
  );
}

export default function PipelineBoard() {
  const { toast } = useToast();
  const [deals, setDeals] = useState<PipelineDeal[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<PipelineStage>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState('all');
  /** Archived deals are a different question — "what did we used to have" —
   *  so they get their own view rather than a row on the working board. */
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [sourceFilter, setSourceFilter] = useState('all');
  /** A loss needs a reason before it can be recorded, so the drop opens this
   *  rather than closing the deal immediately. */
  const [lossFor, setLossFor] = useState<PipelineDeal | null>(null);
  const [lossReason, setLossReason] = useState('');
  /** Second level, shown only for reasons that carry sub-reasons (Fit). */
  const [lossSubReason, setLossSubReason] = useState('');
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so clicking a card to read
    // it does not fling it into the next column.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const load = useCallback(async () => {
    try {
      setDeals(await PipelineV13Service.listBoard({ archived: showArchived }));
      if (!showArchived) {
        const arch = await PipelineV13Service.listBoard({ archived: true });
        setArchivedCount(arch.length);
      }
    } catch (err: any) {
      toast({ title: 'Could not load the pipeline', description: err?.message, variant: 'destructive' });
      setDeals([]);
    }
  }, [toast, showArchived]);

  useEffect(() => { void load(); }, [load]);

  const owners = useMemo(() => Array.from(new Set(
    (deals ?? []).map(d => d.owner_name).filter(Boolean) as string[],
  )).sort(), [deals]);
  const sources = useMemo(() => Array.from(new Set(
    (deals ?? []).map(d => d.source).filter(Boolean) as string[],
  )).sort(), [deals]);

  const visible = useMemo(() => (deals ?? []).filter(d =>
    (ownerFilter === 'all' || d.owner_name === ownerFilter)
    && (sourceFilter === 'all' || d.source === sourceFilter)
  ), [deals, ownerFilter, sourceFilter]);

  const byStage = useMemo(() => {
    const m = new Map<PipelineStage, PipelineDeal[]>();
    for (const s of BOARD_STAGES) m.set(s, []);
    for (const d of visible) m.get(d.pipeline_stage)?.push(d);
    // Highest weighted value first — the board should lead with the deal worth
    // the most attention, not the one entered most recently.
    for (const [, list] of m) {
      list.sort((a, b) =>
        (b.deal_value ?? 0) * STAGE_WIN_PCT[b.pipeline_stage]
        - (a.deal_value ?? 0) * STAGE_WIN_PCT[a.pipeline_stage]);
    }
    return m;
  }, [visible]);

  const totals = useMemo(() => {
    const total = visible.reduce((s, d) => s + (d.deal_value ?? 0), 0);
    const weighted = visible.reduce(
      (s, d) => s + (d.deal_value ?? 0) * STAGE_WIN_PCT[d.pipeline_stage] / 100, 0);
    return {
      total, weighted,
      stalled: visible.filter(isStalled).length,
      // Counted here rather than shouted on each card: it is one fact about
      // the board, not a property of every deal on it.
      noValue: visible.filter(d => !d.deal_value).length,
    };
  }, [visible]);

  const dragged = dragId ? (deals ?? []).find(d => d.id === dragId) ?? null : null;

  const saveValue = useCallback(async (id: string, value: number | null) => {
    const before = deals ?? [];
    setDeals(before.map(d => (d.id === id ? { ...d, deal_value: value } : d)));
    try {
      await PipelineV13Service.setValue(id, value);
    } catch (err: any) {
      setDeals(before);
      toast({ title: 'Could not save the value', description: err?.message, variant: 'destructive' });
    }
  }, [deals, toast]);

  async function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const id = String(e.active.id);
    const target = e.over ? String(e.over.id) : null;
    if (!target) return;
    const deal = (deals ?? []).find(d => d.id === id);
    if (!deal) return;

    if (target === 'zone-lost') {
      setLossFor(deal); setLossReason(''); setLossSubReason(''); return;
    }

    const next: PipelineStage | 'closed_won' =
      target === 'zone-won' ? 'closed_won' : (target as PipelineStage);
    if (next === deal.pipeline_stage) return;

    // Optimistic: the card moves under the cursor, and reverts on failure.
    const before = deals ?? [];
    setDeals(next === 'closed_won'
      ? before.filter(d => d.id !== id)
      : before.map(d => (d.id === id ? { ...d, pipeline_stage: next } : d)));
    try {
      if (next === 'closed_won') await PipelineV13Service.close(id, 'closed_won');
      else await PipelineV13Service.setStage(id, next);
    } catch (err: any) {
      setDeals(before);
      toast({ title: 'Move failed', description: err?.message, variant: 'destructive' });
    }
  }

  async function confirmLoss() {
    if (!lossFor || !lossReason) return;
    const reason = LOSS_REASONS.find(r => r.key === lossReason);
    // A reason that carries sub-reasons is not recorded without one — the
    // whole point is that "Fit" on its own says nothing.
    if (reason?.subReasons && !lossSubReason) return;
    setSaving(true);
    try {
      // Timing and internal priority are not verdicts on the deal, so they park
      // it in Orbit instead of closing it — it comes back when the reason does.
      await PipelineV13Service.close(
        lossFor.id, reason?.orbit ? 'orbit' : 'closed_lost',
        lossReason, lossSubReason || undefined);
      setDeals(prev => (prev ?? []).filter(d => d.id !== lossFor.id));
      toast({
        title: reason?.orbit ? 'Moved to Orbit' : 'Closed lost',
        description: reason?.orbit
          ? `${lossFor.name} — ${reason.label} is a reason to revisit, not to close.`
          : `${lossFor.name} — ${reason?.label}`
            + (lossSubReason
              ? ` · ${FIT_SUB_REASONS.find(x => x.key === lossSubReason)?.label ?? lossSubReason}`
              : ''),
      });
      setLossFor(null);
    } catch (err: any) {
      toast({ title: 'Could not close', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  }

  if (deals === null) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No deals in the pipeline"
        description="Prospects arrive here automatically once they reach Lead on the Outreach board."
      />
    );
  }

  return (
    <Card className="border-cream-200 overflow-hidden">
      {/* Filters inside the Card with a border-b separator, per the
          filter-bar convention in CLAUDE.md — not a floating row above it. */}
      <div className="p-4 border-b border-cream-200 bg-cream-50/60 flex items-center gap-3 flex-wrap">
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="h-9 w-[160px] focus-brand"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-9 w-[170px] focus-brand"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map(s => (
              <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {collapsed.size > 0 && (
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
            Expand all ({collapsed.size})
          </Button>
        )}
        {(showArchived || archivedCount > 0) && (
          <Button
            variant={showArchived ? 'brand' : 'outline'}
            size="sm"
            onClick={() => setShowArchived(v => !v)}
          >
            <Archive className="h-3.5 w-3.5 mr-1.5" />
            {showArchived ? 'Back to live deals' : `Archived (${archivedCount})`}
          </Button>
        )}
        <div className="ml-auto text-[11px] uppercase tracking-[0.14em] text-ink-warm-500 tabular-nums">
          {visible.length} deals · {money(totals.total)} · {money(Math.round(totals.weighted))} weighted
          {totals.noValue > 0 && (
            <span className="text-amber-600 font-semibold"> · {totals.noValue} without a value</span>
          )}
          {totals.stalled > 0 && <span className="text-rose-600 font-semibold"> · {totals.stalled} stalled</span>}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {showArchived && (
          <div className="rounded-md border border-cream-200 bg-cream-50 px-3 py-2 text-xs text-ink-warm-600">
            <b>Archived deals.</b> Kept for reference, not being worked. Their stage is
            whatever it was when work stopped — it is not a claim about where they stand
            now. The legacy Sales board still shows every one of them.
          </div>
        )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
        onDragEnd={onDragEnd}
      >
        <div
          className="grid gap-3 items-start"
          style={{
            gridTemplateColumns: BOARD_STAGES
              .map(s => (collapsed.has(s) ? '3rem' : 'minmax(0, 1fr)')).join(' '),
          }}
        >
          {BOARD_STAGES.map(s => (
            <Column
              key={s}
              stage={s}
              deals={byStage.get(s) ?? []}
              collapsed={collapsed.has(s)}
              onSaveValue={saveValue}
              onToggle={() => setCollapsed(prev => {
                const next = new Set(prev);
                if (next.has(s)) next.delete(s); else next.add(s);
                return next;
              })}
            />
          ))}
        </div>

        <div className="flex gap-3">
          <OutcomeZone id="zone-won" tone="won" label="✓ Drop here for Closed Won" />
          <OutcomeZone id="zone-lost" tone="lost" label="✗ Drop here for Closed Lost — reason required" />
        </div>

        <DragOverlay>{dragged ? <DealCard deal={dragged} dragging /> : null}</DragOverlay>
      </DndContext>
      </div>

      <Dialog open={lossFor !== null} onOpenChange={o => { if (!o) setLossFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Why was {lossFor?.name} lost?</DialogTitle>
            <DialogDescription>
              A loss without a reason teaches nobody anything — this is the only
              record of why deals do not land.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason <span className="text-rose-600">*</span></Label>
            <Select
              value={lossReason}
              onValueChange={v => { setLossReason(v); setLossSubReason(''); }}
            >
              <SelectTrigger className="h-9 focus-brand mt-1">
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {LOSS_REASONS.map(r => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}{r.orbit ? ' — parks in Orbit' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-ink-warm-500 mt-1">
              Timing and internal priority park the deal in Orbit instead of closing it.
            </p>
          </div>

          {/* Only for reasons that carry a second level. Today that is Fit,
              which on its own does not say which way the deal was wrong. */}
          {LOSS_REASONS.find(r => r.key === lossReason)?.subReasons && (
            <div>
              <Label>Which way? <span className="text-rose-600">*</span></Label>
              <Select value={lossSubReason} onValueChange={setLossSubReason}>
                <SelectTrigger className="h-9 focus-brand mt-1">
                  <SelectValue placeholder="Pick a reason" />
                </SelectTrigger>
                <SelectContent>
                  {(LOSS_REASONS.find(r => r.key === lossReason)?.subReasons ?? []).map(sr => (
                    <SelectItem key={sr.key} value={sr.key}>{sr.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLossFor(null)} disabled={saving}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmLoss}
              disabled={
                saving || !lossReason
                || (!!LOSS_REASONS.find(r => r.key === lossReason)?.subReasons && !lossSubReason)
              }
            >
              {saving ? 'Saving…' : 'Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
