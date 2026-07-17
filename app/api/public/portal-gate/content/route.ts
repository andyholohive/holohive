import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { authorizePortalEmail } from '@/lib/portalDocAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/portal-gate/content — gated confidential portal content
 * (audit C1 Phase 2).
 *
 * The portal surfaces meeting notes + the decision log to the client. Serving
 * those via the anon key meant client_meeting_notes / client_decision_log were
 * readable with the public key alone. This endpoint re-runs the email gate on
 * the server, then returns ONLY the calling client's rows — so those tables'
 * anon SELECT policies can be dropped.
 *
 * Body: { idOrSlug, email }. Returns { ok, meetingNotes, decisionLog }.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const idOrSlug = typeof body.idOrSlug === 'string' ? body.idOrSlug : '';
  const email = typeof body.email === 'string' ? body.email : '';
  if (!idOrSlug || !email) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Re-check the gate — never trust that the caller was authorized elsewhere.
  const auth = await authorizePortalEmail(admin as any, idOrSlug, email);
  if (!auth.ok || !auth.clientId) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const [notesRes, decisionsRes] = await Promise.all([
    (admin as any)
      .from('client_meeting_notes')
      .select('id, title, content, attendees, action_items, meeting_date, created_at')
      .eq('client_id', auth.clientId)
      .order('meeting_date', { ascending: false }),
    (admin as any)
      .from('client_decision_log')
      .select('id, decision_date, summary')
      .eq('client_id', auth.clientId)
      .order('decision_date', { ascending: false }),
  ]);

  return NextResponse.json({
    ok: true,
    meetingNotes: notesRes.data ?? [],
    decisionLog: decisionsRes.data ?? [],
  });
}
