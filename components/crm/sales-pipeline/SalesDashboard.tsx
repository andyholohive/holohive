'use client';

/**
 * SalesDashboard — body for the "Dashboard" sub-tab inside the
 * Forecast & Metrics collapsible.
 *
 * **2026-06-03 restructure.** Previously this was a standalone
 * collapsible surface ABOVE Forecast & Metrics, which produced three
 * analytics sections (Today's Attention / Forecast & Metrics / Sales
 * Dashboard) showing overlapping numbers. The standalone surface +
 * outer shell + collapse + heavy "Sales Dashboard" header were dropped;
 * the body now lives as the third tab inside F&M alongside Forecast
 * and Metrics. Net effect: one analytics surface, three lenses.
 *
 * What this component owns:
 *   - dashboardPeriod / dashboardCustomFrom / dashboardCustomTo
 *     (the period-filter chips at the top of the body)
 *   - the `dashboardMetrics` memo
 *   - the rendered grid (Pipeline Health / Conversion Funnel / Key
 *     Rates / Bottleneck Analysis / Bucket Breakdown)
 *
 * What the parent (page) still owns:
 *   - The collapse state for the whole F&M section
 *   - The Recalc Scores button — fires the page-level
 *     `recalcAllTemperatures()` + refetch chain that touches multiple
 *     page-local fetch fns (passed in as `onRecalculate`)
 *
 * Inputs from context (raw data the page already owns):
 *   - `opportunities` (full list, period-filtered internally)
 *   - `outreachTotal` (server cold-DM count, more accurate than
 *     in-memory count which only includes loaded opps)
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertTriangle,
  Calendar,
  Clock,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';
import { STAGE_WIN_PROB_BROAD } from '@/lib/salesPipelineHelpers';

/** Shape of the page-level `metrics` state object — server-fetched
 *  rollup used by Bucket Breakdown + the BAMFAM violations callout.
 *  Lives on the page (not in context), so it's threaded through as a
 *  prop rather than via `useSalesPipeline()`. `totalCount` and
 *  `activeValue` were dropped 2026-06-03 — they were returned by the
 *  service but never read by any UI surface. */
export type SalesDashboardMetrics = {
  bucketA: number;
  bucketB: number;
  bucketC: number;
  bamfamViolations: number;
};

interface SalesDashboardProps {
  /** Fires the page-level temperature recalc + refetch chain.
   *  Owned by the page because it touches multiple page-local fetch
   *  functions and the active-tab state. */
  onRecalculate: () => void;
  /** Disables the Recalc button + spins the icon while in flight. */
  isRecalculating: boolean;
  /** Server-fetched bucket + BAMFAM counts. Passed as a prop because
   *  it's page-local state. */
  metrics: SalesDashboardMetrics;
}

type DashboardPeriod = 'today' | '7d' | '30d' | 'all' | 'custom';

