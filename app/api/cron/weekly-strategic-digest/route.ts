/**
 * GET /api/cron/weekly-strategic-digest
 *
 * Posts the Weekly Strategic Direction Summary — every active client's
 * `strategic_notes` for the current week, rolled into one Telegram
 * message:
 *
 *   Weekly Strategic Direction Summary
 *   Week of Jul 27
 *
 *   Fogo
 *   • Onboard new KOLs gradually, small scale is fine.
 *
 *   Tria
 *   • Phase 1 is relationship building only, no content deliverables.
 *
 * WHY THIS RUNS DAILY FOR A WEEKLY DIGEST [Andy 2026-07-28]
 * The target is 15:00 UTC Monday, but the notes are written by hand and
 * are not always in by then. Rather than post an empty summary or miss
 * the week entirely, the cron fires at 15:00 UTC EVERY day and:
 *
 *   - already posted for this week  → no-op
 *   - no notes written yet          → no-op, try again tomorrow
 *   - notes present                 → post, and record the week
 *
 * So it lands Monday when the team is on time and self-heals to Tuesday,
 * Wednesday, … when they aren't. `weekly_strategic_digest_last_sent_week`
 * in app_settings is what makes it at-most-once per week; the schedule
 * alone cannot express that.
 *
 * A week where nobody ever writes a note is simply never posted — the
 * counter rolls to the next Monday on its own.
 *
 * Auth: Bearer ${CRON_SECRET}. Logs to agent_runs as
 * WEEKLY_STRATEGIC_DIGEST for the cron-health-check sweep.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import {
  mondayOf,
  getDigestDestination,
  getLastSentWeek,
  setLastSentWeek,
  getStrategicEntries,
  formatDigest,
} from '@/lib/strategicDigest';

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

  const start = Date.now();
  const url = new URL(request.url);
  // dryRun renders without sending or stamping — used to preview the
  // week's output. force ignores the already-sent guard so a week can be
  // re-posted deliberately (e.g. after a note was corrected).
  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';

  const log = async (status: string, summary: string) => {
    try {
      await (sb as any).from('agent_runs').insert({
        agent_name: 'WEEKLY_STRATEGIC_DIGEST',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status,
        output_summary: summary,
      });
    } catch { /* never let logging break the run */ }
  };

  try {
    const weekOf = mondayOf(new Date());

    if (!force && !dryRun) {
      const lastSent = await getLastSentWeek(sb);
      if (lastSent === weekOf) {
        return NextResponse.json({ posted: false, weekOf, reason: 'already sent this week' });
      }
    }

    const entries = await getStrategicEntries(sb, weekOf);
    if (entries.length === 0) {
      // Not an error — the notes just aren't in yet. Tomorrow's run
      // retries. Deliberately not logged to agent_runs: a quiet Monday
      // morning would otherwise look like cron noise in the health sweep.
      return NextResponse.json({
        posted: false,
        weekOf,
        reason: 'no strategic notes written for this week yet — will retry tomorrow',
      });
    }

    const messages = formatDigest(entries, weekOf);

    if (dryRun) {
      return NextResponse.json({
        posted: false, dryRun: true, weekOf,
        clients: entries.map(e => e.clientName),
        messages,
      });
    }

    const dest = await getDigestDestination(sb);
    if (!dest.chatId) {
      await log('failed', 'no digest chat configured (weekly_strategic_digest_chat_id)');
      return NextResponse.json({
        posted: false, weekOf,
        reason: 'no chat configured — set one in /admin/telegram-comm',
      });
    }

    let sent = 0;
    for (const msg of messages) {
      const ok = await TelegramService.sendToChat(
        dest.chatId, msg, 'HTML', dest.threadId ?? undefined,
      );
      if (!ok) break;
      sent++;
    }

    if (sent === 0) {
      await log('failed', `telegram send failed for week ${weekOf}`);
      return NextResponse.json({ posted: false, weekOf, reason: 'telegram send failed' }, { status: 502 });
    }

    // Only stamp on a real send. A partial send still counts as sent —
    // re-posting the whole digest to correct a dropped continuation
    // message would be worse than the gap.
    await setLastSentWeek(sb, weekOf);
    await log('success', `posted ${entries.length} client(s) for week ${weekOf} in ${sent} message(s)`);

    return NextResponse.json({
      posted: true, weekOf, clients: entries.length, messages: sent,
    });
  } catch (err: any) {
    await log('failed', err?.message ?? 'unknown error');
    return NextResponse.json({ error: err?.message ?? 'unknown error' }, { status: 500 });
  }
}
