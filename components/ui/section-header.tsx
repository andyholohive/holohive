import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * SectionHeader — v11 chapter-divider primitive (2026-06-01).
 *
 * Wraps the `.section-head` CSS pattern as a React component so pages
 * can declare a chapter break without writing raw HTML. Used to split
 * long admin pages (Dashboard, Clients, KOL detail) into clearly named
 * regions.
 *
 * Visual treatment (defined in app/globals.css):
 *   - 1px hairline border-top above the row (skipped when `first`)
 *   - Bold ink-warm-900 uppercase label at 0.28em letter-spacing
 *   - Optional colored dot prefix before the label
 *   - Optional mono counter on the right (e.g. "01 — Pipeline · KPIs")
 *
 * Usage:
 *
 *   <SectionHeader
 *     label="Overview"
 *     dot="brand"
 *     counter="01 — Pipeline · KPIs"
 *     first
 *   />
 *
 *   <SectionHeader label="Engagements" dot="sky" counter="02 — Client health" />
 *
 *   <SectionHeader label="Activity" dot="amber" counter="03 — Pipeline · Renewals" />
 */

export type SectionDot = 'brand' | 'sky' | 'violet' | 'amber' | 'emerald' | 'rose';

const DOT_CLASSES: Record<SectionDot, string> = {
  brand:   'bg-brand',
  sky:     'bg-sky-500',
  violet:  'bg-violet-500',
  amber:   'bg-amber-500',
  emerald: 'bg-emerald-500',
  rose:    'bg-rose-500',
};

interface SectionHeaderProps {
  /** Section name — rendered as the uppercase tracked label. Required. */
  label: string;
  /** Optional colored dot prefix. */
  dot?: SectionDot;
  /** Optional mono counter rendered on the right
   *  (e.g. "01 — Pipeline · KPIs"). */
  counter?: string;
  /** First section on the page — drops the top hairline border
   *  (which would otherwise read as a "header for nothing" above the
   *  page's outer padding). */
  first?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
}

export function SectionHeader({
  label,
  dot,
  counter,
  first = false,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('section-head', first && 'first', className)}>
      <div className="left flex items-center gap-2">
        {dot && (
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT_CLASSES[dot]}`} aria-hidden />
        )}
        <span className="label">{label}</span>
      </div>
      {counter && <span className="counter">{counter}</span>}
    </div>
  );
}
