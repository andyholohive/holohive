import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * Claude.ai's custom-connector flow hits this URL FIRST when the user
 * pastes our MCP URL into the connector dialog. The response tells
 * Claude where to find:
 *   - the user-consent page (/oauth/authorize)
 *   - the token endpoint  (/api/oauth/token)
 *   - the dynamic client registration endpoint (/api/oauth/register)
 *
 * Without this discovery doc, Claude.ai can't connect — it doesn't know
 * how to start the OAuth dance.
 *
 * CORS: Claude.ai's browser client fetches this from a different origin,
 * so we need permissive CORS. The endpoint exposes only public metadata
 * (URLs and supported flows) — no secrets — so `*` is safe here.
 */
export async function GET(request: NextRequest) {
  const baseUrl = resolveBaseUrl(request);

  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    scopes_supported: ['mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    // PKCE-only for public clients (Claude.ai uses PKCE).
    // 'client_secret_post' is also supported for confidential clients.
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    code_challenge_methods_supported: ['S256', 'plain'],
  };

  return withCors(NextResponse.json(metadata));
}

export async function OPTIONS() {
  return withCors(new NextResponse('OK', { status: 200 }));
}

function withCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res;
}

/** Prefer the explicit NEXT_PUBLIC_BASE_URL so responses always reference
 *  the canonical custom domain even when behind a Vercel preview alias. */
function resolveBaseUrl(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  return `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}
