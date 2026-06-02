import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard page-header pattern for HoloHive Portal admin pages.
 *
 * Replaces the organic drift across pages where each page rebuilt its
 * own header — h1 vs h2, text-2xl vs text-3xl, varying icon positions,
 * inconsistent flex layouts, etc. (See the May 2026 design audit.)
 *
 * Locked decisions:
 *   - Always renders as `<h2 text-2xl font-bold>` (matches the
 *     de-facto majority on 14/20 pages pre-audit)
 *   - Optional icon prefix at consistent size (h-5 w-5)
 *   - Optional subtitle rendered as `text-sm text-gray-600`
 *   - Action slot is right-aligned at md+, wraps below the title on
 *     narrow screens (fixes the same overflow issue we fixed by hand
 *     on /clients earlier)
 *   - Outer wrapper applies `flex items-start justify-between gap-3
 *     flex-wrap` so callers don't need to remember the responsive
 *     classes themselves
 *
 * Usage:
 *
 *   <PageHeader
 *     title="Clients"
 *     subtitle="Manage your client relationships"
 *     icon={Building2}
 *     actions={(
 *       <>
 *         <Button variant="brand"><Plus className="h-4 w-4 mr-2" />Start Client</Button>
 *         <Button variant="outline"><Settings className="h-4 w-4 mr-2" />Templates</Button>
 *       </>
 *     )}
 *   />
 *
 * Children render below the title row — useful for filter chips or a
 * "Clear filter: X" link. Keeps that adjacent content from competing
 * with the action slot for horizontal space.
 */

/**
 * v11 design system additions (2026-06-01):
 *   - Optional `kicker` (small uppercase chapter label above the title)
 *     + optional `kickerDot` (colored dot prefix). Renders as the
 *     editorial eyebrow when set — leaves default look unchanged for
 *     the 50+ existing pages that don't pass these props.
 *   - Title + subtitle colors switched to ink-warm-* to match the warm
 *     chrome (visually imperceptible vs. the prior gray-* but ties
 *     the whole shell together).
 */
export type KickerDot = 'brand' | 'sky' | 'violet' | 'amber' | 'emerald' | 'rose';

const KICKER_DOT_CLASSES: Record<KickerDot, string> = {
  brand:   'bg-brand',
  sky:     'bg-sky-500',
  violet:  'bg-violet-500',
  amber:   'bg-amber-500',
  emerald: 'bg-emerald-500',
  rose:    'bg-rose-500',
};

interface PageHeaderProps {
  /** Page title. Required. Renders as h2. */
  title: string;
  /** Optional one-line description under the title. */
  subtitle?: string;
  /** Optional lucide-style icon component to render before the title. */
  icon?: React.ComponentType<{ className?: string }>;
  /** v11: small uppercase chapter label above the title
   *  (e.g. "Internal Success", "People · Client"). */
  kicker?: string;
  /** v11: colored dot before the kicker label. Optional — kicker
   *  works on its own without one. */
  kickerDot?: KickerDot;
  /** Action slot — right-aligned on desktop, wraps below on narrow.
   *  Typically `<Button>` siblings. */
  actions?: React.ReactNode;
  /** Optional content that renders below the title block but above
   *  page content (e.g. filter chips, "back" link). */
  children?: React.ReactNode;
  /** Optional className for the outer wrapper. */
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  kicker,
  kickerDot,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {kicker && (
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-warm-500">
              {kickerDot && (
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${KICKER_DOT_CLASSES[kickerDot]}`} />
              )}
              <span>{kicker}</span>
            </div>
          )}
          <h2 className="text-2xl font-bold text-ink-warm-900 flex items-center gap-2 tracking-tight">
            {Icon && <Icon className="h-5 w-5 text-ink-warm-700 flex-shrink-0" />}
            <span className="truncate">{title}</span>
          </h2>
          {subtitle && <p className="text-sm text-ink-warm-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
