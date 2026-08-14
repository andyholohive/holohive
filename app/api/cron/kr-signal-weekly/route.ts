import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadClientById } from '@/lib/krSignal/config';
import { sendMessageWithButtons } from '@/lib/krSignal/telegram';
import { listWeekliesAwaitingReview, attachReviewCard } from '@/lib/krSignal/store';
import { approveAndSend } from '@/lib/krSignal/reviewActions';
import { buildReviewCard, reviewButtons } from '@/lib/krSignal/reviewCard';
import { getAppSetting } from '@/lib/appSettings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/kr-signal-weekly — Sunday 12:00 UTC. The send window.
 *
 * [2026-08-14] This used to assemble AND send in one pass, which meant a
 * report reached the client the instant it was built and there was no moment
 * a human could inspect it. Assembly moved to kr-signal-weekly-generate on
 * Saturday; this route now only delivers what a human already approved.
 *
 * Two outcomes per queued report:
 *   • status 'approved'       → send to the client, mark sent.
 *   • status 'pending_review' → send NOTHING to the client. Post a "this did
 *     not go out" card to the ops chat with the same Approve / Edit / Skip
 *     buttons, so the miss is visible at exactly the moment the client would
 *     have expected the report, and can still be sent late in one tap.
 *
 * Fail-closed is the deliberate choice (per Andy): silence to the client beats
 * an unreviewed report reaching them. The nudge is what stops fail-closed from
 * turning into a cadence that quietly dies.
 */
export async function GET(request: Request) {
  const startedAt = new Date();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
    .insert({
      agent_name: 'KR_SIGNAL_WEEKLY', run_type: 'scheduled', status: 'running',
      started_at: startedAt.toISOString(), input_params: {},
    })
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
  const nudged: any[] = [];
  try {
    const reviewChatId = await getAppSetting(supabase, 'kr_signal_review_chat_id');
    const reviewThreadId = await getAppSetting(supabase, 'kr_signal_review_thread_id');
    const queue = await listWeekliesAwaitingReview(supabase);

    for (const row of queue) {
      const cfg = await loadClientById(supabase, row.client_id);
      const clientName = cfg?.name ?? row.client_id;

      if (row.status === 'approved') {
        const res = await approveAndSend(supabase, row.id, { name: 'Scheduled send' });
        sent.push(res.ok
          ? { client: clientName, message_id: res.messageId }
          : { client: clientName, error: res.error ?? res.alreadyDecided });
        continue;
      }

      // Still pending at the send window — tell the humans, not the client.
      if (!reviewChatId) {
        nudged.push({ client: clientName, error: 'no review chat configured' });
        continue;
      }
      try {
        const card = buildReviewCard({
          clientName,
          weekEnding: row.week_ending,
          row,
          variant: 'missed',
          edited: !!row.edited_html,
        });
        const msg = await sendMessageWithButtons(
          reviewChatId, card, reviewButtons(row.id), reviewThreadId,
        );
        // Re-point the row at the newer card so a later Approve edits the
        // message the reviewer is actually looking at.
        await attachReviewCard(supabase, row.id, String(reviewChatId), msg.message_id);
        nudged.push({ client: clientName, week_ending: row.week_ending });
      } catch (e: any) {
        nudged.push({ client: clientName, error: String(e?.message || e) });
      }
    }

    const posted = sent.filter((s) => s.message_id).length;
    await finishRun('completed', { queued: queue.length, posted, sent, nudged });
    return NextResponse.json({ ran: true, posted, sent, nudged });
  } catch (e: any) {
    await finishRun('failed', { sent, nudged }, String(e?.message || e));
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
