import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/task-completions-eod — daily 09:00 UTC (18:00 KST).
 *
 * One line to HH Ops › HQ listing every task completed in the last 24h,
 * grouped by who closed it. Replaces the per-task "→ complete" ping that
 * /api/tasks/notify-changed used to send: 69 of the last 99 pings in that
 * topic were completions [Jdot, 2026-11-13]. Same destination as the live
 * pings (the task_changed reminder rule), so turning that rule off silences
 * both.
 *
 * Quiet day → nothing posted. Auth: Bearer ${CRON_SECRET}.
 */
const WINDOW_HOURS = 24;
const MAX_LISTED = 12;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if ((request.headers.get('authorization') || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any;
  const runStart = Date.now();
  const log = async (status: 'success' | 'failed', summary: string) => {
    try {
      await sb.from('agent_runs').insert({
        agent_name: 'TASK_COMPLETIONS_EOD', run_type: 'cron',
        started_at: new Date(runStart).toISOString(), completed_at: new Date().toISOString(),
        status, output_summary: summary, error_message: status === 'failed' ? summary : null,
      });
    } catch { /* never fail the cron on its own log */ }
  };

  try {
    const since = new Date(runStart - WINDOW_HOURS * 3600_000).toISOString();
    const [{ data: rule }, { data: done }] = await Promise.all([
      sb.from('reminder_rules')
        .select('telegram_chat_id, telegram_thread_id, is_active')
        .eq('rule_type', 'task_changed').maybeSingle(),
      sb.from('tasks')
        .select('short_id, task_name, assigned_to_name, completed_at')
        .eq('status', 'complete').gte('completed_at', since)
        .order('completed_at', { ascending: true }),
    ]);

    const tasks = (done ?? []) as Array<{ short_id: string | null; task_name: string | null; assigned_to_name: string | null; completed_at: string }>;
    if (tasks.length === 0) {
      await log('success', 'quiet day — no completions in the last 24h.');
      return NextResponse.json({ posted: false, reason: 'no completions' });
    }
    if (!rule || rule.is_active === false || !rule.telegram_chat_id || rule.telegram_chat_id === 'PLACEHOLDER_CHAT_ID') {
      await log('success', `${tasks.length} completion(s), not posted — task_changed rule is off or has no chat.`);
      return NextResponse.json({ posted: false, reason: 'task_changed rule disabled or unconfigured', count: tasks.length });
    }

    // Group by closer so the line reads "Quazo (3), Jaymz (2)" at a glance.
    const byPerson = new Map<string, number>();
    for (const t of tasks) {
      const who = t.assigned_to_name || 'Unassigned';
      byPerson.set(who, (byPerson.get(who) ?? 0) + 1);
    }
    const whoLine = Array.from(byPerson.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `${escapeHtml(name)} (${n})`)
      .join(' · ');

    const lines = [
      `✅ <b>${tasks.length} task${tasks.length === 1 ? '' : 's'} completed today</b> — ${whoLine}`,
      ...tasks.slice(0, MAX_LISTED).map(t =>
        `• ${t.short_id ? `${escapeHtml(t.short_id)} ` : ''}${escapeHtml(t.task_name || '(untitled)')}${t.assigned_to_name ? ` — ${escapeHtml(t.assigned_to_name)}` : ''}`),
    ];
    if (tasks.length > MAX_LISTED) lines.push(`  …and ${tasks.length - MAX_LISTED} more`);
    const message = lines.join('\n');

    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
    if (dryRun) {
      await log('success', `DRY RUN: ${tasks.length} completion(s).\n\n${message}`);
      return NextResponse.json({ posted: false, dryRun: true, preview: message });
    }
    let posted = false; let sendError: string | null = null;
    try { posted = await TelegramService.sendToChat(rule.telegram_chat_id, message, 'HTML', rule.telegram_thread_id ?? undefined); }
    catch (e: any) { sendError = e?.message ?? 'send threw'; }
    await log(posted ? 'success' : 'failed', posted
      ? `${tasks.length} completion(s) posted to ${rule.telegram_chat_id}${rule.telegram_thread_id ? `/${rule.telegram_thread_id}` : ''}.`
      : `${tasks.length} completion(s) — Telegram post FAILED${sendError ? `: ${sendError}` : ''}.`);
    return NextResponse.json({ posted, count: tasks.length });
  } catch (err: any) {
    await log('failed', err?.message ?? 'task-completions-eod crashed');
    return NextResponse.json({ error: 'task-completions-eod failed', detail: err?.message }, { status: 500 });
  }
}
