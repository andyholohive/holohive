import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generatePriorityDashboard } from '@/lib/dashboardAnalyzer';

export const dynamic = 'force-dynamic';
// Same upper bound as the manual refresh endpoint — analyzer call
// dominates duration, and chat-heavy weeks can run 30-60s.
export const maxDuration = 120;

/**
 * GET /api/cron/dashboard-refresh
 *
 * Monday 09:00 KST cron (00:00 UTC, vercel.json). Calls the same
 * analyzer the manual refresh endpoint uses, then writes the result
 * with generation_method='cron'. UPSERT keyed on week_of so re-runs
 * within the same week are safe.
 *
 * Auth: CRON_SECRET bearer header (Vercel cron sends this).
 *
 * Failures: a thrown analyzer error is logged and returned as a 500
 * so Vercel records the failure. The previous week's snapshot remains
 * the latest in the DB.
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
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const weekOf = mondayOfWeek(new Date());

  let result;
  try {
    result = await generatePriorityDashboard(supabase, weekOf);
  } catch (err: any) {
    console.error('[cron/dashboard-refresh] analyzer failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Dashboard analyzer failed', week_of: weekOf },
      { status: 500 },
    );
  }

  const { data, error } = await (supabase as any)
    .from('dashboard_snapshots')
    .upsert(
      {
        week_of: weekOf,
        generated_at: new Date().toISOString(),
        generation_method: 'cron',
        payload: result.payload,
        source_summary: result.source_summary,
        cost_usd: result.cost_usd,
      },
      { onConflict: 'week_of' },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ snapshot: data, week_of: weekOf });
}
