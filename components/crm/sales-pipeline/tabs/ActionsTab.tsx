'use client';

/**
 * ActionsTab — the action-item queue that drives the day-to-day work
 * surface. Powered by the `getNextAction` engine on the page (which
 * inspects each opp's stage, last activity, BAMFAM compliance, etc.
 * and emits a recommended next step + alternatives).
 *
 * Layout:
 *   1. Today's Attention / Activity card — 5 cohort tiles or 7-day
 *      throughput funnel (moved here from page level 2026-06-03).
 *   2. Top row: owner-scope tabs (All / Mine / Urgent) + phase tabs
 *      (All / Outreach / Closing / Orbit / Waiting) with per-bucket
 *      counts.
 *   3. Optional Alert Card filter banner — when an attention-card
 *      tile in the header was clicked, the actions narrow to that
 *      cohort and this banner becomes the dismiss UI.
 *   4. Section header row — violet, repeating the active filter
 *      label + count + a sort dropdown ({Priority / Stage / Temp /
 *      Value / Name / Timing / Newest / Oldest}).
 *   5. Table — Name, POC, Stage, Bucket, Next Action (label + timing
 *      stacked), Temp (bar), Owner, "Set outcome" dropdown.
 *   6. Pagination footer (50/page) when displayedActions > 50.
 *
 * The "Set outcome" dropdown surfaces the action engine's primary
 * suggestion at the top (with a "suggested" hint) followed by every
 * alternative. Choosing the primary fires `handleActionExecute`;
 * choosing an alternative either does a direct stage change or opens
 * the slide-over with `ACTION_GUIDANCE[label]` as the on-open hint.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderActionsTab`, ~465 LOC) on 2026-06-02 as part of Phase 2.
 * Consumes ~20 fields from `SalesPipelineContext`. The 2 local
 * helpers (`getPriorityIcon`, `getTimingInfo`) stay inline because
 * they're tightly coupled to the row's tint logic;
 * `cleanPocHandle` moved to `lib/salesPipelineHelpers.ts`.
 *
 * v11 note: gray-* tokens preserved. The violet section header was
 * already aligned with the CRM section tone in the page v11 pass;
 * the per-priority button variants (`destructive` / `default` /
 * `outline`) inside the "Set outcome" alternatives are the v11 brand
 * variants already.
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  RotateCcw,
  Send,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { AlertCardsStrip } from '@/components/crm/sales-pipeline/panels/AlertCardsStrip';
import { OwnerCell } from '@/components/crm/sales-pipeline/cells/OwnerCell';
// Activity sub-view (SalesFunnelStrip + window Select) dropped
// 2026-06-03 — see Today's Attention comment in the JSX below.
import { useSalesPipeline, type ActionDescriptor } from '@/contexts/SalesPipelineContext';
import {
  ACTION_GUIDANCE,
  cleanPocHandle,
  type ActionPriority,
} from '@/lib/salesPipelineHelpers';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  SalesPipelineService,
  STAGE_COLORS,
  STAGE_LABELS,
  type SalesPipelineOpportunity,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';

// `cleanPocHandle` moved to lib/salesPipelineHelpers.ts on 2026-06-03.

function getPriorityIcon(priority: ActionPriority) {
  switch (priority) {
    case 'urgent': return <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />;
    case 'high':   return <Zap className="h-3.5 w-3.5 text-amber-500" />;
    case 'medium': return <Clock className="h-3.5 w-3.5 text-blue-500" />;
    case 'low':    return <Clock className="h-3.5 w-3.5 text-ink-warm-400" />;
    default:       return null;
  }
}

/** Compute the inline timing copy + color for one opp's row. The
 *  precedence rules below mirror the original page's `getTimingInfo`
 *  — they look at the stage's salient timestamp (last_bump for
 *  cold_dm, next_meeting for booked, proposal_sent for closing, etc.)
 *  rather than picking one timestamp universally. */
