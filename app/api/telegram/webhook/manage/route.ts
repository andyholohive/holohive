import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/lib/telegramService';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * [2026-07-05 AUDIT-FIX] This route is publicly reachable — the middleware
 * allowlist prefix `/api/telegram/webhook` also matches `/manage` — and the
 * previous auth check only required a NON-EMPTY Authorization header, i.e.
 * `Bearer anything` passed. That let any anonymous caller re-point the
 * Telegram bot webhook to an attacker server or delete it.
 *
 * Real auth now:
 *   GET  (read webhook status)      → admin or super_admin session
 *   POST (register/delete webhook)  → super_admin session (requireSuperAdmin,
 *                                     which also honors the CRON_SECRET bypass)
 *
 * The /settings page calls these with same-origin fetches, so the Supabase
 * session cookie rides along automatically — the (previously decorative)
 * Authorization header it sends is ignored.
 */

async function requireAdminSession(): Promise<
  | { ok: true }
  | { ok: false; response: NextResponse }
> {
  let userId: string | null = null;
  try {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    userId = user?.id ?? null;
  } catch (err) {
    console.error('[webhook/manage] session lookup failed:', err);
  }
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: profile } = await (admin as any)
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { ok: true };
}

/**
 * GET /api/telegram/webhook/manage - Get webhook status (admin+)
 */
export async function GET(_request: NextRequest) {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  try {
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
 * POST /api/telegram/webhook/manage - Register/delete webhook (super_admin)
 * Body: { action: 'register' | 'delete', webhookUrl?: string }
 */
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
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
