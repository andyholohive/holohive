import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Use service role for webhook (no user auth context)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Telegram webhook secret for verification (optional but recommended)
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

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
    // Optional: Verify webhook secret token
    const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (WEBHOOK_SECRET && secretToken !== WEBHOOK_SECRET) {
      console.error('[Telegram Webhook] Invalid secret token');
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await request.json();

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
 * Send a message to a Telegram chat
 */
async function sendTelegramMessage(chatId: string, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML') {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[Telegram Webhook] Bot token not configured');
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Telegram Webhook] Send message error:', error);
      return false;
    }

    console.log('[Telegram Webhook] Sent reply to chat:', chatId);
    return true;
  } catch (error) {
    console.error('[Telegram Webhook] Error sending message:', error);
    return false;
  }
}

/**
 * Send a photo with caption to a Telegram chat
 */
async function sendTelegramPhoto(chatId: string, photoUrl: string, caption: string, parseMode: 'HTML' | 'Markdown' = 'HTML') {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[Telegram Webhook] Bot token not configured');
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption,
          parse_mode: parseMode
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Telegram Webhook] Send photo error:', error);
      return false;
    }

    console.log('[Telegram Webhook] Sent photo to chat:', chatId);
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
    const dateStr = messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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

    // Send to Andy Lee's DM
    await sendTelegramMessage(ANDY_LEE_TELEGRAM_ID, response);

    // Send confirmation in the original chat
    await sendTelegramMessage(chatId, '✅ Chat info sent to Andy Lee.');

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
        await sendTelegramMessage(chatId, 'This command is only available to team members.');
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
        await sendTelegramMessage(chatId, 'This command is only available to team members.');
        return;
      }

      console.log('[Telegram Webhook] Team-only command authorized for:', teamMember.name);
    }

    // Send photo with caption if image_url exists, otherwise just send message
    if (commandData.image_url) {
      await sendTelegramPhoto(chatId, commandData.image_url, commandData.response);
    } else {
      await sendTelegramMessage(chatId, commandData.response);
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
  const fromUserId = message.from?.id?.toString();

  // Auth check first — match users.telegram_id to make sure this is a
  // team member. /done mutates state, so we can't be permissive like
  // the static-text commands.
  if (!fromUserId) {
    await sendTelegramMessage(chatId, '⚠️ Could not identify you. /done is team-only.');
    return;
  }
  const { data: teamMember } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('telegram_id', fromUserId)
    .single();
  if (!teamMember) {
    await sendTelegramMessage(chatId, '⚠️ /done is only available to team members.');
    return;
  }

  // Parse the ID arg. Tolerant of casing + the "T-" prefix being missing,
  // since on a phone keyboard it's faster to type "/done 42" than to
  // hunt for the dash. Numeric-only is padded to 3 digits to match the
  // T-001 zero-padded format the trigger inserts.
  const raw = (args[0] || '').trim();
  if (!raw) {
    await sendTelegramMessage(chatId, 'Usage: <code>/done T-042</code>');
    return;
  }
  let shortId: string;
  const numericOnly = raw.replace(/[^0-9]/g, '');
  if (/^t-?\d+$/i.test(raw)) {
    shortId = `T-${numericOnly.padStart(3, '0')}`;
  } else if (/^\d+$/.test(numericOnly)) {
    shortId = `T-${numericOnly.padStart(3, '0')}`;
  } else {
    await sendTelegramMessage(chatId, `❓ Couldn't parse <code>${escapeHtml(raw)}</code>. Try <code>/done T-042</code>.`);
    return;
  }

  try {
    // Look up by short_id. Could be ambiguous in theory (the unique
    // index is partial WHERE NOT NULL) but in practice every row has a
    // generated short_id post-migration 066.
    const { data: task, error: taskErr } = await supabaseAdmin
      .from('tasks')
      .select('id, short_id, task_name, status, parent_task_id')
      .eq('short_id', shortId)
      .maybeSingle();

    if (taskErr) {
      console.error('[Telegram /done] task lookup failed:', taskErr);
      await sendTelegramMessage(chatId, '⚠️ Lookup failed. Try again or close it from /tasks.');
      return;
    }
    if (!task) {
      await sendTelegramMessage(chatId, `🤷 No task with ID <code>${escapeHtml(shortId)}</code>.`);
      return;
    }
    if (task.status === 'complete') {
      await sendTelegramMessage(chatId, `✅ <code>${escapeHtml(shortId)}</code> was already complete.`);
      return;
    }

    // Mirror the side-effects of taskService.updateField('status', 'complete')
    // since we're going through the service-role client directly:
    //  - set completed_at = now()
    //  - set updated_at  = now()
    // (The recurring-clone + parent-deliverable-rollup logic lives in
    // taskService and isn't worth re-implementing here for the /done
    // path; if a recurring task is closed from chat, the next instance
    // will get cloned the next time someone closes it from the UI. Good
    // enough for v1; revisit if it becomes an issue.)
    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from('tasks')
      .update({ status: 'complete', completed_at: nowIso, updated_at: nowIso })
      .eq('id', task.id);

    if (updErr) {
      console.error('[Telegram /done] update failed:', updErr);
      await sendTelegramMessage(chatId, '⚠️ Update failed. Try again or close it from /tasks.');
      return;
    }

    const safeName = escapeHtml(task.task_name || '(untitled task)');
    const closer = escapeHtml(teamMember.name || 'team');
    await sendTelegramMessage(
      chatId,
      `✅ <b>${escapeHtml(shortId)}</b> ${safeName}\n<i>closed by ${closer}</i>`,
    );
    console.log('[Telegram Webhook] /done closed task:', { shortId, by: teamMember.name });
  } catch (err) {
    console.error('[Telegram /done] unexpected error:', err);
    await sendTelegramMessage(chatId, '⚠️ Something went wrong. Try again or close it from /tasks.');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  const fromUserId = message.from?.id?.toString();

  // Same auth pattern as /done — must be a team member.
  if (!fromUserId) {
    await sendTelegramMessage(chatId, '⚠️ Could not identify you. /task is team-only.');
    return;
  }
  const { data: teamMember } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('telegram_id', fromUserId)
    .single();
  if (!teamMember) {
    await sendTelegramMessage(chatId, '⚠️ /task is only available to team members.');
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
      'Example: <code>/task @daniel write OST recap brief by Fri, for client pitch Thu</code>'
    );
    return;
  }

  // ── Pre-resolve assignee from @-mentions BEFORE calling Claude ──
  // The doc spec is "tag person" so we expect exactly one mention.
  // If the user forgot to tag, the parser will note it and the
  // preview will warn — but we still let them confirm-without-assignee
  // since some tasks are legitimately unassigned (research a thing).
  const { resolveAssigneeFromMessage } = await import('@/lib/telegramAssigneeResolver');
  const assignee = await resolveAssigneeFromMessage(
    supabaseAdmin,
    fullText,
    message.entities,
  );

  // ── Acknowledge while Claude works (1-2s typical) ──────────────
  await sendTelegramMessage(chatId, '🤔 Parsing task...');

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
    console.error('[Telegram /task] parse failed:', err);
    await sendTelegramMessage(chatId, '⚠️ Couldn\'t parse that. Try being more specific.');
    return;
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
    await sendTelegramMessage(chatId, '⚠️ Couldn\'t stage the task. Try again.');
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

  // Unknown callback — dismiss the spinner so the button doesn't hang.
  await answerCallbackQuery(callbackId);
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
    const insertPayload: Record<string, any> = {
      task_name: parsed.task_name,
      assigned_to: parsed.assignee_user_id || null,
      assigned_to_name: parsed.assignee_name || null,
      due_date: parsed.due_date || null,
      description: parsed.description || parsed.why || null,
      status: 'todo',
      priority: 'medium',
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
    return true;
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

/**
 * Handle incoming message from Telegram
 */
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

  // Track all chat types (groups, supergroups, and private DMs)
  // For DMs, use the user's name as the title
  const title = chatType === 'private'
    ? [fromFirstName, fromLastName].filter(Boolean).join(' ') || fromUsername || 'Unknown User'
    : chatTitle;

  // Track/update chat in telegram_chats table
  await trackChat(chatId, title, chatType, messageDate);

  // Store the message for chat identification
  const fromName = [fromFirstName, fromLastName].filter(Boolean).join(' ') || 'Unknown';
  await storeMessage(chatId, messageId, fromId, fromName, fromUsername, messageText, messageDate);

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
  messageDate: Date
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
        message_date: messageDate.toISOString()
      }, {
        onConflict: 'chat_id,message_id'
      });

    console.log('[Telegram Webhook] Stored message:', { chatId, messageId, from: fromUserName });
  } catch (error) {
    console.error('[Telegram Webhook] Error storing message:', error);
    // Don't throw - message storage is non-critical
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
