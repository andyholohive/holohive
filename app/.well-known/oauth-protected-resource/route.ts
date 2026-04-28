import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *
 * Claude.ai uses this to discover which authorization server protects
 * our MCP endpoint. Pairs with /.well-known/oauth-authorization-server.
 *
 * For a single-issuer setup like ours (one auth server, one resource
 * server, both on the same origin), the metadata is trivial — we just
 * point back at ourselves.
 */
export async function GET(request: NextRequest) {
  const baseUrl = resolveBaseUrl(request);

  const metadata = {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
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

function resolveBaseUrl(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  return `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}
