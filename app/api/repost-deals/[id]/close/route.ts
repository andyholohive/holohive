import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { retireOpenOffers } from '@/lib/repostDealBot';

export const dynamic = 'force-dynamic';

/** POST — §7: "A deal can also be closed manually at any time." */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: deal } = await (sb as any)
    .from('repost_deals').select('id, status').eq('id', params.id).maybeSingle();
  if (!deal) return NextResponse.json({ error: 'deal not found' }, { status: 404 });
  if (deal.status !== 'live') {
    return NextResponse.json({ error: `deal is ${deal.status}, not live` }, { status: 409 });
  }

  await (sb as any).from('repost_deals').update({
    status: 'closed', close_reason: 'manual_close',
    closed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', deal.id);

  const retired = await retireOpenOffers(sb, deal.id);
  return NextResponse.json({ ok: true, retired });
}
