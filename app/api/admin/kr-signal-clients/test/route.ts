import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { sendMessage } from '@/lib/krSignal/telegram';
import { assembleWeekly } from '@/lib/krSignal/assembleWeekly';
import type { KrSignalClient } from '@/lib/krSignal/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/kr-signal-clients/test  — body: { id, dryRun? }
 *
 * Sends the ACTUAL Weekly KR Market Report (the same builder the Sunday cron
 * uses) to a KR Signal client's resolved digest chat, via the KR Signal bot's
 * OWN token (KR_SIGNAL_BOT_TOKEN) — so the operator previews the real output
 * AND confirms the bot can post to that chat.
 *
 * `dryRun: true` builds the report and resolves the destination but sends
 * NOTHING, returning the assembled text plus `pending`. That's the safe first
 * click: the destination here is a live CLIENT group chat, so config mistakes
 * shouldn't cost the client a stray message. A real send stays one click away
 * for when the operator actually wants to prove the bot can post.
 *
 * The destination is resolved the same way the crons resolve it:
 *   override (kr_signal_clients.telegram_chat_id) ?? the client's /crm/telegram GC.
 * A one-line "test send" marker is prepended so recipients don't mistake it for
 * the scheduled Sunday post. This does NOT persist weekly snapshots, so it
 * can't corrupt the week-over-week history.
 *
 * Auth: super_admin. Returns { ok, sent, chat_id, source, error? } — Telegram's
 * own error description is forwarded so the operator can act (chat-not-found →
 * wrong id; bot-was-kicked → add the KR Signal bot to the chat first).
 */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  if (!process.env.KR_SIGNAL_BOT_TOKEN) {
    return NextResponse.json({ ok: false, error: 'KR_SIGNAL_BOT_TOKEN not configured on the server' }, { status: 200 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const dryRun = body?.dryRun === true;
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ ok: false, error: 'Missing Supabase config' }, { status: 500 });

  // Full config — assembleWeekly needs coingecko_id, venues, peer_basket, etc.
  const { data: c, error } = await (supabase as any)
    .from('kr_signal_clients')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !c) return NextResponse.json({ ok: false, error: error?.message || 'client not found' }, { status: 200 });

  // Resolve destination: override ?? the client's /crm/telegram GC.
  let chatId: string | null = c.telegram_chat_id || null;
  let threadId: string | null = c.telegram_chat_id ? (c.telegram_thread_id || null) : null;
  let source: 'override' | 'default' | 'none' = c.telegram_chat_id ? 'override' : 'none';
  if (!chatId && c.client_id) {
    const { data: chats } = await (supabase as any)
      .from('telegram_chats')
      .select('chat_id, is_internal, is_hidden, last_message_at')
      .eq('client_id', c.client_id)
      .or('is_hidden.is.null,is_hidden.eq.false');
    const cands = ((chats as any[]) ?? []).filter((x) => x.chat_id);
    cands.sort((a, b) => {
      const ai = a.is_internal ? 1 : 0, bi = b.is_internal ? 1 : 0;
      if (ai !== bi) return ai - bi;
      const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return bt - at;
    });
    if (cands[0]?.chat_id) { chatId = String(cands[0].chat_id); source = 'default'; }
  }

  // A dry run still builds the report when there's nowhere to send it — that's
  // the case where seeing the output matters most (the destination is exactly
  // what the operator is about to fix).
  if (!chatId && !dryRun) {
    return NextResponse.json({ ok: false, error: 'No override and no linked client chat — nothing to test.' }, { status: 200 });
  }

  try {
    // Build the ACTUAL weekly report (assembleWeekly persists nothing on its
    // own — the cron does the saves separately — so this has no side effects
    // on the WoW history).
    const report = await assembleWeekly(supabase, c as unknown as KrSignalClient);
    // `pending` is the report's own list of degraded/hidden lines and why —
    // returned in full, not counted, because each entry names a config gap the
    // operator can act on ("coingecko_id not set", "content_log_source unset").
    const pending = report.pending ?? [];

    if (dryRun) {
      return NextResponse.json({
        ok: true, sent: false, dry_run: true, chat_id: chatId, source, pending,
        preview: report.html,
      });
    }

    // Small marker so recipients don't mistake it for the scheduled Sunday post.
    const html = `🧪 <b>Test send</b> · not the scheduled post\n${report.html}`;
    const res = await sendMessage(chatId!, html, threadId);
    return NextResponse.json({
      ok: true, sent: true, chat_id: chatId, source, pending,
      message_id: (res as any)?.message_id ?? null,
    });
  } catch (err: any) {
    // KR sendMessage / assembleWeekly throw with a descriptive message.
    return NextResponse.json({ ok: false, sent: false, dry_run: dryRun, chat_id: chatId, source, error: String(err?.message || err) }, { status: 200 });
  }
}
