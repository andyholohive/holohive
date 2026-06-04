'use client';

/**
 * MetricCard — compact stat card used by the Metrics tab + the
 * Outreach-tab metrics strip.
 *
 * `tone` lets us color-code green/red without changing layout —
 * 'good' tints the value emerald, 'bad' tints it rose, undefined or
 * 'neutral' leaves it as the default ink-warm color.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` on 2026-06-02 as
 * part of the Phase 1 structural split. Originally an arrow function
 * inside the page; moving it out lets both MetricsPanel and the
 * Outreach tab (Phase 2 extraction) consume it without re-importing
 * from the page.
 */

interface MetricCardProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'good' | 'bad' | 'neutral';
}

export function MetricCard({ label, value, hint, tone }: MetricCardProps) {
  const valueClass =
    tone === 'good' ? 'text-emerald-700' :
    tone === 'bad' ? 'text-rose-600' :
    'text-ink-warm-900';
  return (
    <div className="bg-cream-50 rounded-lg p-3 border border-cream-200">
      <div className="text-[11px] text-ink-warm-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 tabular-nums ${valueClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-ink-warm-500 mt-0.5">{hint}</div>}
    </div>
  );
}
