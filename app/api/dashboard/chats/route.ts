import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/dashboard/chats
 * POST /api/dashboard/chats
 *
 * Manage which Telegram chats feed the dashboard LLM analyzer (the
 * `dashboard_role` column on telegram_chats added by migration 046).
 *
 * GET returns all chats with their current dashboard_role + recent
 *   message activity (last 7d count) so the operator knows which
 *   chats have data worth tagging.
 *
 * POST { chat_id, dashboard_role } updates a single chat's role.
 *   role must be 'ops' | 'client' | 'team_personal' | null.
 */

const VALID_ROLES = ['ops', 'client', 'team_personal'] as const;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Pull all chats + their recent message count. Two queries because
  // there's no clean way to do a left-join with COUNT in PostgREST.
  const [chatsRes, msgsRes] = await Promise.all([
    (supabase as any)
      .from('telegram_chats')
      .select('id, chat_id, title, chat_type, dashboard_role, opportunity_id, master_kol_id, last_message_at, message_count')
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    (supabase as any)
      .from('telegram_messages')
      .select('chat_id')
      .gte('created_at', sevenDaysAgo)
      .limit(5000),
  ]);

  const recentByChat = new Map<string, number>();
  for (const m of (msgsRes.data || []) as any[]) {
    recentByChat.set(m.chat_id, (recentByChat.get(m.chat_id) || 0) + 1);
  }

  const chats = (chatsRes.data || []).map((c: any) => ({
    ...c,
    recent_message_count: recentByChat.get(c.chat_id) || 0,
  }));

  return NextResponse.json({ chats });
}

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const chatId = typeof body.chat_id === 'string' ? body.chat_id : null;
  if (!chatId) {
    return NextResponse.json({ error: 'chat_id required' }, { status: 400 });
  }

  // role can be null (clear the tag) or one of the enum values
  const role = body.dashboard_role;
  if (role !== null && !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `dashboard_role must be one of: ${VALID_ROLES.join(', ')}, or null` },
      { status: 400 },
    );
  }

  const { data, error } = await (supabase as any)
    .from('telegram_chats')
    .update({ dashboard_role: role, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ chat: data });
}
