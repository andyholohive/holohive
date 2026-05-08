import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboard/check-in
 * GET  /api/dashboard/check-in?week_of=YYYY-MM-DD
 *
 * Per-user weekly self-report for the Priority Dashboard. The /dashboard/
 * check-in page wraps this. Sunday-evening cron DMs each team member with
 * a link to the form; they fill it out and POST here.
 *
 * Auth: must be a logged-in user. Each user can only write their own
 * row (week_of + user_id is the unique key — re-submits update).
 *
 * GET response: the user's existing check-in for the requested week
 * (or null), so the form can pre-fill on revisit.
 *
 * POST body:
 *   {
 *     week_of:        'YYYY-MM-DD',  // Monday of the week
 *     primary_focus:  string[],       // top 3 things they spent time on
 *     blockers?:      string,
 *     next_week?:     string,
 *     notes?:         string,
 *   }
 */

// Helper to get the Monday-of-this-week as YYYY-MM-DD (UTC).
function mondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Days back to Monday: if Sunday, go back 6 days; otherwise day-1.
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function getUserSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() { /* read-only in this context */ },
        remove() { /* read-only in this context */ },
      },
    }
  );
}

export async function GET(request: Request) {
  const supabase = await getUserSupabase();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekOf = searchParams.get('week_of') || mondayOfWeek(new Date());

  // Use service-role for the read so RLS doesn't block (the user_id
  // check is enforced by the WHERE clause below).
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await (service as any)
    .from('dashboard_self_reports')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ week_of: weekOf, report: data });
}

export async function POST(request: Request) {
  const supabase = await getUserSupabase();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // week_of is YYYY-MM-DD and MUST be a Monday — enforced server-side
  // so a bug in the client doesn't fragment the dataset across mid-week dates.
  const weekOf = typeof body.week_of === 'string' ? body.week_of : mondayOfWeek(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) {
    return NextResponse.json({ error: 'week_of must be YYYY-MM-DD' }, { status: 400 });
  }
  const weekDate = new Date(weekOf + 'T00:00:00Z');
  if (weekDate.getUTCDay() !== 1) {
    return NextResponse.json({ error: 'week_of must be a Monday' }, { status: 400 });
  }

  // primary_focus: array of up to 5 short strings (the form caps at 3
  // but allow 5 for resilience).
  const primaryFocus = Array.isArray(body.primary_focus)
    ? body.primary_focus
        .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
        .map((s: string) => s.trim().slice(0, 200))
        .slice(0, 5)
    : [];

  const blockers = typeof body.blockers === 'string' ? body.blockers.trim().slice(0, 1000) : null;
  const nextWeek = typeof body.next_week === 'string' ? body.next_week.trim().slice(0, 1000) : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : null;

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // UPSERT keyed on (user_id, week_of) — re-submits update the row.
  const { data, error } = await (service as any)
    .from('dashboard_self_reports')
    .upsert(
      {
        user_id: user.id,
        week_of: weekOf,
        responded_at: new Date().toISOString(),
        primary_focus: primaryFocus.length > 0 ? primaryFocus : null,
        blockers,
        next_week: nextWeek,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,week_of' },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ report: data });
}
