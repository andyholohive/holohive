import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadActiveClients } from '@/lib/krSignal/config';
import { assembleWeekly } from '@/lib/krSignal/assembleWeekly';
import { saveGlobalWeekly, saveClientWeekly } from '@/lib/krSignal/store';
import { sendMessage } from '@/lib/krSignal/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/kr-signal-weekly
 *
 * Sunday 21:00 KST (12:00 UTC). Posts the Weekly KR Market Report (spec §7.A)
 * to each active client GC with weekly_market_report enabled + a telegram_chat_id,
 * via the SEPARATE KR Signal bot token. Persists this week's snapshot afterward
 * so next week's trend arrows + the §5 baseline job have history.
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
  if (!process.env.KR_SIGNAL_BOT_TOKEN) {
    return NextResponse.json({ error: 'KR_SIGNAL_BOT_TOKEN not set' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({ agent_name: 'KR_SIGNAL_WEEKLY', run_type: 'scheduled', status: 'running', started_at: startedAt.toISOString(), input_params: {} })
    .select('id')
    .single();
  const runId = runRow?.id;
  const finishRun = async (status: 'completed' | 'failed', output: any, error?: string) => {
    if (!runId) return;
    const endedAt = new Date();
    await (supabase as any).from('agent_runs').update({
      status, completed_at: endedAt.toISOString(), duration_ms: endedAt.getTime() - startedAt.getTime(),
      output_summary: output, error_message: error ?? null,
    }).eq('id', runId);
  };

  const sent: any[] = [];
  try {
    const clients = await loadActiveClients(supabase);
    const targets = clients.filter((c) => c.features?.weekly_market_report && c.telegram_chat_id);

    for (const c of targets) {
      try {
        const res = await assembleWeekly(supabase, c);
        const m = await sendMessage(c.telegram_chat_id!, res.html, c.telegram_thread_id);
        // Persist AFTER a successful send so history reflects delivered reports.
        await saveGlobalWeekly(supabase, res.weekEnding, res.global);
        await saveClientWeekly(supabase, c.id, res.weekEnding, res.client);
        sent.push({ client: c.name, message_id: m.message_id, pending: res.pending.length });
      } catch (e: any) {
        sent.push({ client: c.name, error: String(e?.message || e) });
      }
    }

    const okCount = sent.filter((s) => s.message_id).length;
    await finishRun('completed', { targets: targets.length, posted: okCount, sent });
    return NextResponse.json({ ran: true, posted: okCount, sent });
  } catch (e: any) {
    await finishRun('failed', { sent }, String(e?.message || e));
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
