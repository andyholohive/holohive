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

    // Telegram expects a 200 OK response
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error processing update:', error);
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
      .select('id')
      .eq('telegram_id', fromId)
      .single();
    isTeamMember = !!teamMember;
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
