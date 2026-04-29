import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mcpAuthStorage } from './context';

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
    .describe('Optional exact tier filter. Vocabulary: "Tier S", "Tier 1", "Tier 2", "Tier 3".'),
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
    .limit(150); // over-fetch since we'll collapse duplicates below

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  let rows = (data || []) as any[];
  if (args.exchange !== 'any') {
    rows = rows.filter(r => r.metadata?.exchange === args.exchange);
  }

  // Dedup by (symbol, exchange). Each token can list across multiple
  // market pairs (KRW-X, USDT-X, BTC-X) and each pair fires its own
  // signal — but for an "any new listings?" question that's noise.
  // Collapse to one row per (symbol, exchange), preferring the row
  // with the most prospect-match info and the most recent timestamp.
  // Original headline + market_pair detail go into a per-row "pairs"
  // array shown inline.
  const grouped = new Map<string, {
    symbol: string;
    exchange: string;
    headline: string;
    detectedAt: string;
    matched: boolean;
    pairs: Set<string>;
  }>();
  for (const r of rows) {
    const symbol = (r.metadata?.symbol || r.metadata?.market_pair?.split('-').pop() || '').toUpperCase();
    const exchange = String(r.metadata?.exchange || '').toLowerCase();
    if (!symbol || !exchange) continue; // skip malformed signals
    const key = `${exchange}|${symbol}`;
    const pair = String(r.metadata?.market_pair || '');
    const existing = grouped.get(key);
    if (existing) {
      // Already seen this (symbol, exchange) — fold the new pair in
      // and keep the most recent timestamp / matched flag.
      if (pair) existing.pairs.add(pair);
      if (r.prospect_id) existing.matched = true;
      if (new Date(r.detected_at) > new Date(existing.detectedAt)) {
        existing.detectedAt = r.detected_at;
        existing.headline = r.headline;
      }
    } else {
      grouped.set(key, {
        symbol,
        exchange,
        headline: r.headline,
        detectedAt: r.detected_at,
        matched: !!r.prospect_id,
        pairs: pair ? new Set([pair]) : new Set(),
      });
    }
  }

  const dedupedRows = Array.from(grouped.values())
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());

  if (dedupedRows.length === 0) {
    return `No Korean exchange listings in the last ${args.days} day(s)${args.exchange !== 'any' ? ` on ${args.exchange}` : ''}.`;
  }

  const lines = dedupedRows.map(r => {
    const matched = r.matched ? ' 🎯 (matches a Discovery prospect)' : '';
    const exchangeLabel = r.exchange === 'upbit' ? 'Upbit' : r.exchange === 'bithumb' ? 'Bithumb' : r.exchange;
    // Show the pair list only if there's more than one — single-pair
    // listings already include the pair in the headline.
    const pairList = r.pairs.size > 1
      ? ` [${Array.from(r.pairs).sort().join(', ')}]`
      : '';
    return `• ${r.symbol} listed on ${exchangeLabel}${pairList} — ${relTime(r.detectedAt)}${matched}`;
  });

  // Note the collapse so users understand why the count differs from
  // the raw signal count they might see elsewhere.
  const collapsedNote = rows.length > dedupedRows.length
    ? ` (collapsed from ${rows.length} per-pair signals)`
    : '';
  return `${dedupedRows.length} unique Korean exchange listing(s) in the last ${args.days} day(s)${collapsedNote}:\n\n${lines.join('\n')}`;
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

// ─── Tool: list_clients (the paying customers) ───────────────────────
//
// Distinct from CRM opportunities — clients are the actual contracted
// customers. An opportunity can be promoted into a campaign for an
// existing client, but the client roster itself is its own table.

export const listClientsSchema = {
  active_only: z.boolean().default(true)
    .describe('When true (default), only return non-archived active clients. Set false to include archived/inactive.'),
  search: z.string().optional()
    .describe('Optional case-insensitive name substring search.'),
  limit: z.number().int().min(1).max(100).default(50),
};

