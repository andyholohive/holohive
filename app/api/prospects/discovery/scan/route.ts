import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClaudeClient } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/prospects/discovery/scan
 *
 * Two-stage flow designed for cost and reliability:
 *
 *   Stage 1 (one cheap Claude call):
 *     Find N candidate crypto projects on DropsTab matching the funding filter.
 *     Output is a minimal list — name, symbol, category, funding amount, URL.
 *
 *   Stage 2 (parallel Claude calls, 3-4 candidates per batch):
 *     Enrich each candidate with: ICP check (6 criteria), SCOUT scoring,
 *     action tier, outreach triggers (X-first), and POC handles (Telegram > X).
 *
 * Why staged:
 *   - Each call is smaller → less likely to hit pause_turn (which compounds cost)
 *   - Parallel batches finish in the time of the slowest single batch
 *   - Failed batches don't kill the whole scan (Promise.allSettled)
 *   - System prompt is identical across all Stage 2 batches → prompt caching
 *     means batches 2..N read the system block at 10% cost
 *
 * Body (all optional):
 *   {
 *     recency_days?: number,       // default 30
 *     min_raise_usd?: number,      // default 1_000_000
 *     max_projects?: number,       // default 20 (capped at 20)
 *     categories?: string[],       // e.g. ['DeFi', 'Gaming']
 *     model?: 'sonnet' | 'opus',   // default 'opus'
 *   }
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

interface OutreachContact {
  name: string;
  role: string;
  twitter_handle?: string;
  telegram_handle?: string;
  source_url?: string;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

type IcpCheck = { pass: boolean; evidence: string };

type ActionTier =
  | 'REACH_OUT_NOW'
  | 'PRE_TOKEN_PRIORITY'
  | 'RESEARCH'
  | 'WATCH'
  | 'NURTURE'
  | 'SKIP';

interface CandidateBasics {
  name: string;
  symbol?: string | null;
  category?: string | null;
  funding_amount_usd?: number | null;
  funding_round?: string | null;
  funding_date?: string | null;
  investors?: string[];
  dropstab_url?: string | null;
  website_url?: string | null;
}

interface DiscoveredProject extends CandidateBasics {
  project_twitter_url?: string | null;
  project_telegram_url?: string | null;
  discord_url?: string | null;
  icp_verdict: 'PASS' | 'FAIL' | 'BORDERLINE';
  icp_checks: {
    credible_funding: IcpCheck;
    pre_token_or_tge_6mo: IcpCheck;
    no_korea_presence: IcpCheck;
    end_user_product: IcpCheck;
    real_product: IcpCheck;
    not_with_competitor: IcpCheck;
  };
  disqualification_reason?: string | null;
  consideration_reason?: string | null;
  prospect_score: {
    icp_fit: number;
    signal_strength: number;
    timing: number;
    total: number;
  };
  action_tier: ActionTier;
  outreach_contacts?: OutreachContact[];
  triggers?: Array<{
    signal_type: string;
    headline: string;
    detail?: string;
    source_url?: string;
    source_type?: 'tweet' | 'article' | 'other';
    tier?: 'TIER_1' | 'TIER_2' | 'TIER_3';
    weight?: number;
  }>;
  fit_reasoning?: string | null;
}

// ────────────────────────────────────────────────────────────────────
// Stage 1: Find candidates on DropsTab
// ────────────────────────────────────────────────────────────────────

const CANDIDATES_SYSTEM_PROMPT = `You are a crypto-funding research assistant for HoloHive BD. Your only job in this call is to PRODUCE A LIST of candidate projects from DropsTab that recently raised capital. Do not evaluate fit, do not find contacts, do not score — later calls do that.

## SOURCE RULES
- Primary: https://dropstab.com/tab/by-raised-funds (the raised-funds list)
- Open individual DropsTab coin pages as needed to confirm funding details
- DO NOT use general web search for candidate discovery. DropsTab is the source of truth for this list.

## OUTPUT
Call submit_candidates exactly once with the list. No text replies.

Return AT MOST the requested count. Quality over quantity — if you can only find 6 qualifying projects, submit 6.`;

const candidatesTool = {
  name: 'submit_candidates',
  description: 'Submit the list of candidate projects found on DropsTab.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            symbol: { type: 'string' },
            category: { type: 'string' },
            funding_amount_usd: { type: 'number', description: 'Total raise in USD for the most recent round' },
            funding_round: { type: 'string', description: 'e.g. Seed, Series A, Strategic' },
            funding_date: { type: 'string', description: 'ISO YYYY-MM-DD of announcement if known' },
            investors: { type: 'array', items: { type: 'string' } },
            dropstab_url: { type: 'string' },
            website_url: { type: 'string' },
          },
          required: ['name'],
        },
      },
    },
    required: ['candidates'],
  },
};

