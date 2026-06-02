/**
 * Pure helpers for the campaign-detail surfaces. Extracted from
 * `app/campaigns/[id]/page.tsx` (2026-06-02 structural pass) so they
 * can be shared between the page and the dialog / tab components that
 * are being broken out under `components/campaign/*`. None of these
 * touch React state, so they live in lib/ and not in the context.
 *
 * `.tsx` (not .ts) because `getPlatformIcon` returns JSX.
 */

import { Flag, Globe } from 'lucide-react';

// ───────────────────────────────────────────────────────────────────
// Brand-teal hex constants
// ───────────────────────────────────────────────────────────────────

/**
 * Brand-teal hex constants for SVG / inline-CSS surfaces that can't
 * accept a Tailwind class (recharts `stroke`/`fill`, scrollbar colors,
 * `react-day-picker` `modifiersStyles`). Mirrors the `brand` tokens in
 * `tailwind.config.ts` — keep these in sync if the brand palette ever
 * shifts. Prefer `bg-brand` / `text-brand` over these constants
 * everywhere a className is acceptable.
 */
export const BRAND_HEX = '#3e8692';      // brand.DEFAULT
export const BRAND_DARK_HEX = '#2d6470'; // brand.dark

// ───────────────────────────────────────────────────────────────────
// Date helpers
// ───────────────────────────────────────────────────────────────────

/** Format a Date as a local YYYY-MM-DD string (no UTC shift). */
export function formatDateLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Format a YYYY-MM-DD string as MM/DD/YYYY for display in calendar pickers. */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

// ───────────────────────────────────────────────────────────────────
// Region + platform iconography
// ───────────────────────────────────────────────────────────────────

/** Region → flag emoji + lucide icon. Default to white-flag + Flag icon. */
export function getRegionIcon(region: string): { flag: string; icon: typeof Flag } {
  const regionMap: { [key: string]: { flag: string; icon: typeof Flag } } = {
    Vietnam:     { flag: '🇻🇳', icon: Flag },
    Turkey:      { flag: '🇹🇷', icon: Flag },
    SEA:         { flag: '🌏', icon: Globe },
    Philippines: { flag: '🇵🇭', icon: Flag },
    Korea:       { flag: '🇰🇷', icon: Flag },
    Global:      { flag: '🌍', icon: Globe },
    China:       { flag: '🇨🇳', icon: Flag },
    Brazil:      { flag: '🇧🇷', icon: Flag },
  };
  return regionMap[region] || { flag: '🏳️', icon: Flag };
}

/** Platform name → small inline glyph. Returns null for unknown platforms. */
export function getPlatformIcon(platform: string): JSX.Element | null {
  switch (platform) {
    case 'X':
      return <span className="font-bold text-black text-sm">𝕏</span>;
    case 'Telegram':
      return (
        <svg className="h-4 w-4 text-brand" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
        </svg>
      );
    case 'YouTube':
      return (
        <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case 'Facebook':
      return (
        <svg className="h-4 w-4 text-brand" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case 'TikTok':
      return (
        <svg className="h-4 w-4 text-black" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      );
    default:
      return null;
  }
}

// ───────────────────────────────────────────────────────────────────
// Category-coloring helpers (legacy color systems — see CLAUDE.md
// "Known exception" note for /kols. These tone families live outside
// the 9-tone StatusBadge palette; they're documented exceptions.)
// ───────────────────────────────────────────────────────────────────

export function getContentTypeColor(type: string): string {
  const colorMap: { [key: string]: string } = {
    Post:            'bg-sky-100 text-sky-800',
    Video:           'bg-rose-100 text-rose-800',
    Article:         'bg-emerald-100 text-emerald-800',
    AMA:             'bg-purple-100 text-purple-800',
    Ambassadorship:  'bg-amber-100 text-amber-800',
    Alpha:           'bg-amber-100 text-amber-800',
    QRT:             'bg-cyan-100 text-cyan-800',
    Thread:          'bg-teal-100 text-teal-800',
    Spaces:          'bg-pink-100 text-pink-800',
    Newsletter:      'bg-slate-100 text-slate-800',
  };
  return colorMap[type] || 'bg-cream-100 text-ink-warm-700';
}

export function getCreatorTypeColor(creatorType: string): string {
  const colorMap: { [key: string]: string } = {
    'Native (Meme/Culture)': 'bg-purple-100 text-purple-800',
    'Drama-Forward':         'bg-rose-100 text-rose-800',
    Skeptic:                 'bg-amber-100 text-amber-800',
    Educator:                'bg-sky-100 text-sky-800',
    'Bridge Builder':        'bg-emerald-100 text-emerald-800',
    Visionary:               'bg-indigo-100 text-indigo-800',
    Onboarder:               'bg-teal-100 text-teal-800',
    General:                 'bg-cream-100 text-ink-warm-700',
    Gaming:                  'bg-pink-100 text-pink-800',
    Crypto:                  'bg-amber-100 text-amber-800',
    Memecoin:                'bg-amber-100 text-amber-800',
    NFT:                     'bg-purple-100 text-purple-800',
    Trading:                 'bg-emerald-100 text-emerald-800',
    AI:                      'bg-sky-100 text-sky-800',
    Research:                'bg-indigo-100 text-indigo-800',
    Airdrop:                 'bg-teal-100 text-teal-800',
    Art:                     'bg-pink-100 text-pink-800',
  };
  return colorMap[creatorType] || 'bg-cream-100 text-ink-warm-700';
}

export function getNewContentTypeColor(contentType: string): string {
  const colorMap: { [key: string]: string } = {
    Meme:                       'bg-amber-100 text-amber-800',
    News:                       'bg-sky-100 text-sky-800',
    Trading:                    'bg-emerald-100 text-emerald-800',
    'Deep Dive':                'bg-purple-100 text-purple-800',
    'Meme/Cultural Narrative':  'bg-pink-100 text-pink-800',
    'Drama Queen':              'bg-rose-100 text-rose-800',
    Sceptics:                   'bg-amber-100 text-amber-800',
    'Technical Educator':       'bg-indigo-100 text-indigo-800',
    'Bridge Builders':          'bg-teal-100 text-teal-800',
    Visionaries:                'bg-cyan-100 text-cyan-800',
  };
  return colorMap[contentType] || 'bg-cream-100 text-ink-warm-700';
}

export function getPricingColor(pricing: string): string {
  const colorMap: { [key: string]: string } = {
    '<$200':    'bg-emerald-100 text-emerald-800',
    '$200-500': 'bg-amber-100 text-amber-800',
    '$500-1K':  'bg-amber-100 text-amber-800',
    '$1K-2K':   'bg-rose-100 text-rose-800',
    '$2K-3K':   'bg-purple-100 text-purple-800',
    '>$3K':     'bg-pink-100 text-pink-800',
  };
  return colorMap[pricing] || 'bg-sky-100 text-sky-800';
}
