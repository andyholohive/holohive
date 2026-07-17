import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { authorizePortalEmail } from '@/lib/portalDocAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/portal-gate/authorize — server-side client-portal email gate
 * (audit C1 Phase 2).
 *
 * Every public client-facing surface (portal, campaign tracker, report, list)
 * used to run the email gate CLIENT-SIDE, which meant the anon key had to read
 * clients.email / approved_emails / approved_domains — leaking the authorization
 * lists to anyone with the public key. This endpoint runs the identical check on
 * the server with the service role, so those columns can be revoked from anon.
 *
 * Body: { idOrSlug, email } where idOrSlug is the client's id or slug (portal),
 * or a resolved client UUID (campaign/report/list pages resolve their own
 * client_id first — client_id is not sensitive). Returns only a yes/no plus the
 * client's display name and which rule matched (for the access log) — never the
 * authorization lists themselves.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const idOrSlug = typeof body.idOrSlug === 'string' ? body.idOrSlug : '';
  const email = typeof body.email === 'string' ? body.email : '';
  if (!idOrSlug || !email) {
    return NextResponse.json({ ok: false, reason: null }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const auth = await authorizePortalEmail(admin as any, idOrSlug, email);
  return NextResponse.json({
    ok: auth.ok,
    clientId: auth.clientId,
    clientName: auth.clientName,
    reason: auth.reason,
  });
}
