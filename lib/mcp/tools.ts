import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { computeRosterScores, tierForScore } from '@/lib/kolScoringEngine';
import { mcpAuthStorage } from '@/lib/mcp/context';

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
    // UUID prefix so the caller can chain into get_prospect_detail without
    // a second query. Same fix as search_kols / list_top_kols.
    return `• [${r.id}] ${r.name}${r.symbol ? ` ($${r.symbol})` : ''} — ${tier}${statusBadge} · ${r.source || '—'}${fundingStr}${koreaListed} · ${relTime(r.created_at)}`;
  });

  const filterLabel = [
    args.tier !== 'any' && args.tier,
    args.status !== 'any' && args.status,
    args.source,
  ].filter(Boolean).join(', ');
  const filterSuffix = filterLabel ? ` (${filterLabel})` : '';
  return `${rows.length} prospect(s) in last ${args.days}d${filterSuffix}, sorted by ${args.sort_by}:\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_prospect_detail for full scoring, signals, and links.`;
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
    // UUID prefix → chains into get_campaign_detail / list_campaign_kols.
    return `• [${c.id}] ${c.name} (${clientName}) — ${c.status} · ${formatMoney(c.total_budget)} · ${c.region || '—'} · mgr: ${c.manager || '—'} · started ${relTime(c.start_date)}`;
  });

  return `${rows.length} active campaign(s):\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_campaign_detail, list_campaign_kols, or get_campaign_payments.`;
}

// ─── Tool: search_kols ────────────────────────────────────────────────

export const searchKolsSchema = {
  query: z.string().min(1).max(100)
    .describe('Search by name (case-insensitive substring match).'),
  region: z.string().optional()
    .describe('Optional region filter (e.g. "Korea", "Global").'),
  // `tier` filter removed — column dropped in migration 071. Will be
  // replaced by a Score-based filter once Phase 3 ships scoring.
  limit: z.number().int().min(1).max(50).default(20),
};

