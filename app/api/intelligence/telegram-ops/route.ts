import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intelligence/telegram-ops
 *
 * Backs the three v7 Telegram panels — Overview, Runs, Accounts — from
 * one query set, because they answer one question from three angles:
 * is the Telegram layer actually running?
 *
 * The framing is deliberately "when did this last produce something",
 * not "is it enabled". Every failure this layer has had was silent: the
 * crawler ran green for four months while a channel-id mismatch dropped
 * 98% of the corpus; the session was revoked for five days while the
 * health check flagged it daily and nothing acted; 17 channels sit
 * active and mute right now. A panel that shows configuration would have
 * reported healthy through every one of them. Freshness is the only
 * honest signal.
 *
 * ACCOUNTS is inferred, not introspected. Session strings live in GitHub
 * Actions secrets and the app cannot read them — claiming otherwise
 * would be the same false confidence. So each account is reported by the
 * freshness of the work that depends on it: the crawler's last ingest
 * proves the main session, a coverage row proves the spare.
 */

const FEEDS: Array<{ key: string; label: string; table: string; column: string; staleHours: number; via: string }> = [
  { key: 'corpus', label: 'Channel posts (mindshare crawl)', table: 'tg_channel_posts', column: 'pulled_at', staleHours: 24, via: 'Main session · GHA 3-hourly' },
  { key: 'mentions', label: 'Project mentions', table: 'tg_mentions', column: 'created_at', staleHours: 48, via: 'HHP cron · mindshare-scan' },
  { key: 'comments', label: 'Post comments', table: 'post_comments', column: 'created_at', staleHours: 48, via: 'Main session · GHA daily' },
  { key: 'snapshots', label: 'KOL channel snapshots', table: 'kol_channel_snapshots', column: 'created_at', staleHours: 24 * 35, via: 'Main session · GHA monthly' },
  { key: 'coverage', label: 'Coverage contracts', table: 'tg_coverage_contracts', column: 'generated_at', staleHours: 24 * 90, via: 'Coverage session · on demand' },
];

export async function GET() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const feeds = await Promise.all(FEEDS.map(async f => {
    const [{ count }, { data: latest }] = await Promise.all([
      (supabase as any).from(f.table).select('*', { count: 'exact', head: true }),
      (supabase as any).from(f.table).select(f.column).order(f.column, { ascending: false }).limit(1),
    ]);
    const last = latest?.[0]?.[f.column] ?? null;
    const ageHours = last ? (Date.now() - Date.parse(last)) / 3_600_000 : null;
    return {
      ...f,
      rows: count ?? 0,
      last_at: last,
      age_hours: ageHours,
      // "stale" means the feed stopped producing, which is the shape every
      // past failure took. Never-run is reported separately from stopped.
      status: last === null ? 'never' : (ageHours as number) > f.staleHours ? 'stale' : 'fresh',
    };
  }));

  const { data: runRows } = await (supabase as any)
    .from('agent_runs')
    .select('agent_name, status, started_at, completed_at, duration_ms, output_summary, error_message')
    .gte('started_at', new Date(Date.now() - 7 * 86400_000).toISOString())
    .order('started_at', { ascending: false })
    .limit(400);
  const runs = (runRows ?? []) as any[];

  // Roll the log up per job — a list of 400 rows answers nothing, "which
  // job is failing and when did it last work" does.
  const byAgent = new Map<string, any>();
  for (const r of runs) {
    let a = byAgent.get(r.agent_name);
    if (!a) { a = { agent_name: r.agent_name, total: 0, failed: 0, last_at: null, last_status: null, last_error: null, last_summary: null }; byAgent.set(r.agent_name, a); }
    a.total += 1;
    if (r.status === 'failed') a.failed += 1;
    if (!a.last_at || r.started_at > a.last_at) {
      a.last_at = r.started_at;
      a.last_status = r.status;
      a.last_error = r.error_message ?? null;
      a.last_summary = r.output_summary ?? null;
    }
  }

  const corpus = feeds.find(f => f.key === 'corpus');
  const coverage = feeds.find(f => f.key === 'coverage');
  const { count: coverageChannels } = await (supabase as any)
    .from('tg_channel_coverage').select('*', { count: 'exact', head: true });

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    feeds,
    runs: [...byAgent.values()].sort((a, b) => String(b.last_at).localeCompare(String(a.last_at))),
    accounts: [
      {
        role: 'Main session',
        purpose: 'Mindshare crawl, comment ingest, KOL scans',
        secret: 'TG_SESSION_STRING',
        proof: 'Last channel-post ingest',
        last_at: corpus?.last_at ?? null,
        status: corpus?.status ?? 'never',
      },
      {
        role: 'Coverage session',
        purpose: 'Broad on-demand coverage scans — isolated so a flag here cannot stop ingestion',
        secret: 'COVERAGE_TG_*',
        proof: 'Last coverage scan row',
        last_at: coverage?.last_at ?? null,
        status: (coverageChannels ?? 0) > 0 ? (coverage?.status ?? 'never') : 'never',
      },
    ],
  });
}
