import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { renderTemplate } from '@/lib/intelligenceAlerts';

export const dynamic = 'force-dynamic';

const CHANNEL_KEY = 'intelligence_alerts';

/**
 * POST /api/intelligence/alerts/test
 *
 * Renders the saved template against fake-but-plausible variables and
 * sends it to the configured Telegram chat. Used by the "Send test"
 * button in the settings dialog so the user can verify routing before
 * relying on real alerts.
 *
 * Body: { event: 'hot_tier' | 'grok_hot' }
 */
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await request.json().catch(() => ({}));
  const event = (body?.event === 'grok_hot' || body?.event === 'korea_listing')
    ? body.event
    : 'hot_tier';

  const { data: channel, error: loadErr } = await (supabase as any)
    .from('notification_channels')
    .select('telegram_chat_id, templates')
    .eq('channel_key', CHANNEL_KEY)
    .single();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!channel?.telegram_chat_id) {
    return NextResponse.json({ error: 'No chat configured. Pick one in the dropdown above first.' }, { status: 400 });
  }
  const template = channel.templates?.[event];
  if (typeof template !== 'string' || !template.trim()) {
    return NextResponse.json({ error: `No template saved for "${event}".` }, { status: 400 });
  }

  // Plausible test data — matches the variable set fireIntelligenceAlert
  // would actually pass. The "[TEST]" prefix makes it obvious in chat that
  // this isn't a real alert from a real prospect.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ? (process.env.NEXT_PUBLIC_BASE_URL.startsWith('http') ? process.env.NEXT_PUBLIC_BASE_URL : `https://${process.env.NEXT_PUBLIC_BASE_URL}`)
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  let rendered: string;
  if (event === 'hot_tier') {
    rendered = renderTemplate(template, {
      project_name: 'Pharos Network',
      tier: 'REACH OUT NOW',
      score: 87,
      funding_round: 'Series A',
      funding_amount: '$20M',
      funding_line: ' · Series A $20M',
      prospect_url: `${baseUrl}/intelligence/discovery/test-id`,
    });
  } else if (event === 'grok_hot') {
    rendered = renderTemplate(template, {
      project_name: 'Pharos Network',
      poc_handle: 'wishlonger',
      poc_name: 'Wish Wu',
      korea_score: 85,
      signal_count: 5,
      signal_plural: 's',
      prospect_url: `${baseUrl}/intelligence/discovery/test-id`,
    });
  } else {
    // korea_listing
    rendered = renderTemplate(template, {
      project_name: 'Pharos Network',
      exchange: 'Upbit',
      exchange_raw: 'upbit',
      market_pair: 'KRW-PHAR',
      symbol: 'PHAR',
      prospect_url: `${baseUrl}/intelligence/discovery/test-id`,
    });
  }

  const text = `<b>[TEST]</b> ${rendered}`;
  const ok = await TelegramService.sendToChat(channel.telegram_chat_id, text, 'HTML');

  // Record the result on the channel row so the UI can show "last tested 2m ago · ok"
  await (supabase as any)
    .from('notification_channels')
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: ok ? 'ok' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('channel_key', CHANNEL_KEY);

  if (!ok) {
    return NextResponse.json({
      success: false,
      error: 'Telegram send failed. Check that the bot is in the selected chat and has permission to post.',
    }, { status: 502 });
  }

  return NextResponse.json({ success: true, sent_text: text });
}
