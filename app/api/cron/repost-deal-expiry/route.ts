import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { retireOpenOffers } from '@/lib/repostDealBot';

export const dynamic = 'force-dynamic';

/**
 * Timer expiry sweep — the 'timer_expired' close reason (§4, §5).
 *
 * claim_repost_offer already refuses a tap after closes_at, so this is not
 * what protects the caps. It exists so an expired deal actually LOOKS closed:
 * without it, every unactioned offer message keeps its live Accept button
 * until someone taps one, which reads to a creator as an open deal.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date().toISOString();
  const { data: expired } = await (sb as any)
    .from('repost_deals').select('id')
    .eq('status', 'live').lt('closes_at', now);

  const ids = ((expired ?? []) as Array<{ id: string }>).map(d => d.id);
  let retired = 0;
  for (const id of ids) {
    await (sb as any).from('repost_deals').update({
      status: 'closed', close_reason: 'timer_expired', closed_at: now, updated_at: now,
    }).eq('id', id).eq('status', 'live');
    retired += await retireOpenOffers(sb, id);
  }

  await (sb as any).from('agent_runs').insert({
    agent_name: 'REPOST_DEAL_EXPIRY',
    status: 'success',
    output_summary: `${ids.length} deal(s) expired, ${retired} offer(s) retired`,
  });

  return NextResponse.json({ ok: true, deals_closed: ids.length, offers_retired: retired });
}
