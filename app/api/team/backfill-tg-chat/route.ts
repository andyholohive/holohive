import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/team/backfill-tg-chat
 *
 * Body: { user_id: string }  OR  { telegram_id: string }
 *
 * Reads a user's stored telegram_id, calls Telegram's getChat API for
 * it, and upserts the resulting chat metadata into telegram_chats.
 * Used by the team-page Telegram-link popover when a member is
 * "Connected" but no chat row exists for their telegram_id.
 *
 * Why this is needed: telegram_chats rows are created by the webhook
 * on inbound messages. Users whose telegram_id was set by some other
 * path (manual admin entry, signup flow, pre-webhook era) end up with
 * an orphan id. This endpoint pulls the chat info directly from the
 * Telegram API to fill the gap.
 *
 * Auth: super_admin only (mirrors who can edit the link itself).
 *
 * Returns:
 *   { ok: true, chat: {...} }              — new row inserted or existing one returned
 *   { ok: false, error: '...' }            — Telegram couldn't find the chat
 *                                            (most common: user hasn't /start'd the bot)
 */

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────
  const cookieStore = cookies();
  const sbAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {}, remove() {},
      },
    }
  );
  const { data: { user }, error: authErr } = await sbAuth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Verify super_admin via the users table.
  const { data: profile } = await (sbAuth as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  }

  // ── Resolve target chat_id ──────────────────────────────────────────
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let chatId: string | null = null;
  if (typeof body.telegram_id === 'string' && body.telegram_id.trim()) {
    chatId = body.telegram_id.trim();
  } else if (typeof body.user_id === 'string') {
    // Look up the user's stored telegram_id.
    const { data: target } = await (supabase as any)
      .from('users')
      .select('telegram_id')
      .eq('id', body.user_id)
      .single();
    chatId = target?.telegram_id ?? null;
  }
  if (!chatId) {
    return NextResponse.json(
      { error: 'No telegram_id provided or stored on the user' },
      { status: 400 },
    );
  }

  // Reject anything that isn't a numeric id. Usernames like "jaymz0"
  // will never resolve via getChat reliably — surface the issue
  // explicitly instead of letting Telegram return a confusing 400.
  if (!/^-?\d+$/.test(chatId)) {
    return NextResponse.json(
      { error: `Stored telegram_id "${chatId}" is not a numeric Telegram user ID. Replace it with the user's numeric ID before backfilling.` },
      { status: 400 },
    );
  }

  // ── Hit Telegram getChat ────────────────────────────────────────────
  const result = await TelegramService.getChat(chatId);
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error, chat_id: chatId },
      { status: 502 },
    );
  }

  // Build a friendly title. For private chats Telegram returns first/
  // last/username separately; the tracker convention used elsewhere is
  // first name only (matches existing rows like "Andy" / "Bolt" / "Jdot").
  const title = result.title
    ?? [result.first_name, result.last_name].filter(Boolean).join(' ').trim()
    ?? result.username
    ?? null;

  // ── Upsert into telegram_chats ──────────────────────────────────────
  // chat_id is the natural unique key. Row may already exist if the
  // webhook fired between our check and now; upsert handles both.
  const { data: chat, error: upsertErr } = await (supabase as any)
    .from('telegram_chats')
    .upsert(
      {
        chat_id: chatId,
        title,
        chat_type: result.type,
        last_message_at: null, // we only know the chat exists, not when it was last active
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id' },
    )
    .select()
    .single();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chat });
}
