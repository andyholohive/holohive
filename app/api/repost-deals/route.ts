import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { findEligibleKols, previewCaps } from '@/lib/repostDealService';

export const dynamic = 'force-dynamic';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** GET — deal list for the operator console, newest first, with live counts. */
export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const sb = svc();

  const { data: deals, error } = await (sb as any)
    .from('repost_deals').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (deals ?? []).map((d: any) => d.id);
  const { data: offers } = ids.length
    ? await (sb as any).from('repost_deal_offers')
        .select('deal_id, status, locked_tier, locked_price').in('deal_id', ids)
    : { data: [] };

  const byDeal = new Map<string, any[]>();
  for (const o of (offers ?? []) as any[]) {
    byDeal.set(o.deal_id, [...(byDeal.get(o.deal_id) ?? []), o]);
  }

  return NextResponse.json({
    deals: (deals ?? []).map((d: any) => {
      const mine = byDeal.get(d.id) ?? [];
      const count = (s: string) => mine.filter(o => o.status === s).length;
      return {
        ...d,
        offers_total: mine.length,
        accepted: count('accepted'),
        rejected: count('rejected'),
        pending: count('pending'),
        declined_cap: count('declined_cap'),
      };
    }),
  });
}

/**
 * POST — create a Draft (§7 step 1), or preview targeting without saving.
 * `{ preview: true }` runs the same eligibility resolution the launch uses,
 * so the operator's slot/budget numbers match what will actually be sent.
 */
export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => ({} as any));
  const sb = svc();

  const nicheTags: string[] = Array.isArray(body.niche_tags) ? body.niche_tags : [];
  const tiers: string[] = Array.isArray(body.tiers) ? body.tiers : [];
  const tierCaps: Record<string, number> = body.tier_caps ?? {};

  if (body.preview) {
    const eligible = await findEligibleKols(sb, { nicheTags, tiers });
    return NextResponse.json({
      eligible_count: eligible.length,
      ...previewCaps(eligible, tierCaps),
      eligible: eligible.map(e => ({ id: e.master_kol_id, name: e.name, tier: e.tier, price: e.price })),
    });
  }

  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!body.source_post_link?.trim()) return NextResponse.json({ error: 'source_post_link required' }, { status: 400 });
  if (!(Number(body.budget_total) > 0)) return NextResponse.json({ error: 'budget_total must be > 0' }, { status: 400 });

  const { data, error } = await (sb as any).from('repost_deals').insert({
    name: body.name.trim(),
    source_post_link: body.source_post_link.trim(),
    niche_tags: nicheTags,
    tiers,
    tier_caps: tierCaps,
    budget_total: Number(body.budget_total),
    // §7 step 4: 24h default, editable per deal.
    closes_at: body.closes_at ?? new Date(Date.now() + 24 * 3600_000).toISOString(),
    created_by: guard.user?.id ?? null,
    created_by_name: guard.user?.name ?? null,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deal: data });
}
