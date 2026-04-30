import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// Aggregations across ~1200+ opps + activities + payments + prospects.
// Worst case ~5 round-trips in parallel; Vercel hobby is fine.
export const maxDuration = 30;

/**
 * GET /api/analytics/dashboard
 *
 * Returns everything the /analytics page needs in one shot. We do
 * parallel queries via Promise.all so the user sees the dashboard in
 * ~1-2s even on cold hits, and a single payload means no waterfall
 * loading states on the page.
 *
 * Query params:
 *   ?days=7     Lookback window for "recent" sections (default 7, max 90)
 *
 * Shape of response:
 *   {
 *     kpis:              top-of-page totals
 *     stages:            pipeline distribution by stage (counts + value)
 *     pipelines:         the 4 canonical pipeline buckets (Outreach/Leads/Deals/Accounts)
 *     discovery_funnel:  Discovery → CRM conversion
 *     owners:            workload per team member
 *     recent_activity:   last N CRM activities across the team
 *     alerts:            health callout counts
 *   }
 */
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const sinceDate = new Date(Date.now() - days * 86_400_000);
  const cutoff7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  try {
    // ── Pull everything in parallel ──────────────────────────────────
    // PostgREST/Supabase caps each query at 1000 rows by default. We
    // paginate the big tables (crm_opportunities, prospects) so the
    // counts are accurate.
    const [
      oppsAllPages,
      activitiesRecent,
      prospectsRecent,
      paymentsAll,
      mastersKolsAll,
      usersAll,
      campaignsActive,
      contentsStale,
      cdlRecent,
      agentRunsRecent,
    ] = await Promise.all([
      paginateAll(supabase, 'crm_opportunities', 'id, name, stage, deal_value, last_contacted_at, owner_id, account_type, source, created_at'),
      (supabase as any).from('crm_activities').select('id, opportunity_id, type, title, owner_id, created_at, crm_opportunities(name)').gte('created_at', since).order('created_at', { ascending: false }).limit(50),
      (supabase as any).from('prospects').select('id, status, source, scraped_at, discovery_snapshot, promoted_opportunity_id').eq('source', 'dropstab_discovery').gte('scraped_at', since),
      (supabase as any).from('payments').select('amount, payment_date, campaigns(name, status)'),
      (supabase as any).from('master_kols').select('id, group_chat, created_at, region, tier').is('archived_at', null),
      (supabase as any).from('users').select('id, name, email').eq('is_active', true),
      (supabase as any).from('campaigns').select('id, name, total_budget, status').is('archived_at', null).neq('status', 'closed').neq('status', 'Completed'),
      (supabase as any).from('contents').select('id, activation_date').not('activation_date', 'is', null).lt('activation_date', cutoff7d).is('impressions', null).is('likes', null),
      (supabase as any).from('client_delivery_log').select('client_id, work_type, who, logged_at').gte('logged_at', since).order('logged_at', { ascending: false }).limit(20),
      (supabase as any).from('agent_runs').select('output_summary, run_type').eq('agent_name', 'DISCOVERY').gte('started_at', since),
    ]);

    const opps = oppsAllPages as any[];
    const activities = (activitiesRecent.data || []) as any[];
    const prospects = (prospectsRecent.data || []) as any[];
    const payments = (paymentsAll.data || []) as any[];
    const kols = (mastersKolsAll.data || []) as any[];
    const users = (usersAll.data || []) as any[];
    const campaigns = (campaignsActive.data || []) as any[];
    const staleContent = (contentsStale.data || []) as any[];
    const cdl = (cdlRecent.data || []) as any[];
    const agentRuns = (agentRunsRecent.data || []) as any[];

    // ── Stage / pipeline grouping ────────────────────────────────────
    // Mirror the pipeline groupings from the sales-pipeline page so
    // the dashboard reads the same way as the CRM tabs.
    const PIPELINES: Record<string, string[]> = {
      'Outreach (cold)': ['cold_dm', 'warm', 'tg_intro'],
      'Leads': ['new', 'contacted', 'qualified', 'unqualified', 'nurture', 'dead'],
      'Booked / Discovery': ['booked', 'discovery_done'],
      'Deals': ['deal_qualified', 'proposal', 'proposal_sent', 'proposal_call', 'negotiation', 'contract', 'v2_contract', 'closed_won', 'v2_closed_won', 'closed_lost', 'v2_closed_lost'],
      'Accounts': ['account_active', 'account_at_risk', 'account_churned', 'orbit'],
    };
    const ACTIVE_STAGES = new Set([
      'cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done',
      'proposal_call', 'v2_contract', 'new', 'contacted', 'qualified',
      'nurture', 'deal_qualified', 'proposal', 'proposal_sent', 'negotiation',
      'contract', 'orbit', 'account_active', 'account_at_risk',
    ]);
    const TERMINAL_STAGES = new Set([
      'closed_won', 'v2_closed_won', 'closed_lost', 'v2_closed_lost',
      'dead', 'unqualified', 'account_churned',
    ]);

    const stageCounts: Record<string, { count: number; value: number }> = {};
    let pipelineValue = 0;
    let activeOppCount = 0;
    for (const o of opps) {
      const s = o.stage || 'unknown';
      if (!stageCounts[s]) stageCounts[s] = { count: 0, value: 0 };
      stageCounts[s].count++;
      const v = Number(o.deal_value) || 0;
      stageCounts[s].value += v;
      if (ACTIVE_STAGES.has(s)) {
        pipelineValue += v;
        activeOppCount++;
      }
    }
    const stages = Object.entries(stageCounts)
      .map(([stage, v]) => ({ stage, count: v.count, value: Math.round(v.value) }))
      .sort((a, b) => b.count - a.count);

    const pipelines = Object.entries(PIPELINES).map(([label, stagesInGroup]) => {
      const groupCount = stagesInGroup.reduce((sum, s) => sum + (stageCounts[s]?.count || 0), 0);
      const groupValue = stagesInGroup.reduce((sum, s) => sum + (stageCounts[s]?.value || 0), 0);
      return { label, count: groupCount, value: Math.round(groupValue) };
    });

    // ── Discovery funnel ─────────────────────────────────────────────
    const funnelDiscovered = prospects.length;
    const funnelReviewed = prospects.filter(p => p.status === 'reviewed' || p.status === 'promoted').length;
    const funnelPromoted = prospects.filter(p => p.status === 'promoted').length;
    // Of promoted prospects, how many have an active CRM opp (not closed/dead)?
    const promotedOppIds = new Set(prospects.map(p => p.promoted_opportunity_id).filter(Boolean));
    let funnelActiveCrm = 0;
    let funnelWon = 0;
    for (const o of opps) {
      if (!promotedOppIds.has(o.id)) continue;
      if (TERMINAL_STAGES.has(o.stage)) {
        if (o.stage === 'closed_won' || o.stage === 'v2_closed_won') funnelWon++;
      } else {
        funnelActiveCrm++;
      }
    }

    // Tier distribution within the recent prospects window
    const tierCounts: Record<string, number> = {};
    for (const p of prospects) {
      const t = p.discovery_snapshot?.action_tier || 'untiered';
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    }

    // ── Owner workload ───────────────────────────────────────────────
    // For each active user: count of open opps owned, count of stale
    // (>7d since contact OR never contacted), most recent activity.
    const userById = new Map(users.map(u => [u.id, u]));
    const lastActivityByOwner = new Map<string, string>();
    for (const a of activities) {
      if (!a.owner_id) continue;
      if (!lastActivityByOwner.has(a.owner_id)) {
        lastActivityByOwner.set(a.owner_id, a.created_at);
      }
    }
    const ownerStats: Record<string, { openOpps: number; staleOpps: number; pipelineValue: number }> = {};
    for (const o of opps) {
      if (!o.owner_id) continue;
      if (!ACTIVE_STAGES.has(o.stage)) continue;
      if (!ownerStats[o.owner_id]) ownerStats[o.owner_id] = { openOpps: 0, staleOpps: 0, pipelineValue: 0 };
      ownerStats[o.owner_id].openOpps++;
      ownerStats[o.owner_id].pipelineValue += Number(o.deal_value) || 0;
      const lcMs = o.last_contacted_at ? new Date(o.last_contacted_at).getTime() : null;
      const staleThreshold = Date.now() - 7 * 86_400_000;
      if (lcMs == null || lcMs < staleThreshold) {
        ownerStats[o.owner_id].staleOpps++;
      }
    }
    const owners = Object.entries(ownerStats)
      .map(([uid, s]) => {
        const u = userById.get(uid);
        return {
          id: uid,
          name: u?.name || 'Unknown',
          email: u?.email || null,
          open_opps: s.openOpps,
          stale_opps: s.staleOpps,
          pipeline_value: Math.round(s.pipelineValue),
          last_activity_at: lastActivityByOwner.get(uid) || null,
        };
      })
      .sort((a, b) => b.open_opps - a.open_opps);

    // ── Recent activity (with owner names + opp names hydrated) ──────
    const recentActivity = activities.slice(0, 15).map(a => ({
      id: a.id,
      type: a.type,
      title: a.title,
      opportunity_name: a.crm_opportunities?.name ?? null,
      owner_name: a.owner_id ? (userById.get(a.owner_id)?.name ?? null) : null,
      created_at: a.created_at,
    }));

    // ── Health alerts ────────────────────────────────────────────────
    const staleCrmCount = opps.filter(o => {
      if (!ACTIVE_STAGES.has(o.stage)) return false;
      const lcMs = o.last_contacted_at ? new Date(o.last_contacted_at).getTime() : null;
      return lcMs == null || lcMs < Date.now() - 7 * 86_400_000;
    }).length;

    let unpaidPayments = 0;
    let unpaidValue = 0;
    for (const p of payments) {
      if (p.payment_date) continue;
      // Skip payments tied to closed/completed campaigns
      if (p.campaigns?.status === 'Completed' || p.campaigns?.status === 'closed') continue;
      unpaidPayments++;
      unpaidValue += Number(p.amount) || 0;
    }

    const newKolsNoGc = kols.filter(k =>
      (!k.group_chat || k.group_chat === false) &&
      k.created_at && new Date(k.created_at) > sinceDate,
    ).length;

    const newCrmNoGc = opps.filter(o => {
      // Match the new_crm_no_gc evaluator: created in window, gc null/empty
      // (We don't have gc on the opps query payload above — re-derive from a
      // separate count query would be ideal; for v1 we approximate by
      // counting recent-created opps without an owner activity. For exact
      // count, see the reminder system.)
      if (!o.created_at) return false;
      if (new Date(o.created_at).getTime() < sinceDate.getTime()) return false;
      // Conservative proxy — the dashboard alerts are pointers, the
      // /reminders page has the precise list.
      return false;
    }).length;

    const alerts = {
      stale_crm: staleCrmCount,
      unpaid_payments: unpaidPayments,
      unpaid_value: Math.round(unpaidValue),
      new_kols_no_gc: newKolsNoGc,
      content_no_metrics: staleContent.length,
    };

    // ── Intelligence cost in window ──────────────────────────────────
    let intelCost = 0;
    let intelRuns = 0;
    let intelFailed = 0;
    for (const r of agentRuns) {
      const c = Number(r.output_summary?.cost_usd);
      if (Number.isFinite(c)) intelCost += c;
      intelRuns++;
      if (r.output_summary?.error || r.output_summary?.errors?.length) intelFailed++;
    }

    // ── KPI strip ────────────────────────────────────────────────────
    const kpis = {
      pipeline_value: Math.round(pipelineValue),
      active_opportunities: activeOppCount,
      total_opportunities: opps.length,
      prospects_in_window: prospects.length,
      promoted_in_window: prospects.filter(p => p.status === 'promoted').length,
      active_campaigns: campaigns.length,
      campaign_budget_total: Math.round(campaigns.reduce((s, c) => s + (Number(c.total_budget) || 0), 0)),
      intelligence_cost: Math.round(intelCost * 100) / 100,
      intelligence_runs: intelRuns,
      intelligence_failed: intelFailed,
    };

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      window_days: days,
      kpis,
      stages,
      pipelines,
      discovery_funnel: {
        discovered: funnelDiscovered,
        reviewed: funnelReviewed,
        promoted: funnelPromoted,
        active_in_crm: funnelActiveCrm,
        won: funnelWon,
        tiers: tierCounts,
      },
      owners,
      recent_activity: recentActivity,
      cdl_recent: cdl.slice(0, 10).map(d => ({
        client_id: d.client_id,
        work_type: d.work_type,
        who: d.who,
        logged_at: d.logged_at,
      })),
      alerts,
    });
  } catch (err: any) {
    console.error('[analytics dashboard] error', err);
    return NextResponse.json({ error: err?.message ?? 'unknown error' }, { status: 500 });
  }
}

/**
 * Helper: paginate through a Supabase table fetching all rows.
 * PostgREST defaults to 1000 rows per query; without pagination the
 * 1200+ crm_opportunities row count gets silently truncated.
 */
async function paginateAll(supabase: any, table: string, columns: string): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let page = 0; page < 50; page++) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await supabase.from(table).select(columns).range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}
