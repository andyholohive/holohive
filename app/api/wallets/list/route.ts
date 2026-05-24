import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallets/list
 *
 * Paginated, filtered list of wallets for the /wallets page's
 * "Wallets" tab.
 *
 * Query params:
 *   - event:       string  — filter by event participation (matches if
 *                            event_labels contains the value)
 *   - chain:       'evm' | 'solana' — filter by chain
 *   - min_events:  number  — only wallets with num_events >= this
 *   - search:      string  — case-insensitive prefix match on
 *                            wallet_address (admins paste a 0x...)
 *   - page:        number  — 1-indexed page number (default 1)
 *   - page_size:   number  — default 50, max 200
 *   - sort:        'num_events' | 'address' (default 'num_events')
 *   - dir:         'asc' | 'desc' (default 'desc')
 *
 * Returns: { items, total, page, page_size, total_pages }
 *
 * Auth: admin / super_admin only.
 */
export async function GET(request: Request) {
  // [May 2026] Previously cookies() + createServerClient() lived OUTSIDE
  // the try block. If either threw (e.g. Next 13 cookies() can throw if
  // called outside a request scope, env vars missing), the catch never
  // fired and the user got Next's default HTML 500 page — making the
  // page show "500 Internal Server Error: <!DOCTYPE html>...". Pulling
  // them inside the try so every error path returns JSON with `stage`.
  let stage = 'init';
  try {
  // Use the project-wide lib helper (getAll/setAll cookies API).
  // Previously this called createServerClient from @supabase/ssr with
  // the legacy get/set/remove API, which 0.7+ now throws on,
  // producing Next's HTML 500 instead of any handler response.
  stage = 'auth_cookies';
  const sb = await createServerClient();
  stage = 'auth_getUser';
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  stage = 'auth_role_lookup';
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  stage = 'parse_query';
  const url = new URL(request.url);
  const event = url.searchParams.get('event');
  const chain = url.searchParams.get('chain');
  const minEvents = parseInt(url.searchParams.get('min_events') || '0', 10) || 0;
  const search = (url.searchParams.get('search') || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.max(1, Math.min(200, parseInt(url.searchParams.get('page_size') || '50', 10)));
  const sort = url.searchParams.get('sort') === 'address' ? 'wallet_address' : 'num_events';
  const dir = url.searchParams.get('dir') === 'asc';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Build the filtered query. Apply filters in a chain — Supabase
  // builders return the same builder so we can conditionally add
  // .eq / .ilike / .gte without ternary nesting.
  let query = (supabase as any)
    .from('wallet_analytics')
    .select(
      'id, wallet_address, chain, num_events, event_labels, net_worth_usd, wallet_tier, defi_active, nft_holder, enriched_at',
      { count: 'exact' },
    );

  if (chain && (chain === 'evm' || chain === 'solana')) {
    query = query.eq('chain', chain);
  }
  if (event) {
    // event_labels is pipe-joined; we use ilike to do substring match
    // and avoid Postgres array overhead for a v1 dataset of ~1200 rows.
    query = query.ilike('event_labels', `%${event}%`);
  }
  if (minEvents > 0) {
    query = query.gte('num_events', minEvents);
  }
  if (search) {
    // Prefix match on the normalized lowercase column (indexed).
    query = query.ilike('wallet_address', `${search}%`);
  }

  query = query.order(sort, { ascending: dir });
  // Pagination via range(start, end) — both inclusive.
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  stage = 'wallet_select';
  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, stage }, { status: 500 });
  }

  return NextResponse.json({
    items: data || [],
    total: count || 0,
    page,
    page_size: pageSize,
    total_pages: count ? Math.ceil(count / pageSize) : 0,
  });
  } catch (err: any) {
    console.error('[wallets/list] crashed at stage:', stage, err);
    return NextResponse.json({
      error: err?.message || String(err) || 'Unknown error',
      stage,
    }, { status: 500 });
  }
}
