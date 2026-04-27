import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const CHANNEL_KEY = 'intelligence_alerts';

/**
 * GET /api/intelligence/alerts/config
 *
 * Returns the current Intelligence-page alert routing config + a list of
 * Telegram chats the bot is in (so the UI can render a dropdown to pick
 * from). The chats list is filtered to active group / supergroup / private
 * conversations the bot has actually seen via webhook.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: channel, error: channelErr } = await (supabase as any)
    .from('notification_channels')
    .select('channel_key, telegram_chat_id, is_enabled, templates, last_test_at, last_test_status')
    .eq('channel_key', CHANNEL_KEY)
    .single();
  if (channelErr) {
    return NextResponse.json({ error: channelErr.message }, { status: 500 });
  }

  // Available chats — sorted with most-recently-active first so the UX
  // surfaces "this is the chat we use for everything" at the top.
  const { data: chats } = await (supabase as any)
    .from('telegram_chats')
    .select('chat_id, title, chat_type, last_message_at, message_count')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(0, 199);

  return NextResponse.json({
    channel,
    chats: chats || [],
  });
}

/**
 * PUT /api/intelligence/alerts/config
 *
 * Body: { telegram_chat_id?, is_enabled?, templates? }
 *   - templates is a partial map; merged into existing rather than replacing
 *     so saving the hot_tier template doesn't blow away grok_hot.
 *   - You can null out telegram_chat_id by sending it explicitly null,
 *     which also forces is_enabled to false.
 */
export async function PUT(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Load existing so we can merge templates rather than replace them.
  const { data: existing, error: loadErr } = await (supabase as any)
    .from('notification_channels')
    .select('telegram_chat_id, is_enabled, templates')
    .eq('channel_key', CHANNEL_KEY)
    .single();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  if ('telegram_chat_id' in body) {
    const v = body.telegram_chat_id;
    update.telegram_chat_id = v === null ? null : (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
    // If the chat is unset, force-disable so we never try to send to nothing.
    if (update.telegram_chat_id === null) update.is_enabled = false;
  }

  if ('is_enabled' in body) {
    // Only honor enable=true if a chat is configured (either now or in the request).
    const wantEnabled = !!body.is_enabled;
    const chatAfter = 'telegram_chat_id' in update
      ? update.telegram_chat_id
      : existing?.telegram_chat_id;
    update.is_enabled = wantEnabled && !!chatAfter;
  }

  if ('templates' in body) {
    if (!body.templates || typeof body.templates !== 'object') {
      return NextResponse.json({ error: 'templates must be an object' }, { status: 400 });
    }
    // Filter the patch to known event types and string-only values.
    const allowedKeys = ['hot_tier', 'grok_hot'];
    const patch: Record<string, string> = {};
    for (const k of allowedKeys) {
      const v = body.templates[k];
      if (typeof v === 'string') {
        if (v.length > 4000) {
          return NextResponse.json({ error: `template "${k}" exceeds 4000 chars` }, { status: 400 });
        }
        patch[k] = v;
      }
    }
    update.templates = { ...(existing?.templates || {}), ...patch };
  }

  const { data: saved, error: saveErr } = await (supabase as any)
    .from('notification_channels')
    .update(update)
    .eq('channel_key', CHANNEL_KEY)
    .select('channel_key, telegram_chat_id, is_enabled, templates, last_test_at, last_test_status')
    .single();
  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  return NextResponse.json({ channel: saved });
}
