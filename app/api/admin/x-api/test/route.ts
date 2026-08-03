import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/x-api/test
 *
 * Health check for the X API credential, surfaced on /settings.
 *
 * [2026-08-03] Reports THREE things rather than a single "connected", because
 * there are three independent ways this can be useless to us and two of them
 * look identical to success from the outside:
 *
 *   1. tokenValid    — does the bearer authenticate at all
 *   2. impressions   — is `impression_count` actually present in public_metrics
 *                      for a post we do NOT own. This is the whole reason to
 *                      pay for the API: view counts are the headline number on
 *                      a campaign dashboard, and the Telegram cron already
 *                      provides them for the other 62% of content. A token
 *                      that authenticates but omits this field cannot power
 *                      the metrics cron.
 *   3. rateLimited   — 429 means the token is fine but we are throttled, which
 *                      would otherwise read as a generic failure.
 *
 * Credits are deliberately NOT checked here: X exposes no balance endpoint on
 * the v2 API, only the console. A 402/403 on a real call is the signal, and it
 * surfaces through `ok: false` with the upstream message.
 *
 * Probe post is a real KOL post already in `contents` — chosen over a
 * synthetic ID so a pass means "this works on our actual data", not "this
 * works on a post X happens to serve". One read ≈ $0.005 at pay-per-use.
 */
const PROBE_TWEET_ID = '1947549658907296189';

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const token = process.env.X_API_BEARER_TOKEN;
  if (!token) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: 'X_API_BEARER_TOKEN is not set in this environment.',
    });
  }

  const url = `https://api.x.com/2/tweets?ids=${PROBE_TWEET_ID}&tweet.fields=public_metrics`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    const body = await res.json().catch(() => null);

    if (res.status === 429) {
      return NextResponse.json({
        ok: false,
        configured: true,
        tokenValid: true,
        rateLimited: true,
        message: 'Rate limited (429). The token works — retry in a few minutes.',
      });
    }

    if (!res.ok) {
      // Surface X's own wording. A 401 is a bad token; 402/403 is usually
      // credits or access level, and the distinction matters to whoever reads
      // this — don't flatten them into "failed".
      const detail = body?.title || body?.detail || body?.errors?.[0]?.message || `HTTP ${res.status}`;
      return NextResponse.json({
        ok: false,
        configured: true,
        tokenValid: res.status !== 401,
        status: res.status,
        message: detail,
      });
    }

    const metrics = body?.data?.[0]?.public_metrics ?? null;
    const impressions = metrics?.impression_count;
    const hasImpressions = typeof impressions === 'number';

    return NextResponse.json({
      ok: hasImpressions,
      configured: true,
      tokenValid: true,
      hasImpressions,
      metrics,
      message: hasImpressions
        ? `Working — probe post reports ${impressions.toLocaleString('en-US')} impressions.`
        : 'Token works, but public_metrics has no impression_count on a post we do not own. '
          + 'View counts cannot be automated from this credential.',
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      configured: true,
      message: err instanceof Error ? err.message : 'Request to api.x.com failed.',
    });
  }
}
