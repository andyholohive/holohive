import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { loadAttention, loadMomentumAlerts } from '@/lib/attention';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attention — the cross-client "needs attention" list (team only: member, admin, super_admin).
 * ?part=momentum returns only the momentum alerts (slower: loads every client's dashboard).
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, ['member', 'admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const part = new URL(request.url).searchParams.get('part');
    return NextResponse.json({ items: part === 'momentum' ? await loadMomentumAlerts(db) : await loadAttention(db) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not load the list' }, { status: 500 });
  }
}
