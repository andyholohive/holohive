'use client';

/**
 * OrbitTab — the Orbit tab body inside the main sales-pipeline tab
 * strip. Shows opportunities that have been paused / deprioritized
 * but still need periodic follow-up.
 *
 * [Orbit split, May 2026] Two sections, in priority order:
 *   1. **Engaged orbit** (emerald) — responded or qualified at some
 *      point, now paused. Higher-value re-engagement pool.
 *   2. **Cold-DM orbit** (sky) — never responded. Low-touch revisit
 *      pool. Combining the two was inflating "engaged pipeline"
 *      counts with stale cold outreach.
 *
 * Both sections share a sticky bulk-action toolbar at the top (Move
 * to Cold DM / Move to Pipeline (Warm) / Delete) so the user can
 * multi-select across sections.
 *
 * Within each section, rows are pre-sorted by project name +
 * bump_number so multi-POC projects (multiple opps for the same
 * project) render contiguously with one project name + a `N POCs`
 * count chip, then the additional POCs as connector-line rows.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderOrbitTab`, ~299 LOC) on 2026-06-02 as the second Phase 2
 * tab extraction. Consumes ~13 fields from `SalesPipelineContext`.
 *
 * v11 note: gray-* tokens preserved during the structural split.
 * The orbit_reason chip + the bulk-action toolbar's orange/sky/amber
 * solid buttons will be reconsidered in the final v11 pass.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowRight,
  Building2,
  Edit,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import { ProjectNameSuffix } from '@/components/crm/sales-pipeline/ProjectNameSuffix';
import { OwnerCell } from '@/components/crm/sales-pipeline/cells/OwnerCell';
import { PocCell } from '@/components/crm/sales-pipeline/cells/PocCell';
import {
  ORBIT_REASONS,
  type SalesPipelineOpportunity,
} from '@/lib/salesPipelineService';
import type { OpportunityStage } from '@/lib/crmService';

export function OrbitTab() {
  const {
    selectedOrbit,
    setSelectedOrbit,
    selectAllOrbitVisible,
    toggleOrbitSelect,
    isOrbitBulkMoving,
    handleOrbitBulkMove,
    handleOrbitBulkDelete,
    sortedEngagedOrbit,
    engagedOrbitTotalValue,
    sortedColdDmOrbit,
    coldDmOrbitTotalValue,
    handleResurrect,
    handleDelete,
    openSlideOver,
    openEditDialog,
    setForm,
    setIsCreateOpen,
  } = useSalesPipeline();

  const sections: Array<{
    key: 'engaged' | 'cold_dm';
    title: string;
    subtitle: string;
    opps: SalesPipelineOpportunity[];
    totalValue: number;
    headerBg: string;
    headerBorder: string;
    headerText: string;
    iconColor: string;
  }> = [
    {
      key: 'engaged',
      title: 'Engaged orbit',
      subtitle: 'Responded or qualified at some point — re-engage with context',
      opps: sortedEngagedOrbit,
      totalValue: engagedOrbitTotalValue,
      headerBg: 'bg-emerald-50',
      headerBorder: 'border-emerald-200',
      headerText: 'text-emerald-800',
      iconColor: 'text-emerald-700',
    },
    {
      key: 'cold_dm',
      title: 'Cold-DM orbit',
      subtitle: 'Never responded — low-touch revisit pool',
      opps: sortedColdDmOrbit,
      totalValue: coldDmOrbitTotalValue,
      headerBg: 'bg-sky-50',
      headerBorder: 'border-sky-200',
      headerText: 'text-sky-800',
      iconColor: 'text-sky-700',
    },
  ];

  return (
    <div className="pb-8">
      {/* Sticky bulk action toolbar — mirrors the Outreach toolbar
          identically so users have the same multi-select UX in both
          tabs. Only renders when at least one row is selected.
          [Cleanup 2026-06-02] Was bg-orange-50 with solid bg-sky-600
          / bg-amber-600 buttons — now neutral cream-50 with outline
          buttons + colored icon cues. */}
      {selectedOrbit.length > 0 && (
        <div className="sticky top-0 z-30 flex items-center gap-2 mb-3 px-4 py-2.5 bg-cream-50 border border-cream-200 rounded-lg shadow-sm">
          <span className="text-sm font-medium text-ink-warm-900">{selectedOrbit.length} selected</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllOrbitVisible}>
            Select All Visible
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedOrbit([])}>
            Deselect All
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleOrbitBulkMove('cold_dm')}
            disabled={isOrbitBulkMoving}
          >
            {isOrbitBulkMoving ? <Loader2 className="h-3 w-3 animate-spin mr-1 text-sky-500" /> : <RotateCcw className="h-3 w-3 mr-1 text-sky-500" />}
            Move to Cold DM
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleOrbitBulkMove('warm')}
            disabled={isOrbitBulkMoving}
          >
            {isOrbitBulkMoving ? <Loader2 className="h-3 w-3 animate-spin mr-1 text-amber-500" /> : <ArrowRight className="h-3 w-3 mr-1 text-amber-500" />}
            Move to Pipeline (Warm)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
            onClick={handleOrbitBulkDelete}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      )}

      {/* Per-section table render. Both sections share row structure;
          only the header palette + title differ. */}
      {sortedEngagedOrbit.length === 0 && sortedColdDmOrbit.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="Orbit is empty"
          description="When you pause a deal that's not ready to progress, it lands here for a periodic re-engage. Move one from the Pipeline tab to populate this view."
        />
      ) : sections.map(section => {
        const currentSorted = section.opps;
        const nameCounts = (() => {
          const counts = new Map<string, number>();
          currentSorted.forEach(o => counts.set(o.name || '', (counts.get(o.name || '') || 0) + 1));
          return counts;
        })();
        return (
          <div key={section.key} className="mb-6">
            <div className={`flex items-center justify-between px-4 py-3 ${section.headerBg} rounded-t-lg border ${section.headerBorder} border-b-0`}>
              <div className="flex items-center gap-2">
                <RotateCcw className={`h-4 w-4 ${section.iconColor}`} />
                <div>
                  <h4 className={`font-semibold ${section.headerText} leading-tight`}>{section.title}</h4>
                  <p className="text-[11px] text-ink-warm-500 leading-tight mt-0.5">{section.subtitle}</p>
                </div>
                <Badge variant="secondary" className="text-xs font-medium ml-2">{currentSorted.length}</Badge>
              </div>
              {section.totalValue > 0 && (
                <span className="text-sm font-medium text-ink-warm-700">
                  ${section.totalValue.toLocaleString()}
                </span>
              )}
            </div>
            <div className="bg-white rounded-b-lg border border-cream-200 border-t-0 overflow-hidden">
              {currentSorted.length === 0 ? (
                <p className="text-center text-xs text-ink-warm-400 italic py-6 px-4">
                  {section.key === 'engaged'
                    ? "No engaged opps in orbit — every paused deal hasn't responded yet."
                    : 'No cold-DM opps in orbit.'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-10"></TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap">Name</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[180px]">POC</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[70px]">Bucket</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[110px]">Value</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[100px]">Owner</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[100px]">Source</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[140px]">Reason</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[120px]">Next check-in</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[120px]">Time in Orbit</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[120px]">Last Contacted</TableHead>
                      <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentSorted.map((opp, index) => {
                      const isChecked = selectedOrbit.includes(opp.id);
                      const prevName = index > 0 ? currentSorted[index - 1].name : null;
                      const nextName = index < currentSorted.length - 1 ? currentSorted[index + 1].name : null;
                      const isFirstInGroup = opp.name !== prevName;
                      const isLastInGroup = opp.name !== nextName;
                      const groupCount = nameCounts.get(opp.name || '') || 1;
                      return (
                        <TableRow
                          key={opp.id}
                          className={`group hover:bg-cream-50 cursor-pointer ${!isFirstInGroup ? 'border-t-0' : ''} ${isLastInGroup && groupCount > 1 ? 'border-b-2 border-b-cream-200' : ''}`}
                          onClick={() => openSlideOver(opp)}
                        >
                          <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleOrbitSelect(opp.id)}
                              />
                            </div>
                          </TableCell>
                          <TableCell className={!isFirstInGroup ? 'pt-0' : ''}>
                            {isFirstInGroup ? (
                              <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                <Building2 className="h-4 w-4 text-ink-warm-400 shrink-0" />
                                <span className="font-medium truncate">{opp.name}</span>
                                <ProjectNameSuffix twitterHandle={opp.twitter_handle} onEdit={() => openEditDialog(opp)} />
                                {groupCount > 1 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream-100 text-ink-warm-500 font-medium shrink-0 whitespace-nowrap">{groupCount} POCs</span>
                                )}
                                {/* Add-another-POC button on hover — same
                                    affordance the Outreach table has. Pre-
                                    fills the create form with the same
                                    project context. */}
                                <button
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-cream-200 text-ink-warm-400 "
                                  title="Add another POC for this project"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setForm({
                                      name: opp.name,
                                      stage: 'orbit' as OpportunityStage,
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
                          {/* DM (dm_account) + Temp cells removed 2026-05-13
                              to match the trimmed orbit header. */}
                          <TableCell>
                            {opp.deal_value ? (
                              <span className="font-semibold text-emerald-600">${opp.deal_value.toLocaleString()}</span>
                            ) : (
                              <span className="text-ink-warm-400">-</span>
                            )}
                          </TableCell>
                          <TableCell><OwnerCell opp={opp} /></TableCell>
                          <TableCell className="text-ink-warm-500 text-xs capitalize">{opp.source?.replace('_', ' ') || '—'}</TableCell>
                          {/* Reason tag — surfaces orbit_reason even for opps
                              that didn't have it set (those used to vanish
                              entirely from the per-reason layout). */}
                          <TableCell>
                            {opp.orbit_reason ? (
                              <StatusBadge tone="warning" size="sm">
                                {ORBIT_REASONS.find(r => r.value === opp.orbit_reason)?.label || opp.orbit_reason}
                              </StatusBadge>
                            ) : (
                              <span className="text-ink-warm-400 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              if (!opp.next_action_at) return <span className="text-ink-warm-400 text-xs">—</span>;
                              const checkin = new Date(opp.next_action_at + 'T00:00:00');
                              const today = new Date(); today.setHours(0, 0, 0, 0);
                              const overdue = checkin < today;
                              const isToday = checkin.getTime() === today.getTime();
                              return (
                                <span className={`text-xs ${overdue ? 'text-rose-600 font-medium' : isToday ? 'text-amber-600 font-medium' : 'text-ink-warm-700'}`}>
                                  {format(checkin, 'MMM d')}
                                  {overdue && ' · overdue'}
                                  {isToday && ' · today'}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-ink-warm-500">{opp.updated_at ? formatDistanceToNow(new Date(opp.updated_at)) : '—'}</TableCell>
                          <TableCell className="text-ink-warm-500">{opp.last_contacted_at ? formatDistanceToNow(new Date(opp.last_contacted_at), { addSuffix: true }) : '—'}</TableCell>
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={e => { e.stopPropagation(); handleResurrect(opp); }} className="text-blue-600">
                                  <ArrowRight className="h-4 w-4 mr-2" /> Resurrect
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
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