export async function searchKols(
  supabase: SupabaseClient,
  args: { query: string; region?: string; limit: number },
): Promise<string> {
  let q = (supabase as any)
    .from('master_kols')
    .select('id, name, region, followers, niche, platform, link, in_house, archived_at')
    .is('archived_at', null)
    .ilike('name', `%${args.query}%`)
    .order('followers', { ascending: false, nullsFirst: false })
    .limit(args.limit);

  if (args.region) q = q.ilike('region', args.region);
  // tier filter removed (migration 071).

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No KOLs match "${args.query}"${args.region ? ` (region=${args.region})` : ''}.`;

  const fmtFollowers = (n: number | null) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  const lines = rows.map(k => {
    const niches = Array.isArray(k.niche) && k.niche.length ? ` · ${k.niche.slice(0, 3).join('/')}` : '';
    const plats = Array.isArray(k.platform) && k.platform.length ? ` · ${k.platform.join('+')}` : '';
    // Emit the UUID so the caller can pivot to get_kol_detail without
    // a second search. Without this, the schema description for
    // get_kol_detail ("from list_top_kols or search_kols") is a lie —
    // the UUID isn't anywhere in the response.
    return `• [${k.id}] ${k.name} — ${fmtFollowers(k.followers)} followers · ${k.region || '—'}${niches}${plats}${k.in_house ? ` · in-house: ${k.in_house}` : ''}`;
  });

  return `${rows.length} KOL(s) matching "${args.query}":\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_kol_detail for full info (link, wallet, pricing, etc.).`;
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
    // UUID prefix → chains into get_opportunity_detail. Stage moves to
    // `stage=...` notation so the brackets stay UUID-only.
    return `• [${r.id}] ${r.name} · stage=${r.stage}${value}${score}${poc}${lastContact}`;
  });
  return `${rows.length} CRM opportunity(s):\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_opportunity_detail for full scoring, timeline, and qualification flags.`;
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
    return `• [${r.id}] ${r.name} · stage=${r.stage}${value}${score}${poc} — ${lastContact}`;
  });

  return `${rows.length} opportunity(s) needing follow-up (>${args.threshold_days}d since contact):\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_opportunity_detail.`;
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
    // status moves to `status=` notation so the leading [brackets]
    // stay UUID-only across all list tools.
    const status = !c.is_active ? ' · status=inactive' : c.archived_at ? ' · status=archived' : '';
    const onboard = c.onboarding_call_held ? '✓ onboarded' : c.onboarding_call_date ? `onboarding ${c.onboarding_call_date}` : 'not onboarded';
    return `• [${c.id}] ${c.name}${status} — ${c.location || '—'} · ${c.email} · ${onboard}`;
  });
  return `${rows.length} client(s):\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_client_detail or summarize_client.`;
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
    // tier removed from joined select (migration 071 dropped the column).
    .select('id, hh_status, client_status, allocated_budget, paid, hidden, master_kols(id, name, region, followers, link, platform)')
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
    // The UUID surfaced here is the master_kol.id so the caller can
    // pivot to get_kol_detail. campaign_kols.id is internal — usually
    // not what callers need.
    const status = `hh=${r.hh_status || 'untriaged'} · client=${r.client_status || 'untriaged'}`;
    const hidden = r.hidden ? ' (hidden)' : '';
    return `• [${k.id || '—'}] ${k.name || '?'} — ${fmtFollowers(k.followers)} followers · ${k.region || '—'} · ${status}${budget}${paid}${hidden}`;
  });
  return `${rows.length} KOL(s) in this campaign:\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_kol_detail for full info on any KOL.`;
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
  // tier filter removed — column dropped in migration 071. The doc-spec
  // replacement is a Score-based filter once Phase 3 ships.
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
    region?: string; niche?: string; platform?: string;
    min_followers?: number; in_house_only: boolean; limit: number;
  },
): Promise<string> {
  let q = (supabase as any)
    .from('master_kols')
    // tier and rating dropped from select (migration 071).
    .select('id, name, region, followers, niche, platform, content_type, in_house, link, pricing')
    .is('archived_at', null)
    .order('followers', { ascending: false, nullsFirst: false })
    .limit(args.limit * 2); // over-fetch to allow client-side niche/platform filtering on array columns

  if (args.region) q = q.ilike('region', `%${args.region}%`);
  // tier filter removed (migration 071).
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
    // tier/rating display removed (migration 071). Score will replace it
    // once Phase 3 ships.
    // UUID up front for the same reason as search_kols — the caller
    // needs it to chain into get_kol_detail.
    return `• [${k.id}] ${k.name} — ${fmtFollowers(k.followers)} followers · ${k.region || '—'}${niches}${plats}${inHouse}`;
  });
  return `${rows.length} KOL(s):\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_kol_detail for full info (link, wallet, pricing, etc.).`;
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
  // Tier and Rating lines removed (migration 071 dropped both columns).
  // Phase 3 will add a Score line here once kol_channel_snapshots +
  // the composite scoring formula ship.
  out.push(`**Region:** ${k.region || '—'}  ·  **Followers:** ${fmtFollowers(k.followers)}`);
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

// ─── Tool: list_team_tasks ────────────────────────────────────────────
//
// Browse the team's task list with filters by owner, status, due-date
// window. Useful for "what's on my plate today" / "what's overdue
// across the team" / "show me X's tasks for this week" questions.

export const listTeamTasksSchema = {
  owner_id: z.string().uuid().optional()
    .describe('Filter to one assignee (UUID). Omit for all-owners view.'),
  status: z.enum(['any', 'open', 'in_progress', 'completed', 'blocked'])
    .default('open')
    .describe('Task status filter. Default "open" excludes completed tasks.'),
  due_within_days: z.number().int().min(1).max(60).optional()
    .describe('Only show tasks due within the next N days (also includes overdue). Omit for no due-date filter.'),
  client_id: z.string().uuid().optional()
    .describe('Filter to tasks linked to one client.'),
  limit: z.number().int().min(1).max(50).default(25),
};

export async function listTeamTasks(
  supabase: SupabaseClient,
  args: {
    owner_id?: string;
    status: 'any' | 'open' | 'in_progress' | 'completed' | 'blocked';
    due_within_days?: number;
    client_id?: string;
    limit: number;
  },
): Promise<string> {
  let q = (supabase as any)
    .from('tasks')
    .select('id, task_name, task_type, status, priority, frequency, due_date, assigned_to_name, created_by_name, client_id, latest_comment, link, created_at')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(args.limit);

  if (args.status !== 'any') {
    q = q.eq('status', args.status);
  }
  if (args.owner_id) q = q.eq('assigned_to', args.owner_id);
  if (args.client_id) q = q.eq('client_id', args.client_id);
  if (args.due_within_days != null) {
    const cutoff = new Date(Date.now() + args.due_within_days * 86_400_000).toISOString();
    q = q.lte('due_date', cutoff);
  }

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No tasks match the filter.`;

  const lines = rows.map(t => {
    const owner = t.assigned_to_name ? ` · ${t.assigned_to_name}` : '';
    const due = t.due_date
      ? (() => {
          const ms = new Date(t.due_date).getTime() - Date.now();
          const days = Math.round(ms / 86_400_000);
          if (days < 0) return ` · OVERDUE ${Math.abs(days)}d`;
          if (days === 0) return ' · due today';
          if (days <= 3) return ` · due in ${days}d`;
          return ` · due ${new Date(t.due_date).toISOString().slice(0, 10)}`;
        })()
      : '';
    const priority = t.priority && t.priority !== 'normal' ? ` · priority=${t.priority}` : '';
    return `• [${t.id}] ${t.task_name} · status=${t.status}${priority}${due}${owner}`;
  });
  return `${rows.length} task(s):\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_task_detail.`;
}

