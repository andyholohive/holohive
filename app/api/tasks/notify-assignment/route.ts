import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/notify-assignment
 *
 * Body: { task_id: string }
 *
 * Sends a Telegram DM to the task's current assignee letting them know
 * they've been assigned. Idempotent — uses tasks.last_assignee_notified_to
 * to skip if we've already notified the same person for the current
 * assignment, so re-saves of unrelated fields don't spam them.
 *
 * Called by the client (taskService) immediately after createTask /
 * updateTask / updateField when assigned_to is touched. Server-side
 * because the Telegram bot token must stay private.
 *
 * Auth: any authenticated user (anyone who can edit a task can trigger
 * a notification for it). The actual delivery uses the service-role
 * client so we can read users.telegram_id without RLS friction.
 */
export async function POST(request: Request) {
  // ── Auth (require a session, no role gate) ──────────────────────────
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {}, remove() {},
      },
    }
  );
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse + validate ────────────────────────────────────────────────
  const body = await request.json().catch(() => null);
  const taskId = body?.task_id;
  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  }

  // ── Use service role to read the joined user record + write back ────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Pull the task + the assignee's telegram + the actor's name (so the
  // DM can read "Andy assigned you a task" instead of just "you got a task").
  const { data: task, error: taskErr } = await (supabase as any)
    .from('tasks')
    .select('id, title, description, due_date, priority, assigned_to, last_assignee_notified_to, parent_task_id')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (!task.assigned_to) {
    return NextResponse.json({ ok: true, skipped: 'no assignee' });
  }

  // Dedupe — don't re-notify the same person if they were already DM'd
  // for this assignment. Reassigning to someone else clears the dedupe
  // automatically (since assigned_to changes).
  if (task.last_assignee_notified_to === task.assigned_to) {
    return NextResponse.json({ ok: true, skipped: 'already notified' });
  }

  // Check the global on/off via the reminder rule. Lets the user disable
  // task-assignment DMs from /reminders without us deploying code.
  const { data: rule } = await (supabase as any)
    .from('reminder_rules')
    .select('is_active')
    .eq('rule_type', 'task_assigned')
    .maybeSingle();
  if (rule && rule.is_active === false) {
    return NextResponse.json({ ok: true, skipped: 'task_assigned rule disabled' });
  }

  // Look up the assignee's telegram_id + name; also pull the actor's name.
  const { data: assignee } = await (supabase as any)
    .from('users')
    .select('id, name, telegram_id')
    .eq('id', task.assigned_to)
    .single();

  if (!assignee?.telegram_id) {
    return NextResponse.json({ ok: true, skipped: 'assignee has no telegram_id' });
  }

  const { data: actor } = await (supabase as any)
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single();

  // ── Build + send the DM ─────────────────────────────────────────────
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ? (process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
        ? process.env.NEXT_PUBLIC_BASE_URL
        : `https://${process.env.NEXT_PUBLIC_BASE_URL}`)
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  // Don't deep-link to a specific task page since /tasks doesn't yet
  // accept ?id=. The /tasks page itself is the right landing spot.
  const taskUrl = `${baseUrl}/tasks`;

  const safeTitle = escapeHtml(task.title || '(untitled task)');
  const dueLine = task.due_date
    ? `\n\u{1F4C5} <b>Due:</b> ${escapeHtml(new Date(task.due_date).toLocaleDateString())}`
    : '';
  const priorityLine = task.priority
    ? `\n\u{1F525} <b>Priority:</b> ${escapeHtml(String(task.priority))}`
    : '';
  const assignerLine = actor?.name
    ? ` by <b>${escapeHtml(actor.name)}</b>`
    : '';

  const message =
    `\u{1F4CB} <b>New task assigned to you</b>${assignerLine}\n` +
    `\n<b>${safeTitle}</b>` +
    dueLine +
    priorityLine +
    `\n\n\u{1F517} <a href="${taskUrl}">Open HQ</a>`;

  const sent = await TelegramService.sendToChat(assignee.telegram_id, message, 'HTML');

  if (!sent) {
    return NextResponse.json({ ok: false, error: 'Telegram send failed' }, { status: 502 });
  }

  // Mark as notified so the next save of unrelated fields doesn't re-DM.
  await (supabase as any)
    .from('tasks')
    .update({ last_assignee_notified_to: task.assigned_to })
    .eq('id', taskId);

  return NextResponse.json({ ok: true, notified: assignee.id });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
