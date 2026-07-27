import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/mcp/mindshare-ingest
 *
 * Ingest endpoint for the Telethon userbot mindshare scraper. Called
 * per-channel by scripts/scrape_mindshare.py after `tg_scrape_channel(...)`
 * pulls a page of messages. Upserts into tg_channel_posts on the
 * (channel_tg_id, tg_message_id) unique key so re-runs are cheap.
 *
 * Also backfills tg_monitored_channels.channel_tg_id on the first
 * successful scrape — the userbot resolves the entity, so we can
 * finally link the monitored-channel row to its numeric chat_id.
 * (Previously only the bot could do this via getChat, and the bot
 * isn't in most Korean channels.)
 *
 * Body:
 *   - monitored_channel_id: uuid — the tg_monitored_channels row this
 *     scrape came from. Used for the channel_tg_id backfill.
 *   - chat_id: string — Telegram numeric ID as returned by Telethon.
 *   - chat_title / chat_username: string | null — channel identity, on the
 *     envelope because it's per-scrape, not per-message.
 *   - messages: Array<{
 *       tg_message_id: string,
 *       date: ISO timestamp,
 *       text: string,
 *       from_user_id: string | null,
 *       from_username: string | null,
 *       from_user_name: string | null,
 *       views / forwards / replies: number | null,
 *       reactions_json: Array<{emoji, count}> | null,
 *       is_forward: boolean,
 *     }>
 *
 * from_user_* are accepted but not stored — tg_channel_posts is a channel
 * post store and the author is the channel. They're left in the contract so
 * an older scraper build doesn't 400.
 *
 * Auth: Bearer CRON_SECRET (server-to-server only). Same pattern as
 * kol-snapshot/upsert.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });

  const monitoredChannelId = body.monitored_channel_id;
  const chatId = body.chat_id;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  // Channel identity is on the scrape envelope, not per-message — the
  // scraper resolves the entity once and every message in the batch is
  // from it. Older senders may not send these; they're display-only.
  const channelHandle = typeof body.chat_username === 'string' ? body.chat_username : null;
  const channelTitle = typeof body.chat_title === 'string' ? body.chat_title : null;
  if (!monitoredChannelId || typeof monitoredChannelId !== 'string') {
    return NextResponse.json({ error: 'monitored_channel_id is required' }, { status: 400 });
  }
  if (!chatId || typeof chatId !== 'string') {
    return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Backfill channel_tg_id if the monitored row doesn't have one yet.
  // The scanner uses channel_tg_id to filter messages to KO channels, so
  // this handshake is what actually turns on ingest for a new channel.
  try {
    const { data: chanRow } = await (supabase as any)
      .from('tg_monitored_channels')
      .select('channel_tg_id')
      .eq('id', monitoredChannelId)
      .maybeSingle();
    if (chanRow && !(chanRow as any).channel_tg_id) {
      await (supabase as any)
        .from('tg_monitored_channels')
        .update({ channel_tg_id: chatId })
        .eq('id', monitoredChannelId);
    }
  } catch (err) {
    console.error('[mindshare-ingest] channel_tg_id backfill failed', err);
    // Non-fatal — messages still ingest, just without the tg-id link.
  }

  // [2026-07-27] Writes to tg_channel_posts, not telegram_messages.
  //
  // telegram_messages is bot-webhook shaped — it has from_user_id and
  // message_thread_id and NO views/forwards/reactions columns, because a bot
  // never sees those for a channel post. 95% of its rows are team, client and
  // KOL group chats read by the CRM and the sales pipeline; scraped channel
  // content was the odd one out, and every engagement figure the scraper
  // collected was being dropped on the floor at this line.
  //
  // tg_channel_posts is the shape this data actually is, and is what coverage
  // and KOL scoring already read. subject_type/subject_id stay NULL: a
  // mindshare pull grabs everything a channel posted, and the keyword match
  // against projects happens later in mindshareScanner, where one post can
  // match many projects or none.
  let ok = 0;
  let skipped = 0;
  let latestDate: string | null = null;
  const rows = messages
    .filter((m: any) => typeof m?.tg_message_id === 'string' && typeof m?.text === 'string' && m.text.trim())
    .map((m: any) => {
      const messageDate: string = m.date;
      if (!latestDate || messageDate > latestDate) latestDate = messageDate;
      const reactions = Array.isArray(m.reactions_json) ? m.reactions_json : null;
      return {
        subject_type: null,
        subject_id: null,
        channel_tg_id: chatId,
        channel_handle: channelHandle,
        channel_title: channelTitle,
        tg_message_id: Number(m.tg_message_id),
        posted_at: messageDate,
        text: String(m.text).slice(0, 4000),
        views: Number.isFinite(m.views) ? m.views : null,
        forwards: Number.isFinite(m.forwards) ? m.forwards : null,
        replies: Number.isFinite(m.replies) ? m.replies : null,
        reactions_json: reactions,
        reaction_total: reactions
          ? reactions.reduce((s: number, r: any) => s + (Number(r?.count) || 0), 0)
          : null,
        is_forward: Boolean(m.is_forward),
        pulled_at: new Date().toISOString(),
      };
    });

  skipped = messages.length - rows.length;

  if (rows.length > 0) {
    // Chunk so we don't blow parameter limits on a 1000-row backfill page.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      // uq_tg_channel_posts_raw_msg is the partial unique index covering the
      // subject-less half of the table.
      const { error, data } = await (supabase as any)
        .from('tg_channel_posts')
        .upsert(slice, { onConflict: 'channel_tg_id,tg_message_id', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.error('[mindshare-ingest] upsert error', error);
        return NextResponse.json({ error: `upsert failed: ${error.message}` }, { status: 500 });
      }
      ok += Array.isArray(data) ? data.length : 0;
    }
  }

  // Stamp last_message_at so the /mindshare Channels tab can surface freshness.
  if (latestDate) {
    try {
      await (supabase as any)
        .from('tg_monitored_channels')
        .update({ last_message_at: latestDate })
        .eq('id', monitoredChannelId);
    } catch (err) {
      console.error('[mindshare-ingest] last_message_at stamp failed', err);
    }
  }

  return NextResponse.json({
    ok: true,
    received: messages.length,
    inserted: ok,
    skipped_empty: skipped,
    latest_message_date: latestDate,
  });
}
