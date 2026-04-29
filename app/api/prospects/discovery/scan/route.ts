import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClaudeClient } from '@/lib/claude';
import { fireIntelligenceAlert } from '@/lib/intelligenceAlerts';

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
// Retry helper for Anthropic API calls
// ────────────────────────────────────────────────────────────────────

/**
 * Wrap anthropic.messages.create() with automatic retry for transient
 * failures. Two specific failure modes were observed in production
 * (Apr 22):
 *
 *   1. 429 rate_limit_error — Opus + parallel Stage 2 batches can
 *      exceed the org's 30K input-tokens-per-minute cap. The whole
 *      scan failed because one batch threw; the retry catches this
 *      and waits long enough for the bucket to refill.
 *
 *   2. The tool wasn't called — model returned text instead of
 *      invoking submit_candidates / submit_enrichments. Rare, but
 *      when it happens we silently get 0 candidates from a paid call.
 *      One automatic retry usually fixes it.
 *
 * Exponential backoff: 5s → 15s → 45s. Max 3 attempts. Anything other
 * than the two known transient cases throws on the first attempt — no
 * point retrying a 401 or a malformed request.
 *
 * `expectToolName` is the name of the tool Claude is supposed to call.
 * If it's set and the response has no tool_use block with that name,
 * we retry as if the call had failed.
 */
async function callAnthropicWithRetry(
  anthropic: any,
  request: any,
  expectToolName?: string,
): Promise<any> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [5_000, 15_000, 45_000];
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await anthropic.messages.create(request);

      // If we expected a specific tool to be called, verify it actually was.
      // The model occasionally returns plain text instead of a tool_use,
      // which causes downstream "0 candidates returned" on a paid call.
      if (expectToolName) {
        const hasToolCall = (response.content || []).some(
          (b: any) => b.type === 'tool_use' && b.name === expectToolName,
        );
        if (!hasToolCall) {
          if (attempt < MAX_ATTEMPTS - 1) {
            console.warn(`[Discovery scan] Model didn't call ${expectToolName} on attempt ${attempt + 1}, retrying in ${BACKOFF_MS[attempt]}ms`);
            await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
            continue;
          }
          // Out of retries — return the response anyway; the caller's
          // existing fallback (empty list) will still kick in.
        }
      }

      return response;
    } catch (err: any) {
      lastError = err;
      // 429 = rate limit. The Anthropic SDK surfaces this as `status: 429`
      // OR an error message containing "rate_limit". Detect either.
      const is429 =
        err?.status === 429 ||
        /rate.?limit/i.test(String(err?.message ?? ''));

      if (is429 && attempt < MAX_ATTEMPTS - 1) {
        const wait = BACKOFF_MS[attempt];
        console.warn(`[Discovery scan] 429 rate-limited on attempt ${attempt + 1}, sleeping ${wait}ms before retry`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      // Anything else (auth, malformed request, etc.) — fail fast.
      throw err;
    }
  }

  // If we fell out of the loop because we ran out of retries on a 429,
  // re-throw the last error so the caller knows we gave up.
  throw lastError ?? new Error('callAnthropicWithRetry exhausted retries');
}

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
  // Experimental: which source surfaced this candidate. Used when the scan
  // runs with body.experimental_sources=true to A/B whether adding
  // cryptorank.io/funding-rounds produces new coverage vs DropsTab alone.
  primary_source?: 'dropstab' | 'cryptorank' | string | null;
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

// Supported discovery sources. Keep the list explicit so the UI and
// prompt builder agree on what's valid.
type DiscoverySource = 'dropstab' | 'cryptorank' | 'rootdata' | 'ethglobal';
const SUPPORTED_SOURCES: DiscoverySource[] = ['dropstab', 'cryptorank', 'rootdata', 'ethglobal'];

