import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Delete a message from a Telegram chat
 * POST /api/telegram/delete
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chatId, messageId } = body;

    if (!chatId || !messageId) {
      return NextResponse.json(
        { error: 'chatId and messageId are required' },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[Telegram Delete] Bot token not configured');
      return NextResponse.json(
        { error: 'Telegram bot not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/deleteMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Telegram Delete] Error:', error);
      return NextResponse.json(
        { error: 'Failed to delete message', details: error },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log('[Telegram Delete] Message deleted from chat:', chatId, 'message_id:', messageId);

    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('[Telegram Delete] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
