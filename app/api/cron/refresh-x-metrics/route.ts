import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/refresh-x-metrics
 *
 * Daily cron at 06:30 UTC. The X counterpart to refresh-telegram-metrics —
 * same filter chain, same guards, same agent_runs contract. Read that route
 * first; this one only differs where X forces it to.
 *
 * [2026-08-03] X content was the other half of the dashboard and had NO
 * updater at all: Telegram rows refreshed daily while X rows sat frozen at
 * whatever ops typed in, with nothing in the UI distinguishing them.
 *
 * Why the official API and not the embed trick that works for Telegram:
 *   The X syndication endpoint (cdn.syndication.twimg.com) is reachable
 *   without auth and returns favorite_count + conversation_count, but NOT
 *   view counts — verified against two live KOL posts. Views are the headline
 *   number on a campaign, so an unauthenticated path would have refreshed
 *   likes/replies while leaving views stale: partial freshness, which reads
 *   as more trustworthy than it is. GET /2/tweets returns impression_count in
 *   public_metrics for posts we don't own, which is what makes this viable.
 *
 * Cost: pay-per-use at $0.005/post-read. ~103 X rows daily ≈ $15/month.
 * Batching 100 IDs per request keeps this to ~2 API calls per run — the
 * billing unit is posts read, not requests, so batching saves wall-clock and
 * rate-limit headroom rather than money.
 *
 * Auth: `Authorization: Bearer {CRON_SECRET}`
 */

/** Shared with the Telegram cron — see its comment. Auto-fill ONLY for posts
 *  activated on/after this date; anything older is a human record and a
 *  scraper has no business touching it. Rows with a null activation_date are
 *  excluded by .gte, which is the behaviour we want: if we can't prove a post
 *  is post-cutoff, leave it alone. */
const METRICS_AUTOFILL_CUTOFF = '2026-07-10';

/** Matches x.com/<user>/status/<id> and the legacy twitter.com host. */
const X_URL_REGEX = /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i;

/** X allows 100 ids per GET /2/tweets call. */
const BATCH_SIZE = 100;

function extractTweetId(url: string): string | null {
  const m = url.match(X_URL_REGEX);
  return m ? m[1] : null;
}

