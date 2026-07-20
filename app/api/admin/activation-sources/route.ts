import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * Super-admin CRUD for `campaign_activation_sources` — one row per activation
 * a campaign shows (Fogo=2, Venice=3). The config table is service-role only
 * (RLS denies anon/authenticated), so all access goes through this route.
 *
 *   GET    ?campaign_id=…            → list the campaign's sources
 *   POST   {campaign_id, activation_key, base_url, token_family, …}
 *   PATCH  {id, …fields}
 *   DELETE {id}
 *
 * Note: no token values live on this table — tokens are per-family in
 * activation_api_tokens (see /api/admin/activation-token). token_family here
 * just names which token the sync should use.
 */
const FAMILIES = ['fogo', 'venice'] as const;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const campaignId = new URL(request.url).searchParams.get('campaign_id');
  if (!campaignId) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });

  const { data, error } = await (admin() as any)
    .from('campaign_activation_sources')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sources: data ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => ({} as any));

  const campaign_id = typeof body.campaign_id === 'string' ? body.campaign_id : '';
  const activation_key = typeof body.activation_key === 'string' ? body.activation_key.trim() : '';
  const base_url = typeof body.base_url === 'string' ? body.base_url.trim().replace(/\/+$/, '') : '';
  const token_family = FAMILIES.includes(body.token_family) ? body.token_family : '';
  if (!campaign_id || !activation_key || !base_url || !token_family) {
    return NextResponse.json({ error: 'campaign_id, activation_key, base_url and token_family are required' }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(base_url)) {
    return NextResponse.json({ error: 'base_url must be an http(s) URL' }, { status: 400 });
  }

  const { data, error } = await (admin() as any)
    .from('campaign_activation_sources')
    .insert({
      campaign_id,
      activation_key,
      base_url,
      token_family,
      display_name: body.display_name?.trim() || null,
      activation_id_param: body.activation_id_param?.trim() || null,
      enabled: body.enabled === false ? false : true,
      sort_order: Number.isFinite(body.sort_order) ? body.sort_order : 0,
    })
    .select('*')
    .single();
  if (error) {
    const dup = error.code === '23505';
    return NextResponse.json({ error: dup ? 'An activation with that key already exists on this campaign.' : error.message }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, source: data });
}

export async function PATCH(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => ({} as any));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof body.activation_key === 'string') patch.activation_key = body.activation_key.trim();
  if (typeof body.base_url === 'string') patch.base_url = body.base_url.trim().replace(/\/+$/, '');
  if (typeof body.display_name === 'string') patch.display_name = body.display_name.trim() || null;
  if ('activation_id_param' in body) patch.activation_id_param = body.activation_id_param?.trim() || null;
  if (FAMILIES.includes(body.token_family)) patch.token_family = body.token_family;
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (Number.isFinite(body.sort_order)) patch.sort_order = body.sort_order;

  const { data, error } = await (admin() as any)
    .from('campaign_activation_sources')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, source: data });
}

export async function DELETE(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => ({} as any));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await (admin() as any).from('campaign_activation_sources').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
