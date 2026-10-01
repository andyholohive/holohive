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
    .select('name, ticker, is_active, kr_listed, client_id, content_log_source').order('is_active', { ascending: false }).order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // client_id is the newer link; content_log_source ("hhp:<client id>") the older one.
  const clients = (data ?? []).map((r: any) => ({
    name: r.name, ticker: r.ticker, active: !!r.is_active, listed: !!r.kr_listed,
    clientId: r.client_id || (typeof r.content_log_source === 'string' && r.content_log_source.startsWith('hhp:') ? r.content_log_source.slice(4) : null),
  })).filter((c: any) => c.clientId);
  return NextResponse.json({ clients, canSend: !!(process.env.RESEND_API_KEY && process.env.KOREA_EMAIL_FROM) });
}
