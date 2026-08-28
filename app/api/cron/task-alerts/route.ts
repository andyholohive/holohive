import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';
import { formatDate } from '@/lib/dateFormat';

export const dynamic = 'force-dynamic';

// ── Staleness thresholds ─────────────────────────────────────────────
//
// [2026-08-15, Jdot] "both stale task deadlines are months away, I think
// logic is flawed" — he was right. Staleness was `updated_at` older than a
// flat 7 days with no reference to the deadline, so a task due 2027-02-06
// that nobody had touched in 10 days got reported as stale. It isn't
// stale; it hasn't started, and it isn't due for six months.
//
// Staleness only means something relative to a deadline: a task is stale
// when it is drifting UNATTENDED toward one that is close, or when it has
// no deadline at all and nothing will ever force the issue. A task with a
// distant due date is simply not due yet, and pinging about it every day
// trains people to ignore the digest.
const STALE_DAYS = 7;          // untouched this long…
const DUE_SOON_DAYS = 14;      // …and due within this window → stale
const UNDATED_STALE_DAYS = 14; // no due date at all → a longer leash

/**
 * End-of-day 23:00 UTC (Mon-Fri) cron: sends overdue task
 * notifications to each assignee via TG DM, plus a summary to the ops
 * terminal chat. Also notifies assignees of stale tasks (no update in
 * 7+ days).
 *
 * [2026-07-08] Moved 00:00 → 23:00 UTC per Jdot: he wants the ping at the
 * *end* of the working day, not the start of the next one.
 *
 * [2026-07-06] Wired for the first time (audit follow-up): the route
 * existed since the tasks build but had no vercel.json entry AND
 * queried a nonexistent 'profiles' table, so it never ran and could
 * never have sent. Moved from /api/tasks/alerts to /api/cron/task-alerts
 * per cron conventions.
 *
 * Secured by CRON_SECRET header check (fail-closed).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Get all overdue tasks (due_date < today, not complete/paused)
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, short_id, task_name, assigned_to, assigned_to_name, due_date, description, latest_comment, priority, client_id, task_type, link')
      .lt('due_date', today)
      .not('status', 'in', '("complete","paused")');

    // 2. Get stale tasks — untouched AND actually at risk. See the
    //    threshold block at the top for why the deadline has to be part of
    //    this. The DB filter is only the cheap half (untouched at all);
    //    the deadline test runs below, since it is two different windows.
    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - STALE_DAYS);

    const dueSoonCutoff = new Date();
    dueSoonCutoff.setDate(dueSoonCutoff.getDate() + DUE_SOON_DAYS);
    const dueSoonDate = dueSoonCutoff.toISOString().split('T')[0];

    const undatedCutoff = new Date();
    undatedCutoff.setDate(undatedCutoff.getDate() - UNDATED_STALE_DAYS);

    const { data: staleCandidates } = await supabase
      .from('tasks')
      .select('id, short_id, task_name, assigned_to, assigned_to_name, due_date, description, latest_comment, priority, client_id, task_type, link, updated_at')
      .lt('updated_at', staleCutoff.toISOString())
      .not('status', 'in', '("complete","paused")');

    const staleTasks = (staleCandidates || []).filter(t => {
      // Already in the Overdue block. Reporting the same task twice in one
      // message is what made the digest look like it had duplicates.
      if (t.due_date && t.due_date < today) return false;

      // No deadline: nothing will ever force this, so drift IS the signal —
      // but on a longer leash so it isn't nagged about every single day.
      if (!t.due_date) return new Date(t.updated_at as string) < undatedCutoff;

      // Has a deadline: only stale once that deadline is actually close.
      return t.due_date <= dueSoonDate;
    });

    // 2b. Client names. A task line that says only "Send Button Invoice"
    //     makes the reader go and look up which client it is and what it was
    //     about; the row already knows, so say it.
    const clientIds = new Set<string>();
    for (const t of [...(overdueTasks ?? []), ...(staleTasks ?? [])] as any[]) {
      if (t.client_id) clientIds.add(t.client_id);
    }
    const clientNameById = new Map<string, string>();
    if (clientIds.size > 0) {
      const { data: clientRows } = await (supabase as any)
        .from('clients')
        .select('id, name')
        .in('id', Array.from(clientIds));
      for (const c of ((clientRows ?? []) as any[])) clientNameById.set(c.id, c.name);
    }

    // 3. Get user telegram IDs
    const userIds = new Set<string>();
    for (const t of overdueTasks || []) {
      if (t.assigned_to) userIds.add(t.assigned_to);
    }
    for (const t of staleTasks || []) {
      if (t.assigned_to) userIds.add(t.assigned_to);
    }

    // [2026-07-05 AUDIT-FIX] was querying 'profiles', a table that does
    // not exist in prod (verified via information_schema) — the lookup
    // silently returned null so no alert could ever send. The real user
    // table is 'users' (id, name, telegram_id all present). NOTE: this
    // route is currently unwired (no vercel.json cron, no UI caller).
    const { data: profiles } = await supabase
      .from('users')
      .select('id, name, telegram_id')
      .in('id', Array.from(userIds));

    const tgMap = new Map<string, string>();
    for (const p of profiles || []) {
      if (p.telegram_id) tgMap.set(p.id, p.telegram_id);
    }

    // 4. Group overdue tasks by user
    const overdueByUser = new Map<string, typeof overdueTasks>();
    for (const task of overdueTasks || []) {
      if (!task.assigned_to) continue;
      const existing = overdueByUser.get(task.assigned_to) || [];
      existing.push(task);
      overdueByUser.set(task.assigned_to, existing);
    }

    // 5. Group stale tasks by user
    const staleByUser = new Map<string, typeof staleTasks>();
    for (const task of staleTasks || []) {
      if (!task.assigned_to) continue;
      const existing = staleByUser.get(task.assigned_to) || [];
      existing.push(task);
      staleByUser.set(task.assigned_to, existing);
    }

    /** One task, rendered with enough context to act on without opening HQ.
     *
     *  [2026-08-28] Lines used to be the task name and a date. "Send Button
     *  Invoice — due 09/10/2026" tells you nothing about which client, what it
     *  is for, or what was last said about it, so the reader has to go and
     *  find all of that before deciding anything — and mostly doesn't.
     *
     *  The short_id leads because it is the handle: /done T-839 closes it from
     *  the same chat, so the alert carries its own action. */
    const renderTask = (t: any, tail: string): string => {
      const client = t.client_id ? clientNameById.get(t.client_id) : null;
      // 'General' is the default task_type and carries no information —
      // printing it just makes the line longer. Same for medium priority.
      const bits = [
        client,
        t.task_type && t.task_type !== 'General' ? t.task_type : null,
        t.priority && t.priority !== 'medium' ? t.priority : null,
      ].filter(Boolean).join(' · ');
      const head = `• <code>${t.short_id ?? '—'}</code> <b>${escapeHtml(t.task_name)}</b>`
        + (bits ? ` — ${escapeHtml(bits)}` : '')
        + ` — ${tail}`;
      // Latest comment first: it is the freshest statement of where the task
      // actually stands. Description is the fallback for a task nobody has
      // commented on, which is most of the stale ones by definition.
      const note = (t.latest_comment || t.description || '').replace(/\s+/g, ' ').trim();
      const noteLine = note ? `\n   ↳ <i>${escapeHtml(note.slice(0, 160))}${note.length > 160 ? '…' : ''}</i>` : '';
      const linkLine = t.link ? `\n   ↳ <a href="${escapeHtml(t.link)}">link</a>` : '';
      return head + noteLine + linkLine;
    };

    let notificationsSent = 0;

    // 6. Send notifications per user
    for (const userId of userIds) {
      const chatId = tgMap.get(userId);
      if (!chatId) continue;

      const userOverdue = overdueByUser.get(userId) || [];
      const userStale = staleByUser.get(userId) || [];

      if (userOverdue.length === 0 && userStale.length === 0) continue;

      let message = '';

      if (userOverdue.length > 0) {
        message += `⚠️ <b>Overdue Tasks (${userOverdue.length})</b>\n`;
        for (const t of userOverdue) {
          const daysOverdue = Math.ceil(
            (new Date().getTime() - new Date(t.due_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
          );
          message += renderTask(t, `due ${formatDate(t.due_date)} (<b>${daysOverdue}d overdue</b>)`) + '\n';
        }
        message += '\n';
      }

      if (userStale.length > 0) {
        message += `🕰 <b>Stale Tasks (${userStale.length})</b>\n`;
        for (const t of userStale) {
          const daysSinceUpdate = Math.ceil(
            (Date.now() - new Date(t.updated_at as string).getTime()) / (1000 * 60 * 60 * 24)
          );
          // [2026-08-28, Jdot] "no update in 23d" was the whole line, and it
          // reads as an accusation about a task that was created a month early
          // and correctly not started yet. The days since it was touched is
          // mostly the age of the row; the number that decides anything is how
          // long is left. So lead with the deadline and keep the idle count as
          // the aside it always was.
          if (!t.due_date) {
            message += renderTask(t, `no due date · <b>idle ${daysSinceUpdate}d</b>`) + '\n';
          } else {
            const daysLeft = Math.ceil(
              (new Date(t.due_date + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            message += renderTask(
              t,
              `due ${formatDate(t.due_date)} (<b>${daysLeft}d left</b>, not started)`,
            ) + '\n';
          }
        }
        message += '\n<i>Close from here: <code>/done T-000</code></i>\n';
      }

      try {
        await TelegramService.sendToChat(chatId, message, 'HTML');
        notificationsSent++;
      } catch (err) {
        console.error(`Failed to send TG alert to user ${userId}:`, err);
      }
    }

    // 7. Also send summary to ops chat
    const totalOverdue = overdueTasks?.length || 0;
    const totalStale = staleTasks.length;

    if (totalOverdue > 0 || totalStale > 0) {
      const summary = [
        `📋 <b>Daily Task Alert Summary</b>`,
        ``,
        `⚠️ Overdue tasks: <b>${totalOverdue}</b>`,
        `🕰 Stale tasks: <b>${totalStale}</b>`,
        `📨 Notifications sent: <b>${notificationsSent}</b>`,
      ].join('\n');

      try {
        await TelegramService.sendMessage(summary, 'HTML');
      } catch (err) {
        console.error('Failed to send ops summary:', err);
      }
    }

    // Log to agent_runs so cron-health-check can watch this sweep.
    await (supabase as any).from('agent_runs').insert({
      agent_name: 'TASK_ALERTS',
      run_type: 'cron',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'completed',
      output_summary: `${totalOverdue} overdue, ${totalStale} stale, ${notificationsSent} DMs sent`,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      overdueTasks: totalOverdue,
      staleTasks: totalStale,
      notificationsSent,
    });
  } catch (error: any) {
    console.error('Alert cron error:', error);
    await (supabase as any).from('agent_runs').insert({
      agent_name: 'TASK_ALERTS',
      run_type: 'cron',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'failed',
      error_message: error.message ?? 'unknown',
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
