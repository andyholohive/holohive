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
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const backfill = url.searchParams.get('backfill') === '1';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const result = await runMindshareScan(supabase, { backfill });
    return NextResponse.json({ ok: true, backfill, ...result });
  } catch (err: any) {
    console.error('[cron/mindshare-scan] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'scan failed' }, { status: 500 });
  }
}
