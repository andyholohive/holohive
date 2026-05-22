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

interface PageHeaderProps {
  /** Page title. Required. Renders as h2. */
  title: string;
  /** Optional one-line description under the title. */
  subtitle?: string;
  /** Optional lucide-style icon component to render before the title. */
  icon?: React.ComponentType<{ className?: string }>;
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
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-gray-700 flex-shrink-0" />}
            <span className="truncate">{title}</span>
          </h2>
          {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
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
