'use client';

/**
 * MetricsPanel — the "Metrics" sub-tab inside the collapsible
 * "Forecast & Metrics" container above the main tab strip.
 *
 * Layout:
 *   1. Controls — user picker + rolling-window selector +
 *      inline "Loading bookings..." spinner during fetch.
 *   2. Per-user scorecard — 8 stat cards (Touch 1s, Replies, Reply
 *      rate, Qualified, Calls booked, Calls held, No-shows, Show
 *      rate) for the selected user over the chosen window.
 *   3. Team comparison — sortable table of every user with at
 *      least one outreach or booking in window. Methodology popover
 *      ([?] icon) explains how each metric is computed. Ends with a
 *      TEAM TOTAL footer row.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was the
 * `renderMetricsTab` function, lines 4592-4745 of the pre-refactor
 * file) on 2026-06-02 as Phase 1 of the structural split. Consumes
 * `SalesPipelineContext` for `metricsUserId`/`setMetricsUserId`,
 * `metricsRangeDays`/`setMetricsRangeDays`, `metricsBookingsLoading`,
 * `users`/`activeUsers`, and `computeOutreachMetrics`. The logged-in
 * user fallback comes from `useAuth()` directly — same as the
 * pre-extraction version.
 *
 * v11 note: gray-* tokens preserved during the structural split.
 * The v11 pass over this folder happens AFTER all extractions land
 * so the chrome stays internally consistent.
 */

import { useAuth } from '@/contexts/AuthContext';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import { MetricCard } from '@/components/crm/sales-pipeline/MetricCard';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HelpCircle, Loader2 } from 'lucide-react';

