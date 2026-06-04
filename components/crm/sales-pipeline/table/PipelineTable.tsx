'use client';

/**
 * PipelineTable — the table-view body for the Pipeline tab. Renders
 * each visible pipeline stage as its own collapsible table section
 * with stage-tinted header + inline-editable rows.
 *
 * Layout:
 *   1. `<DndContext>` wrapper — drives cross-stage drag-drop (same
 *      handlers as the kanban view). Drop targets inside the table
 *      are the stage headers themselves.
 *   2. Per-stage section:
 *      - Stage header (clickable to collapse) with stage label,
 *        count badge, and total deal value.
 *      - Body table — Name (with inline edit + add-POC affordance),
 *        POC, Bucket, Value (inline edit), Owner, TG Handle, Source,
 *        and per-stage extra columns (Bumps for cold_dm, Type
 *        warm-substate for warm).
 *   3. `<DragOverlay>` — compact horizontal preview while dragging
 *      (more compact than the kanban's card preview since the table
 *      rows are dense).
 *
 * Inline-edit pattern: click the Name or Value cell → swaps the
 * display for an `<Input>`. Enter saves, Esc cancels, blur saves.
 * State lives in `editingCell` / `editingValue` (shared with future
 * cells). The page's `handleInlineEdit` handles optimistic update +
 * server write.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was `renderTable`,
 * ~256 LOC) on 2026-06-02 as part of Phase 4. Consumes the DnD
 * primitives + computed stage state + inline-edit state from
 * `SalesPipelineContext`.
 *
 * Project-name grouping (mirrors Outreach + Orbit) — same-name opps
 * cluster, first row shows the project header, continuation rows hide
 * the name. Sorting by name supersedes intra-stage drag-drop reorder;
 * cross-stage drag still works via the outer DndContext.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  Building2,
  ChevronDown,
  ChevronRight,
  Edit,
  GripVertical,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
} from '@dnd-kit/core';
import { StatusBadge } from '@/components/ui/status-badge';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import { ProjectNameSuffix } from '@/components/crm/sales-pipeline/ProjectNameSuffix';
import { OwnerCell } from '@/components/crm/sales-pipeline/cells/OwnerCell';
import { PocCell } from '@/components/crm/sales-pipeline/cells/PocCell';
import {
  STAGE_COLORS,
  STAGE_LABELS,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';
import type { OpportunityStage } from '@/lib/crmService';

export function PipelineTable() {
  const {
    sensors,
    handleDragStart,
    handleDragEnd,
    activeOpportunity,
    visiblePipelineStages,
    getStageOpps,
    collapsedStages,
    setCollapsedStages,
    editingCell,
    setEditingCell,
    editingValue,
    setEditingValue,
    handleInlineEdit,
    openSlideOver,
    openEditDialog,
    handleStageChange,
    handleRecordBump,
    handleDelete,
    setForm,
    setIsCreateOpen,
  } = useSalesPipeline();

  return (
    <div className="pb-8">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {visiblePipelineStages.map(stage => {
          const stageOpps = getStageOpps(stage);
          const colors = STAGE_COLORS[stage];
          const isCollapsed = collapsedStages.has(stage);
          const stageValue = stageOpps.reduce((s, o) => s + (o.deal_value || 0), 0);
          const sortedStageOpps = [...stageOpps].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          const stageNameCounts = new Map<string, number>();
          sortedStageOpps.forEach(o => stageNameCounts.set(o.name || '', (stageNameCounts.get(o.name || '') || 0) + 1));

          return (
            <div key={stage} className="mb-6">
              {/* Stage Header */}
              <div
                onClick={() => {
                  const next = new Set(collapsedStages);
                  if (isCollapsed) next.delete(stage); else next.add(stage);
                  setCollapsedStages(next);
                }}
                className={`flex items-center justify-between px-4 py-3 ${colors.bg} ${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} border ${colors.border} ${isCollapsed ? '' : 'border-b-0'} cursor-pointer select-none transition-all`}
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className={`h-4 w-4 ${colors.text}`} /> : <ChevronDown className={`h-4 w-4 ${colors.text}`} />}
                  <h4 className={`font-semibold ${colors.text}`}>{STAGE_LABELS[stage]}</h4>
                  <Badge variant="secondary" className="text-xs font-medium">{stageOpps.length}</Badge>
                </div>
                {stageValue > 0 && (
                  <span className="text-sm font-medium text-ink-warm-700">
                    ${stageValue.toLocaleString()}
                  </span>
                )}
              </div>

              {!isCollapsed && (
                <div className="bg-white rounded-b-lg border border-cream-200 border-t-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                        {/* Path / Temp / BAMFAM columns removed 2026-05-13
                            (manager wanted a cleaner pipeline table).
                            Underlying fields still live on the opp row —
                            BAMFAM in the slide-over + Actions tab; temp
                            still drives the sort options. Just not shown
                            as columns here. */}
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-10"></TableHead>
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap">Name</TableHead>
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[180px]">POC</TableHead>
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[70px]">Bucket</TableHead>
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[110px]">Value</TableHead>
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[100px]">Owner</TableHead>
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[100px]">TG Handle</TableHead>
                        {/* Source surfaced across every stage 2026-05-14 —
                            previously only the Outreach (cold_dm) table
                            showed it. Useful in Warm/Pipeline/Closed too
                            so it's clear where each deal originated. */}
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[100px]">Source</TableHead>
                        {stage === 'cold_dm' && <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[80px]">Bumps</TableHead>}
                        {stage === 'warm' && <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[90px]">Type</TableHead>}
                        <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedStageOpps.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-xs text-ink-warm-400 italic py-6">
                            No opportunities in this stage · drop a card here to add
                          </TableCell>
                        </TableRow>
                      ) : sortedStageOpps.map((opp, index) => {
                        const prevName = index > 0 ? sortedStageOpps[index - 1].name : null;
                        const nextName = index < sortedStageOpps.length - 1 ? sortedStageOpps[index + 1].name : null;
                        const isFirstInGroup = opp.name !== prevName;
                        const isLastInGroup = opp.name !== nextName;
                        const groupCount = stageNameCounts.get(opp.name || '') || 1;
                        return (
                          <TableRow
                            key={opp.id}
                            className={`group hover:bg-cream-50 cursor-pointer ${!isFirstInGroup ? 'border-t-0' : ''} ${isLastInGroup && groupCount > 1 ? 'border-b-2 border-b-cream-200' : ''}`}
                            onClick={() => openSlideOver(opp)}
                          >
                            <TableCell className={!isFirstInGroup ? 'pt-0' : ''}>
                              {editingCell?.id === opp.id && editingCell.field === 'name' ? (
                                <Input
                                  value={editingValue}
                                  onChange={e => setEditingValue(e.target.value)}
                                  onBlur={() => handleInlineEdit(opp.id, 'name', editingValue)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(opp.id, 'name', editingValue); if (e.key === 'Escape') setEditingCell(null); }}
                                  className="h-8 text-sm font-medium focus-brand"
                                  autoFocus
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : isFirstInGroup ? (
                                <div
                                  onClick={e => { e.stopPropagation(); setEditingCell({ id: opp.id, field: 'name' }); setEditingValue(opp.name); }}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-cream-100 rounded px-2 py-1 -mx-2 -my-1 whitespace-nowrap overflow-hidden"
                                >
                                  <Building2 className="h-4 w-4 text-ink-warm-400 shrink-0" />
                                  <span className="font-medium truncate">{opp.name}</span>
                                  <ProjectNameSuffix twitterHandle={opp.twitter_handle} onEdit={() => openEditDialog(opp)} />
                                  {groupCount > 1 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream-100 text-ink-warm-500 font-medium shrink-0 whitespace-nowrap">{groupCount} POCs</span>
                                  )}
                                  {/* Add-another-POC affordance — same as
                                      the Outreach and Orbit tables. */}
                                  <button
                                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-cream-200 text-ink-warm-400 "
                                    title="Add another POC for this project"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setForm({
                                        name: opp.name,
                                        stage: 'cold_dm' as OpportunityStage,
                                        dm_account: opp.dm_account,
                                        bucket: opp.bucket || undefined,
                                        source: opp.source || undefined,
                                        owner_id: opp.owner_id || undefined,
                                        co_owner_ids: opp.co_owner_ids || undefined,
                                        referrer: opp.referrer || undefined,
                                        affiliate_id: opp.affiliate_id || undefined,
                                        twitter_handle: opp.twitter_handle || undefined,
                                      });
                                      setIsCreateOpen(true);
                                    }}
                                  >
                                    <UserPlus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="pl-8 text-ink-warm-300 text-xs">└</div>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap max-w-[180px] overflow-hidden">
                              <PocCell opp={opp} maxWidth="max-w-[120px]" />
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
                              {editingCell?.id === opp.id && editingCell.field === 'deal_value' ? (
                                <Input
                                  type="number"
                                  value={editingValue}
                                  onChange={e => setEditingValue(e.target.value)}
                                  onBlur={() => handleInlineEdit(opp.id, 'deal_value', editingValue)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(opp.id, 'deal_value', editingValue); if (e.key === 'Escape') setEditingCell(null); }}
                                  className="h-8 text-sm text-right focus-brand"
                                  autoFocus
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : (
                                <div
                                  onClick={e => { e.stopPropagation(); setEditingCell({ id: opp.id, field: 'deal_value' }); setEditingValue(String(opp.deal_value || '')); }}
                                  className="cursor-pointer hover:bg-cream-100 rounded px-2 py-1 -mx-2 -my-1 min-h-[28px] flex items-center"
                                >
                                  {opp.deal_value ? (
                                    <span className="font-semibold text-emerald-600">${opp.deal_value.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-ink-warm-400">-</span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell><OwnerCell opp={opp} /></TableCell>
                            <TableCell className="text-ink-warm-500">{opp.tg_handle || '—'}</TableCell>
                            <TableCell className="text-ink-warm-500 text-xs capitalize">{opp.source?.replace('_', ' ') || '—'}</TableCell>
                            {stage === 'cold_dm' && (
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm">{opp.bump_number}/4</span>
                                  <div className="flex gap-0.5">
                                    {[1, 2, 3, 4].map(i => (
                                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= opp.bump_number ? 'bg-sky-500' : 'bg-cream-200'}`} />
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            )}
                            {stage === 'warm' && (
                              <TableCell>
                                {opp.warm_sub_state ? (
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${opp.warm_sub_state === 'interested' ? 'border-emerald-300 text-emerald-600 bg-emerald-50' : 'border-cream-300 text-ink-warm-500 bg-cream-50'}`}>
                                    {opp.warm_sub_state === 'interested' ? 'Interested' : 'Silent'}
                                  </Badge>
                                ) : (
                                  <span className="text-ink-warm-400 text-xs">—</span>
                                )}
                              </TableCell>
                            )}
                            {/* BAMFAM column removed from the pipeline table
                                2026-05-13. The flag is still computed via
                                isBAMFAM() and surfaced in the slide-over
                                + Actions tab. */}
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 z-[80]">
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditDialog(opp); }}>
                                    <Edit className="h-4 w-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  {opp.stage === 'cold_dm' && (
                                    <DropdownMenuItem onClick={e => { e.stopPropagation(); handleRecordBump(opp.id); }}>
                                      <Zap className="h-4 w-4 mr-2" /> Record Bump
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); handleStageChange(opp.id, 'orbit', opp.stage); }} className="text-orange-600">
                                    <RotateCcw className="h-4 w-4 mr-2" /> Move to Orbit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(opp.id); }} className="text-rose-600">
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
        <DragOverlay>
          {activeOpportunity ? (
            <div className="bg-white border border-cream-300 shadow-lg rounded px-4 py-2 flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-ink-warm-400" />
              <Building2 className="h-4 w-4 text-ink-warm-400" />
              <span className="font-medium">{activeOpportunity.name}</span>
              <Badge className={`text-xs ${STAGE_COLORS[activeOpportunity.stage as SalesPipelineStage]?.bg || ''} ${STAGE_COLORS[activeOpportunity.stage as SalesPipelineStage]?.text || ''}`}>
                {STAGE_LABELS[activeOpportunity.stage as SalesPipelineStage] || activeOpportunity.stage}
              </Badge>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
