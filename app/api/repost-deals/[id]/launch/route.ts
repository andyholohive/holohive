import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { findEligibleKols } from '@/lib/repostDealService';
import { sendRepostOffer } from '@/lib/repostDealBot';

export const dynamic = 'force-dynamic';

/**
 * POST /api/repost-deals/[id]/launch — §7 step 5.
 *
 * Resolves eligibility, freezes each KOL's price and tier onto an offer row,
 * flips the deal Live, then broadcasts. Offers are written BEFORE any message
 * goes out: a send that half-fails must not leave claimable offers with no
 * row behind them, and the reverse (a row whose message failed) is visible
 * and retryable.
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
    .from('repost_deals').select('*').eq('id', params.id).maybeSingle();
  if (!deal) return NextResponse.json({ error: 'deal not found' }, { status: 404 });
  if (deal.status !== 'draft') {
    return NextResponse.json({ error: `deal is ${deal.status}, not draft` }, { status: 409 });
  }

  const eligible = await findEligibleKols(sb, {
    nicheTags: deal.niche_tags ?? [],
    tiers: deal.tiers ?? [],
  });

  // §8: "If no KOLs are eligible at Step 2, the deal cannot launch and the
  // operator is told why." The reason matters — almost always a missing share
  // price rather than a bad filter, so say which.
  if (eligible.length === 0) {
    const { count: priced } = await (sb as any)
      .from('master_kols').select('id', { count: 'exact', head: true })
      .is('archived_at', null).not('share_price', 'is', null);
    return NextResponse.json({
      error: 'No eligible KOLs',
      reason: (priced ?? 0) === 0
        ? 'No KOL has a share price logged. A repost price is required before a KOL can receive an offer (spec §3).'
        : 'KOLs have share prices, but none match this deal\'s niche tags, tiers, and a linked Telegram group chat.',
      priced_kols: priced ?? 0,
    }, { status: 400 });
  }

  const { error: insErr } = await (sb as any).from('repost_deal_offers').insert(
    eligible.map(e => ({
      deal_id: deal.id,
      master_kol_id: e.master_kol_id,
      kol_name: e.name,
      chat_id: e.chat_id,
      locked_price: e.price,
      locked_tier: e.tier,
    })),
  );
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  await (sb as any).from('repost_deals')
    .update({ status: 'live', launched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', deal.id);

  const { data: offers } = await (sb as any)
    .from('repost_deal_offers').select('*').eq('deal_id', deal.id);

  let sent = 0;
  let failed = 0;
  for (const offer of (offers ?? []) as any[]) {
    const ok = await sendRepostOffer(sb, deal, offer);
    if (ok) sent += 1; else failed += 1;
  }

  return NextResponse.json({ ok: true, offers: eligible.length, sent, failed });
}
