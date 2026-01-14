import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Operations chat for internal notifications
const OPERATIONS_CHAT_ID = '-1002636253963';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Send a message to the HH Operations Telegram chat
 * POST /api/telegram/send
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, chatId, threadId } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[Telegram Send] Bot token not configured');
      return NextResponse.json(
        { error: 'Telegram bot not configured' },
        { status: 500 }
      );
    }

    // Use provided chatId or default to operations chat
    const targetChatId = chatId || OPERATIONS_CHAT_ID;

    const messagePayload: any = {
      chat_id: targetChatId,
      text: message,
      parse_mode: 'HTML'
    };

    // Add thread_id for topic-based messaging if provided
    if (threadId) {
      messagePayload.message_thread_id = parseInt(threadId);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messagePayload)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Telegram Send] Error:', error);
      return NextResponse.json(
        { error: 'Failed to send message', details: error },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log('[Telegram Send] Message sent to chat:', targetChatId);

    // Store the sent message in the database
    try {
      const botInfo = result.result?.from;
      await supabase.from('telegram_messages').insert({
        chat_id: targetChatId,
        message_id: String(result.result?.message_id),
        from_user_id: botInfo?.id ? String(botInfo.id) : null,
        from_user_name: botInfo?.first_name || 'Bot',
        from_username: botInfo?.username || null,
        text: message,
        message_date: new Date().toISOString()
      });
      console.log('[Telegram Send] Message stored in database');
    } catch (dbError) {
      // Log but don't fail the request if storage fails
      console.error('[Telegram Send] Failed to store message:', dbError);
    }

    return NextResponse.json({
      success: true,
      message_id: result.result?.message_id
    });
  } catch (error) {
    console.error('[Telegram Send] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
