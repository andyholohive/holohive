/**
 * GET /api/cron/daily-pulse-digest  (DP.7)
 *
 * Fires at 12:00 UTC Mon–Fri — the reply cutoff, 6h after the morning
 * DM. Compiles today's daily_pulse rows into one digest and posts it to
 * the configured HH Ops – terminal chat:
 *
 *   📟 Daily pulse — Tue Jul 7
 *   🔴 Blocked (2)
 *   • Quazo // Venice lineup, waiting on client approval
 *   • Andy // client API keys
 *   🟢 Clear (1) — Bolt
 *   ⚪ No check-in (1) — Jaymz
 *
 * Friday adds a 🎉 Wins block. Win and blocker status are independent
 * axes (Jdot) — a member can appear in both Blocked and Wins, or Clear
 * and Wins. Empty sections are omitted.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';
import { getRoster, getDigestDestination, isFridayUTC, pulseDateFor } from '@/lib/dailyPulse';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'missing supabase config' }, { status: 500 });
  }
  const sb = createClient(supabaseUrl, supabaseServiceKey);

  const runStart = Date.now();
  const now = new Date();
  const pulseDate = pulseDateFor(now);
  const friday = isFridayUTC(now);
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

  try {
    const [roster, dest] = await Promise.all([getRoster(sb), getDigestDestination(sb)]);
    if (roster.length === 0) {
      return NextResponse.json({ posted: false, reason: 'roster empty' });
    }

    const { data: rows } = await (sb as any)
      .from('daily_pulse')
      .select('user_id, status, blocker_text, win_text')
      .eq('pulse_date', pulseDate);
    const rowByUser = new Map<string, { status: string; blocker_text: string | null; win_text: string | null }>();
    for (const r of ((rows ?? []) as any[])) rowByUser.set(r.user_id, r);

    // Bucket in configured roster order.
    const blocked: string[] = [];
    const clear: string[] = [];
    const noCheckin: string[] = [];
    const wins: string[] = [];
    for (const m of roster) {
      const name = escapeHtml((m.name || 'Unknown').split(' ')[0]);
      const row = rowByUser.get(m.id);
      const status = row?.status ?? 'no_checkin';
      if (status === 'blocked') {
        blocked.push(`• ${name} // ${escapeHtml(row?.blocker_text || '—')}`);
      } else if (status === 'clear') {
        clear.push(name);
      } else {
        noCheckin.push(name);
      }
      if (friday && row?.win_text) {
        for (const w of row.win_text.split('\n').map(s => s.trim()).filter(Boolean)) {
          wins.push(`• ${name} — ${escapeHtml(w)}`);
        }
      }
    }

    // Build message — omit empty sections.
    const label = `${WD[now.getUTCDay()]} ${MO[now.getUTCMonth()]} ${now.getUTCDate()}`;
    const lines: string[] = [`📟 <b>Daily pulse — ${label}</b>`];
    if (blocked.length) {
      lines.push('', `🔴 <b>Blocked (${blocked.length})</b>`, ...blocked);
    }
    if (clear.length) {
      lines.push('', `🟢 Clear (${clear.length}) — ${clear.join(', ')}`);
    }
    if (noCheckin.length) {
      lines.push('', `⚪ No check-in (${noCheckin.length}) — ${noCheckin.join(', ')}`);
    }
    if (friday && wins.length) {
      lines.push('', '🎉 <b>Wins</b>', ...wins);
    }
    const message = lines.join('\n');

    let posted = false;
    if (!dest.chatId) {
      // Nowhere to post — surface but don't error the cron.
      try {
        await (sb as any).from('agent_runs').insert({
          agent_name: 'DAILY_PULSE_DIGEST',
          run_type: 'cron',
          started_at: new Date(runStart).toISOString(),
          completed_at: new Date().toISOString(),
          status: 'success',
          output_summary: 'no digest chat configured; digest not posted.',
        });
      } catch { /* swallow */ }
      return NextResponse.json({ posted: false, reason: 'no digest chat configured', preview: message });
    }

    if (!dryRun) {
      posted = await TelegramService.sendToChat(dest.chatId, message, 'HTML', dest.threadId ?? undefined);
    }

    try {
      await (sb as any).from('agent_runs').insert({
        agent_name: 'DAILY_PULSE_DIGEST',
        run_type: 'cron',
        started_at: new Date(runStart).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `${blocked.length} blocked, ${clear.length} clear, ${noCheckin.length} no check-in${friday ? `, ${wins.length} win(s)` : ''}.`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({
      posted,
      pulseDate,
      friday,
      counts: { blocked: blocked.length, clear: clear.length, noCheckin: noCheckin.length, wins: wins.length },
      preview: message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'daily-pulse-digest failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
