import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  resolveShortLink,
  logShortLinkClick,
  buildDestination,
  VISITOR_TAG_PARAM,
} from '@/lib/shortLinkService';

/**
 * The short-link hop, shared by both route entry points.
 *
 * Two routes call this:
 *   app/l/[sub]/[[...slug]]/route.ts — `/l/tria/fitcheck`
 *   app/l/[sub]/route.ts            — `/l/tria` (the subdomain root)
 *
 * The second exists because of a build-only routing difference: an optional
 * catch-all matches the bare parent path in `next dev` but NOT in a
 * production build, so `/l/tria` 307'd locally and 404'd on Vercel. Since
 * the host rewrite turns `tria.holohive.io/` into exactly that path, the
 * root link would have been dead in production only — the failure mode dev
 * cannot show you. An explicit route removes the ambiguity entirely.
 */
export async function handleShortLinkRedirect(
  request: Request,
  subRaw: string,
  slugRaw: string,
): Promise<NextResponse> {
  const sub = (subRaw || '').toLowerCase();
  const slug = (slugRaw || '').toLowerCase();
  if (!sub) return shortLinkNotFound();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const link = await resolveShortLink(supabase, sub, slug);
  if (!link) return shortLinkNotFound();

  const incoming = new URL(request.url).searchParams;
  const destination = buildDestination(link.destination_url, incoming);

  // Awaited, not fire-and-forget: on Vercel the function can be frozen the
  // moment the response returns, which would drop an un-awaited insert.
  // logShortLinkClick swallows its own errors, so this can't cost a redirect.
  await logShortLinkClick(supabase, {
    shortLinkId: link.id,
    visitorRef: incoming.get(VISITOR_TAG_PARAM),
    referrer: request.headers.get('referer'),
    userAgent: request.headers.get('user-agent'),
  });

  // 307, not 301: browsers cache a permanent redirect indefinitely, so a
  // destination edit would never reach anyone who had already clicked.
  return NextResponse.redirect(destination, {
    status: 307,
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}

export function shortLinkNotFound(): NextResponse {
  // Self-contained: no Next asset references. On a link host every path is
  // rewritten to this handler, so a page that tried to load /_next/* chunks
  // would never get them.
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Link not found</title>
     <div style="font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem;color:#3f3f46">
       <h1 style="font-size:1.25rem;margin:0 0 .5rem">This link isn't active</h1>
       <p style="margin:0;color:#71717a">It may have been turned off or mistyped. Check with your Holo Hive contact.</p>
     </div>`,
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
