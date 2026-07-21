import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatDate, formatDateTime } from '@/lib/dateFormat';
import { extractAddressCandidate, hasValidChecksumIfMixed, isValidEvmAddress, toChecksumAddress } from '@/lib/walletAddress';
import { createApprovedContentsRow } from '@/lib/contentSubmissionApproval';
import { ensureKolDeliverable } from '@/lib/kolDeliverableAutoAdd';
import { triggerKolScan } from '@/lib/githubActions';
import { getCampaignWeek } from '@/lib/campaignWeekHelpers';
import { classifyReply, isFridayUTC, pulseDateFor, PULSE_CUTOFF_HOUR_UTC } from '@/lib/dailyPulse';

export const dynamic = 'force-dynamic';
// Audit H5: give handlers headroom so a slow update finishes and returns 200
// before Telegram's retry timer fires (the default ~10s could 504 mid-work and
// trigger a duplicate delivery).
export const maxDuration = 60;

// Use service role for webhook (no user auth context)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Telegram webhook secret for verification (optional but recommended)
import { acceptedWebhookSecrets } from '@/lib/telegramWebhookSecret';
import { escapeHtml } from '@/lib/telegramHtml';
import { getTemplate, renderTemplate } from '@/lib/messageTemplates';

// Content thread in HH Operations for KOL social links
const CONTENT_THREAD_CHAT_ID = '-1002636253963';
const CONTENT_THREAD_ID = 4280;

/**
 * Telegram Webhook Endpoint
 * POST /api/telegram/webhook
 *
 * Receives updates from Telegram when messages are sent in group chats.
 * Updates the corresponding CRM opportunity's last_message_at field.
 */
export async function POST(request: NextRequest) {
  try {
    // [2026-07-05 AUDIT-FIX] Fail-closed webhook verification. Previously
    // the check was skipped entirely when TELEGRAM_WEBHOOK_SECRET was unset
    // (which it was in prod) — any anonymous POST with a forged update
    // payload could drive the bot. Now the header must match one of the
    // accepted secrets (configured env var OR sha256(bot token) fallback —
    // see lib/telegramWebhookSecret.ts). The webhook is registered with
    // the same derived secret, so Telegram always passes.
    const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    const acceptedSecrets = acceptedWebhookSecrets();
    if (!secretToken || !acceptedSecrets.includes(secretToken)) {
      console.error('[Telegram Webhook] Missing or invalid secret token');
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await request.json();

    // Audit H5: idempotency guard. Telegram re-delivers an update whenever it
    // doesn't get a prompt 200, so without this a slow /submit, /wallet, /done
    // or PSG completion could run twice (double insert / double side-effect).
    // Claim the update_id first; if it's already recorded, ack and stop.
    const updateId = update?.update_id;
    if (typeof updateId === 'number') {
      const { error: dupErr } = await (supabaseAdmin as any)
        .from('telegram_processed_updates')
        .insert({ update_id: updateId });
      if (dupErr) {
        if ((dupErr as any).code === '23505') {
          console.log('[Telegram Webhook] Duplicate update_id, skipping:', updateId);
          return NextResponse.json({ ok: true, deduped: true });
        }
        // A ledger hiccup shouldn't drop a real update — log and continue.
        console.error('[Telegram Webhook] dedup ledger insert failed:', dupErr);
      }
    }

    // Log incoming update for debugging
    console.log('[Telegram Webhook] Received update:', JSON.stringify(update, null, 2));

    // Handle message updates
    if (update.message) {
      await handleMessage(update.message);
    }

    // Handle edited messages too
    if (update.edited_message) {
      // Don't update timestamp for edits, just acknowledge
      console.log('[Telegram Webhook] Edited message ignored');
    }

    // Handle bot membership changes (added / removed / promoted in a chat).
    // Without this, a brand-new group only appears in CRM → Telegram once
    // someone posts a message the bot can see. With it, the row is created
    // the moment the bot joins — so users see the chat immediately and can
    // link it to an opportunity before the first message arrives.
    if (update.my_chat_member) {
      await handleMyChatMember(update.my_chat_member);
    }

    // Handle inline-keyboard button clicks. /task uses these for the
    // ✅ Create / ❌ Cancel confirm flow; routed by callback_data prefix
    // so we can add more interactive features without restructuring.
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    // Telegram expects a 200 OK response
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Telegram Webhook] Error processing update:', error);
    // Fire an operational alert so silent webhook breakage doesn't go
    // unnoticed. Without this, Telegram thinks every update succeeded
    // (we always return 200) and the team only finds out something is
    // wrong when chats stop appearing in CRM. Fire-and-forget — never
    // block the response or cascade.
    try {
      const { fireIntelligenceAlert } = await import('@/lib/intelligenceAlerts');
      fireIntelligenceAlert('cron_failed', {
        run_type: 'Telegram webhook',
        error_message: typeof error?.message === 'string'
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500),
        triggered_at: new Date().toISOString(),
      }).catch(() => {/* swallow — alert dispatch failure shouldn't cascade */});
    } catch {
      // import failure or missing config — log and move on
    }
    // Still return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  }
}

/**
 * Send a message to a Telegram chat.
 *
 * threadId: when provided, posts the message into a forum-topic
 * thread within the chat. REQUIRED for replies to commands typed
 * inside topics (supergroups with topics enabled) — without it,
 * the response falls back to the supergroup's General feed instead
 * of the topic the user is in. Every command handler should pull
 * this from `message.message_thread_id` (or `cq.message.message_thread_id`
 * for callbacks) and pass it through.
 */
async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
  threadId?: number,
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[Telegram Webhook] Bot token not configured');
    return false;
  }

  try {
    const body: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    };
    if (threadId) body.message_thread_id = threadId;
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Telegram Webhook] Send message error:', error);
      return false;
    }

    console.log('[Telegram Webhook] Sent reply to chat:', chatId, threadId ? `(thread ${threadId})` : '');
    // Return the sent message_id (a positive int, so still truthy for the
    // many callers that only check truthiness) so callers that need to edit
    // the message later can capture it. Falls back to `true` if absent.
    const data = await response.json().catch(() => null);
    return (data?.result?.message_id as number | undefined) ?? true;
  } catch (error) {
    console.error('[Telegram Webhook] Error sending message:', error);
    return false;
  }
}

/**
 * Send a photo with caption to a Telegram chat.
 * threadId behavior matches sendTelegramMessage — see comment there.
 */
async function sendTelegramPhoto(
  chatId: string,
  photoUrl: string,
  caption: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
  threadId?: number,
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[Telegram Webhook] Bot token not configured');
    return false;
  }

  try {
    const body: Record<string, any> = {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: parseMode,
    };
    if (threadId) body.message_thread_id = threadId;
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Telegram Webhook] Send photo error:', error);
      return false;
    }

    console.log('[Telegram Webhook] Sent photo to chat:', chatId, threadId ? `(thread ${threadId})` : '');
    return true;
  } catch (error) {
    console.error('[Telegram Webhook] Error sending photo:', error);
    return false;
  }
}

/**
 * Send a message to a Telegram chat with thread support
 */
async function sendTelegramMessageToThread(chatId: string, threadId: number, text: string, parseMode: 'HTML' | 'Markdown' | '' = '') {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[Telegram Webhook] Bot token not configured');
    return false;
  }

  try {
    const payload: any = {
      chat_id: chatId,
      message_thread_id: threadId,
      text
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Telegram Webhook] Send message to thread error:', error);
      return false;
    }

    console.log('[Telegram Webhook] Sent message to thread:', { chatId, threadId });
    return true;
  } catch (error) {
    console.error('[Telegram Webhook] Error sending message to thread:', error);
    return false;
  }
}

/**
 * Detect and extract Telegram/Twitter links from text
 */
function extractSocialLinks(text: string): { telegram: string[]; twitter: string[] } {
  const telegramRegex = /(https?:\/\/)?(t\.me|telegram\.me)\/[^\s]+/gi;
  const twitterRegex = /(https?:\/\/)?(twitter\.com|x\.com)\/[^\s]+/gi;

  const telegramMatches = text.match(telegramRegex) || [];
  const twitterMatches = text.match(twitterRegex) || [];

  return {
    telegram: telegramMatches.map(url => url.startsWith('http') ? url : `https://${url}`),
    twitter: twitterMatches.map(url => url.startsWith('http') ? url : `https://${url}`)
  };
}

/**
 * Forward social links from KOL chats to the Content thread
 */
async function forwardKolSocialLinks(
  chatId: string,
  chatTitle: string | undefined,
  fromName: string,
  messageText: string,
  messageDate: Date
) {
  try {
    // Check if this chat is linked to a KOL
    const { data: chat, error } = await supabaseAdmin
      .from('telegram_chats')
      .select('master_kol_id, title, master_kols:master_kol_id(name)')
      .eq('chat_id', chatId)
      .single();

    if (error || !chat || !chat.master_kol_id) {
      // Not a KOL-linked chat, skip
      return;
    }

    // Extract social links from the message
    const links = extractSocialLinks(messageText);
    const hasLinks = links.telegram.length > 0 || links.twitter.length > 0;

    if (!hasLinks) {
      return;
    }

    // Format the notification message
    const kolName = (chat.master_kols as any)?.name || 'Unknown KOL';
    const chatName = chat.title || chatTitle || 'Unknown Chat';
    const dateStr = formatDate(messageDate);

    let message = `🔗 New KOL Link Detected\n\n`;
    message += `KOL: ${kolName}\n`;
    message += `Chat: ${chatName}\n`;
    message += `From: ${fromName}\n`;
    message += `Date: ${dateStr}\n\n`;

    if (links.telegram.length > 0) {
      message += `📱 Telegram:\n`;
      links.telegram.forEach(link => {
        message += `${link}\n`;
      });
    }

    if (links.twitter.length > 0) {
      if (links.telegram.length > 0) message += `\n`;
      message += `𝕏 Twitter/X:\n`;
      links.twitter.forEach(link => {
        message += `${link}\n`;
      });
    }

    // Send to Content thread
    await sendTelegramMessageToThread(CONTENT_THREAD_CHAT_ID, CONTENT_THREAD_ID, message);
    console.log('[Telegram Webhook] Forwarded KOL social links to Content thread:', { kolName, links });
  } catch (error) {
    console.error('[Telegram Webhook] Error forwarding KOL social links:', error);
    // Non-critical, don't throw
  }
}

/**
 * Handle bot commands - reads from database
 */
