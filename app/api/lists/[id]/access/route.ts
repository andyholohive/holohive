import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * /api/lists/[id]/access
 *
 * Admin endpoint backing the "Access & Activity" dialog on the lists
 * page. GET returns full state (grants + view summary + recent events).
 * POST mutates (grant access / revoke / change duration / apply
 * duration to existing grants).
 *
 * Auth: middleware enforces the Supabase session check on /api/* by
 * default. No bearer token here.
 */

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  // Pull list, grants, recent views in parallel.
  const [listRes, grantsRes, viewsRes, viewSummaryRes] = await Promise.all([
    (supabase as any)
      .from('lists')
      .select('id, name, approved_emails, access_duration_days, created_at')
      .eq('id', params.id)
      .single(),
    (supabase as any)
      .from('list_access_grants')
      .select('id, email, granted_at, expires_at, revoked_at, revoked_reason')
      .eq('list_id', params.id)
      .order('granted_at', { ascending: false }),
    (supabase as any)
      .from('list_email_views')
      .select('email, event_type, click_target, ip_address, viewed_at')
      .eq('list_id', params.id)
      .order('viewed_at', { ascending: false })
      .limit(100),
    // Per-email view counts + last-view, computed in JS from a wider
    // slice. Good enough for the dialog UX; precise counts can come
    // from a separate query if we ever need them.
    (supabase as any)
      .from('list_email_views')
      .select('email, event_type, viewed_at')
      .eq('list_id', params.id)
      .order('viewed_at', { ascending: false })
      .limit(2000),
  ]);

  if (listRes.error || !listRes.data) {
    return NextResponse.json({ error: listRes.error?.message ?? 'List not found' }, { status: 404 });
  }

  const events = (viewSummaryRes.data || []) as any[];
  const perEmail: Record<string, { views: number; clicks: number; last_view_at: string | null }> = {};
  for (const ev of events) {
    const e = ev.email;
    if (!perEmail[e]) perEmail[e] = { views: 0, clicks: 0, last_view_at: null };
    if (ev.event_type === 'click') perEmail[e].clicks++;
    else perEmail[e].views++;
    // Events are ordered desc — first one we see per email is the latest
    if (!perEmail[e].last_view_at) perEmail[e].last_view_at = ev.viewed_at;
  }

  return NextResponse.json({
    list: {
      id: listRes.data.id,
      name: listRes.data.name,
      access_duration_days: listRes.data.access_duration_days,
      approved_emails: listRes.data.approved_emails ?? [],
    },
    grants: grantsRes.data ?? [],
    recent_events: viewsRes.data ?? [],
    per_email_summary: perEmail,
  });
}

/**
 * POST /api/lists/[id]/access
 *
 * Body actions:
 *   { action: 'grant', email, expires_at? }
 *     Add an email to approved_emails AND insert a grant row. If
 *     expires_at is omitted and the list has access_duration_days
 *     set, computes expires_at = NOW() + duration.
 *
 *   { action: 'revoke', email, reason? }
 *     Remove email from approved_emails AND mark the grant as
 *     revoked_at = NOW(), revoked_reason = reason ?? 'manual'.
 *
 *   { action: 'set_duration', days }
 *     Update lists.access_duration_days. days = null clears the
 *     auto-expire policy.
 *
 *   { action: 'apply_duration_to_existing' }
 *     Recompute expires_at on every active (not revoked) grant for
 *     this list using the list's current access_duration_days. Used
 *     when the admin wants to retroactively shorten existing grants.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const action = body?.action;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  // Pull current list state for any of the actions that need it.
  const { data: list, error: listErr } = await (supabase as any)
    .from('lists')
    .select('id, approved_emails, access_duration_days')
    .eq('id', params.id)
    .single();
  if (listErr || !list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

  switch (action) {
    case 'grant': {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
      }
      // Compute expires_at: explicit > list default > null
      let expiresAt: string | null = null;
      if (typeof body.expires_at === 'string') {
        expiresAt = body.expires_at;
      } else if (list.access_duration_days) {
        expiresAt = new Date(Date.now() + list.access_duration_days * 86_400_000).toISOString();
      }

      // Update the array (idempotent) and upsert the grant row.
      const currentEmails = (Array.isArray(list.approved_emails) ? list.approved_emails : [])
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);
      const nextEmails = currentEmails.includes(email) ? currentEmails : [...currentEmails, email];

      const [updRes, grantRes] = await Promise.all([
        (supabase as any).from('lists').update({
          approved_emails: nextEmails,
          updated_at: new Date().toISOString(),
        }).eq('id', params.id),
        (supabase as any).from('list_access_grants').upsert({
          list_id: params.id,
          email,
          granted_at: new Date().toISOString(),
          expires_at: expiresAt,
          revoked_at: null,
          revoked_reason: null,
        }, { onConflict: 'list_id,email' }),
      ]);
      if (updRes.error) return NextResponse.json({ error: updRes.error.message }, { status: 500 });
      if (grantRes.error) return NextResponse.json({ error: grantRes.error.message }, { status: 500 });

      return NextResponse.json({ ok: true, expires_at: expiresAt });
    }

    case 'revoke': {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

      const currentEmails = (Array.isArray(list.approved_emails) ? list.approved_emails : [])
        .map((e: string) => e.trim().toLowerCase());
      const nextEmails = currentEmails.filter((e: string) => e !== email);

      const [updRes, grantRes] = await Promise.all([
        (supabase as any).from('lists').update({
          approved_emails: nextEmails,
          updated_at: new Date().toISOString(),
        }).eq('id', params.id),
        (supabase as any).from('list_access_grants').update({
          revoked_at: new Date().toISOString(),
          revoked_reason: body.reason || 'manual',
        }).eq('list_id', params.id).eq('email', email),
      ]);
      if (updRes.error) return NextResponse.json({ error: updRes.error.message }, { status: 500 });
      if (grantRes.error) return NextResponse.json({ error: grantRes.error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case 'set_duration': {
      const days = body.days === null ? null : Number(body.days);
      if (days !== null && (!Number.isFinite(days) || days < 1 || days > 365)) {
        return NextResponse.json({ error: 'days must be 1..365 or null' }, { status: 400 });
      }
      const { error } = await (supabase as any)
        .from('lists')
        .update({ access_duration_days: days, updated_at: new Date().toISOString() })
        .eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case 'apply_duration_to_existing': {
      // Push the list's current access_duration_days to all active grants
      // (skip revoked ones). expires_at = granted_at + duration so we
      // honor the original grant date — not "now + duration".
      if (!list.access_duration_days) {
        return NextResponse.json({ error: 'List has no access_duration_days set' }, { status: 400 });
      }
      // Pull active grants
      const { data: grants } = await (supabase as any)
        .from('list_access_grants')
        .select('id, granted_at')
        .eq('list_id', params.id)
        .is('revoked_at', null);

      const updates = (grants || []).map((g: any) => {
        const newExpiry = new Date(new Date(g.granted_at).getTime() + list.access_duration_days * 86_400_000).toISOString();
        return (supabase as any)
          .from('list_access_grants')
          .update({ expires_at: newExpiry })
          .eq('id', g.id);
      });
      await Promise.all(updates);
      return NextResponse.json({ ok: true, updated: updates.length });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
