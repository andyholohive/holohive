import React from 'react';

/**
 * KpiCard — small numeric stat card used in page headers (analytics,
 * crm/network, crm/contacts).
 *
 * Replaces the ad-hoc gradient stat cards that lived inline in network +
 * contacts (audit 2026-05-06): those used `bg-gradient-to-br from-blue-50`
 * etc. which diverged sharply from the flat baseline used on /analytics.
 * This component IS the baseline — flat white card, small accent square
 * for the icon, accent picked from a fixed palette.
 *
 * Usage:
 *   <KpiCard
 *     icon={Handshake}
 *     label="Active Partners"
 *     value={42}
 *     sub="3 added this week"
 *     accent="brand"
 *   />
 *
 * Value is `string | number` so callers can format their own (e.g.
 * money formatters from /analytics) without forcing the component to
 * know about money/duration/etc.
 *
 * Originally inlined inside /analytics; extracted here so /network and
 * /contacts can replace their gradient cards. If you add a new accent,
 * keep the bg-X-50 + text-X-700 (or 600) pattern for visual consistency.
 */

export type KpiAccent =
  | 'gray'
  | 'brand'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'purple';

/**
 * v11 design system (2026-06-01):
 *   - Default surface uses cream-200 hairline + shadow-card (matches
 *     the Card primitive treatment).
 *   - Icon tile gets a same-tone 1px hairline border for definition
 *     without extra ornament.
 *   - Optional `topAccent` prop renders a 2px colored top stripe in
 *     the accent color — used for asymmetric Dashboard hero rows.
 *   - Value typography refined: font-semibold + tight -0.025em tracking
 *     + tabular-nums for column alignment.
 */
const ACCENT_TILE: Record<KpiAccent, string> = {
  gray:    'bg-cream-100 text-ink-warm-700 border-cream-200',
  brand:   'bg-brand-soft text-brand-deep border-brand-light',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber:   'bg-amber-50 text-amber-700 border-amber-100',
  rose:    'bg-rose-50 text-rose-700 border-rose-100',
  sky:     'bg-sky-50 text-sky-700 border-sky-100',
  purple:  'bg-purple-50 text-purple-700 border-purple-100',
};

const ACCENT_TOP: Record<KpiAccent, string> = {
  gray:    'bg-ink-warm-300',
  brand:   'bg-brand',
  emerald: 'bg-emerald-500',
  amber:   'bg-amber-500',
  rose:    'bg-rose-500',
  sky:     'bg-sky-500',
  purple:  'bg-purple-500',
};

/**
 * Week-over-week trend signal. Color convention per HHP Initiative
 * Feature Checklist vF: green up, neutral flat, red down — but for
 * metrics where "up = bad" (e.g. Overdue), set `upIsGood: false` to
 * flip the polarity (up = red, down = green). Flat is always neutral.
 */
export interface KpiTrend {
  /** Signed delta vs prior period (e.g. +5, -3, 0). */
  delta: number;
  /** Optional explicit direction override. Derived from delta otherwise. */
  direction?: 'up' | 'down' | 'flat';
  /** When true (default), up = green. Set false for Overdue and friends. */
  upIsGood?: boolean;
  /** Override the rendered label after the arrow (e.g. "+8 vs last 7d").
   *  Defaults to a signed number. */
  label?: string;
}

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  /** Optional one-line subtext below the value (e.g. trend, count detail). */
  sub?: string;
  /** Color of the icon square + top accent stripe. Default 'gray'. */
  accent?: KpiAccent;
  /** v11: render a 2px colored top stripe in the accent color.
   *  Off by default (existing pages keep their current look). */
  topAccent?: boolean;
  /** Optional WoW trend chip. Rendered inline next to the big number. */
  trend?: KpiTrend;
}

function TrendChip({ trend }: { trend: KpiTrend }) {
  const dir: 'up' | 'down' | 'flat' =
    trend.direction ?? (trend.delta > 0 ? 'up' : trend.delta < 0 ? 'down' : 'flat');
  const upIsGood = trend.upIsGood ?? true;
  const tone =
    dir === 'flat'
      ? 'text-ink-warm-400'
      : (dir === 'up') === upIsGood
        ? 'text-emerald-600'
        : 'text-rose-600';
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
  const label =
    trend.label ??
    (dir === 'flat' ? '0' : `${trend.delta > 0 ? '+' : ''}${trend.delta}`);
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${tone}`}>
      <span aria-hidden>{arrow}</span>
      {label}
    </span>
  );
}

export function KpiCard({ icon: Icon, label, value, sub, accent = 'gray', topAccent = false, trend }: KpiCardProps) {
  // v11: no hover effect — KPI cards are display-only, not interactive.
  // The Card-style hover (border + lift) would falsely imply clickability.
  return (
    <div className="relative bg-white rounded-[14px] border border-cream-200 p-5 shadow-card overflow-hidden">
      {topAccent && (
        <span className={`absolute top-0 left-4 right-4 h-[2px] rounded-b ${ACCENT_TOP[accent]}`} aria-hidden />
      )}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.18em] truncate flex-1">{label}</p>
        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 border ${ACCENT_TILE[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <p
          className="text-[28px] font-semibold text-ink-warm-900 tabular-nums leading-none"
          style={{ letterSpacing: '-0.03em' }}
        >
          {value}
        </p>
        {trend && <TrendChip trend={trend} />}
      </div>
      {sub && <p className="text-xs text-ink-warm-500 mt-2">{sub}</p>}
    </div>
  );
}
