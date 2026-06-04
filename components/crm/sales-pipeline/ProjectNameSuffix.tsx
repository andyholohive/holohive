'use client';

/**
 * ProjectNameSuffix — the small icon that sits to the right of a
 * project name in every opp row across the app:
 *
 *   - When `twitterHandle` is set → an `X` (Twitter) link button that
 *     opens the profile in a new tab.
 *   - When `twitterHandle` is missing → an `Edit` pencil that
 *     appears on row hover and opens the edit dialog so the user
 *     can fill in the handle (or anything else).
 *
 * Extracted from `page.tsx`'s inline `renderProjectNameSuffix` helper
 * on 2026-06-03. Was being threaded through 5 call sites (Outreach,
 * Pipeline, Orbit, Forecast, the action queue) via context — clean
 * component drops one context field and removes the prop-drilling
 * pattern. The callback name has been renamed from the legacy
 * `onAddTwitter` to `onEdit` to match what it actually does (every
 * caller wired it to `openEditDialog(opp)`).
 *
 * Stop-propagation note: callers usually render this inside a row
 * whose parent click opens a slide-over. The icon's `onClick` calls
 * `stopPropagation` so clicking the X / Edit affordance doesn't also
 * trigger the slide-over.
 */

import { Edit, Twitter } from 'lucide-react';

interface ProjectNameSuffixProps {
  /** The opp's `twitter_handle`. Can be a bare handle ("foo"), a
   *  '@foo' string, or a full URL — we normalise to the bare handle
   *  before building the link. */
  twitterHandle: string | null | undefined;
  /** Optional edit affordance — when provided AND no twitter handle
   *  exists, renders the hover-revealed Edit pencil that calls this
   *  on click. Wire it to whatever opens the edit dialog (typically
   *  `() => openEditDialog(opp)`). */
  onEdit?: () => void;
}

export function ProjectNameSuffix({ twitterHandle, onEdit }: ProjectNameSuffixProps) {
  if (twitterHandle) {
    const handle = twitterHandle
      .replace(/^@/, '')
      .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '')
      .replace(/\/$/, '');
    return (
      <a
        href={`https://x.com/${handle}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 inline-flex items-center justify-center h-4 w-4 rounded text-ink-warm-400 hover:bg-blue-50 transition-colors"
        title={`Open @${handle} on X`}
      >
        <Twitter className="h-3 w-3" />
      </a>
    );
  }
  if (onEdit) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center h-4 w-4 rounded text-ink-warm-400 hover:bg-brand-light hover:text-brand transition-all"
        title="Edit opportunity"
      >
        <Edit className="h-3 w-3" />
      </button>
    );
  }
  return null;
}