async function handleCommand(chatId: string, command: string, args: string[], message: any) {
  // Remove leading slash and bot mention
  const cmd = command.toLowerCase().replace(/^\//, '').replace('@holo_hive_bot', '');

  // Forum-topic thread ID — undefined for plain chats / supergroup
  // General. Every reply below threads through this so responses land
  // back in the topic the command came from, not the supergroup's
  // main feed. Single extraction here; sub-handlers re-extract from
  // the message they receive (kept consistent for clarity).
  const replyThreadId: number | undefined = message.message_thread_id || undefined;

  // Built-in /test command - sends chat ID and thread ID to Andy Lee
  if (cmd === 'test') {
    const ANDY_LEE_TELEGRAM_ID = '6281931733';
    const threadId = message.message_thread_id || null;
    const chatType = message.chat?.type || 'unknown';
    const chatTitle = message.chat?.title || 'Private Chat';
    const fromUser = message.from?.first_name || message.from?.username || 'Unknown';

    const response = `<b>🔧 /test Command Triggered</b>\n\n` +
      `<b>Chat ID:</b> <code>${chatId}</code>\n` +
      `<b>Thread ID:</b> <code>${threadId || 'N/A (not a forum topic)'}</code>\n` +
      `<b>Chat Type:</b> ${chatType}\n` +
      `<b>Chat Title:</b> ${chatTitle}\n` +
      `<b>Triggered by:</b> ${fromUser}`;

    // Send to Andy Lee's DM (no threadId — DMs don't have topics).
    await sendTelegramMessage(ANDY_LEE_TELEGRAM_ID, response);

    // Send confirmation in the original chat (in topic if applicable).
    await sendTelegramMessage(chatId, '✅ Chat info sent to Andy Lee.', 'HTML', replyThreadId);

    console.log('[Telegram Webhook] Executed /test command:', { chatId, threadId, sentTo: 'Andy Lee' });
    return;
  }

  // Built-in /done <id> command — close a task from chat without
  // opening /tasks. Hardcoded (not in telegram_commands) because it
  // mutates rows; the DB-backed commands are static-text only.
  // Format: /done T-042   (also accepts: t-042, T 042, 042)
  if (cmd === 'done') {
    await handleDoneCommand(chatId, args, message);
    return;
  }

  // Built-in /task <natural language> command — AI-parses the body
  // into a structured task, posts a preview with confirm buttons, and
  // creates the task on ✅ click. Same team-only gate as /done.
  if (cmd === 'task') {
    await handleTaskCommand(chatId, message);
    return;
  }

  // Built-in /tasks command — lists open tasks with one-tap done
  // buttons so users don't have to remember T-NNN IDs. Subcommands:
  //   /tasks          — your assigned, open tasks (default)
  //   /tasks all      — every team member's open tasks
  //   /tasks overdue  — your overdue (or all if combined with all)
  if (cmd === 'tasks') {
    await handleTasksCommand(chatId, args, message);
    return;
  }

  // Built-in /bulk command — multi-task, multi-client batch creator.
  // Paste a structured weekly-rollout-style message and the bot
  // parses it into N tasks across the right clients with one confirm
  // step. See lib/bulkTaskParser.ts for the parse contract.
  if (cmd === 'bulk') {
    await handleBulkCommand(chatId, message);
    return;
  }

  // Built-in /bug + /req commands — HHP Backlog Tab capture.
  // Per the Backlog Tab spec (Jdot, 2026-06-08), report a bug or
  // request from any chat. Captures sender as reporter, message link
  // as source_ref, and any attached/replied screenshot as an
  // attachment. Replies in-thread with a link to the new item.
  if (cmd === 'bug' || cmd === 'req') {
    await handleBacklogCommand(chatId, cmd === 'bug' ? 'bug' : 'request', message);
    return;
  }

  // [2026-06-11] /submit <link> — KOL content submission per Andy's spec
  // decisions: use existing campaign_kols, master_kols.telegram_id mapping,
  // 👍 reaction on approval. KOL-only command (the only KOL command in the
  // bot today). See handleSubmitCommand for the flow + edge cases.
  if (cmd === 'submit') {
    await handleSubmitCommand(chatId, args, message);
    return;
  }

  // [2026-06-16] /wallet <addr> — KOL payout-wallet capture per the
  // HHP /wallet Command spec (Jdot v3). Fires in the KOL's group chat;
  // resolves chat → KOL via telegram_chats.master_kol_id and writes
  // master_kols.wallet. EIP-55 normalized. Per spec § 2.2 NOT gated
  // against the team — whoever sends a valid address in a KOL's chat
  // sets that KOL's wallet (settlement is trust-based).
  if (cmd === 'wallet') {
    await handleWalletCommand(chatId, args, message);
    return;
  }

  // [2026-06-29] /repost yes|no — KOL opt-in for repost (forwarding)
  // deals. Same trust model as /wallet: whoever sends in the KOL's
  // group chat sets that KOL's status (no anti-spoof, settlement is
  // trust-based). Writes master_kols.forwarding_eligible. Mid-deal
  // changes only affect future broadcasts — the Forwarding Deal Bot
  // locks its eligible list at launch.
  if (cmd === 'repost') {
    await handleRepostCommand(chatId, args, message);
    return;
  }

  try {
    // Look up command in database
    const { data: commandData, error } = await supabaseAdmin
      .from('telegram_commands')
      .select('response, image_url, team_only')
      .eq('command', cmd)
      .eq('is_active', true)
      .single();

    if (error || !commandData) {
      console.log('[Telegram Webhook] Unknown command:', cmd);
      return;
    }

    // Check if command is team-only
    if (commandData.team_only) {
      const fromUserId = message.from?.id?.toString();

      if (!fromUserId) {
        console.log('[Telegram Webhook] Team-only command rejected: no user ID');
        await sendTelegramMessage(chatId, 'This command is only available to team members.', 'HTML', replyThreadId);
        return;
      }

      // Check if the user's telegram_id is in the users table (team member)
      const { data: teamMember, error: teamError } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .eq('telegram_id', fromUserId)
        .single();

      if (teamError || !teamMember) {
        console.log('[Telegram Webhook] Team-only command rejected: user not a team member', fromUserId);
        await sendTelegramMessage(chatId, 'This command is only available to team members.', 'HTML', replyThreadId);
        return;
      }

      console.log('[Telegram Webhook] Team-only command authorized for:', teamMember.name);
    }

    // Send photo with caption if image_url exists, otherwise just send message
    if (commandData.image_url) {
      await sendTelegramPhoto(chatId, commandData.image_url, commandData.response, 'HTML', replyThreadId);
    } else {
      await sendTelegramMessage(chatId, commandData.response, 'HTML', replyThreadId);
    }
    console.log('[Telegram Webhook] Executed command:', cmd);
  } catch (error) {
    console.error('[Telegram Webhook] Error handling command:', error);
  }
}

/**
 * Handle the /done <task-id> slash command.
 *
 * Closes a task from Telegram so an operator can mark something done
 * without leaving the chat. Lookup is by short_id (T-042 style, added
 * in migration 066). Only authenticated team members may use it — we
 * gate on users.telegram_id, same pattern as the team_only DB commands.
 *
 * Accepted formats:
 *   /done T-042
 *   /done t-042
 *   /done 42      (numeric, padded to T-042)
 *
 * Replies in-chat with success / not-found / already-complete / not
 * authorized. Errors are logged but never throw — the webhook contract
 * is "always 200 to Telegram so it doesn't retry".
 */
async function handleDoneCommand(chatId: string, args: string[], message: any) {
  // Pull thread first — every reply below needs to land in the topic
  // the command came from (not the supergroup's main feed).
  const threadId: number | undefined = message.message_thread_id || undefined;

  const teamMember = await resolveTeamMember(message);
  if (!teamMember) {
    await sendTelegramMessage(chatId, '⚠️ /done is only available to team members.', 'HTML', threadId);
    return;
  }

  const raw = args.join(' ').trim();
  if (!raw) {
    await sendTelegramMessage(chatId, 'Usage: <code>/done T-042</code> or <code>/done bump daniel</code>', 'HTML', threadId);
    return;
  }

  // Two parse paths:
  //   1. T-NNN style (or bare numeric) — exact lookup by short_id.
  //      Same as the original behavior; no AI, no fuzz.
  //   2. Anything else — fuzzy substring search against open task
  //      names. 0 matches → "not found", 1 match → close it,
  //      >1 → render picker buttons. Lets people type "bump daniel"
  //      when they remember the topic but not the ID.
  const numericOnly = raw.replace(/[^0-9]/g, '');
  const looksLikeId = /^t-?\d+$/i.test(raw) || /^\d+$/.test(raw);
  if (looksLikeId) {
    const shortId = `T-${numericOnly.padStart(3, '0')}`;
    await closeByShortIdAndReply(chatId, shortId, teamMember, threadId);
    return;
  }

  // Fuzzy path. Search OPEN tasks only — closing an already-complete
  // task isn't useful and the picker for an arbitrary substring
  // could otherwise return dozens of historical matches.
  const { data: matches } = await (supabaseAdmin as any)
    .from('tasks')
    .select('id, short_id, task_name, due_date, assigned_to_name')
    .ilike('task_name', `%${raw}%`)
    .neq('status', 'complete')
    .limit(6) // cap at 6 so the picker stays scannable
    .order('due_date', { ascending: true, nullsFirst: false });

  const rows = (matches || []) as Array<{
    id: string; short_id: string | null; task_name: string;
    due_date: string | null; assigned_to_name: string | null;
  }>;

  if (rows.length === 0) {
    await sendTelegramMessage(chatId, `🤷 No open task matching <code>${escapeHtml(raw)}</code>.`, 'HTML', threadId);
    return;
  }

  if (rows.length === 1) {
    const t = rows[0];
    await closeByDbIdAndReply(chatId, t.id, teamMember, threadId);
    return;
  }

  // Multiple matches — render picker buttons. Same `done:<id>`
  // callback prefix as the /tasks list buttons; one handler closes
  // both flows.
  const pickerLines = ['Multiple open tasks match — which one?'];
  const buttons = rows.map((t) => [{
    text: truncateButton(`${t.short_id || ''} ${t.task_name}${t.due_date ? ` · ${shortDueLabel(t.due_date)}` : ''}`.trim()),
    callback_data: `done:${t.id}`,
  }]);
  await sendTelegramMessageWithButtons(chatId, pickerLines.join('\n'), buttons, threadId);
}

/**
 * Close a task by its short_id + send the response message. Used by
 * the exact-ID path of /done. Wraps closeByDbId for the lookup.
 */
async function closeByShortIdAndReply(
  chatId: string,
  shortId: string,
  teamMember: { id: string; name: string },
  threadId?: number,
) {
  const { data: task, error: taskErr } = await (supabaseAdmin as any)
    .from('tasks')
    .select('id, short_id, task_name, status')
    .eq('short_id', shortId)
    .maybeSingle();
  if (taskErr) {
    console.error('[Telegram /done] task lookup failed:', taskErr);
    await sendTelegramMessage(chatId, '⚠️ Lookup failed. Try again or close it from /tasks.', 'HTML', threadId);
    return;
  }
  if (!task) {
    await sendTelegramMessage(chatId, `🤷 No task with ID <code>${escapeHtml(shortId)}</code>.`, 'HTML', threadId);
    return;
  }
  if (task.status === 'complete') {
    await sendTelegramMessage(chatId, `✅ <code>${escapeHtml(shortId)}</code> was already complete.`, 'HTML', threadId);
    return;
  }
  await closeByDbIdAndReply(chatId, task.id, teamMember, threadId);
}

/**
 * Close a task by its DB UUID + send the success message. Pure
 * worker — caller has already validated the task should be closed.
 *
 * Mirrors the side-effects of taskService.updateField('status',
 * 'complete') since we're using the service-role client directly:
 * sets completed_at + updated_at. The recurring-clone and parent-
 * deliverable rollup logic stays in taskService — not worth
 * re-implementing here. If a recurring task is closed from chat the
 * next instance gets cloned the next time someone closes it from
 * the web UI; acceptable for v1.
 */
async function closeByDbIdAndReply(
  chatId: string,
  taskDbId: string,
  teamMember: { id: string; name: string },
  threadId?: number,
) {
  // [2026-06-11] Pull client_id too so we can route client-linked tasks
  // through the Pre-Ship Gate. Non-client tasks fall through to the
  // straight close like before.
  const { data: task, error: fetchErr } = await (supabaseAdmin as any)
    .from('tasks')
    .select('id, short_id, task_name, status, client_id')
    .eq('id', taskDbId)
    .maybeSingle();
  if (fetchErr || !task) {
    await sendTelegramMessage(chatId, '⚠️ Task not found.', 'HTML', threadId);
    return;
  }
  if (task.status === 'complete') {
    await sendTelegramMessage(
      chatId,
      `✅ <code>${escapeHtml(task.short_id || taskDbId)}</code> was already complete.`,
      'HTML',
      threadId,
    );
    return;
  }

  // [2026-06-11] Pre-Ship Gate intercept per Jdot's spec — when the
  // task has a client linked, send the 5-item checklist + Confirm/Go
  // Back inline buttons instead of closing. Internal tasks complete
  // normally (no gate). See sendPreShipGatePrompt for the message
  // shape and callback contract.
  if (task.client_id) {
    await sendPreShipGatePrompt(chatId, task, teamMember, threadId);
    return;
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await (supabaseAdmin as any)
    .from('tasks')
    .update({ status: 'complete', completed_at: nowIso, updated_at: nowIso })
    .eq('id', taskDbId);
  if (updErr) {
    console.error('[Telegram /done] update failed:', updErr);
    await sendTelegramMessage(chatId, '⚠️ Update failed. Try again or close it from /tasks.', 'HTML', threadId);
    return;
  }
  const safeName = escapeHtml(task.task_name || '(untitled task)');
  const closer = escapeHtml(teamMember.name || 'team');
  await sendTelegramMessage(
    chatId,
    `✅ <b>${escapeHtml(task.short_id || '')}</b> ${safeName}\n<i>closed by ${closer}</i>`,
    'HTML',
    threadId,
  );
  console.log('[Telegram Webhook] /done closed task:', { taskDbId, shortId: task.short_id, by: teamMember.name });
}

/**
 * [2026-06-11] Pre-Ship Gate prompt — sent when /done resolves a
 * client-linked task. Spec: "the bot lists all 5 items, then shows
 * [Confirm & Complete] and [Go Back] as inline buttons."
 *
 * Why a single Confirm (not 5 individual checkboxes): TG inline
 * buttons don't support stateful checkbox UI. The chat-side version
 * is necessarily simpler — the user reads + attests via one tap, and
 * the gate log stores all 5 as true (the attestation IS the gate
 * pass).
 *
 * Permission: callback_data includes the triggering user's Telegram
 * id so only they can tap (per spec). Expiry: callbacks check the
 * message_date (10-min cap).
 */
async function sendPreShipGatePrompt(
  chatId: string,
  task: { id: string; short_id: string | null; task_name: string },
  teamMember: { id: string; name: string },
  threadId?: number,
) {
  // We need the triggering user's TG ID for the per-user button gate.
  // teamMember is the resolved internal user; the TG id is on the
  // /done caller's `message.from.id`. We get it via resolveTeamMember
  // again — same source as the caller's. Cheap second lookup.
  const { data: user } = await (supabaseAdmin as any)
    .from('users')
    .select('telegram_id')
    .eq('id', teamMember.id)
    .maybeSingle();
  const tgUserId = (user as any)?.telegram_id || '';

  // The 5 items, verbatim from the spec doc. Kept in sync with the
  // HQ modal's PRE_SHIP_GATE_CHECKBOXES — if those change in the spec,
  // change both.
  const items = [
    '1. I read the request, not skimmed it.',
    '2. If the client saw this right now, it would work + make sense.',
    "3. I can point to one campaign-specific insight, not just the client's name.",
    '4. Execution is clean — spelling, links, data, formatting.',
    '5. The client could NOT get this from AI in 5 minutes.',
  ];
  const headerLine = `🛡 <b>Pre-Ship Gate</b> — <code>${escapeHtml(task.short_id || '')}</code> ${escapeHtml(task.task_name || '')}`;
  const body = [
    headerLine,
    '',
    'Before closing this client-linked task, confirm all 5:',
    '',
    ...items,
    '',
    '<i>Tap Confirm only if all 5 are true. Buttons expire in 10 min.</i>',
  ].join('\n');

  const buttons = [
    [
      { text: '✅ Confirm & Complete', callback_data: `psg:confirm:${task.id}:${tgUserId}` },
      { text: '↩ Go Back', callback_data: `psg:cancel:${task.id}:${tgUserId}` },
    ],
  ];

  await sendTelegramMessageWithButtons(chatId, body, buttons, threadId);
}

/**
 * Handle a `psg:<action>:<task_id>:<user_id>` button click.
 *
 * Action = 'confirm' → write gate log row (all 5 true, via_source='tg'),
 *   flip status to complete, edit the prompt message to "Done · {task}".
 * Action = 'cancel'  → edit the prompt message to "Cancelled" and don't
 *   touch the task status.
 *
 * Permission per spec: only the user who triggered /done can tap.
 * Expiry per spec: 10 minutes after the prompt was sent.
 */
async function handlePsgCallback(cq: any) {
  const callbackId: string = cq.id;
  const data: string = cq.data || '';
  const messageChatId = cq.message?.chat?.id?.toString();
  const messageId = cq.message?.message_id;
  const messageDate: number | undefined = cq.message?.date; // Unix seconds
  const threadId: number | undefined = cq.message?.message_thread_id || undefined;

  const parts = data.split(':');
  if (parts.length < 4 || !messageChatId || !messageId) {
    await answerCallbackQuery(callbackId, 'Invalid button.');
    return;
  }
  const action = parts[1]; // 'confirm' | 'cancel'
  const taskDbId = parts[2];
  const triggeringTgUserId = parts[3];

  // Permission: only the user who triggered /done can tap.
  const tapperTgUserId = cq.from?.id?.toString();
  if (!tapperTgUserId || tapperTgUserId !== triggeringTgUserId) {
    await answerCallbackQuery(callbackId, 'Only the user who triggered /done can tap these.');
    return;
  }

  // Expiry: 10 minutes from when the message was sent.
  const TEN_MIN_SEC = 10 * 60;
  if (messageDate && Date.now() / 1000 - messageDate > TEN_MIN_SEC) {
    await answerCallbackQuery(callbackId, 'Expired. Send /done again.');
    await editMessageText(
      messageChatId,
      messageId,
      '⌛ <i>Pre-Ship Gate expired. Send <code>/done</code> again to retry.</i>',
    );
    return;
  }

  const teamMember = await resolveTeamMember(cq);
  if (!teamMember) {
    await answerCallbackQuery(callbackId, 'Team-only.');
    return;
  }

  if (action === 'cancel') {
    await editMessageText(
      messageChatId,
      messageId,
      '↩ <i>Pre-Ship Gate cancelled. Task stays open.</i>',
    );
    await answerCallbackQuery(callbackId, 'Cancelled.');
    return;
  }

  if (action !== 'confirm') {
    await answerCallbackQuery(callbackId, 'Unknown action.');
    return;
  }

  // Confirm path — fetch task, write log, flip status, edit message.
  const { data: task } = await (supabaseAdmin as any)
    .from('tasks')
    .select('id, short_id, task_name, status')
    .eq('id', taskDbId)
    .maybeSingle();
  if (!task) {
    await answerCallbackQuery(callbackId, 'Task not found.');
    return;
  }
  if (task.status === 'complete') {
    await editMessageText(
      messageChatId,
      messageId,
      `✅ <i>${escapeHtml(task.short_id || taskDbId)} was already complete.</i>`,
    );
    await answerCallbackQuery(callbackId, 'Already complete.');
    return;
  }

  // Write the gate log row (all 5 true via TG attestation).
  const { error: logErr } = await (supabaseAdmin as any)
    .from('pre_ship_gate_log')
    .insert({
      task_id: taskDbId,
      completed_by: teamMember.id,
      completed_by_name: teamMember.name,
      via_source: 'tg',
      check_1_read_not_skimmed: true,
      check_2_makes_sense_to_client: true,
      check_3_campaign_specific_insight: true,
      check_4_clean_execution: true,
      check_5_not_ai_replaceable: true,
    });
  if (logErr) {
    console.error('[Telegram PSG] log insert failed:', logErr);
    await answerCallbackQuery(callbackId, 'Log failed. Try again.');
    return;
  }

  // Flip status.
  const nowIso = new Date().toISOString();
  const { error: updErr } = await (supabaseAdmin as any)
    .from('tasks')
    .update({ status: 'complete', completed_at: nowIso, updated_at: nowIso })
    .eq('id', taskDbId);
  if (updErr) {
    console.error('[Telegram PSG] update failed after log write:', updErr);
    await answerCallbackQuery(callbackId, 'Update failed.');
    return;
  }

  const safeName = escapeHtml(task.task_name || '(untitled task)');
  const closer = escapeHtml(teamMember.name || 'team');
  await editMessageText(
    messageChatId,
    messageId,
    `✅ <b>${escapeHtml(task.short_id || '')}</b> ${safeName}\n<i>closed by ${closer} · gate passed</i>`,
  );
  await answerCallbackQuery(callbackId);
  console.log('[Telegram Webhook] PSG passed + task closed:', { taskDbId, by: teamMember.name });
}

/**
 * Resolve the calling user to a team-member row via users.telegram_id.
 * Returns null when the sender isn't on the team. Used by every
 * write-capable command (/done, /task, /tasks).
 */
async function resolveTeamMember(message: any): Promise<{ id: string; name: string } | null> {
  const fromUserId = message.from?.id?.toString();
  if (!fromUserId) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('telegram_id', fromUserId)
    .single();
  if (!data) return null;
  return { id: (data as any).id, name: (data as any).name };
}

/**
 * [2026-06-11] resolveCaller — the auth seam for the TG bot. The original
 * `resolveTeamMember` only checked `users.telegram_id`; KOLs are stored in
 * `master_kols` (data objects, not auth users), so the bot needs to check
 * both tables to figure out who's typing.
 *
 * Returns:
 *   { kind: 'team', id, name, tgUserId }  — sender is on the HoloHive team
 *   { kind: 'kol',  id, name, tgUserId }  — sender is a KOL we know about
 *   { kind: 'unknown', tgUserId }         — random Telegram user, reject
 *
 * Every handler explicitly declares which kinds it accepts. Existing
 * team-only commands (`/done`, `/task`, `/tasks`, `/bulk`, `/bug`, `/req`)
 * keep using `resolveTeamMember` (no behavior change). The new `/submit`
 * uses `resolveCaller` and accepts `kind === 'kol'` only.
 *
 * Why not consolidate: every existing call site is fine. Refactoring 6
 * handlers to use the new helper just to enforce a contract they already
 * satisfy is churn for churn's sake.
 */
type ResolvedCaller =
  | { kind: 'team'; id: string; name: string; tgUserId: string }
  | { kind: 'kol';  id: string; name: string; tgUserId: string; chatId: string }
  | { kind: 'unknown'; tgUserId: string | null };

/**
 * [2026-06-12 v0.4.2] Refactored per Andy's clarification: KOL identity
 * resolves via the per-KOL TG GROUP CHAT (the same chats tracked on the
 * /crm/telegram page), not via a DM bot with master_kols.telegram_id.
 *
 * Lookup precedence:
 *   1. Team check — message sender's TG user_id matches users.telegram_id
 *   2. KOL group chat — the CHAT (not the sender) is registered in
 *      telegram_chats with a master_kol_id FK. Anyone posting `/submit` in
 *      that group is treated as the KOL.
 *   3. Fallback to master_kols.telegram_id (kept as a secondary DM path)
 *   4. Unknown
 *
 * This matches existing operational reality: HoloHive already has per-KOL
 * groups where team + KOL collaborate. /submit lives in those groups.
 */
async function resolveCaller(message: any): Promise<ResolvedCaller> {
  const tgUserId = message?.from?.id?.toString() ?? null;
  const tgChatId = message?.chat?.id?.toString() ?? null;
  if (!tgUserId) return { kind: 'unknown', tgUserId: null };

  // 1. KOL via group chat takes PRECEDENCE [Andy 2026-06-12]. In a
  //    per-KOL group chat, the chat context wins — even if the sender is
  //    also a team member (e.g., Andy in his own KOL test group). Per
  //    2026-07-03, /submit is attributed to the KOL that owns the chat
  //    regardless of which group member typed the command — the sender-
  //    verification gate was removed; the review-queue Approve + banner
  //    Verify gates downstream are the real filters.
  if (tgChatId) {
    const { data: chatRow } = await (supabaseAdmin as any)
      .from('telegram_chats')
      .select('master_kol_id, master_kols!inner(id, name)')
      .eq('chat_id', tgChatId)
      .not('master_kol_id', 'is', null)
      .maybeSingle();
    if (chatRow?.master_kol_id) {
      const kol = (chatRow as any).master_kols;
      return { kind: 'kol', id: kol.id, name: kol.name, tgUserId, chatId: tgChatId };
    }
  }

  // 2. Team — sender's TG user_id maps to a team member. Applies when
  //    NOT in a known KOL group (e.g., internal ops chats, DMs).
  const { data: teamRow } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('telegram_id', tgUserId)
    .maybeSingle();
  if (teamRow) {
    return { kind: 'team', id: (teamRow as any).id, name: (teamRow as any).name, tgUserId };
  }

  // 3. Legacy DM fallback — master_kols.telegram_id lookup. Kept so any
  //    KOL who DMs the bot directly still resolves.
  const { data: kolRow } = await (supabaseAdmin as any)
    .from('master_kols')
    .select('id, name')
    .eq('telegram_id', tgUserId)
    .maybeSingle();
  if (kolRow) {
    return { kind: 'kol', id: kolRow.id, name: kolRow.name, tgUserId, chatId: tgChatId ?? tgUserId };
  }

  return { kind: 'unknown', tgUserId };
}


/**
 * Handle the /tasks slash command — list open tasks with one-tap
 * done buttons. The whole point is "users don't have to remember
 * T-NNN IDs"; the inline keyboard lets them tap the row instead.
 *
 * Subcommands:
 *   /tasks         → caller's open tasks (default — most common case)
 *   /tasks all     → every team member's open tasks (visibility)
 *   /tasks overdue → caller's overdue (combine with `all` for team-wide)
 *
 * Sort within the list: overdue first (most urgent), then today,
 * then upcoming, then no-due-date (no signal to sort by).
 *
 * Pagination intentionally omitted for v1 — caps the list at 20
 * tasks (Telegram's inline keyboard handles 100+ buttons fine but
 * the message becomes unreadable). If anyone regularly has >20
 * open tasks, that's a triage problem, not a UI problem.
 */
async function handleTasksCommand(chatId: string, args: string[], message: any) {
  const threadId: number | undefined = message.message_thread_id || undefined;

  const teamMember = await resolveTeamMember(message);
  if (!teamMember) {
    await sendTelegramMessage(chatId, '⚠️ /tasks is only available to team members.', 'HTML', threadId);
    return;
  }

  // Parse the subcommand. Order doesn't matter — `/tasks all overdue`
  // and `/tasks overdue all` both work.
  const flags = new Set(args.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const teamWide = flags.has('all');
  const overdueOnly = flags.has('overdue');

  await renderTasksList(chatId, teamMember, { teamWide, overdueOnly, threadId });
}

/**
 * Build + send (or edit) the task list message. Used by both the
 * initial /tasks command and by the done-button callback to refresh
 * the message after a task is closed.
 *
 * `editMessageId` switches between sendMessage (initial) and
 * editMessageText (refresh). Both routes share the same renderer so
 * the list stays consistent across initial display and refreshes.
 */
async function renderTasksList(
  chatId: string,
  teamMember: { id: string; name: string },
  opts: { teamWide: boolean; overdueOnly: boolean; editMessageId?: number; threadId?: number },
) {
  const todayIso = new Date().toISOString().slice(0, 10);

  let q = (supabaseAdmin as any)
    .from('tasks')
    .select('id, short_id, task_name, due_date, assigned_to, assigned_to_name, status')
    .neq('status', 'complete')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50); // over-fetch so the 20-cap below picks the most urgent

  if (!opts.teamWide) q = q.eq('assigned_to', teamMember.id);
  if (opts.overdueOnly) q = q.lt('due_date', todayIso);

  const { data: tasks, error } = await q;
  if (error) {
    const msg = `⚠️ Couldn't load tasks: ${error.message}`;
    if (opts.editMessageId) {
      // editMessageText doesn't need threadId — message_id is unique
      // within the chat regardless of which topic it's in.
      await editMessageText(chatId, opts.editMessageId, msg);
    } else {
      await sendTelegramMessage(chatId, msg, 'HTML', opts.threadId);
    }
    return;
  }
  const rows = (tasks || []) as Array<{
    id: string; short_id: string | null; task_name: string;
    due_date: string | null; assigned_to: string | null;
    assigned_to_name: string | null; status: string;
  }>;

  // Sort: overdue first, then today, then upcoming, then no-date.
  // Within each bucket keep the date-asc order from the SQL.
  const today = todayIso;
  const sorted = [...rows].sort((a, b) => bucket(a.due_date, today) - bucket(b.due_date, today));

  const total = sorted.length;
  const visible = sorted.slice(0, 20);

  const titleParts = [
    opts.teamWide ? '📋 <b>Team open tasks</b>' : '📋 <b>Your open tasks</b>',
    opts.overdueOnly ? '(overdue)' : '',
    total === 0 ? '' : visible.length === total ? `(${total})` : `(showing ${visible.length} of ${total})`,
  ].filter(Boolean);
  const header = titleParts.join(' ');

  if (total === 0) {
    const empty = opts.overdueOnly
      ? '🎉 No overdue tasks!'
      : opts.teamWide
        ? '🎉 No open tasks across the team.'
        : '🎉 No open tasks. Take a break.';
    const msg = `${header}\n\n${empty}`;
    if (opts.editMessageId) {
      await editMessageText(chatId, opts.editMessageId, msg);
    } else {
      await sendTelegramMessage(chatId, msg, 'HTML', opts.threadId);
    }
    return;
  }

  // Build a body line + a button row per task. Body text gives the
  // full picture (assignee, due date) since button text is capped.
  const lines = [header, ''];
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const t of visible) {
    const sid = t.short_id || '?';
    const due = shortDueLabel(t.due_date);
    const who = opts.teamWide && t.assigned_to_name ? ` · ${t.assigned_to_name}` : '';
    lines.push(`<b>${escapeHtml(sid)}</b> ${escapeHtml(t.task_name)}${due ? ` <i>(${escapeHtml(due)})</i>` : ''}${escapeHtml(who)}`);
    buttons.push([{
      text: truncateButton(`✅ ${sid} — ${t.task_name}${due ? ` (${due})` : ''}`),
      callback_data: `done:${t.id}`,
    }]);
  }
  if (visible.length < total) {
    lines.push('');
    lines.push(`<i>+${total - visible.length} more not shown — open /tasks page on web to see all.</i>`);
  }

  const text = lines.join('\n');
  if (opts.editMessageId) {
    await editMessageTextWithButtons(chatId, opts.editMessageId, text, buttons);
  } else {
    await sendTelegramMessageWithButtons(chatId, text, buttons, opts.threadId);
  }
}

/**
 * Sort bucket helper for the task list.
 *   0 = overdue (past due_date)
 *   1 = today
 *   2 = upcoming (future date)
 *   3 = no due date (least urgent — user hasn't committed to a deadline)
 */
function bucket(due: string | null, today: string): number {
  if (!due) return 3;
  const dueDay = due.length >= 10 ? due.slice(0, 10) : due;
  if (dueDay < today) return 0;
  if (dueDay === today) return 1;
  return 2;
}

/**
 * Compact relative-date label for task buttons / lines.
 * "OVERDUE 3d", "Today", "Tomorrow", "Mon May 19", etc.
 */
function shortDueLabel(due: string | null): string {
  if (!due) return '';
  const dueDay = due.length >= 10 ? due.slice(0, 10) : due;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dueDate = new Date(`${dueDay}T00:00:00Z`);
  if (isNaN(dueDate.getTime())) return dueDay;
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return `OVERDUE ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return dueDate.toLocaleDateString('en-US', { weekday: 'short' });
  return formatDate(dueDate);
}

/**
 * Telegram inline-keyboard buttons render as wrapped text but get
 * truncated visually if too long. Cap at ~50 chars to keep the row
 * looking clean on phone screens.
 */
function truncateButton(s: string): string {
  return s.length <= 55 ? s : s.slice(0, 52) + '…';
}

/**
 * Handle the /task <natural language> slash command.
 *
 * Flow:
 *   1. Auth (team-only via users.telegram_id)
 *   2. Pull body (everything after "/task ")
 *   3. Resolve any @-mentions to a users.id (entity-aware)
 *   4. Call Claude to extract WHAT/WHY/WHEN/GOOD-LOOKS-LIKE
 *   5. INSERT into pending_tasks
 *   6. Post preview message with ✅ Create / ❌ Cancel inline keyboard
 *
 * On button click: handleTaskCallback runs (separate update from
 * Telegram), looks up the pending row, executes the chosen action,
 * and edits the preview message to show the outcome.
 *
 * The preview message is sent to the SAME chat the /task came from,
 * not to a configured chat. This is a personal/team interaction, not
 * a broadcast — the team chat learns about the task via the existing
 * notify-changed announcer once it's actually created.
 */
async function handleTaskCommand(chatId: string, message: any) {
  const threadId: number | undefined = message.message_thread_id || undefined;
  const fromUserId = message.from?.id?.toString();

  // Same auth pattern as /done — must be a team member.
  if (!fromUserId) {
    await sendTelegramMessage(chatId, '⚠️ Could not identify you. /task is team-only.', 'HTML', threadId);
    return;
  }
  const { data: teamMember } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('telegram_id', fromUserId)
    .single();
  if (!teamMember) {
    await sendTelegramMessage(chatId, '⚠️ /task is only available to team members.', 'HTML', threadId);
    return;
  }

  // Extract the body — everything after "/task ". split-then-rejoin
  // handles both "/task foo bar" and "/task@holo_hive_bot foo bar".
  const fullText = (message.text || '').trim();
  const firstSpace = fullText.indexOf(' ');
  const body = firstSpace === -1 ? '' : fullText.slice(firstSpace + 1).trim();

  if (!body) {
    await sendTelegramMessage(
      chatId,
      'Usage: <code>/task @person describe the task, deadline, and why</code>\n' +
      'Example: <code>/task @daniel write OST recap brief by Fri, for client pitch Thu</code>',
      'HTML',
      threadId,
    );
    return;
  }

  // ── Pre-resolve assignee from @-mentions BEFORE calling Claude ──
  // The doc spec is "tag person" so we expect exactly one mention.
  // If the user forgot to tag, the parser will note it and the
  // preview will warn — but we still let them confirm-without-assignee
  // since some tasks are legitimately unassigned (research a thing).
  const { resolveAssigneeFromMessage, messageReferencesSender } = await import('@/lib/telegramAssigneeResolver');
  let assignee = await resolveAssigneeFromMessage(
    supabaseAdmin,
    fullText,
    message.entities,
  );

  // ── Self-reference fallback (TG-TASK.1) ─────────────────────────────
  // If no @-tag matched but the user references themselves by name
  // (e.g. "bolt do X" from BoltXBT), treat it as self-assignment instead
  // of forcing them to re-send with their own @handle. Look up the
  // sender's telegram_username once for the token-match check.
  if (!assignee) {
    const { data: senderRow } = await supabaseAdmin
      .from('users')
      .select('id, name, telegram_username')
      .eq('telegram_id', fromUserId)
      .maybeSingle();
    if (
      senderRow &&
      messageReferencesSender(body, {
        name: (senderRow as any).name,
        telegram_username: (senderRow as any).telegram_username,
        first_name: message.from?.first_name,
      })
    ) {
      assignee = {
        user_id: (senderRow as any).id,
        name: (senderRow as any).name,
        telegram_username: (senderRow as any).telegram_username,
        matched_via: 'mention',
      } as any;
    }
  }

  // ── Acknowledge while Claude works (1-2s typical) ──────────────
  await sendTelegramMessage(chatId, '🤔 Parsing task...', 'HTML', threadId);

  // ── Pull team roster for Claude's clarification context ────────
  const { data: roster } = await supabaseAdmin
    .from('users')
    .select('id, name, telegram_username')
    .not('telegram_id', 'is', null);

  // ── Parse ──────────────────────────────────────────────────────
  let parsed;
  try {
    const { parseTaskFromText } = await import('@/lib/taskParser');
    parsed = await parseTaskFromText({
      body,
      assignee: assignee ? { user_id: assignee.user_id, name: assignee.name } : null,
      teamMembers: (roster || []) as any,
    });
  } catch (err: any) {
    // [2026-06-16] Surface the underlying error class to make recurring
    // failures (deprecated models, 401s, rate limits) debuggable from
    // the chat instead of silently showing "Couldn't parse that".
    console.error('[Telegram /task] parse failed:', err?.name, err?.status, err?.message, err);
    const isAuth = err?.status === 401 || err?.status === 403;
    const isRateLimit = err?.status === 429;
    const isModelGone = err?.status === 404 || /not_found|deprecated|404/i.test(err?.message || '');
    const hint = isAuth
      ? 'Claude API auth issue — check ANTHROPIC_API_KEY.'
      : isRateLimit
        ? 'Claude API rate-limited. Try again in a minute.'
        : isModelGone
          ? 'Claude API model deprecated. Bot needs a model upgrade.'
          : 'Try being more specific, or check Vercel logs.';
    await sendTelegramMessage(chatId, `⚠️ Couldn't parse that. ${hint}`, 'HTML', threadId);
    return;
  }

  // ── Claude-identified assignee fallback ────────────────────────
  // If entity resolution found nobody but the parser identified a
  // clear delegate from the roster (per Andy 2026-07-21: "the AI knows
  // who's meant — just assign it"), re-validate the suggestion against
  // the real roster and use it. A hallucinated/ambiguous username
  // fails matchHandleToRoster and the task stays unassigned.
  if (!assignee && parsed.suggested_assignee) {
    const { matchHandleToRoster } = await import('@/lib/telegramAssigneeResolver');
    const suggested = matchHandleToRoster(parsed.suggested_assignee, (roster || []) as any);
    if (suggested) {
      assignee = {
        user_id: suggested.id,
        name: suggested.name || suggested.telegram_username || parsed.suggested_assignee,
        telegram_username: suggested.telegram_username,
        matched_via: 'mention',
      } as any;
    }
  }

  // ── Store pending row ──────────────────────────────────────────
  const pendingPayload = {
    created_by_user_id: (teamMember as any).id,
    origin_chat_id: chatId,
    origin_message_id: message.message_id ?? null,
    origin_thread_id: message.message_thread_id ?? null,
    parsed: {
      ...parsed,
      assignee_user_id: assignee?.user_id ?? null,
      assignee_name: assignee?.name ?? null,
    },
    raw_text: body,
  };
  const { data: pending, error: pendingErr } = await (supabaseAdmin as any)
    .from('pending_tasks')
    .insert(pendingPayload)
    .select('id')
    .single();
  if (pendingErr || !pending) {
    console.error('[Telegram /task] pending insert failed:', pendingErr);
    await sendTelegramMessage(chatId, '⚠️ Couldn\'t stage the task. Try again.', 'HTML', threadId);
    return;
  }

  // ── Compose preview ────────────────────────────────────────────
  const previewLines: string[] = [];
  previewLines.push(`📝 <b>${escapeHtml(parsed.task_name)}</b>`);
  previewLines.push('');
  previewLines.push(`<b>Assignee:</b> ${assignee ? escapeHtml(assignee.name) : '<i>(none — tag with @handle)</i>'}`);
  previewLines.push(`<b>Due:</b> ${parsed.due_date ? escapeHtml(parsed.due_date) : '<i>not set</i>'}`);
  if (parsed.why) previewLines.push(`<b>Why:</b> ${escapeHtml(parsed.why)}`);
  if (parsed.good_looks_like) previewLines.push(`<b>Reference:</b> ${escapeHtml(parsed.good_looks_like)}`);
  if (parsed.description) previewLines.push(`<b>Notes:</b> ${escapeHtml(parsed.description)}`);
  if (parsed.clarification_needed) {
    previewLines.push('');
    previewLines.push(`⚠️ <i>${escapeHtml(parsed.clarification_needed)}</i>`);
  }

  await sendTelegramMessageWithButtons(
    chatId,
    previewLines.join('\n'),
    [
      [
        { text: '✅ Create', callback_data: `task:create:${pending.id}` },
        { text: '❌ Cancel', callback_data: `task:cancel:${pending.id}` },
      ],
    ],
    message.message_thread_id,
  );
}

