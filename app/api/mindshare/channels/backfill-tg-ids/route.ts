import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/mindshare/channels/backfill-tg-ids
 *
 * Admin-callable mirror of /api/cron/backfill-channel-tg-id — same
 * Telegram getChat loop, same idempotent skip logic, but gated on a
 * Supabase admin session instead of the CRON_SECRET bearer token.
 *
 * Why duplicate the endpoint?
 *   The cron route is hit by Vercel cron + manual curl, both of which
 *   carry the CRON_SECRET we don't want to expose to the browser.
 *   Wrapping it from the UI through a session-authed admin endpoint
 *   means the admin clicks a button instead of running curl in a
 *   terminal — same DB writes, same Telegram politeness, just better
 *   UX. Logic is small (one loop) so duplicating beats coupling the
 *   two routes through a shared module just for this.
 *
 * Behavior:
 *   - Finds active channels where channel_username is set AND
 *     channel_tg_id is NULL
 *   - For each, calls Telegram getChat(@username) and stores the
 *     resolved numeric id
 *   - 200ms politeness delay between Telegram calls
 *   - Returns the same { attempted, succeeded, failed, successes,
 *     failures } shape as the cron endpoint, plus durationMs
 *
 * Failure modes are friendly:
 *   - "chat not found" → bot can't see the chat (private + bot not
 *     invited, or username is wrong / stale). Captured in failures[],
 *     no DB write.
 *   - "Too Many Requests" → re-running the endpoint retries only
 *     the still-unresolved rows (idempotent skip), so the user can
 *     just click the button again after ~30 seconds.
 */
export async function POST(_request: Request) {
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const start = Date.now();

  try {
    // Find every channel needing backfill — has a username but no
    // resolved tg_id. Idempotent: existing tg_ids are skipped, so
    // re-clicking the button is safe and cheap.
    const { data: channels, error: fetchErr } = await supabase
      .from('tg_monitored_channels')
      .select('id, channel_name, channel_username, channel_tg_id')
      .is('channel_tg_id', null)
      .not('channel_username', 'is', null);
    if (fetchErr) throw fetchErr;

    if (!channels || channels.length === 0) {
      return NextResponse.json({
        ok: true,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        successes: [],
        failures: [],
        message: 'All channels with usernames already have chat IDs resolved.',
        durationMs: Date.now() - start,
      });
    }

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
          failures.push({ id: ch.id, username: ch.channel_username, error: result.error });
          continue;
        }
        const tgId = String(result.id);
        const { error: updateErr } = await supabase
          .from('tg_monitored_channels')
          .update({ channel_tg_id: tgId })
          .eq('id', ch.id);
        if (updateErr) {
          failures.push({ id: ch.id, username: ch.channel_username, error: 'DB update failed: ' + updateErr.message });
          continue;
        }
        successes.push({ id: ch.id, username: ch.channel_username, tg_id: tgId, type: result.type });
      } catch (err: any) {
        failures.push({ id: ch.id, username: ch.channel_username, error: err?.message || String(err) });
      }

      // Same politeness delay as the cron route — no documented rate
      // limit on getChat but cheap to throttle.
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
    console.error('[mindshare/channels/backfill-tg-ids] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'backfill failed' },
      { status: 500 },
    );
  }
}
