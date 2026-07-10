import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshBaselines } from '@/lib/krSignal/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/kr-signal-baselines
 *
 * Weekly (Monday). Recomputes the §5 full-cycle p33/p66 regime baselines from
 * the accumulated global weekly snapshots. With < 8 weeks of history it writes
 * provisional ±15% bands (seed mode) so regime labels render before a real
 * historical backfill lands (§10 open item).
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 */
export async function GET(request: Request) {
  const startedAt = new Date();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({ agent_name: 'KR_SIGNAL_BASELINES', run_type: 'scheduled', status: 'running', started_at: startedAt.toISOString(), input_params: {} })
    .select('id')
    .single();
  const runId = runRow?.id;

  try {
    const results = await refreshBaselines(supabase, { seed: true });
    const endedAt = new Date();
    if (runId) {
      await (supabase as any).from('agent_runs').update({
        status: 'completed', completed_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(), output_summary: { results },
      }).eq('id', runId);
    }
    return NextResponse.json({ ran: true, results });
  } catch (e: any) {
    if (runId) {
      await (supabase as any).from('agent_runs').update({
        status: 'failed', completed_at: new Date().toISOString(), error_message: String(e?.message || e),
      }).eq('id', runId);
    }
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
