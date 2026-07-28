/**
 * GET /api/cron/action-board-approvals
 *
 * Auto-completes the client-approval items on the Onboarding Action Board
 * 48h after the thing they're approving was shared.
 *
 * Per Jdot's "Onboarding Action Board Map v1" (23 Jul 2026), four items are
 * client approvals with an "auto 48h, manual override" trigger:
 *
 *   Outreach brief approved          ← 48h after "Shared for review"
 *   Shortlist confirmed              ← 48h after "Campaign tracker deployed"
 *   GTM Overview reviewed + approved ← 48h after "GTM Overview delivered"
 *   Content brief reviewed + approved ← 48h after "Content brief shared"
 *
 * The 48h window was confirmed by Jdot via Andy on 2026-07-28.
 *
 * WHY THE PAIRING LIVES IN THE TEMPLATE
 * Each approval item names its trigger item via `approval_after` in
 * milestone_templates.milestones. Reading it here means the pairing is
 * declared in one place alongside the board definition, instead of being
 * hardcoded in a cron that would silently drift when the board changes.
 *
 * The clock starts at the PAIRED item's completed_at — not at the approval
 * item's creation. An approval can only be overdue relative to the share
 * that triggered it.
 *
 * "Manual override" needs no code: anyone can tick or untick the item on
 * the board, and a ticked item is skipped here.
 *
 * Auth: Bearer ${CRON_SECRET}. Logs to agent_runs as ACTION_BOARD_APPROVALS.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const APPROVAL_WINDOW_HOURS = 48;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'missing supabase config' }, { status: 500 });
  }
  const sb = createClient(supabaseUrl, supabaseServiceKey);

  const start = Date.now();
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1';

  const log = async (status: string, summary: string) => {
    try {
      await (sb as any).from('agent_runs').insert({
        agent_name: 'ACTION_BOARD_APPROVALS',
        run_type: 'cron',
        started_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        status,
        output_summary: summary,
      });
    } catch { /* never let logging break the run */ }
  };

  try {
    // 1. Build item_key → approval_after from the board templates.
    const { data: templates, error: tErr } = await (sb as any)
      .from('milestone_templates')
      .select('milestones');
    if (tErr) throw new Error(`template read failed: ${tErr.message}`);

    const approvalAfter = new Map<string, string>();
    for (const t of templates || []) {
      for (const ms of (t.milestones || []) as any[]) {
        for (const it of (ms.items || []) as any[]) {
          if (it.item_key && it.approval_after) {
            approvalAfter.set(it.item_key, it.approval_after);
          }
        }
      }
    }
    if (approvalAfter.size === 0) {
      await log('success', 'no approval pairings declared in any board template — nothing to do');
      return NextResponse.json({ completed: 0, reason: 'no approval_after pairings in templates' });
    }

    // 2. Every pending approval item across all clients.
    const { data: pending, error: pErr } = await (sb as any)
      .from('client_action_items')
      .select('id, client_id, item_key, text, is_done')
      .eq('auto_rule', 'approval_48h')
      .eq('is_done', false);
    if (pErr) throw new Error(`pending read failed: ${pErr.message}`);

    if (!pending?.length) {
      await log('success', 'no pending approval items');
      return NextResponse.json({ completed: 0, pending: 0 });
    }

    // 3. Fetch the paired trigger items for those clients in one query.
    const clientIds = Array.from(new Set(pending.map((p: any) => p.client_id)));
    const triggerKeys = Array.from(new Set(
      pending.map((p: any) => approvalAfter.get(p.item_key)).filter(Boolean),
    )) as string[];

    const { data: triggers, error: trErr } = await (sb as any)
      .from('client_action_items')
      .select('client_id, item_key, is_done, completed_at, updated_at')
      .in('client_id', clientIds)
      .in('item_key', triggerKeys);
    if (trErr) throw new Error(`trigger read failed: ${trErr.message}`);

    const triggerBy = new Map<string, any>();
    for (const t of triggers || []) triggerBy.set(`${t.client_id}::${t.item_key}`, t);

    // 4. Decide.
    const now = Date.now();
    const cutoffMs = APPROVAL_WINDOW_HOURS * 60 * 60 * 1000;
    const due: any[] = [];
    const waiting: any[] = [];

    for (const item of pending) {
      const triggerKey = approvalAfter.get(item.item_key);
      if (!triggerKey) continue;                      // approval with no declared pairing
      const trigger = triggerBy.get(`${item.client_id}::${triggerKey}`);
      if (!trigger || !trigger.is_done) continue;     // not shared yet — clock hasn't started

      // completed_at is the real signal. Fall back to updated_at for items
      // completed before provenance stamping shipped (2026-07-28) — without
      // it, every pre-existing done item would look like it completed "now"
      // and the 48h clock would restart today.
      const since = trigger.completed_at || trigger.updated_at;
      if (!since) continue;

      const elapsed = now - new Date(since).getTime();
      if (elapsed >= cutoffMs) {
        due.push({ ...item, since, hours: Math.floor(elapsed / 3600000) });
      } else {
        waiting.push({
          id: item.id, text: item.text,
          hoursRemaining: Math.ceil((cutoffMs - elapsed) / 3600000),
        });
      }
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        approvals: {
          wouldComplete: due.map(d => ({ id: d.id, text: d.text, hoursSinceShare: d.hours })),
          waiting,
          pendingTotal: pending.length,
        },
        m7: await sweepM7(sb, true),
      });
    }

    if (due.length === 0) {
      // Not logged as a distinct state: a day where nothing is due is the
      // normal case, and the health sweep only cares that the cron ran.
      await log('success', `0 completed, ${waiting.length} still inside the ${APPROVAL_WINDOW_HOURS}h window`);
      return NextResponse.json({ completed: 0, waiting: waiting.length });
    }

    const nowIso = new Date().toISOString();
    let completed = 0;
    for (const item of due) {
      const { error: uErr } = await (sb as any)
        .from('client_action_items')
        .update({
          is_done: true,
          completed_at: nowIso,
          completion_source: 'auto_48h',
          updated_at: nowIso,
        })
        .eq('id', item.id)
        .eq('is_done', false);   // someone may have ticked it since the read
      if (uErr) {
        console.error('[ActionBoardApprovals] update failed', item.id, uErr.message);
      } else {
        completed++;
      }
    }

    const m7 = await sweepM7(sb, false);

    await log('success', `${completed} approval item(s) auto-completed after ${APPROVAL_WINDOW_HOURS}h; ${waiting.length} still waiting; M7: ${m7.completed} completed`);
    return NextResponse.json({ completed, waiting: waiting.length, m7 });
  } catch (err: any) {
    await log('failed', err?.message || 'unknown error');
    return NextResponse.json({ error: err?.message || 'unknown error' }, { status: 500 });
  }
}

