import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { profileXHandle, applyXProfile, xHandleFromLink } from '@/lib/kolXProfile';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/kols/[id]/profile-x
 *
 * The X analogue of the Telegram profile scan (PROF.1–7). The TG pipeline
 * reads a channel via Telethon and infers creator_type + niche with Claude;
 * X KOLs can't be read that way, so this route uses Grok's live X search
 * (see lib/kolXProfile) to read the handle's timeline + bio and infer the
 * same taxonomy, then writes it to master_kols (DB triggers mirror into the
 * legacy singular columns the UI reads).
 *
 * Auth: any authenticated user (same as refresh-tg). One-off single-KOL
 * Grok read is cheap; the bulk backfill gates on super-admin + cost preview.
 *
 * Env: GROK_API_KEY (xAI, from https://x.ai/api).
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!process.env.GROK_API_KEY) {
      return NextResponse.json({
        error: 'GROK_API_KEY not configured',
        hint: 'Add your xAI key (https://x.ai/api) to Vercel env vars to enable X profiling.',
      }, { status: 500 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'supabase not configured' }, { status: 500 });
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: kol, error: kolErr } = await admin
      .from('master_kols')
      .select('id, name, link, platform')
      .eq('id', params.id)
      .single();
    if (kolErr || !kol) return NextResponse.json({ error: 'KOL not found' }, { status: 404 });

    const handle = xHandleFromLink((kol as any).link);
    if (!handle) {
      return NextResponse.json({
        error: 'No X handle on this KOL',
        hint: 'This route only profiles X KOLs — the link must be an x.com / twitter.com URL. Use the TG scan for Telegram KOLs.',
      }, { status: 400 });
    }

    const result = await profileXHandle(handle);
    if (!result.ok) {
      return NextResponse.json({ ok: false, handle, reason: result.reason, cost_usd: result.cost_usd ?? 0 }, { status: 200 });
    }

    const { error: updErr } = await applyXProfile(admin, params.id, result);
    if (updErr) return NextResponse.json({ error: `DB update failed: ${updErr}` }, { status: 500 });

    return NextResponse.json({ ...result, kol: { id: (kol as any).id, name: (kol as any).name } });
  } catch (err: any) {
    console.error('[profile-x] unexpected error:', err);
    return NextResponse.json({ error: err?.message ?? 'unexpected error' }, { status: 500 });
  }
}
