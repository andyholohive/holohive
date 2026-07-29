import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * PATCH  /api/short-links/[id] — edit destination / label / active flag.
 * DELETE /api/short-links/[id] — soft-delete (frees the slug for reuse via
 *   the partial unique index).
 *
 * Subdomain and slug are deliberately NOT editable: the link is already in
 * KOL hands by the time anyone wants to change it, and silently repointing
 * a different URL is worse than creating a new one. Destination edits ARE
 * allowed — that's the whole reason the hop exists.
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.destination_url !== undefined) {
    const dest = String(body.destination_url).trim();
    try {
      const u = new URL(dest);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
    } catch {
      return NextResponse.json({ error: 'Destination must be a full http(s):// URL.' }, { status: 400 });
    }
    patch.destination_url = dest;
  }
  if (body.label !== undefined) patch.label = String(body.label).trim() || null;
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  if (body.client_id !== undefined) patch.client_id = body.client_id || null;
  if (body.campaign_id !== undefined) patch.campaign_id = body.campaign_id || null;

  const { data, error } = await (admin() as any)
    .from('short_links')
    .update(patch)
    .eq('id', params.id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;

  // Soft delete — click history stays queryable, and the row is still there
  // if someone needs to see where a retired link used to point.
  const { error } = await (admin() as any)
    .from('short_links')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
