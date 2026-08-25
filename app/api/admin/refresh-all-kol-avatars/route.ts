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
 *   { scope?: 'missing' | 'all' } default: 'all'
 *       'missing' → only rows with no profile_picture_url yet. A newly added
 *       KOL has no avatar until the next 05:00 UTC cron pass, and re-fetching
 *       all ~424 to pick up three of them takes ~2 minutes of third-party
 *       calls. [2026-08-06 per Andy]
 *   { limit?: number }   default: no cap
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
  let scope: 'missing' | 'all' = 'all';
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.limit === 'number') limit = body.limit;
    if (typeof body?.delay_ms === 'number') delayMs = body.delay_ms;
    if (body?.scope === 'missing') scope = 'missing';
  } catch {
    /* default knobs */
  }

  // Load the roster — active non-archived only. Per KOL-AVATAR.8 we no
  // longer need the group_chat_id join — that path was returning the
  // Holo Hive logo on every chat. Now: telegram_id (user) → getUserProfilePhotos,
  // else fall through to X.
  let query = (admin as any)
    .from('master_kols')
    .select('id, telegram_id, link, name')
    .is('archived_at', null);
  // 'missing' skips anyone who already has a picture — the cheap pass for
  // "the ones added since the last cron run".
  if (scope === 'missing') query = query.is('profile_picture_url', null);
  if (limit) query = query.limit(limit);

  const { data: kols, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stats = {
    total: kols?.length ?? 0,
    telegram: 0,
    x: 0,
    skipped: 0,
    errors: [] as Array<{ name: string; error: string }>,
  };

  for (const kol of (kols || []) as any[]) {
    const result = await refreshKolAvatar(kol, admin);
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
    scope,
    stats,
  });
}
