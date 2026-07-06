import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/campaign-weekly-snapshot
 *
 * Snapshots the 4 Stats Row metrics for every non-archived campaign:
 *   - kols_activated  (distinct KOLs with ≥1 posted content)
 *   - content_live    (count of posts with status='posted')
 *   - impressions     (SUM of impressions on those posts)
 *   - engagements     (SUM of likes+retweets+comments+bookmarks)
 *
 * Writes one row per campaign per day into campaign_weekly_snapshots.
 * Re-runs same day = upsert (ON CONFLICT (campaign_id, snapshot_date)).
 *
 * Vercel cron schedule: Monday 00:00 UTC (~Monday 9am KST). Once a
 * week is enough — the Client Portal Stats Row trend arrows compare
 * "this week vs last week" so daily snapshots would just bloat the
 * table without changing the math.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Backfill: pass ?date=YYYY-MM-DD to write the snapshot dated to that
 * day instead of today. Useful for seeding "last week's" data after
 * deploy so trends render immediately.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  // Default to today (UTC). Override with ?date=YYYY-MM-DD for backfill.
  const snapshotDate =
    url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const start = Date.now();

  try {
    // 1) Get every non-archived campaign.
    const { data: campaigns, error: campaignsErr } = await supabase
      .from('campaigns')
      .select('id')
      .is('archived_at', null);
    if (campaignsErr) throw campaignsErr;

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({
        ok: true,
        snapshotDate,
        campaignsProcessed: 0,
        snapshotsWritten: 0,
        durationMs: Date.now() - start,
      });
    }

    // 2) For each campaign, compute the 4 metrics in JS from a single
    //    posted-contents fetch. Same logic as the portal — kept inline
    //    instead of factored out because the portal's TS lives in a
    //    different file and the cron uses a separate Supabase client.
    let snapshotsWritten = 0;
    const errors: Array<{ campaignId: string; error: string }> = [];

    for (const campaign of campaigns) {
      try {
        const { data: contents } = await supabase
          .from('contents')
          .select(
            'campaign_kols_id, impressions, likes, comments, retweets, bookmarks',
          )
          .eq('campaign_id', campaign.id)
          .eq('status', 'posted');

        const rows = (contents as any[]) || [];

        let impressionsSum = 0;
        let engagementsSum = 0;
        const distinctKolIds = new Set<string>();
        for (const r of rows) {
          impressionsSum += r.impressions || 0;
          engagementsSum +=
            (r.likes || 0) +
            (r.retweets || 0) +
            (r.comments || 0) +
            (r.bookmarks || 0);
          if (r.campaign_kols_id) distinctKolIds.add(r.campaign_kols_id);
        }

        const { error: upsertErr } = await supabase
          .from('campaign_weekly_snapshots')
          .upsert(
            {
              campaign_id: campaign.id,
              snapshot_date: snapshotDate,
              kols_activated: distinctKolIds.size,
              content_live: rows.length,
              impressions: impressionsSum,
              engagements: engagementsSum,
            },
            { onConflict: 'campaign_id,snapshot_date' },
          );

        if (upsertErr) {
          errors.push({ campaignId: campaign.id, error: upsertErr.message });
        } else {
          snapshotsWritten++;
        }
      } catch (err: any) {
        errors.push({
          campaignId: campaign.id,
          error: err?.message || String(err),
        });
      }
    }

    // agent_runs log for cron-health-check coverage.
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'CAMPAIGN_WEEKLY_SNAPSHOT',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `Wrote ${snapshotsWritten} snapshot(s) across ${campaigns.length} campaign(s).`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({
      ok: true,
      snapshotDate,
      campaignsProcessed: campaigns.length,
      snapshotsWritten,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[cron/campaign-weekly-snapshot] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'snapshot failed' },
      { status: 500 },
    );
  }
}
