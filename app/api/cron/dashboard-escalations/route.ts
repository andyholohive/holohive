/**
 * GET /api/cron/dashboard-escalations
 *
 * Daily 08:00 UTC sweep that surfaces the Priority Dashboard v2
 * escalations as a single Telegram message to the configured terminal
 * chat. Replaces the old Daily Standup Bot (killed per spec section 2.2).
 *
 * Five categories per Jdot's spec (Monday-form escalation removed
 * 2026-06-01 per the conversation:
 *
 *   1. Tasks ≥ overdue_red_days
 *   2. Active initiatives ≥ initiative_stale_red_days idle
 *   3. People with ≥ person_escalation_threshold overdue tasks
 *   4. Standard clients renewing in ≤ renewal_red_days
 *   2026-07-06 per Andy — 'remove monday form entirely from
 *   dashboard and notifications for now')
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
import { escapeHtml } from '@/lib/telegramHtml';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  // ─── Auth ───────────────────────────────────────────────────────────
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
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

  const runStart = Date.now();

  try {
    const cfg = await getDashboardConfig();

    // ─── Gather signals in parallel ───────────────────────────────────
    // Tasks: pull assigned_to (uuid) so we can DM the owner per TD §7.
    // Initiatives: pull owner_user_id so we can DM the owner per §7.1.
    // Users: pull telegram_id + role so we can resolve DMs and fall back
    //   to super_admins for "lead" targeting per §7.2/§7.3 (we don't have
    //   a per-client account-lead field; users.is_lead was dropped per
    //   Jdot's Q4 call).
    const [standardClients, openTasksRes, initiativesRes, usersRes] = await Promise.all([
      getStandardClients(sb),
      (sb as any)
        .from('tasks')
        .select('id, task_name, due_date, status, assigned_to, assigned_to_name')
        .neq('status', 'complete'),
      // Initiatives merged into specs (Plan A): promoted specs, active.
      (sb as any)
        .from('specs')
        .select('id, name, updated_at, owner_id')
        .eq('is_initiative', true)
        .eq('initiative_status', 'active'),
      (sb as any)
        .from('users')
        .select('id, name, role, telegram_id'),
    ]);
    const usersById = new Map<string, { name: string; role: string | null; telegram_id: string | null }>();
    const usersByName = new Map<string, { id: string; telegram_id: string | null }>();
    const leadRecipients: Array<{ id: string; name: string; telegram_id: string }> = [];
    for (const u of ((usersRes.data ?? []) as any[])) {
      usersById.set(u.id, { name: u.name, role: u.role, telegram_id: u.telegram_id });
      if (u.name) usersByName.set(u.name, { id: u.id, telegram_id: u.telegram_id });
      if (u.role === 'super_admin' && u.telegram_id) {
        leadRecipients.push({ id: u.id, name: u.name, telegram_id: u.telegram_id });
      }
    }

    // 1. Tasks past red threshold
    const openTasks = (openTasksRes.data ?? []) as any[];
    const redOverdueTasks = openTasks.filter(
      t => overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) === 'red',
    );
    // Per TD §7: yellow flag + DM to owner at ≥ 3d overdue (yellow
    // threshold). The existing red-bucket above is the spec's harder
    // tier; we use yellow here so owners hear earlier.
    const yellowOverdueTasks = openTasks.filter(
      t => overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) === 'yellow',
    );

    // 2. Stale initiatives
    const initiatives = ((initiativesRes.data ?? []) as any[]).map(i => ({
      ...i,
      owner_user_id: i.owner_id ?? null, // merged model: specs.owner_id
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
        const r = renewalToneFor(c.covered_through, cfg.renewal_red_days, cfg.renewal_amber_days);
        return { name: c.name, daysLeft: r.daysLeft, tone: r.tone };
      })
      .filter(r => r.tone === 'red')
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

    const findingsCount =
      redOverdueTasks.length +
      staleInitiatives.length +
      personEscalations.length +
      redRenewals.length;

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

    lines.push('Open dashboard → app.holohive.io/dashboard');

    const message = lines.join('\n');
    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
    const sent = dryRun ? false : await TelegramService.sendMessage(message);

    // ─── Per-target DMs per TD §7 ─────────────────────────────────────
    // Spec § 6 / § 2.2: "All escalations fire as TG direct messages,
    // never group posts." The summary above is kept for the terminal
    // chat (operational visibility), but the real escalations the spec
    // calls for are these per-recipient DMs:
    //
    //   §7   Task ≥ 3d overdue (yellow+) → DM the owner
    //   §7.1 Initiative ≥ 30d stale → DM the initiative owner
    //   §7.2 Person ≥ 5 overdue → DM each "lead" (super_admins for now;
    //        upgrade to a per-client account_lead_user_id when one is
    //        added per memory note on Jdot's Q4)
    //   §7.3 Renewal ≤ 14d → DM each lead
    //
    // Recipient resolution falls back gracefully: if a user has no
    // telegram_id, the DM is skipped silently (still flagged in the
    // summary above so it doesn't get lost).
    const dmResults: Array<{ kind: string; to: string; sent: boolean; error?: string }> = [];
    const tryDm = async (kind: string, name: string, telegramId: string | null, text: string) => {
      if (!telegramId) {
        dmResults.push({ kind, to: name, sent: false, error: 'no telegram_id' });
        return;
      }
      if (dryRun) {
        dmResults.push({ kind, to: name, sent: false, error: 'dry-run' });
        return;
      }
      try {
        const ok = await TelegramService.sendToChat(telegramId, text, 'HTML');
        dmResults.push({ kind, to: name, sent: ok });
      } catch (err: any) {
        dmResults.push({ kind, to: name, sent: false, error: err?.message ?? 'send failed' });
      }
    };
    // §7 — Task ≥ yellow threshold → owner DM. We hit yellow + red
    // together; an owner gets one DM per task they own, listing it.
    type OwnerEntry = { user?: { telegram_id: string | null }; name: string; tasks: any[] };
    const tasksByOwner = new Map<string, OwnerEntry>();
    for (const t of [...yellowOverdueTasks, ...redOverdueTasks]) {
      const owner = t.assigned_to ? usersById.get(t.assigned_to) : undefined;
      const ownerName = owner?.name ?? t.assigned_to_name ?? 'Unassigned';
      const key = t.assigned_to ?? ownerName;
      const entry: OwnerEntry = tasksByOwner.get(key) ?? {
        user: owner ? { telegram_id: owner.telegram_id } : undefined,
        name: ownerName,
        tasks: [],
      };
      entry.tasks.push(t);
      tasksByOwner.set(key, entry);
    }
    for (const [, entry] of tasksByOwner) {
      const taskList = entry.tasks.slice(0, 5).map(t => {
        const daysOver = t.due_date ? Math.max(0, Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86_400_000)) : 0;
        return `  • ${escapeHtml(t.task_name)} — ${daysOver}d overdue`;
      }).join('\n');
      const more = entry.tasks.length > 5 ? `\n  • …and ${entry.tasks.length - 5} more` : '';
      const text =
        `⏰ <b>${entry.tasks.length} overdue task${entry.tasks.length === 1 ? '' : 's'}</b>\n` +
        `${taskList}${more}\n\n` +
        `<a href="https://app.holohive.io/tasks?status=overdue">Open in HQ</a>`;
      await tryDm('task_overdue', entry.name, entry.user?.telegram_id ?? null, text);
    }
    // §7.1 — Stale initiative → owner DM.
    for (const init of staleInitiatives) {
      const owner = init.owner_user_id ? usersById.get(init.owner_user_id) : undefined;
      if (!owner) {
        dmResults.push({ kind: 'initiative_stale', to: init.name, sent: false, error: 'no owner_user_id' });
        continue;
      }
      const text =
        `🧭 <b>${escapeHtml(init.name)}</b>\n` +
        `Stale for ${init.daysIdle} days — past the ${cfg.initiative_stale_red_days}-day threshold.\n\n` +
        `<a href="https://app.holohive.io/initiatives">Open in HHP</a>`;
      await tryDm('initiative_stale', owner.name, owner.telegram_id, text);
    }
    // §7.2 — Person with ≥ N overdue → DM each lead (NOT the person).
    if (personEscalations.length && leadRecipients.length) {
      const list = personEscalations.slice(0, 5).map(p => `  • ${escapeHtml(p.name)} — ${p.count} overdue`).join('\n');
      const more = personEscalations.length > 5 ? `\n  • …and ${personEscalations.length - 5} more` : '';
      const text =
        `🔥 <b>Person escalations (${personEscalations.length})</b>\n` +
        `Each person below has ≥ ${cfg.person_escalation_threshold} overdue tasks:\n${list}${more}\n\n` +
        `<a href="https://app.holohive.io/dashboard#workload">Open Workload</a>`;
      for (const lead of leadRecipients) {
        await tryDm('person_escalation', lead.name, lead.telegram_id, text);
      }
    }
    // §7.3 — Renewals in red zone → DM each lead.
    if (redRenewals.length && leadRecipients.length) {
      const list = redRenewals.slice(0, 5).map(r => {
        const days = r.daysLeft === null ? 'no end date' : r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d`;
        return `  • ${escapeHtml(r.name)} — ${days}`;
      }).join('\n');
      const more = redRenewals.length > 5 ? `\n  • …and ${redRenewals.length - 5} more` : '';
      const text =
        `📅 <b>Renewals · red zone (${redRenewals.length})</b>\n` +
        `Within ${cfg.renewal_red_days} days of expiry:\n${list}${more}\n\n` +
        `<a href="https://app.holohive.io/dashboard?tab=renewals">Open Renewals</a>`;
      for (const lead of leadRecipients) {
        await tryDm('renewal_red', lead.name, lead.telegram_id, text);
      }
    }
    const dmSent = dmResults.filter(d => d.sent).length;
    const dmSkipped = dmResults.filter(d => !d.sent).length;

    // agent_runs log for cron-health-check coverage.
    try {
      await (sb as any).from('agent_runs').insert({
        agent_name: 'DASHBOARD_ESCALATIONS',
        run_type: 'cron',
        started_at: new Date(runStart).toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `${findingsCount} finding(s); ${dmSent} DM(s) sent, ${dmSkipped} skipped.`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({
      sentMessage: sent,
      findings: findingsCount,
      summary: {
        redOverdueTasks: redOverdueTasks.length,
        yellowOverdueTasks: yellowOverdueTasks.length,
        staleInitiatives: staleInitiatives.length,
        personEscalations: personEscalations.length,
        redRenewals: redRenewals.length,
      },
      dms: {
        sent: dmSent,
        skipped: dmSkipped,
        breakdown: dmResults,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'escalation sweep failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}

