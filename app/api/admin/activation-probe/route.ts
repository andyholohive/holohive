import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/activation-probe — ad-hoc inspector for the activation
 * microsite API (Bolt's endpoints). Super-admin only.
 *
 * Why a server proxy rather than fetching from the dialog directly:
 *   1. CORS — the microsite hosts won't send Access-Control-Allow-Origin
 *      for app.holohive.io, so a browser fetch would fail before it ever
 *      reached the 401/200. Server-to-server has no CORS.
 *   2. The Bearer token never touches a third-party host from the browser;
 *      it goes admin → our server (same-origin HTTPS) → microsite.
 *
 * This is a TEST tool only — the production hourly sync reads its tokens
 * from Vercel env, never from a request body. Nothing here is persisted.
 *
 * Body: { base, endpoint, activation_id?, token? }
 * Returns: { ok, status, url, data } — always HTTP 200 so the dialog can
 * render the upstream status/body inline (incl. a 401).
 */
const ENDPOINTS = ['summary', 'entries-daily', 'entries-by-kol', 'clicks', 'ugc'] as const;
type Endpoint = (typeof ENDPOINTS)[number];

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({} as any));
  const base = typeof body.base === 'string' ? body.base.trim().replace(/\/+$/, '') : '';
  const endpoint: Endpoint = ENDPOINTS.includes(body.endpoint) ? body.endpoint : 'summary';
  const activationId = typeof body.activation_id === 'string' ? body.activation_id.trim() : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!base || !/^https?:\/\//i.test(base)) {
    return NextResponse.json({ ok: false, error: 'A valid http(s) base URL is required.' }, { status: 400 });
  }

  const qs = activationId ? `?activation_id=${encodeURIComponent(activationId)}` : '';
  const startUrl = `${base}/api/activation/${endpoint}${qs}`;

  // Follow redirects MANUALLY so the Authorization header survives. The
  // built-in fetch redirect follower strips Authorization on any cross-origin
  // hop — and these microsites 308 apex→https→www (e.g. venicekorea.app →
  // www.venicekorea.app), which silently drops the token and 401s. We
  // re-attach the token only across same-site hops (apex↔www / scheme
  // upgrade) so it can never leak to an unrelated host.
  const relatedHost = (a: string, b: string) =>
    a === b || `www.${a}` === b || a === `www.${b}`;

  try {
    let current = startUrl;
    let carryAuth = true;
    let res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(12_000),
        headers: {
          Accept: 'application/json',
          ...(token && carryAuth ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) break;
        const next = new URL(loc, current);
        carryAuth = relatedHost(new URL(current).host, next.host);
        current = next.toString();
        continue;
      }
      break;
    }

    const finalRes = res!;
    const text = await finalRes.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON body (HTML error page, etc.) — return a truncated preview.
      data = text.slice(0, 2000);
    }
    return NextResponse.json({ ok: finalRes.ok, status: finalRes.status, url: current, data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, status: 0, url: startUrl, error: err?.name === 'TimeoutError' ? 'Request timed out (12s).' : err?.message || 'Fetch failed' },
      { status: 200 },
    );
  }
}
