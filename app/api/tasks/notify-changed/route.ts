import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/notify-changed
 *
 * Body: {
 *   task_id: string,
 *   changes: { status?, due_date?, assigned_to? },
 *   prev:    { status?, due_date?, assigned_to? },
 * }
 *
 * Auto-shift announcer for the team's "what moved today" Telegram chat.
 * Fires once per save from `taskService.updateTask` / `updateField` when
 * any of the three visibility fields (status / due_date / assigned_to)
 * actually change. Composes a single human-readable diff message and
 * posts it to the chat configured on the `task_changed` reminder rule —
 * the same /reminders UI controls whether announcements go out at all
 * (toggle is_active=false to silence without a deploy).
 *
 * Why a separate endpoint from notify-assignment:
 *   - Different audience: notify-assignment DMs the new assignee; this
 *     posts to a shared chat for everyone watching shifts.
 *   - Different dedupe model: notify-assignment is per-task-per-assignee
 *     (don't re-DM the same person). This is per-actual-change-diff —
 *     the client only calls us when prev != next, so we don't need
 *     server-side dedupe state.
 *   - notify-assignment intentionally stays as-is to preserve the
 *     last_assignee_notified_to dedupe semantics.
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
  const taskId: string | undefined = body?.task_id;
  const changes = (body?.changes || {}) as { status?: string | null; due_date?: string | null; assigned_to?: string | null };
  const prev = (body?.prev || {}) as { status?: string | null; due_date?: string | null; assigned_to?: string | null };

  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  }
  if (!changes || Object.keys(changes).length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no changes' });
  }

  // ── Service-role client for cross-table reads ───────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Read the rule first — if it's missing or disabled we can short-
  // circuit before doing any joins. Stored telegram_chat_id is the
  // destination chat (placeholder by default; user fills in real one
  // from /reminders).
  const { data: rule } = await (supabase as any)
    .from('reminder_rules')
    .select('telegram_chat_id, telegram_thread_id, is_active')
    .eq('rule_type', 'task_changed')
    .maybeSingle();

  if (!rule) {
    return NextResponse.json({ ok: true, skipped: 'no task_changed rule' });
  }
  if (rule.is_active === false) {
    return NextResponse.json({ ok: true, skipped: 'task_changed rule disabled' });
  }
  if (!rule.telegram_chat_id || rule.telegram_chat_id === 'PLACEHOLDER_CHAT_ID') {
    return NextResponse.json({ ok: true, skipped: 'task_changed chat_id not configured' });
  }

  // Pull the task — need short_id, task_name for the message header,
  // assigned_to to resolve the new assignee's display name.
  const { data: task, error: taskErr } = await (supabase as any)
    .from('tasks')
    .select('id, short_id, task_name, assigned_to')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Collect the user IDs we need to resolve to names in one round-trip.
  // assigned_to (next + prev) and the actor (who saved the change) all
  // come from the same users table.
  const userIds = new Set<string>();
  if (task.assigned_to) userIds.add(task.assigned_to);
  if (changes.assigned_to) userIds.add(changes.assigned_to);
  if (prev.assigned_to) userIds.add(prev.assigned_to);
  userIds.add(user.id);

  const { data: people } = await (supabase as any)
    .from('users')
    .select('id, name')
    .in('id', Array.from(userIds));
  const nameById = new Map<string, string>(
    ((people || []) as Array<{ id: string; name: string | null }>).map(u => [u.id, u.name || 'unknown']),
  );
  const actorName = nameById.get(user.id) || 'someone';

  // ── Build the diff message ──────────────────────────────────────────
  const lines: string[] = [];
  if ('status' in changes) {
    lines.push(`<b>Status:</b> ${escapeHtml(formatStatus(prev.status))} → ${escapeHtml(formatStatus(changes.status))}`);
  }
  if ('due_date' in changes) {
    lines.push(`<b>Due:</b> ${escapeHtml(formatDate(prev.due_date))} → ${escapeHtml(formatDate(changes.due_date))}`);
  }
  if ('assigned_to' in changes) {
    const prevName = prev.assigned_to ? (nameById.get(prev.assigned_to) || 'unknown') : 'unassigned';
    const nextName = changes.assigned_to ? (nameById.get(changes.assigned_to) || 'unknown') : 'unassigned';
    lines.push(`<b>Assignee:</b> ${escapeHtml(prevName)} → ${escapeHtml(nextName)}`);
  }

  if (lines.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no diff lines' });
  }

  const idLabel = task.short_id ? `${task.short_id} ` : '';
  const header = `\u{1F504} <b>${escapeHtml(`${idLabel}${task.task_name || '(untitled task)'}`)}</b>`;
  const footer = `\n<i>by ${escapeHtml(actorName)}</i>`;

  const message = `${header}\n${lines.join('\n')}${footer}`;

  const sent = await TelegramService.sendToChat(
    rule.telegram_chat_id,
    message,
    'HTML',
    rule.telegram_thread_id ?? undefined,
  );

  if (!sent) {
    return NextResponse.json({ ok: false, error: 'Telegram send failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatStatus(s: string | null | undefined): string {
  if (!s) return 'none';
  // Replace underscores so 'in_progress' reads as 'in progress' in chat.
  return s.replace(/_/g, ' ');
}

function formatDate(d: string | null | undefined): string {
  if (!d) return 'none';
  // Stored as YYYY-MM-DD (date column) or full ISO. Slice handles both —
  // avoids timezone shifts that toLocaleDateString() introduces when the
  // column is a bare date string.
  const dateOnly = d.length >= 10 ? d.slice(0, 10) : d;
  const parsed = new Date(`${dateOnly}T00:00:00`);
  if (isNaN(parsed.getTime())) return dateOnly;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
