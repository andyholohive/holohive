import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadClientByKey, loadActiveClients, loadClientByChatId, loadClientById } from '@/lib/krSignal/config';
import { assembleWeekly } from '@/lib/krSignal/assembleWeekly';
import { sendMessage, answerCallbackQuery } from '@/lib/krSignal/telegram';
import { buildBackdrop } from '@/lib/krSignal/weeklyReport';
import { getWeeklyReviewById } from '@/lib/krSignal/store';
import { approveAndSend, skipReport } from '@/lib/krSignal/reviewActions';
import { approveAndSendDigest, skipDigest } from '@/lib/krSignal/listingDigestReview';
import {
  fetchRecentKrwListings, fetchRecentNonKrwListings, buildListingsDigest,
  getTokenKrPriceKrw, type DigestEntry,
} from '@/lib/krSignal/listings';
import { getUsdKrw } from '@/lib/krSignal/adapters';
import { getAppSetting } from '@/lib/appSettings';
import { escapeHtml } from '@/lib/telegramHtml';

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

    // ─── Weekly-report review buttons ────────────────────────────────────
    //
    // Approve / Edit / Skip on the review card. Per Andy the gate is CHAT
    // membership, not the users table: the card only ever goes to the
    // configured internal review chat, so anyone who can see the buttons is
    // already trusted to decide. That deliberately differs from the /weekly
    // command gate below, which exists because those commands are reachable
    // from CLIENT chats — here the surface itself is the permission.
    if (update?.callback_query) {
      // `krd:` = listings digest, `krw:` = weekly report. Same review chat and
      // the same permission model; separate handlers because the two decide
      // over different rows.
      if (String(update.callback_query?.data ?? '').startsWith('krd:')) {
        await handleDigestCallback(update.callback_query);
      } else {
        await handleReviewCallback(update.callback_query);
      }
      return NextResponse.json({ ok: true });
    }

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

    /**
     * [2026-08-05 per Andy] Team-only gate.
     *
     * The webhook secret proves the update came from Telegram; it says nothing
     * about WHO typed. Until now any member of a client group chat could run
     * /weekly and pull a live market report on demand — the bot is added to
     * client GCs as the go-live step, so every client contact in those chats
     * had the same access the team does.
     *
     * That matters on three counts: the reports are our analysis and are meant
     * to arrive on our schedule, not on request; /weekly is an expensive live
     * data assembly anyone could trigger repeatedly; and a client seeing
     * commands work invites them to treat the bot as self-serve.
     *
     * Identity is users.telegram_id, matching resolveTeamMember in the main
     * bot's webhook — one notion of "team member" across both bots. Chat
     * membership is deliberately NOT the check: the whole problem is that
     * clients share those chats with us.
     *
     * The cross-client scoping from 2026-07-27 stays exactly as it was. It
     * answers "which client's data", and this answers "may you ask at all" —
     * a team member in Venice's chat still gets Venice, not a free pass.
     */
    const fromUserId = msg?.from?.id?.toString();
    const { data: teamMember } = fromUserId
      ? await supabase.from('users').select('id, name').eq('telegram_id', fromUserId).maybeSingle()
      : { data: null };

    if (!teamMember) {
      // Answer rather than going silent. In a client chat this reads as a
      // scoped tool, not a broken one — and a team member who simply hasn't
      // linked their Telegram gets told why instead of being left guessing.
      await sendMessage(
        chatId,
        'This bot is for the HoloHive team.\n\n' +
        '<i>On the team and seeing this? Your Telegram isn\'t linked to your HoloHive account yet — ask Andy to add it.</i>',
      ).catch(() => {});
      console.warn('[kr-signal-webhook] non-team sender rejected', { fromUserId, chatId });
      return NextResponse.json({ ok: true });
    }

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
      '/listing — this week\'s Korea listings digest (internal chats only)',
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
        // [2026-08-24, Andy] Preview the Saturday digest on demand.
        //
        // Refused in a client chat on purpose. The digest is a client
        // deliverable that now requires approval before it is sent, and a
        // command anyone could run in a client's own chat would be a way
        // around that gate — the client would simply receive it.
        case 'listing':
        case 'listings': {
          const bound = await loadClientByChatId(supabase, chatId);
          if (bound) {
            await sendMessage(chatId,
              `This is ${bound.name}'s chat. The listings digest is sent after review — ask in an internal chat for a preview.`);
            break;
          }
          await sendMessage(chatId, '⏳ Building this week\'s listings…');
          const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
          const krwListings = await fetchRecentKrwListings(supabase, since7);
          const nonKrw = await fetchRecentNonKrwListings(supabase, since7, krwListings);
          const fx = await getUsdKrw().catch(() => 0);

          // Same enrichment the cron does, so the preview is the message —
          // not an approximation of it.
          const entries: DigestEntry[] = [];
          for (const l of krwListings) {
            const entry: DigestEntry = { ...l };
            const { data: rec } = await supabase
              .from('kr_signal_listings')
              .select('listing_price_krw, day1_kr_vol, baseline_7d')
              .eq('ticker', l.symbol).eq('listed_on', l.listedOn).maybeSingle();
            const listPrice = Number((rec as any)?.listing_price_krw ?? 0);
            if (listPrice > 0) {
              const nowPrice = await getTokenKrPriceKrw(l.symbol).catch(() => 0);
              if (nowPrice > 0) entry.sinceListingPct = ((nowPrice - listPrice) / listPrice) * 100;
            }
            const day1 = Number((rec as any)?.day1_kr_vol ?? 0);
            if (day1 > 0) entry.day1KrVolKrw = day1;
            const base = Number((rec as any)?.baseline_7d ?? 0);
            if (day1 > 0 && base > 0 && fx > 0) entry.spikeMultiple = day1 / fx / base;
            entries.push(entry);
          }
          await sendMessage(chatId, buildListingsDigest(entries, krWeekLabel(new Date()), fx, nonKrw));
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

/**
 * Handle a tap on a weekly-report review card.
 *
 * callback_data is `krw:<action>:<rowId>` — the row id rather than a client
 * key or week, so a decision can never land on the wrong report even if two
 * cards are open in the chat at once.
 *
 * Every path answers the callback. Telegram spins the button until it gets an
 * ack, so a silent early return reads to the operator as a hung bot.
 */
/**
 * Handle a tap on the Saturday listings-digest card (`krd:<action>:<rowId>`).
 *
 * Same shape as the weekly handler and the same review-chat-only gate. It is
 * separate rather than merged because approving a digest fans out to several
 * clients at once, so the acknowledgement has to report how many landed —
 * "Sent to <client>" would be wrong here.
 */
/** Calendar week (Mon–Sun) the digest covers — mirrors the cron's label so a
 *  preview and the real send name the same week. */
function krWeekLabel(now: Date): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monday = new Date(now);
  const shift = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - shift);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const right = monday.getUTCMonth() === sunday.getUTCMonth()
    ? `${sunday.getUTCDate()}`
    : `${M[sunday.getUTCMonth()]} ${sunday.getUTCDate()}`;
  return `${M[monday.getUTCMonth()]} ${monday.getUTCDate()}–${right}`;
}

