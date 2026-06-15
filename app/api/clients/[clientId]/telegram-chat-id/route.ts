import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/clients/[clientId]/telegram-chat-id
 *
 * Set client_context.telegram_chat_id without going through the full
 * Edit Portal context save. Used by the dashboard's Recent Call Notes
 * card to let the user link a TG chat inline when the "Send to TG"
 * action fails with "no chat configured."
 *
 * Body: { chatId: string }  — TG chat ID (negative number for groups,
 *                              positive for users; passed through as text)
 *
 * Auth: any authenticated user. The save endpoint isn't admin-only
 * because the same field is editable in the existing Edit Portal flow.
 *
 * Creates the client_context row if it doesn't exist yet (insert),
 * otherwise updates in place.
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
    return NextResponse.json(
      { error: 'chatId is required' },
      { status: 400 },
    );
  }

  // Service-role client because client_context RLS is permissive but
  // we want consistent write semantics with the existing send-tg
  // endpoint (which already uses service-role for the JSONB update).
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Upsert the chat ID. Look first to decide insert vs update so we
  // don't accidentally clobber other fields on update.
  const { data: existing } = await (supabaseAdmin as any)
    .from('client_context')
    .select('id')
    .eq('client_id', params.clientId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  if (existing) {
    const { error } = await (supabaseAdmin as any)
      .from('client_context')
      .update({ telegram_chat_id: chatId, updated_at: nowIso })
      .eq('id', existing.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await (supabaseAdmin as any)
      .from('client_context')
      .insert({ client_id: params.clientId, telegram_chat_id: chatId });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, chat_id: chatId });
}
