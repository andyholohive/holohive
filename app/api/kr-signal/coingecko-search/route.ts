import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kr-signal/coingecko-search?q=<query>
 *
 * Thin proxy to CoinGecko's public /search endpoint, so the Korea Signal
 * settings dialog can offer verified coin suggestions (id + symbol + name +
 * rank + thumb) for the peer_basket and coingecko_id fields. The stored value
 * is always CoinGecko's `id` — a wrong id silently drops from the digest, so
 * picking from real results (rather than typing) is the safe path.
 *
 * Admin + super_admin only. Cached for a few minutes to spare the rate limit.
 */
async function checkAdmin() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  return ['admin', 'super_admin'].includes(profile?.role);
}

export async function GET(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  const headers: Record<string, string> = {};
  if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;

  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
      { headers, next: { revalidate: 300 } },
    );
    if (!r.ok) return NextResponse.json({ results: [], error: `CoinGecko ${r.status}` }, { status: 200 });
    const j: any = await r.json();
    const results = (j?.coins ?? []).slice(0, 12).map((c: any) => ({
      id: c.id,
      symbol: (c.symbol ?? '').toUpperCase(),
      name: c.name,
      rank: c.market_cap_rank ?? null,
      thumb: c.thumb ?? null,
    }));
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ results: [], error: String(e?.message || e) }, { status: 200 });
  }
}
