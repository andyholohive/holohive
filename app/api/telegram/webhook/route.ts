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
 * Handle bot commands - reads from database
 */
async function handleCommand(chatId: string, command: string, args: string[], message: any) {
  // Remove leading slash and bot mention
  const cmd = command.toLowerCase().replace(/^\//, '').replace('@holo_hive_bot', '');

  try {
    // Look up command in database
    const { data: commandData, error } = await supabaseAdmin
      .from('telegram_commands')
      .select('response')
      .eq('command', cmd)
      .eq('is_active', true)
      .single();

    if (error || !commandData) {
      console.log('[Telegram Webhook] Unknown command:', cmd);
      return;
    }

    // Send the response
    await sendTelegramMessage(chatId, commandData.response);
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

  // Only track group/supergroup messages in database
  if (chatType !== 'group' && chatType !== 'supergroup') {
    console.log('[Telegram Webhook] Ignoring non-group message for tracking:', chatType);
    return;
  }

  // Track/update chat in telegram_chats table
  await trackChat(chatId, chatTitle, chatType, messageDate);

  // Store the message for chat identification
  const fromName = [fromFirstName, fromLastName].filter(Boolean).join(' ') || 'Unknown';
  await storeMessage(chatId, messageId, fromId, fromName, fromUsername, messageText, messageDate);

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

  // Update all matching opportunities
  if (opportunities && opportunities.length > 0) {
    for (const opportunity of opportunities) {
      const updateField = isFromBot ? 'last_reply_at' : 'last_message_at';

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
          isFromBot
        });
      }
    }
  }
}

/**
 * Track/update chat info in telegram_chats table
 */
async function trackChat(chatId: string, title: string | null, chatType: string, messageDate: Date) {
  try {
    // Check if chat already exists
    const { data: existingChat } = await supabaseAdmin
      .from('telegram_chats')
      .select('id, message_count')
      .eq('chat_id', chatId)
      .single();

    if (existingChat) {
      // Update existing chat
      await supabaseAdmin
        .from('telegram_chats')
        .update({
          title: title || undefined,
          chat_type: chatType,
          last_message_at: messageDate.toISOString(),
          message_count: (existingChat.message_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingChat.id);

      console.log('[Telegram Webhook] Updated chat tracking:', { chatId, title });
    } else {
      // Insert new chat
      await supabaseAdmin
        .from('telegram_chats')
        .insert({
          chat_id: chatId,
          title: title,
          chat_type: chatType,
          last_message_at: messageDate.toISOString(),
          message_count: 1
        });

      console.log('[Telegram Webhook] New chat discovered:', { chatId, title });
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
