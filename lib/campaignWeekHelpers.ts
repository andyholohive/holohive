/**
 * Canonical week-number math for campaigns.
 *
 * Background: pre-2026-06-23 there were 6 different "Week N" calcs
 * across the app — campaign hero, public portal, dashboard client +
 * renewals-pipeline routes, /clients page, Lineup Manager. Each used a
 * slightly different formula (ceil vs floor, +1 offset, different
 * Monday anchors), so a campaign starting on Wed could show Week 5
 * here, Week 6 there, and Week 7 in the Lineup Manager.
 *
 * One rule for the whole app:
 *
 *   Week 1 is anchored to the first Monday on or after `start_date`.
 *
 * Days BEFORE that Monday still display as Week 1 (no "Week 0" state
 * on an already-running campaign — see Andy's call 2026-06-23).
 *
 * All ISO date strings are interpreted as local midnight to avoid the
 * UTC-shift bug (`new Date('2026-08-06')` is UTC midnight, which is
 * Aug 5 in west-of-UTC timezones). We parse year/month/day explicitly.
 */

function parseLocalIsoDate(iso: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * The first Monday on or after `date`. If `date` is itself a Monday,
 * returns it unchanged.
 */
export function firstMondayOnOrAfter(date: Date): Date {
  const d = startOfDay(date);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days to advance to land on Monday:
  //   Sun(0) → +1, Mon(1) → 0, Tue(2) → +6,
  //   Wed(3) → +5, Thu(4) → +4, Fri(5) → +3, Sat(6) → +2.
  const daysUntilMonday = dow === 1 ? 0 : (8 - dow) % 7;
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

/**
 * Compute the current campaign week. Week 1 = the 7-day block starting
 * on the first Monday on/after `start_date`. Days before that Monday
 * are bucketed into Week 1 (no Week 0).
 *
 * Returns 1-indexed week + the Monday that anchors Week 1.
 */
export function getCampaignWeek(
  startDateIso: string | null | undefined,
  reference: Date = new Date(),
): { weekNumber: number; week1Monday: Date } | null {
  const start = parseLocalIsoDate(startDateIso ?? '');
  if (!start) return null;
  const week1Monday = firstMondayOnOrAfter(start);
  const ref = startOfDay(reference);
  const diff = ref.getTime() - week1Monday.getTime();
  if (diff < 0) return { weekNumber: 1, week1Monday };
  return {
    weekNumber: Math.floor(diff / MS_PER_WEEK) + 1,
    week1Monday,
  };
}

/**
 * Total weeks in a campaign — from Week 1's Monday anchor through the
 * end_date (inclusive). Minimum of 1 even for sub-week campaigns.
 */
export function getTotalCampaignWeeks(
  startDateIso: string | null | undefined,
  endDateIso: string | null | undefined,
): number {
  const start = parseLocalIsoDate(startDateIso ?? '');
  const end = parseLocalIsoDate(endDateIso ?? '');
  if (!start || !end) return 0;
  const week1Monday = firstMondayOnOrAfter(start);
  const diffMs = end.getTime() - week1Monday.getTime();
  if (diffMs < 0) return 1;
  // +1 day so an end_date that lands ON the Sunday of week N counts that week.
  return Math.max(1, Math.ceil((diffMs + MS_PER_DAY) / MS_PER_WEEK));
}

/** Lifecycle of a campaign's week window. `ended` freezes the counter. */
export type CampaignWeekLifecycle = 'not_started' | 'active' | 'ended';

export interface CampaignWeekState {
  /** 1-indexed, clamped to totalWeeks when the engagement has ended. */
  weekNumber: number;
  /** Null when the client has no engagement terms recorded yet — render
   *  "Week N" with no "of M" rather than inventing a denominator. */
  totalWeeks: number | null;
  lifecycle: CampaignWeekLifecycle;
}

/**
 * Canonical "Week N of M" for a campaign. [2026-07-25]
 *
 * M comes ONLY from the engagement (stint terms), surfaced by the
 * `campaign_week_window` view as `term_end`. campaigns.end_date is
 * deliberately not consulted: it is hand-typed at create time and never
 * maintained, so it drifted stale in both directions —
 *   • Altura  end_date 08-15 vs real engagement end 06-14 (too long: the
 *     counter kept climbing weeks after the client had churned), and
 *   • Venice  end_date 07-06 vs real coverage 08-07 (too short: a renewal
 *     extended the engagement but nobody edited the campaign).
 * Sourcing M from the engagement makes renewals extend it and endings
 * freeze it with no manual upkeep.
 *
 * N is clamped to M so an ended engagement stops advancing.
 */
export function getCampaignWeekState(
  startDateIso: string | null | undefined,
  termEndIso: string | null | undefined,
  reference: Date = new Date(),
): CampaignWeekState | null {
  const week = getCampaignWeek(startDateIso, reference);
  if (!week) return null;

  const termEnd = parseLocalIsoDate(termEndIso ?? '');
  if (!termEnd) {
    // No engagement terms on file — honest partial answer.
    return { weekNumber: week.weekNumber, totalWeeks: null, lifecycle: 'active' };
  }

  const totalWeeks = getTotalCampaignWeeks(startDateIso, termEndIso ?? null);
  const ref = startOfDay(reference);
  const start = parseLocalIsoDate(startDateIso ?? '');

  const lifecycle: CampaignWeekLifecycle =
    start && ref < start ? 'not_started'
    : ref > termEnd ? 'ended'
    : 'active';

  return {
    weekNumber: Math.min(totalWeeks, week.weekNumber),
    totalWeeks,
    lifecycle,
  };
}

/**
 * Onboarding-complete = the single graduation line between the milestone
 * tracker and the "Week N" cadence view. True only when there is at least
 * one milestone and EVERY one is `complete`.
 *
 * Both the /clients card and the public portal call this so they can never
 * drift apart — previously the card flipped to "Week N" as soon as the FIRST
 * milestone completed (`milestones[0].status === 'complete'`) while the portal
 * waited for all of them, so a mid-onboarding client (e.g. 3 of 6 done) showed
 * "Week 1" internally but the milestone tracker on its own portal. [Andy 2026-07-23]
 */
export function isOnboardingComplete(
  milestones: ReadonlyArray<{ status: string }>,
): boolean {
  return milestones.length > 0 && milestones.every((m) => m.status === 'complete');
}

/** Monday anchoring week N (1-indexed) for a campaign. Useful for
 *  "Week N runs Mon X → Sun Y" labels. */
export function mondayOfCampaignWeek(
  startDateIso: string | null | undefined,
  weekNumber: number,
): Date | null {
  const start = parseLocalIsoDate(startDateIso ?? '');
  if (!start || weekNumber < 1) return null;
  const week1Monday = firstMondayOnOrAfter(start);
  const target = new Date(week1Monday);
  target.setDate(week1Monday.getDate() + (weekNumber - 1) * 7);
  return target;
}
