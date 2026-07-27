import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/stint-lapse-sweep
 *
 * [2026-06-12] Daily at 01:00 UTC. Implements F1 Appendix Required:
 *   "When today passes covered-through plus the grace window (config,
 *    default 7 days), the stint end_date auto-stamps to covered-through
 *    and status becomes ended. Replaces the manual 'Churned' flip."
 *
 * For each active stint where covered_through + grace_days < today:
 *   - Stamp end_date = covered_through
 *   - Flip status = 'ended'
 *   - Set ended_reason = 'coverage_lapse'
 *
 * Mirror of /api/cron/spawn-recurring-deliverables shape: Bearer
 * CRON_SECRET auth, agent_runs logging, idempotent (re-runs hit no
 * already-ended stints).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const runStart = new Date();
  let agentRunId: string | null = null;

  try {
    // Log run start
    const { data: runRow } = await (supabase as any)
      .from('agent_runs')
      .insert({
        agent_name: 'STINT_LAPSE_SWEEP',
        started_at: runStart.toISOString(),
        status: 'running',
      })
      .select('id')
      .single();
    agentRunId = runRow?.id || null;

    // Look up grace window (default 7)
    const { data: graceRow } = await (supabase as any)
      .from('app_settings')
      .select('value')
      .eq('key', 'stint_lapse_grace_days')
      .maybeSingle();
    const graceDays = parseInt(graceRow?.value ?? '7', 10);

    // Find active stints whose coverage has lapsed beyond grace
    const { data: lapsedStints, error: fetchErr } = await (supabase as any)
      .from('client_coverage')
      .select('stint_id, client_id, covered_through, should_auto_end, stint_status')
      .eq('should_auto_end', true)
      .eq('stint_status', 'active');

    if (fetchErr) throw fetchErr;

    const candidates = (lapsedStints ?? []) as Array<{
      stint_id: string;
      client_id: string;
      covered_through: string;
      should_auto_end: boolean;
    }>;

    let endedCount = 0;
    for (const stint of candidates) {
      const { error: updErr } = await (supabase as any)
        .from('client_stints')
        .update({
          end_date: stint.covered_through,
          status: 'ended',
          ended_reason: 'coverage_lapse',
          updated_at: new Date().toISOString(),
        })
        .eq('id', stint.stint_id)
        .eq('status', 'active'); // double-check we're not racing
      if (!updErr) endedCount++;
    }

    // [2026-06-30] Belt-and-suspenders for the auto-derive trigger:
    // a stint whose end_date silently passes (no row write) won't
    // re-fire the BEFORE UPDATE trigger, so we also sweep here.
    // Touch each row's updated_at so the trigger recomputes status.
    const { data: silentlyLapsed } = await (supabase as any)
      .from('client_stints')
      .select('id')
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .lt('end_date', new Date().toISOString().slice(0, 10));
    let silentEndedCount = 0;
    for (const row of ((silentlyLapsed ?? []) as Array<{ id: string }>)) {
      const { error } = await (supabase as any)
        .from('client_stints')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (!error) silentEndedCount++;
    }

    // Log run complete.
    //
    // [2026-07-27] These three columns were previously written as
    // `finished_at` / `output` / `error` — none of which exist on agent_runs
    // (it has completed_at / output_summary / error_message). PostgREST
    // rejected every update, the error was never destructured, and so all 45
    // runs to date sat at status='running' forever. cron-health-check only
    // looks for status='failed', so a genuinely broken sweep would have been
    // invisible indefinitely. Destructure the error here so the same class of
    // mismatch fails loudly next time instead of silently.
    if (agentRunId) {
      const { error: logErr } = await (supabase as any)
        .from('agent_runs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'success',
          output_summary: { lapsed_stints_ended: endedCount, grace_days: graceDays },
        })
        .eq('id', agentRunId);
      if (logErr) console.error('[stint-lapse-sweep] agent_runs completion write failed:', logErr);
    }

    return NextResponse.json({
      success: true,
      lapsed_stints_ended: endedCount,
      grace_days: graceDays,
    });
  } catch (err: any) {
    console.error('[stint-lapse-sweep] failed:', err);
    if (agentRunId) {
      const { error: logErr } = await (supabase as any)
        .from('agent_runs')
        .update({
          completed_at: new Date().toISOString(),
          // 'failed' is the value cron-health-check actually queries for.
          // 'error' would have been ignored by the sweep even once the column
          // names were right.
          status: 'failed',
          error_message: err?.message ?? String(err),
        })
        .eq('id', agentRunId);
      if (logErr) console.error('[stint-lapse-sweep] agent_runs failure write failed:', logErr);
    }
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}
