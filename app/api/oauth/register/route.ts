import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/oauth/register
 *
 * RFC 7591 — OAuth 2.0 Dynamic Client Registration.
 *
 * Claude.ai calls this once when the user adds our connector. It POSTs
 * its client metadata (mainly the redirect URIs it'll use after the
 * consent step), and we return a freshly-minted `client_id` + optional
 * `client_secret`. Claude stores those and uses them for every
 * subsequent OAuth flow.
 *
 * Public endpoint — DCR is unauthenticated by design (any client can
 * register; the actual auth happens at the /oauth/authorize step where
 * we verify the human user is logged into HoloHive).
 *
 * Notes:
 *  - We accept an empty/missing client_secret in token exchange when
 *    PKCE is used, matching Claude.ai's public-client flow.
 *  - We DO issue a secret here regardless, so confidential-client
 *    flows still work; clients that don't want it just ignore it.
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return cors(NextResponse.json({ error: 'invalid_request', error_description: 'Body must be JSON' }, { status: 400 }));
  }

  const clientName: string = typeof body?.client_name === 'string' ? body.client_name : 'MCP Client';
  const redirectUris: unknown = body?.redirect_uris;

  if (!Array.isArray(redirectUris) || redirectUris.length === 0
      || !redirectUris.every((u): u is string => typeof u === 'string' && u.startsWith('http'))) {
    return cors(NextResponse.json(
      { error: 'invalid_redirect_uri', error_description: 'redirect_uris must be a non-empty array of https URLs' },
      { status: 400 },
    ));
  }

  const supabase = serviceClient();
  if (!supabase) {
    return cors(NextResponse.json({ error: 'server_error', error_description: 'Supabase config missing' }, { status: 500 }));
  }

  // 24-byte client_id (URL-safe), 32-byte client_secret (hex).
  // Both are random; client_id is the "public" identifier and is allowed
  // to appear in URLs (the authorization request includes it).
  const clientId = randomBytes(24).toString('base64url');
  const clientSecret = randomBytes(32).toString('hex');

  const { error } = await (supabase as any)
    .from('mcp_oauth_clients')
    .insert({
      client_id: clientId,
      client_secret: clientSecret,
      client_name: clientName,
      redirect_uris: redirectUris,
    });

  if (error) {
    console.error('[OAuth register] insert failed:', error.message);
    return cors(NextResponse.json({ error: 'server_error', error_description: error.message }, { status: 500 }));
  }

  // RFC 7591 response shape — Claude.ai parses these specific keys.
  return cors(NextResponse.json({
    client_id: clientId,
    client_secret: clientSecret,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  }));
}

export async function OPTIONS() {
  return cors(new NextResponse('OK', { status: 200 }));
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