export function MetricsPanel() {
  const { user } = useAuth();
  const {
    users,
    activeUsers,
    metricsUserId,
    setMetricsUserId,
    metricsRangeDays,
    setMetricsRangeDays,
    metricsBookingsLoading,
    computeOutreachMetrics,
  } = useSalesPipeline();

  const selectedId = metricsUserId || user?.id || '';
  const selectedUser = users.find(u => u.id === selectedId);
  const m = computeOutreachMetrics(selectedId, metricsRangeDays);

  // Team comparison — every user with at least one opp owned in window
  const teamRows = users
    .map(u => ({ user: u, metrics: computeOutreachMetrics(u.id, metricsRangeDays) }))
    .filter(r => r.metrics.touch1s > 0 || r.metrics.callsBooked > 0)
    .sort((a, b) => b.metrics.touch1s - a.metrics.touch1s);

  return (
    <div className="pb-4 space-y-4">
      {/* [Space optimization, May 2026] Tightened pb-8 → pb-4 and
          space-y-6 → space-y-4 inside the Metrics tab. Methodology
          block (80px of text at the bottom) moved into a popover
          on the Team comparison header to save space without
          losing the explanatory text. */}
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedId} onValueChange={setMetricsUserId}>
          <SelectTrigger className="h-9 w-56 text-sm focus-brand">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            {activeUsers.map(u => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(metricsRangeDays)} onValueChange={v => setMetricsRangeDays(Number(v) as 7 | 30 | 90)}>
          <SelectTrigger className="h-9 w-40 text-sm focus-brand">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        {metricsBookingsLoading && (
          <span className="text-xs text-ink-warm-500 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading bookings...
          </span>
        )}
      </div>

      {/* Per-user scorecard */}
      <div className="bg-white border border-cream-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-ink-warm-900">{selectedUser?.name || 'Select a user'}</h3>
            <p className="text-[11px] text-ink-warm-500">Last {metricsRangeDays} days</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Touch 1s sent" value={m.touch1s} hint="First DM sent in window" />
          <MetricCard label="Replies received" value={m.replies} hint="Moved past cold_dm" />
          <MetricCard label="Reply rate" value={`${(m.replyRate * 100).toFixed(1)}%`} tone={m.replyRate >= 0.2 ? 'good' : 'neutral'} />
          <MetricCard label="Qualified" value={m.qualified} hint={`${(m.qualificationRate * 100).toFixed(0)}% of replies · 5-for-5 ≥ 3/5`} />
          <MetricCard label="Calls booked" value={m.callsBooked} />
          <MetricCard label="Calls held" value={m.callsHeld} tone="good" />
          <MetricCard label="No-shows" value={m.noShows} hint={`${(((m.noShows) / (m.callsBooked || 1)) * 100).toFixed(0)}% of bookings`} tone={m.noShows > 0 ? 'bad' : 'neutral'} />
          <MetricCard label="Show rate" value={`${(m.showRate * 100).toFixed(0)}%`} hint={m.callsPending > 0 ? `${m.callsPending} pending` : undefined} tone={m.showRate >= 0.7 ? 'good' : 'neutral'} />
        </div>
      </div>

      {/* Team comparison */}
      <div className="bg-white border border-cream-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-cream-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-semibold text-ink-warm-900">Team comparison</h4>
            {/* [Space optimization] Methodology popover — the previous
                ~80px disclosure block at the bottom of the tab was
                always-visible explainer text. Same content, behind
                a help icon. */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-ink-warm-400 transition-colors"
                  title="How metrics are computed"
                  aria-label="How metrics are computed"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-[400px] text-xs text-ink-warm-700 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-ink-warm-900 mb-1">How metrics are computed</p>
                <p>· <strong>Touch 1s sent</strong> — opportunities owned by the rep in <code className="bg-cream-100 px-1 rounded text-[10px]">cold_dm</code> with <code className="bg-cream-100 px-1 rounded text-[10px]">bump_number ≥ 1</code> created in the window.</p>
                <p>· <strong>Replies</strong> — proxy: opps that moved past <code className="bg-cream-100 px-1 rounded text-[10px]">cold_dm</code> (created or last-updated in window). Improve by logging inbound activities explicitly.</p>
                <p>· <strong>Qualified</strong> — opps with at least 3 of 5 BANT+ qualification checks marked, set on the opportunity slide-over.</p>
                <p>· <strong>Calls booked / held / no-shows</strong> — bookings where the booking page is owned by the rep. Mark held / no-show on /crm/meetings after each call.</p>
              </PopoverContent>
            </Popover>
          </div>
          <span className="text-xs text-ink-warm-500">{teamRows.length} active rep{teamRows.length === 1 ? '' : 's'}</span>
        </div>
        {teamRows.length === 0 ? (
          <div className="text-center py-8 text-sm text-ink-warm-400">
            No outreach activity in the last {metricsRangeDays} days.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap">Rep</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right">Touch 1s</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right">Replies</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right">Reply %</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right">Qualified</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right">Booked</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right">Held</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right">No-show</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right">Show %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamRows.map(({ user: u, metrics }) => (
                <TableRow key={u.id} className="hover:bg-cream-50">
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{metrics.touch1s}</TableCell>
                  <TableCell className="text-right tabular-nums">{metrics.replies}</TableCell>
                  <TableCell className="text-right tabular-nums">{(metrics.replyRate * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{metrics.qualified}</TableCell>
                  <TableCell className="text-right tabular-nums">{metrics.callsBooked}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{metrics.callsHeld}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600">{metrics.noShows}</TableCell>
                  <TableCell className="text-right tabular-nums">{(metrics.showRate * 100).toFixed(0)}%</TableCell>
                </TableRow>
              ))}
              {/* Team totals */}
              <TableRow className="bg-cream-50 font-semibold">
                <TableCell>TEAM TOTAL</TableCell>
                <TableCell className="text-right tabular-nums">{teamRows.reduce((s, r) => s + r.metrics.touch1s, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{teamRows.reduce((s, r) => s + r.metrics.replies, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">—</TableCell>
                <TableCell className="text-right tabular-nums">{teamRows.reduce((s, r) => s + r.metrics.qualified, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{teamRows.reduce((s, r) => s + r.metrics.callsBooked, 0)}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-700">{teamRows.reduce((s, r) => s + r.metrics.callsHeld, 0)}</TableCell>
                <TableCell className="text-right tabular-nums text-rose-600">{teamRows.reduce((s, r) => s + r.metrics.noShows, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </div>

      {/* [Space optimization] Methodology block moved into a
          popover on the Team comparison header above. Same content,
          ~80px saved. */}
    </div>
  );
}
