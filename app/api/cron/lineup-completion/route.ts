import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { LineupManagerService } from '@/lib/lineupManagerService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/lineup-completion
 *
 * HHP Lineup Manager Spec § 4.1 — Completed status auto-transition.
 * Daily job that flips Confirmed lineups → Completed once their
 * week has ended (week_of + 6 days < today, UTC).
 *
 * Schedule: 06:00 UTC daily. Cheap; usually 0 updates on most days
 * with maybe 1-2 on Mondays as previous-week lineups age out.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Logged to agent_runs with agent_name = LINEUP_COMPLETION for
 * the cron-health-check sweep.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const start = Date.now();

  try {
    const svc = new LineupManagerService(supabase as any);
    const result = await svc.markCompletedIfWeekEnded();

    // agent_runs log for cron-health-check coverage.
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'LINEUP_COMPLETION',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `Marked ${result.updated} lineup(s) as Completed.`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({
      ok: true,
      lineupsMarkedCompleted: result.updated,
      lineupIds: result.ids,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[cron/lineup-completion] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Completion sweep failed.' },
      { status: 500 },
    );
  }
}
