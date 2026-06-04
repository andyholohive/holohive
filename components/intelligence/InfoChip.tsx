'use client';

/**
 * InfoChip — the small "label + value" chip that lives in the
 * intelligence PageHeader actions slot. Used three times (Schedule /
 * Alerts / Cost) — DRYed up 2026-06-03.
 *
 * Variants:
 *   - `as="button"` (default) — clickable chip with hover state, used
 *     for Schedule + Alerts (each opens its config dialog).
 *   - `as="hoverable"` — non-clickable wrapper for HoverCard-driven
 *     chips like the Cost breakdown.
 *
 * The icon tint encodes state (brand when active, ink-warm-500 when
 * not). The previous design added a colored dot on top — same signal
 * twice. Dropped 2026-06-03.
 */

import type { LucideIcon } from 'lucide-react';

interface InfoChipProps {
  icon: LucideIcon;
  /** Tiny uppercase label above the value (e.g. "Auto-scan"). */
  label: string;
  /** The value text (e.g. "On" / "$0.42"). */
  value: React.ReactNode;
  /** Whether the chip is in an "active/on" state — drives the icon
   *  tint. Optional; defaults to false (muted). */
  active?: boolean;
  /** Click handler. When provided, the chip renders as a button. */
  onClick?: () => void;
  /** Tooltip / title attribute. */
  title?: string;
  /** Optional aria-label override (defaults to title). */
  ariaLabel?: string;
}

export function InfoChip({
  icon: Icon,
  label,
  value,
  active = false,
  onClick,
  title,
  ariaLabel,
}: InfoChipProps) {
  const baseClasses = 'flex items-center gap-1.5 bg-cream-50 border border-cream-200 rounded-lg px-3 py-1.5 select-none transition-colors';
  const interactive = onClick ? 'hover:bg-cream-100 cursor-pointer' : 'cursor-help';
  const inner = (
    <>
      <Icon className={`h-3.5 w-3.5 ${active ? 'text-brand' : 'text-ink-warm-500'}`} />
      <div className="flex flex-col text-left">
        <span className="text-[10px] text-ink-warm-500 leading-none uppercase tracking-wider">{label}</span>
        <span className="text-sm font-semibold text-ink-warm-900 leading-tight">
          {value}
        </span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClasses} ${interactive}`}
        title={title}
        aria-label={ariaLabel || title}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      className={`${baseClasses} ${interactive}`}
      title={title}
      aria-label={ariaLabel || title}
    >
      {inner}
    </div>
  );
}