// ─── Tool: get_task_detail ────────────────────────────────────────────

export const getTaskDetailSchema = {
  task_id: z.string().uuid().describe('Task UUID (from list_team_tasks).'),
};

export async function getTaskDetail(
  supabase: SupabaseClient,
  args: { task_id: string },
): Promise<string> {
  const { data: t, error } = await (supabase as any)
    .from('tasks')
    .select('*, clients(name)')
    .eq('id', args.task_id)
    .single();
  if (error || !t) return `Task not found: ${args.task_id}`;

  const out: string[] = [];
  out.push(`## ${t.task_name}`);
  out.push('');
  out.push(`**Status:** ${t.status}  ·  **Priority:** ${t.priority}  ·  **Type:** ${t.task_type}`);
  if (t.frequency && t.frequency !== 'once') out.push(`**Frequency:** ${t.frequency}`);
  if (t.assigned_to_name) out.push(`**Assigned to:** ${t.assigned_to_name}`);
  if (t.created_by_name) out.push(`**Created by:** ${t.created_by_name} · ${relTime(t.created_at)}`);
  if (t.due_date) {
    const ms = new Date(t.due_date).getTime() - Date.now();
    const days = Math.round(ms / 86_400_000);
    const status = days < 0 ? `OVERDUE ${Math.abs(days)}d` : days === 0 ? 'due today' : `due in ${days}d`;
    out.push(`**Due:** ${t.due_date.slice(0, 10)} (${status})`);
  }
  if (t.completed_at) out.push(`**Completed:** ${relTime(t.completed_at)}`);
  if (t.clients?.name) out.push(`**Client:** ${t.clients.name}`);
  if (t.link) out.push(`**Link:** ${t.link}`);
  if (t.description) {
    out.push('');
    out.push(`**Description:**  ${t.description}`);
  }
  if (t.latest_comment) {
    out.push('');
    out.push(`**Latest comment:**  ${t.latest_comment}`);
  }
  return out.join('\n');
}

// ─── Tool: list_form_submissions ──────────────────────────────────────
//
// Lists recent form_responses across all forms (or one specific form),
// optionally within a recency window. Useful for "what came in this week"
// type questions — you'd already get a Telegram alert per submission, but
// querying lets you sweep + summarize.

export const listFormSubmissionsSchema = {
  form_id: z.string().uuid().optional()
    .describe('Filter to one specific form (UUID). Omit for all forms.'),
  days: z.number().int().min(1).max(90).default(7)
    .describe('Look-back window in days (default 7).'),
  client_id: z.string().uuid().optional()
    .describe('Filter to submissions linked to one client.'),
  limit: z.number().int().min(1).max(50).default(25),
};