const SOURCE_DEFS: Record<DiscoverySource, { url: string; note: string }> = {
  dropstab: {
    url: 'https://dropstab.com/tab/by-raised-funds',
    note: 'Comprehensive trending list. Open individual coin pages to confirm funding details.',
  },
  cryptorank: {
    url: 'https://cryptorank.io/funding-rounds',
    note: 'Public funding tracker. Often catches rounds that have not yet hit DropsTab.',
  },
  rootdata: {
    // Asian-origin funding tracker. Content is English and fully SSR
    // (unlike CryptoRank's JS-rendered table), so web_search reads it
    // cleanly. Strong on pre-TGE APAC-but-non-Korean rounds — which
    // match HoloHive ICP rule #3 ("no Korea presence yet").
    url: 'https://www.rootdata.com/Fundraising',
    note: 'SSR funding tracker. Asian-region bias (non-Korean) — catches rounds DropsTab misses by 24-48h. Data is plain English with amounts, investors, dates in the raw HTML.',
  },
  ethglobal: {
    // Hackathon-winner feed — orthogonal signal. Projects here are
    // typically PRE-funding, so they satisfy ICP rule #1 by default
    // and are too early to be on Korean exchanges (rule #3 usually safe).
    // Caveat: noisy without a "won ≥1 prize" filter, so the prompt
    // builder adds that hint when this source is enabled.
    url: 'https://ethglobal.com/showcase',
    note: 'ETHGlobal hackathon winners. Pre-funding dev teams with working products — orthogonal to funding trackers. Filter to prize-winners only.',
  },
};

/**
 * Build the Stage 1 system prompt dynamically from the user-selected
 * sources. A scan configured with only DropsTab gets the classic prompt;
 * a scan with both gets multi-source cross-reference instructions.
 *
 * Defaulting to ['dropstab'] preserves the prior single-source behavior
 * when the `sources` field is missing from the request body.
 */
