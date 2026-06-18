/**
 * GET /api/cron/refresh-kol-avatars
 *
 * Daily cron at 05:00 UTC. For each active KOL where:
 *   - profile_picture_url IS NULL                       (never refreshed)
 *   - OR profile_picture_synced_at < now() - 7 days     (stale)
 * we run refreshKolAvatar and persist the new URL + stamp.
 *
 * **Recently-refreshed rows are skipped.** This is intentional — if a team
 * member or the Refresh button in the edit dialog touched a KOL inside
 * the last 7 days, the cron leaves them alone. Cron's job is to fill
 * gaps + keep the long tail current, not re-hammer fresh rows.
 *
 * Sources (per refreshKolAvatar):
 *   1. t.me/@channel link → bot.getChat
 *   2. x.com/handle link  → unavatar.io
 *   3. telegram_id        → bot.getUserProfilePhotos (last resort)
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Logged to agent_runs as KOL_AVATAR_REFRESH for cron-health-check.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshKolAvatar } from '@/lib/kolAvatarService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — at 250ms/each, supports ~1200 KOLs

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STALENESS_DAYS = 7;
const DELAY_MS = 250;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const startedAt = new Date();

  // Log run start
  const { data: runRow } = await (admin as any)
    .from('agent_runs')
    .insert({
      agent_name: 'KOL_AVATAR_REFRESH',
      run_type: 'scheduled',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: { staleness_days: STALENESS_DAYS, delay_ms: DELAY_MS },
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (status: 'completed' | 'failed', summary: any, error?: string) => {
    if (!runId) return;
    const endedAt = new Date();
    await (admin as any)
      .from('agent_runs')
      .update({
        status,
        completed_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        output_summary: summary,
        error_message: error ?? null,
      })
      .eq('id', runId);
  };

  try {
    // Stale cutoff = anything older than STALENESS_DAYS ago.
    const cutoff = new Date(startedAt.getTime() - STALENESS_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Pick rows that need refreshing — either never synced or stale.
    // Recently-refreshed rows are NOT selected (recently = synced within
    // STALENESS_DAYS), so manual refreshes via the edit-dialog button
    // protect the row from being touched by the next cron tick.
    const { data: kols, error: loadErr } = await (admin as any)
      .from('master_kols')
      .select('id, telegram_id, link, name')
      .is('archived_at', null)
      .or(`profile_picture_synced_at.is.null,profile_picture_synced_at.lt.${cutoff}`);
    if (loadErr) {
      await finishRun('failed', null, loadErr.message);
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }

    const stats = {
      eligible: kols?.length ?? 0,
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
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }

    await finishRun('completed', stats);
    return NextResponse.json({ ok: true, stats });
  } catch (err: any) {
    const msg = err?.message || String(err);
    await finishRun('failed', null, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
