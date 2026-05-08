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

const ACCENTS: Record<KpiAccent, string> = {
  gray:    'bg-gray-50 text-gray-600',
  brand:   'bg-brand/10 text-brand',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber:   'bg-amber-50 text-amber-700',
  rose:    'bg-rose-50 text-rose-700',
  sky:     'bg-sky-50 text-sky-700',
  purple:  'bg-purple-50 text-purple-700',
};

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  /** Optional one-line subtext below the value (e.g. trend, count detail). */
  sub?: string;
  /** Color of the icon square. Default 'gray'. */
  accent?: KpiAccent;
}

export function KpiCard({ icon: Icon, label, value, sub, accent = 'gray' }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${ACCENTS[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
