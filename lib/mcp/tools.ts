import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Tool definitions for the HoloHive MCP server.
 *
 * Each tool takes a service-role Supabase client and the tool's input,
 * returns a string (Claude renders it as text content). The MCP route
 * wraps each result in the standard `{ content: [{type:'text', text}] }`
 * envelope the SDK expects.
 *
 * Why service role: the MCP authentication step (authenticateMcpRequest)
 * already validated that this request belongs to a real, consented user.
 * From that point on we want full read access regardless of RLS — the
 * tools are read-only and shouldn't be hampered by per-user policies.
 *
 * Output formatting principle: prefer compact human-readable text over
 * raw JSON. Claude reads it back to the user, so terse > exhaustive.
 * For long lists, cap at 20 rows and summarize the total.
 */

// ─── Helpers ──────────────────────────────────────────────────────────

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service config missing');
  return createClient(url, key);
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

// ─── Tool: list_recent_prospects (browse Discovery results) ──────────
//
// The Discovery panel's main list view. Filters mirror what the UI
// surfaces — tier, status, source. Default behavior (no filters) is the
// most-recent slice, which is what 95% of "what's new" questions want.

export const listRecentProspectsSchema = {
  days: z.number().int().min(1).max(180).default(7)
    .describe('Look-back window in days (default 7).'),
  tier: z.enum(['REACH_OUT_NOW', 'PRE_TOKEN_PRIORITY', 'CONSIDER', 'DISMISS', 'any'])
    .default('any')
    .describe('Discovery action tier. "any" returns all tiers.'),
  status: z.enum(['needs_review', 'reviewed', 'promoted', 'dismissed', 'any'])
    .default('any')
    .describe('Workflow status: needs_review (untouched), reviewed (looked at, not promoted), promoted (sent to CRM), dismissed.'),
  source: z.string().optional()
    .describe('Optional source filter (e.g. "dropstab", "cryptorank", "rootdata", "ethglobal").'),
  sort_by: z.enum(['created_at', 'korea_relevancy_score', 'icp_score'])
    .default('created_at')
    .describe('Sort key. Default: created_at descending.'),
  limit: z.number().int().min(1).max(50).default(20)
    .describe('Max prospects to return (default 20).'),
};

export async function listRecentProspects(
  supabase: SupabaseClient,
  args: {
    days: number;
    tier: 'REACH_OUT_NOW' | 'PRE_TOKEN_PRIORITY' | 'CONSIDER' | 'DISMISS' | 'any';
    status: 'needs_review' | 'reviewed' | 'promoted' | 'dismissed' | 'any';
    source?: string;
    sort_by: 'created_at' | 'korea_relevancy_score' | 'icp_score';
    limit: number;
  },
): Promise<string> {
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();
  let query = (supabase as any)
    .from('prospects')
    .select('id, name, symbol, status, source, korea_relevancy_score, icp_score, korea_signal_count, created_at, discovery_snapshot')
    .gte('created_at', since)
    .order(args.sort_by, { ascending: false, nullsFirst: false })
    .limit(args.limit);

  if (args.status !== 'any') query = query.eq('status', args.status);
  if (args.source) query = query.eq('source', args.source);

  const { data, error } = await query;
  if (error) return `Error: ${error.message}`;
  let rows = (data || []) as any[];

  // tier lives inside discovery_snapshot JSONB → can't push to PostgREST
  // cleanly without a function index, so we filter client-side. The row
  // count is small (≤50) so this is fine.
  if (args.tier !== 'any') {
    rows = rows.filter(r => r.discovery_snapshot?.action_tier === args.tier);
  }

  if (rows.length === 0) {
    const filters = [
      `last ${args.days}d`,
      args.tier !== 'any' && `tier=${args.tier}`,
      args.status !== 'any' && `status=${args.status}`,
      args.source && `source=${args.source}`,
    ].filter(Boolean).join(', ');
    return `No prospects matching: ${filters}.`;
  }

  const lines = rows.map(r => {
    const snap = r.discovery_snapshot || {};
    const tier = snap.action_tier || '—';
    const funding = snap.funding;
    const fundingStr = funding?.amount_usd ? ` · ${formatMoney(funding.amount_usd)}${funding.round ? ` ${funding.round}` : ''}` : '';
    const koreaListed = snap.post_korea_listing_at ? ` · 📍 ${String(snap.post_korea_listing_exchange || '').toUpperCase()}` : '';
    const statusBadge = r.status && r.status !== 'needs_review' ? ` [${r.status}]` : '';
    return `• ${r.name}${r.symbol ? ` ($${r.symbol})` : ''} — ${tier}${statusBadge} · ${r.source || '—'}${fundingStr}${koreaListed} · ${relTime(r.created_at)}`;
  });

  const filterLabel = [
    args.tier !== 'any' && args.tier,
    args.status !== 'any' && args.status,
    args.source,
  ].filter(Boolean).join(', ');
  const filterSuffix = filterLabel ? ` (${filterLabel})` : '';
  return `${rows.length} prospect(s) in last ${args.days}d${filterSuffix}, sorted by ${args.sort_by}:\n\n${lines.join('\n')}`;
}

