import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { loadAttention } from '@/lib/attention';

export const dynamic = 'force-dynamic';

/** GET /api/attention — the cross-client "needs attention" list (team only: member, admin, super_admin). */
export async function GET(request: Request) {
  const guard = await requireRole(request, ['member', 'admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    return NextResponse.json({ items: await loadAttention(db) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not load the list' }, { status: 500 });
  }
}
