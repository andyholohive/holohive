/**
 * Monday Form v2 helper — reads who submitted the weekly check-in.
 *
 * The form (id below) was seeded 2026-06-01 via SQL. It has 5 required
 * textarea fields per Jdot's spec:
 *   1. What's blocking you?
 *   2. What did you win?
 *   3. What gaps need filling?
 *   4. Other context for HQ?
 *   5. Ad-hoc work this past week (added 2026-06-01 per Jdot)
 *
 * The dashboard shows a "Monday check-in" panel under Layer 1
 * (Internal Success) listing every team member with a tick/cross for
 * whether they've submitted this week. The deadline (Monday 12:00 UTC)
 * is sourced from dashboard_config.form_deadline_hour_utc so ops can
 * tune it without a deploy.
 *
 * Submissions are matched by `submitted_by_email = users.email`.
 * If a team member submits as themselves but uses a different email,
 * they'll show as not-submitted — accept this for v1; revisit if it
 * becomes a real issue.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const MONDAY_FORM_ID = 'b5d2c784-1abc-4979-bedc-d24d2c1e8b3f';
export const MONDAY_FORM_SLUG = 'monday-form-v2';

export interface MondayFormStatusEntry {
  user_id: string;
  name: string;
  email: string | null;
  role: string | null;
  submitted: boolean;
  submitted_at: string | null;
  /** True if the deadline (Monday 12:00 UTC) has passed and this user hasn't submitted. */
  isLate: boolean;
}

export interface MondayFormStatus {
  weekOf: string;             // ISO date of the current Monday
  deadlineHourUtc: number;    // from dashboard_config
  deadlinePassed: boolean;    // true after Mon 12:00 UTC
  totalTeamMembers: number;
  submittedCount: number;
  entries: MondayFormStatusEntry[];
}

/** Monday 00:00 UTC of the current ISO week. */
export function mondayOfThisWeek(now = new Date()): Date {
  const d = new Date(now);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getMondayFormStatus(
  sb: SupabaseClient,
  deadlineHourUtc: number,
): Promise<MondayFormStatus> {
  const weekStart = mondayOfThisWeek();
  const weekOf = weekStart.toISOString().slice(0, 10);

  // Has the deadline passed for this week?
  const deadline = new Date(weekStart);
  deadline.setUTCHours(deadlineHourUtc, 0, 0, 0);
  const deadlinePassed = Date.now() >= deadline.getTime();

  // Team = admin + super_admin (active people who own the work).
  // Excludes 'member' (test accounts) and 'guest'.
  const [usersRes, responsesRes] = await Promise.all([
    (sb as any)
      .from('users')
      .select('id, name, email, role')
      .in('role', ['admin', 'super_admin'])
      .order('name'),
    (sb as any)
      .from('form_responses')
      .select('submitted_by_email, submitted_at')
      .eq('form_id', MONDAY_FORM_ID)
      .gte('submitted_at', weekStart.toISOString()),
  ]);

  const team = (usersRes.data ?? []) as Array<{
    id: string;
    name: string;
    email: string | null;
    role: string | null;
  }>;
  const responses = (responsesRes.data ?? []) as Array<{
    submitted_by_email: string | null;
    submitted_at: string;
  }>;

  // Build email → submitted_at map (case-insensitive match)
  const submittedByEmail = new Map<string, string>();
  for (const r of responses) {
    if (!r.submitted_by_email) continue;
    const k = r.submitted_by_email.trim().toLowerCase();
    // Keep the latest if multiple
    const existing = submittedByEmail.get(k);
    if (!existing || r.submitted_at > existing) submittedByEmail.set(k, r.submitted_at);
  }

  const entries: MondayFormStatusEntry[] = team.map(u => {
    const email = (u.email || '').trim().toLowerCase();
    const submittedAt = email ? submittedByEmail.get(email) ?? null : null;
    return {
      user_id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      submitted: !!submittedAt,
      submitted_at: submittedAt,
      isLate: !submittedAt && deadlinePassed,
    };
  });

  const submittedCount = entries.filter(e => e.submitted).length;

  return {
    weekOf,
    deadlineHourUtc,
    deadlinePassed,
    totalTeamMembers: team.length,
    submittedCount,
    entries,
  };
}