async function findCandidates(
  anthropic: any,
  model: string,
  params: {
    recencyDays: number;
    minRaise: number;
    maxCandidates: number;
    categories: string[];
  },
): Promise<{
  candidates: CandidateBasics[];
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}> {
  const userPrompt = `List up to ${params.maxCandidates} crypto projects that appear on DropsTab's raised-funds page and meet these filters:

- Raised at least $${params.minRaise.toLocaleString()} USD
- Announced within the last ${params.recencyDays} days${params.categories.length > 0 ? `\n- Category is one of: ${params.categories.join(', ')}` : ''}

For each, include name, symbol, category, funding amount, round type, date (if visible), lead investors, DropsTab URL, and website URL.

Call submit_candidates when done.`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 6000,
    system: [
      {
        type: 'text',
        text: CANDIDATES_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 10 } as any,
      candidatesTool as any,
    ],
  });

  const submitBlock = response.content.find(
    (b: any) => b.type === 'tool_use' && b.name === 'submit_candidates',
  ) as any;

  const candidates: CandidateBasics[] = submitBlock?.input?.candidates ?? [];

  return {
    candidates,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    stopReason: response.stop_reason ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────
// Stage 2: Enrich a batch of candidates (triggers + POCs + ICP)
// ────────────────────────────────────────────────────────────────────

const ENRICHMENT_SYSTEM_PROMPT = `You are DISCOVERY, HoloHive's BD enrichment agent. You receive a small batch of candidate crypto projects and for each one: (1) verify fit against the HoloHive ICP, (2) hunt for outreach triggers from Twitter/X, (3) find individual decision-maker contacts (POCs), and (4) produce a SCOUT-compatible score and action tier.

HoloHive is a Seoul-based KOL growth agency. Their 90-day Korea Growth Partnership ($48-61K) is sold to pre-token or recently-launched crypto projects entering the Korean market.

## THE 6-CRITERIA ICP CHECK (binary, ALL must PASS)
1. Credible funding — any amount with reputable backers
2. Pre-token OR TGE within 6 months — verify via CoinGecko, roadmap, tokenomics
3. No existing Korea community / marketing team — Korean TG <1K members = pass. A NEW Korea BD hire POST is a positive trigger, NOT a fail.
4. End-user product — NOT B2B infra/VC/exchange (L1/L2 counts as end-user)
5. Real product in development or launched — GitHub, app, testnet, TVL (not just whitepaper)
6. Not with a competitor Korea agency

For each, produce { pass: boolean, evidence: string }.
\`icp_verdict\`: PASS (all 6 pass), FAIL (any fail OR instant disqualifier), BORDERLINE (unclear).

## INSTANT DISQUALIFIERS → icp_verdict=FAIL, action_tier=SKIP, populate disqualification_reason
- B2B service provider or infrastructure tool (unless L1/L2)
- VC firm or fund; exchange, DEX, trading platform
- Dormant >60 days; KR Telegram already 1K+ members
- Already working with competitor Korea agency
- Token launched 6+ months ago AND no Korea trigger
- Team fully anon AND no credible backers
- Rug pull or serious controversy history
- "Global expansion" with ZERO Korea-specific signals

Return FAIL projects in output with a clear disqualification_reason. Do not silently drop them.

## GLOBAL-ONLY EDGE CASE
If a project passes all other 5 criteria but has NO Korea signal:
- verdict: BORDERLINE
- action_tier: RESEARCH
- consideration_reason: 1-2 sentences on why a human should still review (e.g., "Strong Series A with Asia-curious investors — worth a 5-min check").

## TRIGGER HUNTING (X-FIRST)
For each candidate, OPEN the project's X/Twitter account. Read the pinned tweet + last ~10 posts + key team members' recent posts. Triggers come primarily from X; only fall back to news if nothing useful on X.

**CRITICAL — POC PERSONAL FEED CHECK**
After identifying POCs (see next section), for the TOP-role POC (typically CEO/Founder), explicitly check THEIR personal X feed: pinned tweet + last 5 posts. If they mention ANY of:
  - Korea, Seoul, KBW, Upbit, Bithumb, Hashed, Dunamu, Kakao
  - Asia, APAC, Tokyo, Singapore (as lead-in to Korea interest)
  - Korean conferences, meetups, partnerships
  - Trips to Korea, hiring in Korea, Korean advisors
Record it as a trigger with:
  - signal_type: "poc_korea_mention"
  - tier: "TIER_1" (it's a decision-maker's personal signal — highest possible)
  - weight: 20-25
  - source_type: "tweet"
  - detail: "<POC name> (<role>) tweeted: '<short quote>' (<date>)"
  - source_url: specific tweet URL
This is the single highest-value trigger class for BD. Do not skip it if a POC is identified.

Trigger types (snake_case):
- TIER 1 (within 7d): poc_korea_mention, tge_within_60d, korea_exchange_listing, mainnet_launching_this_month, korea_bd_hire, team_relocation_seoul
- TIER 2 (within 7d or ongoing): recent_raise, korea_bd_hiring, airdrop_announced, competitor_entered_korea, korean_media_partnership
- TIER 3 (within 14d): accelerator_graduation, hackathon_win, ecosystem_grant_asia, mainnet_2_to_3_months_out

Per trigger: signal_type, headline (<80 chars), detail (1-2 sentences, quote the tweet if applicable), source_url (specific tweet URL preferred), source_type ("tweet" | "article" | "other"), tier, weight (5-25).

## SCORING (0-100)
prospect_score.total = icp_fit (0-40) + signal_strength (0-35 HARD CAP) + timing (0-25)

icp_fit (0-40):
- credible_funding pass: +10
- pre_token_or_tge_6mo pass: +10
- no_korea_presence pass: +5
- real_product pass: +5
- team_credible_doxxed (founders public): +5
- hot_narrative (AI/DePIN/RWA/Stablecoins/Restaking/selective Gaming): +5

signal_strength (0-35):
- HIGHEST trigger base (pick one, don't stack): TIER 1 = +15, TIER 2 = +10, TIER 3 = +5
- Multiple triggers (2+): +5
- Behavioral (engaged with HoloHive team / mentioned Asia): +5
- Contextual (trending in Korean Telegram): +5

timing (0-25, pick SINGLE highest):
- TGE <8 weeks: 25
- Post-funding <30d OR mainnet this month: 20
- TGE 2-4 months OR Korea BD actively hired OR recent Asia/Korea interest: 15
- Major Seoul event (ETH Seoul, KBW) coming: 10
- No timing trigger: 0

action_tier:
- 80-100 → REACH_OUT_NOW
- 60-79  → PRE_TOKEN_PRIORITY
- 45-59  → RESEARCH
- 30-44  → WATCH
- 15-29  → NURTURE
- 0-14 or disqualified → SKIP

## KOREA CONTEXT (Apr 2026)
- 2nd-largest crypto market globally. Corporate crypto ban lifted Feb 2026.
- Upbit 72% share; Bithumb #2 (IPO planned).
- Trending in Korean Telegram: AI, DePIN, RWA, Stablecoins, Restaking, selective Gaming.
- KEY RULE: Korea = Telegram, NOT Twitter. Korean Twitter is noisy; retail discovery happens on Telegram. When checking Korea presence (ICP #3), check TELEGRAM size, not Twitter followers.

## OUTREACH CONTACTS (POCs) — CRITICAL
HoloHive does cold BD via Telegram DM. We want DECISION-MAKERS' personal handles. Prioritize in order:
1. CEO / Founder (best)
2. CMO / Head of Marketing / Head of Growth
3. Head of BD / BD Lead
4. Community lead (last resort)

Within role priority, prefer contacts with a findable **Telegram handle > X handle**. Crypto founders often put "tg: @handle" in X bio specifically for cold DMs — search for that pattern.

Per contact: name, role, twitter_handle, telegram_handle, source_url (where you found it), confidence (high/medium/low), optional notes.

Confidence rules:
- high: Telegram on verified X bio or project team page
- medium: Telegram on crypto directory or second-hand
- low: X-only or inferred (include only if no better lead)

Return empty outreach_contacts if you can't find anything — better than fabricated.

\`project_twitter_url\` and \`project_telegram_url\` are the project's COMMUNITY channels — useful for monitoring, not outreach.

## OUTPUT
Call submit_enrichments EXACTLY ONCE with the enriched batch. Do NOT reply with plain text.`;

const enrichmentsTool = {
  name: 'submit_enrichments',
  description: 'Submit the enriched projects with full ICP + scoring + triggers + POCs.',
  input_schema: {
    type: 'object',
    properties: {
      projects: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            symbol: { type: 'string' },
            category: { type: 'string' },
            website_url: { type: 'string' },
            project_twitter_url: { type: 'string', description: "Project's official X URL (community, not outreach)" },
            project_telegram_url: { type: 'string', description: "Project's community Telegram (not outreach)" },
            discord_url: { type: 'string' },
            dropstab_url: { type: 'string' },
            funding_round: { type: 'string' },
            funding_amount_usd: { type: 'number' },
            funding_date: { type: 'string' },
            investors: { type: 'array', items: { type: 'string' } },
            icp_verdict: { type: 'string', enum: ['PASS', 'FAIL', 'BORDERLINE'] },
            icp_checks: {
              type: 'object',
              properties: {
                credible_funding:     { type: 'object', properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['pass', 'evidence'] },
                pre_token_or_tge_6mo: { type: 'object', properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['pass', 'evidence'] },
                no_korea_presence:    { type: 'object', properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['pass', 'evidence'] },
                end_user_product:     { type: 'object', properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['pass', 'evidence'] },
                real_product:         { type: 'object', properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['pass', 'evidence'] },
                not_with_competitor:  { type: 'object', properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['pass', 'evidence'] },
              },
              required: ['credible_funding', 'pre_token_or_tge_6mo', 'no_korea_presence', 'end_user_product', 'real_product', 'not_with_competitor'],
            },
            disqualification_reason: { type: 'string' },
            consideration_reason: { type: 'string' },
            prospect_score: {
              type: 'object',
              properties: {
                icp_fit: { type: 'number' },
                signal_strength: { type: 'number' },
                timing: { type: 'number' },
                total: { type: 'number' },
              },
              required: ['icp_fit', 'signal_strength', 'timing', 'total'],
            },
            action_tier: {
              type: 'string',
              enum: ['REACH_OUT_NOW', 'PRE_TOKEN_PRIORITY', 'RESEARCH', 'WATCH', 'NURTURE', 'SKIP'],
            },
            outreach_contacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  twitter_handle: { type: 'string' },
                  telegram_handle: { type: 'string' },
                  source_url: { type: 'string' },
                  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                  notes: { type: 'string' },
                },
                required: ['name', 'role', 'confidence'],
              },
            },
            triggers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  signal_type: { type: 'string' },
                  headline: { type: 'string' },
                  detail: { type: 'string' },
                  source_url: { type: 'string' },
                  source_type: { type: 'string', enum: ['tweet', 'article', 'other'] },
                  tier: { type: 'string', enum: ['TIER_1', 'TIER_2', 'TIER_3'] },
                  weight: { type: 'number' },
                },
                required: ['signal_type', 'headline'],
              },
            },
            fit_reasoning: { type: 'string' },
          },
          required: ['name', 'icp_verdict', 'icp_checks', 'prospect_score', 'action_tier'],
        },
      },
    },
    required: ['projects'],
  },
};

