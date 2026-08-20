import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST — §7 step 7. Settlement is trust-based (§2.2, §8): confirming payout
 * is a manual operator action and nothing here checks that the repost
 * happened. Stamping paid_at on the accepted offers is the whole of it.
 */
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
  if (deal.status !== 'closed') {
    return NextResponse.json({ error: `deal is ${deal.status}; settle after close` }, { status: 409 });
  }

  const now = new Date().toISOString();
  await (sb as any).from('repost_deal_offers')
    .update({ paid_at: now }).eq('deal_id', deal.id).eq('status', 'accepted').is('paid_at', null);
  await (sb as any).from('repost_deals')
    .update({ status: 'settled', settled_at: now, updated_at: now }).eq('id', deal.id);

  return NextResponse.json({ ok: true });
}
