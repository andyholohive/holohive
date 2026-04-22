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
  outreach_contacts?: OutreachContact[];
  triggers?: Array<{
    signal_type: string;
    headline: string;
    detail?: string;
    source_url?: string;
    source_type?: 'tweet' | 'article' | 'other';
    weight?: number;
  }>;
  fit_reasoning?: string;
  fit_score?: number;
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

    const systemPrompt = `You are DISCOVERY, a BD research agent for HoloHive — a KOL marketing agency serving the Korean crypto market.

Your job: find crypto projects that are prime reach-out candidates RIGHT NOW, and surface individual humans on the team who could be DM'd.

## ICP (Ideal Customer Profile)
- Raised $${minRaise.toLocaleString()}+ in the last ${recencyDays} days
- Pre-TGE OR recent TGE, OR planning a token launch
- Any sign of Korea / APAC market interest (ideal but not required)
- Active team, not dormant
- Categories we serve well: DeFi, Gaming, AI, Infrastructure, L1/L2, RWA, DePIN${categories.length > 0 ? `\n- User-specified category filter: ${categories.join(', ')}` : ''}

## Finding triggers (THE BAR IS HIGH)
Primary source for triggers is **Twitter/X — both the project account AND team members' personal accounts**. This is where founders announce raises, TGE dates, Korea plans, partnerships, etc. — usually weeks before news coverage.

- Search: "site:x.com <project> raise", "site:x.com <founder> Korea", etc.
- Read the project's pinned tweet, last 5-10 tweets, and key team members' recent posts
- Only fall back to news articles (TokenPost, BlockMedia, Decrypt) if nothing on X

Trigger types (use these signal_type slugs, or invent snake_case new ones if needed):
- "recent_raise" — closed a round in the last 30 days
- "tge_within_60d" — token launch scheduled in <60 days
- "korea_expansion_announce" — announced Korea market entry
- "korea_exchange_listing" — listed or about to list on Upbit / Bithumb
- "korea_job_posting" — hiring Korean-speaking staff
- "mainnet_launch" — mainnet going live soon
- "airdrop_announcement" — airdrop coming
- "partnership_announcement" — major partnership
- "leadership_change" — new CMO/BD/Growth hire
- "ecosystem_asia_initiative" — Asia-focused grants/initiatives
- "founder_active_on_x" — founder has been posting actively about growth

Every trigger's \`source_url\` should ideally be a specific tweet URL (x.com or twitter.com) that evidences it. If using a news article, that's fine — just make sure the URL points to the exact piece.

## Contacts — CRITICAL
HoloHive does **cold BD outreach via Telegram DM**. We do NOT want to join the project's community channel. We want the DECISION-MAKER's personal handle — someone who can say yes to a KOL campaign.

For each project, try to identify **1-3 humans on the team** — prioritizing in order:
  1. CEO / Founder (best)
  2. CMO / Head of Marketing / Head of Growth
  3. BD lead / Head of BD
  4. Community lead / Ecosystem lead (last resort — they usually gate-keep)

For each contact, look for:
- Their **X/Twitter handle** (usually in the project's team page or their tweets)
- Their **Telegram handle** — often put in their X bio specifically for cold DMs. Search "<person name> telegram" or read their bio.
- Confidence rating: "high" = found it on their verified X bio or project team page; "medium" = found it via crypto directory or second-hand mention; "low" = guessed from similar name patterns (DON'T return low-confidence contacts unless it's the only lead).

If you can't find any personal handle for a project, return an empty \`outreach_contacts\` array — that's fine. Empty is better than fabricated.

The \`project_twitter_url\` and \`project_telegram_url\` fields are for the project's community channels — useful for monitoring, NOT outreach.

## How to respond
Use web_search to gather evidence. You have up to 30 searches. When done, call \`submit_discoveries\` EXACTLY ONCE with the final list.

Do NOT reply with plain text. Only call the tool.

Return at most ${maxProjects} projects, sorted by fit_score descending. Every project must have at least one trigger and a fit_reasoning. Quality over quantity — return fewer if that means better data.`;

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
                project_telegram_url: { type: 'string', description: "Project's public Telegram channel URL — for community/announcements, NOT for outreach" },
                discord_url: { type: 'string' },
                dropstab_url: { type: 'string' },
                funding_round: { type: 'string' },
                funding_amount_usd: { type: 'number' },
                funding_date: { type: 'string', description: 'ISO YYYY-MM-DD if known' },
                investors: { type: 'array', items: { type: 'string' } },
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
                  items: {
                    type: 'object',
                    properties: {
                      signal_type: { type: 'string', description: 'e.g. recent_raise, tge_within_60d, korea_expansion_announce, founder_active_on_x' },
                      headline: { type: 'string', description: 'Short summary, <80 chars' },
                      detail: { type: 'string', description: '1-2 sentences of context. Quote the tweet if applicable.' },
                      source_url: { type: 'string', description: 'Ideally a specific tweet URL (x.com / twitter.com) — fall back to article URL only if no tweet available' },
                      source_type: { type: 'string', enum: ['tweet', 'article', 'other'], description: 'Where the trigger was found' },
                      weight: { type: 'number', description: '5-25, higher = stronger trigger' },
                    },
                    required: ['signal_type', 'headline'],
                  },
                  minItems: 1,
                },
                fit_reasoning: { type: 'string', description: 'Why this is a good fit for HoloHive, 1-2 sentences' },
                fit_score: { type: 'number', description: '0-100 confidence they would be a good client' },
              },
              required: ['name', 'triggers', 'fit_reasoning'],
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
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
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
              fit_score: p.fit_score ?? null,
              source_type: trigger.source_type ?? null,
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
