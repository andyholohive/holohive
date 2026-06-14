/**
 * Date formatting helpers — single source of truth for how dates are
 * shown to users across the HoloHive Portal.
 *
 * Canonical format is **mm/dd/yyyy** (en-US) per Andy 2026-06-14. All
 * absolute-date helpers output the same `12/15/2025` shape; only the
 * date-time and time-only helpers append a time portion.
 *
 * Picking the right helper:
 *   - `formatDate`      — "12/15/2025"             — DEFAULT for all
 *     absolute dates (tables, list rows, badges, headers).
 *   - `formatDateTime`  — "12/15/2025 3:45 PM"      — precise event marks
 *     (meeting started, deploy time, audit log entries).
 *   - `formatTime`      — "3:45 PM"                 — time-only when the
 *     date is implied (today's meetings, "next sync at …").
 *   - `formatRelative`  — "2 days ago"              — recency signals
 *     (last_contacted_at, last_seen_at, "X commented N ago").
 *   - `toIsoDate`       — "2025-12-15"              — DB roundtrips only
 *     (date-only columns). Never display this to users.
 *
 * `formatShort`, `formatFull`, and `formatLong` are kept as aliases of
 * `formatDate` so legacy callers keep compiling — they all collapse to
 * the same mm/dd/yyyy output.
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

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
};

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
};

/**
 * "12/15/2025" — the canonical absolute-date format. Use everywhere a
 * date is shown to a user except recency-flavored contexts.
 */
export function formatDate(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('en-US', DATE_OPTS);
}

/** Alias of `formatDate` — kept for callers that historically wanted
 *  "Dec 15" with no year. mm/dd/yyyy still includes the year now. */
export const formatShort = formatDate;

/** Alias of `formatDate`. */
export const formatFull = formatDate;

/** Alias of `formatDate` — kept for callers that historically wanted
 *  "December 15, 2025". mm/dd/yyyy is the new canonical even for
 *  "formal" contexts. */
export const formatLong = formatDate;

/** "12/15/2025 3:45 PM" — date + time for precise event markers. */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  const date = d.toLocaleDateString('en-US', DATE_OPTS);
  const time = d.toLocaleTimeString('en-US', TIME_OPTS);
  return `${date} ${time}`;
}

/** "3:45 PM" — time-only, when the date is implied. */
export function formatTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', TIME_OPTS);
}

/** "2 days ago" / "in 3 hours" — relative phrasing. Wraps date-fns
 *  with the addSuffix option so output is always self-describing. */
export function formatRelative(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * "5m ago" / "3h ago" / "12/15/2025" — terse relative phrasing for
 * dense table cells and chip metadata. Switches to absolute mm/dd/yyyy
 * once the date is more than 6 days old (relative phrasing stops being
 * scannable at that point). Replaces the 6 inline implementations that
 * used to live in ContentSubmissionsBanner, ChatThreadPicker,
 * /crm/telegram's Topics tab, /clients, the Internal dashboard tab, etc.
 */
export function formatRelativeShort(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(d);
}

/** ISO YYYY-MM-DD — the canonical storage format for date-only fields.
 *  Use this for anything heading to the DB (e.g. due_date columns).
 *  Never display this to users — pair with `formatDate` for that. */
export function toIsoDate(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
