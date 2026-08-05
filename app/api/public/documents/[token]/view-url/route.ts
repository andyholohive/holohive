import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { authorizePortalEmail } from '@/lib/portalDocAuth';
import { signLogToken } from '@/lib/portalLogToken';
import { resolveShareToken, recordShareLinkAccess } from '@/lib/documentShareLink';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/documents/[token]/view-url — per-document share link.
 *
 * Body: { email }. Two independent gates, and both must pass:
 *
 *   1. the token resolves to a live (not revoked, not expired) share link
 *   2. the email clears the SAME portal gate the client portal uses
 *
 * The token is addressing, not authorization. A forwarded link is therefore
 * not a leak — the recipient still has to be on the client's approved email or
 * domain list. This is the deliberate difference from a "secret URL" scheme.
 *
 * Public by middleware's /api/public/ prefix; the gates above are the guard.
 * Mirrors the portal variant's document checks so the two paths can't drift
 * into different answers about whether a document is viewable.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email : '';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Gate 1: the link itself ──────────────────────────────────────────
  // 410 (not 404) for revoked/expired: the link genuinely existed, and the
  // page shows a different message for "this was turned off" vs "never real".
  const resolved = await resolveShareToken(admin as any, params.token);
  if (!resolved.ok) {
    const status = resolved.reason === 'not_found' ? 404 : 410;
    return NextResponse.json({ error: resolved.reason }, { status });
  }

  const { data: doc } = await (admin as any)
    .from('documents')
    .select('id, title, client_id, current_version_id, status, shared, download_enabled, expires_at')
    .eq('id', resolved.link.documentId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // ── Gate 2: the viewer ───────────────────────────────────────────────
  // authorizePortalEmail takes an id-or-slug; client_id is a UUID so it
  // matches on `id`. Same rules, same free-mail exclusions as the portal.
  const auth = await authorizePortalEmail(admin as any, doc.client_id, email);
  if (!auth.ok) return NextResponse.json({ error: 'not_authorized' }, { status: 403 });

  // ── Document state ───────────────────────────────────────────────────
  // A share link does NOT override these. Un-sharing or expiring a document
  // must kill every link to it, otherwise "revoke" means two different things
  // depending on which surface you used.
  if (!doc.shared || doc.status !== 'published') {
    return NextResponse.json({ error: 'not_available' }, { status: 403 });
  }
  if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'doc_expired' }, { status: 410 });
  }
  if (!doc.current_version_id) return NextResponse.json({ error: 'no_version' }, { status: 404 });

  const { data: version } = await (admin as any)
    .from('document_versions').select('id, storage_ref, page_count')
    .eq('id', doc.current_version_id).maybeSingle();
  if (!version) return NextResponse.json({ error: 'no_version' }, { status: 404 });

  const { data: signed, error: signErr } = await (admin as any).storage
    .from('client-documents').createSignedUrl(version.storage_ref, 3600);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message || 'could not sign URL' }, { status: 500 });
  }

  // Only count opens that actually succeeded — a rejected email shouldn't
  // register as "the client read it".
  await recordShareLinkAccess(admin as any, resolved.link.linkId);

  return NextResponse.json({
    ok: true,
    title: doc.title,
    signedUrl: signed.signedUrl,
    page_count: version.page_count,
    download_enabled: doc.download_enabled,
    version_id: version.id,
    document_id: doc.id,
    client_name: auth.clientName,
    // Same signed beacon as the portal path, so opens through a share link
    // land in the access log with a trusted email attribution.
    log_token: signLogToken(doc.id, email),
  });
}
