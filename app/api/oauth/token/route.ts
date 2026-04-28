import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/oauth/token
 *
 * RFC 6749 §4.1.3 — Authorization Code grant token exchange.
 *
 * Flow:
 *   1. User consented at /oauth/authorize → we issued an auth_code
 *   2. Claude.ai posts here with that code + PKCE verifier
 *   3. We validate everything and return a bearer access_token
 *   4. Claude.ai uses the access_token on every subsequent /api/mcp call
 *
 * Inputs (form-encoded):
 *   grant_type:    'authorization_code'
 *   code:          the code we issued at /oauth/authorize
 *   redirect_uri:  must match the one used in /oauth/authorize
 *   client_id:     from DCR
 *   client_secret: optional (PKCE replaces it for public clients)
 *   code_verifier: required if PKCE was used (almost always for Claude.ai)
 *
 * Validation order (fail fast):
 *   - grant_type recognized
 *   - required fields present
 *   - client exists
 *   - auth code exists, not expired, not already used
 *   - redirect_uri matches
 *   - PKCE verifier matches stored challenge (if any)
 *   - else fall back to client_secret check
 *
 * On success: delete the auth code (single-use!) and mint an access token.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return err(400, 'invalid_request', 'Body must be form-encoded');

  const grantType = String(form.get('grant_type') || '');
  const code = String(form.get('code') || '');
  const redirectUri = String(form.get('redirect_uri') || '');
  const clientId = String(form.get('client_id') || '');
  const clientSecret = form.get('client_secret');
  const codeVerifier = form.get('code_verifier');

  if (grantType !== 'authorization_code') {
    return err(400, 'unsupported_grant_type', `Only authorization_code is supported, got: ${grantType}`);
  }
  if (!code || !redirectUri || !clientId) {
    return err(400, 'invalid_request', 'code, redirect_uri, client_id required');
  }

  const supabase = serviceClient();
  if (!supabase) return err(500, 'server_error', 'Supabase config missing');

  // ── Resolve client ──
  const { data: client, error: clientErr } = await (supabase as any)
    .from('mcp_oauth_clients')
    .select('id, client_id, client_secret, redirect_uris')
    .eq('client_id', clientId)
    .single();
  if (clientErr || !client) return err(401, 'invalid_client', 'Unknown client_id');

  // ── Resolve auth code ──
  const { data: authCode, error: codeErr } = await (supabase as any)
    .from('mcp_oauth_auth_codes')
    .select('id, code, client_id, user_id, user_email, redirect_uri, code_challenge, code_challenge_method, expires_at')
    .eq('code', code)
    .single();
  if (codeErr || !authCode) return err(400, 'invalid_grant', 'Authorization code not found');
  if (authCode.client_id !== client.id) return err(400, 'invalid_grant', 'Code was issued to a different client');
  if (authCode.redirect_uri !== redirectUri) return err(400, 'invalid_grant', 'redirect_uri mismatch');
  if (new Date(authCode.expires_at).getTime() < Date.now()) {
    // Best-effort cleanup so the row doesn't sit around forever.
    await (supabase as any).from('mcp_oauth_auth_codes').delete().eq('id', authCode.id);
    return err(400, 'invalid_grant', 'Authorization code expired');
  }

  // ── PKCE check (preferred) or client_secret fallback ──
  if (authCode.code_challenge) {
    if (typeof codeVerifier !== 'string' || !codeVerifier) {
      return err(400, 'invalid_grant', 'code_verifier required (PKCE)');
    }
    const ok = verifyPkce(codeVerifier, authCode.code_challenge, authCode.code_challenge_method || 'plain');
    if (!ok) return err(400, 'invalid_grant', 'code_verifier did not match challenge');
  } else if (client.client_secret) {
    if (clientSecret !== client.client_secret) {
      return err(401, 'invalid_client', 'Invalid client_secret');
    }
  }
  // (If neither PKCE nor secret was registered, we trust the auth code's
  // single-use nature + redirect_uri match. This is the looser case.)

  // ── Burn the code ──
  await (supabase as any).from('mcp_oauth_auth_codes').delete().eq('id', authCode.id);

  // ── Mint access token (1 hour) ──
  const accessToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const { error: tokenErr } = await (supabase as any)
    .from('mcp_oauth_access_tokens')
    .insert({
      token: accessToken,
      client_id: client.id,
      user_id: authCode.user_id,
      user_email: authCode.user_email,
      expires_at: expiresAt.toISOString(),
    });
  if (tokenErr) return err(500, 'server_error', tokenErr.message);

  return cors(NextResponse.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'mcp',
  }));
}

export async function OPTIONS() {
  return cors(new NextResponse('OK', { status: 200 }));
}

/** PKCE: per RFC 7636, S256 hashes verifier with SHA-256 and base64url-encodes.
 *  'plain' just compares as-is. 'plain' is allowed but Claude.ai uses S256. */
function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method === 'S256') {
    const hashed = createHash('sha256').update(verifier).digest('base64url');
    return hashed === challenge;
  }
  // 'plain' or unrecognized → fall back to direct compare
  return verifier === challenge;
}

function err(status: number, error: string, description: string): NextResponse {
  return cors(NextResponse.json({ error, error_description: description }, { status }));
}

function cors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
