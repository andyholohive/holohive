import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { KolBriefService } from '@/lib/kolBriefService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/brief/[token] — KOL Brief Delivery open-ping (spec §5).
 *
 * Public (anon) — the per-KOL page calls this on load. Uses the service-role
 * client (bypasses RLS; the anon key has no access to brief tables) to log an
 * append-only open event, bump the token's open count, and return what the page
 * needs to render. Possession of the unguessable token IS the access.
 *
 * Allow-listed in middleware via the /api/public/ prefix.
 */
export async function GET(request: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[public/brief] missing Supabase env');
    return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null;
  const userAgent = request.headers.get('user-agent');

  const svc = new KolBriefService(admin as any);
  const tok = await svc.recordOpen(token, { ip: ip ?? undefined, userAgent: userAgent ?? undefined });

  if (!tok) {
    // Invalid or expired — don't leak which.
    return NextResponse.json({ ok: false, expired: true }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    page_ref: tok.page_ref,
    angle_no: tok.angle_no,
    angle_name: tok.angle_name,
    expires_at: tok.expires_at,
  });
}
