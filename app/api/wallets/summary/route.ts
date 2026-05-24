import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallets/summary
 *
 * Aggregates for the /wallets analytics page. One round-trip returns
 * everything the Overview tab needs:
 *
 *   - totals + chain split
 *   - retention buckets (1 / 2 / 3+ events)
 *   - per-event participation counts
 *   - per-event chain split
 *   - campaign overlap matrix (NxN: rows = events, cols = events,
 *     cell = wallet count appearing in BOTH events)
 *
 * Computation strategy: we pull the wallets table once (chain +
 * num_events + event_labels) and do all aggregation in-memory. The
 * data is small (~1.2k rows today, won't scale past ~50k for years)
 * so this is way simpler than five separate SQL aggregations. Update
 * to GROUP BY queries if/when the row count makes this expensive.
 *
 * Auth: admin / super_admin only (matches the table's RLS).
 */

interface WalletRow {
  chain: string;
  num_events: number;
  event_labels: string;
}

export async function GET() {
  // [Diagnostic try/catch, May 2026] User reported a 500 with HTML
  // body. Wrapping the whole handler so any unhandled exception
  // returns a JSON body with the real message + stage — much easier
  // to debug than Next's default HTML error page.
  let stage = 'init';
  try {
    stage = 'auth_cookies';
    const cookieStore = cookies();
    const sb = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
    );

    stage = 'auth_getUser';
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    stage = 'auth_role_lookup';
    const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
    if (!['admin', 'super_admin'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    stage = 'service_client';
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    stage = 'wallet_select';
    const { data: rows, error } = await supabase
      .from('wallet_analytics')
      .select('chain, num_events, event_labels')
      .limit(50000);
    if (error) {
      return NextResponse.json({ error: error.message, stage }, { status: 500 });
    }
    const wallets = (rows || []) as WalletRow[];

    stage = 'aggregation';
    const total = wallets.length;
    const evm = wallets.filter(w => w.chain === 'evm').length;
    const solana = wallets.filter(w => w.chain === 'solana').length;

    const retention = {
      single_event: wallets.filter(w => w.num_events === 1).length,
      two_events: wallets.filter(w => w.num_events === 2).length,
      three_plus_events: wallets.filter(w => w.num_events >= 3).length,
    };

    // Parse out each wallet's set of events. Use a Set per wallet so
    // self-overlap (same event listed twice) doesn't double-count.
    type ParsedWallet = { chain: string; events: Set<string> };
    const parsed: ParsedWallet[] = wallets.map(w => ({
      chain: w.chain,
      events: new Set((w.event_labels || '').split('|').map(e => e.trim()).filter(Boolean)),
    }));

    const eventStats = new Map<string, { total: number; evm: number; solana: number }>();
    for (const w of parsed) {
      for (const e of Array.from(w.events)) {
        let s = eventStats.get(e);
        if (!s) { s = { total: 0, evm: 0, solana: 0 }; eventStats.set(e, s); }
        s.total++;
        if (w.chain === 'evm') s.evm++;
        else if (w.chain === 'solana') s.solana++;
      }
    }
    const events_by_reach = Array.from(eventStats.entries())
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.total - a.total);

    const eventNames = events_by_reach.map(e => e.name);
    const overlap: Record<string, Record<string, number>> = {};
    for (const a of eventNames) overlap[a] = Object.fromEntries(eventNames.map(b => [b, 0]));
    for (const w of parsed) {
      const eventList = Array.from(w.events);
      for (const a of eventList) {
        for (const b of eventList) {
          if (overlap[a] && overlap[a][b] !== undefined) overlap[a][b]++;
        }
      }
    }

    return NextResponse.json({
      total,
      chain: { evm, solana },
      retention,
      retention_pct: {
        single_event:     total > 0 ? Math.round(1000 * retention.single_event / total) / 10 : 0,
        two_events:       total > 0 ? Math.round(1000 * retention.two_events / total) / 10 : 0,
        three_plus_events: total > 0 ? Math.round(1000 * retention.three_plus_events / total) / 10 : 0,
      },
      events_by_reach,
      overlap,
      cross_event_pct: total > 0 ? Math.round(1000 * (retention.two_events + retention.three_plus_events) / total) / 10 : 0,
    });
  } catch (err: any) {
    // Surface the real error message + stage marker in the JSON body
    // so the page can show it. Without this we get Next's HTML 500.
    console.error('[wallets/summary] crashed at stage:', stage, err);
    return NextResponse.json({
      error: err?.message || String(err) || 'Unknown error',
      stage,
    }, { status: 500 });
  }
}
