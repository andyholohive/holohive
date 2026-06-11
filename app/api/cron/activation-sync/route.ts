import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/activation-sync
 *
 * Spec section 4.2 of the HHP Campaign Dashboard (Jdot, 2026-06-05).
 * Polls each campaign's `activation_api_base_url` (when set) and
 * snapshots the result into `activation_snapshots`. The campaign
 * page reads from the cache, never live from the portal.
 *
 * Endpoints fetched per the spec:
 *   GET <base>/api/activation/summary         → KPI totals + meta
 *   GET <base>/api/activation/entries-daily   → date / count series
 *   GET <base>/api/activation/entries-by-kol  → per-KOL entry counts
 *   GET <base>/api/activation/clicks          → ecosystem clicks
 *   GET <base>/api/activation/ugc             → UGC performance
 *
 * Schedule: hourly is sufficient per spec section 4.2. Register in
 * vercel.json once Andy is ready for the first activation to go
 * live; until then this route is a no-op for every campaign with
 * activation_api_base_url unset.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Graceful degrade:
 *   • Per-campaign per-endpoint failures don't stop the run; logged
 *     per row and included in the response. Other campaigns still
 *     snapshot cleanly.
 *   • If summary endpoint is missing entirely we skip the campaign
 *     (no point storing a row with no headline data).
 *   • Empty bases (most campaigns today) skip silently.
 */
export async function GET(request: Request) {
  // Auth — accept either CRON_SECRET (cron schedule) OR an
  // authenticated Supabase session cookie (admin-triggered "Sync Now"
  // button from the activation settings dialog). The session path
  // re-validates the user is super_admin so it can't be exploited
  // by random session holders.
  const url = new URL(request.url);
  const campaignIdFilter = url.searchParams.get('campaign_id');
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const cronAuthOk = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!cronAuthOk) {
    // Admin path — require super_admin.
    const { requireSuperAdmin } = await import('@/lib/requireSuperAdmin');
    const guard = await requireSuperAdmin(request);
    if (!guard.ok) return guard.response;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const start = Date.now();

  try {
    // Per-campaign filter when called from the admin Sync Now button.
    // Without it, the route iterates every campaign that has an
    // activation_api_base_url set (cron's job).
    let query = (supabase as any)
      .from('campaigns')
      .select('id, activation_api_base_url')
      .not('activation_api_base_url', 'is', null)
      .is('archived_at', null);
    if (campaignIdFilter) query = query.eq('id', campaignIdFilter);
    const { data: campaigns, error } = await query;
    if (error) throw error;

    const rows = (campaigns || []) as Array<{ id: string; activation_api_base_url: string }>;

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        campaignsConsidered: 0,
        snapshotsWritten: 0,
        skipReason: 'no campaigns have activation_api_base_url set',
        durationMs: Date.now() - start,
      });
    }

    type EndpointKey = 'summary' | 'entries-daily' | 'entries-by-kol' | 'clicks' | 'ugc';
    const endpoints: EndpointKey[] = ['summary', 'entries-daily', 'entries-by-kol', 'clicks', 'ugc'];

    let snapshotsWritten = 0;
    const errors: Array<{ campaign_id: string; error: string }> = [];

    for (const c of rows) {
      try {
        const base = c.activation_api_base_url.replace(/\/+$/, '');
        const fetches = await Promise.all(endpoints.map(async (ep): Promise<[EndpointKey, any | null]> => {
          try {
            const res = await fetch(`${base}/api/activation/${ep}`, {
              // Conservative timeout via AbortController. Microsite
              // hosts can be flaky and we don't want the cron to
              // run long. 10s is plenty for a typical KV-backed
              // microsite endpoint.
              signal: AbortSignal.timeout(10_000),
              headers: { Accept: 'application/json' },
            });
            if (!res.ok) return [ep, null];
            return [ep, await res.json()];
          } catch {
            return [ep, null];
          }
        }));

        const blobs = Object.fromEntries(fetches) as Record<EndpointKey, any | null>;

        if (!blobs.summary) {
          // No summary = no point snapshotting. Skip this campaign
          // for this run; we'll try again next cron tick.
          errors.push({ campaign_id: c.id, error: 'summary endpoint returned no data' });
          continue;
        }

        const summary = blobs.summary || {};
        const insertPayload: Record<string, any> = {
          campaign_id: c.id,
          activation_name: summary.name || null,
          activation_type: summary.type || null,
          status:          summary.status || null,
          start_date:      summary.start_date || null,
          end_date:        summary.end_date || null,
          summary_json:        blobs.summary,
          entries_daily_json:  blobs['entries-daily'],
          entries_by_kol_json: blobs['entries-by-kol'],
          clicks_json:         blobs.clicks,
          ugc_json:            blobs.ugc,
          synced_at: new Date().toISOString(),
        };

        const { error: insertErr } = await (supabase as any)
          .from('activation_snapshots')
          .insert(insertPayload);
        if (insertErr) {
          errors.push({ campaign_id: c.id, error: insertErr.message });
        } else {
          snapshotsWritten++;
        }
      } catch (err: any) {
        errors.push({ campaign_id: c.id, error: err?.message || String(err) });
      }
    }

    // agent_runs log for cron-health-check coverage. Best-effort so
    // a logging hiccup doesn't mask the real result.
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'ACTIVATION_SYNC',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status: errors.length === rows.length ? 'failed' : 'success',
        output_summary: `Snapshotted ${snapshotsWritten} of ${rows.length} campaign(s).`,
      });
    } catch {/* swallow */}

    return NextResponse.json({
      ok: true,
      campaignsConsidered: rows.length,
      snapshotsWritten,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[cron/activation-sync] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'sync failed' },
      { status: 500 },
    );
  }
}
