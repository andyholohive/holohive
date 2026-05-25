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

/**
 * Routes that match /api/* but are public per-handler. We can't put
 * these in PUBLIC_API_PREFIXES because they're mid-path patterns
 * (the [id] segment is dynamic). Each handler enforces its own auth
 * (e.g. /api/lists/[id]/track validates email against approved_emails).
 *
 * Order matters: this set is checked AFTER PUBLIC_API_PREFIXES, so
 * adding a prefix here only matters for paths that didn't already
 * match a prefix.
 */
function isPublicMidPath(pathname: string): boolean {
  // Public list view-tracking: /api/lists/<uuid>/track
  // Called from the public list page after the email gate is passed.
  // Handler validates the email against the list's approved_emails
  // before recording, so middleware allowance is safe.
  if (/^\/api\/lists\/[^/]+\/track\/?$/.test(pathname)) return true;

  // Public access-check: /api/lists/<uuid>/access-check?email=...
  // Called from the public list page when the email gate REJECTS an
  // email. Returns whether that email's access was previously granted
  // and revoked (so the page can show a friendly "expired" message
  // instead of generic "not authorized"). Returns only the requested
  // email's own status, never broader data.
  if (/^\/api\/lists\/[^/]+\/access-check\/?$/.test(pathname)) return true;

  return false;
}

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

  // Mid-path dynamic public routes (handler enforces auth itself).
  if (isPublicMidPath(pathname)) return NextResponse.next();

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
