import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mindshare/projects/[id]/share-link  → generate (or rotate) the token
 * DELETE /api/mindshare/projects/[id]/share-link → revoke the token
 *
 * Admin-gated. The token is the only guard on /public/mindshare/[token] —
 * rotating it invalidates every link that was ever sent out, so we expose
 * "rotate" as a first-class action rather than a byproduct of Save.
 */
async function getAdminClient() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return { error: 'Admin only', status: 403 as const };
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return { supabase };
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await getAdminClient();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const token = randomUUID();
  const { data, error } = await (auth.supabase as any)
    .from('mindshare_projects')
    .update({ public_share_token: token })
    .eq('id', params.id)
    .select('id, public_share_token')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await getAdminClient();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await (auth.supabase as any)
    .from('mindshare_projects')
    .update({ public_share_token: null })
    .eq('id', params.id)
    .select('id, public_share_token')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}
