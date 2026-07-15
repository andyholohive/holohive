import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import {
  loadConfigByHhpClientId,
  upsertConfigForHhpClient,
  type KrSignalConfigPatch,
} from '@/lib/krSignal/config';

export const dynamic = 'force-dynamic';

/**
 * GET/PUT /api/kr-signal/clients/[clientId]
 *
 * Read + create-or-update the KR Signal bot config for a HHP client, backing
 * the per-client Korea Signal settings dialog on /clients. Admin + super_admin
 * only (config drives client-facing Telegram digests).
 *
 * The config table has RLS, so authz is checked with the caller's session
 * (anon client) and the actual read/write uses the service role.
 */
async function checkAdmin() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, status: 401, msg: 'Unauthorized' };
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return { ok: false as const, status: 403, msg: 'Admin only' };
  }
  return { ok: true as const };
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(_req: Request, { params }: { params: { clientId: string } }) {
  const auth = await checkAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });
  try {
    const config = await loadConfigByHhpClientId(admin(), params.clientId);
    return NextResponse.json({ config });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

const VALID_VENUES = new Set([
  'upbit', 'bithumb', 'coinbase', 'bybit', 'kraken', 'bitget', 'gate',
]);

export async function PUT(request: Request, { params }: { params: { clientId: string } }) {
  const auth = await checkAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : '';

  // Whitelist + light validation — never trust the client to send arbitrary columns.
  const patch: KrSignalConfigPatch = {};
  if (typeof body.ticker === 'string') patch.ticker = body.ticker.trim().toUpperCase().slice(0, 20);
  if ('coingecko_id' in body) patch.coingecko_id = body.coingecko_id ? String(body.coingecko_id).trim() : null;
  if ('contract' in body) patch.contract = body.contract ? String(body.contract).trim() : null;
  if ('chain' in body) patch.chain = body.chain ? String(body.chain).trim() : null;
  if (typeof body.kr_listed === 'boolean') patch.kr_listed = body.kr_listed;
  if (Array.isArray(body.kr_venues)) patch.kr_venues = body.kr_venues.filter((v: any) => VALID_VENUES.has(v));
  if (Array.isArray(body.global_venues)) patch.global_venues = body.global_venues.filter((v: any) => VALID_VENUES.has(v));
  if (Array.isArray(body.peer_basket)) {
    patch.peer_basket = Array.from(new Set(
      body.peer_basket.map((v: any) => String(v).trim().toLowerCase()).filter(Boolean),
    )).slice(0, 25) as string[];
  }
  if ('content_log_source' in body) patch.content_log_source = body.content_log_source ? String(body.content_log_source).trim() : null;
  if ('telegram_chat_id' in body) patch.telegram_chat_id = body.telegram_chat_id ? String(body.telegram_chat_id).trim() : null;
  if ('telegram_thread_id' in body) patch.telegram_thread_id = body.telegram_thread_id ? String(body.telegram_thread_id).trim() : null;
  if (body.features && typeof body.features === 'object') {
    patch.features = {
      weekly_market_report: !!body.features.weekly_market_report,
      korea_listings_digest: !!body.features.korea_listings_digest,
      client_listing_alert: !!body.features.client_listing_alert,
    };
  }
  if (body.thresholds && typeof body.thresholds === 'object') {
    const t: Record<string, number> = {};
    for (const k of ['kimchi_hot', 'kimchi_positive', 'kimchi_flat', 'trend_deadband']) {
      const v = Number(body.thresholds[k]);
      if (Number.isFinite(v)) t[k] = v;
    }
    patch.thresholds = t;
  }
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;

  try {
    const config = await upsertConfigForHhpClient(admin(), params.clientId, clientName, patch);
    return NextResponse.json({ config });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
