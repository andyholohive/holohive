/**
 * GET /api/cron/dashboard-escalations
 *
 * Daily 08:00 UTC sweep that surfaces the Priority Dashboard v2
 * escalations as a single Telegram message to the configured terminal
 * chat. Replaces the old Daily Standup Bot (killed per spec section 2.2).
 *
 * Five categories per Jdot's spec, plus one new (Monday form) added
 * 2026-06-01 per the conversation:
 *
 *   1. Tasks ≥ overdue_red_days
 *   2. Active initiatives ≥ initiative_stale_red_days idle
 *   3. People with ≥ person_escalation_threshold overdue tasks
 *   4. Standard clients renewing in ≤ renewal_red_days
 *   5. Monday Form: team members not submitted by deadline
 *
 * Healthy days send nothing — keeps the channel quiet so the alert
 * means something when it fires. Same pattern as cron-health-check.
 *
 * Auth: Bearer ${CRON_SECRET}. Same as every other cron.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { getDashboardConfig } from '@/lib/dashboard/config';
import { getStandardClients, renewalToneFor, overdueToneFor } from '@/lib/dashboard/queries';
import { getMondayFormStatus } from '@/lib/dashboard/monday-form';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  // ─── Auth ───────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'missing supabase config' }, { status: 500 });
  }
  const sb = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const cfg = await getDashboardConfig();

    // ─── Gather signals in parallel ───────────────────────────────────
    const [standardClients, openTasksRes, initiativesRes, mondayStatus] = await Promise.all([
      getStandardClients(sb),
      (sb as any)
        .from('tasks')
        .select('id, task_name, due_date, status, assigned_to_name')
        .neq('status', 'complete'),
      (sb as any)
        .from('initiatives')
        .select('id, name, updated_at')
        .eq('status', 'active')
        .is('deleted_at', null),
      getMondayFormStatus(sb, cfg.form_deadline_hour_utc),
    ]);

    // 1. Tasks past red threshold
    const openTasks = (openTasksRes.data ?? []) as any[];
    const redOverdueTasks = openTasks.filter(
      t => overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) === 'red',
    );

    // 2. Stale initiatives
    const initiatives = ((initiativesRes.data ?? []) as any[]).map(i => ({
      ...i,
      daysIdle: i.updated_at ? Math.floor((Date.now() - new Date(i.updated_at).getTime()) / 86_400_000) : 999,
    }));
    const staleInitiatives = initiatives.filter(i => i.daysIdle >= cfg.initiative_stale_red_days);

    // 3. Per-person overdue counts → escalations
    const overdueByPerson = new Map<string, number>();
    for (const t of openTasks) {
      if (overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) === 'none') continue;
      const name = t.assigned_to_name || 'Unassigned';
      overdueByPerson.set(name, (overdueByPerson.get(name) ?? 0) + 1);
    }
    const personEscalations = Array.from(overdueByPerson.entries())
      .filter(([, n]) => n >= cfg.person_escalation_threshold)
      .map(([name, n]) => ({ name, count: n }))
      .sort((a, b) => b.count - a.count);

    // 4. Renewals in the red window
    const redRenewals = standardClients
      .map(c => {
        const r = renewalToneFor(c.engagement_end_date, cfg.renewal_red_days, cfg.renewal_amber_days);
        return { name: c.name, daysLeft: r.daysLeft, tone: r.tone };
      })
      .filter(r => r.tone === 'red')
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

    // 5. Monday form: only escalate if deadline passed AND someone hasn't submitted
    const mondayMisses = mondayStatus.deadlinePassed
      ? mondayStatus.entries.filter(e => !e.submitted)
      : [];

    const findingsCount =
      redOverdueTasks.length +
      staleInitiatives.length +
      personEscalations.length +
      redRenewals.length +
      mondayMisses.length;

    // ─── Healthy day? Stay quiet. ─────────────────────────────────────
    if (findingsCount === 0) {
      return NextResponse.json({
        sentMessage: false,
        findings: 0,
        reason: 'nothing to escalate',
      });
    }

    // ─── Build message ────────────────────────────────────────────────
    const lines: string[] = [];
    lines.push('🚨 <b>Priority Dashboard escalations</b>');
    lines.push(`<i>${new Date().toISOString().slice(0, 10)} · ${findingsCount} finding(s)</i>`);
    lines.push('');

    if (redRenewals.length) {
      lines.push(`📅 <b>Renewals · red zone (${redRenewals.length})</b>`);
      for (const r of redRenewals.slice(0, 5)) {
        const days = r.daysLeft === null ? 'no end date' : r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d`;
        lines.push(`  • ${escapeHtml(r.name)} — ${days}`);
      }
      if (redRenewals.length > 5) lines.push(`  • …and ${redRenewals.length - 5} more`);
      lines.push('');
    }

    if (personEscalations.length) {
      lines.push(`🔥 <b>Person escalations (${personEscalations.length})</b>`);
      for (const p of personEscalations.slice(0, 5)) {
        lines.push(`  • ${escapeHtml(p.name)} — ${p.count} overdue (≥ ${cfg.person_escalation_threshold} threshold)`);
      }
      lines.push('');
    }

    if (redOverdueTasks.length) {
      lines.push(`⏰ <b>Tasks ≥ ${cfg.overdue_red_days}d overdue (${redOverdueTasks.length})</b>`);
      for (const t of redOverdueTasks.slice(0, 5)) {
        lines.push(`  • ${escapeHtml(t.task_name)} (${escapeHtml(t.assigned_to_name ?? 'unassigned')})`);
      }
      if (redOverdueTasks.length > 5) lines.push(`  • …and ${redOverdueTasks.length - 5} more`);
      lines.push('');
    }

    if (staleInitiatives.length) {
      lines.push(`🧭 <b>Stale initiatives ≥ ${cfg.initiative_stale_red_days}d (${staleInitiatives.length})</b>`);
      for (const i of staleInitiatives.slice(0, 5)) {
        lines.push(`  • ${escapeHtml(i.name)} — ${i.daysIdle}d idle`);
      }
      lines.push('');
    }

    if (mondayMisses.length) {
      lines.push(`📝 <b>Monday form · ${mondayMisses.length} not submitted</b>`);
      for (const m of mondayMisses) {
        lines.push(`  • ${escapeHtml(m.name)}`);
      }
      lines.push('');
    }

    lines.push('Open dashboard → app.holohive.io/dashboard');

    const message = lines.join('\n');
    const sent = await TelegramService.sendMessage(message);

    return NextResponse.json({
      sentMessage: sent,
      findings: findingsCount,
      summary: {
        redOverdueTasks: redOverdueTasks.length,
        staleInitiatives: staleInitiatives.length,
        personEscalations: personEscalations.length,
        redRenewals: redRenewals.length,
        mondayMisses: mondayMisses.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'escalation sweep failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
