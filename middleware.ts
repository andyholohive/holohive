import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * App-wide API auth gate.
 *
 * Without this every internal /api/* endpoint was reachable anonymously.
 * That meant a curl from anywhere on the internet could read the entire
 * prospect database, mutate alert routing, dismiss prospects, etc.
 *
 * Strategy: protect everything under /api/* by default, with a conservative
 * allow-list for endpoints that legitimately need to accept anonymous
 * traffic. If you add a new public endpoint, add its prefix to the list.
 *
 * Auth check: Supabase session via cookies, identical to the pattern in
 * lib/supabase-server.ts. We only call .auth.getUser() — no further DB
 * round-trips — so the per-request overhead is one quick token validation.
 *
 * Pages, static assets, etc. are NOT touched (matcher excludes them) —
 * pages already have their own auth-gating where needed and middleware
 * here is scoped to /api/*.
 */

// Endpoints that must accept anonymous traffic. Match by URL prefix.
// Cron endpoints have their own Bearer-token gate via CRON_SECRET inside
// the handler. Webhooks (Telegram, etc.) are called by external services
// that don't carry a user session. Forms are submitted by random people
// via shared links and validate at the application layer.
const PUBLIC_API_PREFIXES = [
  '/api/cron/',                  // CRON_SECRET-gated
  '/api/telegram/webhook',       // Telegram-gated (their API call)
  '/api/webhooks/',              // External integration webhooks
  '/api/forms/submit',           // Public form intake
  '/api/version',                // Trivial liveness/version probe
  // ── MCP (Claude.ai connector) ──
  // The MCP route validates its own Bearer token against
  // mcp_oauth_access_tokens; OAuth endpoints are public by RFC design.
  // Without these allowed, Claude.ai can't authenticate (no Supabase
  // session cookie on cross-origin requests from Anthropic's servers).
  '/api/mcp/',                   // bearer-token-gated by lib/mcp/auth.ts
  '/api/oauth/',                 // OAuth 2.0 token + DCR endpoints
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(prefix =>
    prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only enforce on /api/*. Pages handle their own auth.
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  // Public API surface — let it through unchanged. The endpoint itself
  // is responsible for any auth it needs (cron Bearer token, Telegram
  // request signature, etc.).
  if (isPublicApi(pathname)) return NextResponse.next();

  // ── Authenticated path ──
  // Wrap a Supabase server client around the request cookies so we can
  // resolve the current user without making the route handlers do it.
  const response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Misconfigured deployment — don't lock everything out, just log loudly.
    console.error('[middleware] Missing Supabase env vars; allowing /api/* through unauthenticated');
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    // Return JSON 401 — the routes downstream return JSON, and clients
    // that read the response body get a clean error shape.
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  // Authed — let it through with refreshed session cookies.
  return response;
}

export const config = {
  // Run middleware on /api/* only. Everything else (pages, assets, _next/*)
  // is unaffected. We also skip Next's internal endpoints + the webhook
  // routes explicitly so the matcher itself stays cheap.
  matcher: ['/api/:path*'],
};
