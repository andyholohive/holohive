import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { authorizePortalEmail } from '@/lib/portalDocAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/portal/documents/[docId]/view-url — client-portal signed URL.
 *
 * The portal viewer calls this with { portalId, email }. We re-run the email
 * gate for portalId, then confirm the document belongs to that client AND is
 * shared + published + not revoked + not expired before minting a short-lived
 * signed URL. Confidential-by-default: an unguessable doc id alone is not enough.
 */
export async function POST(request: Request, { params }: { params: { docId: string } }) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email : '';
  const portalId = typeof body.portalId === 'string' ? body.portalId : '';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const auth = await authorizePortalEmail(admin as any, portalId, email);
  if (!auth.ok || !auth.clientId) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  const { data: doc } = await (admin as any)
    .from('documents')
    .select('id, title, client_id, current_version_id, status, shared, download_enabled, expires_at')
    .eq('id', params.docId)
    .maybeSingle();
  if (!doc || doc.client_id !== auth.clientId) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!doc.shared || doc.status !== 'published') return NextResponse.json({ error: 'not available' }, { status: 403 });
  if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 403 });
  }
  if (!doc.current_version_id) return NextResponse.json({ error: 'no version uploaded' }, { status: 404 });

  const { data: version } = await (admin as any)
    .from('document_versions').select('id, storage_ref, page_count').eq('id', doc.current_version_id).maybeSingle();
  if (!version) return NextResponse.json({ error: 'version missing' }, { status: 404 });

  const { data: signed, error: signErr } = await (admin as any).storage
    .from('client-documents').createSignedUrl(version.storage_ref, 3600);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message || 'could not sign URL' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    title: doc.title,
    signedUrl: signed.signedUrl,
    page_count: version.page_count,
    download_enabled: doc.download_enabled,
    version_id: version.id,
    document_id: doc.id,
  });
}
