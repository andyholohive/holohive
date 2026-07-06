/**
 * POST /api/kols/[id]/rescan
 *
 * Fires the GH-Actions on-demand Telethon scan for a single KOL. Used by:
 *   - "Rescan" button in KolProfileModal
 *   - Auto-fire on KOL creation in /kols
 *
 * Non-blocking: latency from dispatch to DB upsert is ~30-90s (runner
 * queue + Telethon connect + snapshot + upsert), so the caller should
 * toast "scan queued" instead of awaiting the result.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { triggerKolScan } from '@/lib/githubActions';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: kolId } = await context.params;

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: kol, error: loadErr } = await (admin as any)
    .from('master_kols')
    .select('id, telegram_id, link, name')
    .eq('id', kolId)
    .maybeSingle();
  if (loadErr || !kol) {
    return NextResponse.json({ error: 'KOL not found' }, { status: 404 });
  }

  // Derive the channel handle from `link` — the Telethon scanner reads
  // `master_kols.link` (a t.me URL) and normalizes to @handle. The
  // separate `telegram_id` column stores the numeric user ID used by the
  // bot (/wallet, /submit) and is NOT a channel handle.
  const link = (typeof kol.link === 'string' ? kol.link : '').trim();
  if (!link) {
    return NextResponse.json({
      ok: false,
      error: 'KOL has no link to scan',
    }, { status: 400 });
  }
  // Accept t.me/ URLs, bare @handles, and bare handles — triggerKolScan
  // normalizes all three. Only reject a link that's clearly a NON-Telegram
  // URL (x.com, youtube, a website), since Telethon can't resolve those.
  if (/^https?:\/\//i.test(link) && !/t\.me\//i.test(link)) {
    return NextResponse.json({
      ok: false,
      error: 'KOL link is not a Telegram channel — cannot scan',
    }, { status: 400 });
  }

  const result = await triggerKolScan(link);
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.error || 'Dispatch failed',
    }, { status: 502 });
  }

  return NextResponse.json({ ok: true, queued: true });
}
