import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/korea-intel/[clientId]/brief-link — issue a new brief link (admin+).
 * The old link stops working immediately, including buttons already posted in
 * Telegram. For when a link has been forwarded somewhere it shouldn't be.
 */
export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any;
  // Find the config row first, then update by primary key. An `.or()` filter
  // on the UPDATE itself was rejected by PostgREST ("column … client_id does
  // not exist") even though the same filter works on reads.
  const { data: rows, error: findErr } = await db.from('kr_signal_clients').select('id')
    .or(`client_id.eq.${params.clientId},content_log_source.eq.hhp:${params.clientId}`);
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ error: 'No Korea setup for this client' }, { status: 404 });

  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  const { error } = await db.from('kr_signal_clients').update({ brief_token: token }).in('id', rows.map((r: any) => r.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, token });
}