export async function listFormSubmissions(
  supabase: SupabaseClient,
  args: { form_id?: string; days: number; client_id?: string; limit: number },
): Promise<string> {
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();
  let q = (supabase as any)
    .from('form_responses')
    .select('id, form_id, submitted_at, submitted_by_name, submitted_by_email, client_id, forms(name)')
    .gte('submitted_at', since)
    .order('submitted_at', { ascending: false })
    .limit(args.limit);
  if (args.form_id) q = q.eq('form_id', args.form_id);
  if (args.client_id) q = q.eq('client_id', args.client_id);

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) {
    return `No form submissions in the last ${args.days} day(s)${args.form_id ? ' for that form' : ''}.`;
  }

  const lines = rows.map(r => {
    const who = r.submitted_by_name || r.submitted_by_email || 'anonymous';
    const formName = r.forms?.name || 'Unknown form';
    return `• [${r.id}] ${formName} — submitted by ${who} · ${relTime(r.submitted_at)}`;
  });

  // Per-form breakdown helps when many forms in one window
  const byForm: Record<string, number> = {};
  for (const r of rows) {
    const k = r.forms?.name || 'Unknown';
    byForm[k] = (byForm[k] || 0) + 1;
  }
  const breakdown = Object.entries(byForm)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}: ${n}`)
    .join(', ');

  return `${rows.length} form submission(s) in last ${args.days}d (${breakdown}):\n\n${lines.join('\n')}\n\nUse the UUID in [brackets] to call get_form_submission_detail for the full response payload.`;
}

// ─── Tool: get_form_submission_detail ─────────────────────────────────
//
// Full submission with all answers in `response_data`. JSONB shape varies
// per form definition, so we pretty-print the JSON for Claude to interpret.

export const getFormSubmissionDetailSchema = {
  submission_id: z.string().uuid().describe('Form submission UUID (from list_form_submissions).'),
};

export async function getFormSubmissionDetail(
  supabase: SupabaseClient,
  args: { submission_id: string },
): Promise<string> {
  const { data: s, error } = await (supabase as any)
    .from('form_responses')
    .select('id, form_id, submitted_at, submitted_by_name, submitted_by_email, response_data, client_id, forms(name, description), clients(name)')
    .eq('id', args.submission_id)
    .single();
  if (error || !s) return `Submission not found: ${args.submission_id}`;

  const out: string[] = [];
  out.push(`## ${s.forms?.name || 'Form submission'}`);
  out.push('');
  out.push(`**Submitted:** ${relTime(s.submitted_at)} · ${new Date(s.submitted_at).toISOString().slice(0, 16).replace('T', ' ')}`);
  if (s.submitted_by_name || s.submitted_by_email) {
    out.push(`**By:** ${s.submitted_by_name || ''}${s.submitted_by_email ? ` <${s.submitted_by_email}>` : ''}`);
  }
  if (s.clients?.name) out.push(`**Client:** ${s.clients.name}`);
  if (s.forms?.description) {
    out.push('');
    out.push(`**Form description:** ${s.forms.description}`);
  }

  // Render response_data answers. Shape is form-specific JSONB; usually
  // a flat object of question label → answer, but can be nested. Pretty-
  // print as key/value lines for the easy case, fall back to raw JSON.
  out.push('');
  out.push('**Answers:**');
  const rd = s.response_data;
  if (rd && typeof rd === 'object' && !Array.isArray(rd)) {
    for (const [key, value] of Object.entries(rd)) {
      const v = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      out.push(`  · ${key}: ${v.length > 200 ? v.slice(0, 200) + '…' : v}`);
    }
  } else {
    out.push('```json');
    out.push(JSON.stringify(rd, null, 2));
    out.push('```');
  }
  return out.join('\n');
}

// ════════════════════════════════════════════════════════════════════════
// KOL Database Overhaul — Phase 4 MCP tools
// ════════════════════════════════════════════════════════════════════════
//
// Per the May 2026 spec. Six new tools that expose the kol_deliverables /
// kol_channel_snapshots / kol_call_logs surfaces to Claude:
//
//   READ:  get_kol_deliverables, get_kol_score, get_kol_channel_snapshot,
//          get_kol_call_log
//   WRITE: log_deliverable, log_call
//
// The two write tools are a deliberate departure from the previously
// read-only MCP server. They're scoped narrowly (only insert into the
// new Phase 2/3 tables; no UPDATE / DELETE) and use AsyncLocalStorage
// to attribute every insert to the calling user via mcp_oauth_access_tokens.
// Token revocation already disables both read and write access.