async function handleDigestCallback(cb: any): Promise<void> {
  const cbId: string = cb?.id;
  const data: string | undefined = cb?.data;
  const chatId = cb?.message?.chat?.id;
  if (!cbId || !data?.startsWith('krd:')) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    await answerCallbackQuery(cbId, 'Server not configured.', true);
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const reviewChatId = await getAppSetting(supabase, 'kr_signal_review_chat_id');
  if (!reviewChatId || String(chatId) !== String(reviewChatId)) {
    await answerCallbackQuery(cbId, 'These buttons only work in the review chat.', true);
    return;
  }

  const [, action, rowId] = data.split(':');
  if (!rowId) {
    await answerCallbackQuery(cbId, 'Malformed button.', true);
    return;
  }

  const from = cb?.from ?? {};
  const actorName: string =
    [from.first_name, from.last_name].filter(Boolean).join(' ') ||
    from.username ||
    (from.id ? `TG ${from.id}` : 'Unknown');
  const { data: teamUser } = from.id
    ? await supabase.from('users').select('id').eq('telegram_id', String(from.id)).maybeSingle()
    : { data: null };
  const actor = { name: actorName, userId: (teamUser as any)?.id ?? null };

  try {
    if (action === 'approve') {
      const res = await approveAndSendDigest(supabase, rowId, actor);
      if (res.ok) {
        await answerCallbackQuery(cbId,
          res.failed ? `Sent to ${res.delivered}, ${res.failed} failed.` : `Sent to ${res.delivered}.`);
      } else if (res.alreadyDecided) {
        await answerCallbackQuery(cbId, `Already ${res.alreadyDecided}.`, true);
      } else {
        await answerCallbackQuery(cbId, res.error ?? 'Could not send.', true);
      }
      return;
    }
    if (action === 'skip') {
      const res = await skipDigest(supabase, rowId, actor);
      await answerCallbackQuery(cbId,
        res.ok ? 'Skipped — nothing sent.'
          : res.alreadyDecided ? `Already ${res.alreadyDecided}.` : (res.error ?? 'Could not skip.'),
        !res.ok);
      return;
    }
    await answerCallbackQuery(cbId, 'Unknown action.', true);
  } catch (e: any) {
    await answerCallbackQuery(cbId, `Failed: ${(e && e.message) || String(e)}`, true);
  }
}

