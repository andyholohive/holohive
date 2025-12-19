import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/lib/telegramService';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Require admin authentication
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/telegram/webhook/manage - Get webhook status
 */
export async function GET(request: NextRequest) {
  try {
    // Check auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const info = await TelegramService.getWebhookInfo();
    return NextResponse.json(info);
  } catch (error) {
    console.error('Error getting webhook info:', error);
    return NextResponse.json(
      { error: 'Failed to get webhook info' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/telegram/webhook/manage - Register webhook
 * Body: { action: 'register' | 'delete', webhookUrl?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Check auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, webhookUrl } = await request.json();

    if (action === 'register') {
      // Auto-construct webhook URL if not provided
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
        || process.env.VERCEL_URL
        || '';

      const url = webhookUrl || `https://${baseUrl.replace(/^https?:\/\//, '')}/api/telegram/webhook`;

      if (!url.startsWith('https://')) {
        return NextResponse.json(
          { error: 'Webhook URL must be HTTPS. Deploy to production first.' },
          { status: 400 }
        );
      }

      const result = await TelegramService.registerWebhook(url);

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: 'Webhook registered successfully',
          webhookUrl: url
        });
      } else {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }
    } else if (action === 'delete') {
      const result = await TelegramService.deleteWebhook();

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: 'Webhook deleted successfully'
        });
      } else {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "register" or "delete"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error managing webhook:', error);
    return NextResponse.json(
      { error: 'Failed to manage webhook' },
      { status: 500 }
    );
  }
}