/**
 * Top-level dispatcher for inline-keyboard button clicks. Routes by
 * the first segment of callback_data (we use "<feature>:<action>:<id>").
 */
async function handleCallbackQuery(cq: any) {
  const data: string = cq.data || '';
  const callbackId: string = cq.id;

  if (data.startsWith('task:')) {
    await handleTaskCallback(cq);
    return;
  }

  // `done:<task_id>` — fired by the buttons in /tasks lists AND the
  // picker buttons rendered when /done <fuzzy> matches multiple
  // tasks. Both flows route through the same close-and-refresh path.
  if (data.startsWith('done:')) {
    await handleDoneCallback(cq);
    return;
  }

  // `psg:confirm:<task_id>:<user_id>` / `psg:cancel:<task_id>:<user_id>` —
  // Pre-Ship Gate inline-button responses. Only the user who triggered
  // /done can tap; 10-min expiry per spec.
  if (data.startsWith('psg:')) {
    await handlePsgCallback(cq);
    return;
  }

  // [2026-06-11] `subm:pick:<pending_id>:<campaign_id>` — multi-campaign
  // picker on /submit. `subm:approve:<submission_id>` /
  // `subm:reject:<submission_id>` — team review queue buttons.
  if (data.startsWith('subm:')) {
    await handleSubmCallback(cq);
    return;
  }

  // `pdate:<content_item_id>:<daysAgo>` — the post-date buttons on the
  // /submit receipt. Sets content_items.posted_at back N days so the SPA
  // buckets a backfilled post into the week it actually went live.
  if (data.startsWith('pdate:')) {
    await handlePostDateCallback(cq);
    return;
  }

  // `bulk:create:<id>` / `bulk:cancel:<id>` — confirm flow for the
  // /bulk multi-task batch. Single handler for both because the
  // post-action work (edit preview message, dismiss spinner) is the
  // same regardless of which button was pressed.
  if (data.startsWith('bulk:')) {
    await handleBulkCallback(cq);
    return;
  }

  // `wal:confirm:0xABC...` / `wal:cancel` — /wallet update prompt
  // buttons (HHP /wallet Command spec § 7.2). Confirm carries the
  // proposed new address inline so the callback is stateless. Cancel
  // keeps the existing wallet.
  if (data.startsWith('wal:')) {
    await handleWalletCallback(cq);
    return;
  }

  // `kolscan:<kolId>` — the "✅ Joined — Scan now" button on the new-KOL
  // DM. Andy joins the channel from the scanner account, taps this, and
  // we fire the single-KOL Telethon scan so niche + score populate.
  if (data.startsWith('kolscan:')) {
    await handleKolScanCallback(cq);
    return;
  }

  // Unknown callback — dismiss the spinner so the button doesn't hang.
  await answerCallbackQuery(callbackId);
}

/**
 * `kolscan:<kolId>` — new-KOL "Joined — Scan now" button. Dispatches the
 * on-demand single-KOL scan (GH Actions) for the KOL's channel now that
 * the scanner account has joined it. Non-blocking: the scan lands in
 * Supabase ~1 min later via the MCP write endpoints. See lib/githubActions
 * + /api/kols/[id]/notify-join (which sends the button-bearing DM).
 */
async function handleKolScanCallback(cq: any) {
  const callbackId: string = cq.id;
  const data: string = cq.data || '';
  const chatId = String(cq.message?.chat?.id ?? '');
  const messageId: number | undefined = cq.message?.message_id;

  const kolId = data.split(':')[1];
  if (!kolId) {
    await answerCallbackQuery(callbackId, 'Invalid button.');
    return;
  }

  const { data: kol } = await (supabaseAdmin as any)
    .from('master_kols')
    .select('id, name, link')
    .eq('id', kolId)
    .maybeSingle();
  if (!kol) {
    await answerCallbackQuery(callbackId, 'KOL not found.');
    return;
  }

  const link = typeof kol.link === 'string' ? kol.link.trim() : '';
  // Accept t.me/ URLs, @handles and bare handles; reject non-TG URLs.
  if (!link || (/^https?:\/\//i.test(link) && !/t\.me\//i.test(link))) {
    await answerCallbackQuery(callbackId, 'No Telegram channel on this KOL.');
    return;
  }

  const result = await triggerKolScan(link);
  await answerCallbackQuery(callbackId, result.ok ? 'Scan queued — ~1 min.' : 'Dispatch failed.');
  if (chatId && messageId) {
    await editMessageText(
      chatId,
      messageId,
      result.ok
        ? `🔄 Scanning <b>${escapeHtml(kol.name || 'KOL')}</b> — niche + score will update in ~1 min.`
        : `⚠️ Couldn't queue the scan: ${escapeHtml(result.error || 'unknown error')}`,
    );
  }
}

/**
 * Handle a `done:<task_id>` button click. Closes the task and either:
 *   - Refreshes the /tasks list (when the original message had a list
 *     of buttons) — re-renders so the closed task drops out and the
 *     count updates.
 *   - Edits the picker message to a confirmation (when the original
 *     was a /done <fuzzy> picker — there's no list to refresh).
 *
 * Permissive auth like /done — any team member can close any task by
 * tapping a button, same as the existing T-NNN command. Anti-grief
 * isn't worth the friction here; the team is small and trust-based.
 */
async function handleDoneCallback(cq: any) {
  const callbackId: string = cq.id;
  const data: string = cq.data || '';
  const taskDbId = data.split(':')[1];
  const messageChatId = cq.message?.chat?.id?.toString();
  const messageId = cq.message?.message_id;

  if (!taskDbId || !messageChatId || !messageId) {
    await answerCallbackQuery(callbackId, 'Invalid button.');
    return;
  }

  const teamMember = await resolveTeamMember(cq);
  if (!teamMember) {
    await answerCallbackQuery(callbackId, 'Team-only.');
    return;
  }

  // [2026-06-14] BUG FIX: this callback originally only read (id, short_id,
  // task_name, status) and flipped to complete directly, bypassing the
  // Pre-Ship Gate. /done T-NNN gated client-linked tasks but the /tasks
  // list "Done" buttons did not — same status flip, different door.
  // Now we pull client_id and route through sendPreShipGatePrompt, just
  // like closeByDbIdAndReply does. We keep the EDIT-the-list behavior
  // for non-client tasks (the original UX rationale) but for gated tasks
  // the prompt is a new message anyway (the list message stays as-is).
  const { data: task } = await (supabaseAdmin as any)
    .from('tasks')
    .select('id, short_id, task_name, status, client_id')
    .eq('id', taskDbId)
    .maybeSingle();

  if (!task) {
    await answerCallbackQuery(callbackId, 'Task not found.');
    return;
  }

  // Client-linked → Pre-Ship Gate. Don't flip the task yet — the gate
  // confirm handler does the close + audit-log write in one transaction.
  if (task.status !== 'complete' && task.client_id) {
    await answerCallbackQuery(callbackId, 'Pre-Ship Gate required.');
    const threadId: number | undefined = cq.message?.message_thread_id || undefined;
    await sendPreShipGatePrompt(messageChatId, task, teamMember, threadId);
    return;
  }

  if (task.status !== 'complete') {
    const nowIso = new Date().toISOString();
    const { error: updErr } = await (supabaseAdmin as any)
      .from('tasks')
      .update({ status: 'complete', completed_at: nowIso, updated_at: nowIso })
      .eq('id', taskDbId);
    if (updErr) {
      console.error('[Telegram done-callback] update failed:', updErr);
      await answerCallbackQuery(callbackId, 'Update failed.');
      return;
    }
  }

  // Decide whether this came from a /tasks list (re-render the list)
  // or from a /done <fuzzy> picker (edit to confirmation). Heuristic:
  // the message text starts with the list header "📋" — that's only
  // present in renderTasksList output. Cheap, no extra state needed.
  const messageText: string = cq.message?.text || cq.message?.caption || '';
  const isListMessage = messageText.startsWith('📋');

  if (isListMessage) {
    // Refresh the list. Need to detect which filter the original used
    // — we don't store it anywhere, so re-derive from the header text.
    const teamWide = messageText.includes('Team open tasks');
    const overdueOnly = messageText.includes('(overdue)');
    await renderTasksList(messageChatId, teamMember, {
      teamWide,
      overdueOnly,
      editMessageId: messageId,
    });
  } else {
    // Picker flow — edit to a single-line confirmation.
    const sid = task.short_id || '?';
    const safeName = escapeHtml(task.task_name || '(untitled task)');
    await editMessageText(
      messageChatId,
      messageId,
      `✅ <b>${escapeHtml(sid)}</b> ${safeName}\n<i>closed by ${escapeHtml(teamMember.name)}</i>`,
    );
  }

  await answerCallbackQuery(callbackId, `Closed ${task.short_id || ''}`.trim());
}

/**
 * Handle the ✅ Create / ❌ Cancel buttons on a /task preview.
 *
 * Anti-grief: only the user who created the pending task can act on
 * it. Other chat members get a "not yours" toast.
 */
async function handleTaskCallback(cq: any) {
  const callbackId: string = cq.id;
  const data: string = cq.data || '';
  const [, action, pendingId] = data.split(':');
  const clickerTgId = cq.from?.id?.toString();
  const messageChatId = cq.message?.chat?.id?.toString();
  const messageId = cq.message?.message_id;

  if (!pendingId || !clickerTgId || !messageChatId || !messageId) {
    await answerCallbackQuery(callbackId, 'Invalid button.');
    return;
  }

  // Look up the pending row.
  const { data: pending } = await (supabaseAdmin as any)
    .from('pending_tasks')
    .select('*')
    .eq('id', pendingId)
    .maybeSingle();

  if (!pending) {
    await answerCallbackQuery(callbackId, 'This task already expired.');
    await editMessageText(messageChatId, messageId, '⏳ <i>Pending task no longer available.</i>');
    return;
  }

  // Verify the clicker is the creator. Resolve their telegram_id → users.id.
  const { data: clicker } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('telegram_id', clickerTgId)
    .single();

  if (!clicker || (clicker as any).id !== pending.created_by_user_id) {
    await answerCallbackQuery(callbackId, 'Only the task creator can confirm.');
    return;
  }

  if (action === 'cancel') {
    await (supabaseAdmin as any).from('pending_tasks').delete().eq('id', pendingId);
    await editMessageText(messageChatId, messageId, '❌ <i>Cancelled.</i>');
    await answerCallbackQuery(callbackId, 'Cancelled');
    return;
  }

  if (action === 'create') {
    const parsed = pending.parsed as any;

    // Insert the actual task. The tasks_assign_short_id trigger
    // (migration 066) auto-stamps short_id on insert. Mirror the
    // status / created_by defaults that taskService.createTask sets.
    //
    // Three NOT-NULL columns + one enum-style value need to be filled
    // explicitly — empirically discovered when the first prod /task
    // confirm 500'd:
    //   - status: actual valid value is 'to_do' (with underscore), not
    //     'todo'. The DB default is 'to_do' but we set it explicitly
    //     to be self-documenting.
    //   - frequency: NOT NULL with no default. Tasks created from chat
    //     are one-off by definition (recurring tasks need cadence
    //     metadata that /task doesn't capture). 'one-time' matches the
    //     vocabulary the rest of the app uses.
    //   - task_type: NOT NULL with no default. 'General' is the
    //     existing catch-all bucket — users can recategorize from the
    //     /tasks UI later.
    const insertPayload: Record<string, any> = {
      task_name: parsed.task_name,
      assigned_to: parsed.assignee_user_id || null,
      assigned_to_name: parsed.assignee_name || null,
      due_date: parsed.due_date || null,
      description: parsed.description || parsed.why || null,
      status: 'to_do',
      priority: 'medium',
      frequency: 'one-time',
      task_type: 'General',
      created_by: (clicker as any).id,
      created_by_name: (clicker as any).name,
    };

    const { data: createdTask, error: createErr } = await (supabaseAdmin as any)
      .from('tasks')
      .insert(insertPayload)
      .select('id, short_id, task_name, assigned_to')
      .single();

    if (createErr || !createdTask) {
      console.error('[Telegram /task] task insert failed:', createErr);
      await answerCallbackQuery(callbackId, 'Failed to create.');
      await editMessageText(messageChatId, messageId, '⚠️ <i>Failed to create task. Check logs.</i>');
      return;
    }

    // Fire the assignee DM (server-side equivalent of taskService's
    // notifyAssignment). We can't hit /api/tasks/notify-assignment
    // because that endpoint requires a user session cookie, which we
    // don't have in a webhook context. So we inline the same logic.
    if (createdTask.assigned_to) {
      await sendAssignmentDmInline(createdTask.id, (clicker as any).name);
    }

    // Delete the pending row — task is now live.
    await (supabaseAdmin as any).from('pending_tasks').delete().eq('id', pendingId);

    // Edit the preview to show the outcome (and the assigned short_id).
    const lines = [
      `✅ <b>Created ${escapeHtml(createdTask.short_id || '')}</b> ${escapeHtml(createdTask.task_name)}`,
      `<i>by ${escapeHtml((clicker as any).name)}</i>`,
    ];
    await editMessageText(messageChatId, messageId, lines.join('\n'));
    await answerCallbackQuery(callbackId, 'Created!');
    return;
  }

  await answerCallbackQuery(callbackId, 'Unknown action.');
}

/* ─────────────────────────── /bulk command ─────────────────────────── */

/**
 * Handle the /bulk multi-task batch command.
 *
 * Flow mirrors /task but for many tasks across multiple clients:
 *   1. Auth (team-only via users.telegram_id)
 *   2. Extract body (everything after "/bulk ")
 *   3. Pull team roster + active client list (preloads Claude's resolution maps)
 *   4. Call bulkTaskParser → ParsedBulk with sections + issues
 *   5. INSERT pending_bulk_tasks row
 *   6. Render preview message with [✅ Create all N] / [❌ Cancel]
 *      buttons. callback_data carries the pending_bulk_tasks.id.
 *
 * Confirm logic lives in handleBulkCallback.
 */
async function handleBulkCommand(chatId: string, message: any) {
  const threadId: number | undefined = message.message_thread_id || undefined;
  const fromUserId = message.from?.id?.toString();

  if (!fromUserId) {
    await sendTelegramMessage(chatId, '⚠️ Could not identify you. /bulk is team-only.', 'HTML', threadId);
    return;
  }
  const { data: teamMember } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('telegram_id', fromUserId)
    .single();
  if (!teamMember) {
    await sendTelegramMessage(chatId, '⚠️ /bulk is only available to team members.', 'HTML', threadId);
    return;
  }

  const fullText = (message.text || '').trim();
  const firstSpace = fullText.indexOf(' ');
  const body = firstSpace === -1 ? '' : fullText.slice(firstSpace + 1).trim();

  if (!body) {
    await sendTelegramMessage(
      chatId,
      'Usage: <code>/bulk</code> followed by a weekly-rollout-style block.\n\n' +
      'Each client section starts with the client name on its own line, then bullet lines like:\n' +
      '<code>• May 19 - @yano write the OST recap brief</code>\n\n' +
      '✨ On confirm, every client-linked task is also pre-filled into that client\'s Zone A (Execution Plan) for this week, ready for the CM to submit.',
      'HTML',
      threadId,
    );
    return;
  }

  await sendTelegramMessage(chatId, '🤔 Parsing batch...', 'HTML', threadId);

  // Pre-load resolution sources. Both lists are bounded (team is
  // ~10, clients ~30) so no pagination concerns.
  const [{ data: roster }, { data: clientList }] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('id, name, telegram_username')
      .not('telegram_id', 'is', null),
    (supabaseAdmin as any)
      .from('clients')
      .select('id, name')
      .is('archived_at', null)
      .order('name'),
  ]);

  // TG-TASK.1: load sender's telegram_username so the parser can
  // resolve self-references ("bolt do X" from BoltXBT) without
  // demanding @-tag.
  const { data: senderRow } = await supabaseAdmin
    .from('users')
    .select('id, name, telegram_username')
    .eq('telegram_id', fromUserId)
    .maybeSingle();

  let parsed;
  try {
    const { parseBulkTasks } = await import('@/lib/bulkTaskParser');
    parsed = await parseBulkTasks({
      body,
      teamMembers: (roster || []) as any,
      clients: (clientList || []) as any,
      sender: senderRow
        ? {
            id: (senderRow as any).id,
            name: (senderRow as any).name,
            telegram_username: (senderRow as any).telegram_username,
            first_name: message.from?.first_name,
          }
        : undefined,
    });
  } catch (err: any) {
    console.error('[Telegram /bulk] parse failed:', err);
    await sendTelegramMessage(chatId, '⚠️ Couldn\'t parse that. Try checking the format.', 'HTML', threadId);
    return;
  }

  const totalParsed = parsed.sections.reduce((sum, s) => sum + s.tasks.length, 0);
  const totalToCreate = parsed.sections.reduce(
    (sum, s) => sum + s.tasks.filter(t => !t.is_complete).length,
    0,
  );
  const totalDoneMarked = totalParsed - totalToCreate;

  if (totalParsed === 0) {
    await sendTelegramMessage(chatId, '🤷 No tasks parsed from that input.', 'HTML', threadId);
    return;
  }

  // Stage the parse result. The pending row carries everything the
  // callback needs to do the inserts — no need to re-call Claude on
  // confirm. Auto-expires implicitly (no consumer beyond the
  // callback) so we don't need a sweeper.
  const { data: pending, error: pendingErr } = await (supabaseAdmin as any)
    .from('pending_bulk_tasks')
    .insert({
      created_by_user_id: (teamMember as any).id,
      origin_chat_id: chatId,
      origin_message_id: message.message_id ?? null,
      origin_thread_id: message.message_thread_id ?? null,
      parsed,
      raw_text: body,
    })
    .select('id')
    .single();
  if (pendingErr || !pending) {
    console.error('[Telegram /bulk] pending insert failed:', pendingErr);
    await sendTelegramMessage(chatId, '⚠️ Couldn\'t stage the batch. Try again.', 'HTML', threadId);
    return;
  }

  // ── Build the preview message ──────────────────────────────────
  // Group output by client. Each task line: short status icon + due
  // date + task name + assignee. Telegram caps messages at 4096
  // chars; if the preview overflows we truncate per-client with a
  // "+N more" indicator.
  const previewLines: string[] = [];
  previewLines.push(`📋 <b>Bulk preview — ${totalToCreate} task${totalToCreate === 1 ? '' : 's'} to create</b>`);
  if (totalDoneMarked > 0) {
    previewLines.push(`<i>(plus ${totalDoneMarked} marked done, skipping)</i>`);
  }
  previewLines.push('');

  for (const section of parsed.sections) {
    const clientLabel = section.client_id
      ? section.client_name
      : `${section.client_name} ⚠️ <i>(no match)</i>`;
    previewLines.push(`<b>${escapeHtml(clientLabel)}</b>`);
    for (const t of section.tasks) {
      const tick = t.is_complete ? '✅' : '○';
      const date = t.due_date ? escapeHtml(t.due_date) : '—';
      const assignee = t.primary_assignee_name
        ? ` · ${escapeHtml(t.primary_assignee_name)}${t.co_owner_handles.length ? ` (+${t.co_owner_handles.length})` : ''}`
        : '';
      previewLines.push(`  ${tick} <code>${date}</code> ${escapeHtml(t.task_name)}${assignee}`);
    }
    previewLines.push('');
  }

  if (parsed.issues.length > 0) {
    previewLines.push(`⚠️ <b>Issues (${parsed.issues.length}):</b>`);
    for (const issue of parsed.issues.slice(0, 8)) {
      previewLines.push(`  • ${escapeHtml(issue.message)}`);
    }
    if (parsed.issues.length > 8) {
      previewLines.push(`  • +${parsed.issues.length - 8} more`);
    }
  }

  // Truncate hard to stay under Telegram's 4096-char limit. The
  // pending row has the full data; the preview is just for human
  // verification.
  const MAX_PREVIEW_CHARS = 3800;
  let previewText = previewLines.join('\n');
  if (previewText.length > MAX_PREVIEW_CHARS) {
    previewText = previewText.slice(0, MAX_PREVIEW_CHARS) + '\n\n<i>(preview truncated; full data will still be inserted on confirm)</i>';
  }

  await sendTelegramMessageWithButtons(
    chatId,
    previewText,
    [[
      { text: `✅ Create ${totalToCreate}`, callback_data: `bulk:create:${pending.id}` },
      { text: '❌ Cancel', callback_data: `bulk:cancel:${pending.id}` },
    ]],
    message.message_thread_id,
  );
}

