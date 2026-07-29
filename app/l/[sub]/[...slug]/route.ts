import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  resolveShortLink,
  logShortLinkClick,
  buildDestination,
  VISITOR_TAG_PARAM,
} from '@/lib/shortLinkService';

export const dynamic = 'force-dynamic';

/**
 * GET /l/<sub>/<slug> — the branded short-link hop.
 *
 * Reached two ways:
 *   • `tria.holohive.io/fitcheck` — rewritten here by the host rule in
 *     next.config.js. This is what KOLs actually receive.
 *   • `app.holohive.io/l/tria/fitcheck` — the direct form, which works
 *     without any DNS at all. Useful for testing a link before its CNAME
 *     exists, and as a fallback if a subdomain is ever misconfigured.
 *
 * Lives under a page path, not /api/*, so `middleware.ts` (which matches
 * only /api/*) never sees it — a visiting KOL has no Supabase session and
 * must not be bounced to a login screen.
 *
 * Reads with the service-role key: RLS grants `short_links` to
 * `authenticated` only, and the visitor is anonymous by definition.
 */

function notFound(): NextResponse {
  // Self-contained: no Next asset references. On a link host every path is
  // rewritten to this handler, so a page that tried to load /_next/* chunks
  // would never get them.
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Link not found</title>
     <div style="font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem;color:#3f3f46">
       <h1 style="font-size:1.25rem;margin:0 0 .5rem">This link isn't active</h1>
       <p style="margin:0;color:#71717a">It may have been turned off or mistyped. Check with your HoloHive contact.</p>
     </div>`,
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: { sub: string; slug: string[] } },
) {
  const sub = (params.sub || '').toLowerCase();
  const slug = (params.slug || []).join('/').toLowerCase();
  if (!sub || !slug) return notFound();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const link = await resolveShortLink(supabase, sub, slug);
  if (!link) return notFound();

  const incoming = new URL(request.url).searchParams;
  const destination = buildDestination(link.destination_url, incoming);

  // Await the log rather than fire-and-forget: on Vercel the function can be
  // frozen the moment the response is returned, which would drop an
  // un-awaited insert. It's a single indexed insert, and it can't fail the
  // redirect — logShortLinkClick swallows its own errors.
  await logShortLinkClick(supabase, {
    shortLinkId: link.id,
    visitorRef: incoming.get(VISITOR_TAG_PARAM),
    referrer: request.headers.get('referer'),
    userAgent: request.headers.get('user-agent'),
  });

  // 307, not 301: browsers cache a permanent redirect indefinitely, so a
  // destination edit would never reach anyone who had already clicked.
  // no-store keeps intermediaries from caching it either.
  return NextResponse.redirect(destination, {
    status: 307,
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}
