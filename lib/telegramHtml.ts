/**
 * HTML-escape for Telegram `parse_mode: 'HTML'` message bodies.
 *
 * Telegram's HTML mode only recognizes a small tag whitelist, so the
 * only characters that need escaping in user-supplied text are & < >
 * (quotes are fine outside attribute context, which we never emit).
 *
 * [2026-07-05 audit] Consolidated from 8 identical per-route copies.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
