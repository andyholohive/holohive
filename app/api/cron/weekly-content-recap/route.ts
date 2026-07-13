import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { LineupManagerService } from '@/lib/lineupManagerService';
import { getTemplate } from '@/lib/messageTemplates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/weekly-content-recap
 *
 * Weekly Content Recap (per Andy 2026-07-13). Every Monday 12:00 UTC,
 * for each campaign whose just-ended week had a confirmed/completed
 * lineup, post a recap to the configured chat:
 *
 *   «Venice» Korea Weekly Content Recap
 *
 *   Angle 1: How High-Signal Builders Use Venice (3 KOLs)
 *     • 라오니   ← linked to their posted content
 *     • Degen Guy
 *     • Manbull
 *   …
 *
 * Rules (Andy):
 *   • remove unposted KOLs — only KOLs with a posted `contents` row in
 *     the week appear; empty angles are dropped.
 *   • no content = no post — a campaign with zero posted content is
 *     skipped; if none posted anywhere, nothing is sent.
 *   • preview image left in — sender doesn't disable web preview, so the
 *     first content link renders its image.
 *   • destination configured in /admin/telegram-comm → Weekly Content
 *     Recap (app_settings.weekly_recap_chat_id + _thread_id).
 *
 * Auth: Bearer ${CRON_SECRET}. Logs to agent_runs as
 * WEEKLY_CONTENT_RECAP for the cron-health-check sweep.
 */

/** Monday (YYYY-MM-DD, UTC) of the week containing `d`. */
function mondayOf(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return m.toISOString().slice(0, 10);
}

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

  const logRun = async (status: 'completed' | 'failed', summary: string) => {
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'WEEKLY_CONTENT_RECAP',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status,
        output_summary: summary,
      });
    } catch { /* swallow */ }
  };

  try {
    // Recap the week that just ended: its Monday is 7 days before this
    // Monday. (Cron fires Monday 12:00 UTC.)
    const now = new Date();
    const prevMonday = new Date(new Date(mondayOf(now) + 'T00:00:00Z').getTime() - 7 * 86_400_000)
      .toISOString().slice(0, 10);

    // Destination — configured in /admin/telegram-comm.
    const [chatSetting, threadSetting] = await Promise.all([
      (supabase as any).from('app_settings').select('value').eq('key', 'weekly_recap_chat_id').maybeSingle(),
      (supabase as any).from('app_settings').select('value').eq('key', 'weekly_recap_chat_thread_id').maybeSingle(),
    ]);
    const chatId = (chatSetting.data as any)?.value as string | undefined;
    const threadIdRaw = (threadSetting.data as any)?.value as string | undefined;
    if (!chatId) {
      await logRun('completed', 'weekly_recap_chat_id not configured; skipped.');
      return NextResponse.json({
        ok: true, skipped: true,
        reason: 'No recap chat configured. Set it in /admin/telegram-comm → Weekly Content Recap.',
      });
    }
    const threadId = threadIdRaw ? parseInt(threadIdRaw, 10) : undefined;

    // Campaigns with a confirmed/completed lineup for the ended week.
    const { data: lineups } = await (supabase as any)
      .from('campaign_lineups')
      .select('campaign_id, campaign:campaigns(id, name, status, archived_at, client:clients(is_active))')
      .eq('week_of', prevMonday)
      .in('status', ['confirmed', 'completed']);

    // De-dup campaigns + filter to active/non-archived.
    const seen = new Set<string>();
    const campaigns: Array<{ id: string; name: string }> = [];
    for (const l of ((lineups as any[]) ?? [])) {
      const c = l.campaign;
      if (!c || seen.has(c.id)) continue;
      if (c.status !== 'Active' || c.archived_at) continue;
      if (c.client?.is_active === false) continue;
      seen.add(c.id);
      campaigns.push({ id: c.id, name: c.name });
    }

    if (campaigns.length === 0) {
      await logRun('completed', `No active campaigns with a lineup for week ${prevMonday}.`);
      return NextResponse.json({ ok: true, weekOf: prevMonday, posted: 0 });
    }

    const headerTemplate = await getTemplate(supabase, 'tmpl_weekly_content_recap_header');
    const svc = new LineupManagerService(supabase as any);

    let posted = 0;
    let skipped = 0;
    for (const c of campaigns) {
      const message = await svc.formatWeeklyContentRecap(c.id, c.name, prevMonday, headerTemplate);
      if (!message) { skipped++; continue; } // no content = no post
      const sent = await TelegramService.sendToChat(chatId, message, 'HTML', threadId);
      if (sent) posted++;
    }

    await logRun('completed', `Week ${prevMonday}: ${posted} recap(s) posted, ${skipped} skipped (no content).`);
    return NextResponse.json({ ok: true, weekOf: prevMonday, posted, skipped, candidates: campaigns.length });
  } catch (err: any) {
    console.error('[cron/weekly-content-recap] error:', err);
    await logRun('failed', err?.message ?? 'unknown');
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
