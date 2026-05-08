import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/dashboard-self-reports
 *
 * Sunday-evening cron (registered in vercel.json). For each active team
 * member with a stored telegram_id, sends a DM with a check-in prompt
 * + link to /dashboard/check-in?week_of=NEXT_MONDAY. Inserts an empty
 * dashboard_self_reports row stamped with prompted_at — when the user
 * later submits the form, that same row gets updated with their answers.
 *
 * Auth: standard CRON_SECRET bearer header. Same pattern as every other
 * cron endpoint in the app (see /api/cron/reminders).
 *
 * Idempotency: if a self-report row already exists for (user, next-Monday),
 * we skip the DM. Means re-firing the cron won't double-DM the team.
 */

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.holohive.io';

// Returns Monday-of-the-coming-week (i.e. tomorrow if today is Sunday).
// The check-in form keys off this — Sunday DMs prompt for the week
// that's about to start.
function nextMondayUTC(): string {
  const d = new Date();
  const day = d.getUTCDay();
  // If today is Sunday (0), next Monday is +1 day. Otherwise it's
  // (8 - day) days ahead — wrapping correctly for any weekday.
  const daysAhead = day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  // Bearer-token auth (CRON_SECRET). Vercel cron sends this header.
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Active team members WITH a telegram_id (we can't DM without it).
  // Skip guests/clients — they're not part of the operating team.
  const { data: users, error: usersErr } = await (supabase as any)
    .from('users')
    .select('id, name, email, telegram_id, role')
    .eq('is_active', true)
    .not('telegram_id', 'is', null)
    .neq('role', 'guest')
    .neq('role', 'client');

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  const weekOf = nextMondayUTC();
  const formUrl = `${APP_BASE_URL}/dashboard/check-in?week_of=${weekOf}`;

  // Check which users already have a row for this week so we don't re-DM.
  const userIds = (users || []).map((u: any) => u.id);
  const { data: existing } = await (supabase as any)
    .from('dashboard_self_reports')
    .select('user_id')
    .in('user_id', userIds)
    .eq('week_of', weekOf);
  const alreadyPrompted = new Set((existing || []).map((r: any) => r.user_id));

  let prompted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const u of users || []) {
    if (alreadyPrompted.has(u.id)) { skipped++; continue; }

    const message = [
      `<b>Weekly check-in for ${weekOf}</b>`,
      '',
      `Hi ${u.name?.split(' ')[0] || 'there'} 👋`,
      '',
      'It\'s Sunday — quick check-in for this week\'s priority dashboard.',
      'Please take 60 seconds to fill out:',
      '',
      `<a href="${formUrl}">Open the check-in form →</a>`,
      '',
      '<i>Three things you focused on, anything blocked, what\'s up next.</i>',
    ].join('\n');

    try {
      const ok = await TelegramService.sendToChat(u.telegram_id, message, 'HTML');
      if (!ok) {
        errors.push(`${u.email}: TG send returned false`);
        continue;
      }
      // Insert the empty self-report row so we know we prompted them.
      // Form submission will update this same row (UNIQUE on user+week).
      await (supabase as any)
        .from('dashboard_self_reports')
        .insert({
          user_id: u.id,
          week_of: weekOf,
          prompted_at: new Date().toISOString(),
        });
      prompted++;
    } catch (err: any) {
      errors.push(`${u.email}: ${err?.message ?? 'unknown'}`);
    }
  }

  return NextResponse.json({
    week_of: weekOf,
    eligible_users: users?.length ?? 0,
    prompted,
    skipped_already_prompted: skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
