import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { DocumentPortalService } from '@/lib/documentPortalService';
import { authorizePortalEmail } from '@/lib/portalDocAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/portal/[id]/documents — shared documents for a client portal.
 *
 * Auto-allow-listed by the /api/public/ prefix. The portal has no server session,
 * so the caller re-passes the gate email (in the body, never the URL) and we
 * re-check it against the client's authorization rules before returning any
 * confidential document metadata. Returns list only — the signed URL is minted
 * per-document by the sibling view-url route.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
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

  const auth = await authorizePortalEmail(admin as any, params.id, email);
  if (!auth.ok || !auth.clientId) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  const service = new DocumentPortalService(admin as any);
  const docs = await service.listSharedForClient(auth.clientId);

  return NextResponse.json({
    ok: true,
    documents: docs.map(d => ({
      id: d.id,
      title: d.title,
      page_count: d.page_count,
      download_enabled: d.download_enabled,
      created_at: d.created_at,
    })),
  });
}