function buildCandidatesSystemPrompt(sources: DiscoverySource[]): string {
  const sourceLines = sources.map(s => `- ${SOURCE_DEFS[s].url} — ${SOURCE_DEFS[s].note}`);
  const multi = sources.length > 1;

  // ETHGlobal Showcase is noisy by default (hobby projects, tutorials)
  // unless we constrain to prize-winners. Add an explicit hint when it's
  // in the sources list. The rest of the prompt doesn't need per-source
  // customization — it's all funding trackers with similar shape.
  const perSourceHints: string[] = [];
  if (sources.includes('ethglobal')) {
    perSourceHints.push(
      '- ethglobal.com/showcase: include ONLY projects that won at least one prize at a recent ETHGlobal event (look for "winner" or "sponsor prize" tags). Pre-funding teams are expected here, so funding_amount_usd may be null — fill what you can from their public sites but do not fabricate.',
    );
  }
  if (sources.includes('rootdata')) {
    perSourceHints.push(
      '- rootdata.com/Fundraising: data is in SSR HTML as a table. Extract rows directly: project name, round stage, amount, valuation, date, lead investors. Examples: "3F Seed $ 4 M Apr 24 Maven 11 * GSR +9" → {name: "3F", funding_round: "Seed", funding_amount_usd: 4000000, funding_date: "2026-04-24", investors: ["Maven 11", "GSR"]}.',
    );
  }

  return `You are a crypto-funding research assistant for HoloHive BD. Your only job in this call is to PRODUCE A LIST of candidate crypto projects that recently raised capital. Do not evaluate fit, do not find contacts, do not score — later calls do that.

## SOURCE RULES${multi ? ` (${sources.length} sources)` : ''}

${sourceLines.join('\n')}
${perSourceHints.length > 0 ? `\n### Per-source hints\n\n${perSourceHints.join('\n')}\n` : ''}
${multi ? `
You MUST check every source above — do not fill the entire quota from
one source while ignoring the others. For each source, return at least
1-2 candidates if the source has any qualifying rounds in the window.
Only after each source has been sampled may you return more candidates
from the source with the richest matches.

If a candidate appears on multiple sources, record it once with
primary_source set to where you first verified it.

Do NOT use general web search outside these listed sources — they are
the source of truth.

If a source's page is JS-rendered and you cannot see the data through
web_search, say so in a single candidate entry's notes field rather
than guessing — do NOT fabricate rounds you haven't actually seen.
` : `
DO NOT use general web search for candidate discovery — the listed
source is the source of truth for this list.
`}
## OUTPUT

Call submit_candidates exactly once with the list. No text replies.
For each candidate, set primary_source to one of: ${sources.map(s => `'${s}'`).join(', ')}.

Return AT MOST the requested count. Quality over quantity — if you can
only find 6 qualifying projects, submit 6.`;
}

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
            primary_source: {
              type: 'string',
              description: "Source where this candidate was first found. 'dropstab' (default) or 'cryptorank' when the experimental source list is active.",
            },
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
    skipNames: string[];      // projects we've already scanned recently — don't return these
    cooldownDays: number;     // how old the skip list is, for the prompt
    sources: DiscoverySource[]; // which sources Claude is allowed to query
  },
): Promise<{
  candidates: CandidateBasics[];
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}> {
  // Build the exclusion clause. If the list is long, cap it so we don't
  // blow the prompt budget on skip-names (Claude doesn't need to see all 500
  // to get the point — a couple hundred is sufficient context).
  const skipSample = params.skipNames.slice(0, 200);
  const exclusionClause = skipSample.length > 0
    ? `\n\n## ALREADY SCANNED — DO NOT INCLUDE
The following projects were scanned in the last ${params.cooldownDays} days and are already in our database. DO NOT include them — they'd be wasted research. Go DEEPER on the DropsTab list (scroll past the top entries, open page 2+ if available) to find DIFFERENT projects.

${skipSample.map(n => `- ${n}`).join('\n')}${params.skipNames.length > skipSample.length ? `\n  (...and ${params.skipNames.length - skipSample.length} more — same rule applies)` : ''}

If the entire top of the list is in the skip list, that's expected — you need to go further down.`
    : '';

  const userPrompt = `List up to ${params.maxCandidates} crypto projects that appear on DropsTab's raised-funds page and meet these filters:

- Raised at least $${params.minRaise.toLocaleString()} USD
- Announced within the last ${params.recencyDays} days${params.categories.length > 0 ? `\n- Category is one of: ${params.categories.join(', ')}` : ''}

For each, include name, symbol, category, funding amount, round type, date (if visible), lead investors, DropsTab URL, and website URL.${exclusionClause}

Call submit_candidates when done.`;

  const systemPromptText = buildCandidatesSystemPrompt(params.sources);

  // Scale the web_search budget with the number of sources — one extra
  // source costs ~4 searches (scan + verify a couple of candidates).
  const searchBudget = 10 + (params.sources.length - 1) * 4;

  // Wrapped in retry helper to recover from 429 rate-limits (Opus +
  // parallel batches can spike past the org token-per-minute cap) and
  // the rare case where the model returns text instead of calling
  // submit_candidates. See callAnthropicWithRetry above.
  const response = await callAnthropicWithRetry(
    anthropic,
    {
      model,
      max_tokens: 6000,
      system: [
        {
          type: 'text',
          text: systemPromptText,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: searchBudget } as any,
        candidatesTool as any,
      ],
    },
    'submit_candidates',
  );

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

  // Wrapped in retry helper. Stage 2 is the most rate-limit-prone call
  // because parallel batches all hit Anthropic at the same time — the
  // Apr 22 429 was on this exact path. callAnthropicWithRetry catches
  // it, sleeps with exponential backoff, and tries again.
  const response = await callAnthropicWithRetry(
    anthropic,
    {
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
    },
    'submit_enrichments',
  );

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
): Promise<{ status: 'inserted' | 'updated'; prospectId: string } | { error: string }> {
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
    const { data: insertedRow, error } = await supabase
      .from('prospects')
      .insert({
        ...baseFields,
        outreach_contacts: contacts,
        source: 'dropstab_discovery',
        status: 'needs_review',
        scraped_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) return { error: error.message };
    return { status: 'inserted', prospectId: insertedRow.id };
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
  if (error) return { error: error.message };
  return { status: 'updated', prospectId: existing.id };
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

    // ── Pre-scan: fetch the skip list (dedup) ────────────────────────
    // Projects we've already scanned within the cooldown window, OR projects
    // already in our CRM pipeline. Without this Claude keeps finding the
    // same top-of-DropsTab projects every run and burning cost to
    // re-research them.
    //
    // Architecture note: we only pass RECENT prospect names to Claude's
    // prompt (small set, ~20-50). CRM names go into a server-side post-
    // filter that runs AFTER Claude returns candidates. Passing 1000+ CRM
    // names in the prompt was crowding Claude's context and causing
    // Stage 1 to return zero candidates — the reason we fought a "scan
    // returns empty" regression for a session.
    const COOLDOWN_DAYS = Number(body.cooldown_days) || 14;
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Source 1: recently-scanned discovery prospects (cooldown window).
    // These go into Claude's prompt as "don't re-research these".
    const { data: recentProspects } = await (supabase as any)
      .from('prospects')
      .select('name, updated_at, discovery_snapshot')
      .eq('source', 'dropstab_discovery')
      .gte('updated_at', cooldownCutoff)
      .limit(500);

    // Source 2: all CRM names. These go into a SET only, used server-side
    // after Claude returns candidates — not passed to Claude.
    const { data: crmRows } = await (supabase as any)
      .from('crm_opportunities')
      .select('name')
      .range(0, 4999);
    // Normalize names so "Pharos" matches "Pharos Network", "Web3 Foo Inc."
    // matches "Web3 Foo", etc. We strip a small set of common boilerplate
    // suffixes (Network/Labs/Foundation/Protocol/AI/Inc/Ltd) and collapse
    // non-alphanumeric runs to a single space. The previous exact-match
    // gate let through ~30% of "we already know them" cases.
    const normalizeProjectName = (raw: unknown): string => {
      if (typeof raw !== 'string') return '';
      const lowered = raw.trim().toLowerCase();
      // Remove punctuation/symbols, collapse whitespace
      const cleaned = lowered
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // Strip trailing boilerplate words. Order matters — strip one at
      // a time from the end so "Foo Network Labs" → "Foo".
      const SUFFIXES = ['network', 'labs', 'foundation', 'protocol', 'ai', 'finance', 'capital', 'inc', 'ltd', 'limited', 'llc', 'corp'];
      let parts = cleaned.split(' ');
      while (parts.length > 1 && SUFFIXES.includes(parts[parts.length - 1])) {
        parts.pop();
      }
      return parts.join(' ');
    };
    const crmNameSet = new Set<string>(
      (crmRows || [])
        .map((c: any) => normalizeProjectName(c.name))
        .filter(Boolean),
    );

    // Dedupe names case-insensitively. Only recent discovery prospects are
    // shown to Claude — keeps the prompt small and Stage 1 functional.
    // (Named skipSeen to avoid collision with `skipSet` declared later in
    // this function for the post-enrichment filter.)
    const skipSeen = new Set<string>();
    const skipNames: string[] = [];
    const addSkip = (n: unknown) => {
      if (typeof n !== 'string') return;
      const key = n.trim().toLowerCase();
      if (!key || skipSeen.has(key)) return;
      skipSeen.add(key);
      skipNames.push(n.trim());
    };
    for (const p of recentProspects || []) addSkip(p.name);
    const crmSkipCount = crmNameSet.size;
    const recentSkipCount = (recentProspects || []).length;

    // ── Stage 1 ──────────────────────────────────────────────────────
    await updateProgress({
      stage: 'discovering_candidates',
      message: skipNames.length > 0
        ? `Finding new candidates on DropsTab (skipping ${skipNames.length}: ${recentSkipCount} recently scanned, ${crmSkipCount} in CRM)...`
        : 'Finding candidates on DropsTab...',
      percent: 5,
    });

    // Resolve which sources this scan should query.
    //   - `body.sources` (preferred) is an array like ['dropstab', 'cryptorank']
    //   - legacy `body.experimental_sources: true` means dropstab + cryptorank
    //   - default (neither set) is dropstab only
    let sources: DiscoverySource[];
    if (Array.isArray(body.sources) && body.sources.length > 0) {
      sources = body.sources
        .filter((s: unknown): s is DiscoverySource =>
          typeof s === 'string' && (SUPPORTED_SOURCES as string[]).includes(s),
        );
      if (sources.length === 0) sources = ['dropstab'];
    } else if (body.experimental_sources === true) {
      sources = ['dropstab', 'cryptorank'];
    } else {
      sources = ['dropstab'];
    }

    const stage1Raw = await findCandidates(anthropic, model, {
      recencyDays,
      minRaise,
      maxCandidates: maxProjects,
      categories,
      skipNames,
      cooldownDays: COOLDOWN_DAYS,
      sources,
    });

    // Server-side CRM post-filter. Moved out of Claude's prompt because
    // passing 1,000+ CRM names into the system prompt was causing Stage 1
    // to return zero candidates (the prompt got swamped and Claude stopped
    // emitting submit_candidates).
    const crmFilteredOut: string[] = [];
    const filteredCandidates = stage1Raw.candidates.filter(c => {
      if (!c.name) return false;
      // Use the same normalization as crmNameSet so suffix variants
      // dedupe correctly ("Pharos" candidate vs "Pharos Network" CRM row).
      const key = normalizeProjectName(c.name);
      if (key && crmNameSet.has(key)) {
        crmFilteredOut.push(c.name);
        return false;
      }
      return true;
    });
    const stage1 = { ...stage1Raw, candidates: filteredCandidates };
    if (crmFilteredOut.length > 0) {
      console.log(`Discovery scan: post-filter dropped ${crmFilteredOut.length} CRM-known candidates:`, crmFilteredOut);
    }

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

    // Experimental short-circuit: return after Stage 1 without paying to
    // enrich. Used by the CryptoRank A/B test where we only need to see
    // which candidates Claude surfaced, not their full enrichment.
    if (body.skip_enrichment === true) {
      const stage1Cost = Number(estimateCost(model, stage1.inputTokens, stage1.outputTokens).toFixed(4));
      await finishRun('completed', {
        stage: 1,
        stage1_only: true,
        sources,
        candidates_found: stage1.candidates.length,
        candidates: stage1.candidates,
        input_tokens: stage1.inputTokens,
        output_tokens: stage1.outputTokens,
        cost_usd: stage1Cost,
      });
      return NextResponse.json({
        success: true,
        stage1_only: true,
        candidates_found: stage1.candidates.length,
        candidates: stage1.candidates,
        cost_usd: stage1Cost,
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
    // Extra safety: filter out any enriched projects whose name is in the
    // skip list (Claude might occasionally ignore the instruction). We still
    // wrote progress during enrichment, but we don't want to re-overwrite
    // the existing record with a fresh Claude snapshot when the user just
    // wanted NEW projects.
    const skipSet = new Set(skipNames.map(n => n.toLowerCase()));
    const projectsToWrite = allProjects.filter(p => !skipSet.has((p.name || '').toLowerCase()));
    const skippedDupes = allProjects.length - projectsToWrite.length;

    await updateProgress({
      stage: 'writing',
      message: `Saving ${projectsToWrite.length} enriched prospects${skippedDupes > 0 ? ` (${skippedDupes} dupes filtered)` : ''}...`,
      percent: 92,
    });

    let inserted = 0;
    let updated = 0;
    let signalsAdded = 0;
    const writeErrors: string[] = [];

    // Tier values that trigger a Telegram alert when a NEW prospect is
    // inserted with that tier. We deliberately gate on 'inserted' (not
    // 'updated') so a re-scan that re-confirms an existing hot prospect
    // doesn't re-alert.
    const HOT_ALERT_TIERS = new Set(['REACH_OUT_NOW', 'PRE_TOKEN_PRIORITY']);

    for (const p of projectsToWrite) {
      if (!p.name) continue;
      const result = await writeProject(supabase, p, runId);
      if ('error' in result) {
        writeErrors.push(`${p.name}: ${result.error}`);
      } else {
        if (result.status === 'inserted') inserted++;
        else updated++;

        // Fire hot-tier alert only on fresh inserts with a hot tier.
        if (result.status === 'inserted' && p.action_tier && HOT_ALERT_TIERS.has(p.action_tier)) {
          fireIntelligenceAlert('hot_tier', {
            project_name: p.name,
            prospect_id: result.prospectId,
            tier: p.action_tier,
            score: p.prospect_score?.total ?? 0,
            funding_round: p.funding_round ?? null,
            funding_amount_usd: p.funding_amount_usd ?? null,
          }).catch(err => console.error('[Discovery scan] alert dispatch failed:', err));
        }
      }

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
      skipped_duplicates: skippedDupes,
      skip_list_size: skipNames.length,
      cooldown_days: COOLDOWN_DAYS,
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
      projects_found: projectsToWrite.length,
      skipped_duplicates: skippedDupes,
      skip_list_size: skipNames.length,
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
