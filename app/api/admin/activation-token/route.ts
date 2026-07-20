import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * Super-admin token store for the activation microsite API. One token per
 * client family (fogo / venice). SECRET: stored on activation_api_tokens
 * (service-role only) and NEVER returned to the browser.
 *
 *   GET  → { fogo: boolean, venice: boolean }  (whether each is set — masked)
 *   POST {token_family, token}  → upsert (write-only)
 *
 * The hourly sync reads these server-side; the browser only ever learns
 * whether a token exists, never its value.
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
  const { data } = await (admin() as any).from('activation_api_tokens').select('token_family, updated_at');
  const set: Record<string, { set: boolean; updated_at: string | null }> = {};
  for (const f of FAMILIES) set[f] = { set: false, updated_at: null };
  for (const row of data ?? []) {
    if (set[row.token_family]) set[row.token_family] = { set: true, updated_at: row.updated_at };
  }
  return NextResponse.json({ ok: true, families: set });
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => ({} as any));
  const token_family = FAMILIES.includes(body.token_family) ? body.token_family : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token_family || !token) {
    return NextResponse.json({ error: 'token_family (fogo|venice) and token are required' }, { status: 400 });
  }
  const { error } = await (admin() as any)
    .from('activation_api_tokens')
    .upsert({ token_family, token, updated_at: new Date().toISOString(), updated_by: (guard as any).user?.id ?? null }, { onConflict: 'token_family' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
