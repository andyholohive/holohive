import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { escapeHtml } from '@/lib/telegramHtml';

export const dynamic = 'force-dynamic';

/**
 * POST /api/backlog/notify-verify
 *
 * Body: { item_id: string }
 *
 * Phase 4 of the Backlog Tab spec (Jdot, 2026-06-08). Called from
 * the client when a backlog item transitions to ready_for_review.
 * Sends a Telegram DM to the reporter so they know to verify the fix.
 *
 * History: this route originally also wrote to an in-HHP `notifications`
 * table that powered a sidebar bell. The bell was removed on 2026-06-11
 * (the "This Week" portal snapshot replaces it as the client-facing
 * visibility mechanism; clients don't actively check the portal so a
 * bell was wasted UX). The TG DM half stays — it's team-workflow
 * signaling, not the client-pollution problem the bell created.
 *
 * Why a dedicated server route instead of inlining into transitionStatus:
 *   • Telegram bot token is server-only (TELEGRAM_BOT_TOKEN)
 *   • Future TG signals (mention, overdue) can reuse the same auth +
 *     idempotency shape
 *
 * Auth: requires an authenticated team member. We don't gate on
 * "the actor must be the assignee" because in practice anyone
 * working on the bug can mark it ready.
 */
export async function POST(request: Request) {
  // ─── Auth ────────────────────────────────────────────────────────
  let body: { item_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const itemId = body.item_id;
  if (!itemId) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
  }

  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Service-role client for the cross-user writes that follow
  // (notifications.user_id !== current user; RLS would block the
  // anon client). Same pattern other server routes use.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ─── Item lookup ────────────────────────────────────────────────
  const { data: item, error: itemErr } = await (supabaseAdmin as any)
    .from('backlog_items')
    .select('id, type, area, title, status, reporter_id')
    .eq('id', itemId)
    .maybeSingle();
  if (itemErr || !item) {
    return NextResponse.json({ error: 'Backlog item not found' }, { status: 404 });
  }
  // Only fire when the item is currently in ready_for_review. Prevents
  // a stale UI from firing a notification for an item that was already
  // moved past ready (e.g. a CM marks it Live before the notification
  // route runs). Cheap defense.
  if (item.status !== 'ready_for_review') {
    return NextResponse.json({ ok: true, skipped: 'not ready_for_review' });
  }

  // ─── Reporter lookup ─────────────────────────────────────────────
  const { data: reporter } = await (supabaseAdmin as any)
    .from('users')
    .select('id, name, telegram_id')
    .eq('id', item.reporter_id)
    .maybeSingle();
  if (!reporter) {
    return NextResponse.json({ ok: true, skipped: 'reporter not found' });
  }

  // ─── Build the deep-link the TG message points to ───────────────
  const appBase = process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_APP_BASE_URL
    || 'https://app.holohive.io';
  const link = `${appBase}/initiatives?tab=backlog&id=${item.id}`;

  // ─── Telegram DM ────────────────────────────────────────────────
  let telegramSent = false;
  let telegramSkipped: string | null = null;
  if (!reporter.telegram_id) {
    telegramSkipped = 'no telegram_id on reporter';
  } else {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      telegramSkipped = 'TELEGRAM_BOT_TOKEN not configured';
    } else {
      const dmText =
        `🔍 <b>Ready to verify</b>\n` +
        `${item.type === 'bug' ? 'Bug fix' : 'Request'}: <b>${escapeHtml(item.title)}</b>\n\n` +
        `Open it in HHP and confirm the fix works, then mark it Live.\n` +
        `<a href="${link}">View in HHP</a>`;
      try {
        const tgRes = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: reporter.telegram_id,
              text: dmText,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          },
        );
        if (tgRes.ok) {
          telegramSent = true;
        } else {
          const errJson = await tgRes.json().catch(() => ({}));
          telegramSkipped = `TG send failed: ${errJson?.description || tgRes.status}`;
          console.error('[backlog/notify-verify] TG send failed:', errJson);
        }
      } catch (err) {
        telegramSkipped = `TG send threw: ${(err as Error).message}`;
        console.error('[backlog/notify-verify] TG send threw:', err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    telegram_sent: telegramSent,
    telegram_skipped: telegramSkipped,
  });
}

