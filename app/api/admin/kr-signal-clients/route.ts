import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET/PATCH /api/admin/kr-signal-clients — super-admin config for the KR Signal Bot.
 * kr_signal_clients is RLS-locked (service-role only), so the admin UI goes through
 * this guarded route rather than the browser Supabase client.
 */

const COLUMNS =
  'id, key, name, ticker, kr_listed, telegram_chat_id, telegram_thread_id, features, is_active, peer_basket, content_log_source, client_id';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });

  const { data, error } = await supabase
    .from('kr_signal_clients')
    .select(COLUMNS)
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data ?? [] });
}

export async function PATCH(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('telegram_chat_id' in body) {
    const raw = (body.telegram_chat_id ?? '').toString().trim();
    update.telegram_chat_id = raw === '' ? null : raw;
  }
  if ('telegram_thread_id' in body) {
    const raw = (body.telegram_thread_id ?? '').toString().trim();
    update.telegram_thread_id = raw === '' ? null : raw;
  }
  if ('features' in body && body.features && typeof body.features === 'object') {
    update.features = body.features;
  }
  if ('is_active' in body) update.is_active = !!body.is_active;
  // §6.4 peer rank input — CoinGecko ids. Accepts an array; blanks dropped.
  if ('peer_basket' in body) {
    const arr = Array.isArray(body.peer_basket) ? body.peer_basket : [];
    update.peer_basket = arr.map((s: unknown) => String(s).trim().toLowerCase()).filter(Boolean);
  }
  // §6.5 SoV source ref — 'hhp:<clients.id>' convention; empty clears it.
  if ('content_log_source' in body) {
    const raw = (body.content_log_source ?? '').toString().trim();
    update.content_log_source = raw === '' ? null : raw;
  }

  const { data, error } = await supabase
    .from('kr_signal_clients')
    .update(update)
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}