async function handleReviewCallback(cb: any): Promise<void> {
  const cbId: string = cb?.id;
  const data: string | undefined = cb?.data;
  const chatId = cb?.message?.chat?.id;
  if (!cbId || !data?.startsWith('krw:')) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    await answerCallbackQuery(cbId, 'Server not configured.', true);
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Only the configured review chat may decide. Without this the buttons
  // would be actionable by anyone who could forward the card elsewhere.
  const reviewChatId = await getAppSetting(supabase, 'kr_signal_review_chat_id');
  if (!reviewChatId || String(chatId) !== String(reviewChatId)) {
    await answerCallbackQuery(cbId, 'These buttons only work in the review chat.', true);
    return;
  }

  const [, action, rowId] = data.split(':');
  if (!rowId) {
    await answerCallbackQuery(cbId, 'Malformed button.', true);
    return;
  }

  // Name the actor for the audit line. They may have no HHP account — chat
  // membership is the permission — so fall back through what Telegram gives us.
  const from = cb?.from ?? {};
  const actorName: string =
    [from.first_name, from.last_name].filter(Boolean).join(' ') ||
    from.username ||
    (from.id ? `TG ${from.id}` : 'Unknown');
  const { data: teamUser } = from.id
    ? await supabase.from('users').select('id').eq('telegram_id', String(from.id)).maybeSingle()
    : { data: null };
  const actor = { name: actorName, userId: (teamUser as any)?.id ?? null };

  const row = await getWeeklyReviewById(supabase, rowId);
  if (!row) {
    await answerCallbackQuery(cbId, 'That report no longer exists.', true);
    return;
  }
  const cfg = await loadClientById(supabase, row.client_id);
  const clientName = cfg?.name ?? 'client';

  try {
    if (action === 'approve') {
      const res = await approveAndSend(supabase, rowId, actor);
      if (res.ok) {
        await answerCallbackQuery(cbId, `Sent to ${clientName}.`);
      } else if (res.alreadyDecided) {
        await answerCallbackQuery(cbId, `Already ${res.alreadyDecided} — nothing to do.`, true);
      } else {
        await answerCallbackQuery(cbId, `Could not send: ${res.error}`, true);
      }
      return;
    }

    if (action === 'skip') {
      const res = await skipReport(supabase, rowId, actor);
      await answerCallbackQuery(
        cbId,
        res.ok ? `Skipped — ${clientName} gets nothing this week.`
               : res.alreadyDecided ? `Already ${res.alreadyDecided}.` : `Failed: ${res.error}`,
        !res.ok,
      );
      return;
    }

    if (action === 'edit') {
      // Editing happens in HHP, not here: the report body is a monospace
      // block whose alignment matters, and Telegram has no good way to hand
      // back a multi-line edit. The card keeps its buttons so the same person
      // can approve straight from the chat once they have edited.
      await answerCallbackQuery(cbId, 'Opening in HHP — link posted below.');
      // Deep-link by the HHP client id, not kr_signal_clients.id: the dialog's
      // client picker is keyed to clients.id. Falling back to a bare open is
      // better than a link that lands on the wrong client.
      const url = cfg?.client_id
        ? `${baseUrl()}/clients?krSignal=${cfg.client_id}`
        : `${baseUrl()}/clients`;
      await sendMessage(
        chatId,
        `✏️ <b>Edit ${escapeHtml(clientName)} — week ending ${escapeHtml(row.week_ending)}</b>\n` +
        `Open Korea Signal settings to edit the copy, then approve here or send from there:\n` +
        `${escapeHtml(url)}`,
      ).catch(() => {});
      return;
    }

    await answerCallbackQuery(cbId, 'Unknown action.', true);
  } catch (e: any) {
    await answerCallbackQuery(cbId, `Error: ${String(e?.message || e)}`, true);
  }
}

/** Public base URL for deep links back into HHP. */
function baseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'kr-signal-telegram webhook' });
}
