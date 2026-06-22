import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getKolScore } from '@/lib/kolScoreService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kols/[id]/score
 *
 * Returns the full ScoreResult breakdown for one KOL — Channel Score's
 * 5 dimensions, Campaign Performance's 3 dimensions (if activated), and
 * the blended score + tier. Used by the modal detail tab's Score
 * breakdown card.
 *
 * Auth: authenticated users only (see /api/kols/scores for the policy).
 *
 * Note: this still assembles the entire roster's score inputs under the
 * hood — Channel dims need cross-roster min-max normalization, so we
 * can't score one KOL in isolation. Cheap on 86 KOLs; revisit if the
 * roster grows beyond ~500.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const result = await getKolScore(sb, params.id);
  if (!result) return NextResponse.json({ error: 'kol not found or has no score inputs' }, { status: 404 });

  return NextResponse.json({ score: result });
}
