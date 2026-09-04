/**
 * KOL blurb normalisation — GET previews, POST runs a batch.
 *
 * Two jobs (see lib/kolSummaryNormalize.ts for the why):
 *   - translate any Korean profiler notes into English, in place
 *   - generate the client-safe `public_summary` the public campaign page
 *     renders instead of the internal `style_summary`
 *
 * POST body: { execute: true, limit?: number, mode?: 'pending' | 'all' }
 *   'pending' (default) = rows that still need work
 *   'all'               = regenerate every KOL that has any profiler notes
 *
 * Batched and re-entrant: the caller loops until `remaining` hits 0, exactly
 * like the bulk Grok profiler on /kols.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { isMostlyKorean, normalizeKolSummaries } from '@/lib/kolSummaryNormalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FIELDS = 'id, name, style_summary, audience_summary, brief_angle_hint, public_summary';

// Rough per-KOL cost on Haiku with these prompt sizes; used only for the
// pre-flight estimate the confirm dialog shows.
const EST_COST_PER_KOL = 0.0016;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Rows with notes that are still Korean, or that have no client-safe blurb. */
function needsWork(row: any): boolean {
  const anyNotes = row.style_summary || row.audience_summary || row.brief_angle_hint;
  if (!anyNotes) return false;
  if (!row.public_summary) return true;
  return isMostlyKorean(row.style_summary) || isMostlyKorean(row.audience_summary)
    || isMostlyKorean(row.brief_angle_hint) || isMostlyKorean(row.public_summary, 0.05);
}

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const { data, error } = await admin()
    .from('master_kols').select(FIELDS).is('archived_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const pending = rows.filter(needsWork);
  return NextResponse.json({
    eligible: pending.length,
    korean_notes: rows.filter((r: any) => isMostlyKorean(r.style_summary) || isMostlyKorean(r.audience_summary) || isMostlyKorean(r.brief_angle_hint)).length,
    missing_public_summary: rows.filter((r: any) => (r.style_summary || r.audience_summary || r.brief_angle_hint) && !r.public_summary).length,
    with_notes: rows.filter((r: any) => r.style_summary || r.audience_summary || r.brief_angle_hint).length,
    est_cost_usd: Number((pending.length * EST_COST_PER_KOL).toFixed(2)),
  });
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  if (!body?.execute) return NextResponse.json({ error: 'execute:true required' }, { status: 400 });
  const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 25);
  const all = body.mode === 'all';

  const db = admin();
  const { data, error } = await db
    .from('master_kols').select(FIELDS).is('archived_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const queue = all
    ? rows.filter((r: any) => r.style_summary || r.audience_summary || r.brief_angle_hint)
    : rows.filter(needsWork);
  const batch = queue.slice(0, limit);

  let succeeded = 0;
  let spent = 0;
  const failures: { name: string; error: string }[] = [];

  for (const row of batch as any[]) {
    try {
      const out = await normalizeKolSummaries({
        name: row.name,
        style_summary: row.style_summary,
        audience_summary: row.audience_summary,
        brief_angle_hint: row.brief_angle_hint,
      });
      spent += out.cost_usd;

      const patch: Record<string, unknown> = { public_summary: out.public_summary };
      // Only write the internal fields back when they actually changed, so a
      // rerun on an already-English roster is a no-op on those columns.
      if (out.style_summary !== row.style_summary) patch.style_summary = out.style_summary;
      if (out.audience_summary !== row.audience_summary) patch.audience_summary = out.audience_summary;
      if (out.brief_angle_hint !== row.brief_angle_hint) patch.brief_angle_hint = out.brief_angle_hint;

      const { error: upErr } = await db.from('master_kols').update(patch).eq('id', row.id);
      if (upErr) throw new Error(upErr.message);
      succeeded += 1;
    } catch (e: any) {
      failures.push({ name: row.name, error: e?.message || 'unknown error' });
    }
  }

  return NextResponse.json({
    processed: batch.length,
    succeeded,
    failed: failures.length,
    failures: failures.slice(0, 5),
    remaining: Math.max(queue.length - batch.length, 0),
    cost_usd: Number(spent.toFixed(4)),
  });
}