// ─── Tool: get_prospect_detail ────────────────────────────────────────

export const getProspectDetailSchema = {
  prospect_id: z.string().uuid().describe('UUID of the prospect (from list_recent_prospects).'),
};

export async function getProspectDetail(
  supabase: SupabaseClient,
  args: { prospect_id: string },
): Promise<string> {
  const { data: p, error } = await (supabase as any)
    .from('prospects')
    .select('*')
    .eq('id', args.prospect_id)
    .single();
  if (error || !p) return `Prospect not found: ${args.prospect_id}`;

  const { data: signals } = await (supabase as any)
    .from('prospect_signals')
    .select('signal_type, headline, detected_at, relevancy_weight, tier')
    .eq('prospect_id', args.prospect_id)
    .eq('is_active', true)
    .order('detected_at', { ascending: false })
    .limit(10);

  const snap = p.discovery_snapshot || {};
  const out: string[] = [];
  out.push(`## ${p.name}${p.symbol ? ` ($${p.symbol})` : ''}`);
  out.push('');
  out.push(`**Tier:** ${snap.action_tier || '—'}`);
  out.push(`**Score:** ${snap.prospect_score ?? '—'}/100  ·  **Korea relevance:** ${p.korea_relevancy_score ?? '—'}/100`);
  out.push(`**Status:** ${p.status || '—'}  ·  **Source:** ${p.source || '—'}  ·  **Created:** ${relTime(p.created_at)}`);
  if (snap.funding?.amount_usd) {
    out.push(`**Funding:** ${formatMoney(snap.funding.amount_usd)}${snap.funding.round ? ` ${snap.funding.round}` : ''}${snap.funding.investors ? ` · ${(snap.funding.investors as string[]).slice(0, 3).join(', ')}` : ''}`);
  }
  if (snap.post_korea_listing_at) {
    out.push(`**Korea listing:** 📍 ${String(snap.post_korea_listing_exchange || '').toUpperCase()} · ${snap.post_korea_listing_market_pair} · ${relTime(snap.post_korea_listing_at)}`);
  }
  if (snap.fit_reasoning) {
    out.push('');
    out.push(`**Fit reasoning:**  ${snap.fit_reasoning}`);
  }
  if (snap.disqualification_reason) {
    out.push('');
    out.push(`**Disqualification reason:**  ${snap.disqualification_reason}`);
  }
  const links = [p.website_url, p.twitter_url, p.telegram_url, p.discord_url].filter(Boolean);
  if (links.length) {
    out.push('');
    out.push(`**Links:**  ${links.join('  ·  ')}`);
  }
  if (signals && signals.length > 0) {
    out.push('');
    out.push(`**Recent signals (${signals.length}):**`);
    for (const s of signals as any[]) {
      out.push(`• [${s.signal_type}] ${s.headline} · ${relTime(s.detected_at)}`);
    }
  }

  return out.join('\n');
}

// ─── Tool: list_active_campaigns ──────────────────────────────────────

export const listActiveCampaignsSchema = {
  limit: z.number().int().min(1).max(50).default(20)
    .describe('Max campaigns to return (default 20).'),
};

export async function listActiveCampaigns(
  supabase: SupabaseClient,
  args: { limit: number },
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('campaigns')
    .select('id, name, status, start_date, end_date, total_budget, manager, region, archived_at, clients!inner(name)')
    .is('archived_at', null)
    .neq('status', 'closed')
    .order('start_date', { ascending: false })
    .limit(args.limit);

  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return 'No active campaigns.';

  const lines = rows.map(c => {
    const clientName = c.clients?.name || '—';
    return `• ${c.name} (${clientName}) — ${c.status} · ${formatMoney(c.total_budget)} · ${c.region || '—'} · mgr: ${c.manager || '—'} · started ${relTime(c.start_date)}`;
  });

  return `${rows.length} active campaign(s):\n\n${lines.join('\n')}`;
}

