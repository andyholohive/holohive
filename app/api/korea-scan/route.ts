import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { corpusState, loadPeerSets, runKoreaScan } from '@/lib/koreaScan/load';
import { anglesFor } from '@/lib/koreaScan/angles';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/korea-scan — what a scan can be run against (admin+): peer sets,
 * Korea Signal's tracked projects (to prefill aliases), and corpus freshness.
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const db = admin();
  const [sets, corpus] = await Promise.all([loadPeerSets(db), corpusState(db)]);
  const projects = sets.flatMap((s) => s.members.map((m) => ({ ...m, setId: s.id })))
    .filter((p, i, all) => all.findIndex((q) => q.name === p.name) === i)
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({
    peerSets: sets.map((s) => ({ id: s.id, label: s.label, field: s.field, members: s.members.map((m) => m.name) })),
    projects,
    corpus,
  });
}

const clean = (v: unknown, max: number, len: number) =>
  (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter((x) => x.length > 0 && x.length <= len).slice(0, max);

/**
 * POST /api/korea-scan — run a scan for any project (admin+) and save it.
 * Body: { name, aliases[], exclude?[], peerSetId, windowDays?, preparedFor?, opportunityId? }
 *
 * Every run is saved as a frozen snapshot with its own private share link,
 * so what a prospect opens is exactly what sales looked at, and a later run
 * on the same opportunity gives a before-and-after.
 */
export async function POST(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? '').trim().slice(0, 60);
  const aliases = clean(body?.aliases, 12, 40);
  const exclude = clean(body?.exclude, 20, 40);
  if (!name) return NextResponse.json({ error: 'Project name is required.' }, { status: 400 });
  if (!aliases.length) return NextResponse.json({ error: 'Add at least one spelling to match, Korean and English.' }, { status: 400 });
  if (aliases.some((a) => a.replace(/[^가-힣A-Za-z0-9]/g, '').length < 2)) {
    return NextResponse.json({ error: 'Each spelling needs at least two letters, or it will match everything.' }, { status: 400 });
  }
  const windowDays = Math.min(Math.max(Number(body?.windowDays) || 120, 28), 180);
  const db = admin();
  const sets = await loadPeerSets(db);
  const peerSet = sets.find((s) => s.id === body?.peerSetId);
  if (!peerSet) return NextResponse.json({ error: 'Pick a field to compare against.' }, { status: 400 });
  const preparedFor = String(body?.preparedFor ?? '').trim().slice(0, 80) || null;
  const opportunityId = typeof body?.opportunityId === 'string' && /^[0-9a-f-]{36}$/i.test(body.opportunityId) ? body.opportunityId : null;
  if (opportunityId) {
    const { data: opp } = await (db as any).from('crm_opportunities').select('id').eq('id', opportunityId).maybeSingle();
    if (!opp) return NextResponse.json({ error: 'That opportunity no longer exists.' }, { status: 400 });
  }
  try {
    const scan = await runKoreaScan(db, { subject: { name, aliases, exclude }, peerSet, windowDays });
    const token = randomBytes(32).toString('hex');
    // Start every saved scan on the angle that best fits its numbers; the page can change it.
    const isClient = !!peerSet.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.isClient;
    const best = anglesFor(scan, { client: isClient })[0];
    const deck = { slides: best.slides, kickers: best.id === 'client-weekly' ? 'lifecycle' : 'verdict', angle: best.id };
    const { data: saved, error } = await (db as any).from('korea_scans').insert({
      token, subject_name: name, aliases, exclude, peer_set_id: peerSet.id, prepared_for: preparedFor,
      scan, deck, opportunity_id: opportunityId, created_by: guard.user?.id ?? null,
    }).select('id, token, created_at, deck').single();
    // A scan that ran but didn't save is still useful on screen; say so instead of failing.
    if (error) return NextResponse.json({ scan, saved: null, saveError: error.message });
    return NextResponse.json({ scan, saved });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Scan failed' }, { status: 500 });
  }
}