/**
 * Handle ✅/❌ on the /bulk preview message.
 *
 * Same anti-grief check as /task — only the user who typed /bulk can
 * confirm or cancel. Cancel just deletes the pending row + edits the
 * preview. Create iterates the parsed sections, inserts non-complete
 * tasks (✅-marked ones are skipped), fires assignee DMs in
 * parallel, and rolls up co-owner handles into the description
 * footer per the multi-assignee design note in mig 077.
 *
 * Insert mode: best-effort per-row rather than a SQL transaction
 * (PostgREST doesn't expose multi-row transactions cleanly). Per-row
 * failures are collected and reported in the outcome message rather
 * than rolling back successful inserts — partial creation is more
 * useful than nothing when most rows are valid.
 */
async function handleBulkCallback(cq: any) {
  const callbackId: string = cq.id;
  const data: string = cq.data || '';
  const [, action, pendingId] = data.split(':');
  const clickerTgId = cq.from?.id?.toString();
  const messageChatId = cq.message?.chat?.id?.toString();
  const messageId = cq.message?.message_id;

  if (!pendingId || !clickerTgId || !messageChatId || !messageId) {
    await answerCallbackQuery(callbackId, 'Invalid button.');
    return;
  }

  const { data: pending } = await (supabaseAdmin as any)
    .from('pending_bulk_tasks')
    .select('*')
    .eq('id', pendingId)
    .maybeSingle();
  if (!pending) {
    await answerCallbackQuery(callbackId, 'This batch already expired.');
    await editMessageText(messageChatId, messageId, '⏳ <i>Pending batch no longer available.</i>');
    return;
  }

  const { data: clicker } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('telegram_id', clickerTgId)
    .single();
  if (!clicker || (clicker as any).id !== pending.created_by_user_id) {
    await answerCallbackQuery(callbackId, 'Only the batch creator can confirm.');
    return;
  }

  if (action === 'cancel') {
    await (supabaseAdmin as any).from('pending_bulk_tasks').delete().eq('id', pendingId);
    await editMessageText(messageChatId, messageId, '❌ <i>Bulk cancelled.</i>');
    await answerCallbackQuery(callbackId, 'Cancelled');
    return;
  }

  if (action !== 'create') {
    await answerCallbackQuery(callbackId, 'Unknown action.');
    return;
  }

  // ── Create path ────────────────────────────────────────────────
  const parsed = pending.parsed as any;
  const sections: any[] = parsed?.sections || [];

  const createdIds: string[] = [];
  const failures: Array<{ task_name: string; error: string }> = [];
  // Track each successful insert alongside its parsed source so we can
  // pre-fill Zone A below (per Andy 2026-06-19). Keyed list, not a map,
  // since multiple tasks can have the same name within one bulk.
  type CreatedForZoneA = {
    taskId: string;
    clientId: string;
    task_name: string;
    primary_assignee_id: string | null;
    due_date: string | null;
  };
  const createdForZoneA: CreatedForZoneA[] = [];

  for (const section of sections) {
    const clientId: string | null = section.client_id || null;
    for (const t of section.tasks || []) {
      if (t.is_complete) continue; // ✅-marked rows skip insert

      // Compose description with the co-owner footer when present.
      // Plain text — task description is rendered as HTML elsewhere
      // but the description column is whatever we put in.
      const baseDesc = t.notes ? String(t.notes).trim() : '';
      const coOwnerFooter = (t.co_owner_handles || []).length > 0
        ? `\n\nCo-owners: ${(t.co_owner_handles as string[]).map(h => `@${h}`).join(', ')}`
        : '';
      const description = (baseDesc + coOwnerFooter) || null;

      const insertPayload: Record<string, any> = {
        task_name: t.task_name,
        assigned_to: t.primary_assignee_id || null,
        assigned_to_name: t.primary_assignee_name || null,
        due_date: t.due_date || null,
        description,
        client_id: clientId,
        status: 'to_do',
        priority: 'medium',
        frequency: 'one-time',
        task_type: 'General',
        created_by: (clicker as any).id,
        created_by_name: (clicker as any).name,
      };

      const { data: created, error: insErr } = await (supabaseAdmin as any)
        .from('tasks')
        .insert(insertPayload)
        .select('id, short_id, assigned_to')
        .single();

      if (insErr || !created) {
        failures.push({ task_name: t.task_name, error: insErr?.message || 'insert failed' });
        continue;
      }
      createdIds.push(created.id);
      if (clientId) {
        createdForZoneA.push({
          taskId: created.id,
          clientId,
          task_name: t.task_name,
          primary_assignee_id: t.primary_assignee_id || null,
          due_date: t.due_date || null,
        });
      }

      // Fire the assignment DM if this task has an assignee. Same
      // inline path /task uses — service-role write, dedupe via
      // last_assignee_notified_to.
      if (created.assigned_to) {
        sendAssignmentDmInline(created.id, (clicker as any).name).catch(() => {});
      }
    }
  }

  await (supabaseAdmin as any).from('pending_bulk_tasks').delete().eq('id', pendingId);

  // ─── Pre-fill Zone A (Execution Plan) per client per Andy 2026-06-19 ──
  // For every client-linked task we just created, append a Zone A row
  // to that client's client_weekly_updates row for this Monday-anchored
  // week. CMs see the new rows next time they open the Weekly Update
  // tab and can edit/submit without retyping.
  //
  // Guardrails:
  //   • Skip clients whose Zone A is already locked (submitted_at set)
  //     so we don't overwrite the CM's signed-off plan.
  //   • Use a stable id format — bulk:<task uuid> — so re-runs of the
  //     same /bulk command don't duplicate rows (we dedupe below).
  //   • Row payload mirrors the Zone A UI shape:
  //       { id, description, assignee_id, due_date, deliverable_type }
  const zoneAByClient = new Map<string, Array<{ id: string; description: string; assignee_id: string | null; due_date: string | null; deliverable_type: null }>>();
  for (const c of createdForZoneA) {
    const arr = zoneAByClient.get(c.clientId) ?? [];
    arr.push({
      id: `bulk:${c.taskId}`,
      description: String(c.task_name || '').trim(),
      assignee_id: c.primary_assignee_id,
      due_date: c.due_date,
      deliverable_type: null,
    });
    zoneAByClient.set(c.clientId, arr);
  }
  // Compute this Monday in YYYY-MM-DD (matches client_weekly_updates.week_of).
  const today = new Date();
  const dow = today.getUTCDay() || 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - (dow - 1));
  monday.setUTCHours(0, 0, 0, 0);
  const weekOf = monday.toISOString().slice(0, 10);

  let zoneAUpdatedClients = 0;
  let zoneALockedClients = 0;
  let zoneAAddedRows = 0;
  for (const [clientId, rows] of zoneAByClient) {
    if (rows.length === 0) continue;
    // Fetch existing row for (client_id, week_of), if any.
    const { data: existingRow } = await (supabaseAdmin as any)
      .from('client_weekly_updates')
      .select('id, execution_plan, execution_plan_submitted_at')
      .eq('client_id', clientId)
      .eq('week_of', weekOf)
      .maybeSingle();

    if (existingRow?.execution_plan_submitted_at) {
      zoneALockedClients++;
      continue;
    }

    // Dedupe by id so re-running the same /bulk doesn't double-add.
    const existingPlan: any[] = Array.isArray(existingRow?.execution_plan) ? existingRow.execution_plan : [];
    const existingIds = new Set(existingPlan.map(r => r?.id).filter(Boolean));
    const fresh = rows.filter(r => !existingIds.has(r.id));
    if (fresh.length === 0) continue;
    const nextPlan = [...existingPlan, ...fresh];

    if (existingRow) {
      const { error: upErr } = await (supabaseAdmin as any)
        .from('client_weekly_updates')
        .update({ execution_plan: nextPlan, updated_at: new Date().toISOString() })
        .eq('id', existingRow.id);
      if (upErr) {
        console.error('[Telegram /bulk] Zone A update failed:', upErr);
        continue;
      }
    } else {
      const { error: insErr } = await (supabaseAdmin as any)
        .from('client_weekly_updates')
        .insert({
          client_id: clientId,
          week_of: weekOf,
          execution_plan: nextPlan,
          created_by: (clicker as any).id,
        });
      if (insErr) {
        console.error('[Telegram /bulk] Zone A insert failed:', insErr);
        continue;
      }
    }
    zoneAUpdatedClients++;
    zoneAAddedRows += fresh.length;
  }

  // Compose outcome message. Successes are the headline; failures
  // get itemized so the user can re-submit just the broken rows.
  const lines: string[] = [];
  lines.push(`✅ <b>Created ${createdIds.length} task${createdIds.length === 1 ? '' : 's'}</b>`);
  lines.push(`<i>by ${escapeHtml((clicker as any).name)}</i>`);
  if (zoneAAddedRows > 0) {
    lines.push('');
    lines.push(`✨ <b>Zone A pre-filled</b> · ${zoneAAddedRows} row${zoneAAddedRows === 1 ? '' : 's'} across ${zoneAUpdatedClients} client${zoneAUpdatedClients === 1 ? '' : 's'} for week of ${weekOf}`);
  }
  if (zoneALockedClients > 0) {
    lines.push(`<i>(${zoneALockedClients} client${zoneALockedClients === 1 ? '' : 's'} skipped — Zone A already submitted for this week)</i>`);
  }
  if (failures.length > 0) {
    lines.push('');
    lines.push(`⚠️ <b>${failures.length} failed:</b>`);
    for (const f of failures.slice(0, 8)) {
      lines.push(`  • ${escapeHtml(f.task_name)} — ${escapeHtml(f.error)}`);
    }
    if (failures.length > 8) lines.push(`  • +${failures.length - 8} more`);
  }
  await editMessageText(messageChatId, messageId, lines.join('\n'));
  await answerCallbackQuery(callbackId, `Created ${createdIds.length}`);
}

/**
 * Send the assignment DM to the new assignee. Server-side mirror of
 * what /api/tasks/notify-assignment does — read the assignee's
 * telegram_id, send them a formatted DM, mark last_assignee_notified_to
 * so subsequent edits don't re-DM. Used by the /task confirm flow
 * since that endpoint requires user-session auth we don't have here.
 */
async function sendAssignmentDmInline(taskId: string, actorName: string) {
  try {
    // Re-fetch with the fields we need (we got a narrow select earlier).
    const { data: task } = await (supabaseAdmin as any)
      .from('tasks')
      .select('id, short_id, task_name, assigned_to, due_date, priority, last_assignee_notified_to')
      .eq('id', taskId)
      .single();

    if (!task?.assigned_to) return;
    if (task.last_assignee_notified_to === task.assigned_to) return;

    const { data: assignee } = await supabaseAdmin
      .from('users')
      .select('id, name, telegram_id')
      .eq('id', task.assigned_to)
      .single();

    if (!assignee || !(assignee as any).telegram_id) return;

    const idPrefix = task.short_id ? `${task.short_id} ` : '';
    const safeTitle = escapeHtml(`${idPrefix}${task.task_name || '(untitled task)'}`);
    const dueLine = task.due_date
      ? `\n📅 <b>Due:</b> ${escapeHtml(task.due_date)}`
      : '';
    const priorityLine = task.priority
      ? `\n🔥 <b>Priority:</b> ${escapeHtml(String(task.priority))}`
      : '';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      ? (process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
          ? process.env.NEXT_PUBLIC_BASE_URL
          : `https://${process.env.NEXT_PUBLIC_BASE_URL}`)
      : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const dmText =
      `📋 <b>New task assigned to you</b> by <b>${escapeHtml(actorName)}</b>\n` +
      `\n<b>${safeTitle}</b>` +
      dueLine +
      priorityLine +
      `\n\n🔗 <a href="${baseUrl}/tasks">Open HQ</a>`;

    await sendTelegramMessage((assignee as any).telegram_id, dmText);

    await (supabaseAdmin as any)
      .from('tasks')
      .update({ last_assignee_notified_to: task.assigned_to })
      .eq('id', taskId);
  } catch (err) {
    console.error('[Telegram /task] DM-assignee inline failed:', err);
  }
}

/**
 * Send a Telegram message with an inline keyboard. Buttons are arranged
 * row-by-row — pass [[btn1, btn2]] for a single row of two buttons.
 */
async function sendTelegramMessageWithButtons(
  chatId: string,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
  threadId?: number,
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const body: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    };
    if (threadId) body.message_thread_id = threadId;
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!res.ok) {
      console.error('[Telegram Webhook] sendMessageWithButtons error:', await res.json().catch(() => ({})));
      return false;
    }
    // Return the sent message_id (truthy positive int) so callers that need to
    // edit the message later can capture it; falls back to `true`.
    const data = await res.json().catch(() => null);
    return (data?.result?.message_id as number | undefined) ?? true;
  } catch (err) {
    console.error('[Telegram Webhook] sendMessageWithButtons threw:', err);
    return false;
  }
}

/**
 * Edit a previously-sent message. Used to update the /task preview
 * after the user clicks ✅/❌ — replaces the buttons + body with the
 * outcome ("Created T-068" or "Cancelled"). Strips the inline keyboard
 * so the buttons disappear, preventing double-clicks.
 */
async function editMessageText(chatId: string, messageId: number, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/editMessageText`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
      },
    );
    if (!res.ok) {
      console.error('[Telegram Webhook] editMessageText error:', await res.json().catch(() => ({})));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Telegram Webhook] editMessageText threw:', err);
    return false;
  }
}

/**
 * Edit a message AND replace its inline keyboard. Used by the /tasks
 * list refresh — when a user clicks a done button, we re-render the
 * whole message (text + remaining task buttons) in place. Cleaner UX
 * than leaving stale buttons or sending a new list message.
 */
async function editMessageTextWithButtons(
  chatId: string,
  messageId: number,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/editMessageText`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        }),
      },
    );
    if (!res.ok) {
      console.error('[Telegram Webhook] editMessageTextWithButtons error:', await res.json().catch(() => ({})));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Telegram Webhook] editMessageTextWithButtons threw:', err);
    return false;
  }
}