// ─── Tool: search_kols ────────────────────────────────────────────────

export const searchKolsSchema = {
  query: z.string().min(1).max(100)
    .describe('Search by name (case-insensitive substring match).'),
  region: z.string().optional()
    .describe('Optional region filter (e.g. "Korea", "Global").'),
  tier: z.string().optional()
    .describe('Optional tier filter (e.g. "S", "A", "B", "C").'),
  limit: z.number().int().min(1).max(50).default(20),
};

export async function searchKols(
  supabase: SupabaseClient,
  args: { query: string; region?: string; tier?: string; limit: number },
): Promise<string> {
  let q = (supabase as any)
    .from('master_kols')
    .select('id, name, region, tier, followers, niche, platform, link, in_house, archived_at')
    .is('archived_at', null)
    .ilike('name', `%${args.query}%`)
    .order('followers', { ascending: false, nullsFirst: false })
    .limit(args.limit);

  if (args.region) q = q.ilike('region', args.region);
  if (args.tier) q = q.eq('tier', args.tier);

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No KOLs match "${args.query}"${args.region ? ` (region=${args.region})` : ''}${args.tier ? ` (tier=${args.tier})` : ''}.`;

  const fmtFollowers = (n: number | null) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  const lines = rows.map(k => {
    const niches = Array.isArray(k.niche) && k.niche.length ? ` · ${k.niche.slice(0, 3).join('/')}` : '';
    const plats = Array.isArray(k.platform) && k.platform.length ? ` · ${k.platform.join('+')}` : '';
    return `• ${k.name} — ${k.tier || '?'} tier · ${fmtFollowers(k.followers)} followers · ${k.region || '—'}${niches}${plats}${k.in_house ? ` · in-house: ${k.in_house}` : ''}`;
  });

  return `${rows.length} KOL(s) matching "${args.query}":\n\n${lines.join('\n')}`;
}

// ─── Tool: get_kr_listings ────────────────────────────────────────────

export const getKrListingsSchema = {
  days: z.number().int().min(1).max(30).default(3)
    .describe('Look-back window in days for new Korean exchange listings (default 3).'),
  exchange: z.enum(['upbit', 'bithumb', 'any']).default('any'),
};

export async function getKrListings(
  supabase: SupabaseClient,
  args: { days: number; exchange: 'upbit' | 'bithumb' | 'any' },
): Promise<string> {
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();
  let q = (supabase as any)
    .from('prospect_signals')
    .select('headline, snippet, detected_at, source_url, prospect_id, project_name, metadata')
    .eq('signal_type', 'korea_exchange_listing')
    .gte('detected_at', since)
    .order('detected_at', { ascending: false })
    .limit(50);

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  let rows = (data || []) as any[];
  if (args.exchange !== 'any') {
    rows = rows.filter(r => r.metadata?.exchange === args.exchange);
  }
  if (rows.length === 0) {
    return `No Korean exchange listings in the last ${args.days} day(s)${args.exchange !== 'any' ? ` on ${args.exchange}` : ''}.`;
  }

  const lines = rows.map(r => {
    const matched = r.prospect_id ? ' 🎯 (matches a Discovery prospect)' : '';
    return `• ${r.headline} — ${relTime(r.detected_at)}${matched}`;
  });
  return `${rows.length} new Korean exchange listing(s) in the last ${args.days} day(s):\n\n${lines.join('\n')}`;
}

// ─── Tool: summarize_pipeline ─────────────────────────────────────────

export const summarizePipelineSchema = {};

export async function summarizePipeline(
  supabase: SupabaseClient,
): Promise<string> {
  // Discovery prospects by tier (last 30 days)
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: recent } = await (supabase as any)
    .from('prospects')
    .select('discovery_snapshot, status')
    .gte('created_at', since30)
    .limit(1000);

  const tierCounts: Record<string, number> = {};
  for (const p of (recent || []) as any[]) {
    const t = p.discovery_snapshot?.action_tier || 'untiered';
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  }

  // CRM opportunities by stage. Paginate — single .limit() caps at 1000
  // rows on Supabase and silently truncates beyond that (Andy's prod has
  // 1000+ opportunities, so a single query would underreport).
  const stageCounts: Record<string, number> = {};
  for (let page = 0; page < 50; page++) {
    const from = page * 1000;
    const to = from + 999;
    const { data: crm } = await (supabase as any)
      .from('crm_opportunities')
      .select('stage')
      .range(from, to);
    if (!crm || crm.length === 0) break;
    for (const c of crm as any[]) {
      const s = c.stage || 'unknown';
      stageCounts[s] = (stageCounts[s] || 0) + 1;
    }
    if (crm.length < 1000) break;
  }

  // Active campaigns count
  const { count: activeCampaigns } = await (supabase as any)
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .is('archived_at', null)
    .neq('status', 'closed');

  const out: string[] = [];
  out.push('## HoloHive pipeline snapshot');
  out.push('');
  out.push(`**Discovery prospects (last 30d):** ${(recent || []).length} total`);
  for (const [tier, n] of Object.entries(tierCounts).sort((a, b) => b[1] - a[1])) {
    out.push(`  · ${tier}: ${n}`);
  }
  out.push('');
  out.push(`**CRM opportunities by stage:**`);
  for (const [stage, n] of Object.entries(stageCounts).sort((a, b) => b[1] - a[1])) {
    out.push(`  · ${stage}: ${n}`);
  }
  out.push('');
  out.push(`**Active campaigns:** ${activeCampaigns ?? '—'}`);
  return out.join('\n');
}

// ─── Tool: get_recent_signals (Intelligence — broad signal feed) ──────
//
// The Intelligence > Signals tab. Surfaces all prospect_signals across
// signal types, filterable by type, prospect, or minimum weight.
// Different from get_kr_listings which is hardcoded to korea_exchange_listing.

export const getRecentSignalsSchema = {
  days: z.number().int().min(1).max(60).default(7)
    .describe('Look-back window in days (default 7).'),
  signal_type: z.string().optional()
    .describe('Filter by exact signal_type (e.g. "korea_intent_exchange", "poc_korea_mention", "funding_round"). Omit for all types.'),
  prospect_id: z.string().uuid().optional()
    .describe('Limit to one prospect by UUID. Omit for all prospects.'),
  min_weight: z.number().int().optional()
    .describe('Minimum relevancy_weight (signals are -25..25; positive = better fit). Default: no filter.'),
  limit: z.number().int().min(1).max(50).default(20),
};

export async function getRecentSignals(
  supabase: SupabaseClient,
  args: { days: number; signal_type?: string; prospect_id?: string; min_weight?: number; limit: number },
): Promise<string> {
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();
  let q = (supabase as any)
    .from('prospect_signals')
    .select('id, prospect_id, project_name, signal_type, headline, snippet, source_name, source_url, relevancy_weight, tier, detected_at, is_active')
    .eq('is_active', true)
    .gte('detected_at', since)
    .order('detected_at', { ascending: false })
    .limit(args.limit);

  if (args.signal_type) q = q.eq('signal_type', args.signal_type);
  if (args.prospect_id) q = q.eq('prospect_id', args.prospect_id);
  if (args.min_weight != null) q = q.gte('relevancy_weight', args.min_weight);

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No signals in the last ${args.days}d matching filter.`;

  const lines = rows.map(r => {
    const weight = r.relevancy_weight != null ? ` (w=${r.relevancy_weight > 0 ? '+' : ''}${r.relevancy_weight})` : '';
    const project = r.project_name || '—';
    return `• [${r.signal_type}] ${project}: ${r.headline}${weight} · ${relTime(r.detected_at)}`;
  });

  // Quick aggregation: how many of each type in this slice?
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.signal_type] = (byType[r.signal_type] || 0) + 1;
  const typeBreakdown = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}: ${n}`)
    .join(', ');

  return `${rows.length} signal(s) in last ${args.days}d (${typeBreakdown}):\n\n${lines.join('\n')}`;
}

// ─── Tool: get_intelligence_cost_summary ──────────────────────────────
//
// What the cost chip on the Intelligence page shows, but more granular.
// Reads agent_runs.output_summary.cost_usd for each run, aggregated by
// run_type. Useful for "did Find POCs blow my budget this week" Q's.

export const getIntelligenceCostSummarySchema = {
  days: z.number().int().min(1).max(90).default(7)
    .describe('Look-back window in days (default 7).'),
};

export async function getIntelligenceCostSummary(
  supabase: SupabaseClient,
  args: { days: number },
): Promise<string> {
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();
  const { data, error } = await (supabase as any)
    .from('agent_runs')
    .select('run_type, status, output_summary, started_at, duration_ms')
    .gte('started_at', since)
    .order('started_at', { ascending: false });

  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No agent runs in the last ${args.days}d.`;

  // Group by run_type
  const byType: Record<string, { cost: number; count: number; failed: number; avgMs: number; totalMs: number }> = {};
  let totalCost = 0;
  for (const r of rows) {
    const c = Number(r.output_summary?.cost_usd);
    const cost = Number.isFinite(c) ? c : 0;
    totalCost += cost;
    const t = r.run_type || 'unknown';
    if (!byType[t]) byType[t] = { cost: 0, count: 0, failed: 0, avgMs: 0, totalMs: 0 };
    byType[t].cost += cost;
    byType[t].count++;
    byType[t].totalMs += Number(r.duration_ms) || 0;
    if (r.status === 'failed') byType[t].failed++;
  }
  for (const t of Object.keys(byType)) byType[t].avgMs = byType[t].totalMs / byType[t].count;

  const out: string[] = [];
  out.push(`## Intelligence cost — last ${args.days}d`);
  out.push('');
  out.push(`**Total spend:** $${totalCost.toFixed(2)} across ${rows.length} run(s)`);
  out.push('');
  out.push('**By run type:**');
  for (const [t, v] of Object.entries(byType).sort((a, b) => b[1].cost - a[1].cost)) {
    const failedNote = v.failed > 0 ? ` · ${v.failed} failed` : '';
    const avgMin = (v.avgMs / 60_000).toFixed(1);
    out.push(`  · ${t}: $${v.cost.toFixed(2)} (${v.count} runs, avg ${avgMin}min${failedNote})`);
  }
  return out.join('\n');
}

