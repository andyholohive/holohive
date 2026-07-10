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
  'id, key, name, ticker, kr_listed, telegram_chat_id, features, is_active';

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
  if ('features' in body && body.features && typeof body.features === 'object') {
    update.features = body.features;
  }
  if ('is_active' in body) update.is_active = !!body.is_active;

  const { data, error } = await supabase
    .from('kr_signal_clients')
    .update(update)
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}