export function SalesDashboard({ onRecalculate, isRecalculating, metrics }: SalesDashboardProps) {
  const { opportunities, outreachTotal } = useSalesPipeline();

  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('all');
  const [dashboardCustomFrom, setDashboardCustomFrom] = useState('');
  const [dashboardCustomTo, setDashboardCustomTo] = useState('');

  /**
   * dashboardMetrics — period-filtered "Sales Dashboard" rollup.
   * Intentionally broader scope than `forecastKpis` on the page:
   * ALL pipeline stages × `STAGE_WIN_PROB_BROAD` rather than just
   * post-proposal × `STAGE_WIN_PROB`. See helper comments for why
   * the two probability tables disagree by design.
   */
  const dashboardMetrics = useMemo(() => {
    // Filter opportunities by selected time period
    let all = opportunities;
    if (dashboardPeriod !== 'all') {
      const now = new Date();
      let fromDate: Date | null = null;
      let toDate: Date | null = null;
      if (dashboardPeriod === 'today') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dashboardPeriod === '7d') {
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dashboardPeriod === '30d') {
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (dashboardPeriod === 'custom') {
        if (dashboardCustomFrom) fromDate = new Date(dashboardCustomFrom);
        if (dashboardCustomTo) {
          toDate = new Date(dashboardCustomTo);
          toDate.setHours(23, 59, 59, 999);
        }
      }
      all = opportunities.filter(o => {
        if (!o.created_at) return false;
        const created = new Date(o.created_at);
        if (fromDate && created < fromDate) return false;
        if (toDate && created > toDate) return false;
        return true;
      });
    }

    // Single pass to bucket opportunities by stage and accumulate metrics
    const pipelineSet = new Set(PIPELINE_STAGES as string[]);
    const bookedSet = new Set(['booked', 'discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won']);
    const discoverySet = new Set(['discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won']);
    const proposalSet = new Set(['proposal_call', 'v2_contract', 'v2_closed_won']);
    const closingSet = new Set(['discovery_done', 'proposal_call', 'v2_contract']);

    let coldDmCount = 0, pastColdDm = 0, meetingsBooked = 0, discoveryCalls = 0, proposalsSent = 0;
    let closedWonCount = 0, closedLostCount = 0, orbitCount = 0;
    let pipelineValue = 0, weightedPipeline = 0;
    let wonValueSum = 0, wonValueCount = 0, closeTimeSum = 0, closeTimeCount = 0;
    let qualifiedCount = 0, bucketACount = 0;
    let overdueFollowups = 0, staleDeals = 0, dealsAtRisk = 0;
    let meetingsThisWeek = 0, meetingsToday = 0;
    const closedWonOpps: typeof all = [];
    const pipelineActiveOpps: typeof all = [];

    const nowMs = Date.now();
    const nowIso = new Date().toISOString();
    const nowDate = new Date();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const o of all) {
      const stage = o.stage;
      const isPipeline = pipelineSet.has(stage);

      // Stage buckets
      if (stage === 'cold_dm') coldDmCount++;
      else pastColdDm++;
      if (bookedSet.has(stage)) meetingsBooked++;
      if (discoverySet.has(stage)) discoveryCalls++;
      if (proposalSet.has(stage)) proposalsSent++;
      if (stage === 'v2_closed_won') { closedWonCount++; closedWonOpps.push(o); }
      if (stage === 'v2_closed_lost') closedLostCount++;
      if (stage === 'orbit') orbitCount++;

      // Pipeline active metrics
      if (isPipeline) {
        pipelineActiveOpps.push(o);
        pipelineValue += o.deal_value || 0;
        weightedPipeline += (o.deal_value || 0) * (STAGE_WIN_PROB_BROAD[stage] || 0.1);
        if (o.next_meeting_at) {
          if (o.next_meeting_at < nowIso) overdueFollowups++;
          const mt = new Date(o.next_meeting_at);
          if (mt >= todayStart && mt < weekEnd) meetingsThisWeek++;
          if (mt >= todayStart && mt < tomorrowStart) meetingsToday++;
        }
        const lastDate = o.last_contacted_at || o.last_bump_date || o.created_at;
        if (!lastDate || Math.floor((nowMs - new Date(lastDate).getTime()) / 86400000) >= 7) staleDeals++;
      }

      // Deals at risk
      if (closingSet.has(stage) && o.temperature_score < 40) dealsAtRisk++;

      // Bucket counts
      if (o.bucket === 'A' || o.bucket === 'B') qualifiedCount++;
      if (o.bucket === 'A') bucketACount++;

      // Won deal value + close time
      if (stage === 'v2_closed_won') {
        const val = o.deal_value || 0;
        if (val > 0) { wonValueSum += val; wonValueCount++; }
        if (o.created_at && o.closed_at) {
          closeTimeSum += (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 86400000;
          closeTimeCount++;
        }
      }
    }

    const totalDmsSent = all.length;
    const totalClosed = closedWonCount + closedLostCount;
    const totalRevenue = closedWonOpps.reduce((sum, o) => sum + (o.deal_value || 0), 0);

    // Bottleneck analysis (kept as multi-pass — runs on period-filtered data which is smaller)
    const funnelStages: SalesPipelineStage[] = ['cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won'];
    const stageOrder: Record<string, number> = {};
    funnelStages.forEach((s, i) => { stageOrder[s] = i; });

    const reachedStage = funnelStages.map(stage => {
      const idx = stageOrder[stage];
      return all.filter(o => {
        const oIdx = stageOrder[o.stage];
        if (oIdx !== undefined) return oIdx >= idx;
        if (o.stage === 'orbit' || o.stage === 'v2_closed_lost') {
          if (o.proposal_sent_at && idx <= stageOrder['proposal_call']) return true;
          if (o.discovery_call_at && idx <= stageOrder['discovery_done']) return true;
          if (o.calendly_booked_date && idx <= stageOrder['booked']) return true;
          if (o.tg_handle && idx <= stageOrder['tg_intro']) return true;
          if ((o.last_contacted_at || o.last_bump_date) && idx <= stageOrder['warm']) return true;
          return idx <= stageOrder['cold_dm'];
        }
        return false;
      }).length;
    });

    const stageConversions = funnelStages.slice(0, -1).map((stage, i) => {
      const from = reachedStage[i];
      const to = reachedStage[i + 1];
      return { stage, nextStage: funnelStages[i + 1], from, to, rate: from > 0 ? (to / from) * 100 : 0, dropoff: from - to };
    });

    const avgDaysInStage = funnelStages.slice(0, -1).map(stage => {
      const oppsInStage = pipelineActiveOpps.filter(o => o.stage === stage);
      if (oppsInStage.length === 0) return { stage, avgDays: 0, count: 0 };
      const totalDays = oppsInStage.reduce((sum, o) => sum + Math.floor((nowMs - new Date(o.updated_at).getTime()) / 86400000), 0);
      return { stage, avgDays: Math.round(totalDays / oppsInStage.length), count: oppsInStage.length };
    });

    const significantConversions = stageConversions.filter(c => c.from >= 3);
    const worstConversion = significantConversions.length > 0 ? significantConversions.reduce((w, c) => c.rate < w.rate ? c : w) : null;
    const significantStages = avgDaysInStage.filter(s => s.count >= 2);
    const slowestStage = significantStages.length > 0 ? significantStages.reduce((s, c) => c.avgDays > s.avgDays ? c : s) : null;

    return {
      totalDmsSent,
      responseRate: totalDmsSent > 0 ? (pastColdDm / totalDmsSent) * 100 : 0,
      meetingsBooked,
      discoveryCalls,
      closeRate: totalClosed > 0 ? (closedWonCount / totalClosed) * 100 : 0,
      avgDealSize: wonValueCount > 0 ? wonValueSum / wonValueCount : 0,
      avgCloseTime: closeTimeCount > 0 ? closeTimeSum / closeTimeCount : 0,
      qualifiedPct: all.length > 0 ? (qualifiedCount / all.length) * 100 : 0,
      bucketAPct: all.length > 0 ? (bucketACount / all.length) * 100 : 0,
      pipelineValue,
      activeDeals: pipelineActiveOpps.length,
      overdueFollowups,
      bamfamViolations: metrics.bamfamViolations,
      closedWon: closedWonCount,
      closedLost: closedLostCount,
      inOrbit: orbitCount,
      proposalsSent,
      coldDmCount: outreachTotal > 0 ? outreachTotal : coldDmCount,
      meetingsThisWeek,
      meetingsToday,
      staleDeals,
      dealsAtRisk,
      totalRevenue,
      weightedPipeline,
      stageConversions,
      avgDaysInStage,
      worstConversion,
      slowestStage,
    };
  }, [opportunities, metrics.bamfamViolations, outreachTotal, dashboardPeriod, dashboardCustomFrom, dashboardCustomTo]);

  return (
    <div className="space-y-5">
      {/* Period filter + Recalc button — top row of the Dashboard
          sub-tab. Recalc lives here (instead of the parent F&M
          header) so it's spatially close to the metrics it affects;
          the F&M header is shared across Forecast / Metrics /
          Dashboard so a Recalc button up there would be ambiguous. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-ink-warm-500">Period</span>
          {/* v11 segmented control — matches the main tab strip, F&M
              sub-tabs, View Toggle, and Attention/Activity toggle.
              Was a row of floating pills with `bg-brand text-white`
              active state — the only filter chrome on the page that
              didn't follow the cream-container pattern. 2026-06-03. */}
          <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200">
            {([
              { key: 'all', label: 'All Time' },
              { key: 'today', label: 'Today' },
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
              { key: 'custom', label: 'Custom' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDashboardPeriod(opt.key)}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  dashboardPeriod === opt.key
                    ? 'bg-white shadow-card text-brand'
                    : 'text-ink-warm-500 hover:bg-cream-200'
                }`}
                aria-pressed={dashboardPeriod === opt.key}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {dashboardPeriod === 'custom' && (
            <div className="flex items-center gap-1.5 ml-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-7 px-2.5 text-xs justify-start font-normal gap-1.5"
                    style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: dashboardCustomFrom ? '#111827' : '#9ca3af' }}
                  >
                    <Calendar className="h-3 w-3" />
                    {dashboardCustomFrom ? format(new Date(dashboardCustomFrom + 'T00:00:00'), 'MMM d, yyyy') : 'From'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={dashboardCustomFrom ? new Date(dashboardCustomFrom + 'T00:00:00') : undefined}
                    onSelect={date => setDashboardCustomFrom(date ? format(date, 'yyyy-MM-dd') : '')}
                    initialFocus
                    classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                    modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-ink-warm-400">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-7 px-2.5 text-xs justify-start font-normal gap-1.5"
                    style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: dashboardCustomTo ? '#111827' : '#9ca3af' }}
                  >
                    <Calendar className="h-3 w-3" />
                    {dashboardCustomTo ? format(new Date(dashboardCustomTo + 'T00:00:00'), 'MMM d, yyyy') : 'To'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={dashboardCustomTo ? new Date(dashboardCustomTo + 'T00:00:00') : undefined}
                    onSelect={date => setDashboardCustomTo(date ? format(date, 'yyyy-MM-dd') : '')}
                    initialFocus
                    classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                    modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5"
                disabled={isRecalculating}
                onClick={onRecalculate}
              >
                {isRecalculating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                {isRecalculating ? 'Recalculating...' : 'Recalc Scores'}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-xs text-xs space-y-1 p-3">
              <p className="font-semibold">Auto-calculates temperature (0–100)</p>
              <p>• Base: Bucket A=40, B=25, C=10, none=20</p>
              <p>• Recency: +30 minus days since last contact</p>
              <p>• Engagement: +4 per activity (max +20)</p>
              <p>• Meeting booked: +15</p>
              <p>• Stage: warm +5, booked/tg_intro +10, discovery+ +15</p>
              <p>• Warm interested: +10</p>
              <p>• Stale cold DM (&gt;30d): −15</p>
              <p>• Bump exhaustion (3+): −10</p>
              <p>• Warm silent: −5</p>
              <p>• Orbit → 5, Closed Lost → 0</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="space-y-6">

          {/* Row 1: Pipeline Health — headline numbers.
              2026-06-03: dropped the rainbow `border-l-[3px]` rails
              (emerald/teal/blue/purple/cream) — calm cream border on
              every tile, color reserved for the value text alone.
              Read as a single calm row instead of a stripe of hues. */}
          <div>
            <p className="text-[11px] font-semibold text-ink-warm-400 uppercase tracking-wider mb-3">Pipeline Health</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Pipeline Value', value: `$${dashboardMetrics.pipelineValue >= 1000 ? `${(dashboardMetrics.pipelineValue / 1000).toFixed(1)}K` : dashboardMetrics.pipelineValue.toLocaleString()}`, color: 'text-emerald-700' },
                { label: 'Weighted', value: `$${dashboardMetrics.weightedPipeline >= 1000 ? `${(dashboardMetrics.weightedPipeline / 1000).toFixed(1)}K` : dashboardMetrics.weightedPipeline.toFixed(0)}`, color: 'text-teal-700' },
                { label: 'Active Deals', value: `${dashboardMetrics.activeDeals}`, color: 'text-blue-700' },
                { label: 'Revenue (Won)', value: `$${dashboardMetrics.totalRevenue >= 1000 ? `${(dashboardMetrics.totalRevenue / 1000).toFixed(1)}K` : dashboardMetrics.totalRevenue.toLocaleString()}`, color: 'text-purple-700' },
                { label: 'Deals Won', value: `${dashboardMetrics.closedWon}`, color: 'text-ink-warm-700' },
                { label: 'In Orbit', value: `${dashboardMetrics.inOrbit}`, color: 'text-ink-warm-700' },
              ].map(item => (
                <div key={item.label} className="bg-white border border-cream-200 rounded-lg px-3 py-2.5">
                  <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-[11px] text-ink-warm-500">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Row 2: Conversion Funnel + Key Rates side by side */}
          <div className="grid grid-cols-2 gap-6">
            {/* Funnel — monochromatic brand-teal gradient (light at the
                top of the funnel, darker as it narrows) so the chart
                reads as one progression instead of a rainbow.
                Won = emerald (positive outcome), Lost = rose (negative)
                — those two states get semantic color so they pop
                against the rest of the cool gradient. */}
            <div>
              <p className="text-[11px] font-semibold text-ink-warm-400 uppercase tracking-wider mb-3">Conversion Funnel</p>
              <div className="flex items-end gap-1.5">
                {[
                  { label: 'DMs', value: dashboardMetrics.totalDmsSent, color: 'bg-brand/30' },
                  { label: 'Replied', value: dashboardMetrics.totalDmsSent - dashboardMetrics.coldDmCount, color: 'bg-brand/45' },
                  { label: 'Meetings', value: dashboardMetrics.meetingsBooked, color: 'bg-brand/60' },
                  { label: 'Discovery', value: dashboardMetrics.discoveryCalls, color: 'bg-brand/75' },
                  { label: 'Proposals', value: dashboardMetrics.proposalsSent, color: 'bg-brand/90' },
                  { label: 'Won', value: dashboardMetrics.closedWon, color: 'bg-emerald-500' },
                  { label: 'Lost', value: dashboardMetrics.closedLost, color: 'bg-rose-300' },
                ].map((step, i) => {
                  const pct = dashboardMetrics.totalDmsSent > 0 ? (step.value / dashboardMetrics.totalDmsSent) * 100 : 0;
                  return (
                    <div key={step.label} className="flex-1 text-center">
                      <p className="text-sm font-bold text-ink-warm-700 mb-1">{step.value}</p>
                      <div className="h-20 rounded-md flex items-end justify-center overflow-hidden bg-cream-50">
                        <div className={`w-full rounded-t-sm ${step.color}`} style={{ height: `${Math.max(pct, 5)}%` }} />
                      </div>
                      <p className="text-[10px] text-ink-warm-500 mt-1.5 leading-tight">{step.label}</p>
                      {i > 0 && i < 6 && pct > 0 && (
                        <p className="text-[9px] text-ink-warm-400">{pct.toFixed(0)}%</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Key Rates */}
            <div>
              <p className="text-[11px] font-semibold text-ink-warm-400 uppercase tracking-wider mb-3">Key Rates</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                {[
                  { label: 'Response Rate', value: `${dashboardMetrics.responseRate.toFixed(1)}%` },
                  { label: 'Close Rate', value: `${dashboardMetrics.closeRate.toFixed(0)}%` },
                  { label: 'Avg Deal Size', value: `$${dashboardMetrics.avgDealSize > 0 ? (dashboardMetrics.avgDealSize >= 1000 ? `${(dashboardMetrics.avgDealSize / 1000).toFixed(1)}K` : dashboardMetrics.avgDealSize.toFixed(0)) : '0'}` },
                  { label: 'Avg Close Time', value: dashboardMetrics.avgCloseTime > 0 ? `${dashboardMetrics.avgCloseTime.toFixed(0)}d` : '—' },
                  { label: 'Qualified (A+B)', value: `${dashboardMetrics.qualifiedPct.toFixed(0)}%` },
                  { label: 'Bucket A %', value: `${dashboardMetrics.bucketAPct.toFixed(0)}%` },
                ].map(item => (
                  <div key={item.label} className="flex items-baseline justify-between py-1.5 border-b border-cream-100 last:border-b-0">
                    <p className="text-[11px] text-ink-warm-500">{item.label}</p>
                    <p className="text-sm font-bold text-ink-warm-700">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Bottleneck Analysis */}
          <div>
            <p className="text-[11px] font-semibold text-ink-warm-400 uppercase tracking-wider mb-3">Bottleneck Analysis</p>

            {/* Summary callouts — tone-tinted bg + matching border,
                no separate left rail. Opacity standardised to /50 to
                match the rest of the dashboard's tinted info cards. */}
            {(dashboardMetrics.worstConversion || dashboardMetrics.slowestStage) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {dashboardMetrics.worstConversion && (
                  <div className="bg-rose-50/50 border border-rose-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                      <p className="text-[11px] font-semibold text-rose-600">Biggest Drop-off</p>
                    </div>
                    <p className="text-sm font-bold text-ink-warm-700">
                      {STAGE_LABELS[dashboardMetrics.worstConversion.stage as SalesPipelineStage]} → {STAGE_LABELS[dashboardMetrics.worstConversion.nextStage as SalesPipelineStage]}
                    </p>
                    <p className="text-[11px] text-ink-warm-500 mt-0.5">
                      {dashboardMetrics.worstConversion.rate.toFixed(0)}% convert — {dashboardMetrics.worstConversion.dropoff} lost
                    </p>
                  </div>
                )}
                {dashboardMetrics.slowestStage && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      <p className="text-[11px] font-semibold text-amber-600">Slowest Stage</p>
                    </div>
                    <p className="text-sm font-bold text-ink-warm-700">
                      {STAGE_LABELS[dashboardMetrics.slowestStage.stage as SalesPipelineStage]}
                    </p>
                    <p className="text-[11px] text-ink-warm-500 mt-0.5">
                      Avg {dashboardMetrics.slowestStage.avgDays}d — {dashboardMetrics.slowestStage.count} deals sitting here
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Stage conversion table */}
            <div className="rounded-lg border border-cream-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cream-50/80">
                    <th className="text-left py-2 px-3 font-medium text-ink-warm-400 uppercase tracking-wider text-[10px]">Stage</th>
                    <th className="text-center py-2 px-3 font-medium text-ink-warm-400 uppercase tracking-wider text-[10px]">In</th>
                    <th className="text-center py-2 px-3 font-medium text-ink-warm-400 uppercase tracking-wider text-[10px]">Out</th>
                    <th className="text-center py-2 px-3 font-medium text-ink-warm-400 uppercase tracking-wider text-[10px]">Conv.</th>
                    <th className="text-center py-2 px-3 font-medium text-ink-warm-400 uppercase tracking-wider text-[10px]">Drop</th>
                    <th className="text-center py-2 px-3 font-medium text-ink-warm-400 uppercase tracking-wider text-[10px]">Avg Days</th>
                    <th className="py-2 px-3 w-[100px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardMetrics.stageConversions.map((conv, i) => {
                    const timeData = dashboardMetrics.avgDaysInStage[i];
                    const isWorst = dashboardMetrics.worstConversion?.stage === conv.stage;
                    const isSlowest = dashboardMetrics.slowestStage?.stage === conv.stage;
                    const barWidth = Math.max(conv.rate, 3);
                    const barColor = conv.rate >= 60 ? 'bg-emerald-400' : conv.rate >= 30 ? 'bg-amber-400' : 'bg-rose-400';
                    return (
                      <tr key={conv.stage} className={`border-t border-cream-100 ${isWorst ? 'bg-rose-50/40' : isSlowest ? 'bg-amber-50/30' : ''}`}>
                        <td className="py-1.5 px-3 font-medium text-ink-warm-700">
                          <div className="flex items-center gap-1.5">
                            {STAGE_LABELS[conv.stage as SalesPipelineStage]}
                            {isWorst && <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400" />}
                            {isSlowest && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />}
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-center text-ink-warm-500">{conv.from}</td>
                        <td className="py-1.5 px-3 text-center text-ink-warm-500">{conv.to}</td>
                        <td className="py-1.5 px-3 text-center">
                          <span className={`font-semibold ${conv.rate >= 60 ? 'text-emerald-600' : conv.rate >= 30 ? 'text-amber-600' : 'text-rose-500'}`}>
                            {conv.from > 0 ? `${conv.rate.toFixed(0)}%` : '—'}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          {conv.dropoff > 0 ? (
                            <span className="text-rose-400 font-medium">-{conv.dropoff}</span>
                          ) : (
                            <span className="text-ink-warm-300">0</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          {timeData.count > 0 ? (
                            <span className={`font-medium ${timeData.avgDays >= 14 ? 'text-rose-500' : timeData.avgDays >= 7 ? 'text-amber-500' : 'text-ink-warm-500'}`}>
                              {timeData.avgDays}d
                            </span>
                          ) : (
                            <span className="text-ink-warm-300">—</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3">
                          <div className="w-full h-1.5 bg-cream-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Row 4: Bucket Breakdown — same calm-tile treatment as
              Pipeline Health (no colored left rail). */}
          <div>
            <p className="text-[11px] font-semibold text-ink-warm-400 uppercase tracking-wider mb-3">Bucket Breakdown</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Bucket A', sub: 'High-value, high-intent', value: metrics.bucketA, color: 'text-emerald-700' },
                { label: 'Bucket B', sub: 'Standard follow-up', value: metrics.bucketB, color: 'text-amber-700' },
                { label: 'Bucket C', sub: 'Lower priority', value: metrics.bucketC, color: 'text-ink-warm-700' },
              ].map(item => (
                <div key={item.label} className="bg-white border border-cream-200 rounded-lg px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-ink-warm-700">{item.label}</p>
                    <p className="text-[10px] text-ink-warm-400">{item.sub}</p>
                  </div>
                  <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
    </div>
  );
}
