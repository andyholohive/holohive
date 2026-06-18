/**
 * POST /api/kols/[id]/refresh-avatar
 *
 * Per-KOL avatar refresh — called from the "Refresh avatar" button in
 * MasterKolEditDialog. Tries Telegram first (durable storage URL), falls
 * through to X via unavatar.io.
 *
 * Auth: any authenticated team member. Mirrors the auth posture of the
 * edit-dialog itself — if you can edit a KOL, you can refresh their pic.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { refreshKolAvatar } from '@/lib/kolAvatarService';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: kolId } = await context.params;

  // ── Auth: any authenticated user ─────────────────────────────────
  let userOk = false;
  try {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    userOk = !!user;
  } catch {
    /* fall through to 401 */
  }
  if (!userOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Service-role client for storage + master_kols update ─────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Load the KOL ─────────────────────────────────────────────────
  const { data: kol, error: loadErr } = await (admin as any)
    .from('master_kols')
    .select('id, telegram_id, link, name')
    .eq('id', kolId)
    .maybeSingle();
  if (loadErr || !kol) {
    return NextResponse.json({ error: 'KOL not found' }, { status: 404 });
  }

  // ── Refresh ──────────────────────────────────────────────────────
  // Per KOL-AVATAR.8: only telegram_id (user) + link (X). Group chat path
  // dropped because every group chat shares the HoloHive logo as its photo.
  const result = await refreshKolAvatar(
    { id: kol.id, telegram_id: kol.telegram_id, link: kol.link },
    admin,
  );

  if (!result.success || !result.url) {
    return NextResponse.json({
      ok: false,
      source: result.source,
      error: result.error || 'No source available — KOL needs telegram_id or X link.',
    });
  }

  // ── Persist URL + timestamp ──────────────────────────────────────
  const { error: updErr } = await (admin as any)
    .from('master_kols')
    .update({
      profile_picture_url: result.url,
      profile_picture_synced_at: new Date().toISOString(),
    })
    .eq('id', kolId);
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    source: result.source,
    url: result.url,
  });
}
