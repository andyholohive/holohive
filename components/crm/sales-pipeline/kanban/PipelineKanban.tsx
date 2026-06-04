'use client';

/**
 * PipelineKanban — the kanban-view body for the Pipeline tab. Renders
 * each visible pipeline stage as a vertical column with stage header
 * + droppable card list, plus two narrow drop-zone columns at the
 * right (Orbit, Closed Lost).
 *
 * Layout:
 *   1. `<DndContext>` wrapper — drives the cross-column drag-drop.
 *      Drop on a column header = stage change. Drop on the right
 *      drop-zones = move to orbit / closed_lost.
 *   2. Visible pipeline stage columns — collapsible per-stage via
 *      header click. Collapsed columns show vertical text + count.
 *      Each column body is a `<DroppableColumn>` wrapping a
 *      `<SortableContext>` of `<SortableCard>` + `<StageCard>`.
 *   3. Orbit drop-zone — narrow column with orange tint + Orbit
 *      label + count badge.
 *   4. Closed Lost drop-zone — narrow column with rose tint + Lost
 *      label + count of v2_closed_lost.
 *   5. `<DragOverlay>` — floats a `<StageCard isDragging>` preview
 *      with the source card while the user drags.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was `renderKanban`,
 * ~109 LOC) on 2026-06-02 as part of Phase 4. Consumes the DnD
 * primitives + computed stage/column state from `SalesPipelineContext`.
 */

import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  STAGE_COLORS,
  STAGE_LABELS,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';
import { DroppableColumn } from '@/components/crm/sales-pipeline/dnd/DroppableColumn';
import { SortableCard } from '@/components/crm/sales-pipeline/dnd/SortableCard';
import { StageCard } from '@/components/crm/sales-pipeline/kanban/StageCard';

export function PipelineKanban() {
  const {
    sensors,
    handleDragStart,
    handleDragEnd,
    activeOpportunity,
    visiblePipelineStages,
    getStageOpps,
    collapsedKanbanStages,
    toggleKanbanCollapse,
    allOrbitOpps,
    filteredOpportunities,
  } = useSalesPipeline();

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 h-full">
        {visiblePipelineStages.map(stage => {
          const stageOpps = getStageOpps(stage);
          const colors = STAGE_COLORS[stage];
          const isCollapsed = collapsedKanbanStages.has(stage);
          const stageValue = stageOpps.reduce((sum, o) => sum + (o.deal_value || 0), 0);

          return (
            <div
              key={stage}
              className={`${isCollapsed ? 'w-12' : 'flex-1 min-w-[280px] max-w-[320px]'} flex flex-col h-full transition-all duration-200`}
            >
              {/* Column Header */}
              <div
                className={`${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} px-4 py-3 ${colors.bg} border ${colors.border} ${isCollapsed ? '' : 'border-b-0'} flex-shrink-0 cursor-pointer select-none`}
                onClick={() => toggleKanbanCollapse(stage)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className={`w-4 h-4 ${colors.text}`} />
                    ) : (
                      <ChevronDown className={`w-4 h-4 ${colors.text}`} />
                    )}
                    {!isCollapsed && (
                      <>
                        <h4 className={`font-semibold ${colors.text}`}>{STAGE_LABELS[stage]}</h4>
                        <Badge variant="secondary" className="text-xs font-medium">{stageOpps.length}</Badge>
                      </>
                    )}
                  </div>
                </div>
                {!isCollapsed && stageValue > 0 && (
                  <p className="text-sm font-medium text-ink-warm-700 mt-1">
                    ${stageValue.toLocaleString()}
                  </p>
                )}
                {isCollapsed && (
                  <div className="mt-2 flex flex-col items-center gap-1">
                    <span className={`font-semibold ${colors.text}`} style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                      {STAGE_LABELS[stage]}
                    </span>
                    <Badge variant="secondary" className="text-xs font-medium mt-1">{stageOpps.length}</Badge>
                  </div>
                )}
              </div>

              {/* Column Content — Droppable Area */}
              {!isCollapsed && (
                <DroppableColumn id={stage} className="flex-1 bg-cream-50/50 border border-cream-200 border-t-0 rounded-b-lg p-3 space-y-3 overflow-y-auto transition-colors">
                  <SortableContext items={stageOpps.map(o => o.id)} strategy={verticalListSortingStrategy}>
                    {stageOpps.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-24 gap-1 text-xs text-ink-warm-400 italic">
                        <span>No opportunities</span>
                        <span className="text-[10px] text-ink-warm-300">Drag a card here</span>
                      </div>
                    ) : (
                      stageOpps.map(opp => (
                        <SortableCard key={opp.id} id={opp.id}>
                          <StageCard opp={opp} />
                        </SortableCard>
                      ))
                    )}
                  </SortableContext>
                </DroppableColumn>
              )}
            </div>
          );
        })}

        {/* Orbit drop zone */}
        <div className="w-12 flex flex-col h-full transition-all duration-200">
          <DroppableColumn id="orbit" className="rounded-lg px-4 py-3 bg-orange-50 border border-orange-200 flex-shrink-0 cursor-pointer select-none">
            <div className="flex flex-col items-center gap-1">
              <RotateCcw className="w-4 h-4 text-orange-700" />
              <span className="font-semibold text-orange-700 mt-2" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                Orbit
              </span>
              <Badge variant="secondary" className="text-xs font-medium mt-1">{allOrbitOpps.length}</Badge>
            </div>
          </DroppableColumn>
        </div>

        {/* Closed Lost drop zone */}
        <div className="w-12 flex flex-col h-full transition-all duration-200">
          <DroppableColumn id="v2_closed_lost" className="rounded-lg px-4 py-3 bg-rose-50 border border-rose-200 flex-shrink-0 cursor-pointer select-none">
            <div className="flex flex-col items-center gap-1">
              <X className="w-4 h-4 text-rose-700" />
              <span className="font-semibold text-rose-700 mt-2" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                Lost
              </span>
              <Badge variant="secondary" className="text-xs font-medium mt-1">
                {filteredOpportunities.filter(o => o.stage === 'v2_closed_lost').length}
              </Badge>
            </div>
          </DroppableColumn>
        </div>
      </div>

      <DragOverlay>
        {activeOpportunity ? (
          <div className="w-[280px]">
            <StageCard opp={activeOpportunity} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
