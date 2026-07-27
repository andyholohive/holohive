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
  // [2026-07-10] Public portal telemetry. The portal is unauthenticated
  // (client-side email gate), so this endpoint can't rely on a Supabase
  // session — external client visitors were silently 401ing here, meaning
  // only team members with an HHP session got logged (exactly backwards
  // for an EXTERNAL-visits metric). The handler validates client_id
  // existence + enum fields itself; RLS has no INSERT policy, so this
  // route stays the only write path.
  '/api/portal/log-access',
  '/api/version',                // Trivial liveness/version probe
  '/api/public/',                // Token-gated client-facing endpoints (mindshare share reports, etc.)
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

  // Link Log Automation write endpoint: EXACT /api/links only (not the
  // session-gated /api/links/submit intake). The handler validates its own
  // LINKS_WRITE_TOKEN / CRON_SECRET bearer, so no Supabase session is needed
  // for the server-to-server plugin + weekly reconcile writes.
  if (/^\/api\/links\/?$/.test(pathname)) return true;

  // Link Log Automation §3: weekly Drive reconcile intake. The Apps Script
  // on the Shared Drive POSTs the full file inventory here; the handler
  // validates its own LINKS_WRITE_TOKEN / CRON_SECRET bearer.
  if (/^\/api\/links\/reconcile\/?$/.test(pathname)) return true;

  // Document Portal access-event sink: EXACT /api/documents/log only. Fired by
  // both the team preview (cookie) and the unauthenticated client-portal viewer's
  // sendBeacon. The handler validates event_type + document_id and DERIVES
  // client_id/stint_id from the document, so the caller can't spoof scope.
  if (/^\/api\/documents\/log\/?$/.test(pathname)) return true;

  return false;
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(prefix =>
    prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

/**
 * Edge gate for KOL brief links (spec §4 "hard expiry").
 *
 * [2026-07-27] The authoritative expiry check lives in
 * KolBriefService.recordOpen — an expired token yields no page_ref, so brief
 * CONTENT was already gated before this existed. This is a fast path in front
 * of that, not a replacement: it stops an expired or unknown token from
 * rendering the page shell at all, so the KOL gets a straight answer instead of
 * a loading state that resolves into "expired".
 *
 * Deliberately FAILS OPEN. If the env is missing or Supabase is unreachable we
 * let the request through to the page, which calls the API, which enforces
 * expiry properly. Failing closed here would take every brief link down on a
 * transient database blip in exchange for no security gain — the gate behind
 * this one already holds.
 *
 * Uses PostgREST over plain fetch rather than @supabase/supabase-js: this runs
 * on the edge runtime for every brief open, and the SDK is a lot of bytes to
 * boot for a single indexed lookup.
 *
 * NOTE what this does NOT do: when page_ref points at a Google Doc, expiry
 * removes access to HHP's wrapper only. The document itself stays readable to
 * anyone holding its URL, and nothing on our side can revoke that.
 */
const BRIEF_PAGE_PREFIX = '/public/brief/';
/**
 * The rewrite target lives under the same prefix, so it would re-enter this
 * check, fail its own lookup ("expired" is not a token) and rewrite to itself
 * forever. Excluded explicitly. Real tokens are 32-char random strings, so the
 * sentinel can never collide with one.
 */
const BRIEF_EXPIRED_PATH = '/public/brief/expired';

async function briefTokenIsLive(token: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // unknown → fail open

  try {
    const res = await fetch(
      `${url}/rest/v1/kol_brief_tokens?select=expires_at&token=eq.${encodeURIComponent(token)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ expires_at: string }>;
    if (rows.length === 0) return false; // unknown token — decided, not unknown
    return new Date(rows[0].expires_at).getTime() >= Date.now();
  } catch {
    return null; // network blip → fail open
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(BRIEF_PAGE_PREFIX) && pathname !== BRIEF_EXPIRED_PATH) {
    const token = pathname.slice(BRIEF_PAGE_PREFIX.length).split('/')[0];
    if (token) {
      const live = await briefTokenIsLive(decodeURIComponent(token));
      // Only act on a definite "no". null means we could not decide; the page
      // and API still enforce expiry, so passing through is safe.
      if (live === false) {
        return NextResponse.rewrite(new URL(BRIEF_EXPIRED_PATH, request.url));
      }
    }
    return NextResponse.next();
  }

  // Only enforce on /api/*. Pages handle their own auth.
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  // Public API surface — let it through unchanged. The endpoint itself
  // is responsible for any auth it needs (cron Bearer token, Telegram
  // request signature, etc.).
  if (isPublicApi(pathname)) return NextResponse.next();

  // Mid-path dynamic public routes (handler enforces auth itself).
  if (isPublicMidPath(pathname)) return NextResponse.next();

  // ── Internal CRON_SECRET bypass ──
  // Cron handlers (under /api/cron/*) sometimes call other internal
  // endpoints server-to-server (e.g. /api/cron/discovery-scheduled
  // POSTs to /api/prospects/discovery/scan to reuse the manual-scan
  // codepath). Those calls don't carry a Supabase session cookie, so
  // without this bypass middleware would 401 them — silently breaking
  // the cron. We accept `Authorization: Bearer ${CRON_SECRET}` from
  // any /api/* path as a server-to-server auth signal. The receiving
  // handler still does its own admin/role check; this only gets the
  // request past middleware.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next({ request });
    }
  }

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
  // Run middleware on /api/* plus the one page route that needs a gate in
  // front of it. Everything else (pages, assets, _next/*) is unaffected — the
  // matcher stays deliberately narrow so we don't pay middleware on every
  // page render just to serve two use cases.
  //
  // [2026-07-27] /public/brief/* added for the KOL brief expiry gate. It is
  // the only page route here; if a second one is ever needed, reconsider
  // whether a shared page-level pattern is cleaner than a growing list.
  matcher: ['/api/:path*', '/public/brief/:path*'],
};
