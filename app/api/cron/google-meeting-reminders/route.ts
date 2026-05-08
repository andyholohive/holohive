import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { getValidAccessToken, listUpcomingMeetEvents, type MeetEvent } from '@/lib/googleCalendarService';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/google-meeting-reminders — Runs every 5 minutes.
 *
 * For each connected user, fetches upcoming Google Meet events and sends a
 * Telegram DM at each configured "minutes-before-meeting" offset.
 *
 * Configuration (centrally, in /reminders → Google Meeting Reminders rule):
 *   params.advance_minutes  number[]  e.g. [30, 10] for two reminders (30 min + 10 min before)
 *   params.send_at_start    boolean   if true, also fire at meeting start (offset 0)
 *   params.lookahead_minutes number   how far ahead to fetch from each calendar
 *
 * Window logic (per offset N): fire when meeting_start is in [now + N min,
 * now + (N+5) min]. Since cron fires every 5 min, this guarantees one
 * matching window per offset per event without overlap. Dedupe table
 * (user_id, event_id, minutes_before) makes it exactly-once even if cron drifts.
 *
 * Per-user fan-out: each connected user iterates their own calendar and gets
 * their own DM. If three teammates are in a meeting and all connected Google,
 * all three get reminded — the event is on all three calendars.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const start = Date.now();

  // ── Load rule config ────────────────────────────────────────────────
  const { data: rule } = await (supabase as any)
    .from('reminder_rules')
    .select('id, params, is_active')
    .eq('rule_type', 'google_meeting_reminder')
    .single();

  if (!rule || !rule.is_active) {
    return NextResponse.json({ ok: true, skipped: 'rule inactive or missing', duration_ms: Date.now() - start });
  }

  // Build the list of offsets (minutes before meeting) where we fire.
  // Backward-compat: if advance_minutes is a number, wrap it in an array.
  // 0 is the "at start" offset; we add it conditionally based on send_at_start.
  const rawAdvance = rule.params?.advance_minutes;
  const advanceList: number[] = Array.isArray(rawAdvance)
    ? rawAdvance.filter((n) => typeof n === 'number' && n > 0)
    : (typeof rawAdvance === 'number' && rawAdvance > 0 ? [rawAdvance] : [10]);

  const sendAtStart: boolean = rule.params?.send_at_start !== false;
  const offsets = new Set<number>(advanceList);
  if (sendAtStart) offsets.add(0);

  // Lookahead has to cover the largest offset plus the 5-min window slack.
  const maxOffset = Math.max(...Array.from(offsets), 0);
  const lookaheadMinutes: number = Math.max(rule.params?.lookahead_minutes ?? 60, maxOffset + 10);

  // ── Load connected users + their Telegram DMs ───────────────────────
  const { data: connectedUsers, error: usersErr } = await (supabase as any)
    .from('google_oauth_tokens')
    .select('user_id, google_email, users!inner(name, telegram_id)');

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }
  if (!connectedUsers || connectedUsers.length === 0) {
    return NextResponse.json({ ok: true, users: 0, duration_ms: Date.now() - start });
  }

  const now = Date.now();

  const userResults: Array<{
    user_id: string;
    google_email: string;
    events_found: number;
    reminders_sent: number;
    error?: string;
  }> = [];

  for (const row of connectedUsers as any[]) {
    const userId = row.user_id;
    const googleEmail = row.google_email;
    const userName = row.users?.name || 'You';
    const telegramChatId = row.users?.telegram_id;

    if (!telegramChatId) {
      userResults.push({
        user_id: userId, google_email: googleEmail,
        events_found: 0, reminders_sent: 0,
        error: 'No telegram_id on user — cannot DM',
      });
      continue;
    }

    let events: MeetEvent[] = [];
    try {
      const accessToken = await getValidAccessToken(supabase, userId);
      events = await listUpcomingMeetEvents(accessToken, lookaheadMinutes);
    } catch (err: any) {
      userResults.push({
        user_id: userId, google_email: googleEmail,
        events_found: 0, reminders_sent: 0,
        error: err.message,
      });
      continue;
    }

    let sent = 0;

    for (const ev of events) {
      const startMs = new Date(ev.start).getTime();
      const minutesUntil = (startMs - now) / 60_000;

      // Determine which offsets this event currently sits in. For offset N,
      // we fire when minutes-until-meeting ∈ [N, N+5].
      // (For N=0: meeting starting now or up to 5 min from now.)
      const firingOffsets: number[] = [];
      Array.from(offsets).forEach((offset) => {
        if (minutesUntil >= offset && minutesUntil <= offset + 5) {
          firingOffsets.push(offset);
        }
      });
      if (firingOffsets.length === 0) continue;

      // Pull dedupe rows for this event across all firing offsets in one query.
      const { data: alreadySent } = await (supabase as any)
        .from('google_meeting_reminders_sent')
        .select('minutes_before')
        .eq('user_id', userId)
        .eq('google_event_id', ev.id)
        .in('minutes_before', firingOffsets);

      const sentOffsets = new Set<number>((alreadySent || []).map((r: any) => r.minutes_before));

      for (const offset of firingOffsets) {
        if (sentOffsets.has(offset)) continue;

        const ok = await sendReminder(telegramChatId, ev, userName, offset);
        if (ok) {
          await (supabase as any).from('google_meeting_reminders_sent').insert({
            user_id: userId,
            google_event_id: ev.id,
            minutes_before: offset,
            meeting_start_at: ev.start,
            meet_link: ev.meetLink,
          });
          sent++;
        }
      }
    }

    userResults.push({
      user_id: userId, google_email: googleEmail,
      events_found: events.length, reminders_sent: sent,
    });
  }

  // Update parent rule's last_run so /reminders shows freshness info.
  const totalSent = userResults.reduce((sum, r) => sum + r.reminders_sent, 0);
  const totalEvents = userResults.reduce((sum, r) => sum + r.events_found, 0);
  await (supabase as any)
    .from('reminder_rules')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_result: {
        items_found: totalEvents,
        message_sent: totalSent > 0,
        users_checked: userResults.length,
        reminders_sent: totalSent,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', rule.id);

  return NextResponse.json({
    ok: true,
    users_checked: userResults.length,
    total_events: totalEvents,
    total_reminders_sent: totalSent,
    offsets_active: Array.from(offsets).sort((a, b) => b - a),
    duration_ms: Date.now() - start,
    results: userResults,
  });
}

/**
 * Format and send a single reminder DM.
 *
 * Subtitle text adapts per offset:
 *   N=0   → "Starting now"
 *   N=1   → "Starting in 1 minute"
 *   N>1   → "Starting in N minutes (HH:MM AM/PM)"
 */
async function sendReminder(
  chatId: string,
  ev: MeetEvent,
  _userName: string,
  minutesBefore: number,
): Promise<boolean> {
  const startTime = new Date(ev.start);
  const timeStr = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  let subtitle: string;
  if (minutesBefore === 0) {
    subtitle = '\u{1F7E2} Starting now';
  } else {
    const unit = minutesBefore === 1 ? 'minute' : 'minutes';
    subtitle = `\u{23F0} Starting in ${minutesBefore} ${unit} (${timeStr})`;
  }

  const safeSummary = escapeHtml(ev.summary);

  const text =
    `\u{1F4F9} <b>${safeSummary}</b>\n` +
    `<i>${subtitle}</i>\n` +
    `\u{1F517} <a href="${ev.meetLink}">Join Meet</a>`;

  return TelegramService.sendToChat(chatId, text, 'HTML');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
