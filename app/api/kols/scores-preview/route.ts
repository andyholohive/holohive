import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import {
  computeKolScores,
  type SnapshotInput,
  type ComputeInputs,
} from '@/lib/kolScoreService';
import fixture from '@/__fixtures__/kol-scan/kol_scan_sample_2026-06-10.json';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kols/scores-preview
 *
 * Compute the two-score model against the MCP contract fixture
 * instead of live DB data. Used to demo what scores look like once
 * the Telegram MCP scan layer comes online — the fixture's snapshot
 * fields populate the same dimensions a real scan would.
 *
 * Why: as of 2026-06-22 the live kol_channel_snapshots table is
 * sparse (most rows have only follower_count). Scoring against it
 * yields 0/D roster-wide, which doesn't prove the compute is
 * working end-to-end. This route runs the same compute on Bolt's
 * June 10 sample — 82 KOLs have meaningful avg_views/forwards/etc,
 * so the output has a real distribution across tiers.
 *
 * Auth: same gate as /api/kols/scores — authenticated users only,
 * scores are internal per Doc 2 §9.
 *
 * NEVER writes to the DB. Read-only against the fixture file.
 */

interface FixtureRow {
  kol_id: string;
  name: string;
  profile: { follower_count: number | null };
  snapshot: {
    snapshot_date: string;
    follower_count: number | null;
    avg_views_per_post: number | null;
    avg_forwards_per_post: number | null;
    avg_reactions_per_post: number | null;
    avg_replies_per_post: number | null;
    posting_frequency: number | null;
    organic_posts_analyzed: number | null;
    low_organic_volume_flag: boolean;
    follower_growth_pct: number | null;
  };
}

export async function GET() {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = fixture as FixtureRow[];

  // Project each fixture row into the SnapshotInput shape the score
  // service expects. One snapshot per KOL — fixture only carries the
  // month-1 scan so there's no historical lookup behavior to exercise.
  const latestSnapshotByKol = new Map<string, SnapshotInput>();
  const allSnapshotsByKol = new Map<string, SnapshotInput[]>();
  for (const row of rows) {
    const snap: SnapshotInput = {
      kol_id: row.kol_id,
      snapshot_date: row.snapshot.snapshot_date,
      follower_count: row.snapshot.follower_count ?? row.profile.follower_count,
      avg_views_per_post: row.snapshot.avg_views_per_post,
      avg_forwards_per_post: row.snapshot.avg_forwards_per_post,
      avg_reactions_per_post: row.snapshot.avg_reactions_per_post,
      avg_replies_per_post: row.snapshot.avg_replies_per_post,
      engagement_rate: null,
      posting_frequency: row.snapshot.posting_frequency,
      follower_growth_pct: row.snapshot.follower_growth_pct,
      low_organic_volume_flag: row.snapshot.low_organic_volume_flag,
    };
    latestSnapshotByKol.set(row.kol_id, snap);
    allSnapshotsByKol.set(row.kol_id, [snap]);
  }

  const inputs: ComputeInputs = {
    latestSnapshotByKol,
    allSnapshotsByKol,
    deliverablesByKol: new Map(),         // no deliverables in fixture — Campaign Performance stays null
    campaignAvgParticipants: new Map(),
    kolIds: rows.map(r => r.kol_id),
  };

  const scores = computeKolScores(inputs);

  // Pair scores with names so the demo response is readable without
  // a JOIN. Also count tier distribution to summarize at a glance.
  const out: Record<string, unknown> = {};
  const tierDist: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const row of rows) {
    const score = scores.get(row.kol_id);
    if (!score) continue;
    out[row.kol_id] = { name: row.name, ...score };
    tierDist[score.blended.tier]++;
  }

  return NextResponse.json({
    source: 'fixture: __fixtures__/kol-scan/kol_scan_sample_2026-06-10.json',
    kolCount: rows.length,
    tierDistribution: tierDist,
    scores: out,
  });
}
