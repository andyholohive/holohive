import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { applyTelegramMetrics } from '@/lib/telegramPostMetrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * POST /api/contents/[id]/fetch-metrics — pull views + reactions for one
 * Telegram post right now (team roles). Called by the content table the
 * moment a t.me link is saved, so nobody types numbers the page can fetch.
 * Same monotonic guard as the daily cron; X links are left to the X cron
 * (paid API, batched).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(_request, ['member', 'admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await applyTelegramMetrics(db, params.id);
  return NextResponse.json(result, { status: result.reason === 'not_found' ? 404 : 200 });
}