// ─── Tool: get_kol_deliverables ───────────────────────────────────────

export const getKolDeliverablesSchema = {
  kol_id: z.string().uuid().describe('Master KOL UUID — get from search_kols or list_top_kols.'),
  campaign_id: z.string().uuid().optional()
    .describe('Optional campaign UUID — when provided, only deliverables for this campaign are returned.'),
  limit: z.number().int().min(1).max(100).default(20),
};

export async function getKolDeliverables(
  supabase: SupabaseClient,
  args: { kol_id: string; campaign_id?: string; limit: number },
): Promise<string> {
  let q = (supabase as any)
    .from('kol_deliverables')
    .select('*, campaign:campaigns(name, slug)')
    .eq('kol_id', args.kol_id)
    .order('date_posted', { ascending: false })
    .limit(args.limit);
  if (args.campaign_id) q = q.eq('campaign_id', args.campaign_id);

  const { data, error } = await q;
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) {
    return args.campaign_id
      ? `No deliverables logged for this KOL on the specified campaign.`
      : `No deliverables logged for this KOL.`;
  }

  const fmtNum = (n: number | null | undefined) => (n != null ? n.toLocaleString() : '—');
  const lines = rows.map((d) => {
    const dated = d.date_posted ? new Date(d.date_posted).toISOString().slice(0, 10) : '—';
    const campaign = d.campaign?.name || '?';
    return [
      `• [${d.id}] #${d.brief_number} ${d.brief_topic} — ${campaign} (posted ${dated})`,
      `    post: ${d.post_link}`,
      `    24h_views=${fmtNum(d.views_24h)} · 48h_views=${fmtNum(d.views_48h)} · forwards=${fmtNum(d.forwards)} · reactions=${fmtNum(d.reactions)} · activations=${fmtNum(d.activation_participants)}`,
      d.notes ? `    notes: ${d.notes}` : null,
    ].filter(Boolean).join('\n');
  });

  return `${rows.length} deliverable(s):\n\n${lines.join('\n\n')}`;
}

// ─── Tool: get_kol_score ──────────────────────────────────────────────

export const getKolScoreSchema = {
  kol_id: z.string().uuid().describe('Master KOL UUID.'),
};

