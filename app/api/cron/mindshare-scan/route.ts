import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runMindshareScan } from '@/lib/mindshareScanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/mindshare-scan
 *
 * Incremental scan of telegram_messages for keyword matches against
 * active mindshare projects. Writes to tg_mentions + upserts
 * mindshare_daily rollups.
 *
 * Watermark in mindshare_scan_state guarantees each message processed
 * once. Vercel cron fires every 30 minutes — sufficient for daily
 * leaderboard granularity, no need for sub-hour freshness.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Optional: ?backfill=1 ignores the watermark and rescans every
 * message. Use after onboarding new channels or projects to backfill
 * historical mention counts. CRON_SECRET still required.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const backfill = url.searchParams.get('backfill') === '1';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const runStart = Date.now();

  try {
    const result = await runMindshareScan(supabase, { backfill });

    // agent_runs log for cron-health-check coverage.
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'MINDSHARE_SCAN',
        run_type: 'cron',
        started_at: new Date(runStart).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `Scanned ${result.messages_scanned} message(s), added ${result.mentions_added} mention(s).`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({ ok: true, backfill, ...result });
  } catch (err: any) {
    console.error('[cron/mindshare-scan] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'scan failed' }, { status: 500 });
  }
}
