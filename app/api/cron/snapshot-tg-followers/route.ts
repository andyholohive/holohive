import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  parseTelegramChannelUsername,
  fetchTelegramFollowerCount,
} from '@/lib/telegramFollowers';

export const dynamic = 'force-dynamic';
// 60s is plenty for ~85 channels (we sleep ~50ms between calls = ~5s
// of API time + Supabase upserts). Bump if the roster grows past
// ~1000 channels.
export const maxDuration = 60;

/**
 * GET /api/cron/snapshot-tg-followers
 *
 * Monthly cron: pull current subscriber count for every active KOL
 * whose link is a public Telegram channel, upsert as a snapshot row.
 *
 * Phase 3 of the May 2026 KOL overhaul spec. The "auto-pulled for
 * public channels" half — manual entry stays available in the KOL
 * profile modal for non-public/non-TG KOLs.
 *
 * Why monthly + first-of-month: matches the doc's
 * `kol_channel_snapshots.snapshot_date = first of month` convention.
 * The unique constraint on (kol_id, snapshot_date) means re-running
 * this within the same month is a no-op (UPSERT replaces the row).
 *
 * Auth: Bearer ${CRON_SECRET}, same pattern as the other crons.
 *
 * Query params (for testing):
 *   ?dry_run=1  — fetch counts but don't upsert
 *   ?limit=10   — process at most N KOLs (default = all eligible)
 *   ?kol_id=... — process just this one KOL (debugging a specific case)
 *
 * Response shape:
 *   {
 *     processed: 85,
 *     succeeded: 82,
 *     failed: 3,
 *     skipped_non_telegram: 223,
 *     skipped_private: 0,
 *     duration_ms: 4821,
 *     failures: [{ kol_id, kol_name, link, error }]
 *   }
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase config missing' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dry_run') === '1';
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Number(limitParam)) : null;
  const kolIdFilter = searchParams.get('kol_id');

  const start = Date.now();

  // Pull every active KOL with a link. We filter platform/format
  // client-side rather than in SQL because the link-format check
  // (regex) is awkward to express in PostgREST.
  let q = (supabase as any)
    .from('master_kols')
    .select('id, name, link')
    .is('archived_at', null);
  if (kolIdFilter) q = q.eq('id', kolIdFilter);
  const { data: kols, error: kolsErr } = await q;
  if (kolsErr) {
    return NextResponse.json({ error: kolsErr.message }, { status: 500 });
  }
  const kolList = (kols || []) as Array<{ id: string; name: string; link: string | null }>;

  // First-of-month snapshot date matches the spec convention. Computed
  // as a YYYY-MM-DD string so it's stable across timezones.
  const now = new Date();
  const snapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skippedNonTelegram = 0;
  let skippedPrivate = 0;
  const failures: Array<{ kol_id: string; kol_name: string; link: string | null; error: string }> = [];

  for (const kol of kolList) {
    if (limit !== null && processed >= limit) break;

    const username = parseTelegramChannelUsername(kol.link);
    if (!username) {
      // Either not a TG link at all, or a private invite. The parser
      // returns null for both — we count them separately for the log
      // by re-checking the link format here.
      if (kol.link && /t\.me\/(\+|joinchat\/)/i.test(kol.link)) {
        skippedPrivate++;
      } else {
        skippedNonTelegram++;
      }
      continue;
    }

    processed++;
    const result = await fetchTelegramFollowerCount(username, botToken);

    if (result.error || result.follower_count == null) {
      failed++;
      failures.push({
        kol_id: kol.id,
        kol_name: kol.name,
        link: kol.link,
        error: result.error || 'Unknown error',
      });
      // Throttle on failures too — if a TG outage hits, we don't want
      // to hammer 85 retries in a tight loop.
      await sleep(50);
      continue;
    }

    if (!dryRun) {
      const { error: upsertErr } = await (supabase as any)
        .from('kol_channel_snapshots')
        .upsert(
          {
            kol_id: kol.id,
            snapshot_date: snapshotDate,
            follower_count: result.follower_count,
            // Other metric fields stay null — we explicitly only
            // pull follower count in this v1. Manual entry path can
            // backfill if/when the team wants engagement metrics too.
            notes: `Auto-pulled from t.me/${username}${result.channel_title ? ` (${result.channel_title})` : ''}`,
          },
          { onConflict: 'kol_id,snapshot_date' },
        );
      if (upsertErr) {
        failed++;
        failures.push({
          kol_id: kol.id,
          kol_name: kol.name,
          link: kol.link,
          error: `DB upsert failed: ${upsertErr.message}`,
        });
        await sleep(50);
        continue;
      }
    }

    succeeded++;
    // Polite throttle. Telegram allows ~30 requests/sec to the Bot
    // API. We're nowhere near that with one call every ~50ms, but
    // this avoids being noisy in their rate-limit metrics.
    await sleep(50);
  }

  const duration_ms = Date.now() - start;
  return NextResponse.json({
    success: true,
    snapshot_date: snapshotDate,
    dry_run: dryRun,
    processed,
    succeeded,
    failed,
    skipped_non_telegram: skippedNonTelegram,
    skipped_private: skippedPrivate,
    duration_ms,
    failures,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
