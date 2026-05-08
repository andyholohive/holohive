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
      <Icon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">{title}</p>
      {description && (
        <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">{description}</p>
      )}
      {children && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
