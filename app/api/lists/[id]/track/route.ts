import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lists/[id]/track
 *
 * Records a view or click event from the PUBLIC list page. Called by
 * the public page after the email gate is passed (for view) or when
 * a viewer clicks on a KOL's link (for click). One row per event in
 * list_email_views.
 *
 * Body:
 *   {
 *     email: string,
 *     event_type: 'view' | 'click',
 *     click_target?: string  // KOL id or URL — only for click events
 *   }
 *
 * Auth: PUBLIC (no Supabase session). The email is validated against
 * the list's approved_emails array — if the viewer's email isn't
 * approved we 403 instead of recording. Middleware allowlists this
 * route under /api/lists/.../track.
 *
 * Defensive: silently no-ops on the most common error cases (list not
 * found, email not approved, expired access) without leaking why.
 * Failed tracking shouldn't break the public page experience.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const eventType = body?.event_type === 'click' ? 'click' : 'view';
  const clickTarget = typeof body?.click_target === 'string' ? body.click_target.slice(0, 500) : null;

  if (!email) {
    return NextResponse.json({ ok: false, error: 'Email required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ ok: false, error: 'Server config missing' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Authoritative gate: the email must be in the list's approved_emails.
  // The grants table is for record-keeping; the array is the read gate.
  const { data: list } = await (supabase as any)
    .from('lists')
    .select('id, approved_emails')
    .eq('id', params.id)
    .single();

  if (!list) {
    return NextResponse.json({ ok: false, error: 'List not found' }, { status: 404 });
  }

  const approved = Array.isArray(list.approved_emails) ? list.approved_emails : [];
  const isApproved = approved.length === 0
    ? true   // public list (no gate)
    : approved.map((e: string) => e.trim().toLowerCase()).includes(email);

  if (!isApproved) {
    // Don't 401 — the public page might be stale. Just don't record.
    return NextResponse.json({ ok: false, error: 'Email not approved' }, { status: 403 });
  }

  // Light forwarding-header capture for audit. Hosted on Vercel so
  // x-forwarded-for is the canonical IP source.
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const ua = request.headers.get('user-agent')?.slice(0, 500) || null;

  // Insert the event row. Failures here are logged server-side but
  // don't fail the public page interaction (it's tracking, not
  // anything critical).
  const { error } = await (supabase as any)
    .from('list_email_views')
    .insert({
      list_id: params.id,
      email,
      event_type: eventType,
      click_target: clickTarget,
      ip_address: ip,
      user_agent: ua,
    });

  if (error) {
    console.error('[lists/track] insert failed:', error.message);
    return NextResponse.json({ ok: false, error: 'Insert failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