async function enrichBatch(
  anthropic: any,
  model: string,
  candidates: CandidateBasics[],
): Promise<{
  projects: DiscoveredProject[];
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}> {
  const candidateList = candidates.map((c, i) => {
    const lines = [`${i + 1}. ${c.name}${c.symbol ? ` (${c.symbol})` : ''}`];
    if (c.category) lines.push(`   Category: ${c.category}`);
    if (c.funding_amount_usd) lines.push(`   Raised: $${c.funding_amount_usd.toLocaleString()}${c.funding_round ? ` · ${c.funding_round}` : ''}${c.funding_date ? ` · ${c.funding_date}` : ''}`);
    if (c.investors?.length) lines.push(`   Investors: ${c.investors.join(', ')}`);
    if (c.website_url) lines.push(`   Website: ${c.website_url}`);
    if (c.dropstab_url) lines.push(`   DropsTab: ${c.dropstab_url}`);
    return lines.join('\n');
  }).join('\n\n');

  const userPrompt = `Enrich these ${candidates.length} candidate projects from DropsTab. For each, run the ICP check, hunt triggers from X, find 1-3 outreach contacts (Telegram priority), and compute the prospect score.

CANDIDATES:
${candidateList}

Call submit_enrichments when done.`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: ENRICHMENT_SYSTEM_PROMPT,
        // Ephemeral cache (5 min TTL). Since all parallel batches use the same
        // system block, the first batch writes the cache and the rest read at
        // ~10% cost. Across a single scan this is a real saving.
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
    tools: [
      // 12 searches per batch: ~2 for X-account triggers, ~2 for article cross-
      // check, ~3 for POC discovery (team page + X bios + crypto dirs), ~2 for
      // the top POC's personal feed check (Korea/Asia mentions), plus slack.
      { type: 'web_search_20250305', name: 'web_search', max_uses: 12 } as any,
      enrichmentsTool as any,
    ],
  });

  const submitBlock = response.content.find(
    (b: any) => b.type === 'tool_use' && b.name === 'submit_enrichments',
  ) as any;

  const projects: DiscoveredProject[] = submitBlock?.input?.projects ?? [];

  return {
    projects,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    stopReason: response.stop_reason ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────
// DB writes
// ────────────────────────────────────────────────────────────────────

async function writeProject(
  supabase: any,
  p: DiscoveredProject,
  runId: string | null,
): Promise<'inserted' | 'updated' | { error: string }> {
  if (!p.name) return { error: 'missing name' };

  const { data: existing } = await supabase
    .from('prospects')
    .select('id, outreach_contacts')
    .ilike('name', p.name)
    .limit(1)
    .maybeSingle();

  const contacts = (p.outreach_contacts || [])
    .filter(c => c && c.name && c.role)
    .slice()
    .sort((a, b) => {
      const aTG = !!(a.telegram_handle && a.telegram_handle.trim());
      const bTG = !!(b.telegram_handle && b.telegram_handle.trim());
      if (aTG !== bTG) return aTG ? -1 : 1;
      return 0;
    });

  const discoverySnapshot = {
    icp_verdict: p.icp_verdict,
    icp_checks: p.icp_checks,
    prospect_score: p.prospect_score,
    action_tier: p.action_tier,
    disqualification_reason: p.disqualification_reason ?? null,
    consideration_reason: p.consideration_reason ?? null,
    fit_reasoning: p.fit_reasoning ?? null,
    funding: {
      round: p.funding_round ?? null,
      amount_usd: p.funding_amount_usd ?? null,
      date: p.funding_date ?? null,
      investors: p.investors ?? [],
    },
    scanned_at: new Date().toISOString(),
  };

  const baseFields: Record<string, any> = {
    name: p.name,
    symbol: p.symbol ?? null,
    category: p.category ?? null,
    website_url: p.website_url ?? null,
    twitter_url: p.project_twitter_url ?? null,
    telegram_url: p.project_telegram_url ?? null,
    discord_url: p.discord_url ?? null,
    source_url: p.dropstab_url ?? null,
    discovery_snapshot: discoverySnapshot,
    updated_at: new Date().toISOString(),
  };

  if (!existing?.id) {
    const { error } = await supabase.from('prospects').insert({
      ...baseFields,
      outreach_contacts: contacts,
      source: 'dropstab_discovery',
      status: 'needs_review',
      scraped_at: new Date().toISOString(),
    });
    return error ? { error: error.message } : 'inserted';
  }

  // Merge contacts with existing to preserve manual edits
  const existingContacts: OutreachContact[] = existing.outreach_contacts || [];
  const merged = [...existingContacts];
  for (const newC of contacts) {
    const match = merged.findIndex(
      e => e.name?.toLowerCase() === newC.name.toLowerCase() && e.role === newC.role,
    );
    if (match >= 0) {
      const cur = merged[match];
      merged[match] = {
        ...cur,
        twitter_handle: cur.twitter_handle || newC.twitter_handle,
        telegram_handle: cur.telegram_handle || newC.telegram_handle,
        source_url: cur.source_url || newC.source_url,
        notes: cur.notes || newC.notes,
        confidence: newC.confidence === 'high' ? 'high' : cur.confidence,
      };
    } else {
      merged.push(newC);
    }
  }
  merged.sort((a, b) => {
    const aTG = !!(a.telegram_handle && a.telegram_handle.trim());
    const bTG = !!(b.telegram_handle && b.telegram_handle.trim());
    if (aTG !== bTG) return aTG ? -1 : 1;
    return 0;
  });

  const patch: Record<string, any> = { ...baseFields, outreach_contacts: merged };
  // Don't clobber non-null with null
  if (!p.project_twitter_url) delete patch.twitter_url;
  if (!p.project_telegram_url) delete patch.telegram_url;
  if (!p.category) delete patch.category;
  if (!p.website_url) delete patch.website_url;
  if (!p.dropstab_url) delete patch.source_url;

  const { error } = await supabase.from('prospects').update(patch).eq('id', existing.id);
  return error ? { error: error.message } : 'updated';
}

async function writeSignals(
  supabase: any,
  project: DiscoveredProject,
  runId: string | null,
): Promise<number> {
  if (!project.triggers?.length) return 0;

  const { data: prospect } = await supabase
    .from('prospects')
    .select('id')
    .ilike('name', project.name)
    .limit(1)
    .maybeSingle();

  let added = 0;
  for (const trigger of project.triggers) {
    if (!trigger.signal_type || !trigger.headline) continue;

    const { data: dup } = await supabase
      .from('prospect_signals')
      .select('id')
      .eq('project_name', project.name)
      .eq('signal_type', trigger.signal_type)
      .eq('headline', trigger.headline)
      .gte('detected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (dup && dup.length > 0) continue;

    const { error } = await supabase.from('prospect_signals').insert({
      prospect_id: prospect?.id ?? null,
      project_name: project.name,
      signal_type: trigger.signal_type,
      headline: trigger.headline,
      snippet: trigger.detail ?? null,
      source_url: trigger.source_url ?? null,
      source_name: 'discovery_claude',
      relevancy_weight: trigger.weight ?? 10,
      tier: 2,
      confidence: 'likely',
      shelf_life_days: 30,
      metadata: {
        fit_reasoning: project.fit_reasoning ?? null,
        prospect_score: project.prospect_score?.total ?? null,
        action_tier: project.action_tier,
        source_type: trigger.source_type ?? null,
        tier: trigger.tier ?? null,
        funding: {
          round: project.funding_round ?? null,
          amount_usd: project.funding_amount_usd ?? null,
          date: project.funding_date ?? null,
          investors: project.investors ?? [],
        },
        agent_run_id: runId,
      },
      detected_at: new Date().toISOString(),
      is_active: true,
    });
    if (!error) added++;
  }
  return added;
}

// ────────────────────────────────────────────────────────────────────
// Cost accounting
// ────────────────────────────────────────────────────────────────────

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const isOpus = model.includes('opus');
  const inPrice = isOpus ? 15 : 3;   // per MTok
  const outPrice = isOpus ? 75 : 15;
  return (inputTokens / 1_000_000) * inPrice + (outputTokens / 1_000_000) * outPrice;
}

// ────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const startedAt = new Date();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'DISCOVERY',
      run_type: 'on_demand',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: {},
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (
    status: 'completed' | 'failed',
    output: Record<string, any>,
    error?: string,
  ) => {
    if (!runId) return;
    const endedAt = new Date();
    await (supabase as any)
      .from('agent_runs')
      .update({
        status,
        completed_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        output_summary: output,
        error_message: error ?? null,
      })
      .eq('id', runId);
  };

  // Progressive progress updates — the scan dialog polls these via
  // GET /api/prospects/discovery/progress to render a live progress bar.
  // Non-blocking best-effort: failures don't break the scan.
  const updateProgress = async (progress: Record<string, any>) => {
    if (!runId) return;
    try {
      await (supabase as any)
        .from('agent_runs')
        .update({ output_summary: progress })
        .eq('id', runId);
    } catch { /* ignore — progress updates shouldn't fail the scan */ }
  };

  try {
    const body = await request.json().catch(() => ({}));
    const recencyDays = Math.max(1, Math.min(365, Number(body.recency_days) || 30));
    const minRaise = Math.max(0, Number(body.min_raise_usd) || 1_000_000);
    const maxProjects = Math.max(1, Math.min(20, Number(body.max_projects) || 10));
    const categories: string[] = Array.isArray(body.categories) ? body.categories : [];
    const modelAlias = String(body.model || 'opus').toLowerCase();
    const model =
      modelAlias === 'sonnet' ? 'claude-sonnet-4-5'
      : modelAlias === 'opus' ? 'claude-opus-4-7'
      : body.model;

    const anthropic = getClaudeClient();

    // ── Stage 1 ──────────────────────────────────────────────────────
    await updateProgress({
      stage: 'discovering_candidates',
      message: 'Finding candidates on DropsTab...',
      percent: 5,
    });

    const stage1 = await findCandidates(anthropic, model, {
      recencyDays,
      minRaise,
      maxCandidates: maxProjects,
      categories,
    });

    if (stage1.candidates.length === 0) {
      await finishRun(
        'completed',
        {
          stage: 1,
          candidates_found: 0,
          stop_reason: stage1.stopReason,
          input_tokens: stage1.inputTokens,
          output_tokens: stage1.outputTokens,
          cost_usd: Number(estimateCost(model, stage1.inputTokens, stage1.outputTokens).toFixed(4)),
        },
        'Stage 1 returned no candidates',
      );
      return NextResponse.json({
        success: true,
        projects_found: 0,
        inserted: 0,
        updated: 0,
        signals_added: 0,
        errors: ['Stage 1 found no candidates matching filters'],
        cost_usd: Number(estimateCost(model, stage1.inputTokens, stage1.outputTokens).toFixed(4)),
        duration_ms: Date.now() - startedAt.getTime(),
      });
    }

    // ── Stage 2: split candidates into batches of 4, enrich in parallel ──
    const BATCH_SIZE = 4;
    const batches: CandidateBasics[][] = [];
    for (let i = 0; i < stage1.candidates.length; i += BATCH_SIZE) {
      batches.push(stage1.candidates.slice(i, i + BATCH_SIZE));
    }

    await updateProgress({
      stage: 'enriching',
      message: `Enriching ${stage1.candidates.length} candidates in ${batches.length} parallel batches...`,
      candidates_found: stage1.candidates.length,
      batches_total: batches.length,
      batches_complete: 0,
      percent: 25,
    });

    // Wrap each batch to write progress as it finishes. Promise.allSettled
    // still waits for ALL, but the individual wrappers patch output_summary
    // as they settle — so the client sees batches_complete climb in real time.
    let batchesCompleted = 0;
    const batchResults = await Promise.allSettled(
      batches.map(async (batch, i) => {
        try {
          const result = await enrichBatch(anthropic, model, batch);
          batchesCompleted++;
          await updateProgress({
            stage: 'enriching',
            message: `Enriched batch ${batchesCompleted} of ${batches.length}...`,
            candidates_found: stage1.candidates.length,
            batches_total: batches.length,
            batches_complete: batchesCompleted,
            // Scale 25% (start of stage 2) to 90% (end of stage 2)
            percent: Math.round(25 + (65 * batchesCompleted) / batches.length),
          });
          return result;
        } catch (err) {
          batchesCompleted++;
          await updateProgress({
            stage: 'enriching',
            message: `Batch ${batchesCompleted} of ${batches.length} failed, continuing...`,
            candidates_found: stage1.candidates.length,
            batches_total: batches.length,
            batches_complete: batchesCompleted,
            percent: Math.round(25 + (65 * batchesCompleted) / batches.length),
          });
          throw err;
        }
      }),
    );

    const allProjects: DiscoveredProject[] = [];
    let stage2InputTokens = 0;
    let stage2OutputTokens = 0;
    const batchErrors: string[] = [];

    for (let i = 0; i < batchResults.length; i++) {
      const r = batchResults[i];
      if (r.status === 'fulfilled') {
        allProjects.push(...r.value.projects);
        stage2InputTokens += r.value.inputTokens;
        stage2OutputTokens += r.value.outputTokens;
      } else {
        batchErrors.push(`Batch ${i + 1}: ${r.reason?.message ?? 'unknown error'}`);
        console.error(`Enrichment batch ${i + 1} failed:`, r.reason);
      }
    }

    // ── Write to DB ──────────────────────────────────────────────────
    await updateProgress({
      stage: 'writing',
      message: `Saving ${allProjects.length} enriched prospects...`,
      percent: 92,
    });

    let inserted = 0;
    let updated = 0;
    let signalsAdded = 0;
    const writeErrors: string[] = [];

    for (const p of allProjects) {
      if (!p.name) continue;
      const result = await writeProject(supabase, p, runId);
      if (result === 'inserted') inserted++;
      else if (result === 'updated') updated++;
      else writeErrors.push(`${p.name}: ${(result as any).error}`);

      signalsAdded += await writeSignals(supabase, p, runId);
    }

    // ── Cost accounting ──────────────────────────────────────────────
    const totalInputTokens = stage1.inputTokens + stage2InputTokens;
    const totalOutputTokens = stage1.outputTokens + stage2OutputTokens;
    const costUsd = estimateCost(model, totalInputTokens, totalOutputTokens);

    await finishRun('completed', {
      candidates_found: stage1.candidates.length,
      batches_run: batches.length,
      batches_failed: batchErrors.length,
      projects_enriched: allProjects.length,
      inserted,
      updated,
      signals_added: signalsAdded,
      stage1_input_tokens: stage1.inputTokens,
      stage1_output_tokens: stage1.outputTokens,
      stage2_input_tokens: stage2InputTokens,
      stage2_output_tokens: stage2OutputTokens,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      cost_usd: Number(costUsd.toFixed(4)),
    });

    return NextResponse.json({
      success: true,
      candidates_found: stage1.candidates.length,
      projects_found: allProjects.length,
      inserted,
      updated,
      signals_added: signalsAdded,
      batches_run: batches.length,
      batches_failed: batchErrors.length,
      errors: [...batchErrors, ...writeErrors],
      cost_usd: Number(costUsd.toFixed(4)),
      duration_ms: Date.now() - startedAt.getTime(),
    });
  } catch (err: any) {
    console.error('Discovery scan error:', err);
    await finishRun('failed', {}, err?.message ?? 'Unknown error');
    return NextResponse.json(
      { error: err?.message ?? 'Discovery scan failed' },
      { status: 500 },
    );
  }
}