// ─── Tool: list_crm_opportunities (browse the pipeline) ──────────────
//
// The CRM Pipeline page in tool form. Filters by stage(s), owner, source.
// stages parameter is a free-form comma list because the stage vocabulary
// is broad (cold_dm, warm, tg_intro, proposal, account_active, etc.) —
// rather than enumerate all 24+, we accept a string and trust the caller
// (or Claude) to pass valid values.

export const listCrmOpportunitiesSchema = {
  stages: z.string().optional()
    .describe('Comma-separated stages to include (e.g. "warm,tg_intro,booked"). Omit for all stages. Common values: cold_dm, warm, tg_intro, booked, proposal, contract, closed_won, closed_lost, account_active.'),
  owner_id: z.string().uuid().optional()
    .describe('Filter to one owner.'),
  source: z.string().optional()
    .describe('Filter by source (referral, inbound, event, cold_outreach, discovery).'),
  account_type: z.enum(['general', 'channel', 'campaign', 'lite', 'ad_hoc', 'any'])
    .default('any')
    .describe('Account type filter.'),
  sort_by: z.enum(['updated_at', 'composite_score', 'last_contacted_at', 'deal_value'])
    .default('updated_at'),
  limit: z.number().int().min(1).max(50).default(20),
};

export async function listCrmOpportunities(
  supabase: SupabaseClient,
  args: {
    stages?: string;
    owner_id?: string;
    source?: string;
    account_type: 'general' | 'channel' | 'campaign' | 'lite' | 'ad_hoc' | 'any';
    sort_by: 'updated_at' | 'composite_score' | 'last_contacted_at' | 'deal_value';
    limit: number;
  },
): Promise<string> {
  let q = (supabase as any)
    .from('crm_opportunities')
    .select('id, name, stage, owner_id, source, account_type, deal_value, currency, composite_score, icp_fit_score, signal_strength_score, temperature_score, timing_score, last_contacted_at, last_message_at, last_reply_at, gc, poc_handle, poc_platform, twitter_handle, tg_handle, updated_at, created_at')
    .order(args.sort_by, { ascending: false, nullsFirst: false })
    .limit(args.limit);

  if (args.stages) {
    const stageList = args.stages.split(',').map(s => s.trim()).filter(Boolean);
    if (stageList.length > 0) q = q.in('stage', stageList);
  }
  if (args.owner_id) q = q.eq('owner_id', args.owner_id);
  if (args.source) q = q.eq('source', args.source);
  if (args.account_type !== 'any') q = q.eq('account_type', args.account_type);

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No opportunities match the filter.`;

  const lines = rows.map(r => {
    const value = r.deal_value ? ` · ${formatMoney(r.deal_value)}${r.currency && r.currency !== 'USD' ? ` ${r.currency}` : ''}` : '';
    const score = r.composite_score != null ? ` · score ${r.composite_score}` : '';
    const lastContact = r.last_contacted_at ? ` · contacted ${relTime(r.last_contacted_at)}` : ' · never contacted';
    const poc = r.poc_handle ? ` · @${r.poc_handle}` : '';
    return `• ${r.name} [${r.stage}]${value}${score}${poc}${lastContact}`;
  });
  return `${rows.length} CRM opportunity(s):\n\n${lines.join('\n')}`;
}

// ─── Tool: get_opportunity_detail ─────────────────────────────────────

export const getOpportunityDetailSchema = {
  opportunity_id: z.string().uuid().describe('UUID of the CRM opportunity.'),
};

export async function getOpportunityDetail(
  supabase: SupabaseClient,
  args: { opportunity_id: string },
): Promise<string> {
  const { data: o, error } = await (supabase as any)
    .from('crm_opportunities')
    .select('*')
    .eq('id', args.opportunity_id)
    .single();
  if (error || !o) return `Opportunity not found: ${args.opportunity_id}`;

  const out: string[] = [];
  out.push(`## ${o.name}`);
  out.push('');
  out.push(`**Stage:** ${o.stage}  ·  **Source:** ${o.source || '—'}  ·  **Account type:** ${o.account_type || '—'}`);
  if (o.deal_value) {
    out.push(`**Deal value:** ${formatMoney(o.deal_value)}${o.currency && o.currency !== 'USD' ? ` ${o.currency}` : ''}`);
  }

  // Scoring block — five separate scores roll into composite
  const scores = [
    ['Composite', o.composite_score],
    ['ICP fit', o.icp_fit_score],
    ['Signal strength', o.signal_strength_score],
    ['Temperature', o.temperature_score],
    ['Timing', o.timing_score],
  ].filter(([, v]) => v != null);
  if (scores.length) {
    out.push('');
    out.push('**Scores:** ' + scores.map(([k, v]) => `${k} ${v}`).join(' · '));
  }

  // Activity timeline
  const activity = [
    ['Last contacted', o.last_contacted_at],
    ['Last message', o.last_message_at],
    ['Last reply', o.last_reply_at],
    ['Last team msg', o.last_team_message_at],
    ['Next meeting', o.next_meeting_at],
    ['Qualified at', o.qualified_at],
    ['Closed at', o.closed_at],
  ].filter(([, v]) => v) as [string, string][];
  if (activity.length) {
    out.push('');
    out.push('**Activity:**');
    for (const [k, v] of activity) out.push(`  · ${k}: ${relTime(v)}`);
  }

  // Contacts / handles
  const contacts: string[] = [];
  if (o.poc_handle) contacts.push(`POC ${o.poc_platform ? `(${o.poc_platform})` : ''}: ${o.poc_handle}`);
  if (o.twitter_handle) contacts.push(`Twitter: @${o.twitter_handle}`);
  if (o.tg_handle) contacts.push(`Telegram: ${o.tg_handle}`);
  if (o.gc) contacts.push(`Group chat: ${o.gc}${o.gc_opened ? ` (opened ${o.gc_opened})` : ''}`);
  if (o.dm_account) contacts.push(`DM account: ${o.dm_account}`);
  if (contacts.length) {
    out.push('');
    out.push('**Contacts:** ' + contacts.join(' · '));
  }

  // Funding context
  if (o.funding_stage || o.funding_amount || o.lead_investors) {
    out.push('');
    out.push(`**Funding:** ${o.funding_stage || '—'}${o.funding_amount ? ` · ${o.funding_amount}` : ''}${o.lead_investors ? ` · ${o.lead_investors}` : ''}`);
  }

  // Project context
  const ctx: string[] = [];
  if (o.token_status) ctx.push(`token: ${o.token_status}`);
  if (o.tge_date) ctx.push(`TGE: ${o.tge_date}`);
  if (o.product_status) ctx.push(`product: ${o.product_status}`);
  if (o.korea_presence) ctx.push(`Korea: ${o.korea_presence}`);
  if (o.team_doxxed != null) ctx.push(`team doxxed: ${o.team_doxxed ? 'yes' : 'no'}`);
  if (ctx.length) {
    out.push('');
    out.push('**Context:** ' + ctx.join(' · '));
  }

  if (o.notes) {
    out.push('');
    out.push(`**Notes:**  ${o.notes}`);
  }
  if (o.closed_lost_reason) {
    out.push('');
    out.push(`**Closed lost reason:**  ${o.closed_lost_reason}`);
  }
  if (o.website_url) {
    out.push('');
    out.push(`**Website:** ${o.website_url}`);
  }

  return out.join('\n');
}

