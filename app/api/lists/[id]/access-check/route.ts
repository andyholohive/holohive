import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/lists/[id]/access-check?email=...
 *
 * Public endpoint used by the public list page when the email gate
 * REJECTS an email. We check whether that email was previously granted
 * access but has since been revoked (by the auto-revoke cron, or
 * manually). If so, the public page can show a friendly "Your access
 * to this list expired on X" message instead of the generic
 * "not authorized" error.
 *
 * Response:
 *   { status: 'approved',          expires_at?: ISO }   ← currently in approved_emails
 *   { status: 'expired',           revoked_at:  ISO }   ← had access, was auto-revoked
 *   { status: 'manually_revoked',  revoked_at:  ISO }   ← admin removed them
 *   { status: 'never_granted' }                          ← no record of this email
 *
 * Auth: PUBLIC (allowlisted in middleware via isPublicMidPath). We
 * only ever return the email's own grant status, never another user's
 * data, so leaking is bounded.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ status: 'never_granted' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ status: 'never_granted' });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Look up the grant for this (list, email) pair. There's at most one
  // due to the UNIQUE constraint.
  const { data: grant } = await (supabase as any)
    .from('list_access_grants')
    .select('expires_at, revoked_at, revoked_reason')
    .eq('list_id', params.id)
    .eq('email', email)
    .maybeSingle();

  if (!grant) {
    return NextResponse.json({ status: 'never_granted' });
  }

  // Currently active grant (not revoked)
  if (!grant.revoked_at) {
    return NextResponse.json({
      status: 'approved',
      expires_at: grant.expires_at,
    });
  }

  // Was granted, then revoked. Auto-expired vs manually-revoked
  // surface differently in the UI.
  return NextResponse.json({
    status: grant.revoked_reason === 'auto-expired' ? 'expired' : 'manually_revoked',
    revoked_at: grant.revoked_at,
  });
}
