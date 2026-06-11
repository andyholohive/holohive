/**
 * Telegram /bug + /req parser.
 *
 * Per the Backlog Tab spec (Jdot, 2026-06-08): two ways into a Backlog
 * item, one of which is the Telegram command. The bot version stays
 * deliberately tiny — the spec emphasizes "keep the barrier low" so a
 * bare command plus a description should still create a valid item.
 *
 * Area detection uses the hashtag convention I proposed in the review
 * (Jdot accepted the defaults path):
 *   /bug #content-dashboard the table headers are misaligned
 *   /req #kol-cards add a "duplicate" action to the card menu
 *   /bug images aren't loading                                    ← area = other
 *
 * Why hashtag and not first-word lookup: the spec is ambiguous about
 * "/bug Content Dashboard breaks" — does Content Dashboard match as
 * a two-word area or does "Content" not match anything and the whole
 * thing becomes the description? Hashtags sidestep that with a single
 * character. Users who forget can re-tag from the modal.
 */

import type { BacklogArea } from '@/lib/backlogService';

// Single source for the user-facing forms of each area. Both
// hyphenated (content-dashboard) and underscored (content_dashboard)
// resolve to the same enum value — saves users from remembering which
// separator we picked.
const AREA_ALIASES: Record<string, BacklogArea> = {
  'content-dashboard': 'content_dashboard',
  'content_dashboard': 'content_dashboard',
  'kol-mastersheet': 'kol_mastersheet',
  'kol_mastersheet': 'kol_mastersheet',
  'budget-dashboard': 'budget_dashboard',
  'budget_dashboard': 'budget_dashboard',
  'priority-dashboard': 'priority_dashboard',
  'priority_dashboard': 'priority_dashboard',
  'kol-cards': 'kol_cards',
  'kol_cards': 'kol_cards',
  'client-success': 'client_success',
  'client_success': 'client_success',
  'other': 'other',
};

export type ParsedBacklogCommand = {
  area: BacklogArea;
  title: string;         // capped to 80 chars for the table cell
  description: string;   // full body
};

/**
 * Parse a /bug or /req command body.
 *
 * Accepts either the message text or the photo caption (both flow
 * through the same field on Telegram's side). Strips the command and
 * any @bot mention, then peels off a leading hashtag if it matches a
 * known area.
 */
export function parseBacklogCommand(text: string): ParsedBacklogCommand {
  let body = (text || '').trim();

  // Strip "/bug" or "/req" plus optional bot mention.
  body = body.replace(/^\/(bug|req)(@\w+)?\s*/i, '').trim();

  // Hashtag area detection. The hashtag MUST be the first token —
  // mid-message hashtags belong in the description.
  let area: BacklogArea = 'other';
  const hashtagMatch = body.match(/^#([a-z0-9_-]+)\s*([\s\S]*)$/i);
  if (hashtagMatch) {
    const tag = hashtagMatch[1].toLowerCase();
    const matchedArea = AREA_ALIASES[tag];
    if (matchedArea) {
      area = matchedArea;
      body = hashtagMatch[2].trim();
    }
    // If the hashtag didn't match any area we leave it in the body —
    // the user might just be tagging their issue with project shorthand.
  }

  const description = body || '(no description)';
  // Title is the first 80 chars of the description, broken at the
  // first newline if one occurs early. Same line-clamp the modal
  // would show in the table.
  const firstLine = description.split('\n')[0].trim();
  const title = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;

  return { area, title, description };
}
