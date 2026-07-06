import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/backfill-channel-tg-id
 *
 * One-off backfill: for every tg_monitored_channels row where
 * channel_tg_id IS NULL but channel_username IS set, call Telegram's
 * getChat API to resolve the numeric chat ID and write it back.
 *
 * Why we need this:
 *   - The mindshare scanner uses channel_tg_id to map incoming
 *     telegram_messages.chat_id → registry rows for the channel_reach
 *     metric. Without it, channel_reach is always 0 in the leaderboard.
 *   - Backfill the IDs so channel_reach starts working.
 *
 * Why getChat is safe for public channels even if the bot isn't a
 * member: Telegram resolves public @username chats regardless of bot
 * membership — only sending messages requires membership. For private
 * groups the bot must be a member or the call returns "chat not found"
 * (logged as an error in the response).
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Idempotent — re-running it skips rows that already have channel_tg_id
 * populated. Run more than once if you've added new channels.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const start = Date.now();

  try {
    // 1) Find every channel with a username but no resolved tg_id.
    const { data: channels, error: fetchErr } = await supabase
      .from('tg_monitored_channels')
      .select('id, channel_name, channel_username, channel_tg_id')
      .is('channel_tg_id', null)
      .not('channel_username', 'is', null);
    if (fetchErr) throw fetchErr;

    if (!channels || channels.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nothing to backfill — all channels with usernames already have channel_tg_id.',
        durationMs: Date.now() - start,
      });
    }

    // 2) For each, hit Telegram's getChat. Slight delay between calls
    //    to be polite (no documented rate limit on getChat but cheap
    //    to throttle). 200ms between calls is plenty for our scale
    //    (~20 channels = ~4 seconds total).
    const successes: Array<{ id: string; username: string; tg_id: string; type: string }> = [];
    const failures: Array<{ id: string; username: string; error: string }> = [];

    for (const ch of channels) {
      if (!ch.channel_username) continue;
      const chatRef = ch.channel_username.startsWith('@')
        ? ch.channel_username
        : '@' + ch.channel_username;

      try {
        const result = await TelegramService.getChat(chatRef);
        if ('error' in result) {
          failures.push({
            id: ch.id,
            username: ch.channel_username,
            error: result.error,
          });
          continue;
        }
        // result.id is a number (negative for groups/channels). Store as text.
        const tgId = String(result.id);
        const { error: updateErr } = await supabase
          .from('tg_monitored_channels')
          .update({ channel_tg_id: tgId })
          .eq('id', ch.id);
        if (updateErr) {
          failures.push({
            id: ch.id,
            username: ch.channel_username,
            error: 'DB update failed: ' + updateErr.message,
          });
          continue;
        }
        successes.push({
          id: ch.id,
          username: ch.channel_username,
          tg_id: tgId,
          type: result.type,
        });
      } catch (err: any) {
        failures.push({
          id: ch.id,
          username: ch.channel_username,
          error: err?.message || String(err),
        });
      }

      // Politeness delay
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return NextResponse.json({
      ok: true,
      attempted: channels.length,
      succeeded: successes.length,
      failed: failures.length,
      successes,
      failures,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[cron/backfill-channel-tg-id] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'backfill failed' },
      { status: 500 },
    );
  }
}
