import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/mindshare/channels/check-bot-status
 *
 * Body: { channel_id?: string }   // optional — if omitted, checks all
 *                                  // active channels with channel_tg_id
 *
 * For every monitored channel (or just one if channel_id given), call
 * Telegram getChatMember(chat_id, bot_id) and record the bot's
 * membership status. Also updates last_message_at by reading the most
 * recent telegram_messages row for the chat.
 *
 * Why this exists:
 *   The mindshare scanner can only count mentions from chats where the
 *   bot is actually a member — Telegram webhooks don't fire for chats
 *   the bot isn't in. We discovered (the hard way) that having a chat
 *   in tg_monitored_channels with channel_tg_id populated is not the
 *   same as the bot being able to receive its messages. This endpoint
 *   surfaces the gap to the admin so they can invite the bot per
 *   channel.
 *
 * Status values written to tg_monitored_channels.bot_status:
 *   creator | administrator | member | restricted | left | kicked | error
 *
 * Admin-gated. Politeness-throttled at 150ms between Telegram calls.
 */
export async function POST(request: Request) {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const singleChannelId: string | undefined = body?.channel_id;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1) Resolve the bot's own ID once — needed for every getChatMember call.
  const me = await TelegramService.getMe();
  if ('error' in me) {
    return NextResponse.json({ error: `getMe failed: ${me.error}` }, { status: 500 });
  }

  // 2) Pull channels to check. Skip rows without channel_tg_id — we
  //    can't call getChatMember without a chat_id.
  let q = (supabase as any)
    .from('tg_monitored_channels')
    .select('id, channel_name, channel_username, channel_tg_id')
    .not('channel_tg_id', 'is', null);
  if (singleChannelId) q = q.eq('id', singleChannelId);
  else q = q.eq('is_active', true);
  const { data: channels, error: fetchErr } = await q;
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!channels || channels.length === 0) {
    return NextResponse.json({ ok: true, attempted: 0, message: 'No channels to check' });
  }

  // 3) Walk channels. For each: getChatMember + look up last_message_at.
  //    150ms politeness between Telegram calls — getChatMember is cheap
  //    but no point hammering. 74 channels * 150ms = ~11s, fits in 60s
  //    maxDuration with room for the DB lookups.
  const start = Date.now();
  const results: Array<{
    id: string;
    channel_name: string;
    channel_username: string | null;
    status: string;
    last_message_at: string | null;
    error?: string;
  }> = [];

  for (const ch of channels) {
    if (!ch.channel_tg_id) continue;
    const memberResp = await TelegramService.getChatMember(ch.channel_tg_id, me.id);
    let status: string;
    let errorMsg: string | undefined;
    if ('error' in memberResp) {
      status = 'error';
      errorMsg = memberResp.error;
    } else {
      status = memberResp.status;
    }

    // Latest message timestamp for this chat — confirms the bot is
    // actually receiving messages (membership alone isn't enough proof;
    // private channels can mute bots, etc.).
    const { data: lastMsg } = await (supabase as any)
      .from('telegram_messages')
      .select('message_date')
      .eq('chat_id', ch.channel_tg_id)
      .order('message_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastMessageAt: string | null = lastMsg?.message_date || null;

    // Persist
    await (supabase as any)
      .from('tg_monitored_channels')
      .update({
        bot_status: status,
        bot_status_checked_at: new Date().toISOString(),
        last_message_at: lastMessageAt,
      })
      .eq('id', ch.id);

    results.push({
      id: ch.id,
      channel_name: ch.channel_name,
      channel_username: ch.channel_username,
      status,
      last_message_at: lastMessageAt,
      ...(errorMsg ? { error: errorMsg } : {}),
    });

    if (!singleChannelId) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // 4) Summary so the UI can render a counter without recomputing.
  const summary = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return NextResponse.json({
    ok: true,
    bot: { id: me.id, username: me.username },
    attempted: results.length,
    summary,
    results,
    durationMs: Date.now() - start,
  });
}
