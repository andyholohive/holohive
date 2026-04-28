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

// ─── Tool: list_recent_prospects ──────────────────────────────────────

export const listRecentProspectsSchema = {
  days: z.number().int().min(1).max(180).default(7)
    .describe('Look-back window in days (default 7).'),
  tier: z.enum(['REACH_OUT_NOW', 'PRE_TOKEN_PRIORITY', 'CONSIDER', 'DISMISS', 'any'])
    .default('any')
    .describe('Filter by Discovery action tier. "any" returns all tiers.'),
  limit: z.number().int().min(1).max(50).default(20)
    .describe('Max prospects to return (default 20).'),
};

export async function listRecentProspects(
  supabase: SupabaseClient,
  args: { days: number; tier: 'REACH_OUT_NOW' | 'PRE_TOKEN_PRIORITY' | 'CONSIDER' | 'DISMISS' | 'any'; limit: number },
): Promise<string> {
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();
  let query = (supabase as any)
    .from('prospects')
    .select('id, name, symbol, status, source, korea_relevancy_score, korea_signal_count, created_at, discovery_snapshot')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(args.limit);

  const { data, error } = await query;
  if (error) return `Error: ${error.message}`;
  let rows = (data || []) as any[];

  if (args.tier !== 'any') {
    rows = rows.filter(r => r.discovery_snapshot?.action_tier === args.tier);
  }

  if (rows.length === 0) {
    return `No prospects found in the last ${args.days} day(s)${args.tier !== 'any' ? ` with tier=${args.tier}` : ''}.`;
  }

  const lines = rows.map(r => {
    const snap = r.discovery_snapshot || {};
    const tier = snap.action_tier || '—';
    const funding = snap.funding;
    const fundingStr = funding?.amount_usd ? ` · ${formatMoney(funding.amount_usd)}${funding.round ? ` ${funding.round}` : ''}` : '';
    const koreaListed = snap.post_korea_listing_at ? ` · 📍 ${String(snap.post_korea_listing_exchange || '').toUpperCase()}` : '';
    return `• ${r.name}${r.symbol ? ` ($${r.symbol})` : ''} — ${tier}${fundingStr}${koreaListed} · ${relTime(r.created_at)}`;
  });

  return `${rows.length} prospect(s) in the last ${args.days} day(s)${args.tier !== 'any' ? ` (${args.tier})` : ''}:\n\n${lines.join('\n')}`;
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

  // CRM opportunities by stage
  const { data: crm } = await (supabase as any)
    .from('crm_opportunities')
    .select('stage')
    .limit(1000);
  const stageCounts: Record<string, number> = {};
  for (const c of (crm || []) as any[]) {
    const s = c.stage || 'unknown';
    stageCounts[s] = (stageCounts[s] || 0) + 1;
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
