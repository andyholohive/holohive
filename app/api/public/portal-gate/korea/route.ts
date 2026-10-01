import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizePortalEmail } from '@/lib/portalDocAuth';
import { buildKoreaSummary } from '@/lib/koreaIntel/summary';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/portal-gate/korea — the client portal's Korea section.
 *
 * Same contract as /portal-gate/content: re-run the email gate on the server,
 * then return only the calling client's data. Body: { idOrSlug, email }.
 * Returns { ok, summary } — summary is null for a client with no Korea setup,
 * and the portal renders nothing in that case.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const idOrSlug = typeof body.idOrSlug === 'string' ? body.idOrSlug : '';
  const email = typeof body.email === 'string' ? body.email : '';
  if (!idOrSlug || !email) return NextResponse.json({ ok: false }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: 'server configuration error' }, { status: 500 });
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Never trust that the caller was authorized elsewhere.
  const auth = await authorizePortalEmail(admin as any, idOrSlug, email);
  if (!auth.ok || !auth.clientId) return NextResponse.json({ ok: false }, { status: 403 });

  try {
    const summary = await buildKoreaSummary(admin, auth.clientId);
    return NextResponse.json({ ok: true, summary });
  } catch (err: any) {
    console.error('[portal-gate/korea]', err);
    return NextResponse.json({ ok: false, error: 'Could not load Korea data' }, { status: 500 });
  }
}
