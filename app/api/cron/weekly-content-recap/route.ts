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
 *   • routing — each campaign's recap goes to that client's chat by
 *     default (telegram_chats.client_id, set in /crm/telegram). The
 *     /admin/telegram-comm selector (weekly_recap_chat_id) is a global
 *     OVERRIDE: when set, every recap goes there instead.
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

    // Routing (per Andy 2026-07-13): default is each campaign's CLIENT
    // chat — the chat linked to that client in /crm/telegram
    // (telegram_chats.client_id). The /admin/telegram-comm selector is a
    // global OVERRIDE: when set, every recap goes there instead (handy
    // for a consolidated feed or a test chat).
    const [overrideChatSetting, overrideThreadSetting] = await Promise.all([
      (supabase as any).from('app_settings').select('value').eq('key', 'weekly_recap_chat_id').maybeSingle(),
      (supabase as any).from('app_settings').select('value').eq('key', 'weekly_recap_chat_thread_id').maybeSingle(),
    ]);
    const overrideChatId = ((overrideChatSetting.data as any)?.value as string | undefined) || undefined;
    const overrideThreadRaw = (overrideThreadSetting.data as any)?.value as string | undefined;
    const overrideThreadId = overrideChatId && overrideThreadRaw ? parseInt(overrideThreadRaw, 10) : undefined;

    // Campaigns with a confirmed/completed lineup for the ended week.
    const { data: lineups } = await (supabase as any)
      .from('campaign_lineups')
      .select('campaign_id, campaign:campaigns(id, name, status, archived_at, client_id, client:clients(is_active))')
      .eq('week_of', prevMonday)
      .in('status', ['confirmed', 'completed']);

    // De-dup campaigns + filter to active/non-archived.
    const seen = new Set<string>();
    const campaigns: Array<{ id: string; name: string; clientId: string | null }> = [];
    for (const l of ((lineups as any[]) ?? [])) {
      const c = l.campaign;
      if (!c || seen.has(c.id)) continue;
      if (c.status !== 'Active' || c.archived_at) continue;
      if (c.client?.is_active === false) continue;
      seen.add(c.id);
      campaigns.push({ id: c.id, name: c.name, clientId: c.client_id ?? null });
    }

    if (campaigns.length === 0) {
      await logRun('completed', `No active campaigns with a lineup for week ${prevMonday}.`);
      return NextResponse.json({ ok: true, weekOf: prevMonday, posted: 0 });
    }

    // Resolve each client's chat once (skipped when an override is set).
    // Pick the client-facing GC: not hidden, external before internal,
    // most recently active.
    const clientChatByClient = new Map<string, string>();
    if (!overrideChatId) {
      const clientIds = [...new Set(campaigns.map(c => c.clientId).filter(Boolean))] as string[];
      if (clientIds.length > 0) {
        const { data: chats } = await (supabase as any)
          .from('telegram_chats')
          .select('chat_id, client_id, is_internal, is_hidden, last_message_at')
          .in('client_id', clientIds)
          .or('is_hidden.is.null,is_hidden.eq.false');
        for (const clientId of clientIds) {
          const cands = ((chats as any[]) ?? []).filter(x => x.client_id === clientId && x.chat_id);
          cands.sort((a, b) => {
            const ai = a.is_internal ? 1 : 0, bi = b.is_internal ? 1 : 0;
            if (ai !== bi) return ai - bi; // external (client-facing) first
            const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
            const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
            return bt - at; // most recently active first
          });
          if (cands[0]) clientChatByClient.set(clientId, cands[0].chat_id);
        }
      }
    }

    const headerTemplate = await getTemplate(supabase, 'tmpl_weekly_content_recap_header');
    const svc = new LineupManagerService(supabase as any);

    let posted = 0;
    let noContent = 0;
    let noChat = 0;
    for (const c of campaigns) {
      const message = await svc.formatWeeklyContentRecap(c.id, c.name, prevMonday, headerTemplate);
      if (!message) { noContent++; continue; } // no content = no post
      const destChat = overrideChatId || (c.clientId ? clientChatByClient.get(c.clientId) : undefined);
      if (!destChat) { noChat++; continue; } // client has no linked chat + no override
      const destThread = overrideChatId ? overrideThreadId : undefined;
      const sent = await TelegramService.sendToChat(destChat, message, 'HTML', destThread);
      if (sent) posted++;
    }

    const routing = overrideChatId ? 'override' : 'per-client';
    await logRun('completed', `Week ${prevMonday} (${routing}): ${posted} posted, ${noContent} no-content, ${noChat} no-chat.`);
    return NextResponse.json({ ok: true, weekOf: prevMonday, routing, posted, noContent, noChat, candidates: campaigns.length });
  } catch (err: any) {
    console.error('[cron/weekly-content-recap] error:', err);
    await logRun('failed', err?.message ?? 'unknown');
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
