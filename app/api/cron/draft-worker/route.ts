import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runDraftWorker } from '@/lib/draftBot/worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/draft-worker — every minute.
 *
 * Sends /draft decisions to the KOL group once their cancel window has
 * passed, and posts the turnaround nudges (pending past the configured hours,
 * lineup deadline within 24h). See lib/draftBot/worker.ts for why this is a
 * cron and not a timer.
 *
 * Logs to agent_runs only when it did something or failed: 1,440 empty rows
 * a day would bury every other cron in the run history.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if ((request.headers.get('authorization') || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any;
  const runStart = Date.now();
  const log = async (status: 'success' | 'failed', summary: string) => {
    try {
      await sb.from('agent_runs').insert({
        agent_name: 'DRAFT_WORKER', run_type: 'cron',
        started_at: new Date(runStart).toISOString(), completed_at: new Date().toISOString(),
        status, output_summary: summary, error_message: status === 'failed' ? summary : null,
      });
    } catch { /* never fail the cron on its own log */ }
  };

  try {
    const r = await runDraftWorker(sb);
    if (r.sent || r.failed || r.nudged || r.deadlineNudged) {
      await log(r.failed ? 'failed' : 'success', `${r.sent} sent, ${r.failed} failed, ${r.nudged} nudged, ${r.deadlineNudged} deadline nudges.`);
    }
    return NextResponse.json(r);
  } catch (err: any) {
    const msg = err?.message || String(err);
    await log('failed', msg.slice(0, 500));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