// ─── Tool: crm_stage_summary (pipeline distribution) ─────────────────

export const crmStageSummarySchema = {};

export async function crmStageSummary(supabase: SupabaseClient): Promise<string> {
  // Paginate the full table — PostgREST caps a single query at 1000 rows
  // (Supabase default), so a single .limit(5000) silently truncates and
  // the resulting counts are wrong. We use .range() the same way the KR
  // cron does to fetch beyond the cap.
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  for (let page = 0; page < 50; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await (supabase as any)
      .from('crm_opportunities')
      .select('stage, account_type')
      .range(from, to);
    if (error) return `Error: ${error.message}`;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  const rows = allRows;

  const byStage: Record<string, number> = {};
  const byAccountType: Record<string, number> = {};
  for (const r of rows) {
    byStage[r.stage || 'unknown'] = (byStage[r.stage || 'unknown'] || 0) + 1;
    byAccountType[r.account_type || '—'] = (byAccountType[r.account_type || '—'] || 0) + 1;
  }

  // Bucket stages into the 4 pipelines the CRM page surfaces.
  // Mirrors the grouping in app/crm/pipeline/page.tsx.
  const PIPELINES: Record<string, string[]> = {
    'Outreach (cold)': ['cold_dm', 'warm', 'tg_intro'],
    'Leads': ['new', 'contacted', 'qualified', 'unqualified', 'nurture', 'dead'],
    'Booked / Discovery': ['booked', 'discovery_done'],
    'Deals': ['deal_qualified', 'proposal', 'proposal_sent', 'proposal_call', 'negotiation', 'contract', 'v2_contract', 'closed_won', 'v2_closed_won', 'closed_lost', 'v2_closed_lost'],
    'Accounts': ['account_active', 'account_at_risk', 'account_churned', 'orbit'],
  };

  const out: string[] = [];
  out.push(`## CRM pipeline — ${rows.length} total opportunities`);
  out.push('');
  for (const [pipeline, stages] of Object.entries(PIPELINES)) {
    const counts = stages.map(s => [s, byStage[s] || 0] as const).filter(([, n]) => n > 0);
    const total = counts.reduce((sum, [, n]) => sum + n, 0);
    if (total === 0) continue;
    out.push(`**${pipeline}** (${total}):`);
    for (const [s, n] of counts.sort((a, b) => b[1] - a[1])) {
      out.push(`  · ${s}: ${n}`);
    }
    out.push('');
  }

  // Catch-all for stages that don't fit the canonical pipelines
  const knownStages = new Set(Object.values(PIPELINES).flat());
  const unknown = Object.entries(byStage).filter(([s, n]) => !knownStages.has(s) && n > 0);
  if (unknown.length > 0) {
    out.push('**Other stages:**');
    for (const [s, n] of unknown.sort((a, b) => b[1] - a[1])) {
      out.push(`  · ${s}: ${n}`);
    }
    out.push('');
  }

  out.push('**By account type:**');
  for (const [t, n] of Object.entries(byAccountType).sort((a, b) => b[1] - a[1])) {
    out.push(`  · ${t}: ${n}`);
  }
  return out.join('\n');
}

// ─── Tool: crm_followups_due ──────────────────────────────────────────
//
// Implements the same logic as planned reminder rule #7 ("crm_followup"):
// active opportunities whose last_contacted_at is older than `threshold_days`
// (default 7) and that aren't in a closed/dead/churned stage.

const CLOSED_STAGES = new Set([
  'closed_won', 'v2_closed_won', 'closed_lost', 'v2_closed_lost',
  'dead', 'unqualified', 'account_churned',
]);

export const crmFollowupsDueSchema = {
  threshold_days: z.number().int().min(1).max(60).default(7)
    .describe('Days since last contact that counts as "stale" (default 7).'),
  owner_id: z.string().uuid().optional()
    .describe('Limit to one owner.'),
  limit: z.number().int().min(1).max(50).default(20),
};

export async function crmFollowupsDue(
  supabase: SupabaseClient,
  args: { threshold_days: number; owner_id?: string; limit: number },
): Promise<string> {
  const cutoff = new Date(Date.now() - args.threshold_days * 86_400_000).toISOString();

  let q = (supabase as any)
    .from('crm_opportunities')
    .select('id, name, stage, owner_id, last_contacted_at, last_message_at, deal_value, currency, poc_handle, composite_score')
    .or(`last_contacted_at.lt.${cutoff},last_contacted_at.is.null`)
    .order('last_contacted_at', { ascending: true, nullsFirst: true })
    .limit(args.limit * 2); // over-fetch so we can filter closed stages locally

  if (args.owner_id) q = q.eq('owner_id', args.owner_id);

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = ((data || []) as any[])
    .filter(r => !CLOSED_STAGES.has(r.stage))
    .slice(0, args.limit);

  if (rows.length === 0) return `No follow-ups due (everything contacted within ${args.threshold_days}d, or only closed opportunities are stale).`;

  const lines = rows.map(r => {
    const lastContact = r.last_contacted_at ? `last: ${relTime(r.last_contacted_at)}` : 'never contacted';
    const value = r.deal_value ? ` · ${formatMoney(r.deal_value)}` : '';
    const score = r.composite_score != null ? ` · score ${r.composite_score}` : '';
    const poc = r.poc_handle ? ` · @${r.poc_handle}` : '';
    return `• ${r.name} [${r.stage}]${value}${score}${poc} — ${lastContact}`;
  });

  return `${rows.length} opportunity(s) needing follow-up (>${args.threshold_days}d since contact):\n\n${lines.join('\n')}`;
}

// ─── Tool: get_promoted_opportunity_for_prospect ─────────────────────
//
// Bridges Intelligence → CRM. When a prospect gets promoted from
// Discovery, prospects.promoted_opportunity_id points at the new CRM
// opportunity. This tool resolves that link both ways:
//   - Given a prospect_id, find the linked opportunity
//   - Useful for "did <project> get promoted, and what stage is it now?"

export const getPromotedOpportunityForProspectSchema = {
  prospect_id: z.string().uuid().describe('Prospect UUID.'),
};

export async function getPromotedOpportunityForProspect(
  supabase: SupabaseClient,
  args: { prospect_id: string },
): Promise<string> {
  const { data: p, error: pErr } = await (supabase as any)
    .from('prospects')
    .select('id, name, status, promoted_opportunity_id')
    .eq('id', args.prospect_id)
    .single();
  if (pErr || !p) return `Prospect not found: ${args.prospect_id}`;

  if (!p.promoted_opportunity_id) {
    return `${p.name} has not been promoted to the CRM. Status: ${p.status || 'needs_review'}.`;
  }

  const { data: opp, error: oErr } = await (supabase as any)
    .from('crm_opportunities')
    .select('id, name, stage, owner_id, account_type, deal_value, currency, composite_score, last_contacted_at, source, created_at')
    .eq('id', p.promoted_opportunity_id)
    .single();
  if (oErr || !opp) {
    return `${p.name} was marked promoted but the linked opportunity (${p.promoted_opportunity_id}) is missing — orphaned link, worth investigating.`;
  }

  const out: string[] = [];
  out.push(`**${p.name}** → CRM opportunity **${opp.name}**`);
  out.push('');
  out.push(`Stage: ${opp.stage}  ·  Source: ${opp.source || '—'}  ·  Account type: ${opp.account_type || '—'}`);
  if (opp.deal_value) out.push(`Deal value: ${formatMoney(opp.deal_value)}`);
  if (opp.composite_score != null) out.push(`Composite score: ${opp.composite_score}`);
  if (opp.last_contacted_at) out.push(`Last contacted: ${relTime(opp.last_contacted_at)}`);
  out.push(`Promoted: ${relTime(opp.created_at)}`);
  out.push('');
  out.push(`Use get_opportunity_detail with id=${opp.id} for the full record.`);
  return out.join('\n');
}
