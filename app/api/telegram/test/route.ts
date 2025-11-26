import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to verify Telegram bot configuration
 * GET /api/telegram/test
 */
export async function GET(request: NextRequest) {
  try {
    const success = await TelegramService.sendTestMessage();

    if (success) {
      return NextResponse.json(
        {
          success: true,
          message: 'Test message sent successfully! Check your Telegram chat.'
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send test message. Check your bot token and chat ID configuration.'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error testing Telegram:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
