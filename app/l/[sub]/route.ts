import { handleShortLinkRedirect } from '@/lib/shortLinkRedirect';

export const dynamic = 'force-dynamic';

/**
 * GET /l/<sub> — the subdomain ROOT link (`tria.holohive.io/`).
 *
 * Exists as its own route because the sibling optional catch-all
 * `[[...slug]]` matches this path in `next dev` but NOT in a production
 * build. That gap was invisible locally and 404'd on Vercel — and since
 * the host rewrite maps `tria.holohive.io/` to exactly `/l/tria`, it would
 * have broken the root link in production only.
 *
 * Root links are what let a subdomain move off GoDaddy Domain Forwarding
 * without losing wherever it used to point (tria → the ambassadors site).
 */
export async function GET(request: Request, { params }: { params: { sub: string } }) {
  return handleShortLinkRedirect(request, params.sub, '');
}
