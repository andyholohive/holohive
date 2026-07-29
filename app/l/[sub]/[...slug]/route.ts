import { handleShortLinkRedirect } from '@/lib/shortLinkRedirect';

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
 * This is a REQUIRED catch-all (one or more segments). The subdomain root
 * (`/l/tria`) is served by the sibling app/l/[sub]/route.ts instead.
 *
 * An optional catch-all `[[...slug]]` looks like it would cover both, but
 * it only matches the bare parent path in `next dev` — in a production
 * build `/l/tria` 404s. And the two can't coexist: Next rejects
 * `/l/[sub]` alongside `/l/[sub]/[[...slug]]` as equal specificity. So
 * required-catch-all + explicit root is the only combination that builds
 * AND serves the root. See lib/shortLinkRedirect.ts.
 */
export async function GET(
  request: Request,
  { params }: { params: { sub: string; slug: string[] } },
) {
  return handleShortLinkRedirect(request, params.sub, (params.slug || []).join('/'));
}
