import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/analytics/external-costs
 * POST /api/analytics/external-costs
 *
 * Backs the "Infrastructure Spend" panel on /analytics. Reads/writes
 * the external_costs table (migration 045).
 *
 * GET response:
 *   {
 *     services: [
 *       { service, label, current_month, last_month, trend_pct, balance, fetched_at, source, notes },
 *       ...
 *     ],
 *     totals: { current_month, last_month, trend_pct },
 *     periods: { current: '2026-05', last: '2026-04' }
 *   }
 *
 * POST body (upsert one row):
 *   {
 *     service:      'anthropic' | 'vercel' | 'xai' | string,
 *     period_start: 'YYYY-MM-01',
 *     amount_usd:   number,
 *     balance_usd?: number | null,
 *     notes?:       string,
 *   }
 */

// Display metadata for known services. Unknown services still render —
// they just get the generic fallback (label = capitalized service key,
// no specific brand color). Add a row here when you start tracking a
// new SaaS so it gets a friendly label instead of "Openai".
const SERVICE_META: Record<string, { label: string; supports_balance: boolean }> = {
  anthropic: { label: 'Anthropic (Claude API)', supports_balance: true },
  vercel:    { label: 'Vercel',                 supports_balance: false },
  xai:       { label: 'xAI Grok',               supports_balance: false },
};

function firstOfMonth(date: Date): string {
  // Returns YYYY-MM-01 in UTC. Storing the period as the first-of-month
  // means a query for "current month" is just a string compare.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function previousMonthFirst(currentFirst: string): string {
  // 'YYYY-MM-01' → previous month's first-of. Uses Date arithmetic so
  // year boundaries (Jan → Dec) handle correctly.
  const d = new Date(currentFirst + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  return firstOfMonth(d);
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const currentPeriod = firstOfMonth(new Date());
  const lastPeriod = previousMonthFirst(currentPeriod);

  // Fetch BOTH months in one query — small payload, simple to dedupe.
  const { data, error } = await (supabase as any)
    .from('external_costs')
    .select('service, period_start, amount_usd, balance_usd, notes, source, fetched_at')
    .in('period_start', [currentPeriod, lastPeriod]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Index by (service, period) for O(1) lookup while we render rows.
  type Row = {
    service: string;
    period_start: string;
    amount_usd: number;
    balance_usd: number | null;
    notes: string | null;
    source: string;
    fetched_at: string;
  };
  const byKey = new Map<string, Row>();
  for (const r of (data || []) as Row[]) {
    byKey.set(`${r.service}|${r.period_start}`, r);
  }

  // Union of services seen across both months (so a service that only
  // had data last month still renders, with current_month=0 visibly).
  const services = Array.from(new Set(((data || []) as Row[]).map(r => r.service)));

  // Always include the three default services even if they have no
  // data yet — gives the user a starting point in the dialog.
  for (const s of Object.keys(SERVICE_META)) {
    if (!services.includes(s)) services.push(s);
  }

  const rows = services.map(service => {
    const cur = byKey.get(`${service}|${currentPeriod}`);
    const prev = byKey.get(`${service}|${lastPeriod}`);
    const current_month = Number(cur?.amount_usd ?? 0);
    const last_month = Number(prev?.amount_usd ?? 0);
    const trend_pct = last_month > 0
      ? Math.round(((current_month - last_month) / last_month) * 100)
      : (current_month > 0 ? null : 0); // null = "new this month"
    const meta = SERVICE_META[service];
    return {
      service,
      label: meta?.label ?? service.charAt(0).toUpperCase() + service.slice(1),
      supports_balance: meta?.supports_balance ?? false,
      current_month,
      last_month,
      trend_pct,
      // Balance only meaningful for prepaid services (Anthropic). Show
      // the most recent value we have, regardless of which month it
      // came from.
      balance: cur?.balance_usd ?? prev?.balance_usd ?? null,
      notes: cur?.notes ?? null,
      source: cur?.source ?? prev?.source ?? null,
      fetched_at: cur?.fetched_at ?? prev?.fetched_at ?? null,
    };
  }).sort((a, b) => b.current_month - a.current_month);

  const totalCurrent = rows.reduce((s, r) => s + r.current_month, 0);
  const totalLast = rows.reduce((s, r) => s + r.last_month, 0);
  const totalTrendPct = totalLast > 0
    ? Math.round(((totalCurrent - totalLast) / totalLast) * 100)
    : null;

  return NextResponse.json({
    services: rows,
    totals: {
      current_month: totalCurrent,
      last_month: totalLast,
      trend_pct: totalTrendPct,
    },
    periods: {
      current: currentPeriod.slice(0, 7), // 'YYYY-MM'
      last: lastPeriod.slice(0, 7),
    },
  });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Validate required + bounded fields. Strict so a typo doesn't write
  // garbage into the table that's hard to clean up later.
  const service = typeof body.service === 'string' ? body.service.trim().toLowerCase() : '';
  if (!service) {
    return NextResponse.json({ error: 'service is required' }, { status: 400 });
  }

  // period_start MUST be YYYY-MM-01. Any other day gets rejected to
  // preserve the (service, month) uniqueness convention.
  const period = typeof body.period_start === 'string' ? body.period_start : '';
  if (!/^\d{4}-\d{2}-01$/.test(period)) {
    return NextResponse.json({ error: 'period_start must be YYYY-MM-01' }, { status: 400 });
  }

  const amount = Number(body.amount_usd);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'amount_usd must be a non-negative number' }, { status: 400 });
  }
  // Sanity cap — anything over $100K/month for a single SaaS is
  // almost certainly a typo. Adjust if HoloHive ever scales past this.
  if (amount > 100_000) {
    return NextResponse.json({ error: 'amount_usd above 100000 — likely a typo' }, { status: 400 });
  }

  let balance: number | null = null;
  if (body.balance_usd != null && body.balance_usd !== '') {
    const b = Number(body.balance_usd);
    if (!Number.isFinite(b) || b < 0) {
      return NextResponse.json({ error: 'balance_usd must be non-negative or omitted' }, { status: 400 });
    }
    balance = b;
  }

  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;

  // UPSERT keyed on (service, period_start) — the unique constraint
  // means a re-submit for the same month replaces the old row.
  const { data, error } = await (supabase as any)
    .from('external_costs')
    .upsert(
      {
        service,
        period_start: period,
        amount_usd: amount,
        balance_usd: balance,
        notes,
        source: 'manual',
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'service,period_start' },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ row: data });
}