/**
 * Acknowledge a callback_query so Telegram clears the loading spinner
 * on the user's button. Optional `text` shows as a brief toast — useful
 * for "Only the creator can confirm" and similar flash-feedback.
 */
async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || undefined }),
      },
    );
  } catch (err) {
    console.error('[Telegram Webhook] answerCallbackQuery threw:', err);
  }
}

/* ────────────────────── /bug + /req commands ─────────────────────── */

/**
 * Handle the /bug + /req commands — HHP Backlog Tab capture from
 * any chat the bot can see. Per the spec, this is the headline path
 * because it captures visual proof (screenshots) at the moment they
 * happen, before the reporter has switched contexts.
 *
 * Flow:
 *   1. Auth (team-only via users.telegram_id)
 *   2. Parse body via lib/backlogTelegramParser
 *   3. Insert backlog_items row, source = 'telegram_bug' / 'telegram_req'
 *   4. If a photo is attached (or replied to), download from Telegram
 *      → upload to Supabase Storage → insert backlog_attachments row
 *   5. Reply in-thread with the item's HHP link
 */
// ─── /submit — KOL Content Submission ──────────────────────────────
// Per the HQ TG Bot Content Submission spec (June 2026 v1). Andy's
// 2026-06-11 build decisions:
//   • Use existing campaign_kols (skip new kol_campaigns table)
//   • Add master_kols.telegram_id (one nullable text column)
//   • 👍 reaction on approval (light feedback, not silent)
//   • Defer bonus features (deliverable counts, dead-link checker) to v2

const CONTENT_TYPE_BY_PLATFORM: Record<string, { platform: string; content_type: string }> = {
  'x.com':       { platform: 'X (Twitter)', content_type: 'tweet' },
  'twitter.com': { platform: 'X (Twitter)', content_type: 'tweet' },
  'youtube.com': { platform: 'YouTube',     content_type: 'video' },
  'youtu.be':    { platform: 'YouTube',     content_type: 'video' },
  't.me':        { platform: 'Telegram',    content_type: 'tg_post' },
  'telegram.me': { platform: 'Telegram',    content_type: 'tg_post' },
};

/**
 * True if `host` is exactly `domain` or a real subdomain of it (`foo.domain`).
 * Guards against the classic `endsWith` false-positive where "netflix.com",
 * "vox.com" or "linux.com" would match `.endsWith('x.com')` and get
 * misclassified as X [fix 2026-07-14, per Jdot]. A bare `endsWith('x.com')`
 * matches any host whose name simply ends in those two letters + ".com".
 */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

