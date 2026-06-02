import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * CardHeaderEditorial — v11 design system (2026-06-02).
 *
 * Reusable card section header that matches the revamp HTML mockup:
 * editorial display-serif title (Geist 20px medium, tight tracking)
 * with a small mono-uppercase subtitle below. Optional right-aligned
 * action slot for "View all →" links and counters.
 *
 * Used across dashboard tabs (and any other v11 surface) so every
 * card opens with the same rhythm — title size, weight, tracking,
 * and label/subtitle ratio.
 *
 * Usage:
 *   <CardHeaderEditorial
 *     title="Team Workload"
 *     subtitle="Open tasks per teammate · 4 active"
 *     icon={Users}            // optional brand-colored icon
 *     action={<Link href="…">View all →</Link>}
 *   />
 */

interface CardHeaderEditorialProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;       // override the default brand color (e.g. for sky / amber sections)
  action?: React.ReactNode;
  className?: string;
}

export function CardHeaderEditorial({
  title,
  subtitle,
  icon: Icon,
  iconClassName = 'text-brand',
  action,
  className,
}: CardHeaderEditorialProps) {
  return (
    <div className={cn('px-5 py-4 border-b border-cream-100 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <Icon
              className={cn('h-[18px] w-[18px] shrink-0 -translate-y-px', iconClassName)}
              aria-hidden
            />
          )}
          <h3 className="display-serif text-[19px] text-ink-warm-900 leading-none truncate">{title}</h3>
        </div>
        {subtitle && (
          <p className="text-[11px] text-ink-warm-500 mt-1.5 mono uppercase tracking-[0.14em]">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="shrink-0 self-center">{action}</div>
      )}
    </div>
  );
}
