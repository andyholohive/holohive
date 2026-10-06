/**
 * Weekly lineup deadlines [Bolt 2026-10-06].
 *
 * Umia week 11 was meant to have no lineup, but on Monday 10/05 — the day
 * after week 11 ended — a lineup was created for it and then duplicated
 * into week 12. Nothing warned or stopped either step. Rules now:
 *
 *  - A NEW lineup for a week (started or duplicated into) can be set up
 *    until the end of that week's Tuesday, Korea time. Earlier weeks in
 *    the future are always open, so planning ahead is unaffected.
 *  - Once a week has ended (Sunday 23:59 KST), its lineup can't be
 *    changed, unlocked, or created.
 *  - An existing lineup can still be edited after Tuesday while its week
 *    is running (KOL swaps mid-week are normal).
 *
 * Campaign weeks start on Monday (week 1 = first Monday on or after the
 * campaign start), so `weekOf` is always a Monday and a campaign's first
 * week never begins before the campaign does.
 *
 * Mirrored by the database trigger `campaign_lineups_deadline` so no
 * code path can skip it.
 */

const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** Midnight KST that starts the given YYYY-MM-DD, as a UTC timestamp. */
function kstMidnight(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`) - KST_OFFSET_MS;
}

/** Last moment a new lineup for the week starting `weekOf` may be created: Tuesday 23:59:59 KST. */
export function lineupSetupDeadline(weekOf: string): Date {
  return new Date(kstMidnight(weekOf) + 2 * DAY_MS - 1);
}

/** The week starting `weekOf` is over: past Sunday 23:59:59 KST. */
export function lineupWeekEnded(weekOf: string, now = Date.now()): boolean {
  return now > kstMidnight(weekOf) + 7 * DAY_MS - 1;
}

/** Whether a new lineup may still be set up for this week, and if not, why. */
export function canStartLineup(weekOf: string, weekNumber: number, now = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (now <= lineupSetupDeadline(weekOf).getTime()) return { ok: true };
  return {
    ok: false,
    reason: lineupWeekEnded(weekOf, now)
      ? `Week ${weekNumber} has already ended. Lineups can't be set up for past weeks.`
      : `Week ${weekNumber}'s lineup deadline passed on Tuesday. New lineups have to be set up by the end of Tuesday (Korea time) of their week.`,
  };
}

/** "Tue 10/06" style label for the deadline, in Korea time. */
export function deadlineLabel(weekOf: string): string {
  const d = new Date(lineupSetupDeadline(weekOf).getTime() + KST_OFFSET_MS);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `Tue ${mm}/${dd}`;
}

/** YYYY-MM-DD plus n weeks. */
export function addWeeks(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}
