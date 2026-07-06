import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/tg-scan-nudge
 *
 * Monthly nudge for the manual Telegram fan-out scan that feeds the
 * Two-Score Model (Doc 2 §3 Q7b drift). The scan itself lives in the
 * external kol-telegram-mcp project (Telethon, uses Andy's personal
 * TG session — can't run on Vercel). This cron just posts a one-line
 * reminder to APAC Internal so the scan happens on a regular cadence
 * without manual diary-keeping.
 *
 * Schedule: `0 3 1 * *` — 1st of each month, 03:00 UTC (~12:00 KST).
 *
 * Body: reads `max(snapshot_date)` from `kol_channel_snapshots`,
 * computes days since last scan, posts:
 *
 *   📡 TG scan due
 *   Last full scan: 12/27/2025 (N days ago)
 *   Run: `python scripts/scan_joined.py …` in kol-telegram-mcp
 *
 * Destination: reuses `app_settings.lineup_confirmed_chat_id` +
 * `_thread_id` since both posts target the same APAC Internal feed
 * (per Andy 2026-06-26). Add a dedicated `tg_scan_nudge_chat_id` key
 * later if these should diverge.
 *
 * Auth: Bearer ${CRON_SECRET}.
 * Logs: `agent_runs` with `agent_name='TG_SCAN_NUDGE'`. Add to
 * cron-health-check's EXPECTED_DAILY_MAX as 1 (monthly).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const start = Date.now();
  const startedAtIso = new Date().toISOString();

  try {
    // ─── 1. Latest scan freshness ────────────────────────────────
    const { data: latestRow, error: latestErr } = await (supabase as any)
      .from('kol_channel_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw latestErr;

    const latest = latestRow?.snapshot_date as string | undefined;
    let daysSince: number | null = null;
    let lastLabel = 'never';
    if (latest) {
      const lastMs = new Date(latest + 'T00:00:00Z').getTime();
      daysSince = Math.max(0, Math.floor((Date.now() - lastMs) / 86_400_000));
      const [y, m, d] = latest.split('-');
      lastLabel = `${m}/${d}/${y}`;
    }

    // ─── 2. Coverage stats (how many KOLs got scanned recently) ──
    const { count: coverageCount } = await (supabase as any)
      .from('kol_channel_snapshots')
      .select('kol_id', { count: 'exact', head: true })
      .gte('snapshot_date', new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10));

    const { count: rosterCount } = await (supabase as any)
      .from('master_kols')
      .select('id', { count: 'exact', head: true })
      .not('telegram_id', 'is', null);

    // ─── 3. Destination chat (reuse lineup_confirmed_chat_*) ─────
    const [chatRow, threadRow] = await Promise.all([
      (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_id').maybeSingle(),
      (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_thread_id').maybeSingle(),
    ]);
    const chatId = (chatRow.data as any)?.value as string | undefined;
    const threadId = (threadRow.data as any)?.value as string | undefined;

    // ─── 4. Compose + send ───────────────────────────────────────
    const text =
      `📡 <b>TG scan due</b>\n` +
      `Last full scan: ${lastLabel}${daysSince !== null ? ` (${daysSince}d ago)` : ''}\n` +
      `Coverage (45d): ${coverageCount ?? 0} / ${rosterCount ?? 0} KOLs with TG\n\n` +
      `Run in <code>kol-telegram-mcp</code>:\n` +
      `<code>python scripts/scan_joined.py --fixture &lt;roster.json&gt; --hhp-env &lt;.env.local&gt;</code>`;

    let posted = false;
    let postError: string | null = null;
    if (chatId) {
      try {
        posted = await TelegramService.sendToChat(
          chatId,
          text,
          'HTML',
          threadId ? parseInt(threadId, 10) : undefined,
        );
      } catch (err: any) {
        postError = err?.message || 'unknown';
      }
    }

    // ─── 5. Log to agent_runs ────────────────────────────────────
    await (supabase as any).from('agent_runs').insert({
      agent_name: 'TG_SCAN_NUDGE',
      run_type: 'scheduled',
      started_at: startedAtIso,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      status: posted ? 'success' : (chatId ? 'partial' : 'skipped'),
      output_summary: {
        latest_snapshot: latest ?? null,
        days_since: daysSince,
        coverage_45d: coverageCount ?? 0,
        roster_with_tg: rosterCount ?? 0,
        chat_id: chatId ?? null,
        thread_id: threadId ?? null,
        post_error: postError,
      },
    });

    return NextResponse.json({
      ok: true,
      posted,
      latest_snapshot: latest ?? null,
      days_since: daysSince,
      coverage_45d: coverageCount ?? 0,
      roster_with_tg: rosterCount ?? 0,
      skipped: !chatId ? 'No lineup_confirmed_chat_id app_setting; nothing posted.' : undefined,
    });
  } catch (err: any) {
    await (supabase as any).from('agent_runs').insert({
      agent_name: 'TG_SCAN_NUDGE',
      run_type: 'scheduled',
      started_at: startedAtIso,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      status: 'error',
      error_message: err?.message || String(err),
    });
    return NextResponse.json({ ok: false, error: err?.message || 'Nudge failed.' }, { status: 500 });
  }
}