export async function listClients(
  supabase: SupabaseClient,
  args: { active_only: boolean; search?: string; limit: number },
): Promise<string> {
  let q = (supabase as any)
    .from('clients')
    .select('id, name, email, location, source, is_active, archived_at, onboarding_call_held, onboarding_call_date, created_at')
    .order('name', { ascending: true })
    .limit(args.limit);

  if (args.active_only) {
    q = q.is('archived_at', null).eq('is_active', true);
  }
  if (args.search) {
    q = q.ilike('name', `%${args.search}%`);
  }

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No clients match.`;

  const lines = rows.map(c => {
    const status = !c.is_active ? ' [inactive]' : c.archived_at ? ' [archived]' : '';
    const onboard = c.onboarding_call_held ? '✓ onboarded' : c.onboarding_call_date ? `onboarding ${c.onboarding_call_date}` : 'not onboarded';
    return `• ${c.name}${status} — ${c.location || '—'} · ${c.email} · ${onboard}`;
  });
  return `${rows.length} client(s):\n\n${lines.join('\n')}`;
}

// ─── Tool: get_client_detail ──────────────────────────────────────────

export const getClientDetailSchema = {
  client_id: z.string().uuid().describe('Client UUID (from list_clients).'),
};

export async function getClientDetail(
  supabase: SupabaseClient,
  args: { client_id: string },
): Promise<string> {
  const { data: c, error } = await (supabase as any)
    .from('clients')
    .select('*')
    .eq('id', args.client_id)
    .single();
  if (error || !c) return `Client not found: ${args.client_id}`;

  // Counts of related entities (cheap aggregates, no row payloads)
  const [campaignsRes, oppsRes] = await Promise.all([
    (supabase as any)
      .from('campaigns')
      .select('id, name, status', { count: 'exact' })
      .eq('client_id', args.client_id)
      .is('archived_at', null),
    (supabase as any)
      .from('crm_opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', args.client_id),
  ]);

  const campaigns = (campaignsRes.data || []) as any[];
  const oppCount = oppsRes.count ?? 0;

  const out: string[] = [];
  out.push(`## ${c.name}`);
  out.push('');
  out.push(`**Status:** ${c.is_active ? 'Active' : 'Inactive'}${c.archived_at ? ' · archived' : ''}`);
  out.push(`**Email:** ${c.email}`);
  if (c.location) out.push(`**Location:** ${c.location}`);
  if (c.source) out.push(`**Source:** ${c.source}`);
  if (c.onboarding_call_date) {
    out.push(`**Onboarding call:** ${c.onboarding_call_date}${c.onboarding_call_held ? ' (held ✓)' : ' (scheduled)'}`);
  }
  out.push(`**Created:** ${relTime(c.created_at)}`);
  out.push('');
  out.push(`**Active campaigns:** ${campaigns.filter(x => x.status !== 'closed').length} of ${campaigns.length} total`);
  for (const camp of campaigns.slice(0, 10)) {
    out.push(`  · ${camp.name} [${camp.status}]`);
  }
  out.push('');
  out.push(`**CRM opportunities linked:** ${oppCount}`);
  out.push('');
  out.push(`Use summarize_client(${c.id}) for the full picture (includes campaigns + payments + delivery logs).`);
  return out.join('\n');
}

// ─── Tool: summarize_client (the killer multi-surface summary) ────────
//
// One-shot answer to "what's the state of <client>?" — pulls campaigns,
// active opportunities, payment status, and recent delivery log entries
// in parallel so Claude gets a holistic view in a single tool call.

export const summarizeClientSchema = {
  client_id: z.string().uuid().describe('Client UUID (from list_clients).'),
  delivery_log_days: z.number().int().min(1).max(180).default(30)
    .describe('Look-back window for client_delivery_log entries (default 30 days).'),
};

