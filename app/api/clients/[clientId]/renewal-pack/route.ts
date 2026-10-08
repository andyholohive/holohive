import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { loadClientDashboard } from '@/lib/clientDashboard';
import { buildRenewalSnapshot, cleanRenewalSlides } from '@/lib/renewalPack';

export const dynamic = 'force-dynamic';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** GET /api/clients/[id]/renewal-pack — this client's live packs, newest first, with link opens (admin+). */
export async function GET(request: Request, { params }: { params: { clientId: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  if (!validId(params.clientId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = admin() as any;
  const { data, error } = await db.from('client_renewal_packs')
    .select('id, token, prepared_for, slides, created_at')
    .eq('client_id', params.clientId).is('deleted_at', null).order('created_at', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (data ?? []).map((r: any) => r.id);
  const views = new Map<string, { n: number; last: string | null }>();
  if (ids.length) {
    const { data: v } = await db.from('client_renewal_pack_views').select('pack_id, viewed_at').in('pack_id', ids).order('viewed_at', { ascending: false }).limit(5000);
    for (const r of v ?? []) {
      const cur = views.get(r.pack_id) ?? { n: 0, last: null };
      cur.n += 1; cur.last = cur.last ?? r.viewed_at;
      views.set(r.pack_id, cur);
    }
  }
  return NextResponse.json({
    packs: (data ?? []).map((r: any) => ({
      id: r.id, token: r.token, preparedFor: r.prepared_for, slides: r.slides, createdAt: r.created_at,
      opens: views.get(r.id)?.n ?? 0, lastOpened: views.get(r.id)?.last ?? null,
    })),
  });
}

/**
 * POST /api/clients/[id]/renewal-pack — freeze a client-safe snapshot of the
 * dashboard and mint a share link (admin+). Body: { slides, preparedFor?, note? }.
 */
export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  if (!validId(params.clientId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const db = admin();
  try {
    const d = await loadClientDashboard(db, params.clientId);
    if (!d) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    const snapshot = buildRenewalSnapshot(d);
    const slides = cleanRenewalSlides(body?.slides, snapshot);
    if (!slides.length) return NextResponse.json({ error: 'Pick at least one slide.' }, { status: 400 });
    const token = randomBytes(32).toString('hex');
    const { data, error } = await (db as any).from('client_renewal_packs').insert({
      client_id: params.clientId,
      token,
      prepared_for: typeof body?.preparedFor === 'string' && body.preparedFor.trim() ? body.preparedFor.trim().slice(0, 120) : null,
      note: typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 4000) : null,
      slides,
      snapshot,
      created_by: guard.user?.id ?? null,
    }).select('id, token').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id, token: data.token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not build the pack' }, { status: 500 });
  }
}

/** DELETE /api/clients/[id]/renewal-pack?id=<pack id> — revoke a pack's link (soft delete, admin+). */
export async function DELETE(request: Request, { params }: { params: { clientId: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !validId(id) || !validId(params.clientId)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { error } = await (admin() as any).from('client_renewal_packs')
    .update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('client_id', params.clientId).is('deleted_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
