import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getAllKolScores } from '@/lib/kolScoreService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kols/scores
 *
 * Batch endpoint that returns every KOL's blended score + tier in one
 * round-trip. Used by the /kols list to render the Score column without
 * fanning out N per-KOL calls.
 *
 * Response shape: { scores: { [kol_id]: ScoreResult } }
 *
 * Auth: authenticated users only — scores are internal-only per Doc 2 §9
 * + Jdot Q6b. Anonymous public routes never see this endpoint.
 */
export async function GET() {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const scores = await getAllKolScores(sb);
  // Map → plain object for JSON serialization. Score shape is stable —
  // ChannelScoreBreakdown, CampaignScoreBreakdown, BlendedScore are all
  // plain numeric objects.
  const out: Record<string, ReturnType<typeof scores.get>> = {};
  for (const [kolId, result] of scores) out[kolId] = result;

  return NextResponse.json({ scores: out });
}
