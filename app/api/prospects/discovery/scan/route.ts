import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClaudeClient } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/prospects/discovery/scan
 *
 * Uses Claude + web_search to autonomously:
 *   1. Find crypto projects recently funded (primary: DropsTab, secondary: any web result)
 *   2. Identify OUTREACH TRIGGERS per project — signals telling us NOW is the time
 *      to reach out (recent raise, TGE soon, Korea expansion, team hiring, etc.)
 *   3. Extract public contacts (Twitter URL, Telegram URL) with a confidence rating
 *   4. Give a short fit-reasoning note per project
 *
 * Writes to:
 *   - prospects (source='dropstab_discovery', status='needs_review')
 *   - prospect_signals (each trigger → a signal row)
 *
 * Body (all optional):
 *   {
 *     recency_days?: number,       // default 30
 *     min_raise_usd?: number,      // default 1_000_000
 *     max_projects?: number,       // default 20 (caps Claude output)
 *     categories?: string[],       // filter e.g. ['DeFi', 'Gaming']
 *   }
 */

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

interface DiscoveredProject {
  name: string;
  symbol?: string | null;
  category?: string | null;
  website_url?: string | null;
  project_twitter_url?: string | null;
  project_telegram_url?: string | null;
  discord_url?: string | null;
  dropstab_url?: string | null;
  funding_round?: string | null;
  funding_amount_usd?: number | null;
  funding_date?: string | null;
  investors?: string[];
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

export async function POST(request: Request) {
  const startedAt = new Date();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Log an agent run so this surfaces in the AI Agents dashboard.
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

  try {
    const body = await request.json().catch(() => ({}));
    const recencyDays = Math.max(1, Math.min(365, Number(body.recency_days) || 30));
    const minRaise = Math.max(0, Number(body.min_raise_usd) || 1_000_000);
    const maxProjects = Math.max(1, Math.min(50, Number(body.max_projects) || 20));
    const categories: string[] = Array.isArray(body.categories) ? body.categories : [];

    const anthropic = getClaudeClient();

    const systemPrompt = `You are DISCOVERY, the bulk-candidate finder for HoloHive — a Seoul-based KOL growth agency. Your output feeds into SCOUT (which does single-project deep-dives). You use the same ICP framework as SCOUT so rankings are consistent.

HoloHive sells a 90-day Korea Growth Partnership ($48-61K). Clients: pre-token or recently-launched crypto projects looking to enter the Korean market.

## THE 6-CRITERIA ICP CHECK (binary, ALL must PASS)

| # | Criteria | Pass Condition |
|---|----------|----------------|
| 1 | Credible funding | Any amount with credible backers (Crunchbase/RootData/CryptoRank visible, real VCs — not rug-prone) |
| 2 | Pre-token OR TGE within 6 months | Verify via CoinGecko, roadmap, tokenomics |
| 3 | No existing Korea community / marketing team | Check Korean Telegram size (< 1K members = pass), Korean Twitter, LinkedIn for Korea BD hires — but note a NEW Korea BD hire post is a positive trigger, not a fail |
| 4 | End-user product — NOT B2B service provider, VC, exchange, or infrastructure-only (L1/L2 counts as end-user) | Website must show consumer-facing product, app, or protocol. B2B data tools, VC funds, exchanges, trading platforms → FAIL |
| 5 | Real product in development or launched | GitHub commits, app URL, testnet, TVL — not just a whitepaper |
| 6 | Not already with a competitor Korea agency | Check Twitter, announcements for Korea agency partnerships |

For each, record a boolean \`pass\` and a one-line \`evidence\` string.

\`icp_verdict\`: PASS (all 6 pass), FAIL (any fail), BORDERLINE (one unclear).

## INSTANT DISQUALIFIERS (kill switches)

If any match → icp_verdict=FAIL, action_tier=SKIP, and populate disqualification_reason with a clear explanation:
- B2B service provider or infrastructure tool (unless L1/L2)
- VC firm or fund
- Exchange, DEX, or trading platform
- No activity in 60+ days (dead project)
- Korean Telegram already has 1K+ members or active community
- Already working with a competitor Korea marketing agency
- Token launched 6+ months ago AND no Korea-specific trigger
- Team fully anonymous AND no credible backers
- Rug pull history or serious documented controversy
- Pure "global expansion" with ZERO Korea-specific signals

**IMPORTANT:** Even disqualified projects should be included in your submit_discoveries output (with verdict=FAIL + disqualification_reason). Do NOT silently skip them — we want to see your rejections to audit the logic.

## GLOBAL-ONLY PROJECTS (edge case)

If a project passes the other 5 ICP criteria but has ZERO Korea signal whatsoever (and Korea is not a stated/implied future plan), DO NOT set verdict to FAIL. Instead:
- verdict: BORDERLINE
- action_tier: RESEARCH
- Populate \`consideration_reason\`: 1-2 sentences on why this might still be worth human review (e.g. "Strong Series A with Asia-curious investors; worth a 5-min check on founders' recent Asia mentions")

This preserves optionality — the human team decides whether to pursue.

## SIGNAL TAXONOMY (triggers)

Pick the HIGHEST tier a project matches. Multiple triggers add bonus (see scoring).

### TIER 1 — URGENT (within last 7 days)
- "tge_within_60d" — TGE announced, date within 60 days
- "korea_exchange_listing" — Upbit/Bithumb listing confirmed
- "mainnet_launching_this_month" — mainnet going live <30 days
- "korea_bd_hire" — Korea-specific BD hire announced
- "team_relocation_seoul" — team (or exec) relocated to Seoul

### TIER 2 — HIGH (within last 7 days / ongoing)
- "recent_raise" — funding round closed in last 30 days
- "korea_bd_hiring" — Korea BD role actively listed (job post)
- "airdrop_announced" — airdrop planned (team or region-specific)
- "competitor_entered_korea" — peer competitor just launched Korea play
- "korean_media_partnership" — partnership with Korean media/influencer

### TIER 3 — MEDIUM (within last 14 days)
- "accelerator_graduation" — YC, Polkadot Substrate, Binance Labs, etc.
- "hackathon_win"
- "ecosystem_grant_asia"
- "mainnet_2_to_3_months_out"

Each trigger must have: signal_type, headline (<80 chars), detail (1-2 sentences), source_url (preferably a specific tweet), source_type ("tweet" | "article" | "other"), weight (5-25).

**Freshness rules:** TIER 1/2 signals should be within 7 days; TIER 3 within 14 days. Older signals only count for ongoing things (active job posts, product stage).

## SCORING FORMULA (0-100)

**prospect_score.total = icp_fit (0-40) + signal_strength (0-35) + timing (0-25)**

### icp_fit (0-40)
- credible_funding: +10 if pass
- pre_token_or_tge_6mo: +10 if pass
- no_korea_presence: +5 if pass
- real_product: +5 if pass
- team_credible_doxxed: +5 if founders are public and have track record
- hot_narrative: +5 if category is AI, DePIN, RWA, Stablecoins, Restaking, or selective Gaming (currently trending in Korean Telegram)

### signal_strength (0-35, HARD CAP)
Base (pick HIGHEST, don't stack):
- TIER 1 (URGENT) trigger: +15 base
- TIER 2 (HIGH) trigger: +10 base
- TIER 3 (MEDIUM) trigger: +5 base
Bonuses on top:
- Multiple triggers (2+): +5
- Behavioral signal (engaged with HoloHive team, mentioned Asia/Korea in thread): +5
- Contextual signal (category trending in Korean Telegram): +5

### timing (0-25, pick SINGLE highest)
- TGE in <8 weeks: 25
- Post-funding <30 days: 20
- Mainnet launching this month: 20
- TGE in 2-4 months: 15
- Korea BD role actively hired: 15
- Expressed interest in Asia/Korea recently: 15
- Major Seoul event coming (ETH Seoul, KBW): 10
- No timing trigger: 0

## ACTION TIER MAPPING

- 80-100 → "REACH_OUT_NOW"
- 60-79  → "PRE_TOKEN_PRIORITY"
- 45-59  → "RESEARCH"
- 30-44  → "WATCH"
- 15-29  → "NURTURE"
- 0-14 OR disqualified → "SKIP"

## KOREA MARKET CONTEXT (April 2026)

- 2nd-largest crypto market globally ($663B YTD)
- Corporate crypto ban lifted Feb 2026 → institutions can trade
- Upbit: 72% market share. Bithumb: #2, IPO planned
- **Trending in Korean Telegram:** AI, DePIN, RWA, Stablecoins, Restaking, selective Gaming
- **Korea = Telegram, NOT Twitter.** Korean Twitter is noisy; retail discovery happens on Telegram. When checking Korea presence (ICP criterion #3), check TELEGRAM size, not Twitter follower counts.

## TRIGGER RESEARCH APPROACH

Primary source for triggers: **X/Twitter** — the project account + team members' personal accounts. Founders announce raises/TGE/Korea plans there first, often weeks before news.
- Read the pinned tweet + last ~10 tweets
- Check key team members' recent posts
- Fall back to news (TokenPost, BlockMedia, Decrypt, The Block) only if nothing on X

Each trigger's source_url should be a specific URL (tweet, announcement blog, press release). Not a generic homepage.

## OUTREACH CONTACTS (POCs)

HoloHive does cold BD via **Telegram DM**. We need individual decision-makers' personal handles — NOT the project's community channel.

For each project, identify 1-3 team members in priority order:
1. CEO / Founder (best)
2. CMO / Head of Marketing / Head of Growth
3. BD lead / Head of BD
4. Community lead (last resort — they gate-keep)

For each contact find:
- Personal X handle (from team page or their tweets)
- Personal Telegram handle (often in X bio — crypto founders/BDs put their TG there specifically for cold DMs)
- confidence: "high" (verified X bio or project team page), "medium" (crypto directory / second-hand), "low" (guess — only return if no better lead)

Empty outreach_contacts is FINE and better than fabricated.

The \`project_twitter_url\` and \`project_telegram_url\` fields are the project's community channels — useful for monitoring, NOT outreach.

## OUTPUT RULES

- Return ALL projects you researched, including disqualified ones (with verdict=FAIL + disqualification_reason)
- Sort by prospect_score descending
- At most ${maxProjects} projects total
- Use web_search for evidence — up to 30 searches
- When done, call submit_discoveries EXACTLY ONCE. Do not reply with plain text.
- Quality > quantity. If you can only find 8 qualifying candidates, return 8.${categories.length > 0 ? `\n- User-specified category filter: ${categories.join(', ')}` : ''}
- User-specified funding filter: minimum $${minRaise.toLocaleString()} raised in the last ${recencyDays} days`;

    const userPrompt = `Find the top ${maxProjects} crypto projects HoloHive should DM this week.

Process per project:
  1. Start on https://dropstab.com/tab/by-raised-funds or equivalent to identify candidates (recent raise in last ${recencyDays} days, $${minRaise.toLocaleString()}+ raised).
  2. Open the project's X/Twitter account. Read the pinned tweet + last ~10 tweets. Pull triggers from what the team is saying RIGHT NOW — raises, TGE dates, Korea plans, new hires. Each trigger's source_url should be a tweet URL where possible.
  3. Identify 1-3 decision-makers on the team (CEO > CMO > BD > Community). For each, find their personal X handle and — if possible — their Telegram handle from their X bio or crypto directories. Rate confidence per contact.
  4. Fit_reasoning: 1-2 sentences on why this project would be a good HoloHive client.

Call submit_discoveries when done. If a project has no triggers from X and only news mentions, include it but lower its fit_score.`;

    // Structured output via a custom tool. Claude uses web_search to gather
    // evidence, then calls submit_discoveries with the final structured list
    // — this gives us guaranteed valid JSON without regex parsing.
    const submitToolSchema = {
      name: 'submit_discoveries',
      description: 'Submit the final list of discovered projects with their outreach triggers, contacts, and fit reasoning. Call this ONCE when research is complete.',
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
                project_twitter_url: { type: 'string', description: "Project's official X/Twitter URL — community channel, NOT for outreach" },
                project_telegram_url: { type: 'string', description: "Project's public Telegram channel URL — for community, NOT for outreach" },
                discord_url: { type: 'string' },
                dropstab_url: { type: 'string' },
                funding_round: { type: 'string' },
                funding_amount_usd: { type: 'number' },
                funding_date: { type: 'string', description: 'ISO YYYY-MM-DD if known' },
                investors: { type: 'array', items: { type: 'string' } },

                // ICP qualification (the 6 binary checks)
                icp_verdict: {
                  type: 'string',
                  enum: ['PASS', 'FAIL', 'BORDERLINE'],
                  description: 'PASS = all 6 criteria pass. FAIL = any criterion fails OR instant disqualifier triggered. BORDERLINE = one criterion unclear OR global-only project with no Korea signal.',
                },
                icp_checks: {
                  type: 'object',
                  description: 'Each criterion: { pass: boolean, evidence: string }',
                  properties: {
                    credible_funding: {
                      type: 'object',
                      properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } },
                      required: ['pass', 'evidence'],
                    },
                    pre_token_or_tge_6mo: {
                      type: 'object',
                      properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } },
                      required: ['pass', 'evidence'],
                    },
                    no_korea_presence: {
                      type: 'object',
                      properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } },
                      required: ['pass', 'evidence'],
                    },
                    end_user_product: {
                      type: 'object',
                      properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } },
                      required: ['pass', 'evidence'],
                    },
                    real_product: {
                      type: 'object',
                      properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } },
                      required: ['pass', 'evidence'],
                    },
                    not_with_competitor: {
                      type: 'object',
                      properties: { pass: { type: 'boolean' }, evidence: { type: 'string' } },
                      required: ['pass', 'evidence'],
                    },
                  },
                  required: [
                    'credible_funding',
                    'pre_token_or_tge_6mo',
                    'no_korea_presence',
                    'end_user_product',
                    'real_product',
                    'not_with_competitor',
                  ],
                },
                disqualification_reason: {
                  type: 'string',
                  description: 'Required if icp_verdict=FAIL. Explains which criterion failed or which instant disqualifier triggered.',
                },
                consideration_reason: {
                  type: 'string',
                  description: 'For BORDERLINE projects (e.g. global-only, no Korea signal). Why this might still be worth human review.',
                },

                // Prospect score (0-100)
                prospect_score: {
                  type: 'object',
                  properties: {
                    icp_fit: { type: 'number', description: '0-40' },
                    signal_strength: { type: 'number', description: '0-35 hard cap' },
                    timing: { type: 'number', description: '0-25' },
                    total: { type: 'number', description: '0-100 — must equal sum of the three subscores' },
                  },
                  required: ['icp_fit', 'signal_strength', 'timing', 'total'],
                },
                action_tier: {
                  type: 'string',
                  enum: ['REACH_OUT_NOW', 'PRE_TOKEN_PRIORITY', 'RESEARCH', 'WATCH', 'NURTURE', 'SKIP'],
                  description: 'Derived from prospect_score. REACH_OUT_NOW=80-100, PRE_TOKEN_PRIORITY=60-79, RESEARCH=45-59, WATCH=30-44, NURTURE=15-29, SKIP=0-14 or disqualified.',
                },

                outreach_contacts: {
                  type: 'array',
                  description: 'Individual decision-makers at the project to DM directly. Prefer CEO/Founder > CMO > BD. Empty array is fine — better than fabricated.',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: 'Person\'s full name' },
                      role: { type: 'string', description: 'e.g. CEO, Founder, CMO, Head of BD, Head of Growth' },
                      twitter_handle: { type: 'string', description: 'Their personal X handle, e.g. "@alice" or full URL' },
                      telegram_handle: { type: 'string', description: 'Their personal Telegram handle for cold DM. Empty if not findable.' },
                      source_url: { type: 'string', description: 'Where you found this info (X bio, team page, etc.)' },
                      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                      notes: { type: 'string', description: 'Optional: recent activity or why they\'re the right POC' },
                    },
                    required: ['name', 'role', 'confidence'],
                  },
                },
                triggers: {
                  type: 'array',
                  description: 'Active outreach triggers. Empty allowed for disqualified projects; required for PASS/BORDERLINE.',
                  items: {
                    type: 'object',
                    properties: {
                      signal_type: { type: 'string', description: 'e.g. recent_raise, tge_within_60d, korea_bd_hire' },
                      headline: { type: 'string', description: 'Short summary, <80 chars' },
                      detail: { type: 'string', description: '1-2 sentences of context. Quote the tweet if applicable.' },
                      source_url: { type: 'string', description: 'Ideally a specific tweet URL (x.com / twitter.com) — fall back to article URL only if no tweet available' },
                      source_type: { type: 'string', enum: ['tweet', 'article', 'other'], description: 'Where the trigger was found' },
                      tier: { type: 'string', enum: ['TIER_1', 'TIER_2', 'TIER_3'], description: 'Urgency tier per the taxonomy' },
                      weight: { type: 'number', description: '5-25, higher = stronger trigger' },
                    },
                    required: ['signal_type', 'headline'],
                  },
                },
                fit_reasoning: {
                  type: 'string',
                  description: 'Why this is a good fit for HoloHive, 1-2 sentences. Required for PASS/BORDERLINE. Leave empty for FAIL projects (use disqualification_reason instead).',
                },
              },
              required: ['name', 'icp_verdict', 'icp_checks', 'prospect_score', 'action_tier'],
            },
          },
        },
        required: ['projects'],
      },
    };

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 30 } as any,
        submitToolSchema as any,
      ],
    });

    // Find the submit_discoveries tool call in the response
    const submitBlock = response.content.find(
      (b: any) => b.type === 'tool_use' && b.name === 'submit_discoveries',
    ) as any;

    let parsed: { projects: DiscoveredProject[] };

    if (submitBlock?.input?.projects) {
      // Happy path — structured tool call
      parsed = submitBlock.input as { projects: DiscoveredProject[] };
    } else {
      // Fallback: Claude responded with plain text. Try to extract JSON
      // from the last text block (not a concatenation — intermediate
      // text blocks contain reasoning, not the final answer).
      const textBlocks = response.content.filter((b: any) => b.type === 'text') as any[];
      const lastText = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text : '';

      const extractJson = (src: string): string | null => {
        const fence = src.match(/```json\s*([\s\S]*?)```/) || src.match(/```\s*([\s\S]*?)```/);
        if (fence) return fence[1];
        const firstBrace = src.indexOf('{');
        const lastBrace = src.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) return src.slice(firstBrace, lastBrace + 1);
        return null;
      };

      const jsonStr = extractJson(lastText) || extractJson(textBlocks.map(b => b.text).join('\n')) || '';

      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        await finishRun(
          'failed',
          {
            stop_reason: response.stop_reason,
            block_types: response.content.map((b: any) => b.type),
            last_text_sample: lastText.slice(0, 500),
          },
          'Claude did not call submit_discoveries and response did not contain parseable JSON',
        );
        return NextResponse.json(
          {
            error: 'Claude did not return structured results. This usually means it ran out of tokens, hit rate limits, or couldn\'t find enough projects. Try a narrower scan (smaller max_projects or wider recency).',
            stop_reason: response.stop_reason,
            block_types: response.content.map((b: any) => b.type),
            last_text_sample: lastText.slice(0, 500),
          },
          { status: 502 },
        );
      }
    }

    const projects = parsed.projects || [];

    // --- Upsert prospects and signals ---
    let inserted = 0;
    let updated = 0;
    let signalsAdded = 0;
    const errors: string[] = [];

    for (const p of projects) {
      if (!p.name) continue;

      // Match against existing prospects by name (any source) to avoid duplicates
      const { data: existing } = await (supabase as any)
        .from('prospects')
        .select('id, source, status')
        .ilike('name', p.name)
        .limit(1)
        .maybeSingle();

      let prospectId: string | null = existing?.id ?? null;

      // Filter out low-confidence contacts — keep high + medium.
      // If nothing but low is available, keep low so we don't throw away leads,
      // but the UI will flag them.
      const contacts = (p.outreach_contacts || []).filter(c => c && c.name && c.role);

      // Full Discovery qualification snapshot. We keep this separate from the
      // Korea-Signals-driven action_tier field so the two systems don't overwrite
      // each other.
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

      const prospectFields: Record<string, any> = {
        name: p.name,
        symbol: p.symbol ?? null,
        category: p.category ?? null,
        website_url: p.website_url ?? null,
        // Project-level channels (community, not outreach)
        twitter_url: p.project_twitter_url ?? null,
        telegram_url: p.project_telegram_url ?? null,
        discord_url: p.discord_url ?? null,
        source_url: p.dropstab_url ?? null,
        outreach_contacts: contacts,
        discovery_snapshot: discoverySnapshot,
        updated_at: new Date().toISOString(),
      };

      if (!prospectId) {
        // New prospect — insert with discovery source
        const { data: ins, error: insErr } = await (supabase as any)
          .from('prospects')
          .insert({
            ...prospectFields,
            source: 'dropstab_discovery',
            status: 'needs_review',
            scraped_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (insErr) {
          errors.push(`Insert ${p.name}: ${insErr.message}`);
          continue;
        }
        prospectId = ins.id;
        inserted++;
      } else {
        // Existing prospect — only update fields we learned (don't overwrite with nulls).
        // For outreach_contacts, MERGE with existing (dedup by name+role) rather than replace,
        // so manual edits aren't blown away.
        const patch: Record<string, any> = {
          updated_at: new Date().toISOString(),
          // Discovery always overwrites its own snapshot with the latest qualification
          discovery_snapshot: discoverySnapshot,
        };
        if (p.project_twitter_url) patch.twitter_url = p.project_twitter_url;
        if (p.project_telegram_url) patch.telegram_url = p.project_telegram_url;
        if (p.category) patch.category = p.category;
        if (p.website_url) patch.website_url = p.website_url;

        if (contacts.length > 0) {
          const { data: currentProspect } = await (supabase as any)
            .from('prospects')
            .select('outreach_contacts')
            .eq('id', prospectId)
            .single();
          const existingContacts: OutreachContact[] = currentProspect?.outreach_contacts || [];
          const merged = [...existingContacts];
          for (const newC of contacts) {
            const match = merged.findIndex(e =>
              e.name?.toLowerCase() === newC.name.toLowerCase() && e.role === newC.role,
            );
            if (match >= 0) {
              // Update if new has higher confidence or fills missing fields
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
          patch.outreach_contacts = merged;
        }
        await (supabase as any).from('prospects').update(patch).eq('id', prospectId);
        updated++;
      }

      // Write triggers as prospect_signals rows (dedup by project+type+headline)
      for (const trigger of p.triggers || []) {
        if (!trigger.signal_type || !trigger.headline) continue;

        const { data: dup } = await (supabase as any)
          .from('prospect_signals')
          .select('id')
          .eq('project_name', p.name)
          .eq('signal_type', trigger.signal_type)
          .eq('headline', trigger.headline)
          .gte('detected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1);
        if (dup && dup.length > 0) continue;

        const { error: sigErr } = await (supabase as any)
          .from('prospect_signals')
          .insert({
            prospect_id: prospectId,
            project_name: p.name,
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
              fit_reasoning: p.fit_reasoning ?? null,
              prospect_score: p.prospect_score?.total ?? null,
              action_tier: p.action_tier,
              source_type: trigger.source_type ?? null,
              tier: trigger.tier ?? null,
              funding: {
                round: p.funding_round ?? null,
                amount_usd: p.funding_amount_usd ?? null,
                date: p.funding_date ?? null,
                investors: p.investors ?? [],
              },
              agent_run_id: runId,
            },
            detected_at: new Date().toISOString(),
            is_active: true,
          });
        if (sigErr) errors.push(`Signal ${p.name}: ${sigErr.message}`);
        else signalsAdded++;
      }
    }

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    // Sonnet 4.5 pricing: $3/MTok in, $15/MTok out (rough)
    const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

    await finishRun('completed', {
      projects_found: projects.length,
      inserted,
      updated,
      signals_added: signalsAdded,
      errors: errors.length,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });

    return NextResponse.json({
      success: true,
      projects_found: projects.length,
      inserted,
      updated,
      signals_added: signalsAdded,
      errors,
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