export async function summarizeClient(
  supabase: SupabaseClient,
  args: { client_id: string; delivery_log_days: number },
): Promise<string> {
  const sinceCdl = new Date(Date.now() - args.delivery_log_days * 86_400_000).toISOString();

  // All four fetches in parallel — they're independent.
  const [clientRes, campaignsRes, oppsRes, deliveryRes] = await Promise.all([
    (supabase as any).from('clients').select('*').eq('id', args.client_id).single(),
    (supabase as any).from('campaigns').select('id, name, status, start_date, end_date, total_budget, manager').eq('client_id', args.client_id).is('archived_at', null).order('start_date', { ascending: false }).limit(20),
    (supabase as any).from('crm_opportunities').select('id, name, stage, deal_value, currency, last_contacted_at, composite_score').eq('client_id', args.client_id).limit(20),
    (supabase as any).from('client_delivery_log').select('action, work_type, who, method, notes, logged_at').eq('client_id', args.client_id).gte('logged_at', sinceCdl).order('logged_at', { ascending: false }).limit(15),
  ]);

  const c = clientRes.data;
  if (!c) return `Client not found: ${args.client_id}`;
  const campaigns = (campaignsRes.data || []) as any[];
  const opps = (oppsRes.data || []) as any[];
  const deliveryLogs = (deliveryRes.data || []) as any[];

  // Pull payment summary across all this client's campaigns in one query
  const campaignIds = campaigns.map(x => x.id);
  let paymentSummary: { paid: number; pending: number; total: number } = { paid: 0, pending: 0, total: 0 };
  if (campaignIds.length > 0) {
    const { data: payments } = await (supabase as any)
      .from('payments')
      .select('amount, payment_date')
      .in('campaign_id', campaignIds);
    for (const p of (payments || []) as any[]) {
      paymentSummary.total += Number(p.amount) || 0;
      if (p.payment_date) paymentSummary.paid += Number(p.amount) || 0;
      else paymentSummary.pending += Number(p.amount) || 0;
    }
  }

  const out: string[] = [];
  out.push(`# ${c.name}`);
  out.push('');
  out.push(`**Status:** ${c.is_active ? 'Active' : 'Inactive'}${c.archived_at ? ' · archived' : ''}  ·  **Location:** ${c.location || '—'}  ·  **Email:** ${c.email}`);
  if (c.onboarding_call_date) {
    out.push(`**Onboarding:** ${c.onboarding_call_date}${c.onboarding_call_held ? ' ✓ held' : ' (scheduled)'}`);
  }
  out.push('');

  out.push(`## Campaigns (${campaigns.length})`);
  if (campaigns.length === 0) {
    out.push('  No active campaigns.');
  } else {
    for (const camp of campaigns) {
      out.push(`  · ${camp.name} [${camp.status}] — ${formatMoney(camp.total_budget)} · mgr: ${camp.manager || '—'} · ${camp.start_date} → ${camp.end_date || 'open'}`);
    }
  }
  out.push('');

  out.push(`## Payments (across ${campaignIds.length} campaign(s))`);
  out.push(`  Paid: ${formatMoney(paymentSummary.paid)}  ·  Pending: ${formatMoney(paymentSummary.pending)}  ·  Total: ${formatMoney(paymentSummary.total)}`);
  out.push('');

  out.push(`## CRM opportunities linked (${opps.length})`);
  if (opps.length === 0) {
    out.push('  None.');
  } else {
    for (const o of opps.slice(0, 10)) {
      const value = o.deal_value ? ` · ${formatMoney(o.deal_value)}` : '';
      const lastContact = o.last_contacted_at ? ` · contacted ${relTime(o.last_contacted_at)}` : ' · never contacted';
      out.push(`  · ${o.name} [${o.stage}]${value}${lastContact}`);
    }
  }
  out.push('');

  out.push(`## Delivery log — last ${args.delivery_log_days}d (${deliveryLogs.length})`);
  if (deliveryLogs.length === 0) {
    out.push('  No delivery log entries in this window.');
  } else {
    for (const d of deliveryLogs) {
      const who = d.who ? ` by ${d.who}` : '';
      const note = d.notes ? `: ${d.notes.slice(0, 80)}` : '';
      out.push(`  · ${d.action} (${d.work_type})${who}${note} — ${relTime(d.logged_at)}`);
    }
  }

  return out.join('\n');
}

// ─── Tool: get_campaign_detail ───────────────────────────────────────

export const getCampaignDetailSchema = {
  campaign_id: z.string().uuid().describe('Campaign UUID (from list_active_campaigns).'),
};

