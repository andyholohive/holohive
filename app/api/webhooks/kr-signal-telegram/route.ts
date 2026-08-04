import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadClientByKey, loadActiveClients, loadClientByChatId } from '@/lib/krSignal/config';
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
    // [2026-07-27] This route had NO authentication of any kind. It sits in the
    // public /api/webhooks/ allowlist and replies to whatever chat.id the body
    // names, so anyone who knew the URL could make the bot post into any chat —
    // and /weekly is an expensive live-data call, so it was also an
    // unauthenticated compute-abuse vector.
    //
    // Telegram sends X-Telegram-Bot-Api-Secret-Token on every update when the
    // webhook was registered with a secret_token. Enforced strictly WHEN the
    // env var is set; when unset we log and continue so that deploying this
    // change cannot silently take the bot offline before the secret exists.
    // Set KR_SIGNAL_WEBHOOK_SECRET and re-run setWebhook with the same value to
    // turn enforcement on.
    const webhookSecret = process.env.KR_SIGNAL_WEBHOOK_SECRET;
    if (webhookSecret) {
      if (request.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
        // 200, not 401 — an attacker learns nothing and Telegram never retries.
        console.warn('[kr-signal-webhook] rejected update: bad or missing secret token');
        return NextResponse.json({ ok: true });
      }
    } else {
      console.warn(
        '[kr-signal-webhook] KR_SIGNAL_WEBHOOK_SECRET is not set — this endpoint is UNAUTHENTICATED. ' +
        'Set it and re-register the webhook with the same secret_token.',
      );
    }

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
    const requestedKey = parts[1] ? parts[1].toLowerCase() : null;

    /**
     * [2026-07-27] Was `(parts[1] || 'venice')` — a bare /weekly returned
     * VENICE's market intelligence to whoever asked, from whatever chat. Once
     * the bot joins a client group that is a cross-client data leak, and the
     * go-live step (adding the bot to client GCs) is precisely what arms it.
     *
     * Rule now: the calling chat decides.
     *   • Chat IS a client's chat  → that client, always. An explicit argument
     *     naming a different client is refused, not silently honoured.
     *   • Chat is NOT bound to any client (internal ops / a DM) → the explicit
     *     argument is required; there is no default to leak.
     */
    async function resolveClient(): Promise<{ cfg: Awaited<ReturnType<typeof loadClientByKey>>; error?: string }> {
      const bound = await loadClientByChatId(supabase, chatId);
      if (bound) {
        if (requestedKey && requestedKey !== bound.key.toLowerCase()) {
          return { cfg: null, error: `This chat is set up for <b>${bound.name}</b>. Ask in that client's own chat for other clients.` };
        }
        return { cfg: bound };
      }
      if (!requestedKey) {
        const clients = await loadActiveClients(supabase);
        return { cfg: null, error: `Name a client — e.g. <code>/weekly ${clients[0]?.key ?? 'venice'}</code>\n\nActive: ${clients.map(c => c.key).join(', ') || 'none'}` };
      }
      const cfg = await loadClientByKey(supabase, requestedKey);
      return cfg ? { cfg } : { cfg: null, error: `Unknown client "${requestedKey}".` };
    }

    const help = [
      '<b>HH Korea Signal Bot</b>',
      '',
      '/weekly [client] — Weekly KR Market Report',
      '/vl [client] — Market backdrop (volumes, KOSPI, FX, kimchi)',
      '/status — bot health',
      '/help — this message',
      '',
      // [2026-07-27] Was "Default client: venice". There is no default any
      // more — a client's own chat answers for that client, and anywhere else
      // you name one. Leaving the old line would have told people to rely on
      // behaviour that was removed precisely because it leaked across clients.
      'In a client chat, commands answer for that client.',
      'Elsewhere, name one — e.g. <code>/weekly venice</code>',
    ].join('\n');

    try {
      switch (cmd) {
        case 'start':
        case 'help':
          await sendMessage(chatId, help);
          break;
        case 'status': {
          const clients = await loadActiveClients(supabase);
          await sendMessage(chatId, `<b>KR Signal Bot</b>\n✅ online · ${clients.length} active client(s)\nTry /weekly or /vl`);
          break;
        }
        case 'weekly': {
          const { cfg, error } = await resolveClient();
          if (!cfg) { await sendMessage(chatId, error ?? 'Could not resolve a client.'); break; }
          await sendMessage(chatId, '⏳ Building weekly report (live data)…');
          const res = await assembleWeekly(supabase, cfg);
          await sendMessage(chatId, res.html);
          break;
        }
        case 'vl': {
          const { cfg, error } = await resolveClient();
          if (!cfg) { await sendMessage(chatId, error ?? 'Could not resolve a client.'); break; }
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