export async function GET(request: Request) {
  const startedAt = new Date();

  // ─── Auth ────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const xToken = process.env.X_API_BEARER_TOKEN;
  if (!xToken) {
    return NextResponse.json({ error: 'Missing X_API_BEARER_TOKEN' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ─── Log run start ───────────────────────────────────────────────
  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'X_METRICS',
      run_type: 'scheduled',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: {},
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (
    status: 'completed' | 'failed',
    output: any,
    error?: string,
  ) => {
    if (!runId) return;
    const endedAt = new Date();
    await (supabase as any)
      .from('agent_runs')
      .update({
        status,
        completed_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        output_summary: output,
        error_message: error ?? null,
      })
      .eq('id', runId);
  };

  try {
    // ─── Pre-filter: active client campaigns ───────────────────────
    // Same two-query approach as the Telegram cron (nested embedded
    // filters are unreliable in the JS client). Paused/inactive and
    // archived clients drop out here.
    const { data: activeCampaignRows, error: campErr } = await (supabase as any)
      .from('campaigns')
      .select('id, clients!inner(id, is_active, archived_at)')
      .is('archived_at', null)
      .eq('clients.is_active', true)
      .is('clients.archived_at', null);

    if (campErr) {
      await finishRun('failed', { error: campErr.message }, campErr.message);
      return NextResponse.json({ error: campErr.message }, { status: 500 });
    }
    const activeCampaignIds = (activeCampaignRows || []).map((c: any) => c.id);

    if (activeCampaignIds.length === 0) {
      await finishRun('completed', {
        rows_considered: 0,
        updated: 0, unchanged: 0, skipped: 0, failed: 0,
        message: 'No active client campaigns — nothing to refresh.',
      });
      return NextResponse.json({ success: true, rows_considered: 0 });
    }

    // ─── Load target rows ──────────────────────────────────────────
    // Identical filter chain to the Telegram cron, with the URL match
    // swapped. The platform column is deliberately not trusted — the
    // 2026-05-27 audit found 3 of 274 rows whose platform disagrees
    // with their URL, so the link is the source of truth.
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: rows, error: loadErr } = await (supabase as any)
      .from('contents')
      .select('id, content_link, impressions, likes, retweets, comments')
      .eq('status', 'posted')
      .or('content_link.ilike.%x.com/%,content_link.ilike.%twitter.com/%')
      .in('campaign_id', activeCampaignIds)
      .lte('created_at', cutoff48h)
      .gte('activation_date', METRICS_AUTOFILL_CUTOFF);

    if (loadErr) {
      await finishRun('failed', { error: loadErr.message }, loadErr.message);
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }

    // Map tweet id → our row. A tweet id can only map to one content row;
    // if the same post were logged twice the later row silently wins here,
    // which is the same behaviour as processing them in order.
    const byTweetId = new Map<string, any>();
    let skipped = 0;
    for (const row of rows || []) {
      const id = row.content_link ? extractTweetId(row.content_link) : null;
      if (!id) { skipped++; continue; }
      byTweetId.set(id, row);
    }

    const ids = Array.from(byTweetId.keys());
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    let notReturned = 0;
    const firstFailures: string[] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const url = `https://api.x.com/2/tweets?ids=${chunk.join(',')}`
        + `&tweet.fields=public_metrics`;

      let payload: any = null;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${xToken}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          // 429 = rate limit, 402/403 = credits or access level. Record the
          // status rather than flattening to "failed" so the agent_runs row
          // says which, and stop — burning the rest of the batches against a
          // dead credential wastes credits and tells us nothing new.
          const body = await res.json().catch(() => null);
          const detail = body?.title || body?.detail || `HTTP ${res.status}`;
          firstFailures.push(`batch ${i / BATCH_SIZE}: ${detail}`);
          failed += chunk.length;
          break;
        }
        payload = await res.json();
      } catch (e: any) {
        firstFailures.push(`batch ${i / BATCH_SIZE}: ${e?.message ?? 'fetch failed'}`);
        failed += chunk.length;
        continue;
      }

      // X omits deleted/protected posts from `data` and lists them under
      // `errors`. Count them separately from failures — a deleted post is
      // expected attrition, not a sign anything is broken.
      const returned = new Set<string>();

      for (const tweet of payload?.data ?? []) {
        returned.add(tweet.id);
        const row = byTweetId.get(tweet.id);
        if (!row) continue;

        const m = tweet.public_metrics ?? {};
        // Monotonic guard, same as Telegram: only ever raise a number.
        // Protects hand-entered values that are higher than what the API
        // reports, and makes a bad response non-destructive.
        const update: Record<string, number> = {};
        if (typeof m.impression_count === 'number' && m.impression_count > (row.impressions || 0)) {
          update.impressions = m.impression_count;
        }
        if (typeof m.like_count === 'number' && m.like_count > (row.likes || 0)) {
          update.likes = m.like_count;
        }
        if (typeof m.retweet_count === 'number' && m.retweet_count > (row.retweets || 0)) {
          update.retweets = m.retweet_count;
        }
        if (typeof m.reply_count === 'number' && m.reply_count > (row.comments || 0)) {
          update.comments = m.reply_count;
        }

        if (Object.keys(update).length === 0) {
          unchanged++;
          continue;
        }

        const { error: updateErr } = await (supabase as any)
          .from('contents')
          .update({ ...update, updated_at: new Date().toISOString() })
          .eq('id', row.id);

        if (updateErr) {
          failed++;
          if (firstFailures.length < 10) firstFailures.push(`${row.id}: ${updateErr.message}`);
        } else {
          updated++;
        }
      }

      notReturned += chunk.filter(id => !returned.has(id)).length;
    }

    const summary = {
      rows_considered: rows?.length || 0,
      posts_requested: ids.length,
      updated,
      unchanged,
      skipped,                 // rows whose link had no parseable tweet id
      not_returned: notReturned, // deleted / protected / suspended posts
      failed,
      first_failures: firstFailures.slice(0, 10),
      active_client_campaigns: activeCampaignIds.length,
      cutoff_48h: cutoff48h,
      metrics_autofill_cutoff: METRICS_AUTOFILL_CUTOFF,
      // Rough spend for this run at $0.005/read, so the audit row shows cost
      // without anyone opening the X console.
      estimated_cost_usd: Number((ids.length * 0.005).toFixed(3)),
    };

    // Same rule as Telegram: more than half failing means something
    // systemic (dead token, drained credits, rate limit), not attrition.
    const isFailure = ids.length > 0 && failed > ids.length / 2;
    await finishRun(isFailure ? 'failed' : 'completed', summary);

    return NextResponse.json({ success: !isFailure, ...summary });
  } catch (err: any) {
    console.error('refresh-x-metrics crashed:', err);
    await finishRun('failed', {}, err?.message ?? 'Unknown error');
    return NextResponse.json(
      { error: err?.message ?? 'Refresh failed' },
      { status: 500 },
    );
  }
}
