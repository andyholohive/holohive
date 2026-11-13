/**
 * Priority Dashboard red zone — the four escalation signals, computed once
 * so the morning digest can print them.
 *
 * [2026-11-13, Jdot] This used to be its own cron (dashboard-escalations,
 * 08:00 UTC) posting a group message AND a DM per owner, ninety minutes
 * after the Needs Attention digest had posted off the same dashboard. Two
 * daily posts plus DMs for one set of facts. Now the red zone is a block at
 * the top of the single Needs Attention digest, and nothing is DM'd.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDashboardConfig, type DashboardConfig } from '@/lib/dashboard/config';
import { getStandardClients, renewalToneFor, overdueToneFor } from '@/lib/dashboard/queries';
import { escapeHtml } from '@/lib/telegramHtml';

export interface RedZone {
  cfg: DashboardConfig;
  redRenewals: Array<{ name: string; daysLeft: number | null }>;
  personEscalations: Array<{ name: string; count: number }>;
  redOverdueTasks: Array<{ task_name: string; assigned_to_name: string | null }>;
  staleInitiatives: Array<{ name: string; daysIdle: number }>;
  count: number;
}

export async function loadRedZone(sb: SupabaseClient): Promise<RedZone> {
  const cfg = await getDashboardConfig();
  const [standardClients, openTasksRes, initiativesRes] = await Promise.all([
    getStandardClients(sb),
    (sb as any).from('tasks')
      .select('id, task_name, due_date, status, assigned_to_name')
      .neq('status', 'complete'),
    (sb as any).from('specs')
      .select('id, name, updated_at')
      .eq('is_initiative', true)
      .eq('initiative_status', 'active'),
  ]);

  const openTasks = (openTasksRes.data ?? []) as any[];
  const tone = (t: any) => overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days);
  const redOverdueTasks = openTasks.filter(t => tone(t) === 'red');

  const overdueByPerson = new Map<string, number>();
  for (const t of openTasks) {
    if (tone(t) === 'none') continue;
    const name = t.assigned_to_name || 'Unassigned';
    overdueByPerson.set(name, (overdueByPerson.get(name) ?? 0) + 1);
  }
  const personEscalations = Array.from(overdueByPerson.entries())
    .filter(([, n]) => n >= cfg.person_escalation_threshold)
    .map(([name, n]) => ({ name, count: n }))
    .sort((a, b) => b.count - a.count);

  const staleInitiatives = ((initiativesRes.data ?? []) as any[])
    .map(i => ({
      name: i.name as string,
      daysIdle: i.updated_at ? Math.floor((Date.now() - new Date(i.updated_at).getTime()) / 86_400_000) : 999,
    }))
    .filter(i => i.daysIdle >= cfg.initiative_stale_red_days);

  const redRenewals = standardClients
    .map(c => ({ name: c.name, ...renewalToneFor(c.covered_through, cfg.renewal_red_days, cfg.renewal_amber_days) }))
    .filter(r => r.tone === 'red')
    .map(r => ({ name: r.name, daysLeft: r.daysLeft }))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  return {
    cfg, redRenewals, personEscalations, redOverdueTasks, staleInitiatives,
    count: redRenewals.length + personEscalations.length + redOverdueTasks.length + staleInitiatives.length,
  };
}

const MAX = 5;

/** The red-zone block for the digest: empty array when there is nothing red. */
export function renderRedZone(z: RedZone): string[] {
  if (z.count === 0) return [];
  const lines: string[] = [`🚨 <b>Red zone</b> — ${z.count} escalation${z.count === 1 ? '' : 's'}`];
  const more = (n: number) => (n > MAX ? [`  …and ${n - MAX} more`] : []);

  if (z.redRenewals.length) {
    lines.push(`📅 Renewals (${z.redRenewals.length})`);
    for (const r of z.redRenewals.slice(0, MAX)) {
      const days = r.daysLeft === null ? 'no end date' : r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d left`;
      lines.push(`  • ${escapeHtml(r.name)} — ${days}`);
    }
    lines.push(...more(z.redRenewals.length));
  }
  if (z.personEscalations.length) {
    lines.push(`🔥 People with ≥ ${z.cfg.person_escalation_threshold} overdue (${z.personEscalations.length})`);
    for (const p of z.personEscalations.slice(0, MAX)) lines.push(`  • ${escapeHtml(p.name)} — ${p.count} overdue`);
    lines.push(...more(z.personEscalations.length));
  }
  if (z.redOverdueTasks.length) {
    lines.push(`⏰ Tasks ≥ ${z.cfg.overdue_red_days}d overdue (${z.redOverdueTasks.length})`);
    for (const t of z.redOverdueTasks.slice(0, MAX)) {
      lines.push(`  • ${escapeHtml(t.task_name)} (${escapeHtml(t.assigned_to_name ?? 'unassigned')})`);
    }
    lines.push(...more(z.redOverdueTasks.length));
  }
  if (z.staleInitiatives.length) {
    lines.push(`🧭 Stale initiatives ≥ ${z.cfg.initiative_stale_red_days}d (${z.staleInitiatives.length})`);
    for (const i of z.staleInitiatives.slice(0, MAX)) lines.push(`  • ${escapeHtml(i.name)} — ${i.daysIdle}d idle`);
    lines.push(...more(z.staleInitiatives.length));
  }
  return lines;
}
