import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/** GET /api/korea-intel — clients with a Korea setup, for the email preview picker (admin+). */
export async function GET(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await (admin as any).from('kr_signal_clients')
    .select('id, name, ticker, is_active, kr_listed, client_id, content_log_source, brief_token').order('is_active', { ascending: false }).order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // client_id is the newer link; content_log_source ("hhp:<client id>") the older one.
  // Client reads of the Telegram brief (team previews are excluded at write time).
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: views } = await (admin as any).from('korea_brief_views')
    .select('kr_client_id, viewed_at').gte('viewed_at', since).order('viewed_at', { ascending: false }).limit(5000);
  const stats = new Map<string, { views30d: number; lastViewed: string | null }>();
  for (const v of views ?? []) {
    const cur = stats.get(v.kr_client_id) ?? { views30d: 0, lastViewed: null };
    cur.views30d += 1; cur.lastViewed = cur.lastViewed ?? v.viewed_at;
    stats.set(v.kr_client_id, cur);
  }
  const clients = (data ?? []).map((r: any) => ({
    name: r.name, ticker: r.ticker, active: !!r.is_active, listed: !!r.kr_listed,
    briefToken: r.brief_token ?? null,
    views30d: stats.get(r.id)?.views30d ?? 0,
    lastViewed: stats.get(r.id)?.lastViewed ?? null,
    clientId: r.client_id || (typeof r.content_log_source === 'string' && r.content_log_source.startsWith('hhp:') ? r.content_log_source.slice(4) : null),
  })).filter((c: any) => c.clientId);
  return NextResponse.json({ clients, canSend: !!(process.env.RESEND_API_KEY && process.env.KOREA_EMAIL_FROM) });
}
