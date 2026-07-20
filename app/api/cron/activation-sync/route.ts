import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { activationFetch, activationUrl } from '@/lib/activationFetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/activation-sync
 *
 * Polls each row in `campaign_activation_sources` (base + optional
 * activation_id + token_family) and snapshots the result into
 * `activation_snapshots`, keyed (campaign_id, activation_key). The campaign
 * page reads from the cache, never live.
 *
 * Auth per source: Bearer token read server-side from `activation_api_tokens`
 * by the source's token_family. Tokens never leave the server.
 *
 * Redirect-safe: microsites 308 apex→www; activationFetch re-attaches the
 * token across same-site hops (the built-in follower would strip it → 401).
 *
 * Status-gate: a source whose stored status is 'completed' AND which already
 * has a snapshot is FROZEN (skipped) — completed activations are final, only
 * live ones keep moving. Force a resync of a completed one with ?force=1.
 *
 * Endpoints: /api/activation/{summary,entries-daily,entries-by-kol,clicks,ugc}.
 * Schedule: hourly (vercel.json). Route auth: Bearer CRON_SECRET, or a
 * super_admin session (admin "Sync now"). Optional ?campaign_id= / ?source_id=.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaignIdFilter = url.searchParams.get('campaign_id');
  const sourceIdFilter = url.searchParams.get('source_id');
  const force = url.searchParams.get('force') === '1';

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const cronAuthOk = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!cronAuthOk) {
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
  type EndpointKey = 'summary' | 'entries-daily' | 'entries-by-kol' | 'clicks' | 'ugc';
  const endpoints: EndpointKey[] = ['summary', 'entries-daily', 'entries-by-kol', 'clicks', 'ugc'];

  try {
    // Load enabled sources (+ filters).
    let q = (supabase as any)
      .from('campaign_activation_sources')
      .select('*')
      .eq('enabled', true);
    if (campaignIdFilter) q = q.eq('campaign_id', campaignIdFilter);
    if (sourceIdFilter) q = q.eq('id', sourceIdFilter);
    const { data: sources, error: srcErr } = await q;
    if (srcErr) throw srcErr;

    const rows = (sources || []) as Array<any>;
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, sourcesConsidered: 0, snapshotsWritten: 0, skipReason: 'no enabled activation sources', durationMs: Date.now() - start });
    }

    // Tokens by family (fetched once).
    const { data: tokenRows } = await (supabase as any).from('activation_api_tokens').select('token_family, token');
    const tokens: Record<string, string> = {};
    for (const t of tokenRows || []) tokens[t.token_family] = t.token;

    let snapshotsWritten = 0;
    let skippedCompleted = 0;
    const errors: Array<{ source: string; error: string }> = [];

    for (const s of rows) {
      try {
        // Freeze completed activations that already have a snapshot.
        if (!force && s.status === 'completed') {
          const { count } = await (supabase as any)
            .from('activation_snapshots')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', s.campaign_id)
            .eq('activation_key', s.activation_key);
          if ((count ?? 0) > 0) { skippedCompleted++; continue; }
        }

        const token = tokens[s.token_family];
        if (!token) { errors.push({ source: s.activation_key, error: `no token set for family '${s.token_family}'` }); continue; }

        const results = await Promise.all(endpoints.map(async (ep): Promise<[EndpointKey, any | null]> => {
          const r = await activationFetch(activationUrl(s.base_url, ep, s.activation_id_param), token).catch(() => null);
          return [ep, r && r.ok ? r.data : null];
        }));
        const blobs = Object.fromEntries(results) as Record<EndpointKey, any | null>;

        if (!blobs.summary) {
          errors.push({ source: s.activation_key, error: 'summary returned no data (auth/URL/redirect?)' });
          continue;
        }
        const summary = blobs.summary || {};
        const newStatus = summary.status || s.status || null;

        const { error: upErr } = await (supabase as any)
          .from('activation_snapshots')
          .upsert({
            campaign_id: s.campaign_id,
            activation_key: s.activation_key,
            activation_name: summary.name || s.display_name || null,
            activation_type: summary.type || null,
            status: newStatus,
            start_date: summary.start_date || null,
            end_date: summary.end_date || null,
            summary_json: blobs.summary,
            entries_daily_json: blobs['entries-daily'],
            entries_by_kol_json: blobs['entries-by-kol'],
            clicks_json: blobs.clicks,
            ugc_json: blobs.ugc,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'campaign_id,activation_key' });

        if (upErr) { errors.push({ source: s.activation_key, error: upErr.message }); continue; }
        snapshotsWritten++;

        // Mirror status + last_synced_at back onto the source (drives the freeze gate).
        await (supabase as any)
          .from('campaign_activation_sources')
          .update({ status: newStatus, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', s.id);
      } catch (err: any) {
        errors.push({ source: s.activation_key, error: err?.message || String(err) });
      }
    }

    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'ACTIVATION_SYNC',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status: errors.length === rows.length ? 'failed' : 'success',
        output_summary: `Wrote ${snapshotsWritten}/${rows.length} snapshot(s); ${skippedCompleted} frozen; ${errors.length} error(s).`,
      });
    } catch {/* swallow */}

    return NextResponse.json({
      ok: true,
      sourcesConsidered: rows.length,
      snapshotsWritten,
      skippedCompleted,
      errors: errors.length ? errors : undefined,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[cron/activation-sync] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'sync failed' }, { status: 500 });
  }
}
