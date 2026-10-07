import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { loadClientDashboard } from '@/lib/clientDashboard';

export const dynamic = 'force-dynamic';

/** GET /api/clients/[id]/dashboard — the client dashboard's data (team only: member, admin, super_admin). */
export async function GET(request: Request, { params }: { params: { clientId: string } }) {
  const guard = await requireRole(request, ['member', 'admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  if (!/^[0-9a-f-]{36}$/i.test(params.clientId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const data = await loadClientDashboard(db, params.clientId);
    if (!data) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    // Spend is money: admins only, like /expenses and the payments views.
    if (!guard.user || !['admin', 'super_admin'].includes(guard.user.role)) data.spend = null;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not load the dashboard' }, { status: 500 });
  }
}
