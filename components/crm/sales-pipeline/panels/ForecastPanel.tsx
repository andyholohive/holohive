'use client';

/**
 * ForecastPanel — the "Forecast" sub-tab inside the collapsible
 * "Forecast & Metrics" container above the main tab strip.
 *
 * Layout:
 *   1. KPI strip — pipeline value, weighted forecast, this-month
 *      expected, at-risk count + value.
 *   2. Empty state if no post-proposal opps.
 *   3. Period buckets — This Week → Next Week → This Month →
 *      Next Month → Later → No Date Set. Each bucket shows a
 *      colored header row + a 2-column grid of opportunity cards.
 *
 * Each opp card surfaces stage, deal value, win-probability, days
 * since proposal, last-touched, decision maker, next action, and
 * a per-opp dropdown for {Edit / Mark Closed Won / Mark Closed Lost
 * / Move to Nurture}.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was the
 * `renderForecastTab` function, lines 4575-4792 of the pre-refactor
 * file) on 2026-06-02 as Phase 1 of the structural split. Consumes
 * `SalesPipelineContext` for `forecastByPeriod`, `forecastKpis`,
 * `forecastOpps`, `users`, `openSlideOver`, `openEditDialog`,
 * `handleStageChange`, and `renderProjectNameSuffix`.
 *
 * v11 note: gray-* tokens preserved during the structural split.
 * The v11 pass over this folder happens AFTER all extractions land
 * so the chrome stays internally consistent.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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
  Check,
  Clock,
  Edit,
  FileText,
  MoreHorizontal,
  TrendingUp,
  X,
} from 'lucide-react';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import { ProjectNameSuffix } from '@/components/crm/sales-pipeline/ProjectNameSuffix';
import {
  isOppAtRisk,
  STAGE_WIN_PROB,
  type ForecastPeriodKey,
} from '@/lib/salesPipelineHelpers';
import {
  STAGE_COLORS,
  STAGE_LABELS,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';

export function ForecastPanel() {
  const {
    forecastOpps,
    forecastByPeriod,
    forecastKpis,
    users,
    openSlideOver,
    openEditDialog,
    handleStageChange,
  } = useSalesPipeline();

  const periods: Array<{ key: ForecastPeriodKey; label: string; tone: string; description: string }> = [
    { key: 'thisWeek',  label: 'This Week',  tone: 'bg-emerald-50 border-emerald-200 text-emerald-700', description: 'Closing this week' },
    { key: 'nextWeek',  label: 'Next Week',  tone: 'bg-emerald-50 border-emerald-200 text-emerald-700', description: 'Closing next week' },
    { key: 'thisMonth', label: 'This Month', tone: 'bg-sky-50 border-sky-200 text-sky-700',             description: 'Closing this month' },
    { key: 'nextMonth', label: 'Next Month', tone: 'bg-sky-50 border-sky-200 text-sky-700',             description: 'Closing next month' },
    { key: 'later',     label: 'Later',      tone: 'bg-cream-50 border-cream-200 text-ink-warm-700',          description: '60+ days out' },
    { key: 'noDate',    label: 'No Date Set', tone: 'bg-amber-50 border-amber-200 text-amber-700',      description: 'Set an expected close date' },
  ];

  return (
    <div className="pb-4 space-y-4">
      {/* [Space optimization, May 2026] Tightened pb-8 → pb-4 and
          space-y-6 → space-y-4 inside the Forecast tab. Was adding
          ~80px of unused vertical padding. KPI strip cell padding
          also trimmed p-4 → p-3 for the same reason. */}
      {/* KPI strip — high-level pipeline health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-cream-200 rounded-lg p-3">
          <div className="text-xs text-ink-warm-500 uppercase tracking-wide">Pipeline value</div>
          <div className="text-2xl font-bold text-ink-warm-900 mt-1">${forecastKpis.totalValue.toLocaleString()}</div>
          <div className="text-xs text-ink-warm-500 mt-1">{forecastOpps.length} active deal{forecastOpps.length === 1 ? '' : 's'}</div>
        </div>
        <div className="bg-white border border-cream-200 rounded-lg p-3">
          <div className="text-xs text-ink-warm-500 uppercase tracking-wide">Weighted forecast</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">${Math.round(forecastKpis.weighted).toLocaleString()}</div>
          <div className="text-xs text-ink-warm-500 mt-1">Stage-weighted probability</div>
        </div>
        <div className="bg-white border border-cream-200 rounded-lg p-3">
          <div className="text-xs text-ink-warm-500 uppercase tracking-wide">This month</div>
          <div className="text-2xl font-bold text-sky-700 mt-1">${forecastKpis.thisMonthValue.toLocaleString()}</div>
          <div className="text-xs text-ink-warm-500 mt-1">Expected to close</div>
        </div>
        <div className={`border rounded-lg p-3 ${forecastKpis.atRiskCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-cream-200'}`}>
          <div className={`text-xs uppercase tracking-wide ${forecastKpis.atRiskCount > 0 ? 'text-rose-700' : 'text-ink-warm-500'}`}>At risk</div>
          <div className={`text-2xl font-bold mt-1 ${forecastKpis.atRiskCount > 0 ? 'text-rose-700' : 'text-ink-warm-400'}`}>
            {forecastKpis.atRiskCount}
          </div>
          <div className="text-xs text-ink-warm-500 mt-1">${forecastKpis.atRiskValue.toLocaleString()} stalled</div>
        </div>
      </div>

      {/* Empty state — [Design system, May 2026] using shared EmptyState */}
      {forecastOpps.length === 0 && (
        <div className="bg-white border border-cream-200 rounded-lg">
          <EmptyState
            icon={TrendingUp}
            title="No proposals out yet"
            description="Move a deal to Proposal Sent to see it here."
            className="py-12"
          />
        </div>
      )}

      {/* Period buckets */}
      {periods.map(period => {
        const opps = forecastByPeriod[period.key];
        if (opps.length === 0) return null;
        const periodValue = opps.reduce((s, o) => s + (o.deal_value || 0), 0);
        const periodAtRisk = opps.filter(isOppAtRisk).length;

        return (
          <div key={period.key} className="space-y-2">
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${period.tone}`}>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{period.label}</h4>
                <span className="text-xs opacity-70">· {period.description}</span>
                <Badge variant="secondary" className="text-xs">{opps.length}</Badge>
                {periodAtRisk > 0 && (
                  <Badge variant="secondary" className="text-xs bg-rose-100 text-rose-700 hover:bg-rose-100">
                    {periodAtRisk} at-risk
                  </Badge>
                )}
              </div>
              {periodValue > 0 && (
                <span className="text-sm font-medium">${periodValue.toLocaleString()}</span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {opps.map(opp => {
                const atRisk = isOppAtRisk(opp);
                const proposalAge = opp.proposal_sent_at
                  ? differenceInDays(new Date(), new Date(opp.proposal_sent_at))
                  : null;
                const ageBadgeClass = proposalAge === null
                  ? 'bg-cream-100 text-ink-warm-500'
                  : proposalAge < 7
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : proposalAge < 21
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200';
                const stageColor = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;
                const owner = users.find(u => u.id === opp.owner_id);
                const winProb = STAGE_WIN_PROB[opp.stage] || 0;

                return (
                  <div
                    key={opp.id}
                    onClick={() => openSlideOver(opp)}
                    className={`group bg-white border rounded-lg p-4 cursor-pointer ${atRisk ? 'border-rose-300 bg-rose-50/30' : 'border-cream-200'}`}
                  >
                    {/* Header row: name + at-risk flag */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Building2 className="h-4 w-4 text-ink-warm-400 shrink-0" />
                        <span className="font-semibold truncate">{opp.name}</span>
                        <ProjectNameSuffix twitterHandle={opp.twitter_handle} onEdit={() => openEditDialog(opp)} />
                      </div>
                      {atRisk && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-100 text-rose-700 shrink-0">
                          <AlertTriangle className="h-3 w-3" /> At risk
                        </span>
                      )}
                    </div>

                    {/* Stage + value + win-prob row */}
                    <div className="flex items-center gap-2 mb-3 text-xs">
                      <Badge className={`${stageColor.bg} ${stageColor.text} pointer-events-none`}>
                        {STAGE_LABELS[opp.stage as SalesPipelineStage] || opp.stage}
                      </Badge>
                      {opp.deal_value ? (
                        <span className="font-semibold text-emerald-700">${opp.deal_value.toLocaleString()}</span>
                      ) : (
                        <span className="text-ink-warm-400">No value set</span>
                      )}
                      {winProb > 0 && (
                        <span className="text-ink-warm-400">· {Math.round(winProb * 100)}% win</span>
                      )}
                    </div>

                    {/* Days-since-proposal + last activity */}
                    <div className="flex items-center gap-3 text-xs mb-2">
                      <span className={`px-1.5 py-0.5 rounded font-medium ${ageBadgeClass}`}>
                        {proposalAge === null ? 'Date unknown' : `${proposalAge}d since proposal`}
                      </span>
                      {opp.updated_at && (
                        <span className="text-ink-warm-500">
                          Last touched {formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>

                    {/* Decision maker + next action */}
                    <div className="space-y-1 text-xs">
                      {opp.decision_maker_name && (
                        <div className="text-ink-warm-700">
                          <span className="text-ink-warm-400">DM:</span> <span className="font-medium">{opp.decision_maker_name}</span>
                          {opp.decision_maker_role && <span className="text-ink-warm-400"> · {opp.decision_maker_role}</span>}
                        </div>
                      )}
                      {opp.next_action_at && (
                        <div className="text-ink-warm-700">
                          <span className="text-ink-warm-400">Next:</span>{' '}
                          <span className="font-medium">{format(new Date(opp.next_action_at + 'T00:00:00'), 'MMM d')}</span>
                          {opp.next_action_notes && <span className="text-ink-warm-500"> — {opp.next_action_notes}</span>}
                        </div>
                      )}
                      {!opp.decision_maker_name && !opp.next_action_at && (
                        <div className="text-ink-warm-400 italic">No DM or next action set</div>
                      )}
                    </div>

                    {/* Footer: owner + actions */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-cream-100">
                      <span className="text-xs text-ink-warm-500">{owner?.name || 'Unassigned'}</span>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {opp.proposal_doc_url && (
                          <a
                            href={opp.proposal_doc_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand hover:underline"
                            title="Open proposal"
                          >
                            <FileText className="h-3.5 w-3.5 inline" />
                          </a>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 z-[80]">
                            <DropdownMenuItem onClick={() => openEditDialog(opp)}>
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleStageChange(opp.id, 'v2_closed_won', opp.stage)}
                              className="text-emerald-700"
                            >
                              <Check className="h-4 w-4 mr-2" /> Mark Closed Won
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleStageChange(opp.id, 'v2_closed_lost', opp.stage)}
                              className="text-rose-600"
                            >
                              <X className="h-4 w-4 mr-2" /> Mark Closed Lost
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStageChange(opp.id, 'nurture', opp.stage)}>
                              <Clock className="h-4 w-4 mr-2" /> Move to Nurture
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
