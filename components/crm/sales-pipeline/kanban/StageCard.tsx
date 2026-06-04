'use client';

/**
 * StageCard — one opportunity card inside a kanban column. Also used
 * as the DragOverlay floating preview while the card is being
 * dragged.
 *
 * Visual hierarchy (top → bottom):
 *   1. Drag handle (GripVertical) + Building icon + project name
 *   2. Deal value (emerald, large)
 *   3. Badges row — Bucket, Path (Closer/SDR), Source
 *   4. Details column:
 *      - Bump progress (cold_dm only)
 *      - Warm sub-state (warm only — "Interested" / "Silent")
 *      - Temperature bar
 *      - BAMFAM warning (if applicable)
 *      - Last-bumped or last-contacted timestamp
 *   5. Actions dropdown (top-right) — hidden during drag
 *
 * The left border is colored by stage (`STAGE_COLORS[stage].border`),
 * with a subtle ring + opacity reduction while dragging and a faint
 * rose tint when BAMFAM is active.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was `renderCard`,
 * ~135 LOC) on 2026-06-02 as part of Phase 4. Consumes the slide-over
 * + dialog handlers from `SalesPipelineContext`.
 */

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  Building2,
  Clock,
  Edit,
  GripVertical,
  MessageSquare,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  STAGE_COLORS,
  type SalesPipelineOpportunity,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';

interface StageCardProps {
  opp: SalesPipelineOpportunity;
  /** When true, renders the simplified DragOverlay variant — no
   *  actions menu, slight opacity, shadow ring around the card. */
  isDragging?: boolean;
}

export function StageCard({ opp, isDragging = false }: StageCardProps) {
  const {
    isBAMFAM,
    openSlideOver,
    openEditDialog,
    handleRecordBump,
    handleStageChange,
    handleDelete,
  } = useSalesPipeline();

  const colors = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;
  const bamfam = isBAMFAM(opp);

  return (
    <Card
      className={`group border-l-4 ${colors.border} ${isDragging ? 'shadow-lg ring-2 ring-brand opacity-90' : ''} ${bamfam ? 'bg-rose-50/30' : ''}`}
      onClick={() => openSlideOver(opp)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Name with drag handle */}
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-ink-warm-300 flex-shrink-0 cursor-grab active:cursor-grabbing" />
              <Building2 className="h-4 w-4 text-ink-warm-400 flex-shrink-0" />
              <p className="font-medium text-ink-warm-900 truncate">{opp.name}</p>
            </div>

            {/* Deal Value */}
            {opp.deal_value && (
              <p className="text-lg font-semibold text-emerald-600 mt-2">
                ${opp.deal_value.toLocaleString()}
              </p>
            )}

            {/* Badges — all StatusBadge so dimensions are uniform.
                Bucket tone reads at a glance (A=hot/success, B=warm/
                warning, C=low/neutral). dm_account tone tells you
                which side of the org owns the deal (closer=info/sky,
                sdr=success/emerald). Source stays neutral. */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {opp.bucket && (
                <StatusBadge
                  tone={opp.bucket === 'A' ? 'success' : opp.bucket === 'B' ? 'warning' : 'neutral'}
                  size="sm"
                >
                  Bucket {opp.bucket}
                </StatusBadge>
              )}
              {opp.dm_account === 'closer' && (
                <StatusBadge tone="info" size="sm">Closer</StatusBadge>
              )}
              {opp.dm_account === 'sdr' && (
                <StatusBadge tone="success" size="sm">SDR</StatusBadge>
              )}
              {opp.source && (
                <StatusBadge tone="neutral" size="sm" className="capitalize">
                  {opp.source.replace('_', ' ')}
                </StatusBadge>
              )}
            </div>

            {/* Details */}
            <div className="mt-3 space-y-1.5 text-xs text-ink-warm-500">
              {/* Bump progress (cold_dm only) */}
              {opp.stage === 'cold_dm' && (
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 flex-shrink-0 text-sky-500" />
                  <span>Bump {opp.bump_number}/4</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= opp.bump_number ? 'bg-sky-500' : 'bg-cream-200'}`} />
                    ))}
                  </div>
                </div>
              )}

              {/* Warm sub-state */}
              {opp.stage === 'warm' && opp.warm_sub_state && (
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 flex-shrink-0" />
                  <span className={opp.warm_sub_state === 'interested' ? 'text-emerald-600 font-medium' : 'text-ink-warm-500'}>
                    {opp.warm_sub_state === 'interested' ? 'Interested' : 'Silent'}
                  </span>
                </div>
              )}

              {/* Temperature bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-cream-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${opp.temperature_score >= 70 ? 'bg-emerald-500' : opp.temperature_score >= 40 ? 'bg-amber-500' : 'bg-rose-400'}`}
                    style={{ width: `${opp.temperature_score}%` }}
                  />
                </div>
                <span className="text-[10px] text-ink-warm-400">{opp.temperature_score}</span>
              </div>

              {/* BAMFAM warning */}
              {bamfam && (
                <div className="flex items-center gap-1.5 text-rose-600">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="font-medium">BAMFAM</span>
                </div>
              )}

              {/* Last bumped */}
              {(opp.last_bump_date || opp.last_contacted_at) && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  <span>
                    {opp.last_bump_date
                      ? `Bumped ${formatDistanceToNow(new Date(opp.last_bump_date), { addSuffix: true })}`
                      : `Contacted ${formatDistanceToNow(new Date(opp.last_contacted_at!), { addSuffix: true })}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {!isDragging && (
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
