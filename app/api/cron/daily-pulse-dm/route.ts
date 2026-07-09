/**
 * GET /api/cron/daily-pulse-dm  (DP.3)
 *
 * Fires at 06:00 UTC Mon–Fri. DMs each Daily Pulse roster member the
 * day-variant prompt (Mon–Thu: blockers only; Fri: blockers + one win)
 * and seeds a daily_pulse row per member at status 'no_checkin' with
 * prompted_at = now. The webhook reply-capture branch fills those rows
 * in; the 12:00 UTC digest cron reads them.
 *
 * Reuses the existing DM infra (TelegramService.sendToChat + users.
 * telegram_id). Roster + destination come from app_settings, edited via
 * /admin/telegram-comm → Daily Pulse.
 *
 * Auth: Bearer ${CRON_SECRET}, same as every other cron.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { getRoster, promptFor, isFridayUTC, pulseDateFor } from '@/lib/dailyPulse';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
    const roster = await getRoster(sb);
    if (roster.length === 0) {
      return NextResponse.json({ sent: 0, reason: 'roster empty — configure it on /admin/telegram-comm' });
    }

    const results: Array<{ name: string | null; dmSent: boolean; error?: string }> = [];
    for (const member of roster) {
      // Seed / refresh today's row at no_checkin with the prompt time.
      // On conflict (re-run same day) we keep any captured status but
      // always stamp prompted_at so the reply window is well-defined.
      await (sb as any)
        .from('daily_pulse')
        .upsert(
          {
            pulse_date: pulseDate,
            user_id: member.id,
            prompted_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
          { onConflict: 'pulse_date,user_id', ignoreDuplicates: false },
        );

      if (!member.telegram_id) {
        results.push({ name: member.name, dmSent: false, error: 'no telegram_id' });
        continue;
      }
      if (dryRun) {
        results.push({ name: member.name, dmSent: false, error: 'dry-run' });
        continue;
      }
      try {
        const ok = await TelegramService.sendToChat(member.telegram_id, promptFor(member.name, friday), 'HTML');
        results.push({ name: member.name, dmSent: ok, error: ok ? undefined : 'send failed' });
      } catch (err: any) {
        results.push({ name: member.name, dmSent: false, error: err?.message ?? 'send threw' });
      }
    }

    const sent = results.filter(r => r.dmSent).length;
    try {
      await (sb as any).from('agent_runs').insert({
        agent_name: 'DAILY_PULSE_DM',
        run_type: 'cron',
        started_at: new Date(runStart).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `${sent}/${roster.length} DM(s) sent (${friday ? 'Friday' : 'weekday'} variant).`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({ pulseDate, friday, roster: roster.length, sent, results });
  } catch (err) {
    return NextResponse.json(
      { error: 'daily-pulse-dm failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
