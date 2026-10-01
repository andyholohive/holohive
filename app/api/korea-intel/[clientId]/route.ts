import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { buildKoreaSummary } from '@/lib/koreaIntel/summary';

export const dynamic = 'force-dynamic';

/** GET /api/korea-intel/[clientId] — the Korea summary for the team (admin+). */
export async function GET(request: Request, { params }: { params: { clientId: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const summary = await buildKoreaSummary(admin, params.clientId);
  if (!summary) return NextResponse.json({ error: 'No Korea setup for this client' }, { status: 404 });
  return NextResponse.json({ summary });
}
