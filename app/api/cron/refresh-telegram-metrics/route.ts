import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/refresh-telegram-metrics
 *
 * Daily cron at 06:00 UTC. Refreshes view + reaction counts for every
 * `contents` row whose `content_link` points to a public Telegram
 * channel post. Replaces the manual entry workflow for the 62% of
 * portal content that lives on Telegram.
 *
 * Why this works without a Telegram API key:
 *   Telegram's public channel posts have a server-rendered embed page
 *   at  https://t.me/<channel>/<msgid>?embed=1&mode=tme  that returns
 *   HTML with view counts + reaction totals visible to anyone. We fetch
 *   that HTML, parse the counts, and UPDATE the contents row.
 *
 * Scope (audit 2026-05-27): 171 of 274 contents rows are Telegram URLs.
 * After filtering by status='posted' and a valid content_link, we expect
 * ~150 rows per run. At 200ms throttle between fetches, run time is
 * ~30s well within the 300s function limit.
 *
 * Monotonic guard:
 *   We only UPDATE if the newly-fetched value is HIGHER than the stored
 *   value. Views + reactions never decrease in real life, so a lower
 *   number from the scrape is almost certainly a parse failure, a stale
 *   Telegram cache, or a private/deleted post returning a stub. This
 *   also protects against accidentally overwriting a higher manually-
 *   entered number (Andy can still manually correct downward; the cron
 *   won't fight him).
 *
 * Status filter: only `status='posted'` rows are refreshed. Pending +
 * scheduled rows have no live URL to fetch.
 *
 * Failures are logged to agent_runs.output_summary.first_failures so
 * the daily cron-failure DM sweep (planned for the CRM rebuild Day-0
 * substrate) can surface them. Without that sweep, failures stay in
 * Vercel function logs only.
 *
 * Auth: `Authorization: Bearer {CRON_SECRET}` or `?secret={CRON_SECRET}`
 */

const TG_URL_REGEX = /t\.me\/([A-Za-z0-9_]+)\/(\d+)/i;
const FETCH_THROTTLE_MS = 200;        // politeness between Telegram fetches
const FETCH_TIMEOUT_MS = 8000;        // per-request timeout
const USER_AGENT =
  'Mozilla/5.0 (compatible; HoloHive-MetricsBot/1.0; +https://app.holohive.io)';

/**
 * Parse Telegram's display format: "1.2K", "5.4M", "847", "12,345".
 * Returns null on unparseable input.
 */
function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/[,\s]/g, '');
  if (!trimmed) return null;
  const match = trimmed.match(/^([\d.]+)([KkMmBb])?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return null;
  const suffix = match[2]?.toUpperCase();
  if (suffix === 'K') return Math.round(num * 1_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

/**
 * Fetches Telegram's embed HTML for a single post and parses view + reaction counts.
 * Returns null if the URL is malformed, the fetch fails, or the page returns no metrics.
 */
async function fetchTelegramMetrics(
  url: string,
): Promise<{ views: number | null; reactions: number | null } | null> {
  const match = url.match(TG_URL_REGEX);
  if (!match) return null;
  const [, channel, msgId] = match;
  const embedUrl = `https://t.me/${channel}/${msgId}?embed=1&mode=tme`;

  // Manual timeout because fetch doesn't have a built-in option that
  // works reliably across Node versions
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(embedUrl, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();

    // View count: rendered inside `<span class="tgme_widget_message_views">1.2K</span>`
    const viewsMatch = html.match(
      /<span[^>]*class="[^"]*tgme_widget_message_views[^"]*"[^>]*>([^<]+)<\/span>/i,
    );
    const views = viewsMatch ? parseCount(viewsMatch[1]) : null;

    // Reactions: sum across all emoji buttons.
    // Each appears as `<span class="...tgme_reaction_count...">N</span>`.
    let reactions: number | null = null;
    const reactionRegex =
      /<span[^>]*class="[^"]*tgme_reaction_count[^"]*"[^>]*>([^<]+)<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = reactionRegex.exec(html)) !== null) {
      const n = parseCount(m[1]);
      if (n !== null) reactions = (reactions ?? 0) + n;
    }

    return { views, reactions };
  } catch {
    // Network error, timeout, abort, etc.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const startedAt = new Date();

  // ─── Auth ────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ─── Log run start ───────────────────────────────────────────────
  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'TELEGRAM_METRICS',
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
    // ─── Load target rows ──────────────────────────────────────────
    // Filter aggressively at query time so we don't iterate non-Telegram
    // rows in JS. `ilike` on content_link is reliable; `platform` column
    // is unreliable (3 mismatches in the audit) so we don't rely on it.
    const { data: rows, error: loadErr } = await (supabase as any)
      .from('contents')
      .select('id, content_link, impressions, likes')
      .eq('status', 'posted')
      .ilike('content_link', '%t.me/%');

    if (loadErr) {
      await finishRun('failed', { error: loadErr.message }, loadErr.message);
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }

    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let failed = 0;
    const firstFailures: string[] = [];

    for (const row of rows || []) {
      // Re-validate the URL pattern; rows might have a t.me/ in a
      // non-canonical position (e.g. ?ref=t.me/...)
      if (!row.content_link || !TG_URL_REGEX.test(row.content_link)) {
        skipped++;
        continue;
      }

      const metrics = await fetchTelegramMetrics(row.content_link);

      if (!metrics || (metrics.views === null && metrics.reactions === null)) {
        failed++;
        if (firstFailures.length < 10) firstFailures.push(row.content_link);
      } else {
        // Monotonic guard: only update if new > stored. Protects against
        // parse failures, Telegram CDN glitches, and accidental overwrite
        // of higher manually-entered numbers.
        const update: Record<string, number> = {};
        if (metrics.views !== null && metrics.views > (row.impressions || 0)) {
          update.impressions = metrics.views;
        }
        if (metrics.reactions !== null && metrics.reactions > (row.likes || 0)) {
          update.likes = metrics.reactions;
        }

        if (Object.keys(update).length === 0) {
          unchanged++;
        } else {
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
      }

      // Politeness throttle — Telegram is generous but we're a guest
      await new Promise(r => setTimeout(r, FETCH_THROTTLE_MS));
    }

    const summary = {
      rows_considered: rows?.length || 0,
      updated,
      unchanged,
      skipped,
      failed,
      first_failures: firstFailures,
    };

    // Treat as failed if MORE than half the fetches failed — likely a
    // Telegram-side rate limit or our IP got blocked. Anything less is
    // expected attrition (deleted posts, private channels, etc.).
    const isFailure = (rows?.length || 0) > 0 && failed > (rows!.length / 2);
    await finishRun(isFailure ? 'failed' : 'completed', summary);

    return NextResponse.json({ success: !isFailure, ...summary });
  } catch (err: any) {
    console.error('refresh-telegram-metrics crashed:', err);
    await finishRun('failed', {}, err?.message ?? 'Unknown error');
    return NextResponse.json(
      { error: err?.message ?? 'Refresh failed' },
      { status: 500 },
    );
  }
}
