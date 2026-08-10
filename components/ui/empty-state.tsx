import React from 'react';

/**
 * Standard empty-state for "no rows yet" / "no matches" situations.
 *
 * Mirrors the icon + text + optional CTA pattern used organically in
 * tasks, delivery-logs, daily-standup, etc. The pattern was identified
 * during the 2026-05-06 audit as the canonical empty state — many
 * pages had bare `<p>No X found</p>` instead. Use this component for
 * any new empty state and migrate the bare ones over time.
 *
 * Usage:
 *
 *   <EmptyState
 *     icon={ClipboardList}
 *     title="No tasks yet."
 *     description="Add your first task to get started."
 *   >
 *     <Button onClick={...}>New Task</Button>
 *   </EmptyState>
 *
 * For the "filters returned nothing" variant, omit children and pass a
 * filter-style title like "No tasks match your filters."
 *
 * [2026-08-10] Repainted from `gray-*` to `ink-warm-*`. The component
 * was still on the pre-v11 gray palette, so it read cold on the cream
 * v11 surfaces — which is why several pages (e.g. /crm/telegram) had
 * hand-rolled their own warm empty states instead of importing this
 * one. Now it matches, so import it rather than rolling a local copy.
 */

interface EmptyStateProps {
  /** Lucide icon component (or any component accepting className) */
  icon: React.ComponentType<{ className?: string }>;
  /** Short headline. Required. */
  title: string;
  /** Optional explanatory line below the title. */
  description?: string;
  /** Optional CTA — typically a Button. Renders below the description. */
  children?: React.ReactNode;
  /** Override container padding. Default `py-16` matches existing usage.
   *  Compact card embeds may want `py-10`. */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div className={`text-center ${className ?? 'py-16'}`}>
      <Icon className="h-12 w-12 text-ink-warm-300 mx-auto mb-3" />
      <p className="text-ink-warm-500 font-medium">{title}</p>
      {description && (
        <p className="text-sm text-ink-warm-400 mt-1 max-w-sm mx-auto">{description}</p>
      )}
      {children && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
