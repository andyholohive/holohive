import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * TG Intelligence Layer — client engagement before/after snapshot.
 *
 * GET /api/intelligence/coverage/snapshot?subject_type=client&subject_id=...
 *
 * The delivery-docs "Engagement Snapshot delta": tg_coverage_contracts
 * keeps every generated contract precisely so a baseline (generated at
 * onboarding) and a wrap rerun can be paired. This endpoint pairs them:
 *
 *   baseline = the EARLIEST stored contract for the subject
 *   wrap     = the LATEST stored contract for the subject
 *   delta    = wrap − baseline across the contract's E-strip counts
 *
 * "Frozen frame" note: freezing the channel list between the two scans
 * is the scanner's job (kol-telegram-mcp rescans the roster set from
 * the baseline run); this endpoint reports channels_scanned for both
 * runs so a drifted frame is visible rather than silent.
 *
 * Auth: team session via middleware (same as the coverage routes), or
 * Bearer CRON_SECRET server-to-server.
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const SUBJECT_TYPES = ['pipeline', 'client', 'project'];

type ContractCounts = {
  channels_covered: number;
  posts_total: number;
  pct_of_tracked_network: number | null;
  channels_repeat: number;
};

type StoredContract = {
  id: string;
  generated_at: string;
  window_days: number | null;
  contract: {
    counts?: ContractCounts;
    generated_basis?: { channels_scanned?: number; channels_readable?: number };
    channel_type_breakdown?: Array<{ posts: number; avg_views_per_post: number | null }>;
  } | null;
};

/** Posts-weighted average views per post across the type breakdown. */
function overallAvgViews(c: StoredContract): number | null {
  const rows = c.contract?.channel_type_breakdown ?? [];
  let viewsSum = 0;
  let postsN = 0;
  for (const r of rows) {
    if (r.avg_views_per_post == null || !r.posts) continue;
    viewsSum += r.avg_views_per_post * r.posts;
    postsN += r.posts;
  }
  return postsN > 0 ? Math.round(viewsSum / postsN) : null;
}

function summarize(c: StoredContract) {
  const counts = c.contract?.counts;
  return {
    id: c.id,
    generated_at: c.generated_at,
    window_days: c.window_days,
    channels_scanned: c.contract?.generated_basis?.channels_scanned ?? null,
    channels_readable: c.contract?.generated_basis?.channels_readable ?? null,
    channels_covered: counts?.channels_covered ?? 0,
    posts_total: counts?.posts_total ?? 0,
    pct_of_tracked_network: counts?.pct_of_tracked_network ?? null,
    channels_repeat: counts?.channels_repeat ?? 0,
    avg_views_per_post: overallAvgViews(c),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const subjectType = url.searchParams.get('subject_type') ?? '';
  const subjectId = url.searchParams.get('subject_id') ?? '';
  if (!SUBJECT_TYPES.includes(subjectType) || !subjectId) {
    return NextResponse.json({ error: 'subject_type + subject_id required' }, { status: 400 });
  }

  const supabase = serviceClient();
  const { data, error } = await (supabase as any)
    .from('tg_coverage_contracts')
    .select('id, generated_at, window_days, contract')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('generated_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const runs = (data ?? []) as StoredContract[];
  const history = runs.map(summarize);

  if (runs.length < 2) {
    // 0 runs → nothing yet; 1 run → baseline captured, wrap pending.
    return NextResponse.json({
      ok: true,
      runs: runs.length,
      baseline: runs.length >= 1 ? history[0] : null,
      wrap: null,
      delta: null,
      history,
    });
  }

  const baseline = history[0];
  const wrap = history[history.length - 1];
  const pctDelta = (a: number | null, b: number | null) => (a == null || b == null ? null : b - a);

  return NextResponse.json({
    ok: true,
    runs: runs.length,
    baseline,
    wrap,
    delta: {
      channels_covered: wrap.channels_covered - baseline.channels_covered,
      posts_total: wrap.posts_total - baseline.posts_total,
      pct_of_tracked_network: pctDelta(baseline.pct_of_tracked_network, wrap.pct_of_tracked_network),
      channels_repeat: wrap.channels_repeat - baseline.channels_repeat,
      avg_views_per_post: pctDelta(baseline.avg_views_per_post, wrap.avg_views_per_post),
      // Frame-drift visibility: a changed scan set means the delta is
      // not apples-to-apples — the UI captions this.
      frame_drift: baseline.channels_scanned != null && wrap.channels_scanned != null
        ? wrap.channels_scanned - baseline.channels_scanned
        : null,
    },
    history,
  });
}
