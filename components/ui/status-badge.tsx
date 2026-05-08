import React from 'react';

/**
 * StatusBadge — small inline badge with a centralized tone palette.
 *
 * Replaces the per-page `bg-blue-100 text-blue-800` etc. helper
 * functions that were duplicated across tasks, sops, templates, forms,
 * links, delivery-logs (audit 2026-05-06). Those helpers each had their
 * own color maps which drifted over time — this component owns the
 * canonical palette so adding a new value in one page automatically
 * matches the look in another.
 *
 * Two ways to use:
 *
 *   1. Direct tone (when the tone is known at the call site):
 *
 *      <StatusBadge tone="success">Complete</StatusBadge>
 *
 *   2. Map a value through a per-page lookup (when you want to keep
 *      semantic naming but use the centralized palette):
 *
 *      const STATUS_TONES = { active: 'success', paused: 'warning' } as const;
 *      <StatusBadge tone={STATUS_TONES[status] ?? 'neutral'}>{status}</StatusBadge>
 *
 * Tones are NOT all brand-teal — that was the original audit instinct
 * but a category-coloring system (different tone per status value)
 * is genuinely useful for visual scanning. The fix is consistency of
 * which tones get used, not collapsing them all into one color.
 *
 * Add a new tone here only if you have a real reason — most use cases
 * are covered by the existing 9. The fewer tones, the more visually
 * coherent the app stays.
 */

export type BadgeTone =
  | 'neutral'   // gray   — default / unspecified
  | 'brand'     // teal   — the HoloHive accent (#3e8692)
  | 'success'   // green  — completed, paid, active
  | 'warning'   // amber  — paused, needs attention
  | 'danger'    // rose   — failed, overdue
  | 'info'      // sky    — informational, in-progress
  | 'purple'    // purple — special category (e.g. ready-for-feedback)
  | 'pink'      // pink   — promotional / marketing
  | 'slate';    // slate  — admin / ops

const TONE_CLASSES: Record<BadgeTone, string> = {
  // Each tone is light-bg + dark-fg, no border (matches the existing
  // bg-X-100 text-X-800 pattern that's prevalent across the app).
  neutral: 'bg-gray-100 text-gray-700',
  brand:   'bg-brand-light text-brand',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger:  'bg-rose-100 text-rose-700',
  info:    'bg-sky-100 text-sky-800',
  purple:  'bg-purple-100 text-purple-800',
  pink:    'bg-pink-100 text-pink-800',
  slate:   'bg-slate-100 text-slate-700',
};

interface StatusBadgeProps {
  /** Color tone — defaults to 'neutral'. */
  tone?: BadgeTone;
  /** Badge content — typically a status label. */
  children: React.ReactNode;
  /** 'sm' (text-[10px], px-1.5 py-0.5) or 'md' (text-xs, px-2 py-0.5).
   *  Default 'md'. */
  size?: 'sm' | 'md';
  /** Extra classes appended to the badge. Use sparingly — most needs
   *  should be served by the tone system. */
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<StatusBadgeProps['size']>, string> = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
};

export function StatusBadge({
  tone = 'neutral',
  children,
  size = 'md',
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md font-medium ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]}${className ? ' ' + className : ''}`}
    >
      {children}
    </span>
  );
}

/**
 * Returns just the bg+text className pair for a tone — useful for sites
 * that need to slot the colors into an existing className string (e.g.
 * SelectTrigger styling on the tasks page) instead of using the full
 * `<StatusBadge>` component. Both consumption paths share the same
 * palette, so visual changes here propagate everywhere.
 */
export function toneClassName(tone: BadgeTone): string {
  return TONE_CLASSES[tone];
}