/** Extract the hostname from a URL string, with a tolerant parse. */
function urlHost(input: string): string | null {
  try {
    const u = new URL(input.trim());
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * X/Twitter post date from the tweet ID (Snowflake). The numeric status ID
 * encodes the post time: ms = (id >> 22) + 1288834974657 (Twitter epoch), so
 * we can date an X post from the link ALONE — no API, no buttons — and bucket
 * a prior-week post into the right week even when it's submitted late
 * [Andy 2026-07-16]. Returns YYYY-MM-DD (UTC), or null when it isn't an X
 * status link / the derived date is out of a sane range. Telegram is handled
 * by the async resolver; YouTube keeps the submission-date default.
 */
function xPostedAtFromLink(link: string): string | null {
  const m = link.match(/(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d+)/i);
  if (!m) return null;
  try {
    const ms = Number(BigInt(m[1]) >> BigInt(22)) + 1288834974657;
    if (!Number.isFinite(ms)) return null;
    // Sanity window: after the first-ever tweet (2006) and no more than a day
    // ahead of now — a garbage ID falls back to the submission-date default.
    if (ms < 1140000000000 || ms > Date.now() + 86400000) return null;
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/** Auto-detect (platform, content_type) from a submitted link. */
function detectFromLink(link: string): { platform: string; content_type: string } {
  const host = urlHost(link);
  if (!host) return { platform: 'unknown', content_type: 'other' };
  const direct = CONTENT_TYPE_BY_PLATFORM[host];
  if (direct) return direct;
  // Fallback for subdomains we don't have a direct entry for (e.g.
  // m.youtube.com, mobile.twitter.com). Must be an exact host or a true
  // subdomain — NOT a bare endsWith, which would match e.g. netflix.com.
  if (hostMatches(host, 'youtube.com')) return CONTENT_TYPE_BY_PLATFORM['youtube.com'];
  if (hostMatches(host, 'twitter.com') || hostMatches(host, 'x.com')) return CONTENT_TYPE_BY_PLATFORM['x.com'];
  if (hostMatches(host, 't.me')) return CONTENT_TYPE_BY_PLATFORM['t.me'];
  return { platform: 'unknown', content_type: 'other' };
}

/**
 * The set of campaigns a KOL may `/submit` to right now.
 *
 * Base gates: assignment not deleted/hidden, hh_status 'Onboarded',
 * campaign Active + not archived + started, client active.
 *
 * Liveness gate [2026-07-09, per Andy]: the campaign's stored `end_date`
 * is NO LONGER used. A campaign counts as live if EITHER signal holds:
 *   - engagement still covers today (client's active stint
 *     covered_through >= today), OR
 *   - a lineup for the current week (or later) is on the board.
 * Either keeps it submittable — so a campaign whose engagement lapsed but
 * still has an in-flight lineup (and vice-versa) stays open.
 *
 * Used by both the initial picker (handleSubmitCommand) and the
 * stale-tap re-validation on the picker callback.
 */
async function getSubmittableCampaigns(kolId: string): Promise<Array<{
  id: string;
  name: string;
  client: { id: string; name: string } | null;
}>> {
  const todayIso = new Date().toISOString().slice(0, 10);
  // Monday of the current week (UTC) — the anchor for lineup `week_of`.
  const now = new Date();
  const dow = now.getUTCDay() || 7; // 1 (Mon) … 7 (Sun)
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (dow - 1));
  const mondayIso = monday.toISOString().slice(0, 10);

  const { data: assignments } = await (supabaseAdmin as any)
    .from('campaign_kols')
    .select('campaign:campaigns!inner(id, name, status, start_date, archived_at, client:clients(id, name, is_active))')
    .eq('master_kol_id', kolId)
    .is('deleted_at', null)
    // NULL-safe hidden filter: `.neq('hidden', true)` would also exclude
    // rows where hidden IS NULL (SQL: NULL <> true is not true).
    .or('hidden.is.null,hidden.eq.false')
    .eq('hh_status', 'Onboarded');

  const base = ((assignments ?? []) as Array<{ campaign: {
    id: string; name: string; status: string; start_date: string | null;
    archived_at: string | null;
    client: { id: string; name: string; is_active: boolean | null } | null;
  } | null }>)
    .map(a => a.campaign)
    .filter((c): c is NonNullable<typeof c> =>
      !!c
      && c.status === 'Active'
      && !c.archived_at
      && (!c.start_date || c.start_date <= todayIso)
      && c.client?.is_active === true
    );
  if (base.length === 0) return [];

  const campaignIds = base.map(c => c.id);
  const clientIds = Array.from(new Set(base.map(c => c.client?.id).filter(Boolean))) as string[];

  // Engagement coverage: a client is "covered" if its active stint's
  // covered_through is today or later.
  const coveredClientIds = new Set<string>();
  if (clientIds.length) {
    const { data: stints } = await (supabaseAdmin as any)
      .from('client_stints')
      .select('id, client_id')
      .eq('status', 'active')
      .in('client_id', clientIds);
    const stintClientById = new Map<string, string>(
      ((stints ?? []) as Array<{ id: string; client_id: string }>).map(s => [s.id, s.client_id]),
    );
    const stintIds = Array.from(stintClientById.keys());
    if (stintIds.length) {
      const { data: cov } = await (supabaseAdmin as any)
        .from('client_coverage')
        .select('stint_id, covered_through')
        .in('stint_id', stintIds);
      for (const row of (cov ?? []) as Array<{ stint_id: string; covered_through: string | null }>) {
        if (row.covered_through && row.covered_through >= todayIso) {
          const cid = stintClientById.get(row.stint_id);
          if (cid) coveredClientIds.add(cid);
        }
      }
    }
  }

  // Lineup presence: a lineup for the current week (or later) on the board.
  const lineupCampaignIds = new Set<string>();
  {
    const { data: lus } = await (supabaseAdmin as any)
      .from('campaign_lineups')
      .select('campaign_id, week_of')
      .in('campaign_id', campaignIds)
      .gte('week_of', mondayIso);
    for (const l of (lus ?? []) as Array<{ campaign_id: string }>) {
      lineupCampaignIds.add(l.campaign_id);
    }
  }

  return base
    .filter(c => (c.client?.id && coveredClientIds.has(c.client.id)) || lineupCampaignIds.has(c.id))
    .map(c => ({
      id: c.id,
      name: c.name,
      client: c.client ? { id: c.client.id, name: c.client.name } : null,
    }));
}

/**
 * `/submit <link>` — entry for KOL content submission. Single-shot when
 * KOL is on one active campaign; picker buttons when on 2+.
 *
 * Flow:
 *   1. Resolve caller; must be a KOL (master_kols row)
 *   2. Validate the link is a URL
 *   3. Find the KOL's active-campaign assignments via campaign_kols
 *   4. 0 campaigns → reject with hint
 *   5. 1 campaign → insert content_submissions immediately + confirm
 *   6. 2+ campaigns → stash in pending_submissions + send picker
 *
 * Validation (per spec):
 *   - URL must parse
 *   - No duplicate link for the same campaign (UNIQUE index enforces)
 *   - Campaign must not be in the future (start_date <= today)
 *   - KOL must be on the campaign (enforced by the campaign list above)
 *
 * Content type / platform auto-detected from the URL host. Spec edge case
 * about "this looks like a YouTube link but you selected Tweet" doesn't
 * apply here because the user doesn't select a type — the bot infers it.
 */
async function handleSubmitCommand(chatId: string, args: string[], message: any) {
  const threadId: number | undefined = message.message_thread_id || undefined;
  const caller = await resolveCaller(message);

  if (caller.kind !== 'kol') {
    // Soft reject. Different copy per caller type:
    //   - Team: explain /submit isn't for them
    //   - Unknown in group: explain the chat needs to be linked to a KOL
    //   - Unknown elsewhere: generic friendly reject
    let msg = '';
    if (caller.kind === 'team') {
      msg = '⚠️ <code>/submit</code> is for KOLs — log content through the dashboards.';
    } else if (message?.chat?.type && message.chat.type !== 'private') {
      // Came from a group/supergroup but the group isn't linked to a KOL.
      msg = "This chat isn't linked to a KOL yet. A HoloHive team member can link it on /crm/telegram. Then /submit will work here.";
    } else {
      msg = "I don't recognize you as a KOL. /submit only works in the per-KOL group chat your HoloHive contact set up. Ask them to add the bot to your chat.";
    }
    await sendTelegramMessage(chatId, msg, 'HTML', threadId);
    return;
  }

  // [2026-07-03] Sender-verification gate removed per Andy. The chat→KOL
  // link is the sole source of truth for attribution: anyone in a KOL-linked
  // group can /submit, and it's credited to the KOL that owns the chat. This
  // matches KR agency workflows where managers handle paperwork for talent.
  // Downstream gates (team Approve in the review queue → team Verify on the
  // Content Dashboard banner) still catch anything wrong before it hits
  // published metrics.

  // Auto-fix a doubled protocol — users occasionally paste
  // "https://https://t.me/…" (copy artifact / autocorrect). Collapse any
  // repeated leading protocol (with optional whitespace between) down to the
  // first one so the stored link + downstream metrics aren't broken
  // [Andy 2026-07-16].
  const link = args.join(' ').trim().replace(/^(https?:\/\/)(?:\s*https?:\/\/)+/i, '$1');
  if (!link) {
    await sendTelegramMessage(
      chatId,
      'Usage: <code>/submit https://x.com/you/status/123…</code>',
      'HTML',
      threadId,
    );
    return;
  }
  if (!urlHost(link)) {
    await sendTelegramMessage(
      chatId,
      "That doesn't look like a valid URL. Paste the full link including <code>https://</code>.",
      'HTML',
      threadId,
    );
    return;
  }

  // Pull the KOL's active-campaign list via campaign_kols + campaigns.
  // Liveness gate: engagement-covers-today OR a current-week lineup exists.
  // Campaign end_date is no longer used — see getSubmittableCampaigns.
  const activeCampaigns = await getSubmittableCampaigns(caller.id);

  if (activeCampaigns.length === 0) {
    await sendTelegramMessage(
      chatId,
      "You're not on any active campaigns right now. If you think this is wrong, ping your Holo Hive contact.",
      'HTML',
      threadId,
    );
    return;
  }

  // Auto-detect platform + content_type from the URL.
  const detected = detectFromLink(link);

  if (activeCampaigns.length === 1) {
    // Single campaign — skip the picker per spec.
    await finalizeSubmission({
      chatId,
      threadId,
      kolId: caller.id,
      kolName: caller.name,
      campaignId: activeCampaigns[0].id,
      campaignName: activeCampaigns[0].name,
      displayName: activeCampaigns[0].client?.name || activeCampaigns[0].name,
      link,
      platform: detected.platform,
      contentType: detected.content_type,
    });
    return;
  }

  // Multi-campaign — stash and ask. Telegram callback_data caps at 64 bytes
  // so we use a pending_submissions row to hold the link.
  // [2026-07-05 AUDIT-FIX] Opportunistic cleanup: abandoned pickers used
  // to accumulate forever (rows were only deleted on pick/cancel taps).
  // Sweep anything older than 7 days on each new /submit — cheap, and
  // keeps the table from growing unbounded without needing a cron.
  await (supabaseAdmin as any)
    .from('pending_submissions')
    .delete()
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const { data: pending, error: pErr } = await (supabaseAdmin as any)
    .from('pending_submissions')
    .insert({
      kol_telegram_id: caller.tgUserId,
      kol_id: caller.id,
      link,
    })
    .select('id')
    .single();
  if (pErr || !pending?.id) {
    console.error('[/submit] pending_submissions insert failed:', pErr);
    await sendTelegramMessage(chatId, '⚠️ Bot hiccup. Try again in a moment.', 'HTML', threadId);
    return;
  }

  // [2026-06-12 FIX] Telegram callback_data has a 64-byte hard limit. Two
  // full UUIDs + "subm:pick::" would be 83 bytes — the message silently
  // fails to send and the bot appears unresponsive. We use only the first
  // 8 chars of the campaign UUID (plenty unique within this KOL's small
  // active-campaign set) and resolve back to the full id on callback.
  // Prefer the CLIENT name in the button label — KOLs identify their
  // work by the client they're delivering for (Venice, Fogo, Altura),
  // not by our internal campaign name ("Venice Korea Expansion").
  // Fall back to campaign name if a campaign has no client wired up.
  const buttons = activeCampaigns.map(c => [{
    text: c.client?.name || c.name,
    callback_data: `subm:pick:${pending.id}:${c.id.slice(0, 8)}`,
  }]);
  buttons.push([{ text: '❌ Cancel', callback_data: `subm:cancel:${pending.id}` }]);
  await sendTelegramMessageWithButtons(
    chatId,
    `Which campaign is this for?\n<i>Link:</i> ${escapeHtml(link)}`,
    buttons,
    threadId,
  );
}

/**
 * Insert a content_submissions row + send confirmation to KOL + forward to
 * the team review channel with Approve/Reject buttons.
 *
 * Returns the new submission id or null if the insert was rejected (e.g.
 * duplicate link via the unique partial index — UNIQUE on
 * (campaign_id, link) WHERE status != 'rejected').
 */
async function finalizeSubmission(opts: {
  chatId: string;
  threadId: number | undefined;
  kolId: string;
  kolName: string;
  campaignId: string;
  campaignName: string;
  /** KOL-facing label for the receipt — client name preferred, campaign name fallback. */
  displayName: string;
  link: string;
  platform: string;
  contentType: string;
  /**
   * When provided, the success receipt EDITS this existing message (the
   * campaign picker) instead of sending a fresh one — one message per
   * submission in the multi-campaign flow. Omitted on the single-campaign
   * auto-pick path, which has no prior bot message to edit.
   */
  editTarget?: { chatId: string; messageId: number };
}): Promise<string | null> {
  // [2026-06-12] F3 dual-write: also create the canonical content_items
  // row so the rest of HHP (dashboards, leaderboards, lineup_slots.status)
  // can read a single source. content_submissions stays for v1 review
  // queue compat; eventually approval there will just flip status here.
  // [2026-07-05 AUDIT-FIX] supabase-js builders resolve {data, error} and
  // never reject — the previous .then()/.catch() chain silently swallowed
  // EVERY mirror-insert failure (including non-dup CHECK violations),
  // which also skewed the SPA live counts that read content_items.
  // Post date: X links are dated exactly from the tweet-ID Snowflake at submit
  // time (xPostedAtFromLink); Telegram links are corrected later by the async
  // resolver; YouTube (and anything else) keeps today's date. The SPA buckets
  // this-week counts by posted_at [per Andy + Jdot 2026-07-15], so an X post
  // made in a prior week but submitted late now lands in the right week
  // without any manual tap [Andy 2026-07-16].
  const postedAtDefault = new Date().toISOString().slice(0, 10);
  const postedAt = xPostedAtFromLink(opts.link) ?? postedAtDefault;
  {
    const { error: mirrorErr } = await (supabaseAdmin as any)
      .from('content_items')
      .insert({
        kol_id: opts.kolId,
        campaign_id: opts.campaignId,
        type: opts.contentType,
        link: opts.link,
        status: 'submitted',
        posted_at: postedAt,
      });
    // 23505 (duplicate link) is expected + idempotent; the staging-row
    // dup path below handles user feedback. Warn on anything else.
    if (mirrorErr && mirrorErr.code !== '23505') {
      console.warn('[/submit F3] content_items mirror insert failed:', mirrorErr);
    }
  }

  // [2026-06-12] Per Appendix v3 F2 + Andy: kol_id + campaign_id FKs are
  // the only authoritative identity. Display names render live via JOIN.
  // kol_telegram_id, kol_name, campaign_name columns were dropped.
  const { data: row, error } = await (supabaseAdmin as any)
    .from('content_submissions')
    .insert({
      kol_id: opts.kolId,
      campaign_id: opts.campaignId,
      link: opts.link,
      platform: opts.platform,
      content_type: opts.contentType,
      status: 'pending_review',
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique_violation — duplicate link for this campaign.
    if ((error as any).code === '23505') {
      // Look up the existing submission's date for a friendly message.
      const { data: dup } = await (supabaseAdmin as any)
        .from('content_submissions')
        .select('submitted_at, status')
        .eq('campaign_id', opts.campaignId)
        .eq('link', opts.link)
        .neq('status', 'rejected')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const when = dup?.submitted_at
        ? formatDate(dup.submitted_at)
        : 'earlier';
      await sendTelegramMessage(
        opts.chatId,
        `⚠️ This link was already submitted on ${escapeHtml(when)}. No action needed.`,
        'HTML',
        opts.threadId,
      );
      return null;
    }
    console.error('[/submit] content_submissions insert failed:', error);
    await sendTelegramMessage(opts.chatId, '⚠️ Bot hiccup. Try again in a moment.', 'HTML', opts.threadId);
    return null;
  }

  const submissionId = (row as { id: string }).id;
  const submittedAt = new Date();
  const submittedLabel = formatDateTime(submittedAt);

  // [2026-07-08] Per Andy: acknowledge every successful /submit. The
  // single-campaign auto-pick used to fire silently (only the multi-campaign
  // picker edit gave feedback), so KOLs had no signal it worked.
  // [2026-07-09] Per Andy: in the multi-campaign flow, EDIT the picker
  // message into the receipt rather than sending a second message. The
  // single-campaign path (no editTarget) still sends a fresh receipt.
  // The receipt reads "…, pending review." on submit; on team Approve the
  // review handler edits THIS message to drop the tail ("…, submitted for X.").
  // We record the receipt's (chat_id, message_id) on the submission so the
  // approve handler can find it.
  // [2026-07-16] Post-date correction buttons removed per Andy. The async
  // resolver auto-fills the real Telegram post date; X/YouTube keep the
  // submission-date default. Receipt is now a plain acknowledgement. The
  // pdate: callback handler is kept so taps on already-sent receipts still work.
  const receiptText = `✅ Got it — submitted for <b>${escapeHtml(opts.displayName)}</b>, pending review.`;
  let receiptChatId: string | null = null;
  let receiptMessageId: number | null = null;
  if (opts.editTarget) {
    await editMessageText(opts.editTarget.chatId, opts.editTarget.messageId, receiptText);
    receiptChatId = opts.editTarget.chatId;
    receiptMessageId = opts.editTarget.messageId;
  } else {
    const sent = await sendTelegramMessage(opts.chatId, receiptText, 'HTML', opts.threadId);
    receiptChatId = opts.chatId;
    receiptMessageId = typeof sent === 'number' ? sent : null;
  }
  if (receiptChatId && receiptMessageId) {
    await (supabaseAdmin as any)
      .from('content_submissions')
      .update({ kol_receipt_chat_id: receiptChatId, kol_receipt_message_id: receiptMessageId })
      .eq('id', submissionId);
  }

  // Forward to the team review channel.
  await forwardSubmissionToReviewChannel({
    submissionId,
    kolName: opts.kolName,
    campaignName: opts.campaignName,
    contentType: opts.contentType,
    platform: opts.platform,
    link: opts.link,
    submittedAt: submittedLabel,
  });

  // [2026-06-12] Fire the Submission-Progress Alert to the campaign's
  // tg_ops_group_id. Bot counts live posts + shows target cadence + tells
  // team when a day is full. Safe to call; suppresses silently if no
  // ops group configured.
  await sendSubmissionProgressAlert({
    campaignId: opts.campaignId,
    campaignName: opts.campaignName,
    kolName: opts.kolName,
  });

  return submissionId;
}

/**
 * Send a submission to the configured internal review channel with
 * Approve / Reject inline buttons. Channel ID lives in app_settings
 * (key: content_submissions_channel_id) so ops can change it without
 * a Vercel redeploy. Skips silently if no channel is set (logs).
 */
/**
 * [2026-06-12] HHP Submission-Progress Alert — fires on every successful
 * /submit AND on every team Approve [2026-07-16]. Posts day-split + daily
 * quota push to the global SPA chat. Bot counts; team paces. The approve fire
 * is the authoritative one: liveCount reads `contents`, whose rows are created
 * at approval, so the approve fire is the moment the count actually changes.
 *
 * [2026-06-30] Destination consolidated to a single global chat
 * (app_settings.spa_chat_id + spa_chat_thread_id) to match the
 * other team-wide TG sections (lineup proposals, lineup confirms,
 * content review). Falls back to campaigns.tg_ops_group_id only
 * when the global setting is unset (legacy escape hatch — will be
 * dropped once /admin/telegram-comm is configured).
 *
 * Data sources:
 *   - Live count: contents WHERE campaign + status live + activation_date this
 *     week, deduped by multipost_group_id (a multi-post deliverable counts once)
 *   - Planned count: lineup_slots for campaign's current confirmed week
 *   - KOL name + campaign name: included in the body so a single shared
 *     chat can route alerts from all campaigns
 *
 * Day-split: 1-4 KOLs → 2-day, 5+ → 3-day. Daily quota = ceil(planned/days).
 * Push line appears when today's count hits quota.
 *
 * Edge cases: no confirmed lineup → omit % + split + push line. No
 * destination configured anywhere → suppress + log warning.
 */
async function sendSubmissionProgressAlert(opts: {
  campaignId: string;
  campaignName: string;
  kolName: string;
}) {
  // Resolve destination: global SPA chat first, fall back to the
  // per-campaign ops chat only when the global setting is unset.
  const [chatSetting, threadSetting, campaignRes] = await Promise.all([
    (supabaseAdmin as any).from('app_settings').select('value').eq('key', 'spa_chat_id').maybeSingle(),
    (supabaseAdmin as any).from('app_settings').select('value').eq('key', 'spa_chat_thread_id').maybeSingle(),
    (supabaseAdmin as any)
      .from('campaigns')
      .select('id, name, tg_ops_group_id, start_date')
      .eq('id', opts.campaignId)
      .maybeSingle(),
  ]);
  const campaign = (campaignRes as any)?.data ?? null;
  const globalChatId = (chatSetting as any)?.data?.value as string | undefined;
  const globalThreadIdRaw = (threadSetting as any)?.data?.value as string | undefined;
  const opsGroup = globalChatId || campaign?.tg_ops_group_id;
  const targetThreadId = globalChatId && globalThreadIdRaw
    ? parseInt(globalThreadIdRaw, 10)
    : undefined;
  if (!opsGroup) {
    console.log('[progress-alert] No spa_chat_id (or campaigns.tg_ops_group_id) — suppressed.');
    return;
  }

  // Compute this-week boundary. Anchors to the campaign's start_date
  // (which via the stint-derive trigger reflects the stint's earliest
  // term). If the campaign has no start_date, fall back to the plain
  // Monday-of-this-week anchor.
  const today = new Date();
  let weekStart: Date;
  const campaignWeek = campaign?.start_date ? getCampaignWeek(campaign.start_date, today) : null;
  if (campaignWeek) {
    weekStart = new Date(campaignWeek.week1Monday);
    weekStart.setUTCDate(campaignWeek.week1Monday.getUTCDate() + (campaignWeek.weekNumber - 1) * 7);
    weekStart.setUTCHours(0, 0, 0, 0);
  } else {
    const dow = today.getUTCDay() || 7; // 1-7 ISO
    weekStart = new Date(today);
    weekStart.setUTCDate(today.getUTCDate() - (dow - 1));
    weekStart.setUTCHours(0, 0, 0, 0);
  }

  // Live count: content that went LIVE this week, read from `contents` — the
  // authoritative table every dashboard/budget/public page uses — bucketed by
  // `activation_date` (the go-live date) [Andy 2026-07-16]. Was reading the
  // sparse `content_items` /submit-mirror (~48 rows, bot submissions only), so
  // any post logged directly in the Content Dashboard was invisible and the
  // alert read "0 of X live" while posts were plainly live. contents.activation_date
  // stays consistent with the KOL-reported post date: on approval,
  // contentSubmissionApproval copies content_items.posted_at (X links dated from
  // the tweet-ID Snowflake at /submit) into activation_date, so a prior-week X
  // post submitted late still buckets into the right week here. status='posted'
  // is the only live status; pending/scheduled/pending_verification are excluded.
  // activation_date is a DATE, so compare on YYYY-MM-DD; each alert recomputes
  // live, so a later status/date change self-corrects on the next ping.
  const weekStartDate = weekStart.toISOString().slice(0, 10);
  const todayStart = new Date(today);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayDate = todayStart.toISOString().slice(0, 10);

  // Dedupe by multipost_group_id so a KOL who logs one deliverable as several
  // posts counts once — matching how the Content Dashboard / budget dedupe.
  // Rows with a NULL group each count on their own (key falls back to id).
  const dedupeCount = (
    rows: Array<{ id: string; multipost_group_id: string | null }> | null,
  ) => new Set((rows ?? []).map(r => r.multipost_group_id ?? r.id)).size;

  const { data: liveRows } = await (supabaseAdmin as any)
    .from('contents')
    .select('id, multipost_group_id')
    .eq('campaign_id', opts.campaignId)
    .in('status', ['posted', 'published', 'live'])
    .gte('activation_date', weekStartDate);
  const liveCount = dedupeCount(liveRows);

  const { data: todayRows } = await (supabaseAdmin as any)
    .from('contents')
    .select('id, multipost_group_id')
    .eq('campaign_id', opts.campaignId)
    .in('status', ['posted', 'published', 'live'])
    .gte('activation_date', todayDate);
  const todayCount = dedupeCount(todayRows);

  // Planned count = KOL slots in THIS week's confirmed lineup.
  // Schema: campaign_lineups → lineup_angles (lineup_id) → lineup_slots
  // (angle_id). Match the confirmed lineup by week_number when we have the
  // campaign week (same getCampaignWeek anchor the LineupsTab uses); fall
  // back to week_of (the Monday) when the campaign has no start_date.
  // [2026-07-09] Was querying non-existent columns (campaign_lineups
  // .week_start_date + lineup_slots.lineup_id), so plannedCount was always
  // 0 and every alert read "No confirmed lineup yet."
  let lineupQuery = (supabaseAdmin as any)
    .from('campaign_lineups')
    .select('id')
    .eq('campaign_id', opts.campaignId)
    .eq('status', 'confirmed');
  lineupQuery = campaignWeek
    ? lineupQuery.eq('week_number', campaignWeek.weekNumber)
    : lineupQuery.eq('week_of', weekStart.toISOString().slice(0, 10));
  const { data: lineup } = await lineupQuery
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let plannedCount = 0;
  if (lineup?.id) {
    const { data: angles } = await (supabaseAdmin as any)
      .from('lineup_angles')
      .select('id')
      .eq('lineup_id', lineup.id);
    const angleIds = ((angles ?? []) as Array<{ id: string }>).map(a => a.id);
    if (angleIds.length) {
      const { data: slots } = await (supabaseAdmin as any)
        .from('lineup_slots')
        .select('id')
        .in('angle_id', angleIds);
      plannedCount = (slots ?? []).length;
    }
  }

  // Day-split rule
  const days = plannedCount >= 5 ? 3 : 2;
  const dailyQuota = plannedCount > 0 ? Math.ceil(plannedCount / days) : 0;
  const quotaMet = todayCount >= dailyQuota && dailyQuota > 0;

  // Build the alert message. Header is template-driven — editable on
  // /admin/telegram-comm; the progress breakdown below stays generated.
  const spaTemplate = await getTemplate(supabaseAdmin, 'tmpl_spa_header');
  const lines: string[] = renderTemplate(spaTemplate, {
    campaign: escapeHtml(opts.campaignName),
    kol: escapeHtml(opts.kolName),
  }).split('\n');
  if (plannedCount > 0) {
    const pct = Math.round((liveCount / plannedCount) * 100);
    lines.push(`${liveCount} of ${plannedCount} live this week (${pct}%).`);
    lines.push(`Target: ${days}-day split, about ${dailyQuota}/day.`);
    // 100% completion ping. Naturally fires exactly once per week: at
    // the moment liveCount == plannedCount the count is queried live
    // and includes the submission that just came in. Subsequent posts
    // give liveCount > plannedCount so this branch skips.
    if (liveCount === plannedCount) {
      lines.push('');
      lines.push(`🎉 Week goal hit — ${plannedCount}/${plannedCount} live.`);
    } else if (quotaMet) {
      lines.push('');
      lines.push(`✅ Today's quota met (${todayCount} of ${dailyQuota}).`);
      lines.push('Push anyone still drafting today to post tomorrow.');
    }
  } else {
    // No confirmed lineup: omit the breakdown per spec edge case
    lines.push(`${liveCount} live this week.`);
    lines.push('<i>No confirmed lineup yet.</i>');
  }

  await sendTelegramMessage(opsGroup, lines.join('\n'), 'HTML', targetThreadId);
}

async function forwardSubmissionToReviewChannel(opts: {
  submissionId: string;
  kolName: string;
  campaignName: string;
  contentType: string;
  platform: string;
  link: string;
  submittedAt: string;
}): Promise<void> {
  const { data: chanRow } = await (supabaseAdmin as any)
    .from('app_settings')
    .select('value')
    .eq('key', 'content_submissions_channel_id')
    .maybeSingle();
  let channelId = (chanRow as any)?.value;
  if (!channelId) {
    // [2026-07-05 AUDIT-FIX] Previously a silent black hole: the
    // submission landed in the DB but nobody was notified, so it sat
    // unreviewed forever. Fall back to the terminal chat (same one
    // cron-health-check alerts) — the Approve/Reject callbacks work
    // from any chat, so review still functions end-to-end.
    const fallback = process.env.TELEGRAM_TERMINAL_CHAT_ID;
    if (!fallback) {
      console.error('[/submit] content_submissions_channel_id not configured AND no TELEGRAM_TERMINAL_CHAT_ID fallback — submission', opts.submissionId, 'has no review surface');
      return;
    }
    console.warn('[/submit] content_submissions_channel_id not configured; forwarding review card to terminal chat');
    channelId = fallback;
  }
  const usingFallbackChat = !(chanRow as any)?.value;
  const { data: threadRow } = await (supabaseAdmin as any)
    .from('app_settings')
    .select('value')
    .eq('key', 'content_submissions_channel_thread_id')
    .maybeSingle();
  const threadIdRaw = (threadRow as any)?.value;
  // The thread setting belongs to the configured channel — never apply
  // it to the fallback terminal chat (wrong-thread sends fail outright).
  const threadId = !usingFallbackChat && threadIdRaw ? parseInt(threadIdRaw, 10) : undefined;

  // Review card body is template-driven — editable on /admin/telegram-comm.
  // The Approve/Reject buttons are attached below regardless of template.
  const cardTemplate = await getTemplate(supabaseAdmin, 'tmpl_content_review_card');
  const body = renderTemplate(cardTemplate, {
    kol: escapeHtml(opts.kolName),
    campaign: escapeHtml(opts.campaignName),
    type: escapeHtml(opts.contentType),
    platform: escapeHtml(opts.platform),
    link: escapeHtml(opts.link),
    submitted: escapeHtml(opts.submittedAt),
  });

  const buttons = [[
    { text: '✅ Approve', callback_data: `subm:approve:${opts.submissionId}` },
    { text: '❌ Reject',  callback_data: `subm:reject:${opts.submissionId}` },
  ]];

  // The button-send helper returns boolean; we don't capture the resulting
  // message_id because the review callback handler already has it via
  // cq.message.message_id at tap time. v2 could swap this for a richer
  // helper that returns the full sendMessage response if needed (e.g. to
  // build an external admin queue surface that needs the message ref).
  await sendTelegramMessageWithButtons(channelId, body, buttons, threadId);
}

/**
 * Handle subm:* button callbacks. Encoding constraints: Telegram caps
 * callback_data at 64 bytes, so two full UUIDs don't fit. We pass the
 * pending row UUID (36) + an 8-char campaign UUID prefix and resolve
 * the prefix back to the full campaign in the picker handler.
 *
 *   subm:pick:<pending_id>:<campaign_id_prefix8>  — KOL chose a campaign
 *   subm:cancel:<pending_id>                       — KOL cancelled the picker
 *   subm:approve:<submission_id>                   — team approved
 *   subm:reject:<submission_id>                    — team rejected (generic reason)
 */
/**
 * `pdate:<content_item_id>:<daysAgo>` — post-date buttons on the /submit
 * receipt. Sets content_items.posted_at back N days (UTC) so the SPA buckets a
 * backfilled post into the week it actually went live [Andy + Jdot 2026-07-15].
 * Re-renders the receipt with the new date; the SPA self-heals on the next ping.
 */
async function handlePostDateCallback(cq: any) {
  const callbackId: string = cq.id;
  const parts = (cq.data || '').split(':');
  const contentItemId = parts[1];
  const daysAgo = Math.max(0, Math.min(31, parseInt(parts[2], 10) || 0));
  const chatId = cq.message?.chat?.id?.toString();
  const messageId = cq.message?.message_id;

  if (!contentItemId) {
    await answerCallbackQuery(callbackId, 'Expired — resubmit if needed.');
    return;
  }

  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  const postedAt = d.toISOString().slice(0, 10);

  const { error } = await (supabaseAdmin as any)
    .from('content_items')
    // 'manual' → the Telegram auto-detector will never override this.
    .update({ posted_at: postedAt, posted_at_source: 'manual' })
    .eq('id', contentItemId);
  if (error) {
    console.warn('[pdate] posted_at update failed:', error);
    await answerCallbackQuery(callbackId, 'Could not update. Try again.');
    return;
  }

  await answerCallbackQuery(callbackId, `Post date set to ${formatDate(postedAt)}.`);

  // Re-render the receipt: keep the first line (submission ack), refresh the
  // date line, keep the buttons so the date can be re-adjusted (incl. reset).
  if (chatId && messageId) {
    const firstLine = String(cq.message?.text || '').split('\n')[0] || '✅ Got it — submitted.';
    const newText = `${escapeHtml(firstLine)}\n📅 Posted <b>${escapeHtml(formatDate(postedAt))}</b>. Tap to change.`;
    const buttons = [[
      { text: 'Today', callback_data: `pdate:${contentItemId}:0` },
      { text: 'Yesterday', callback_data: `pdate:${contentItemId}:1` },
      { text: '2d', callback_data: `pdate:${contentItemId}:2` },
      { text: '3d', callback_data: `pdate:${contentItemId}:3` },
      { text: '4d', callback_data: `pdate:${contentItemId}:4` },
      { text: '5d', callback_data: `pdate:${contentItemId}:5` },
    ]];
    await editMessageTextWithButtons(chatId, messageId, newText, buttons);
  }
}

async function handleSubmCallback(cq: any) {
  const callbackId: string = cq.id;
  const data: string = cq.data || '';
  const parts = data.split(':');
  const action = parts[1];
  const messageChatId = cq.message?.chat?.id?.toString();
  const messageId = cq.message?.message_id;

  if (action === 'pick' || action === 'cancel') {
    const pendingId = parts[2];
    // pick: parts[3] is the 8-char campaign UUID prefix; cancel: undefined.
    const campaignIdPrefix = parts[3];
    await handleSubmPickerCallback(cq, action, pendingId, campaignIdPrefix);
    return;
  }
  if (action === 'approve' || action === 'reject') {
    const submissionId = parts[2];
    await handleSubmReviewCallback(cq, action, submissionId);
    return;
  }
  await answerCallbackQuery(callbackId, 'Unknown action.');
  void messageChatId; void messageId; // touched in sub-handlers
}

async function handleSubmPickerCallback(
  cq: any,
  action: 'pick' | 'cancel',
  pendingId: string,
  /**
   * For 'pick': the first 8 chars of the campaign UUID. Encoded short
   * because Telegram's callback_data limit is 64 bytes and two full
   * UUIDs would overflow. Resolved to the full campaign by joining
   * through campaign_kols (the KOL's active campaigns are a small set,
   * so prefix collisions are functionally impossible). For 'cancel':
   * unused — pass undefined.
   */
  campaignIdPrefix: string | undefined,
) {
  const callbackId: string = cq.id;
  const messageChatId = cq.message?.chat?.id?.toString();
  const messageId = cq.message?.message_id;

  // Permission: only the KOL who started /submit can tap. We don't bake the
  // TG id into callback_data because the pending row already knows.
  const tapperTgUserId = cq.from?.id?.toString();
  const { data: pending } = await (supabaseAdmin as any)
    .from('pending_submissions')
    .select('id, kol_telegram_id, kol_id, link, created_at')
    .eq('id', pendingId)
    .maybeSingle();
  if (!pending) {
    await answerCallbackQuery(callbackId, 'Picker expired. Send /submit again.');
    return;
  }
  // [2026-07-05 AUDIT-FIX] Picker TTL — buttons on old messages never
  // expire client-side, so cap server-side at 48h (same spirit as the
  // PSG 10-min confirm window, scaled for the KOL workflow).
  const PICKER_TTL_MS = 48 * 60 * 60 * 1000;
  if (pending.created_at && Date.now() - new Date(pending.created_at).getTime() > PICKER_TTL_MS) {
    await (supabaseAdmin as any).from('pending_submissions').delete().eq('id', pendingId);
    if (messageChatId && messageId) {
      await editMessageText(messageChatId, messageId, '⌛ <i>Picker expired. Send /submit again.</i>');
    }
    await answerCallbackQuery(callbackId, 'Picker expired. Send /submit again.');
    return;
  }
  if (pending.kol_telegram_id !== tapperTgUserId) {
    await answerCallbackQuery(callbackId, 'Only the KOL who started /submit can tap these.');
    return;
  }

  if (action === 'cancel') {
    await (supabaseAdmin as any).from('pending_submissions').delete().eq('id', pendingId);
    if (messageChatId && messageId) {
      await editMessageText(messageChatId, messageId, '↩ <i>Submission cancelled.</i>');
    }
    await answerCallbackQuery(callbackId, 'Cancelled.');
    return;
  }

  // Resolve the 8-char prefix back to the full campaign by walking the
  // KOL's active assignments. Constrains the search to ~1–10 rows so
  // collisions are functionally impossible.
  //
  // [2026-07-05] The requery applies the SAME eligibility chain as the
  // initial /submit picker (handleSubmitCommand). Picker buttons never
  // expire, so without this a tap on a stale message could submit to a
  // campaign that has since ended / been archived, an assignment that
  // was hidden or offboarded, or an inactive client.
  if (!campaignIdPrefix) {
    await answerCallbackQuery(callbackId, 'Missing campaign.');
    return;
  }
  const campaign = (await getSubmittableCampaigns(pending.kol_id))
    .find(c => c.id.startsWith(campaignIdPrefix));
  if (!campaign) {
    await answerCallbackQuery(callbackId, 'This campaign is no longer accepting submissions. Send /submit again.');
    return;
  }

  // Look up the KOL's display name
  const { data: kol } = await (supabaseAdmin as any)
    .from('master_kols')
    .select('name')
    .eq('id', pending.kol_id)
    .maybeSingle();
  const kolName = (kol as any)?.name || 'KOL';

  const detected = detectFromLink(pending.link);

  // Insert + confirm + forward. Same path as the single-campaign auto-pick.
  // [2026-07-09] Pass the picker message as editTarget so the ✅ receipt
  // EDITS the picker in place (one message, buttons cleared) instead of
  // sending a second confirmation.
  const submissionId = await finalizeSubmission({
    chatId: messageChatId,
    threadId: undefined,
    kolId: pending.kol_id,
    kolName,
    campaignId: campaign.id,
    campaignName: campaign.name,
    displayName: campaign.client?.name || campaign.name,
    link: pending.link,
    platform: detected.platform,
    contentType: detected.content_type,
    editTarget: messageChatId && messageId ? { chatId: messageChatId, messageId } : undefined,
  });

  await (supabaseAdmin as any).from('pending_submissions').delete().eq('id', pendingId);
  if (!submissionId && messageChatId && messageId) {
    // On failure (dup / insert error) finalizeSubmission sent its own ⚠️
    // message and did NOT edit the picker — close the picker out here.
    await editMessageText(messageChatId, messageId, '↩ Submission not saved — see message above.');
  }
  await answerCallbackQuery(callbackId);
}

async function handleSubmReviewCallback(
  cq: any,
  action: 'approve' | 'reject',
  submissionId: string,
) {
  const callbackId: string = cq.id;
  const messageChatId = cq.message?.chat?.id?.toString();
  const messageId = cq.message?.message_id;

  const teamMember = await resolveTeamMember(cq);
  if (!teamMember) {
    await answerCallbackQuery(callbackId, 'Team-only.');
    return;
  }

  // [2026-07-14, per Andy] Approve/reject is admin+ only — same bar as the
  // web platform (/api/content-submissions/[id]/review). Members can be team
  // and use other bot commands, but not gate content.
  const { data: reviewer } = await (supabaseAdmin as any)
    .from('users')
    .select('role')
    .eq('id', teamMember.id)
    .maybeSingle();
  const reviewerRole = (reviewer as any)?.role;
  if (reviewerRole !== 'admin' && reviewerRole !== 'super_admin') {
    await answerCallbackQuery(callbackId, 'Admins only — ask an admin to approve.');
    return;
  }

  // [2026-06-12] Render live names via JOIN per Appendix F2.
  const { data: sub } = await (supabaseAdmin as any)
    .from('content_submissions')
    .select(`
      id, kol_id, campaign_id, link, platform, content_type, status,
      kol_receipt_chat_id, kol_receipt_message_id,
      kol:master_kols!inner(id, name),
      campaign:campaigns!inner(id, name, client:clients(name))
    `)
    .eq('id', submissionId)
    .maybeSingle();
  if (!sub) {
    await answerCallbackQuery(callbackId, 'Submission not found.');
    return;
  }
  if (sub.status === 'approved' || sub.status === 'rejected') {
    await answerCallbackQuery(callbackId, `Already ${sub.status}.`);
    return;
  }
  const kolName: string = (sub as any).kol?.name ?? 'KOL';
  const campaignName: string = (sub as any).campaign?.name ?? 'Campaign';

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  // [2026-07-05 AUDIT-FIX] Conditional update — `.eq('status',
  // 'pending_review')` makes the DB the arbiter for concurrent taps.
  // The read-then-act check above can't stop two near-simultaneous
  // taps; without this the second tap would re-run the approve side
  // effects. `.select('id')` returns the rows actually updated: empty
  // means someone else won the race.
  const { data: updatedRows, error: updErr } = await (supabaseAdmin as any)
    .from('content_submissions')
    .update({
      status: nextStatus,
      reviewed_by: teamMember.id,
      reviewed_by_name: teamMember.name,
      reviewed_at: new Date().toISOString(),
      // v1 generic rejection reason. v2 will prompt the reviewer for a
      // specific reason via a force_reply prompt (see spec).
      rejection_reason: action === 'reject'
        ? 'Did not meet criteria. Contact your HoloHive lead for details.'
        : null,
    })
    .eq('id', submissionId)
    .eq('status', 'pending_review')
    .select('id');
  if (updErr) {
    console.error('[/submit] review update failed:', updErr);
    await answerCallbackQuery(callbackId, 'Update failed.');
    return;
  }
  if (!updatedRows || updatedRows.length === 0) {
    await answerCallbackQuery(callbackId, 'Already reviewed by someone else.');
    return;
  }

  // [2026-06-12] F3 mirror: flip the content_items row. Approve →
  // status=approved + approved_at + approved_by. Reject → status=rejected.
  // Best-effort; staging row is already the user-visible state.
  // [2026-07-05 AUDIT-FIX] Scoped by campaign_id — matching on link alone
  // flipped BOTH rows when the same link was submitted to two campaigns.
  await (supabaseAdmin as any)
    .from('content_items')
    .update(
      action === 'approve'
        ? {
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: teamMember.id,
            updated_at: new Date().toISOString(),
          }
        : { status: 'rejected', updated_at: new Date().toISOString() },
    )
    .eq('campaign_id', sub.campaign_id)
    .eq('link', sub.link)
    .neq('status', 'rejected');

  // On approve: create a `contents` row so the campaign Content Dashboard
  // reflects the submission. Without this the TG approval looked broken on
  // the campaign — content_submissions + content_items got flipped but the
  // Dashboard reads from `contents`. Web fallback does the same insert via
  // the shared helper; we share the helper so they can't drift.
  let approveSideEffectError: string | null = null;
  if (action === 'approve') {
    const result = await createApprovedContentsRow(supabaseAdmin as any, {
      submissionId,
      campaignId: (sub as any).campaign_id,
      kolId: (sub as any).kol_id,
      link: (sub as any).link,
      platform: (sub as any).platform,
      contentType: (sub as any).content_type,
    });
    if (result.error) {
      console.error('[/submit] contents insert on approve failed:', result.error);
      approveSideEffectError = result.error;
    }

    // [2026-07-09] Per Andy: on approve, edit the KOL's original /submit
    // receipt to drop the "pending review" tail — "…, submitted for X." —
    // so the KOL sees it went through. Best-effort; only if we recorded the
    // receipt's coordinates at submit time, and only when the row actually
    // landed (no side-effect error).
    if (!approveSideEffectError && (sub as any).kol_receipt_chat_id && (sub as any).kol_receipt_message_id) {
      const displayName = (sub as any).campaign?.client?.name || campaignName;
      await editMessageText(
        (sub as any).kol_receipt_chat_id,
        Number((sub as any).kol_receipt_message_id),
        `✅ Got it — submitted for <b>${escapeHtml(displayName)}</b>.`,
      );
    }

    // [2026-07-16] Re-fire the SPA now that the contents row exists — this is
    // the moment liveCount actually changes (it reads `contents`, written on
    // approve). The submit-time fire showed the prior approved state as a
    // heads-up; this fire reflects the newly-live post, so "of X live", the
    // 100% "week goal hit" ping, and the daily-quota nudge are all correct.
    // Only when the row landed — otherwise the count wouldn't have moved.
    if (!approveSideEffectError) {
      await sendSubmissionProgressAlert({
        campaignId: (sub as any).campaign_id,
        campaignName,
        kolName,
      });
    }
  } else if (action === 'reject') {
    // [2026-07-21] Per Andy: mirror the approve path on reject — edit the
    // KOL's original /submit receipt so "…, pending review." becomes a clear
    // rejection instead of sitting there implying it's still in the queue.
    // Best-effort; only if we recorded the receipt's coordinates at submit.
    if ((sub as any).kol_receipt_chat_id && (sub as any).kol_receipt_message_id) {
      const displayName = (sub as any).campaign?.client?.name || campaignName;
      await editMessageText(
        (sub as any).kol_receipt_chat_id,
        Number((sub as any).kol_receipt_message_id),
        `❌ Your <b>${escapeHtml(displayName)}</b> submission wasn’t approved. Message your HoloHive lead for details.`,
      );
    }
  }

  // Edit the review-channel message to reflect the decision (replaces the
  // buttons so it can't be tapped again). [2026-07-05 AUDIT-FIX] If the
  // contents insert failed, say so on the card — previously it read
  // "Approved" while no contents/payment row existed and re-tapping said
  // "Already approved" with no retry path. The warning tells the team to
  // add the content manually on the campaign page.
  if (messageChatId && messageId) {
    const tag = action === 'approve'
      ? (approveSideEffectError
          ? `⚠️ <b>Approved</b> by ${escapeHtml(teamMember.name)} — but the content row FAILED to create: <i>${escapeHtml(approveSideEffectError)}</i>. Add it manually on the campaign page.`
          : `✅ <b>Approved</b> by ${escapeHtml(teamMember.name)}`)
      : `❌ <b>Rejected</b> by ${escapeHtml(teamMember.name)}`;
    await editMessageText(
      messageChatId,
      messageId,
      [
        tag,
        `KOL: ${escapeHtml(kolName)}`,
        `Campaign: ${escapeHtml(campaignName)}`,
        `Link: ${escapeHtml((sub as any).link)}`,
      ].join('\n'),
    );
  }

  // No NEW KOL-facing message on approve/reject — instead both paths EDIT
  // the KOL's original /submit receipt in place (approve drops the "pending
  // review" tail; reject flips it to a rejection). The review-channel card
  // remains the team-facing record.

  await answerCallbackQuery(
    callbackId,
    action === 'approve'
      ? (approveSideEffectError ? 'Approved, but content row failed — see card.' : 'Approved.')
      : 'Rejected.',
  );
}

async function handleBacklogCommand(
  chatId: string,
  type: 'bug' | 'request',
  message: any,
) {
  const threadId: number | undefined = message.message_thread_id || undefined;
  const cmdName = type === 'bug' ? 'bug' : 'req';

  const teamMember = await resolveTeamMember(message);
  if (!teamMember) {
    await sendTelegramMessage(
      chatId,
      `⚠️ /${cmdName} is only available to team members. Ask Andy to map your Telegram ID.`,
      'HTML',
      threadId,
    );
    return;
  }

  // Body lives in either `text` (plain command) or `caption` (when
  // attached to a photo). The parser handles both via the same path.
  const text = (message.text || message.caption || '').trim();
  const { parseBacklogCommand } = await import('@/lib/backlogTelegramParser');
  const parsed = parseBacklogCommand(text);

  if (parsed.description === '(no description)') {
    await sendTelegramMessage(
      chatId,
      `Usage: <code>/${cmdName} #area description</code>\n` +
      `Example: <code>/${cmdName} #content-dashboard table headers are misaligned</code>\n` +
      `Areas: content-dashboard · kol-mastersheet · budget-dashboard · priority-dashboard · kol-cards · client-success · other`,
      'HTML',
      threadId,
    );
    return;
  }

  // Source ref — a link back to the originating TG message. The format
  // works for supergroups (chat IDs starting with -100). For private
  // chats or non-supergroups we leave it null; the reporter chat is
  // still findable via the team's bot logs.
  const sourceRef = buildTelegramMessageLink(chatId, message.message_id, threadId);

  // Insert the backlog row. RLS allows authenticated inserts; we use
  // the service-role client here (same auth context as every other
  // bot command).
  // Default assignee → Andy (spec section 3). Resolved at insert time
  // via the shared helper so this and the HHP modal path stay in
  // lock-step on who-gets-it.
  const { lookupDefaultAssigneeId } = await import('@/lib/backlogService');
  const defaultAssigneeId = await lookupDefaultAssigneeId(supabaseAdmin);

  const { data: item, error: insertErr } = await (supabaseAdmin as any)
    .from('backlog_items')
    .insert({
      type,
      area: parsed.area,
      title: parsed.title,
      description: parsed.description,
      reporter_id: teamMember.id,
      assignee_id: defaultAssigneeId,
      source: type === 'bug' ? 'telegram_bug' : 'telegram_req',
      source_ref: sourceRef,
    })
    .select('id, type, area')
    .single();

  if (insertErr || !item) {
    console.error('[Telegram /bug] insert failed:', insertErr);
    await sendTelegramMessage(
      chatId,
      '⚠️ Failed to log. Check server logs.',
      'HTML',
      threadId,
    );
    return;
  }

  // Photo capture. Two paths:
  //   • Direct: /bug + image in one message → message.photo is set
  //   • Reply-to: /bug as a reply to a previous photo → message.reply_to_message.photo
  // Both flows pull just the largest size (Telegram returns multiple
  // resolutions; the last is the highest-quality JPEG).
  const photoFileIds: string[] = [];
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    photoFileIds.push(message.photo[message.photo.length - 1].file_id);
  } else if (
    message.reply_to_message?.photo
    && Array.isArray(message.reply_to_message.photo)
    && message.reply_to_message.photo.length > 0
  ) {
    const replyPhoto = message.reply_to_message.photo;
    photoFileIds.push(replyPhoto[replyPhoto.length - 1].file_id);
  }

  let photoCount = 0;
  for (const fileId of photoFileIds) {
    try {
      await uploadTelegramPhotoToBacklog(item.id, teamMember.id, fileId);
      photoCount++;
    } catch (err) {
      console.error('[Telegram /bug] photo upload failed:', err);
      // Non-fatal — the item is already created; user can manually
      // attach a screenshot from the modal later.
    }
  }

  // Confirmation reply — links back to HHP so the reporter can verify
  // the item landed and edit if needed. Pretty area label so it reads
  // like the modal does.
  const AREA_LABELS: Record<string, string> = {
    content_dashboard: 'Content Dashboard',
    kol_mastersheet: 'KOL Mastersheet',
    budget_dashboard: 'Budget Dashboard',
    priority_dashboard: 'Priority Dashboard',
    kol_cards: 'KOL Cards',
    client_success: 'Client Success',
    other: 'Other',
  };
  const typeLabel = type === 'bug' ? 'Bug' : 'Request';
  const areaLabel = AREA_LABELS[item.area] || item.area;
  const appBase = process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_APP_BASE_URL
    || 'https://app.holohive.io';
  const portalUrl = `${appBase}/initiatives?tab=backlog&id=${item.id}`;

  const lines: string[] = [];
  lines.push(`✅ <b>${typeLabel} logged</b> · <i>${escapeHtml(areaLabel)}</i>`);
  lines.push(escapeHtml(parsed.title));
  if (photoCount > 0) {
    lines.push(`📎 ${photoCount} screenshot attached`);
  } else if (type === 'bug') {
    // Soft prompt — visual evidence is the headline value for bugs.
    lines.push(`<i>Tip: attach a screenshot next time for faster triage.</i>`);
  }
  lines.push(`<a href="${portalUrl}">View in HHP</a>`);

  await sendTelegramMessage(chatId, lines.join('\n'), 'HTML', threadId);
}

/**
 * Telegram supergroup chat IDs start with -100. The web link format
 * for jumping to a message in such a chat is:
 *   https://t.me/c/<id-without-the-100->/<message_id>
 * If the chat is inside a forum topic, the thread id slots in between:
 *   https://t.me/c/<id>/<thread_id>/<message_id>
 * For non-supergroups (private DMs, plain groups) there's no public
 * link format we can build server-side — those return ''.
 */
function buildTelegramMessageLink(
  chatId: string,
  messageId: number | undefined,
  threadId: number | undefined,
): string {
  if (!chatId.startsWith('-100') || !messageId) return '';
  const sansPrefix = chatId.slice(4);
  return threadId
    ? `https://t.me/c/${sansPrefix}/${threadId}/${messageId}`
    : `https://t.me/c/${sansPrefix}/${messageId}`;
}

/**
 * Download a single photo from Telegram by file_id and upload it to
 * the backlog-attachments Storage bucket. Inserts the backlog_attachments
 * metadata row pointing at the new path.
 *
 * Two-step pattern per Telegram's bot API:
 *   1. getFile(file_id) → returns a file_path
 *   2. GET https://api.telegram.org/file/bot<token>/<file_path>
 */
async function uploadTelegramPhotoToBacklog(
  itemId: string,
  uploaderId: string,
  fileId: string,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');

  // 1. getFile — resolves the file_id to a file_path on Telegram's CDN.
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const fileInfoJson = await fileInfoRes.json();
  if (!fileInfoJson.ok || !fileInfoJson.result?.file_path) {
    throw new Error(`getFile failed: ${JSON.stringify(fileInfoJson).slice(0, 200)}`);
  }
  const filePath: string = fileInfoJson.result.file_path;

  // 2. Download the raw bytes.
  const photoRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`,
  );
  if (!photoRes.ok) {
    throw new Error(`Photo download failed: HTTP ${photoRes.status}`);
  }
  const arrayBuffer = await photoRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Telegram photos arrive as JPEGs in practice; trust the
  // file_path extension as the source of truth.
  const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
  const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const storagePath = `${itemId}/tg-${Date.now()}-${fileId.slice(0, 12)}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('backlog-attachments')
    .upload(storagePath, buffer, { contentType, upsert: false });
  if (uploadErr) throw uploadErr;

  const { error: rowErr } = await (supabaseAdmin as any)
    .from('backlog_attachments')
    .insert({
      item_id: itemId,
      storage_path: storagePath,
      content_type: contentType,
      size_bytes: buffer.length,
      uploaded_by: uploaderId,
    });
  if (rowErr) throw rowErr;
}

/**
 * Handle incoming message from Telegram
 */
/**
 * Daily Pulse reply capture (DP.5/DP.6/DP.9).
 *
 * Gated hard so ordinary bot traffic never becomes a phantom blocker:
 * only a private DM, from a roster member, who was prompted today,
 * before the 12:00 UTC cutoff, and NOT a slash command (those are
 * handled by handleCommand and must never count). Classifies the reply
 * (clear / blocked / Friday win) and updates today's daily_pulse row.
 * Win and blocker are independent axes — a Friday reply can set both.
 * Returns true if it consumed the message as a pulse reply.
 */
async function handleDailyPulseReply(message: any): Promise<boolean> {
  try {
    if (message.chat?.type !== 'private') return false;
    const fromId = message.from?.id?.toString();
    if (!fromId) return false;
    const rawText = (message.text || '').trim();
    if (!rawText || rawText.startsWith('/')) return false; // commands never count

    const now = new Date();
    if (now.getUTCHours() >= PULSE_CUTOFF_HOUR_UTC) return false; // past the digest cutoff

    // Roster membership: resolve by immutable telegram_id.
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('telegram_id', fromId)
      .maybeSingle();
    if (!user) return false;

    // Must have been prompted today (the DM cron seeds the row + prompted_at).
    const pulseDate = pulseDateFor(now);
    const { data: row } = await supabaseAdmin
      .from('daily_pulse')
      .select('id, prompted_at, win_text')
      .eq('pulse_date', pulseDate)
      .eq('user_id', (user as any).id)
      .maybeSingle();
    if (!row || !(row as any).prompted_at) return false;

    const friday = isFridayUTC(now);
    const cls = classifyReply(rawText, friday);
    // Preserve an earlier win if this message didn't restate one.
    const winText = cls.winText ?? (row as any).win_text ?? null;

    await supabaseAdmin
      .from('daily_pulse')
      .update({
        status: cls.status,
        blocker_text: cls.status === 'blocked' ? cls.blockerText : null,
        win_text: winText,
        replied_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', (row as any).id);

    // Ack so the member knows it registered (and doesn't re-send).
    let ack = cls.status === 'clear' ? '✅ logged — clear' : '✅ logged';
    if (winText) ack += ' · win noted 🎉';
    await sendTelegramMessage(message.chat.id.toString(), ack, 'HTML');
    return true;
  } catch (err) {
    console.error('[Daily Pulse] reply capture failed:', err);
    return false;
  }
}

async function handleMessage(message: any) {
  const chatId = message.chat?.id?.toString();
  const chatTitle = message.chat?.title;
  const chatType = message.chat?.type; // 'group', 'supergroup', 'private'
  const messageId = message.message_id?.toString();
  const fromId = message.from?.id?.toString();
  const fromFirstName = message.from?.first_name;
  const fromLastName = message.from?.last_name;
  const fromUsername = message.from?.username;
  const messageText = message.text || message.caption || '[Media]';
  const messageDate = new Date(message.date * 1000); // Telegram sends Unix timestamp

  if (!chatId) {
    console.log('[Telegram Webhook] No chat ID in message');
    return;
  }

  // Handle commands (messages starting with /)
  if (messageText.startsWith('/')) {
    const parts = messageText.split(' ');
    const command = parts[0];
    const args = parts.slice(1);
    await handleCommand(chatId, command, args, message);
  }

  // Daily Pulse reply capture (self-gates on private DM + roster member +
  // prompted-today + pre-cutoff + non-command). Cheap no-op otherwise.
  await handleDailyPulseReply(message);

  // Track all chat types (groups, supergroups, and private DMs)
  // For DMs, use the user's name as the title
  const title = chatType === 'private'
    ? [fromFirstName, fromLastName].filter(Boolean).join(' ') || fromUsername || 'Unknown User'
    : chatTitle;

  // Track/update chat in telegram_chats table
  await trackChat(chatId, title, chatType, messageDate);

  // Store the message for chat identification
  const fromName = [fromFirstName, fromLastName].filter(Boolean).join(' ') || 'Unknown';
  const messageThreadId: number | undefined = message.message_thread_id;
  await storeMessage(chatId, messageId, fromId, fromName, fromUsername, messageText, messageDate, messageThreadId);

  // [Forum-topic capture, 2026-06-09] Threads in supergroups need
  // metadata so the BacklogSettingsDialog picker can list them
  // alongside their parent chat. Two events do this:
  //   1. Any message with message_thread_id → upsert a stub row in
  //      telegram_threads (we know it exists, name pending).
  //   2. forum_topic_created / forum_topic_edited → set the name.
  // Service-role write so RLS doesn't block.
  if (messageThreadId) {
    await trackThread(chatId, messageThreadId, messageDate);
  }
  if (message.forum_topic_created?.name && messageThreadId) {
    await upsertThreadName(chatId, messageThreadId, message.forum_topic_created.name);
  }
  if (message.forum_topic_edited?.name && messageThreadId) {
    await upsertThreadName(chatId, messageThreadId, message.forum_topic_edited.name);
  }
  // [2026-06-12] Retro-backfill: in a forum supergroup, every message in
  // a topic carries reply_to_message pointing at the topic-creation
  // message, which holds forum_topic_created.name. Topics that existed
  // BEFORE the bot joined never fire a forum_topic_created event — but
  // the first reply that flows through the bot will surface the name
  // via this path. Combined with the two events above, every topic with
  // any traffic eventually gets named.
  if (
    message.reply_to_message?.forum_topic_created?.name
    && messageThreadId
  ) {
    await upsertThreadName(
      chatId,
      messageThreadId,
      message.reply_to_message.forum_topic_created.name,
    );
  }

  // Check for Telegram/X links in KOL chats and forward to Content thread
  await forwardKolSocialLinks(chatId, chatTitle, fromName, messageText, messageDate);

  // Check if this chat ID matches any opportunity's gc field
  const { data: opportunities, error } = await supabaseAdmin
    .from('crm_opportunities')
    .select('id, name, gc')
    .eq('gc', chatId);

  if (error) {
    console.error('[Telegram Webhook] Error querying opportunities:', error);
    return;
  }

  // Check if the message is from our bot
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const botId = botToken ? botToken.split(':')[0] : null;
  const isFromBot = fromId === botId;

  // Check if the sender is a team member (has telegram_id in users table)
  let isTeamMember = false;
  if (fromId && !isFromBot) {
    const { data: teamMember } = await supabaseAdmin
      .from('users')
      .select('id, telegram_username')
      .eq('telegram_id', fromId)
      .single();
    isTeamMember = !!teamMember;

    // Opportunistically refresh telegram_username so /task can resolve
    // @-mentions to user IDs. Only writes when the value is missing or
    // has changed (Telegram lets users rename their handle), so steady-
    // state messages don't generate spurious UPDATEs. Best-effort —
    // never block downstream processing on the write.
    if (teamMember && fromUsername && (teamMember as any).telegram_username !== fromUsername) {
      supabaseAdmin
        .from('users')
        .update({ telegram_username: fromUsername })
        .eq('id', (teamMember as any).id)
        .then(({ error: updErr }) => {
          if (updErr) console.warn('[Telegram Webhook] telegram_username refresh failed:', updErr.message);
        });
    }
  }

  // Determine which field to update:
  // - Bot messages → last_reply_at
  // - Team member messages → last_team_message_at
  // - Lead/others messages → last_message_at
  const getUpdateField = () => {
    if (isFromBot) return 'last_reply_at';
    if (isTeamMember) return 'last_team_message_at';
    return 'last_message_at';
  };

  // Update all matching opportunities
  if (opportunities && opportunities.length > 0) {
    for (const opportunity of opportunities) {
      const updateField = getUpdateField();
      const senderType = isFromBot ? 'bot' : (isTeamMember ? 'team' : 'lead');

      const { error: updateError } = await supabaseAdmin
        .from('crm_opportunities')
        .update({
          [updateField]: messageDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', opportunity.id);

      if (updateError) {
        console.error('[Telegram Webhook] Error updating opportunity:', updateError);
      } else {
        console.log(`[Telegram Webhook] Updated ${updateField} for opportunity:`, {
          id: opportunity.id,
          name: opportunity.name,
          chatId,
          timestamp: messageDate.toISOString(),
          senderType
        });
      }
    }
  }
}

/**
 * Handle a `my_chat_member` update — fires whenever the bot's membership in
 * a chat changes (added, removed, promoted to admin, restricted, etc.).
 *
 * Without this, a brand-new group only registers in `telegram_chats` once
 * someone posts a message the bot can see. With it, the row is created
 * the moment the bot joins, so the chat appears in CRM → Telegram
 * immediately and the team can link it to an opportunity right away.
 *
 * Telegram update shape:
 *   {
 *     chat: { id, title, type },
 *     from: { id, ... },        // who changed the membership
 *     date: <unix>,
 *     old_chat_member: { user: <bot>, status: 'left' | 'kicked' | ... },
 *     new_chat_member: { user: <bot>, status: 'member' | 'administrator' | 'left' | 'kicked' | ... }
 *   }
 *
 * We only act on transitions INTO a chat (becoming a member/admin). Bot
 * removals are logged but the existing row is left intact for history.
 */
async function handleMyChatMember(update: any) {
  try {
    const chatId = update?.chat?.id?.toString();
    const chatTitle = update?.chat?.title || null;
    const chatType = update?.chat?.type || 'unknown';
    const newStatus: string | undefined = update?.new_chat_member?.status;
    const oldStatus: string | undefined = update?.old_chat_member?.status;

    if (!chatId) {
      console.log('[Telegram Webhook] my_chat_member missing chat id, skipping');
      return;
    }

    // Statuses where the bot is "in" the chat. Anything else means it
    // can't post / read until something changes.
    const ACTIVE = new Set(['member', 'administrator', 'creator', 'restricted']);
    const wasActive = oldStatus ? ACTIVE.has(oldStatus) : false;
    const isActive = newStatus ? ACTIVE.has(newStatus) : false;

    if (!wasActive && isActive) {
      // Bot was just added (or unrestricted). Register the chat so it
      // shows up in the UI even before anyone posts a message. Don't
      // bump message_count — no actual message arrived.
      console.log('[Telegram Webhook] Bot added to chat:', { chatId, chatTitle, chatType, newStatus });
      await trackChat(chatId, chatTitle, chatType, new Date(), { incrementMessageCount: false });
    } else if (wasActive && !isActive) {
      // Bot was removed / left / kicked. Just log — we keep the row so
      // history stays browsable in the CRM.
      console.log('[Telegram Webhook] Bot removed from chat:', { chatId, chatTitle, oldStatus, newStatus });
    } else {
      console.log('[Telegram Webhook] my_chat_member status change (no-op):', { chatId, oldStatus, newStatus });
    }
  } catch (error) {
    console.error('[Telegram Webhook] Error handling my_chat_member:', error);
    // Don't throw — Telegram should still get a 200.
  }
}

/**
 * Track/update chat info in telegram_chats table
 */
async function trackChat(
  chatId: string,
  title: string | null,
  chatType: string,
  messageDate: Date,
  options: {
    /** When false, message_count is NOT incremented and last_message_at is
     *  only set on insert. Use for membership-change events where there's
     *  no real message. Defaults to true (called from handleMessage). */
    incrementMessageCount?: boolean;
  } = {},
) {
  const incrementMessageCount = options.incrementMessageCount ?? true;
  try {
    // Check if chat already exists
    const { data: existingChat } = await supabaseAdmin
      .from('telegram_chats')
      .select('id, message_count')
      .eq('chat_id', chatId)
      .single();

    if (existingChat) {
      // Update existing chat. Skip message_count + last_message_at bumps
      // when this came from a non-message event so we don't inflate counters.
      const update: Record<string, unknown> = {
        title: title || undefined,
        chat_type: chatType,
        updated_at: new Date().toISOString(),
      };
      if (incrementMessageCount) {
        update.last_message_at = messageDate.toISOString();
        update.message_count = (existingChat.message_count || 0) + 1;
      }
      await supabaseAdmin
        .from('telegram_chats')
        .update(update)
        .eq('id', existingChat.id);

      console.log('[Telegram Webhook] Updated chat tracking:', { chatId, title, incrementMessageCount });
    } else {
      // Insert new chat. message_count starts at 1 if a real message
      // triggered this, 0 if it was just a membership change.
      await supabaseAdmin
        .from('telegram_chats')
        .insert({
          chat_id: chatId,
          title: title,
          chat_type: chatType,
          last_message_at: incrementMessageCount ? messageDate.toISOString() : null,
          message_count: incrementMessageCount ? 1 : 0,
        });

      console.log('[Telegram Webhook] New chat discovered:', { chatId, title, incrementMessageCount });
    }
  } catch (error) {
    console.error('[Telegram Webhook] Error tracking chat:', error);
    // Don't throw - chat tracking is non-critical
  }
}

/**
 * Store message for chat identification
 */
async function storeMessage(
  chatId: string,
  messageId: string,
  fromUserId: string | null,
  fromUserName: string,
  fromUsername: string | null,
  text: string,
  messageDate: Date,
  messageThreadId?: number,
) {
  try {
    // Truncate long messages
    const truncatedText = text.length > 500 ? text.substring(0, 500) + '...' : text;

    await supabaseAdmin
      .from('telegram_messages')
      .upsert({
        chat_id: chatId,
        message_id: messageId,
        from_user_id: fromUserId,
        from_user_name: fromUserName,
        from_username: fromUsername,
        text: truncatedText,
        message_date: messageDate.toISOString(),
        // Added 2026-06-09 — forum-topic thread for supergroups.
        // NULL = General / no topic.
        message_thread_id: messageThreadId ?? null,
      } as any, {
        onConflict: 'chat_id,message_id'
      });

    console.log('[Telegram Webhook] Stored message:', { chatId, messageId, from: fromUserName });
  } catch (error) {
    console.error('[Telegram Webhook] Error storing message:', error);
    // Don't throw - message storage is non-critical
  }
}

/**
 * Upsert a stub thread row when we see activity in a topic but don't
 * know its name yet. Bumps last_seen_at so the picker can sort
 * recently-active topics first.
 */
async function trackThread(
  chatId: string,
  messageThreadId: number,
  messageDate: Date,
) {
  try {
    await (supabaseAdmin as any)
      .from('telegram_threads')
      .upsert(
        {
          chat_id: chatId,
          message_thread_id: messageThreadId,
          last_seen_at: messageDate.toISOString(),
        },
        { onConflict: 'chat_id,message_thread_id' },
      );
  } catch (err) {
    console.error('[Telegram Webhook] trackThread failed:', err);
    // Non-critical — picker will still work, just won't list this
    // thread until next message lands.
  }
}

/**
 * Upsert a known thread name. Used when forum_topic_created or
 * forum_topic_edited events come through. Doesn't touch last_seen_at
 * because the name event might fire long after the topic was active.
 */
async function upsertThreadName(
  chatId: string,
  messageThreadId: number,
  name: string,
) {
  try {
    await (supabaseAdmin as any)
      .from('telegram_threads')
      .upsert(
        {
          chat_id: chatId,
          message_thread_id: messageThreadId,
          name,
        },
        { onConflict: 'chat_id,message_thread_id' },
      );
  } catch (err) {
    console.error('[Telegram Webhook] upsertThreadName failed:', err);
  }
}

/* ─────────────────── /wallet — KOL Payout Wallet ───────────────── */
/**
 * `/wallet <0xAddress>` — KOL payout-wallet capture per HHP /wallet
 * Command spec v3 (Jdot, 2026-06-15). Fires in a per-KOL group chat.
 *
 * Flow:
 *   1. Resolve sender chat → KOL via telegram_chats.master_kol_id
 *      (same JOIN pattern as /submit). If no link → § 7.4 soft error.
 *   2. Extract first 0x-prefixed token from the message body. Tolerates
 *      "/wallet 0xabc...123 thanks". If none / invalid → § 7.3 reject.
 *   3. Normalize to EIP-55 checksum form.
 *   4. Compare against master_kols.wallet:
 *      - empty           → write directly, § 7.1 success.
 *      - identical (case-insensitive) → § 7.2 "already saved" skip.
 *      - different       → § 7.2 Confirm/Cancel prompt with the proposed
 *                          address packed into the callback_data so the
 *                          confirm step is stateless.
 *
 * Per spec § 2.2 the handler is NOT gated against team members — any
 * valid address sent in a KOL's chat sets that KOL's wallet. Settlement
 * remains trust-based.
 */
async function handleWalletCommand(chatId: string, args: string[], message: any) {
  const threadId: number | undefined = message.message_thread_id || undefined;

  // Match logic § 6 — resolve chat → KOL via existing telegram_chats link
  const { data: chatRow } = await (supabaseAdmin as any)
    .from('telegram_chats')
    .select('master_kol_id')
    .eq('chat_id', chatId)
    .maybeSingle();

  const masterKolId: string | null = (chatRow as any)?.master_kol_id ?? null;
  if (!masterKolId) {
    // § 7.4 — chat not linked
    await sendTelegramMessage(
      chatId,
      "This chat isn't linked to a KOL record yet, so the wallet wasn't saved. Flagging the team.",
      'HTML',
      threadId,
    );
    return;
  }

  // Validation § 5 — extract first candidate token + check shape
  const body = args.join(' ');
  const candidate = extractAddressCandidate(body);
  if (!candidate || !isValidEvmAddress(candidate)) {
    // § 7.3 — invalid address
    await sendTelegramMessage(
      chatId,
      "That doesn't look like a valid wallet address.\n" +
        'Send <code>/wallet</code> followed by your Arbitrum address ' +
        '(starts with <code>0x</code>, 42 characters).',
      'HTML',
      threadId,
    );
    return;
  }
  // § 5 v2 hardening (CLEANUP.1, 2026-06-17) — when a mixed-case address
  // is submitted, verify its EIP-55 checksum. A mismatched checksum on
  // mixed-case input is almost always a typo (a real wallet copy preserves
  // the canonical case). All-lowercase / all-uppercase inputs pass through
  // since they carry no checksum to verify.
  if (!hasValidChecksumIfMixed(candidate)) {
    await sendTelegramMessage(
      chatId,
      "That address has the right shape but its mixed-case checksum is off, " +
        "which usually means a typo. Copy it again from your wallet and resend " +
        "with <code>/wallet</code> — or paste it all-lowercase if you typed it manually.",
      'HTML',
      threadId,
    );
    return;
  }
  const newAddr = toChecksumAddress(candidate);

  // Read existing wallet
  const { data: kolRow } = await (supabaseAdmin as any)
    .from('master_kols')
    .select('id, wallet')
    .eq('id', masterKolId)
    .maybeSingle();
  const currentRaw: string | null = (kolRow as any)?.wallet ?? null;
  const current = currentRaw && isValidEvmAddress(currentRaw)
    ? toChecksumAddress(currentRaw)
    : currentRaw;

  // § 7.2 identical-skip
  if (current && current.toLowerCase() === newAddr.toLowerCase()) {
    await sendTelegramMessage(
      chatId,
      "That's already your saved payout wallet, nothing changed.",
      'HTML',
      threadId,
    );
    return;
  }

  // § 7.1 first save
  if (!current) {
    await (supabaseAdmin as any)
      .from('master_kols')
      .update({ wallet: newAddr })
      .eq('id', masterKolId);
    await sendTelegramMessage(
      chatId,
      `<code>${escapeHtml(newAddr)}</code> has been saved as your payout wallet.`,
      'HTML',
      threadId,
    );
    return;
  }

  // § 7.2 update — Confirm/Cancel prompt, new address carried in callback_data
  // so the callback is stateless; spec's "superseded" rule is naturally
  // satisfied because each new /wallet renders fresh buttons; the user only
  // sees + taps the most recent prompt.
  const text =
    'Replace your saved payout wallet?\n' +
    `Current: <code>${escapeHtml(current)}</code>\n` +
    `New:&nbsp;&nbsp;&nbsp;&nbsp; <code>${escapeHtml(newAddr)}</code>`;
  const buttons = [[
    { text: '✅ Confirm', callback_data: `wal:confirm:${newAddr}` },
    { text: '↩ Cancel', callback_data: `wal:cancel` },
  ]];
  await sendTelegramMessageWithButtons(chatId, text, buttons, threadId);
}

/* ─────────────── /repost — KOL forwarding opt-in/out ────────────── */

/**
 * `/repost yes|no` — KOL opt-in/out for repost (forwarding) deals.
 *
 * Spec (Andy 2026-06-29 §7):
 *   - yes / y → master_kols.forwarding_eligible = true
 *   - no  / n → master_kols.forwarding_eligible = false
 *   - Case-insensitive. Trailing text ignored (`/repost yes please`
 *     resolves to yes).
 *   - Bare `/repost` with no arg → ask for yes/no.
 *   - Anything else → invalid, ask for yes/no.
 *   - Same answer resent → no-op, "No change" reply.
 *
 * Trust model: same as /wallet — chat → KOL via telegram_chats.
 * No anti-spoof gating (§ 2.2). Whoever sends a valid /repost in a
 * KOL's chat sets that KOL's status.
 */
async function handleRepostCommand(chatId: string, args: string[], message: any) {
  const threadId: number | undefined = message.message_thread_id || undefined;

  // Resolve chat → KOL (same lookup as /wallet § 6).
  const { data: chatRow } = await (supabaseAdmin as any)
    .from('telegram_chats')
    .select('master_kol_id')
    .eq('chat_id', chatId)
    .maybeSingle();
  const masterKolId: string | null = (chatRow as any)?.master_kol_id ?? null;
  if (!masterKolId) {
    await sendTelegramMessage(
      chatId,
      "This chat isn't linked to a KOL record yet, so the repost opt-in wasn't saved. Flagging the team.",
      'HTML',
      threadId,
    );
    return;
  }

  // Parse the first token after the command, case-insensitive.
  // y → yes, n → no. Trailing text ignored.
  const first = (args[0] || '').trim().toLowerCase();
  const InvalidReply =
    'Send <code>/repost yes</code> to get repost deals, or <code>/repost no</code> to stop them.';

  let next: boolean | null = null;
  if (first === 'yes' || first === 'y') next = true;
  else if (first === 'no' || first === 'n') next = false;

  if (next === null) {
    // § 7.4 — bare or invalid argument
    await sendTelegramMessage(chatId, InvalidReply, 'HTML', threadId);
    return;
  }

  // Read current value
  const { data: kolRow } = await (supabaseAdmin as any)
    .from('master_kols')
    .select('id, forwarding_eligible')
    .eq('id', masterKolId)
    .maybeSingle();
  const current: boolean | null = (kolRow as any)?.forwarding_eligible ?? null;

  // § 7.3 — same answer resent
  if (current === next) {
    const msg = next
      ? "No change, you're already opted in to repost deals."
      : "No change, you're already opted out. Send <code>/repost yes</code> to turn them back on.";
    await sendTelegramMessage(chatId, msg, 'HTML', threadId);
    return;
  }

  // Persist
  const { error } = await (supabaseAdmin as any)
    .from('master_kols')
    .update({ forwarding_eligible: next })
    .eq('id', masterKolId);
  if (error) {
    console.error('[/repost] update failed:', error.message);
    await sendTelegramMessage(
      chatId,
      "⚠️ Bot hiccup saving that — try <code>/repost yes</code> (or <code>no</code>) again in a moment.",
      'HTML',
      threadId,
    );
    return;
  }

  // [2026-07-02] Per Andy: opting in should also add "Repost" to the KOL's
  // Content Type list on /kols so the profile reflects the offering. Same
  // mapping used by contents-side auto-add. Fire-and-forget;
  // failure here is non-fatal for the opt-in flow — we still confirm the
  // primary flag was saved.
  if (next === true) {
    ensureKolDeliverable(supabaseAdmin as any, masterKolId, 'Repost').catch(err => {
      console.warn('[/repost] deliverable append failed:', err?.message ?? err);
    });
  }

  // § 7.1 + § 7.2 confirmations
  const reply = next
    ? "You're in. We'll send you repost deals as they come up."
    : "Done. You won't get repost deals from now on. Send <code>/repost yes</code> anytime to turn them back on.";
  await sendTelegramMessage(chatId, reply, 'HTML', threadId);
}

/**
 * Handle `wal:confirm:<addr>` / `wal:cancel` button clicks from the
 * § 7.2 update prompt. Stateless — Confirm carries the proposed address
 * in the callback_data, so a stale callback just writes whatever its
 * encoded address was. Cancel keeps the existing wallet.
 */
async function handleWalletCallback(cq: any) {
  const data: string = cq.data || '';
  const callbackId: string = cq.id;
  const chatId = String(cq.message?.chat?.id || '');
  const messageId: number | undefined = cq.message?.message_id;

  // Resolve chat → KOL
  const { data: chatRow } = await (supabaseAdmin as any)
    .from('telegram_chats')
    .select('master_kol_id')
    .eq('chat_id', chatId)
    .maybeSingle();
  const masterKolId: string | null = (chatRow as any)?.master_kol_id ?? null;
  if (!masterKolId) {
    await answerCallbackQuery(callbackId, 'KOL link missing.');
    return;
  }

  const { data: kolRow } = await (supabaseAdmin as any)
    .from('master_kols')
    .select('wallet')
    .eq('id', masterKolId)
    .maybeSingle();
  const currentRaw: string | null = (kolRow as any)?.wallet ?? null;
  const current = currentRaw && isValidEvmAddress(currentRaw)
    ? toChecksumAddress(currentRaw)
    : currentRaw;

  if (data === 'wal:cancel') {
    await answerCallbackQuery(callbackId);
    if (messageId) {
      await editMessageText(
        chatId,
        messageId,
        `No change. Your payout wallet is still <code>${escapeHtml(current || '—')}</code>.`,
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `No change. Your payout wallet is still <code>${escapeHtml(current || '—')}</code>.`,
        'HTML',
      );
    }
    return;
  }

  // wal:confirm:<addr>
  const newAddrRaw = data.slice('wal:confirm:'.length);
  if (!isValidEvmAddress(newAddrRaw)) {
    await answerCallbackQuery(callbackId, 'Invalid address.');
    return;
  }
  const newAddr = toChecksumAddress(newAddrRaw);

  await (supabaseAdmin as any)
    .from('master_kols')
    .update({ wallet: newAddr })
    .eq('id', masterKolId);

  await answerCallbackQuery(callbackId);
  const successText = `<code>${escapeHtml(newAddr)}</code> has been saved as your payout wallet.`;
  if (messageId) {
    await editMessageText(chatId, messageId, successText);
  } else {
    await sendTelegramMessage(chatId, successText, 'HTML');
  }
}

/**
 * GET endpoint for webhook verification
 * Telegram doesn't use GET, but useful for manual testing
 */
export async function GET() {
  return NextResponse.json({
    status: 'Telegram webhook endpoint active',
    info: 'This endpoint receives POST requests from Telegram'
  });
}
