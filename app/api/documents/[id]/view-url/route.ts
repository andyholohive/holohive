import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { requireRole } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[id]/view-url — signed URL + metadata for the pdf.js
 * viewer (Document Portal spec §3). Team-gated for the internal preview; the
 * client-portal embed will get its own access-gated variant.
 *
 * Returns a short-lived signed URL to the current version's PDF plus the meta
 * the viewer needs (page_count, download_enabled, ids for access logging).
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, ['member', 'admin', 'super_admin']);
  if (!guard.ok) return guard.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: doc } = await (admin as any)
    .from('documents')
    .select('id, title, client_id, stint_id, current_version_id, status, download_enabled, expires_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (doc.status === 'revoked') return NextResponse.json({ error: 'revoked' }, { status: 403 });
  if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 403 });
  }
  if (!doc.current_version_id) return NextResponse.json({ error: 'no version uploaded' }, { status: 404 });

  const { data: version } = await (admin as any)
    .from('document_versions')
    .select('id, storage_ref, page_count')
    .eq('id', doc.current_version_id)
    .maybeSingle();
  if (!version) return NextResponse.json({ error: 'version missing' }, { status: 404 });

  const { data: signed, error: signErr } = await (admin as any).storage
    .from('client-documents')
    .createSignedUrl(version.storage_ref, 3600);
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
    client_id: doc.client_id,
    stint_id: doc.stint_id,
  });
}
