import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/snapshot?week_of=YYYY-MM-DD
 *
 * Returns the dashboard snapshot for the requested week (defaults to
 * the current week's Monday). If no snapshot exists for that week,
 * returns the most recent snapshot. If no snapshots exist at all,
 * returns null with 200 — the page renders an empty state.
 *
 * Also returns the list of self-reports for the same week so the page
 * can show "X of Y team members checked in this week" + per-user data.
 */
function mondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { searchParams } = new URL(request.url);
  const requestedWeek = searchParams.get('week_of') || mondayOfWeek(new Date());

  // Four queries in parallel: requested-week snapshot, fallback to
  // most recent, self-reports + DM prompts for this week (for the
  // check-in roster), team roster, and the list of all snapshot
  // weeks (powers the week selector dropdown).
  const [snapRes, fallbackRes, reportsRes, usersRes, weeksRes] = await Promise.all([
    (supabase as any)
      .from('dashboard_snapshots')
      .select('*')
      .eq('week_of', requestedWeek)
      .maybeSingle(),
    (supabase as any)
      .from('dashboard_snapshots')
      .select('*')
      .order('week_of', { ascending: false })
      .limit(1)
      .maybeSingle(),
    (supabase as any)
      .from('dashboard_self_reports')
      .select('id, user_id, primary_focus, blockers, next_week, notes, responded_at, prompted_at, updated_at')
      .eq('week_of', requestedWeek),
    // For the check-in roster: how many active team members exist
    (supabase as any)
      .from('users')
      .select('id, name, email')
      .eq('is_active', true)
      .neq('role', 'guest')
      .neq('role', 'client'),
    // List of all weeks with a snapshot — powers the week selector.
    // Cap to 26 weeks (~6 months) so the dropdown stays manageable.
    (supabase as any)
      .from('dashboard_snapshots')
      .select('week_of')
      .order('week_of', { ascending: false })
      .limit(26),
  ]);

  // Use requested-week snapshot if it exists, else fall back to the
  // most recent. Fallback is flagged in the response so the UI can
  // show "showing last week's snapshot" instead of pretending it's current.
  const snapshot = snapRes.data ?? fallbackRes.data ?? null;
  const isFallback = !snapRes.data && !!fallbackRes.data;

  return NextResponse.json({
    week_of: requestedWeek,
    snapshot,
    is_fallback: isFallback,
    self_reports: reportsRes.data || [],
    team_members: usersRes.data || [],
    available_weeks: ((weeksRes.data || []) as Array<{ week_of: string }>).map(r => r.week_of),
  });
}