/**
 * M7 "First Content Goes Live" — Jdot's Weekly-Campaign-Cycle signals.
 *
 * WHY A SWEEP AND NOT EVENT HOOKS
 * All three M7 signals ask "has this happened yet for this client" — first
 * live link, first metrics pull, content live 48h. Content rows are written
 * from many places (Telegram approve, the campaign page, imports), so hooking
 * each writer would mean N call sites that must all stay correct, and any
 * missed one silently strands a client's board. A daily state query has no
 * such surface: it re-derives the answer from scratch every run and is
 * idempotent by construction.
 *
 * The 48h item is genuinely time-based anyway — no insert event could fire it.
 */
async function sweepM7(sb: any, dryRun: boolean) {
  const M7_RULES = ['first_content_link', 'first_metrics_pull', 'content_live_48h'] as const;

  const { data: pending } = await sb
    .from('client_action_items')
    .select('id, client_id, item_key, text, auto_rule')
    .in('auto_rule', M7_RULES as any)
    .eq('is_done', false);

  if (!pending?.length) return { completed: 0, pending: 0, details: [] as any[] };

  const clientIds = Array.from(new Set(pending.map((p: any) => p.client_id)));

  // Campaign → client, so content can be attributed back to a board.
  const { data: campaigns } = await sb
    .from('campaigns').select('id, client_id').in('client_id', clientIds);
  const clientByCampaign = new Map<string, string>();
  for (const c of campaigns || []) clientByCampaign.set(c.id, c.client_id);

  const campaignIds = (campaigns || []).map((c: any) => c.id);
  if (campaignIds.length === 0) return { completed: 0, pending: pending.length, details: [] };

  // 'posted' is the only status that means live to a client — 'pending' and
  // 'scheduled' are internal states and must not tick a client-facing item.
  const { data: contents } = await sb
    .from('contents')
    .select('campaign_id, content_link, impressions, activation_date, created_at')
    .in('campaign_id', campaignIds)
    .eq('status', 'posted');

  // Per client: is there a live link, are metrics in, when did content go live.
  const state = new Map<string, { link: boolean; metrics: boolean; firstLive: number | null }>();
  for (const row of contents || []) {
    const clientId = clientByCampaign.get(row.campaign_id);
    if (!clientId) continue;
    const s = state.get(clientId) || { link: false, metrics: false, firstLive: null };
    if (row.content_link) s.link = true;
    if ((row.impressions || 0) > 0) s.metrics = true;
    const liveAt = row.activation_date || row.created_at;
    if (liveAt) {
      const t = new Date(liveAt).getTime();
      if (!Number.isNaN(t) && (s.firstLive === null || t < s.firstLive)) s.firstLive = t;
    }
    state.set(clientId, s);
  }

  const now = Date.now();
  const cutoffMs = APPROVAL_WINDOW_HOURS * 60 * 60 * 1000;
  const due: any[] = [];

  for (const item of pending) {
    const s = state.get(item.client_id);
    if (!s) continue;
    const fires =
      item.auto_rule === 'first_content_link' ? s.link
      : item.auto_rule === 'first_metrics_pull' ? s.metrics
      : /* content_live_48h */ s.firstLive !== null && (now - s.firstLive) >= cutoffMs;
    if (fires) due.push(item);
  }

  if (dryRun || due.length === 0) {
    return {
      completed: 0, pending: pending.length,
      details: due.map(d => ({ id: d.id, text: d.text, rule: d.auto_rule })),
    };
  }

  const nowIso = new Date().toISOString();
  let completed = 0;
  for (const item of due) {
    const { error } = await sb
      .from('client_action_items')
      .update({
        is_done: true,
        completed_at: nowIso,
        completion_source: item.auto_rule === 'content_live_48h' ? 'auto_48h' : 'auto_event',
        updated_at: nowIso,
      })
      .eq('id', item.id)
      .eq('is_done', false);
    if (error) console.error('[ActionBoardM7] update failed', item.id, error.message);
    else completed++;
  }
  return { completed, pending: pending.length, details: due.map(d => ({ text: d.text, rule: d.auto_rule })) };
}
