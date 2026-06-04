'use client';

/**
 * AlertCardsStrip — five attention tiles surfacing today's urgent
 * cohorts. Click a tile to filter the Actions tab to just that cohort.
 *
 *   Booking Needed · Overdue · Stale (7d+) · At Risk · Meetings
 *
 * **2026-06-03 redesign — calm tiles, not colored callouts.** The
 * prior version used `bg-rose-50` / `bg-amber-50` / `bg-blue-50` fills
 * plus a 4px colored left rail, which dominated the page whenever a
 * count was > 0. The new version uses a unified `bg-white border
 * border-cream-200` tile and reserves color for the count + icon —
 * urgency reads through *typography* (bold colored number) rather than
 * *chrome*, matching the rest of the v11 surfaces (`KpiCard`, the
 * Pipeline Health row inside Sales Dashboard, etc.).
 *
 * Tone palette (count > 0 only):
 *   - rose:   Booking Needed, At Risk
 *   - orange: Overdue
 *   - amber:  Stale
 *   - sky:    Meetings
 *
 * Selected (filter active) state: cream-50 bg + brand/30 ring + brand
 * label tint so the filter shows clearly without going back to the
 * heavy colored fill.
 */

import { Calendar, Clock, RotateCcw, TrendingUp, type LucideIcon } from 'lucide-react';
import { useSalesPipeline, type AlertCardFilter } from '@/contexts/SalesPipelineContext';

type Tone = 'rose' | 'orange' | 'amber' | 'sky';

interface TileConfig {
  filter: AlertCardFilter;
  label: string;
  sublabel: string;
  icon: LucideIcon;
  value: number;
  secondary?: number; // for Meetings: this-week delta
  tone: Tone;
}

/** Tone class maps. Resolved at module load so Tailwind's JIT can see
 *  the literal class names. */
const ICON_TONE: Record<Tone, string> = {
  rose: 'text-rose-500',
  orange: 'text-orange-500',
  amber: 'text-amber-500',
  sky: 'text-sky-500',
};
const VALUE_TONE: Record<Tone, string> = {
  rose: 'text-rose-600',
  orange: 'text-orange-600',
  amber: 'text-amber-600',
  sky: 'text-sky-600',
};
/** Tinted active-state classes per tone — the active tile picks up
 *  its own urgency color so the filter is obvious at a glance. The
 *  prior generic `border-brand/40 ring-1 ring-brand/30` treatment
 *  reads as a single teal outline regardless of which tile is on. */
const ACTIVE_TONE: Record<Tone, string> = {
  rose:   'bg-rose-50 border-rose-300 ring-1 ring-rose-300/60',
  orange: 'bg-orange-50 border-orange-300 ring-1 ring-orange-300/60',
  amber:  'bg-amber-50 border-amber-300 ring-1 ring-amber-300/60',
  sky:    'bg-sky-50 border-sky-300 ring-1 ring-sky-300/60',
};

export function AlertCardsStrip() {
  const {
    alertMetrics,
    alertCardFilter,
    setAlertCardFilter,
    onAlertCardActivate,
  } = useSalesPipeline();

  /** Toggle a tile's filter. Re-clicking the active tile clears it;
   *  otherwise activates + fires the page-side effect (jump to
   *  Actions tab with that cohort pre-filtered). */
  const handleClick = (filter: AlertCardFilter) => {
    if (alertCardFilter === filter) {
      setAlertCardFilter('none');
      return;
    }
    setAlertCardFilter(filter);
    onAlertCardActivate(filter);
  };

  // Meetings shows today's count if any, else this-week count, plus an
  // optional "+N wk" delta when today has events but the week is bigger.
  const meetingsPrimary = alertMetrics.meetingsToday > 0
    ? alertMetrics.meetingsToday
    : alertMetrics.meetingsThisWeek;
  const meetingsWeekDelta = alertMetrics.meetingsToday > 0 && alertMetrics.meetingsThisWeek > alertMetrics.meetingsToday
    ? alertMetrics.meetingsThisWeek - alertMetrics.meetingsToday
    : 0;
  const meetingsSubLabel = alertMetrics.meetingsToday > 0 ? 'Today' : 'This week';

  const tiles: TileConfig[] = [
    {
      filter: 'booking_needed',
      label: 'Booking Needed',
      sublabel: 'No future meeting',
      icon: Calendar,
      value: alertMetrics.bamfamViolations,
      tone: 'rose',
    },
    {
      filter: 'overdue',
      label: 'Overdue',
      sublabel: 'Past meeting date',
      icon: Clock,
      value: alertMetrics.overdueFollowups,
      tone: 'orange',
    },
    {
      filter: 'stale',
      label: 'Stale (7d+)',
      sublabel: 'No contact 7+ days',
      icon: RotateCcw,
      value: alertMetrics.staleDeals,
      tone: 'amber',
    },
    {
      filter: 'at_risk',
      label: 'At Risk',
      sublabel: 'Closing, temp < 40',
      icon: TrendingUp,
      value: alertMetrics.dealsAtRisk,
      tone: 'rose',
    },
    {
      filter: 'meetings',
      label: 'Meetings',
      sublabel: meetingsSubLabel,
      icon: Calendar,
      value: meetingsPrimary,
      secondary: meetingsWeekDelta,
      tone: 'sky',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
      {tiles.map(t => {
        const isActive = alertCardFilter === t.filter;
        const hasCount = t.value > 0;
        const Icon = t.icon;
        return (
          <button
            key={t.filter}
            type="button"
            onClick={() => handleClick(t.filter)}
            aria-pressed={isActive}
            className={`group flex flex-col gap-1 text-left px-3 py-2.5 rounded-lg border transition-colors ${
              isActive
                ? ACTIVE_TONE[t.tone]
                : 'bg-white border-cream-200 hover:bg-cream-50/60'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${hasCount ? ICON_TONE[t.tone] : 'text-ink-warm-300'}`} />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-warm-500 truncate">
                {t.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-bold leading-none tabular-nums ${hasCount ? VALUE_TONE[t.tone] : 'text-ink-warm-300'}`}>
                {t.value}
              </span>
              {t.secondary && t.secondary > 0 ? (
                <span className="text-[10px] tabular-nums text-ink-warm-400">+{t.secondary} wk</span>
              ) : null}
            </div>
            <span className="text-[10px] text-ink-warm-400 truncate">
              {t.sublabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
