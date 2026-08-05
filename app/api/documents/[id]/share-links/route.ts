import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { requireRole } from '@/lib/requireSuperAdmin';
import { mintShareToken } from '@/lib/documentShareLink';

export const dynamic = 'force-dynamic';

const TEAM = ['member', 'admin', 'super_admin'];

function admin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/documents/[id]/share-links — list this document's share links.
 *
 * Returns live links first, then revoked ones, so the panel reads as
 * "what's out there now" before "what used to be".
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, TEAM);
  if (!guard.ok) return guard.response;

  const db = admin();
  if (!db) return NextResponse.json({ error: 'server configuration error' }, { status: 500 });

  const { data, error } = await (db as any)
    .from('document_share_links')
    .select('id, token, label, created_at, expires_at, revoked_at, last_accessed_at, access_count')
    .eq('document_id', params.id)
    .order('revoked_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data ?? [] });
}

/**
 * POST /api/documents/[id]/share-links — mint a new link.
 *
 * Body: { label?, expires_at? }. Both optional — a link with no expiry is
 * fine because it can still be revoked, and it still can't be opened by
 * anyone who fails the client's email gate.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, TEAM);
  if (!guard.ok) return guard.response;

  const db = admin();
  if (!db) return NextResponse.json({ error: 'server configuration error' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
  const expiresAt = typeof body.expires_at === 'string' && body.expires_at ? body.expires_at : null;

  // Refuse to mint a link for a document nobody could open anyway — otherwise
  // you hand a client a URL that answers "not available" and looks broken.
  const { data: doc } = await (db as any)
    .from('documents').select('id, shared, status, current_version_id').eq('id', params.id).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  if (!doc.current_version_id) {
    return NextResponse.json({ error: 'Attach a PDF before sharing this document.' }, { status: 400 });
  }
  if (doc.status !== 'published' || !doc.shared) {
    return NextResponse.json(
      { error: 'Turn on Shared for this document first — a link can’t override that.' },
      { status: 400 },
    );
  }

  const { data, error } = await (db as any)
    .from('document_share_links')
    .insert({
      document_id: params.id,
      token: mintShareToken(),
      label,
      expires_at: expiresAt,
      created_by: guard.user?.id ?? null,
    })
    .select('id, token, label, created_at, expires_at, revoked_at, last_accessed_at, access_count')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}
