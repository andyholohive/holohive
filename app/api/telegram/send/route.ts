import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Operations chat for internal notifications
const OPERATIONS_CHAT_ID = '-1002636253963';

/**
 * Send a message to the HH Operations Telegram chat
 * POST /api/telegram/send
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, chatId } = body;

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

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: message,
          parse_mode: 'HTML'
        })
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
