import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/oauth/consent
 *
 * Handles the Allow/Deny submission from /oauth/authorize.
 *
 * We use a regular POST handler instead of a Next.js Server Action
 * because Server Actions require a feature flag on Next 13.5 (stable
 * in 14+) and we'd rather not enable an experimental flag for one
 * form. Behavior is identical: validate the user session, validate
 * the OAuth params, then either issue an auth code or bail with an
 * access_denied error redirect.
 *
 * Form fields (POSTed by the consent page):
 *   consent              'allow' | 'deny'
 *   client_id            from the original /oauth/authorize URL
 *   redirect_uri         "
 *   state                "
 *   code_challenge       PKCE challenge (optional)
 *   code_challenge_method 'S256' | 'plain'
 *
 * Output: 302 redirect to the registered redirect_uri with either
 * `code=...` (success) or `error=access_denied` (denied).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return errorResp('invalid_form', 'Body must be form-encoded');

  const consent = String(form.get('consent') || '');
  const clientId = String(form.get('client_id') || '');
  const redirectUri = String(form.get('redirect_uri') || '');
  const state = form.get('state') ? String(form.get('state')) : null;
  const codeChallenge = form.get('code_challenge') ? String(form.get('code_challenge')) : null;
  const codeChallengeMethod = form.get('code_challenge_method') ? String(form.get('code_challenge_method')) : null;

  if (!clientId || !redirectUri) {
    return errorResp('invalid_request', 'client_id and redirect_uri required');
  }

  // ── Verify user is logged into HoloHive ──
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return errorResp('unauthenticated', 'No HoloHive session — please sign in first');
  }

  // ── Allowed-emails gate (mirrors the /oauth/authorize check) ──
  const allowedRaw = process.env.MCP_ALLOWED_EMAILS;
  if (allowedRaw && allowedRaw.trim().length > 0) {
    const allowed = allowedRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const userEmail = (user.email || '').toLowerCase();
    if (!allowed.includes(userEmail)) {
      return errorResp('forbidden', `Account ${user.email} is not in MCP_ALLOWED_EMAILS`);
    }
  }

  // ── Resolve client (validate it still exists and redirect_uri is registered) ──
  const service = serviceClient();
  if (!service) return errorResp('server_error', 'Supabase service config missing');

  const { data: client, error: cErr } = await (service as any)
    .from('mcp_oauth_clients')
    .select('id, client_id, redirect_uris')
    .eq('client_id', clientId)
    .single();
  if (cErr || !client) return errorResp('invalid_client', 'Unknown client_id');
  if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirectUri)) {
    return errorResp('invalid_redirect_uri', 'redirect_uri is not registered for this client');
  }

  // ── Build the redirect target (we always redirect back to the client) ──
  const target = new URL(redirectUri);
  if (state) target.searchParams.set('state', state);

  if (consent !== 'allow') {
    target.searchParams.set('error', 'access_denied');
    target.searchParams.set('error_description', 'User denied the authorization request');
    return NextResponse.redirect(target.toString(), { status: 302 });
  }

  // ── Mint a 16-byte code, valid 10 min, single-use ──
  const code = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const { error: insertErr } = await (service as any)
    .from('mcp_oauth_auth_codes')
    .insert({
      code,
      client_id: client.id,
      user_id: user.id,
      user_email: user.email,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      expires_at: expiresAt.toISOString(),
    });
  if (insertErr) return errorResp('server_error', `Failed to issue auth code: ${insertErr.message}`);

  target.searchParams.set('code', code);
  return NextResponse.redirect(target.toString(), { status: 302 });
}

function errorResp(error: string, description: string): NextResponse {
  // For consent errors we render a plain JSON response — the user is
  // mid-flow in their browser, so a JSON body is at least debuggable.
  // (We'd never expect to hit these in normal use; the UI prevents bad
  // state, this is just a safety net.)
  return NextResponse.json({ error, error_description: description }, { status: 400 });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
