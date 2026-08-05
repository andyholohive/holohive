import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveXAvatar } from '@/lib/xAvatar';

export const dynamic = 'force-dynamic';

/**
 * POST /api/clients/resolve-x-logo
 *
 * Body: { link: string } — an x.com / twitter.com profile URL, or a bare handle.
 * Returns: { ok: true, handle, url } | { ok: false, error }
 *
 * Backs the "fetch logo from X" affordance on the Add/Edit Client form. Turns
 * a pasted profile link into an unavatar URL that gets stored in
 * clients.logo_url, so onboarding a client doesn't require hunting down a
 * logo file.
 *
 * Server-side for two reasons: unavatar's response status isn't readable from
 * the browser (CORS), and the verification here is the whole point — see the
 * fallback note in lib/xAvatar. A resolve that isn't checked is worse than no
 * resolve, because it stores a placeholder that looks like a real logo.
 *
 * Auth: any signed-in non-guest. This only reads a public avatar and writes
 * nothing; the write happens when the form itself is saved.
 */
export async function POST(request: Request) {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await (sb as any)
    .from('users').select('role').eq('id', user.id).single();
  if (!profile?.role || profile.role === 'guest') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const resolved = await resolveXAvatar(typeof body?.link === 'string' ? body.link : null);
  // 200 either way — "that handle doesn't exist" is a normal answer to a
  // pasted link, not a request error, and the form renders it inline.
  return NextResponse.json(resolved);
}
