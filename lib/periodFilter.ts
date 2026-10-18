/**
 * Period filter shared by the Outreach board and the Pipeline board
 * [Andy 2026-10-18]: "what's been done this week / month / quarter".
 *
 * Calendar periods start on the team's clock (Korea), so "this week" is
 * Monday 00:00 KST, not whatever the browser's timezone says. Rolling
 * periods ("last 7 days") are plain day counts. A row with no date is kept
 * only under "all time".
 */

export type PeriodKey = 'all' | 'this_week' | 'last_7' | 'this_month' | 'last_30' | 'this_quarter' | 'last_90';

export const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'all', label: 'All time' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_7', label: 'Last 7 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: 'Last 30 days' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'last_90', label: 'Last 90 days' },
];

const KST = 9 * 3_600_000;
const DAY = 86_400_000;

/** Start of the period as a UTC timestamp, or null for all time. */
export function periodStart(key: PeriodKey, now = Date.now()): number | null {
  if (key === 'all') return null;
  // Work in KST calendar terms, then shift back to UTC.
  const k = new Date(now + KST);
  const y = k.getUTCFullYear(), m = k.getUTCMonth(), d = k.getUTCDate();
  const kstMidnight = (yy: number, mm: number, dd: number) => Date.UTC(yy, mm, dd) - KST;
  switch (key) {
    case 'this_week': return kstMidnight(y, m, d - ((k.getUTCDay() + 6) % 7));
    case 'this_month': return kstMidnight(y, m, 1);
    case 'this_quarter': return kstMidnight(y, m - (m % 3), 1);
    case 'last_7': return now - 7 * DAY;
    case 'last_30': return now - 30 * DAY;
    case 'last_90': return now - 90 * DAY;
  }
}

/** Whether an ISO date / timestamp falls inside the period. A bare date (YYYY-MM-DD) is read as that day in Korea. */
export function inPeriod(iso: string | null | undefined, key: PeriodKey, now = Date.now()): boolean {
  const start = periodStart(key, now);
  if (start === null) return true;
  if (!iso) return false;
  const t = iso.length === 10 ? Date.parse(`${iso}T00:00:00Z`) - KST + DAY - 1 : Date.parse(iso);
  return Number.isFinite(t) && t >= start;
}

export const periodLabel = (key: PeriodKey) => PERIODS.find((p) => p.key === key)?.label ?? 'All time';
