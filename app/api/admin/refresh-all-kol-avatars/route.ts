/**
 * POST /api/admin/refresh-all-kol-avatars
 *
 * Bulk avatar refresh across the entire active KOL roster (~424 rows).
 * Iterates serially with a small delay to avoid hammering unavatar.io and
 * Telegram. Reports per-source counts.
 *
 * Auth: super_admin only — heavier op + multiple third-party hits.
 *
 * Body (optional):
 *   { limit?: number }   default: all active non-archived KOLs
 *   { delay_ms?: number } default: 250ms between iterations
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { refreshKolAvatar } from '@/lib/kolAvatarService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min cap — at 250ms/each that's ~1200 KOLs

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Parse optional body knobs.
  let limit: number | null = null;
  let delayMs = 250;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.limit === 'number') limit = body.limit;
    if (typeof body?.delay_ms === 'number') delayMs = body.delay_ms;
  } catch {
    /* default knobs */
  }

  // Load the roster — active non-archived only.
  let query = (admin as any)
    .from('master_kols')
    .select('id, telegram_id, link, name')
    .is('archived_at', null);
  if (limit) query = query.limit(limit);

  const { data: kols, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch group chat IDs in one query so we don't hit telegram_chats per row.
  // master_kols.telegram_id is the KOL's personal user_id (not a chat); the
  // group chat for the KOL lives in telegram_chats. Service prefers the
  // group chat photo (getChat works) over the user's profile pic (which
  // needs getUserProfilePhotos and the user's privacy permission).
  const kolIds = (kols || []).map((k: any) => k.id);
  const { data: chatRows } = await (admin as any)
    .from('telegram_chats')
    .select('master_kol_id, chat_id')
    .in('master_kol_id', kolIds);
  const chatByKolId = new Map<string, string>();
  for (const r of (chatRows || []) as any[]) {
    if (r.master_kol_id && r.chat_id && !chatByKolId.has(r.master_kol_id)) {
      chatByKolId.set(r.master_kol_id, r.chat_id);
    }
  }

  const stats = {
    total: kols?.length ?? 0,
    telegram: 0,
    x: 0,
    skipped: 0,
    errors: [] as Array<{ name: string; error: string }>,
  };

  for (const kol of (kols || []) as any[]) {
    const result = await refreshKolAvatar(
      { ...kol, group_chat_id: chatByKolId.get(kol.id) || null },
      admin,
    );
    if (result.success && result.url) {
      await (admin as any)
        .from('master_kols')
        .update({
          profile_picture_url: result.url,
          profile_picture_synced_at: new Date().toISOString(),
        })
        .eq('id', kol.id);
      if (result.source === 'telegram') stats.telegram++;
      else if (result.source === 'x') stats.x++;
    } else {
      stats.skipped++;
      if (result.error && stats.errors.length < 10) {
        stats.errors.push({ name: kol.name, error: result.error });
      }
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  return NextResponse.json({
    ok: true,
    stats,
  });
}
