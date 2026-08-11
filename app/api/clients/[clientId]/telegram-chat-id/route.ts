import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/clients/[clientId]/telegram-chat-id
 *
 * Link a Telegram chat to a client. Used by the dashboard's Recent Call Notes
 * card so the user can link inline when "Send to TG" reports no chat.
 *
 * [2026-08-11] Now writes `telegram_chats.client_id` — the same link the
 * TG Chats page's "Link client" dialog sets, and the one every client-facing
 * bot resolves through (call notes, weekly recap, KR Signal).
 *
 * It used to write `client_context.telegram_chat_id`, a field nothing else
 * wrote and nothing else read. That made "assign a client's chat" ambiguous:
 * linking here had no effect on the recap or KR Signal, and linking in TG
 * Chats had no effect on call notes. One link, one meaning, one place.
 *
 * The chat must already exist in `telegram_chats` — the picker only offers
 * chats the bot has seen, and the bot has to be a member to post anyway.
 *
 * Body: { chatId: string }  — TG chat ID as text (negative for groups)
 *
 * Auth: any authenticated user, unchanged.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { clientId: string } },
) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { chatId?: string } = {};
  try { body = await request.json(); } catch { /* empty body falls through */ }

  const chatId = (body.chatId ?? '').trim();
  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  // Service-role: telegram_chats isn't writable under the anon role here.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: chat } = await (supabaseAdmin as any)
    .from('telegram_chats')
    .select('id, client_id')
    .eq('chat_id', chatId)
    .maybeSingle();

  if (!chat?.id) {
    return NextResponse.json({
      error: 'That chat is not registered yet',
      hint: 'The bot has to be a member and see one message before the chat can be linked.',
    }, { status: 400 });
  }

  const { error } = await (supabaseAdmin as any)
    .from('telegram_chats')
    .update({ client_id: params.clientId, updated_at: new Date().toISOString() })
    .eq('id', chat.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chat_id: chatId });
}
