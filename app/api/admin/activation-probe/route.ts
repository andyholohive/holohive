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
  const url = `${base}/api/activation/${endpoint}${qs}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON body (HTML error page, etc.) — return a truncated preview
      // so the admin can see what came back.
      data = text.slice(0, 2000);
    }
    return NextResponse.json({ ok: res.ok, status: res.status, url, data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, status: 0, url, error: err?.name === 'TimeoutError' ? 'Request timed out (12s).' : err?.message || 'Fetch failed' },
      { status: 200 },
    );
  }
}
