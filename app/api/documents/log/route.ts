import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/documents/log — append a Document Portal access event (spec §5).
 *
 * The viewer's navigator.sendBeacon fires here on open, page-view flush, and
 * close. Same-origin beacons carry the session cookie, so middleware's default
 * session gate applies (the viewer is a logged-in surface for the internal
 * preview; the portal embed will get a token-gated public variant). Append-only;
 * client_id/stint_id are derived from the document so the caller can't spoof
 * attribution scope.
 */
const EVENTS = new Set(['doc_opened', 'page_view', 'doc_closed', 'download']);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !EVENTS.has(body.event_type) || !body.document_id) {
    return NextResponse.json({ error: 'invalid event' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: doc } = await (admin as any)
    .from('documents').select('id, client_id, stint_id').eq('id', body.document_id).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') || null;

  const { error } = await (admin as any).from('document_access_log').insert({
    event_type: body.event_type,
    document_id: doc.id,
    client_id: doc.client_id,
    stint_id: doc.stint_id,
    portal_user_id: body.portal_user_id ?? null,
    version_id: body.version_id ?? null,
    page_no: Number.isFinite(body.page_no) ? Number(body.page_no) : null,
    dwell_ms: Number.isFinite(body.dwell_ms) ? Number(body.dwell_ms) : null,
    session_id: body.session_id ?? null,
    ip,
    user_agent: request.headers.get('user-agent'),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
