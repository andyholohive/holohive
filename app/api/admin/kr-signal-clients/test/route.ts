import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { sendMessage } from '@/lib/krSignal/telegram';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/kr-signal-clients/test  — body: { id }
 *
 * Sends a short, clearly-labeled test ping to a KR Signal client's resolved
 * digest chat, via the KR Signal bot's OWN token (KR_SIGNAL_BOT_TOKEN). This
 * confirms the one thing that's otherwise unverifiable from HHP: that the
 * KR Signal bot is a member of that chat and can post there.
 *
 * The destination is resolved the same way the crons resolve it:
 *   override (kr_signal_clients.telegram_chat_id) ?? the client's /crm/telegram GC.
 * Because that resolved chat can be a live client GC, this deliberately sends a
 * brief test message, NOT the full weekly report.
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
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ ok: false, error: 'Missing Supabase config' }, { status: 500 });

  const { data: c, error } = await (supabase as any)
    .from('kr_signal_clients')
    .select('id, name, ticker, telegram_chat_id, telegram_thread_id, client_id')
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

  if (!chatId) {
    return NextResponse.json({ ok: false, error: 'No override and no linked client chat — nothing to test.' }, { status: 200 });
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html =
    `☆ <b>KR Signal test</b>\n`
    + `If you can see this, the KR Signal bot can post to this chat — <b>$${esc(c.ticker)}</b> digests will land here `
    + `(${source === 'override' ? 'override' : 'client default chat'}).`;

  try {
    const res = await sendMessage(chatId, html, threadId);
    return NextResponse.json({ ok: true, sent: true, chat_id: chatId, source, message_id: (res as any)?.message_id ?? null });
  } catch (err: any) {
    // KR sendMessage throws with Telegram's description in the message.
    return NextResponse.json({ ok: false, sent: false, chat_id: chatId, source, error: String(err?.message || err) }, { status: 200 });
  }
}
