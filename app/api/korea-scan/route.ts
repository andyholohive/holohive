import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { corpusState, loadPeerSets, runKoreaScan } from '@/lib/koreaScan/load';

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
 * POST /api/korea-scan — run a scan for any project (admin+).
 * Body: { name, aliases[], exclude?[], peerSetId, windowDays? }
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
  try {
    const scan = await runKoreaScan(db, { subject: { name, aliases, exclude }, peerSet, windowDays });
    return NextResponse.json({ scan });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Scan failed' }, { status: 500 });
  }
}