export async function getCampaignDetail(
  supabase: SupabaseClient,
  args: { campaign_id: string },
): Promise<string> {
  // Campaign + linked client name + roster size + payment summary in parallel
  const [campRes, kolsRes, paymentsRes] = await Promise.all([
    (supabase as any).from('campaigns').select('*, clients(name, email, location)').eq('id', args.campaign_id).single(),
    (supabase as any).from('campaign_kols').select('id, hh_status, client_status, allocated_budget, paid', { count: 'exact' }).eq('campaign_id', args.campaign_id),
    (supabase as any).from('payments').select('amount, payment_date').eq('campaign_id', args.campaign_id),
  ]);

  const c = campRes.data;
  if (!c) return `Campaign not found: ${args.campaign_id}`;
  const kols = (kolsRes.data || []) as any[];
  const payments = (paymentsRes.data || []) as any[];

  // Aggregate KOL roster status
  const hhStatus: Record<string, number> = {};
  const clientStatus: Record<string, number> = {};
  let totalAllocated = 0;
  let totalPaid = 0;
  for (const k of kols) {
    hhStatus[k.hh_status || 'untriaged'] = (hhStatus[k.hh_status || 'untriaged'] || 0) + 1;
    clientStatus[k.client_status || 'untriaged'] = (clientStatus[k.client_status || 'untriaged'] || 0) + 1;
    totalAllocated += Number(k.allocated_budget) || 0;
    totalPaid += Number(k.paid) || 0;
  }

  // Aggregate payment status
  let paymentTotal = 0, paymentPaid = 0, paymentPending = 0;
  for (const p of payments) {
    paymentTotal += Number(p.amount) || 0;
    if (p.payment_date) paymentPaid += Number(p.amount) || 0;
    else paymentPending += Number(p.amount) || 0;
  }

  const out: string[] = [];
  out.push(`## ${c.name}`);
  out.push('');
  out.push(`**Client:** ${c.clients?.name || '—'} (${c.clients?.location || '—'})`);
  out.push(`**Status:** ${c.status}  ·  **Region:** ${c.region || '—'}  ·  **Manager:** ${c.manager || '—'}`);
  out.push(`**Dates:** ${c.start_date} → ${c.end_date || 'open'}`);
  out.push(`**Budget:** ${formatMoney(c.total_budget)}${Array.isArray(c.budget_type) && c.budget_type.length ? ` (${c.budget_type.join(', ')})` : ''}`);
  if (c.intro_call != null) out.push(`**Intro call:** ${c.intro_call ? '✓' : '—'}${c.intro_call_date ? ` (${c.intro_call_date})` : ''}`);
  if (c.nda_signed != null) out.push(`**NDA signed:** ${c.nda_signed ? '✓' : '—'}`);
  if (c.proposal_sent != null) out.push(`**Proposal sent:** ${c.proposal_sent ? '✓' : '—'}`);
  out.push('');

  out.push(`## KOL roster (${kols.length})`);
  out.push(`  Allocated budget: ${formatMoney(totalAllocated)}  ·  Paid: ${formatMoney(totalPaid)}`);
  if (Object.keys(hhStatus).length > 0) {
    out.push(`  HH status: ${Object.entries(hhStatus).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  if (Object.keys(clientStatus).length > 0) {
    out.push(`  Client status: ${Object.entries(clientStatus).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  out.push('');

  out.push(`## Payments (${payments.length})`);
  out.push(`  Paid: ${formatMoney(paymentPaid)}  ·  Pending: ${formatMoney(paymentPending)}  ·  Total: ${formatMoney(paymentTotal)}`);
  out.push('');

  out.push(`Use list_campaign_kols(${c.id}) for the roster, get_campaign_payments(${c.id}) for payment line items.`);
  if (c.description) {
    out.push('');
    out.push(`**Description:** ${c.description}`);
  }
  return out.join('\n');
}

// ─── Tool: list_campaign_kols (roster for one campaign) ──────────────

export const listCampaignKolsSchema = {
  campaign_id: z.string().uuid().describe('Campaign UUID.'),
  status_filter: z.enum(['any', 'pending', 'confirmed', 'completed', 'rejected'])
    .default('any')
    .describe('Optional hh_status filter — pending/confirmed/etc. "any" returns all.'),
  limit: z.number().int().min(1).max(100).default(50),
};

export async function listCampaignKols(
  supabase: SupabaseClient,
  args: { campaign_id: string; status_filter: string; limit: number },
): Promise<string> {
  let q = (supabase as any)
    .from('campaign_kols')
    .select('id, hh_status, client_status, allocated_budget, paid, hidden, master_kols(id, name, tier, region, followers, link, platform)')
    .eq('campaign_id', args.campaign_id)
    .order('allocated_budget', { ascending: false, nullsFirst: false })
    .limit(args.limit);

  if (args.status_filter !== 'any') {
    q = q.eq('hh_status', args.status_filter);
  }

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No KOLs match this filter on the campaign.`;

  const fmtFollowers = (n: number | null) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  const lines = rows.map(r => {
    const k = r.master_kols || {};
    const budget = r.allocated_budget ? ` · ${formatMoney(r.allocated_budget)}` : '';
    const paid = r.paid ? ` paid:${formatMoney(r.paid)}` : '';
    const status = `[hh:${r.hh_status || 'untriaged'} · client:${r.client_status || 'untriaged'}]`;
    const hidden = r.hidden ? ' (hidden)' : '';
    return `• ${k.name || '?'} — ${k.tier || '?'} tier · ${fmtFollowers(k.followers)} followers · ${k.region || '—'} ${status}${budget}${paid}${hidden}`;
  });
  return `${rows.length} KOL(s) in this campaign:\n\n${lines.join('\n')}`;
}

// ─── Tool: get_campaign_payments ─────────────────────────────────────

export const getCampaignPaymentsSchema = {
  campaign_id: z.string().uuid().describe('Campaign UUID.'),
  status: z.enum(['any', 'paid', 'pending']).default('any')
    .describe('Filter to paid (payment_date set) or pending (payment_date null). "any" returns both.'),
};

export async function getCampaignPayments(
  supabase: SupabaseClient,
  args: { campaign_id: string; status: 'any' | 'paid' | 'pending' },
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('payments')
    .select('id, amount, payment_method, payment_category, payment_date, recipient_name, notes, transaction_id, campaign_kol_id, created_at')
    .eq('campaign_id', args.campaign_id)
    .order('payment_date', { ascending: false, nullsFirst: true })
    .limit(100);

  if (error) return `Error: ${error.message}`;
  let rows = (data || []) as any[];
  if (args.status === 'paid') rows = rows.filter(r => r.payment_date);
  else if (args.status === 'pending') rows = rows.filter(r => !r.payment_date);
  if (rows.length === 0) return `No ${args.status === 'any' ? '' : args.status + ' '}payments found.`;

  let totalPaid = 0, totalPending = 0;
  for (const r of rows) {
    if (r.payment_date) totalPaid += Number(r.amount) || 0;
    else totalPending += Number(r.amount) || 0;
  }

  const lines = rows.map(r => {
    const status = r.payment_date ? `✓ paid ${r.payment_date}` : '○ pending';
    const recipient = r.recipient_name ? ` → ${r.recipient_name}` : '';
    const method = r.payment_method ? ` · ${r.payment_method}` : '';
    const cat = r.payment_category ? ` (${r.payment_category})` : '';
    return `• ${formatMoney(r.amount)}${recipient}${method}${cat} — ${status}`;
  });

  return `${rows.length} payment(s) — paid ${formatMoney(totalPaid)} · pending ${formatMoney(totalPending)}:\n\n${lines.join('\n')}`;
}

// ─── Tool: list_top_kols (filtered ranking, no name needed) ──────────
//
// Complement to search_kols — search_kols requires a query string.
// list_top_kols answers "show me the best KOLs matching <criteria>"
// without needing to know any specific name. Sorted by followers desc.

export const listTopKolsSchema = {
  region: z.string().optional()
    .describe('Region filter (e.g. "Korea", "Global"). Case-insensitive substring.'),
  tier: z.string().optional()
    .describe('Exact tier match. Vocabulary in this database: "Tier S", "Tier 1", "Tier 2", "Tier 3" (top → bottom).'),
  niche: z.string().optional()
    .describe('Niche substring match (e.g. "DeFi", "GameFi", "L1").'),
  platform: z.string().optional()
    .describe('Platform substring match (e.g. "twitter", "youtube", "tiktok").'),
  min_followers: z.number().int().min(0).optional()
    .describe('Minimum follower count.'),
  in_house_only: z.boolean().default(false)
    .describe('When true, only return in-house KOLs (in_house field is set).'),
  limit: z.number().int().min(1).max(100).default(25),
};

export async function listTopKols(
  supabase: SupabaseClient,
  args: {
    region?: string; tier?: string; niche?: string; platform?: string;
    min_followers?: number; in_house_only: boolean; limit: number;
  },
): Promise<string> {
  let q = (supabase as any)
    .from('master_kols')
    .select('id, name, region, tier, followers, niche, platform, content_type, in_house, link, pricing, rating')
    .is('archived_at', null)
    .order('followers', { ascending: false, nullsFirst: false })
    .limit(args.limit * 2); // over-fetch to allow client-side niche/platform filtering on array columns

  if (args.region) q = q.ilike('region', `%${args.region}%`);
  if (args.tier) q = q.eq('tier', args.tier);
  if (args.min_followers != null) q = q.gte('followers', args.min_followers);
  if (args.in_house_only) q = q.not('in_house', 'is', null);

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  let rows = (data || []) as any[];

  // niche and platform are TEXT[] columns — filter client-side because
  // PostgREST array containment with ILIKE inside is awkward to express
  // safely. The over-fetch above absorbs the filter loss.
  if (args.niche) {
    const t = args.niche.toLowerCase();
    rows = rows.filter(r => Array.isArray(r.niche) && r.niche.some((n: string) => n.toLowerCase().includes(t)));
  }
  if (args.platform) {
    const t = args.platform.toLowerCase();
    rows = rows.filter(r => Array.isArray(r.platform) && r.platform.some((p: string) => p.toLowerCase().includes(t)));
  }
  rows = rows.slice(0, args.limit);

  if (rows.length === 0) {
    const filters = [
      args.region && `region~"${args.region}"`,
      args.tier && `tier=${args.tier}`,
      args.niche && `niche~"${args.niche}"`,
      args.platform && `platform~"${args.platform}"`,
      args.min_followers != null && `followers≥${args.min_followers}`,
      args.in_house_only && 'in-house',
    ].filter(Boolean).join(', ');
    return `No KOLs match: ${filters}`;
  }

  const fmtFollowers = (n: number | null) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  const lines = rows.map(k => {
    const niches = Array.isArray(k.niche) && k.niche.length ? ` · ${k.niche.slice(0, 3).join('/')}` : '';
    const plats = Array.isArray(k.platform) && k.platform.length ? ` · ${k.platform.join('+')}` : '';
    const inHouse = k.in_house ? ` · in-house: ${k.in_house}` : '';
    const rating = k.rating != null ? ` · ★${k.rating}` : '';
    return `• ${k.name} — ${k.tier || '?'} tier · ${fmtFollowers(k.followers)} followers · ${k.region || '—'}${niches}${plats}${inHouse}${rating}`;
  });
  return `${rows.length} KOL(s):\n\n${lines.join('\n')}`;
}

// ─── Tool: get_kol_detail ─────────────────────────────────────────────

export const getKolDetailSchema = {
  kol_id: z.string().uuid().describe('Master KOL UUID (from list_top_kols or search_kols).'),
};

export async function getKolDetail(
  supabase: SupabaseClient,
  args: { kol_id: string },
): Promise<string> {
  const { data: k, error } = await (supabase as any)
    .from('master_kols')
    .select('*')
    .eq('id', args.kol_id)
    .single();
  if (error || !k) return `KOL not found: ${args.kol_id}`;

  const fmtFollowers = (n: number | null) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const out: string[] = [];
  out.push(`## ${k.name}`);
  out.push('');
  out.push(`**Tier:** ${k.tier || '?'}  ·  **Region:** ${k.region || '—'}  ·  **Followers:** ${fmtFollowers(k.followers)}`);
  if (k.rating != null) out.push(`**Rating:** ★${k.rating}/10`);
  if (Array.isArray(k.platform) && k.platform.length) out.push(`**Platforms:** ${k.platform.join(', ')}`);
  if (Array.isArray(k.niche) && k.niche.length) out.push(`**Niche:** ${k.niche.join(', ')}`);
  if (Array.isArray(k.content_type) && k.content_type.length) out.push(`**Content type:** ${k.content_type.join(', ')}`);
  if (Array.isArray(k.creator_type) && k.creator_type.length) out.push(`**Creator type:** ${k.creator_type.join(', ')}`);
  if (Array.isArray(k.deliverables) && k.deliverables.length) out.push(`**Deliverables:** ${k.deliverables.join(', ')}`);
  if (k.pricing) out.push(`**Pricing:** ${k.pricing}`);
  if (k.in_house) out.push(`**In-house:** ${k.in_house}`);
  if (k.link) out.push(`**Link:** ${k.link}`);
  if (k.wallet) out.push(`**Wallet:** ${k.wallet}`);
  if (k.community != null) out.push(`**Has community:** ${k.community ? 'yes' : 'no'}`);
  if (k.group_chat != null) out.push(`**Group chat:** ${k.group_chat ? 'yes' : 'no'}`);
  if (k.description) {
    out.push('');
    out.push(`**Description:**  ${k.description}`);
  }
  return out.join('\n');
}

// ─── Tool: log_crm_activity (the one write tool) ─────────────────────
//
// Logs a CRM activity (call, message, meeting, etc.) on an opportunity
// AND bumps the opportunity's last_contacted_at so follow-up tools
// (crm_followups_due) reflect the contact. This is the workflow-changing
// tool — instead of "I had a call, I'll log it later" → never logs it,
// the user can dictate from chat in seconds.
//
// IMPORTANT for Claude: ALWAYS confirm with the user before calling this
// tool. Repeat back the opportunity name (not just the ID), the activity
// type, the title, and any description. Wait for explicit yes. Tool
// description below repeats this so the model has context.

export const logCrmActivitySchema = {
  opportunity_id: z.string().uuid().describe('UUID of the CRM opportunity to log against.'),
  type: z.enum(['call', 'message', 'meeting', 'proposal', 'note', 'bump'])
    .describe('Activity type. Use call/meeting for live conversations, message for written outreach, proposal when sending a pricing doc, note for general updates, bump for follow-up nudges.'),
  title: z.string().min(1).max(200)
    .describe('Short title for the activity (e.g. "Korean DEX integration discussion", "Bump 3 — checking on contract").'),
  description: z.string().max(2000).optional()
    .describe('Optional longer body. Use for meeting notes, key takeaways, decisions made.'),
  outcome: z.string().max(500).optional()
    .describe('Optional outcome summary (e.g. "Agreed to terms", "Wants to wait until Q3", "Needs to loop in CEO").'),
  next_step: z.string().max(500).optional()
    .describe('Optional next-step description (e.g. "Send proposal by Friday", "Schedule follow-up in 2 weeks").'),
  next_step_date: z.string().optional()
    .describe('Optional ISO date for the next step (YYYY-MM-DD).'),
};

export async function logCrmActivity(
  supabase: SupabaseClient,
  args: {
    opportunity_id: string;
    type: 'call' | 'message' | 'meeting' | 'proposal' | 'note' | 'bump';
    title: string;
    description?: string;
    outcome?: string;
    next_step?: string;
    next_step_date?: string;
  },
): Promise<string> {
  // Sanity: confirm the opportunity exists before writing
  const { data: opp, error: oppErr } = await (supabase as any)
    .from('crm_opportunities')
    .select('id, name, stage, last_contacted_at, last_message_at')
    .eq('id', args.opportunity_id)
    .single();
  if (oppErr || !opp) return `Opportunity not found: ${args.opportunity_id}. Refusing to log.`;

  // Pull the calling user's id from the per-request auth context so the
  // activity is attributed correctly. If somehow the storage isn't set
  // (e.g., called outside an MCP request) we fall back to null — the
  // activity still logs, just without owner attribution.
  const ctx = mcpAuthStorage.getStore();
  const ownerId = ctx?.user_id ?? null;

  // Insert the activity row
  const { data: activity, error: actErr } = await (supabase as any)
    .from('crm_activities')
    .insert({
      opportunity_id: args.opportunity_id,
      type: args.type,
      title: args.title,
      description: args.description ?? null,
      outcome: args.outcome ?? null,
      next_step: args.next_step ?? null,
      next_step_date: args.next_step_date ?? null,
      owner_id: ownerId,
    })
    .select('id, created_at')
    .single();
  if (actErr) return `Failed to log activity: ${actErr.message}`;

  // Bump the opportunity's last_contacted_at (and last_message_at for
  // type='message'). Mirrors what the in-app activity log does. Skip
  // recalc-temperature — that's a derived score the in-app service
  // computes; for chat-logged activities it's fine to wait until the
  // next in-app touch to refresh.
  const update: any = {
    last_contacted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (args.type === 'message') {
    update.last_message_at = new Date().toISOString();
  }
  await (supabase as any)
    .from('crm_opportunities')
    .update(update)
    .eq('id', args.opportunity_id);

  // Pretty confirmation back to Claude/user
  const out: string[] = [];
  out.push(`✓ Logged ${args.type} on **${opp.name}**`);
  out.push(`  Title: "${args.title}"`);
  if (args.outcome) out.push(`  Outcome: ${args.outcome}`);
  if (args.next_step) out.push(`  Next step: ${args.next_step}${args.next_step_date ? ` (by ${args.next_step_date})` : ''}`);
  out.push(`  last_contacted_at bumped to now${args.type === 'message' ? '; last_message_at also bumped' : ''}.`);
  out.push(`  Activity id: ${activity.id}`);
  return out.join('\n');
}
