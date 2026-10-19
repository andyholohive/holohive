/**
 * Outreach follow-up queue [Andy 2026-10-19].
 *
 * The audit found 554 live prospects sitting at "Contacted" with zero bumps,
 * 440 of them untouched for a week or more: the first DM goes out, nothing
 * follows. The bump ladder (bump 1 → 2 → 3 → final) already exists as
 * statuses; this gives it a clock, so the board can say who is due a bump
 * today and move them along in one click.
 *
 * Cadence counts from the LAST send: the outreach date for the first bump,
 * then last_bumped_at for each one after. After the final bump, a prospect
 * that still hasn't replied is suggested for parking (stale_no_reply), which
 * keeps the worklist honest without deleting the history the rates use.
 */

import { BUMP_STATUSES, type OutreachProspect, type OutreachStatus } from '@/lib/outreachService';

/** Days after the previous send before bump 1, 2, 3 and the final bump are due. */
export const BUMP_CADENCE_DAYS = [3, 7, 14, 21] as const;
/** Days after the final bump before suggesting the prospect be parked. */
export const PARK_AFTER_FINAL_DAYS = 7;

const DAY = 86_400_000;

/** The next rung on the ladder, or null once the final bump has gone out. */
export function nextBumpStatus(status: OutreachStatus): OutreachStatus | null {
  if (status === 'contacted') return 'bump_1_unseen';
  if (status === 'bump_1_unseen' || status === 'bump_1_seen') return 'bump_2_unseen';
  if (status === 'bump_2_unseen' || status === 'bump_2_seen') return 'bump_3_unseen';
  if (status === 'bump_3_unseen' || status === 'bump_3_seen') return 'final_bump';
  return null;
}

export const BUMP_LABEL: Record<string, string> = {
  bump_1_unseen: 'Bump 1', bump_2_unseen: 'Bump 2', bump_3_unseen: 'Bump 3', final_bump: 'Final bump',
};

export interface FollowUp {
  kind: 'bump' | 'park';
  /** The status a Bump click moves to (bump kind only). */
  next: OutreachStatus | null;
  dueAt: number;
  /** Positive = overdue by this many days; negative = not due yet. */
  overdueDays: number;
  /** When the last message went out, as far as the record shows. */
  lastSendAt: number;
}

/**
 * What this prospect needs next, if anything. Null for parked rows, rows not
 * yet sent, and rows that already replied, died or converted.
 */
export function followUpFor(p: OutreachProspect, now = Date.now()): FollowUp | null {
  if (p.parked_at) return null;
  const onLadder = p.status === 'contacted' || BUMP_STATUSES.includes(p.status);
  if (!onLadder) return null;
  // Last send: the outreach date for a never-bumped row, else the last bump.
  // Rows bumped before last_bumped_at existed fall back to updated_at.
  const lastIso = p.bumps_used > 0 ? (p.last_bumped_at ?? p.updated_at) : p.date_outreached;
  if (!lastIso) return null;
  const lastSendAt = lastIso.length === 10 ? Date.parse(`${lastIso}T00:00:00Z`) : Date.parse(lastIso);
  if (!Number.isFinite(lastSendAt)) return null;

  if (p.status === 'final_bump') {
    const dueAt = lastSendAt + PARK_AFTER_FINAL_DAYS * DAY;
    return { kind: 'park', next: null, dueAt, overdueDays: Math.floor((now - dueAt) / DAY), lastSendAt };
  }
  const step = Math.min(p.bumps_used, BUMP_CADENCE_DAYS.length - 1);
  const dueAt = lastSendAt + BUMP_CADENCE_DAYS[step] * DAY;
  return { kind: 'bump', next: nextBumpStatus(p.status), dueAt, overdueDays: Math.floor((now - dueAt) / DAY), lastSendAt };
}

export const isDue = (f: FollowUp | null, now = Date.now()) => !!f && f.dueAt <= now;

/** "due today" / "3d overdue" / "due in 2d" */
export function dueLabel(f: FollowUp): string {
  if (f.overdueDays === 0) return 'due today';
  return f.overdueDays > 0 ? `${f.overdueDays}d overdue` : `due in ${-f.overdueDays}d`;
}
