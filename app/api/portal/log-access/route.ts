import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/log-access
 *
 * Called by the public client portal AFTER its client-side email
 * allowlist check has passed (or on a cache hit). Records the visit
 * so admins can see who's engaging with their portal.
 *
 * Why a server route instead of writing from the browser:
 *   • IP address — browsers can't see their own egress IP reliably;
 *     Vercel exposes it on x-forwarded-for so we capture it here.
 *   • Trust boundary — anon-key clients shouldn't be able to write
 *     arbitrary rows into portal_access_log. By keeping all writes
 *     inside this route + RLS having no INSERT policy, we keep the
 *     write path narrow.
 *
 * Request body: { client_id: uuid, email: string, authorized_via: string }
 *
 * This endpoint is intentionally unauthenticated — the portal itself
 * is unauthenticated. The check we DO perform: client_id must exist
 * (so attackers can't fill the log with garbage IDs) and
 * authorized_via must be one of the allowed enum values (matches
 * the DB CHECK constraint).
 */

const ALLOWED_REASONS = new Set([
  'exact',
  'approved_email',
  'same_domain',
  'approved_domain',
  'cache',
]);

// Pulls the first IP from x-forwarded-for (Vercel sets this). Falls
// back to x-real-ip and finally null. We trim because some CDNs add
// spaces between IPs in the chain.
function readClientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  return realIp || null;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const clientId: string | undefined = body?.client_id;
  const email: string | undefined = body?.email;
  const authorizedVia: string | undefined = body?.authorized_via;

  if (!clientId || !email || !authorizedVia) {
    return NextResponse.json(
      { error: 'client_id, email, authorized_via are required' },
      { status: 400 }
    );
  }
  if (!ALLOWED_REASONS.has(authorizedVia)) {
    return NextResponse.json({ error: 'Invalid authorized_via' }, { status: 400 });
  }

  // Service-role client — bypasses RLS for the write. We don't expose
  // this client to the browser; the only call site is this route.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Sanity-check the client exists. Prevents attackers from poisoning
  // the log with garbage UUIDs that don't reference real clients.
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single();
  if (clientErr || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const userAgent = request.headers.get('user-agent') || null;
  const ipAddress = readClientIp(request);

  const { error: insertErr } = await supabase
    .from('portal_access_log')
    .insert({
      client_id: clientId,
      email: String(email).toLowerCase().trim(),
      authorized_via: authorizedVia,
      user_agent: userAgent,
      ip_address: ipAddress,
    });

  if (insertErr) {
    console.error('[portal/log-access] insert error:', insertErr);
    // Don't leak the DB error to the caller. The portal page doesn't
    // care about the response — fire-and-forget — so a 500 is fine.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
