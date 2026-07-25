/**
 * Canonical vocabulary for a KOL's per-campaign status (`campaign_kols.hh_status`).
 *
 * Background: before 2026-07-25 there were five independent copies of this
 * mapping — two `KOL_STATUS_TONES` records, two `getStatusColor` switches, and
 * the portal's `kolStatusMap` — spread across the public tracker, the internal
 * table, the internal cards, and the client portal. They drifted: `Onboarded`
 * was amber in four of them and purple in the fifth, so a signed-and-working
 * KOL never read as green anywhere, and `Interested` was indistinguishable
 * from `Onboarded`. Recoloring meant finding all five.
 *
 * One vocabulary for the whole app. Add a status here, not inline.
 *
 * NOTE: values are stored Title-Case in Postgres (`Curated`, `Onboarded`, …).
 * `statusOrderIndex` and `toneForKolStatus` are case-sensitive by design so a
 * casing drift surfaces as `neutral`/end-of-list rather than silently matching.
 */

import type { BadgeTone } from '@/components/ui/status-badge';

/** Workflow order — sorting by this beats alphabetical, which would put
 *  Concluded ahead of Onboarded. Unknown/null sorts to the end. */
export const KOL_STATUS_ORDER = [
  'Curated',
  'Contacted',
  'Interested',
  'Onboarded',
  'Concluded',
] as const;

export type KolStatus = (typeof KOL_STATUS_ORDER)[number];

export function statusOrderIndex(s: string | null | undefined): number {
  if (!s) return KOL_STATUS_ORDER.length;
  const idx = (KOL_STATUS_ORDER as readonly string[]).indexOf(s);
  return idx === -1 ? KOL_STATUS_ORDER.length : idx;
}

/** StatusBadge tone per status. `Onboarded` is green per Andy 2026-07-25 —
 *  the KOL is signed and working, which is good news, same as Concluded. */
export const KOL_STATUS_TONES: Record<string, BadgeTone> = {
  Curated: 'info',
  Contacted: 'purple',
  Interested: 'warning',
  Onboarded: 'success',
  Concluded: 'success',
};

export function toneForKolStatus(s: string | null | undefined): BadgeTone {
  return (s && KOL_STATUS_TONES[s]) || 'neutral';
}

/**
 * Raw background + text class pair for the places that can't render a full
 * `<StatusBadge>` — the inline `<Select>` trigger tint on the internal table
 * and the filter-popover swatches. Kept in lockstep with KOL_STATUS_TONES
 * above (see TONE_CLASSES in components/ui/status-badge.tsx); prefer
 * `<StatusBadge tone={toneForKolStatus(s)}>` wherever a component fits.
 */
export function kolStatusClassName(s: string | null | undefined): string {
  switch (s) {
    case 'Curated':
      return 'bg-sky-100 text-sky-800';
    case 'Contacted':
      return 'bg-purple-100 text-purple-800';
    case 'Interested':
      return 'bg-amber-100 text-amber-800';
    case 'Onboarded':
      return 'bg-emerald-100 text-emerald-800';
    case 'Concluded':
      return 'bg-emerald-100 text-emerald-800';
    default:
      return 'bg-cream-100 text-ink-warm-700';
  }
}
