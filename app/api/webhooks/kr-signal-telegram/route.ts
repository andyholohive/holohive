import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadClientByKey, loadActiveClients } from '@/lib/krSignal/config';
import { assembleWeekly } from '@/lib/krSignal/assembleWeekly';
import { sendMessage } from '@/lib/krSignal/telegram';
import { buildBackdrop } from '@/lib/krSignal/weeklyReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/webhooks/kr-signal-telegram — the KR Signal bot's webhook.
 * Separate bot token (KR_SIGNAL_BOT_TOKEN). Handles on-demand commands:
 *   /weekly [client]  — Weekly KR Market Report (§7.A)
 *   /vl [client]      — market backdrop (volumes, KOSPI, FX, kimchi)
 *   /status           — health check
 *   /help             — command list
 * Register once after deploy via setWebhook to this URL.
 *
 * In the public middleware allowlist via the /api/webhooks/ prefix.
 * Always returns 200 so Telegram doesn't retry-storm.
 */
export async function POST(request: Request) {
  try {
    const update = await request.json().catch(() => null);
    const msg = update?.message;
    const text: string | undefined = msg?.text;
    const chatId = msg?.chat?.id;
    if (!text || !text.startsWith('/') || chatId == null) {
      return NextResponse.json({ ok: true });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey || !process.env.KR_SIGNAL_BOT_TOKEN) {
      return NextResponse.json({ ok: true });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].replace(/^\//, '').replace(/@.*/, '').toLowerCase();
    const clientKey = (parts[1] || 'venice').toLowerCase();

    const help = [
      '🐝 <b>HH Korea Signal Bot</b>',
      '',
      '/weekly [client] — Weekly KR Market Report',
      '/vl [client] — Market backdrop (volumes, KOSPI, FX, kimchi)',
      '/status — bot health',
      '/help — this message',
      '',
      'Default client: venice',
    ].join('\n');

    try {
      switch (cmd) {
        case 'start':
        case 'help':
          await sendMessage(chatId, help);
          break;
        case 'status': {
          const clients = await loadActiveClients(supabase);
          await sendMessage(chatId, `🐝 <b>KR Signal Bot</b>\n✅ online · ${clients.length} active client(s)\nTry /weekly or /vl`);
          break;
        }
        case 'weekly': {
          const cfg = await loadClientByKey(supabase, clientKey);
          if (!cfg) { await sendMessage(chatId, `Unknown client "${clientKey}".`); break; }
          await sendMessage(chatId, '⏳ Building weekly report (live data)…');
          const res = await assembleWeekly(supabase, cfg);
          await sendMessage(chatId, res.html);
          break;
        }
        case 'vl': {
          const cfg = await loadClientByKey(supabase, clientKey);
          if (!cfg) { await sendMessage(chatId, `Unknown client "${clientKey}".`); break; }
          await sendMessage(chatId, '⏳ Pulling volumes…');
          const res = await assembleWeekly(supabase, cfg);
          await sendMessage(chatId, buildBackdrop(res.data));
          break;
        }
        default:
          await sendMessage(chatId, 'Unknown command.\n\n' + help);
      }
    } catch (e: any) {
      await sendMessage(chatId, `⚠️ ${(e && e.message) || String(e)}`).catch(() => {});
    }
  } catch (e) {
    console.error('kr-signal webhook error', e);
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'kr-signal-telegram webhook' });
}
