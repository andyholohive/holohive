import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/backlog/test-channel
 *
 * Body: { channel_id: string }
 *
 * Sends a quick test message via the Telegram bot to the given chat
 * ID so the operator can confirm two things BEFORE saving:
 *   1. The chat ID is correct (typos → "chat not found")
 *   2. The bot has been added to that chat / has post permission
 *      (otherwise → "bot was kicked" / "chat administrators only")
 *
 * Auth: super_admin only — same gate as the settings dialog that
 * calls this. Defense-in-depth in case the UI ever exposes the
 * route surface to someone without the role.
 *
 * Returns: { ok, sent, error? }. The error field forwards Telegram's
 * own description verbatim so the operator can act on it (a chat-
 * not-found message tells them they got the ID wrong; a kicked
 * message tells them to add the bot first).
 */
export async function POST(request: Request) {
  let body: { channel_id?: string; thread_id?: number | string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const channelId = (body.channel_id || '').trim();
  if (!channelId) {
    return NextResponse.json({ ok: false, error: 'channel_id is required' }, { status: 400 });
  }
  // Optional forum-topic thread. Accepts integer or numeric string.
  const threadIdRaw = body.thread_id;
  const threadId: number | null =
    threadIdRaw != null && threadIdRaw !== ''
      ? (typeof threadIdRaw === 'number' ? threadIdRaw : parseInt(String(threadIdRaw), 10))
      : null;
  if (threadIdRaw != null && threadIdRaw !== '' && (threadId === null || Number.isNaN(threadId))) {
    return NextResponse.json({ ok: false, error: 'thread_id must be a number' }, { status: 400 });
  }

  // ─── Auth ────────────────────────────────────────────────────────
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { data: me } = await sb.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me || me.role !== 'super_admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  // ─── Bot token check ────────────────────────────────────────────
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured on the server' },
      { status: 500 },
    );
  }

  // ─── Send the test message ───────────────────────────────────────
  // Friendly text so anyone watching the channel knows what happened.
  // No need to escape — we use plain text, not HTML.
  const text =
    '🧪 HHP Backlog test message\n\n'
    + 'If you see this, the bot can post here. The weekly digest will '
    + 'land in this channel every Monday morning.';

  try {
    const sendBody: Record<string, any> = {
      chat_id: channelId,
      text,
      disable_web_page_preview: true,
    };
    if (threadId !== null && !Number.isNaN(threadId)) {
      sendBody.message_thread_id = threadId;
    }
    const tgRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendBody),
      },
    );
    const tgJson = await tgRes.json().catch(() => ({}));
    if (tgRes.ok && tgJson.ok) {
      return NextResponse.json({ ok: true, sent: true });
    }
    // Telegram returns a `description` field with a human-readable
    // explanation. Forward it so the operator can act on it.
    return NextResponse.json({
      ok: false,
      sent: false,
      error: tgJson?.description || `HTTP ${tgRes.status}`,
    }, { status: 200 }); // 200 so the UI can render the error cleanly
  } catch (err) {
    return NextResponse.json({
      ok: false,
      sent: false,
      error: (err as Error).message,
    }, { status: 200 });
  }
}
