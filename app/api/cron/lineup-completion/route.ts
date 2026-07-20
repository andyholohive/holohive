import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { LineupManagerService } from '@/lib/lineupManagerService';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/lineup-completion
 *
 * HHP Lineup Manager Spec § 4.1 — Completed status auto-transition.
 * Daily job that flips Confirmed lineups → Completed once their
 * week has ended (week_of + 6 days < today, UTC).
 *
 * [2026-07-13] End-of-week close-out (per Andy): as each lineup ages
 * out, any slot still 'pending' flips to 'missed' (the service does
 * this) and the bot posts ONE line to the ops terminal:
 *   «Venice» Wk 9 closed. 5/6 posted, missed: 임팔
 * Destination mirrors the confirm post: the global internal chat
 * (app_settings.lineup_confirmed_chat_id + _thread_id), falling back
 * to the campaign's own tg_ops_group_id when the global is unset.
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

    // ── Close-out posts to the ops terminal ────────────────────────
    // Same destination resolution as the confirm post: global internal
    // chat first, per-campaign tg_ops_group_id as fallback.
    let closeOutsSent = 0;
    if (result.closeOuts.length > 0) {
      const [globalChatSetting, globalThreadSetting] = await Promise.all([
        (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_id').maybeSingle(),
        (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_thread_id').maybeSingle(),
      ]);
      const globalChatId = (globalChatSetting.data as any)?.value as string | undefined;
      const globalThreadRaw = (globalThreadSetting.data as any)?.value as string | undefined;

      for (const co of result.closeOuts) {
        if (co.isTest) continue; // Test campaigns never post [2026-07-21].
        const targetChatId = globalChatId || co.opsChatId;
        if (!targetChatId) continue; // No destination — skip silently.
        const targetThreadId = globalChatId && globalThreadRaw ? parseInt(globalThreadRaw, 10) : undefined;

        const missedFragment = co.missedNames.length > 0
          ? `, missed: ${escapeHtml(co.missedNames.join(', '))}`
          : '';
        const line = `<b>${escapeHtml(co.campaignName)}</b> Wk ${co.weekNumber} closed. ${co.posted}/${co.total} posted${missedFragment}`;
        try {
          const sent = await TelegramService.sendToChat(targetChatId, line, 'HTML', targetThreadId);
          if (sent) closeOutsSent++;
        } catch (err) {
          console.warn('[cron/lineup-completion] close-out post failed:', err);
        }
      }
    }

    // agent_runs log for cron-health-check coverage.
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'LINEUP_COMPLETION',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `Marked ${result.updated} lineup(s) as Completed; ${closeOutsSent} close-out post(s) sent.`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({
      ok: true,
      lineupsMarkedCompleted: result.updated,
      lineupIds: result.ids,
      closeOutsSent,
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
