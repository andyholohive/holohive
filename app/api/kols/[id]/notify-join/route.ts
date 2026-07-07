import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';

export const dynamic = 'force-dynamic';

/**
 * POST /api/kols/[id]/notify-join
 *
 * Fired from /kols the moment a new KOL gets its Telegram channel link.
 * DMs the ops Telegram chat with the channel link + a "✅ Joined — Scan
 * now" button. The scanner account can only read channels it has joined,
 * so instead of firing a scan that would fail with "not joined", we ask
 * Andy to join the channel first and tap the button — which routes to
 * handleKolScanCallback in the webhook and dispatches the scan.
 *
 * Auth: any authenticated user (same as /rescan). The button press is
 * gated on the bot side; the scan write path gates on CRON_SECRET.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: kol, error } = await (admin as any)
      .from('master_kols')
      .select('id, name, link, platform')
      .eq('id', params.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Lookup failed', detail: error.message }, { status: 500 });
    if (!kol) return NextResponse.json({ error: 'KOL not found' }, { status: 404 });

    if (!_isTelegram(kol.platform)) {
      return NextResponse.json({ ok: false, skipped: 'not a Telegram KOL' });
    }
    const handle = _extractHandle(kol.link);
    if (!handle) {
      return NextResponse.json({ ok: false, skipped: 'no usable TG handle' });
    }

    // Destination is configurable in the Telegram Comm admin tab
    // (app_settings.kol_new_alert_chat_id / _thread_id). Falls back to
    // the env terminal chat when unset.
    const [chatSetting, threadSetting] = await Promise.all([
      (admin as any).from('app_settings').select('value').eq('key', 'kol_new_alert_chat_id').maybeSingle(),
      (admin as any).from('app_settings').select('value').eq('key', 'kol_new_alert_chat_thread_id').maybeSingle(),
    ]);
    const destChatId: string | undefined = (chatSetting.data as any)?.value || undefined;
    const destThreadId: string | undefined = (threadSetting.data as any)?.value || undefined;

    const name = escapeHtml(kol.name || '(unnamed KOL)');
    const link = `https://t.me/${handle}`;
    const text =
      `🆕 <b>New KOL added</b>\n` +
      `${name}\n` +
      `Channel: ${link}\n\n` +
      `If you're not already in this channel, join it from the scanner account, ` +
      `then tap below to pull its niche + score.`;

    const sent = await TelegramService.sendMessageWithButtons(
      text,
      [[{ text: '✅ Joined — Scan now', callback_data: `kolscan:${kol.id}` }]],
      { chatId: destChatId, threadId: destThreadId },
    );

    return NextResponse.json({ ok: sent, dest: destChatId ? 'configured' : 'fallback' });
  } catch (err: any) {
    console.error('[notify-join] crash:', err);
    return NextResponse.json({ error: 'Unexpected error', detail: err?.message ?? String(err) }, { status: 500 });
  }
}

/** Mirror of the platform check used by refresh-tg / the scanner. */
function _isTelegram(platform: string[] | string | null | undefined): boolean {
  if (!platform) return false;
  const values = Array.isArray(platform) ? platform : [platform];
  return values.some(v => {
    const p = String(v ?? '').toLowerCase().trim();
    return p === 'telegram' || p === 'tg' || p === 'telegram channel';
  });
}

/** Normalize t.me/ URL / @handle / bare handle → bare username. */
function _extractHandle(link: string | null | undefined): string | null {
  if (!link) return null;
  let s = String(link).trim();
  if (!s) return null;
  if (s.includes('t.me/')) s = s.split('t.me/', 2)[1];
  s = s.replace(/^@/, '').replace(/\/$/, '');
  s = s.split('/')[0];
  return s || null;
}
