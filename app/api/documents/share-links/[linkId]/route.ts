import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { requireRole } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/documents/share-links/[linkId] — revoke (or un-revoke) one link.
 *
 * Body: { revoked: boolean }.
 *
 * Soft, not destructive: the row stays so the access history it accumulated
 * still means something, and so "who did we send this to" survives the revoke.
 * Killing a link never touches the document — that separation is the point of
 * having links at all.
 */
export async function PATCH(request: Request, { params }: { params: { linkId: string } }) {
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

  const body = await request.json().catch(() => ({}));
  const revoked = body.revoked !== false; // default to revoking

  const { data, error } = await (admin as any)
    .from('document_share_links')
    .update({ revoked_at: revoked ? new Date().toISOString() : null })
    .eq('id', params.linkId)
    .select('id, token, label, created_at, expires_at, revoked_at, last_accessed_at, access_count')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}
