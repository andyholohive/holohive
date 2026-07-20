import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildCoverageContract } from '@/lib/coverageAnalysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * TG Intelligence Layer — contract generation + retrieval.
 *
 * POST /api/intelligence/coverage
 *   { subject_type, subject_id, window_days? }
 *   Recomputes the coverage contract from tg_channel_posts /
 *   tg_channel_coverage and stores a new tg_coverage_contracts row
 *   (history kept — the engagement before/after snapshot needs a
 *   baseline + wrap pair). Returns the stored contract.
 *
 * GET /api/intelligence/coverage?subject_type=...&subject_id=...
 *   Returns the latest stored contract for the subject (404 if none).
 *
 * Auth: team session via middleware (the Intelligence tab), or Bearer
 * CRON_SECRET for server-to-server (a scan run triggering re-analysis).
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const SUBJECT_TYPES = ['pipeline', 'client', 'project'];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  const { subject_type: subjectType, subject_id: subjectId } = body;
  const windowDays = Number(body.window_days) || 30;
  if (!SUBJECT_TYPES.includes(subjectType) || !subjectId) {
    return NextResponse.json({ error: 'subject_type + subject_id required' }, { status: 400 });
  }

  const supabase = serviceClient();
  try {
    const contract = await buildCoverageContract(supabase, subjectType, subjectId, windowDays);
    const { data, error } = await (supabase as any)
      .from('tg_coverage_contracts')
      .insert({
        subject_type: subjectType,
        subject_id: subjectId,
        query: contract.query,
        window_days: windowDays,
        contract,
      })
      .select('id, generated_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id, generated_at: data.generated_at, contract });
  } catch (err: any) {
    console.error('[intelligence/coverage] generate failed:', err);
    return NextResponse.json({ error: err?.message ?? 'generate failed' }, { status: 500 });
  }
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
    .select('id, query, window_days, contract, callprep_draft, generated_at')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'no contract for subject' }, { status: 404 });
  return NextResponse.json({ ok: true, ...data });
}
