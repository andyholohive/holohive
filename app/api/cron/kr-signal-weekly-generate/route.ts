import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadActiveClients } from '@/lib/krSignal/config';
import { assembleWeekly } from '@/lib/krSignal/assembleWeekly';
import { sendMessageWithButtons, probeChat } from '@/lib/krSignal/telegram';
import { saveWeeklyForReview, saveGlobalWeekly, attachReviewCard } from '@/lib/krSignal/store';
import { buildReviewCard, reviewButtons } from '@/lib/krSignal/reviewCard';
import { getAppSetting } from '@/lib/appSettings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/kr-signal-weekly-generate — Saturday 12:00 UTC.
 *
 * Builds each active client's Weekly KR Market Report and parks it in
 * `pending_review`. Sends NOTHING to clients. A review card goes to the ops
 * chat with Approve / Edit / Skip; the Sunday cron delivers whatever was
 * approved.
 *
 * Why a day early: the gate is only useful if there's a window to act in.
 * Generating and asking for approval in the same minute the report is due
 * would make every week a scramble, and the fail-closed rule (nothing sends
 * without a human) would then routinely mean nothing sends.
 *
 * The destination is probed here via getChat and the result stored on the row.
 * That is the check that was missing: Venice's weekly failed with "chat not
 * found" five weeks running and the only trace was a cron log nobody read.
 * Now an unreachable destination is stated on the card, before approval.
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
      agent_name: 'KR_SIGNAL_WEEKLY_GENERATE', run_type: 'scheduled', status: 'running',
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

  const results: any[] = [];
  try {
    const reviewChatId = await getAppSetting(supabase, 'kr_signal_review_chat_id');
    const reviewThreadId = await getAppSetting(supabase, 'kr_signal_review_thread_id');

    const clients = await loadActiveClients(supabase);
    const targets = clients.filter((c) => c.features?.weekly_market_report);

    for (const c of targets) {
      try {
        const res = await assembleWeekly(supabase, c);

        // Probe the real destination the Sunday send would use.
        const preflight = c.resolved_chat_id
          ? { ...(await probeChat(c.resolved_chat_id)), chat_id: String(c.resolved_chat_id) }
          : { ok: false, error: 'No destination chat resolved', chat_id: null };

        const row = await saveWeeklyForReview(supabase, c.id, res.weekEnding, {
          ...res.client,
          report_html: res.html,
          preflight,
        });

        if (!row) {
          // Already decided this week — leave it alone.
          results.push({ client: c.name, skipped: 'already decided this week' });
          continue;
        }

        // The global market snapshot is client-independent and is not part of
        // what's being reviewed, so it persists regardless of the decision.
        await saveGlobalWeekly(supabase, res.weekEnding, res.global);

        if (reviewChatId) {
          const card = buildReviewCard({
            clientName: c.name,
            weekEnding: res.weekEnding,
            row,
            variant: 'generated',
          });
          const msg = await sendMessageWithButtons(
            reviewChatId, card, reviewButtons(row.id), reviewThreadId,
          );
          await attachReviewCard(supabase, row.id, String(reviewChatId), msg.message_id);
        }

        results.push({
          client: c.name,
          queued: true,
          preflight_ok: preflight.ok,
          pending: res.pending.length,
        });
      } catch (e: any) {
        results.push({ client: c.name, error: String(e?.message || e) });
      }
    }

    // No review chat means no one can approve, and fail-closed would silently
    // stop the weekly cadence. Say so loudly in the run record.
    const warning = reviewChatId
      ? undefined
      : 'kr_signal_review_chat_id is not set — reports are queued but nobody will be asked to approve them.';

    const queued = results.filter((r) => r.queued).length;
    await finishRun('completed', { targets: targets.length, queued, warning, results });
    return NextResponse.json({ ran: true, queued, warning, results });
  } catch (e: any) {
    await finishRun('failed', { results }, String(e?.message || e));
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