export async function getKolScore(
  supabase: SupabaseClient,
  args: { kol_id: string },
): Promise<string> {
  // Score requires roster-wide normalization (each dimension is min-max
  // scaled across the whole population). So a per-KOL request still
  // pulls everyone's data. ~200-500ms typical at <500 KOLs — acceptable
  // for an MCP call.
  const [kolsRes, delivRes, snapRes] = await Promise.all([
    (supabase as any).from('master_kols').select('id, name').is('archived_at', null),
    (supabase as any).from('kol_deliverables').select('*').limit(2000),
    (supabase as any)
      .from('kol_channel_snapshots')
      .select('*')
      .gte('snapshot_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
  ]);

  if (kolsRes.error) return `Error: ${kolsRes.error.message}`;
  const kols = (kolsRes.data || []) as Array<{ id: string; name: string }>;
  const target = kols.find((k) => k.id === args.kol_id);
  if (!target) return `KOL not found: ${args.kol_id}`;

  // Group deliverables + snapshots by kol_id for the scoring engine.
  const delivByKol = new Map<string, any[]>();
  for (const d of (delivRes.data || []) as any[]) {
    if (!delivByKol.has(d.kol_id)) delivByKol.set(d.kol_id, []);
    delivByKol.get(d.kol_id)!.push(d);
  }
  const snapByKol = new Map<string, any[]>();
  for (const s of (snapRes.data || []) as any[]) {
    if (!snapByKol.has(s.kol_id)) snapByKol.set(s.kol_id, []);
    snapByKol.get(s.kol_id)!.push(s);
  }

  const roster = kols.map((k) => ({
    kol_id: k.id,
    deliverables: delivByKol.get(k.id) || [],
    snapshots: snapByKol.get(k.id) || [],
  }));
  const scores = computeRosterScores(roster);
  const result = scores.get(args.kol_id);
  if (!result) return `Score not computed for ${target.name} (${args.kol_id}).`;

  const out: string[] = [];
  out.push(`## Score for ${target.name}`);
  out.push('');
  if (result.score == null) {
    out.push(`**Score:** Insufficient data`);
    if (result.reason) out.push(`*${result.reason}*`);
  } else {
    const tier = tierForScore(result.score);
    out.push(`**Composite:** ${result.score}/100 · Tier ${tier.label}`);
    out.push('');
    out.push('**Per-dimension breakdown (0-100, normalized vs roster):**');
    out.push(`  · Engagement Quality:  ${result.dimensions.engagement_quality ?? '—'}`);
    out.push(`  · Reach Efficiency:    ${result.dimensions.reach_efficiency ?? '—'}`);
    out.push(`  · Channel Health:      ${result.dimensions.channel_health ?? '—'}`);
    out.push(`  · Growth Trajectory:   ${result.dimensions.growth_trajectory ?? '—'}`);
    out.push(`  · Activation Impact:   ${result.dimensions.activation_impact ?? '—'}`);
  }
  return out.join('\n');
}

// ─── Tool: get_kol_channel_snapshot ───────────────────────────────────

export const getKolChannelSnapshotSchema = {
  kol_id: z.string().uuid().describe('Master KOL UUID.'),
  history: z.number().int().min(1).max(24).default(1)
    .describe('Number of recent monthly snapshots to return (default 1 = latest only).'),
};

export async function getKolChannelSnapshot(
  supabase: SupabaseClient,
  args: { kol_id: string; history: number },
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('kol_channel_snapshots')
    .select('*')
    .eq('kol_id', args.kol_id)
    .order('snapshot_date', { ascending: false })
    .limit(args.history);
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No channel snapshots logged for this KOL yet.`;

  const fmt = (n: number | null | undefined) => (n != null ? n.toLocaleString() : '—');
  const lines = rows.map((s) => {
    const month = new Date(s.snapshot_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return [
      `• ${month} — ${fmt(s.follower_count)} followers`,
      `    avg_views=${fmt(s.avg_views_per_post)} · avg_forwards=${fmt(s.avg_forwards_per_post)} · avg_reactions=${fmt(s.avg_reactions_per_post)} · posts/wk=${s.posting_frequency ?? '—'}`,
      s.notes ? `    notes: ${s.notes}` : null,
    ].filter(Boolean).join('\n');
  });

  return `${rows.length} snapshot(s):\n\n${lines.join('\n\n')}`;
}

// ─── Tool: get_kol_call_log ───────────────────────────────────────────

export const getKolCallLogSchema = {
  kol_id: z.string().uuid().describe('Master KOL UUID.'),
  limit: z.number().int().min(1).max(50).default(20),
};

export async function getKolCallLog(
  supabase: SupabaseClient,
  args: { kol_id: string; limit: number },
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('kol_call_logs')
    .select('*')
    .eq('kol_id', args.kol_id)
    .order('call_date', { ascending: false })
    .limit(args.limit);
  if (error) return `Error: ${error.message}`;
  const rows = (data || []) as any[];
  if (rows.length === 0) return `No call logs for this KOL yet.`;

  const lines = rows.map((c) => {
    const date = new Date(c.call_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const tags = [c.call_type, c.project].filter(Boolean).join(' · ');
    const sections = [
      c.notes && `notes: ${c.notes}`,
      c.market_intel && `market intel: ${c.market_intel}`,
      c.recommended_angle && `recommended angle: ${c.recommended_angle}`,
      c.feedback_on_hh && `feedback on HH: ${c.feedback_on_hh}`,
    ].filter(Boolean);
    return [
      `• ${date}${tags ? ` — ${tags}` : ''}`,
      ...sections.map((s) => `    ${s}`),
    ].join('\n');
  });

  return `${rows.length} call log(s):\n\n${lines.join('\n\n')}`;
}

// ─── Tool: log_deliverable (WRITE) ────────────────────────────────────

export const logDeliverableSchema = {
  kol_id: z.string().uuid().describe('Master KOL UUID.'),
  campaign_id: z.string().uuid().describe('Campaign UUID.'),
  brief_number: z.number().int().min(1)
    .describe('Sequence number within (kol, campaign). 1 for the first brief, 2 for the second, etc.'),
  brief_topic: z.string().min(1).max(200).describe('Short label for the brief, e.g. "Valiant Onboarding".'),
  post_link: z.string().url().describe('URL to the published post. Required.'),
  date_brief_sent: z.string().describe('ISO timestamp when brief was sent (e.g. "2026-05-15T00:00:00Z").'),
  date_posted: z.string().describe('ISO timestamp when KOL posted.'),
  views_24h: z.number().int().min(0).optional().describe('Views at 24 hours.'),
  views_48h: z.number().int().min(0).optional().describe('Views at 48 hours.'),
  forwards: z.number().int().min(0).optional().describe('Forwards/shares.'),
  reactions: z.number().int().min(0).optional().describe('Total emoji reactions.'),
  activation_participants: z.number().int().min(0).optional().describe('Event participation from KOL\'s channel.'),
  notes: z.string().max(2000).optional().describe('Free-form notes (anomalies, context).'),
};

export async function logDeliverable(
  supabase: SupabaseClient,
  args: {
    kol_id: string; campaign_id: string; brief_number: number;
    brief_topic: string; post_link: string;
    date_brief_sent: string; date_posted: string;
    views_24h?: number; views_48h?: number; forwards?: number;
    reactions?: number; activation_participants?: number; notes?: string;
  },
): Promise<string> {
  // Attribution: the MCP request authenticated as a real user via OAuth.
  // mcpAuthStorage gives us their user_id so created_by is correctly set
  // (rather than NULL or service-role).
  const ctx = mcpAuthStorage.getStore();
  const { data, error } = await (supabase as any)
    .from('kol_deliverables')
    .insert({
      kol_id: args.kol_id,
      campaign_id: args.campaign_id,
      brief_number: args.brief_number,
      brief_topic: args.brief_topic.trim(),
      post_link: args.post_link.trim(),
      date_brief_sent: args.date_brief_sent,
      date_posted: args.date_posted,
      views_24h: args.views_24h ?? null,
      views_48h: args.views_48h ?? null,
      forwards: args.forwards ?? null,
      reactions: args.reactions ?? null,
      activation_participants: args.activation_participants ?? null,
      notes: args.notes?.trim() || null,
      created_by: ctx?.user_id ?? null,
    })
    .select('id, brief_number, brief_topic')
    .single();

  if (error) return `Error: ${error.message}`;
  return `✓ Deliverable logged. ID: ${data.id} (#${data.brief_number} ${data.brief_topic})`;
}

// ─── Tool: log_call (WRITE) ───────────────────────────────────────────

export const logCallSchema = {
  kol_id: z.string().uuid().describe('Master KOL UUID.'),
  call_date: z.string().describe('ISO date when the call happened (e.g. "2026-05-14").'),
  call_type: z.enum(['First Onboarding', 'Repeat Onboarding', 'Check-in']).optional()
    .describe('Type of call.'),
  project: z.string().max(100).optional().describe('Project the call was about.'),
  notes: z.string().max(5000).optional().describe('General debrief.'),
  market_intel: z.string().max(5000).optional().describe('Narratives/trends the KOL flagged.'),
  recommended_angle: z.string().max(5000).optional().describe('Content approach they suggested.'),
  feedback_on_hh: z.string().max(5000).optional().describe('What they liked/disliked about working with us.'),
};

export async function logCall(
  supabase: SupabaseClient,
  args: {
    kol_id: string; call_date: string;
    call_type?: 'First Onboarding' | 'Repeat Onboarding' | 'Check-in';
    project?: string; notes?: string; market_intel?: string;
    recommended_angle?: string; feedback_on_hh?: string;
  },
): Promise<string> {
  const ctx = mcpAuthStorage.getStore();
  const { data, error } = await (supabase as any)
    .from('kol_call_logs')
    .insert({
      kol_id: args.kol_id,
      call_date: args.call_date,
      call_type: args.call_type ?? null,
      project: args.project?.trim() || null,
      notes: args.notes?.trim() || null,
      market_intel: args.market_intel?.trim() || null,
      recommended_angle: args.recommended_angle?.trim() || null,
      feedback_on_hh: args.feedback_on_hh?.trim() || null,
      created_by: ctx?.user_id ?? null,
    })
    .select('id, call_date')
    .single();

  if (error) return `Error: ${error.message}`;
  return `✓ Call log added. ID: ${data.id} (date: ${data.call_date})`;
}
