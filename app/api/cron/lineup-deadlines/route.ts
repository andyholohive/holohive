import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';
import { getTemplate, renderTemplate } from '@/lib/messageTemplates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/lineup-deadlines
 *
 * [2026-07-06] Per Andy — weekly lineup deadline reminders, all posted
 * to the chat configured in /admin/telegram-comm
 * (app_settings.lineup_reminder_chat_id + _thread_id):
 *
 *   • Friday 12:00 UTC  — NEXT week's lineup not yet proposed
 *   • Monday 12:00 UTC  — THIS week's lineup not yet approved (confirmed)
 *   • Thursday 12:00 UTC — THIS week's confirmed lineup has slots not
 *     yet posted (slots flip via lib/lineupSlotSync when content lands)
 *
 * Which check runs is derived from the UTC day-of-week, so vercel.json
 * registers this path three times (Fri/Mon/Thu at 12:00). Campaigns in
 * scope: Active, not archived, client active, AND with lineup activity
 * in the last 3 weeks — a campaign that never uses lineups is never
 * nagged. Quiet when everything is on track.
 *
 * Auth: Bearer ${CRON_SECRET} (fail-closed). Logs to agent_runs as
 * LINEUP_DEADLINES for the cron-health-check sweep.
 */

/** Monday (YYYY-MM-DD, UTC) of the week containing `d`. */
function mondayOf(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return m.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const start = Date.now();

  const logRun = async (status: 'completed' | 'failed', summary: string) => {
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'LINEUP_DEADLINES',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status,
        output_summary: summary,
      });
    } catch { /* swallow */ }
  };

  try {
    const now = new Date();
    // Which check today? Non-scheduled days (manual invocation) no-op.
    const dow = now.getUTCDay(); // 1=Mon, 4=Thu, 5=Fri
    const check = dow === 5 ? 'proposal' : dow === 1 ? 'approval' : dow === 4 ? 'posted' : null;
    if (!check) {
      await logRun('completed', `No check scheduled for UTC day ${dow}; no-op.`);
      return NextResponse.json({ ok: true, skipped: true, reason: `No check for UTC day ${dow}.` });
    }

    // Destination — configured in /admin/telegram-comm.
    const [chatSetting, threadSetting] = await Promise.all([
      (supabase as any).from('app_settings').select('value').eq('key', 'lineup_reminder_chat_id').maybeSingle(),
      (supabase as any).from('app_settings').select('value').eq('key', 'lineup_reminder_chat_thread_id').maybeSingle(),
    ]);
    const chatId = (chatSetting.data as any)?.value as string | undefined;
    const threadIdRaw = (threadSetting.data as any)?.value as string | undefined;
    if (!chatId) {
      await logRun('completed', 'lineup_reminder_chat_id not configured; skipped.');
      return NextResponse.json({
        ok: true, skipped: true,
        reason: 'No reminder chat configured. Set it in /admin/telegram-comm → Lineup Deadline Reminders.',
      });
    }
    const threadId = threadIdRaw ? parseInt(threadIdRaw, 10) : undefined;

    // Campaigns in scope: Active + not archived + client active + lineup
    // activity in the last 3 weeks.
    const threeWeeksAgo = new Date(now.getTime() - 21 * 86_400_000).toISOString().slice(0, 10);
    const { data: campaigns } = await (supabase as any)
      .from('campaigns')
      .select('id, name, status, archived_at, is_test, client_id, client:clients(is_active, is_ad_hoc)')
      .eq('status', 'Active')
      .is('archived_at', null);
    // [2026-07-21 per Andy] Also exclude PAUSED clients — same derivation
    // as /clients: active + not ad-hoc + engagement coverage lapsed
    // (max client_coverage.covered_through missing or before today).
    const clientIdsForCoverage = [...new Set(((campaigns as any[]) ?? []).map(c => c.client_id).filter(Boolean))];
    const coveredThroughByClient = new Map<string, string>();
    if (clientIdsForCoverage.length > 0) {
      const { data: coverage } = await (supabase as any)
        .from('client_coverage')
        .select('client_id, covered_through')
        .in('client_id', clientIdsForCoverage);
      for (const row of ((coverage as any[]) ?? [])) {
        if (!row.covered_through) continue;
        const prev = coveredThroughByClient.get(row.client_id);
        if (!prev || row.covered_through > prev) coveredThroughByClient.set(row.client_id, row.covered_through);
      }
    }
    const todayIso = now.toISOString().slice(0, 10);
    const isClientPaused = (c: any) => {
      if (c.client?.is_active === false) return false; // inactive handled separately
      if (c.client?.is_ad_hoc) return false;           // ad-hoc clients have no coverage by design
      const covered = c.client_id ? coveredThroughByClient.get(c.client_id) : undefined;
      return !covered || covered < todayIso;
    };
    // Exclude test campaigns (is_test) — they should never nag the team. Filter
    // in JS (not .neq) so real campaigns with a null is_test aren't dropped too.
    const activeCampaigns = ((campaigns as any[]) ?? [])
      .filter(c => c.client?.is_active !== false && c.is_test !== true && !isClientPaused(c));
    const campaignIds = activeCampaigns.map(c => c.id);
    if (campaignIds.length === 0) {
      await logRun('completed', 'No active campaigns.');
      return NextResponse.json({ ok: true, findings: 0 });
    }

    const { data: recentLineups } = await (supabase as any)
      .from('campaign_lineups')
      .select('id, campaign_id, week_of, status')
      .in('campaign_id', campaignIds)
      .gte('week_of', threeWeeksAgo);
    const lineupsByCampaign = new Map<string, Array<{ id: string; week_of: string; status: string }>>();
    for (const l of ((recentLineups as any[]) ?? [])) {
      const list = lineupsByCampaign.get(l.campaign_id) ?? [];
      list.push(l);
      lineupsByCampaign.set(l.campaign_id, list);
    }
    // Only campaigns that actually use lineups get policed.
    const inScope = activeCampaigns.filter(c => (lineupsByCampaign.get(c.id) ?? []).length > 0);

    const thisMonday = mondayOf(now);
    const nextMonday = mondayOf(new Date(now.getTime() + 7 * 86_400_000));

    const offenders: string[] = [];

    // Header line is template-driven per check — editable on
    // /admin/telegram-comm; the offender list below stays generated.
    const templateKey = check === 'proposal'
      ? 'tmpl_lineup_reminder_friday' as const
      : check === 'approval'
        ? 'tmpl_lineup_reminder_monday' as const
        : 'tmpl_lineup_reminder_thursday' as const;
    const header = renderTemplate(await getTemplate(supabase, templateKey), {
      week: check === 'proposal' ? nextMonday : thisMonday,
    });

    if (check === 'proposal') {
      // Friday: next week's lineup should at least be proposed by now.
      for (const c of inScope) {
        const next = (lineupsByCampaign.get(c.id) ?? []).find(l => l.week_of === nextMonday);
        if (!next || next.status === 'draft') {
          offenders.push(`  • ${escapeHtml(c.name)}${next ? ' (still draft)' : ' (no lineup)'}`);
        }
      }
    } else if (check === 'approval') {
      // Monday: this week's lineup should be confirmed by now.
      for (const c of inScope) {
        const cur = (lineupsByCampaign.get(c.id) ?? []).find(l => l.week_of === thisMonday);
        if (!cur || cur.status === 'draft' || cur.status === 'proposed') {
          const state = !cur ? 'no lineup' : cur.status === 'draft' ? 'still draft' : 'awaiting approval';
          offenders.push(`  • ${escapeHtml(c.name)} (${state})`);
        }
      }
    } else {
      // Thursday: this week's confirmed lineup should be fully posted.
      for (const c of inScope) {
        const cur = (lineupsByCampaign.get(c.id) ?? []).find(
          l => l.week_of === thisMonday && (l.status === 'confirmed' || l.status === 'completed'),
        );
        if (!cur) continue; // Monday check already covered un-approved lineups
        const { data: pendingSlots } = await (supabase as any)
          .from('lineup_slots')
          .select('id, status, kol:master_kols(name), angle:lineup_angles!inner(lineup_id)')
          .eq('angle.lineup_id', cur.id)
          .neq('status', 'posted');
        const pending = ((pendingSlots as any[]) ?? []);
        if (pending.length > 0) {
          const names = pending.map(s => s.kol?.name).filter(Boolean).slice(0, 8).join(', ');
          // KOL names on their own line under the client for readability.
          offenders.push(`  • ${escapeHtml(c.name)} — ${pending.length} not posted${names ? `\n${escapeHtml(names)}` : ''}`);
        }
      }
    }

    if (offenders.length === 0) {
      await logRun('completed', `${check} check: all clear (${inScope.length} campaign(s) in scope).`);
      return NextResponse.json({ ok: true, check, findings: 0, inScope: inScope.length });
    }

    // Blank line between the header and each client block for scanability.
    const message = `${header}\n\n${offenders.join('\n\n')}`;
    const sent = await TelegramService.sendToChat(chatId, message, 'HTML', threadId);

    await logRun('completed', `${check} check: ${offenders.length} finding(s), ping ${sent ? 'sent' : 'FAILED'}.`);
    return NextResponse.json({ ok: sent, check, findings: offenders.length });
  } catch (err: any) {
    console.error('[lineup-deadlines] error:', err);
    await logRun('failed', err?.message ?? 'unknown');
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
