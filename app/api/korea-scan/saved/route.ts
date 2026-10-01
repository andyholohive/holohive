import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { cleanSlides } from '@/lib/koreaScan/angles';

export const dynamic = 'force-dynamic';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/korea-scan/saved[?opportunity=<id>][&id=<scan id>] (admin+)
 * Without `id`: the latest saved scans, newest first, with link opens.
 * With `id`: one scan in full, for reopening it on the scan page.
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  const db = admin() as any;
  const id = url.searchParams.get('id');
  if (id) {
    const { data, error } = await db.from('korea_scans')
      .select('id, token, subject_name, aliases, exclude, peer_set_id, prepared_for, scan, deck, opportunity_id, created_at')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ scan: data });
  }
  let q = db.from('korea_scans')
    .select('id, token, subject_name, prepared_for, peer_set_id, opportunity_id, created_at, scan->headline, scan->window, crm_opportunities(name)')
    .is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
  const opp = url.searchParams.get('opportunity');
  if (opp) q = q.eq('opportunity_id', opp);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (data ?? []).map((r: any) => r.id);
  const views = new Map<string, { n: number; last: string | null }>();
  if (ids.length) {
    const { data: v } = await db.from('korea_scan_views').select('scan_id, viewed_at').in('scan_id', ids).order('viewed_at', { ascending: false }).limit(5000);
    for (const r of v ?? []) {
      const cur = views.get(r.scan_id) ?? { n: 0, last: null };
      cur.n += 1; cur.last = cur.last ?? r.viewed_at;
      views.set(r.scan_id, cur);
    }
  }
  return NextResponse.json({
    scans: (data ?? []).map((r: any) => ({
      id: r.id, token: r.token, subject: r.subject_name, preparedFor: r.prepared_for, peerSetId: r.peer_set_id,
      opportunityId: r.opportunity_id, opportunityName: r.crm_opportunities?.name ?? null, createdAt: r.created_at,
      headline: r.headline ?? null, window: r.window ?? null,
      opens: views.get(r.id)?.n ?? 0, lastOpened: views.get(r.id)?.last ?? null,
    })),
  });
}

/**
 * PATCH /api/korea-scan/saved?id=<scan id> — change which slides the shared
 * link shows (admin+). Body: { slides: SlideId[], kickers, angle }.
 */
export async function PATCH(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const id = new URL(request.url).searchParams.get('id');
  const body = await request.json().catch(() => null);
  const slides = cleanSlides(body?.slides);
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if (!slides.length) return NextResponse.json({ error: 'Keep at least one slide.' }, { status: 400 });
  const deck = {
    slides,
    kickers: body?.kickers === 'lifecycle' ? 'lifecycle' : 'verdict',
    angle: typeof body?.angle === 'string' ? body.angle.slice(0, 40) : null,
  };
  const { error } = await (admin() as any).from('korea_scans').update({ deck }).eq('id', id).is('deleted_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deck });
}

/** DELETE /api/korea-scan/saved?id=<scan id> — revoke a scan's link (soft delete, admin+). */
export async function DELETE(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { error } = await (admin() as any).from('korea_scans').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
