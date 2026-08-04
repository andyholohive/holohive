import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kr-signal/clients/[clientId]/reports
 *
 * Past KR Signal weekly reports for a client, newest first — backs the
 * "Past reports" section of the Korea Signal settings dialog on /clients.
 *
 * [2026-08-03] Deliberately does NOT re-render past weeks. The weekly report
 * is assembled from live adapter calls (prices, volumes, listings) and the
 * persisted snapshot keeps only 12 raw metrics, while WeeklyReportData needs
 * ~25 — kospiYtdPct, kospiAtAth, peerRank and every arrow/regime/
 * koreaReadLabel are computed at send time and discarded. Re-running the
 * assembler with a past date would stamp *today's* market data with last
 * week's label; reconstructing from the snapshot would invent the missing
 * half. Both produce a plausible document that is not what the client got.
 *
 * So: `report_html` is the source of truth when present, and weeks predating
 * that column return their raw stored metrics with report_html: null. The UI
 * renders those two cases differently rather than papering over the gap.
 *
 * Admin + super_admin only — this is client-facing digest content.
 */
async function checkAdmin() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, status: 401, msg: 'Unauthorized' };
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false as const, status: 403, msg: 'Forbidden' };
  }
  return { ok: true as const };
}

export async function GET(
  _request: Request,
  { params }: { params: { clientId: string } },
) {
  const guard = await checkAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.msg }, { status: guard.status });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Per-client rows carry the report + the client-specific metrics.
  const { data: rows, error } = await (admin as any)
    .from('kr_signal_client_weekly')
    .select('week_ending, report_html, kr_token_vol_usd, kr_vol_share, kr_token_vol_window, sov_pieces_cum, by_venue, created_at')
    .eq('client_id', params.clientId)
    .order('week_ending', { ascending: false })
    .limit(26);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Market-wide figures for the same weeks, so a report-less week can still
  // show the backdrop it was sent against.
  const weeks = (rows || []).map((r: any) => r.week_ending);
  let globalByWeek: Record<string, any> = {};
  if (weeks.length) {
    const { data: globals } = await (admin as any)
      .from('kr_signal_weekly_snapshots')
      .select('week_ending, futures_total, kr_cex_vol, kospi, fx_usdkrw, kimchi_usdt')
      .in('week_ending', weeks);
    for (const g of globals || []) globalByWeek[g.week_ending] = g;
  }

  return NextResponse.json({
    reports: (rows || []).map((r: any) => ({
      week_ending: r.week_ending,
      /** Exact message sent. Null for weeks before 2026-08-03 — the UI must
       *  say so rather than substituting a reconstruction. */
      report_html: r.report_html ?? null,
      metrics: {
        kr_token_vol_usd: r.kr_token_vol_usd,
        kr_vol_share: r.kr_vol_share,
        kr_token_vol_window: r.kr_token_vol_window,
        sov_pieces_cum: r.sov_pieces_cum,
        by_venue: r.by_venue,
        ...(globalByWeek[r.week_ending] ?? {}),
      },
      sent_at: r.created_at,
    })),
  });
}
