import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/kol-brief-nudge — KOL Brief Delivery Friday nudge (spec §5/§7).
 *
 * Posts the still-un-opened (but already-sent) KOL briefs for live weeks to the
 * team terminal so the team can chase them. Team-facing only — the bot never
 * messages KOLs. Fires Friday ~09:00 KST (register in vercel.json).
 *
 * Destination: app_settings.kol_brief_nudge_chat_id, falling back to
 * lineup_confirmed_chat_id, then env TELEGRAM_TERMINAL_CHAT_ID. Suppresses +
 * logs a warning if none set (Submission-Progress pattern).
 *
 * Auth: Bearer ${CRON_SECRET} (fail-closed). Logged to agent_runs as
 * agent_name = KOL_BRIEF_NUDGE for the cron-health-check sweep.
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
  const nowIso = new Date().toISOString();

  try {
    // Sent, not opened, still live (not past expiry).
    const { data: rows, error } = await (supabase as any)
      .from('kol_brief_tokens')
      .select('campaign_id, week_number, kol_id, master_kols:master_kols(name), campaigns:campaigns(name)')
      .not('sent_at', 'is', null)
      .is('opened_at', null)
      .gt('expires_at', nowIso);
    if (error) throw error;

    // Group by campaign + week.
    const groups = new Map<string, { campaign: string; week: number | null; names: string[] }>();
    for (const r of (rows ?? []) as any[]) {
      const key = `${r.campaign_id}:${r.week_number}`;
      if (!groups.has(key)) {
        groups.set(key, { campaign: r.campaigns?.name ?? 'Campaign', week: r.week_number, names: [] });
      }
      groups.get(key)!.names.push(r.master_kols?.name ?? 'KOL');
    }

    let posted = 0;
    if (groups.size > 0) {
      const [chatSetting, threadSetting, fbChatSetting] = await Promise.all([
        (supabase as any).from('app_settings').select('value').eq('key', 'kol_brief_nudge_chat_id').maybeSingle(),
        (supabase as any).from('app_settings').select('value').eq('key', 'kol_brief_nudge_chat_thread_id').maybeSingle(),
        (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_id').maybeSingle(),
      ]);
      const chatId = (chatSetting.data as any)?.value
        || (fbChatSetting.data as any)?.value
        || process.env.TELEGRAM_TERMINAL_CHAT_ID;
      const threadRaw = (threadSetting.data as any)?.value as string | undefined;
      const threadId = (chatSetting.data as any)?.value && threadRaw ? parseInt(threadRaw, 10) : undefined;

      if (!chatId) {
        console.warn('[cron/kol-brief-nudge] no destination configured — suppressed');
      } else {
        for (const g of groups.values()) {
          const line =
            `📩 <b>${escapeHtml(g.campaign)}</b>${g.week ? ` · Wk ${g.week}` : ''} — ` +
            `${g.names.length} brief${g.names.length === 1 ? '' : 's'} not yet opened:\n` +
            `${escapeHtml(g.names.join(', '))}\n<i>Please chase in the KOL chats.</i>`;
          try {
            const sent = await TelegramService.sendToChat(chatId, line, 'HTML', threadId);
            if (sent) posted++;
          } catch (err) {
            console.warn('[cron/kol-brief-nudge] post failed:', err);
          }
        }
      }
    }

    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'KOL_BRIEF_NUDGE',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `${groups.size} campaign-week group(s) with un-opened briefs; ${posted} nudge(s) posted.`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({
      ok: true,
      groups: groups.size,
      posted,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[cron/kol-brief-nudge] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Nudge sweep failed.' }, { status: 500 });
  }
}
