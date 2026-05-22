/**
 * Date formatting helpers — single source of truth for how dates are
 * shown to users across the HoloHive Portal.
 *
 * Before this module landed (May 2026 design audit), date display was
 * fragmented:
 *   - 43 raw `toLocaleDateString` calls with no options (locale-dependent
 *     output — a US viewer saw "12/15/2025", an EU viewer saw "15/12/2025")
 *   - 32 `.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })`
 *   - 13 same with year added
 *   - A handful of `formatDistanceToNow` from date-fns
 *
 * All three "consistent" patterns are kept and exposed here so callers
 * can pick the right one for their context. The raw locale-dependent
 * calls are what we're getting away from.
 *
 * Picking the right helper:
 *   - `formatShort`   — "Dec 15"           — recent dates inside the
 *     current year (lists, table cells, badges where the year is obvious)
 *   - `formatFull`    — "Dec 15, 2025"     — dates that might span
 *     multiple years (created_at, completed_at, archive views)
 *   - `formatLong`    — "December 15, 2025" — formal contexts (legal,
 *     audit trails, exported reports)
 *   - `formatRelative` — "2 days ago"      — recency-flavored signals
 *     (last_contacted_at, last_seen_at, "X commented N ago")
 *   - `formatDateTime` — "Dec 15, 2025 3:45 PM" — precise event marks
 *     (meeting started, deploy time)
 *
 * All helpers handle null/undefined gracefully and return an empty
 * string, so callers don't need to guard every call with a ternary.
 */

import { formatDistanceToNow } from 'date-fns';

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input == null || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** "Dec 15" — short date without year. Use when year is obvious (recent items). */
export function formatShort(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Dec 15, 2025" — short date with year. Default for most table cells / list rows. */
export function formatFull(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "December 15, 2025" — long form for formal contexts. */
export function formatLong(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "2 days ago" / "in 3 hours" — relative phrasing. Wraps date-fns
 *  with the addSuffix option enabled so output is always self-describing. */
export function formatRelative(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

/** "Dec 15, 2025 3:45 PM" — date + time for precise event markers. */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} ${time}`;
}

/** "3:45 PM" — time-only, when the date is implied from context (e.g. today's meetings list). */
export function formatTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** ISO YYYY-MM-DD — the canonical storage format for date-only fields.
 *  Use this for anything heading to the DB (e.g. due_date columns). */
export function toIsoDate(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