function getTimingInfo(opp: SalesPipelineOpportunity): { text: string; color: string } {
  const daysAgo = (date: string | null) => {
    if (!date) return null;
    return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  };
  const daysUntil = (date: string | null) => {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  // Cold DM — show last bump timing
  if (opp.stage === 'cold_dm') {
    if (opp.bump_number === 0) return { text: 'Not bumped', color: 'text-ink-warm-500' };
    const d = daysAgo(opp.last_bump_date);
    if (d === null) return { text: `${opp.bump_number}/4 bumps`, color: 'text-ink-warm-500' };
    return {
      text: `Bumped ${d}d ago`,
      color: d >= 3 ? 'text-amber-500 font-medium' : 'text-ink-warm-500',
    };
  }

  // Stages with next_meeting — show meeting timing
  if (opp.next_meeting_at) {
    const d = daysUntil(opp.next_meeting_at);
    if (d !== null) {
      if (d < 0) return { text: `Meeting ${Math.abs(d)}d ago`, color: 'text-rose-500 font-medium' };
      if (d === 0) return { text: 'Meeting today', color: 'text-blue-600 font-medium' };
      return { text: `Meeting in ${d}d`, color: d <= 2 ? 'text-blue-600 font-medium' : 'text-ink-warm-500' };
    }
  }

  // Proposal sent — show how long ago
  if (opp.stage === 'proposal_call' || (opp.stage === 'discovery_done' && opp.proposal_sent_at)) {
    const d = daysAgo(opp.proposal_sent_at);
    if (d !== null) return {
      text: `Sent ${d}d ago`,
      color: d >= 5 ? 'text-amber-500 font-medium' : 'text-ink-warm-500',
    };
  }

  // Orbit — show days remaining until follow-up is due
  if (opp.stage === 'orbit') {
    const d = daysAgo(opp.updated_at);
    if (d !== null) {
      const threshold = opp.orbit_followup_days || 90;
      const remaining = threshold - d;
      if (remaining <= 0) return { text: `Overdue ${Math.abs(remaining)}d`, color: 'text-amber-500 font-medium' };
      return { text: `${remaining}d left`, color: remaining <= 7 ? 'text-amber-500' : 'text-ink-warm-500' };
    }
  }

  // Default — days since last contact
  const lastDate = opp.last_contacted_at || opp.last_bump_date || opp.created_at;
  const d = daysAgo(lastDate);
  if (d === null) return { text: '—', color: 'text-ink-warm-400' };
  return {
    text: `${d}d silent`,
    color: d >= 7 ? 'text-rose-500 font-medium' : d >= 3 ? 'text-amber-500' : 'text-ink-warm-500',
  };
}

export function ActionsTab() {
  const {
    actionFilter,
    setActionFilter,
    actionPhaseFilter,
    setActionPhaseFilter,
    actionSort,
    setActionSort,
    actionsSearch,
    allActionItems,
    allOutreachCount,
    allClosingCount,
    allOrbitCount,
    allNonUrgentCount,
    displayedActions,
    actionsNameCounts,
    alertCardFilter,
    setAlertCardFilter,
    executingAction,
    handleActionExecute,
    handleStageChange,
    setOpportunities,
    openSlideOver,
  } = useSalesPipeline();

  // Pagination — 50 rows per page. Pulled in from the (now-deleted)
  // OverviewTab digest on 2026-06-03 when Overall was merged into
  // Actions. Page resets to 1 whenever the underlying filter changes
  // so users don't land on page 3 of a 12-row filtered result.
  const ACTIONS_PAGE_SIZE = 50;
  const [actionsPage, setActionsPage] = useState(1);
  const totalActionPages = Math.max(1, Math.ceil(displayedActions.length / ACTIONS_PAGE_SIZE));
  useEffect(() => { setActionsPage(1); }, [actionFilter, actionPhaseFilter, actionsSearch, actionSort, alertCardFilter]);
  useEffect(() => {
    if (actionsPage > totalActionPages) setActionsPage(totalActionPages);
  }, [actionsPage, totalActionPages]);
  const pageStart = (actionsPage - 1) * ACTIONS_PAGE_SIZE;
  const pageEnd = Math.min(pageStart + ACTIONS_PAGE_SIZE, displayedActions.length);
  const currentItems = displayedActions.slice(pageStart, pageEnd);
  const emptyLabel =
    alertCardFilter !== 'none'           ? 'No matching opportunities found' :
    actionPhaseFilter === 'outreach'     ? 'No outreach actions needed' :
    actionPhaseFilter === 'closing'      ? 'No closing actions needed' :
    actionPhaseFilter === 'orbit'        ? 'No orbit actions needed' :
    actionPhaseFilter === 'non_urgent'   ? 'No opportunities in waiting state' :
                                           'No actions needed right now';

  return (
    <div className="pb-8 space-y-4">
      {/* Today's Attention — 5 clickable cohort tiles (Booking
          Needed / Overdue / Stale / At Risk / Meetings) that set the
          `alertCardFilter` to narrow the action queue below. The
          Activity sub-view (7-day funnel) was removed 2026-06-03 —
          it was analytics, not triage, and Sales Dashboard already
          has a 7-stage Conversion Funnel for that audience. */}
      <div className="bg-white rounded-xl border border-cream-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-cream-100">
          <AlertTriangle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-ink-warm-900 uppercase tracking-wider">
            Today's Attention
          </h3>
        </div>
        <div className="p-5">
          <AlertCardsStrip />
        </div>
      </div>

      {/* Top row: Owner filter + Phase tabs — both v11 segmented
          controls so the two row halves are visually symmetric. */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200">
          {([
            { key: 'all' as const,    label: 'All Actions' },
            { key: 'mine' as const,   label: 'My Actions' },
            { key: 'urgent' as const, label: 'Urgent Only' },
          ]).map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setActionFilter(f.key); setAlertCardFilter('none'); }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                actionFilter === f.key
                  ? 'bg-white shadow-card text-brand'
                  : 'text-ink-warm-500 hover:bg-cream-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200">
          {([
            { key: 'all' as const,         label: 'All',       count: allActionItems.length },
            { key: 'outreach' as const,    label: 'Outreach',  count: allOutreachCount },
            { key: 'closing' as const,     label: 'Closing',   count: allClosingCount },
            { key: 'orbit' as const,       label: 'Orbit',     count: allOrbitCount },
            { key: 'non_urgent' as const,  label: 'Waiting',   count: allNonUrgentCount },
          ]).map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => { setActionPhaseFilter(p.key); setAlertCardFilter('none'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                actionPhaseFilter === p.key
                  ? 'bg-white shadow-card text-brand'
                  : 'text-ink-warm-500 hover:bg-cream-200'
              }`}
            >
              {p.key === 'outreach' && <Send className="h-3.5 w-3.5" />}
              {p.key === 'closing' && <Target className="h-3.5 w-3.5" />}
              {p.key === 'orbit' && <RotateCcw className="h-3.5 w-3.5" />}
              {p.key === 'all' && <Zap className="h-3.5 w-3.5" />}
              {p.key === 'non_urgent' && <Clock className="h-3.5 w-3.5" />}
              {p.label}
              <span className={`ml-0.5 text-[10px] tabular-nums ${
                actionPhaseFilter === p.key ? 'text-ink-warm-500' : 'text-ink-warm-400'
              }`}>{p.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Per-tab search removed 2026-06-03 — driven from the page-
          level unified search input. `actionsSearch` is still wired
          via the broadcast useEffect in page.tsx. */}

      {/* [Banner consolidation, 2026-06-02] The previous redundant
          stack here was:
            (a) An alert-filter banner ("Showing: Booking Needed [X]")
                — but the selected attention-card tile in the page
                header already has a ring/shadow + count, so this
                was the same info twice.
            (b) A violet section header ("Outreach Actions / Closing
                Actions / All Action Items") — but the phase tabs
                above already indicate the active phase.
          Both removed. The phase tabs + alert cards carry the
          state; the table starts immediately below them.
          Sort menu (was on the section header) is now a small
          inline pill above the table, right-aligned. */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-ink-warm-500">
          {actionPhaseFilter === 'outreach' && 'Cold DM · Warm · TG Intro · Booked'}
          {actionPhaseFilter === 'closing' && 'Discovery Done · Proposal · Contract'}
          {actionPhaseFilter === 'orbit' && 'Deals in orbit · resurrect or close'}
          {actionPhaseFilter === 'non_urgent' && 'Opportunities in waiting / cooling period'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-ink-warm-500 hover:bg-cream-100 rounded transition-colors">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sort: {actionSort === 'priority' ? 'Priority' : actionSort === 'stage' ? 'Stage' : actionSort === 'temperature' ? 'Temp' : actionSort === 'value' ? 'Value' : actionSort === 'newest' ? 'Newest' : actionSort === 'oldest' ? 'Oldest' : actionSort === 'timing' ? 'Timing' : 'Name'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {([
              { key: 'priority' as const,    label: 'Priority' },
              { key: 'stage' as const,       label: 'Stage' },
              { key: 'temperature' as const, label: 'Temperature' },
              { key: 'value' as const,       label: 'Deal Value' },
              { key: 'name' as const,        label: 'Name (A-Z)' },
              { key: 'timing' as const,      label: 'Last Bumped' },
              { key: 'newest' as const,      label: 'Newest First' },
              { key: 'oldest' as const,      label: 'Oldest First' },
            ]).map(s => (
              <DropdownMenuItem
                key={s.key}
                onClick={() => setActionSort(s.key)}
                className={actionSort === s.key ? 'bg-cream-100 text-brand font-medium' : ''}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-cream-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
              <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap">Name</TableHead>
              <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[160px]">POC</TableHead>
              <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[140px]">Stage</TableHead>
              <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[70px]">Bucket</TableHead>
              <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[280px]">Next Action</TableHead>
              <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[90px]">Temp</TableHead>
              <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[100px]">Owner</TableHead>
              <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[150px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    {/* CheckCircle2 reads as "you're done" — the
                        previous Zap matched the icon in the priority
                        cells above and conflated "urgent action" with
                        "nothing to do here". */}
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    <p className="text-sm font-medium text-ink-warm-500">{emptyLabel}</p>
                    <p className="text-xs text-ink-warm-400">All caught up — check back later</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : currentItems.map(({ opp, action }, index) => {
              const timing = getTimingInfo(opp);
              const stageColors = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;
              const prevName = index > 0 ? currentItems[index - 1].opp.name : null;
              const nextName = index < currentItems.length - 1 ? currentItems[index + 1].opp.name : null;
              const isFirstInGroup = opp.name !== prevName;
              const isLastInGroup = opp.name !== nextName;
              const groupCount = actionsNameCounts.get(opp.name || '') || 1;
              return (
                <TableRow
                  key={opp.id}
                  className={`group hover:bg-cream-50 cursor-pointer ${!isFirstInGroup ? 'border-t-0' : ''} ${isLastInGroup && groupCount > 1 ? 'border-b-2 border-b-cream-200' : ''}`}
                  onClick={() => openSlideOver(opp)}
                >
                  <TableCell className={!isFirstInGroup ? 'pt-0' : ''}>
                    {isFirstInGroup ? (
                      <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                        <Building2 className="h-4 w-4 text-ink-warm-400 shrink-0" />
                        <span className="font-medium truncate">{opp.name}</span>
                        {groupCount > 1 && (
                          <span className="text-[10px] text-ink-warm-400 shrink-0 whitespace-nowrap tabular-nums">
                            · {groupCount} POCs
                          </span>
                        )}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {opp.poc_handle ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize flex-shrink-0 bg-white">{opp.poc_platform || 'other'}</Badge>
                        <span className="text-xs text-ink-warm-700 truncate max-w-[90px]">{cleanPocHandle(opp.poc_handle)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-warm-300">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${stageColors.bg} ${stageColors.text} ${stageColors.border}`}>
                      {STAGE_LABELS[opp.stage as SalesPipelineStage] || opp.stage}
                    </span>
                  </TableCell>
                  <TableCell>
                    {opp.bucket && (
                      <StatusBadge
                        tone={opp.bucket === 'A' ? 'success' : opp.bucket === 'B' ? 'warning' : 'neutral'}
                        size="sm"
                      >
                        {opp.bucket}
                      </StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="flex items-center gap-1.5">
                        {getPriorityIcon(action.priority)}
                        <span className={`text-sm font-medium ${
                          action.priority === 'urgent' ? 'text-rose-700' :
                          action.priority === 'high' ? 'text-amber-700' :
                          'text-ink-warm-700'
                        }`}>
                          {action.label}
                        </span>
                      </div>
                      <div className="ml-5 mt-0.5 flex items-center gap-2">
                        <span className={`text-[11px] ${timing.color}`}>{timing.text}</span>
                        {action.hint && (
                          <span className="text-[11px] text-ink-warm-400">· {action.hint}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1.5 bg-cream-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${opp.temperature_score >= 70 ? 'bg-emerald-500' : opp.temperature_score >= 40 ? 'bg-amber-500' : 'bg-rose-400'}`}
                          style={{ width: `${opp.temperature_score}%` }}
                        />
                      </div>
                      <span className="text-xs text-ink-warm-400">{opp.temperature_score}</span>
                    </div>
                  </TableCell>
                  <TableCell><OwnerCell opp={opp} /></TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    {(() => {
                      type Outcome = {
                        label: string;
                        actionType: ActionDescriptor['actionType'];
                        targetStage?: ActionDescriptor['targetStage'];
                        variant: 'default' | 'warn' | 'danger';
                        isRecommended: boolean;
                      };
                      const outcomes: Outcome[] = [
                        { label: action.label, actionType: action.actionType, targetStage: action.targetStage, variant: 'default', isRecommended: true },
                        ...action.alternatives.map(alt => ({ label: alt.label, actionType: alt.actionType, targetStage: alt.targetStage, variant: alt.variant, isRecommended: false })),
                      ];
                      const isExecuting = executingAction === opp.id;
                      const handlePick = async (o: Outcome) => {
                        if (o.label === 'Interested') {
                          await SalesPipelineService.update(opp.id, { warm_sub_state: 'interested' });
                          setOpportunities(prev => prev.map(p => p.id === opp.id ? { ...p, warm_sub_state: 'interested' } : p));
                          return;
                        }
                        if (o.isRecommended) {
                          handleActionExecute(opp.id, action, opp);
                          return;
                        }
                        if (o.actionType === 'stage_change' && o.targetStage) {
                          handleStageChange(opp.id, o.targetStage, opp.stage);
                        } else {
                          openSlideOver(opp, ACTION_GUIDANCE[o.label]);
                        }
                      };
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              disabled={isExecuting}
                            >
                              {isExecuting && <Loader2 className="h-3 w-3 animate-spin" />}
                              Set outcome
                              <ChevronDown className="h-3 w-3 opacity-60" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60 z-[80]">
                            {outcomes.map((o, idx) => (
                              <DropdownMenuItem
                                key={`${o.label}-${idx}`}
                                className={
                                  o.variant === 'danger' ? 'text-rose-600' :
                                  o.variant === 'warn' ? 'text-orange-600' :
                                  o.isRecommended ? 'text-brand font-medium' : ''
                                }
                                onClick={() => handlePick(o)}
                              >
                                {o.variant === 'danger' ? <X className="h-3.5 w-3.5 mr-2" /> :
                                 o.variant === 'warn' ? <RotateCcw className="h-3.5 w-3.5 mr-2" /> :
                                 o.isRecommended ? <Zap className="h-3.5 w-3.5 mr-2" /> :
                                 <ArrowRight className="h-3.5 w-3.5 mr-2" />}
                                <span className="flex-1 truncate">{o.label}</span>
                                {o.isRecommended && (
                                  <span className="ml-2 text-[10px] text-brand opacity-70">suggested</span>
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer — only renders when there are more than
          ACTIONS_PAGE_SIZE items, so the common case stays one
          uninterrupted scroll. Pattern mirrors the previous OverviewTab
          digest pagination. */}
      {totalActionPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-ink-warm-500 tabular-nums">
            Showing {pageStart + 1}–{pageEnd} of {displayedActions.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setActionsPage(p => Math.max(1, p - 1))}
              disabled={actionsPage === 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>
            <span className="text-xs text-ink-warm-500 tabular-nums px-1">
              Page {actionsPage} of {totalActionPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setActionsPage(p => Math.min(totalActionPages, p + 1))}
              disabled={actionsPage === totalActionPages}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
