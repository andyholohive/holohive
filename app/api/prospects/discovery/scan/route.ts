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

interface DiscoveredProject {
  name: string;
  symbol?: string | null;
  category?: string | null;
  website_url?: string | null;
  twitter_url?: string | null;
  telegram_url?: string | null;
  discord_url?: string | null;
  dropstab_url?: string | null;
  contact_confidence?: 'high' | 'medium' | 'low';
  funding_round?: string | null;
  funding_amount_usd?: number | null;
  funding_date?: string | null;
  investors?: string[];
  triggers?: Array<{
    signal_type: string;
    headline: string;
    detail?: string;
    source_url?: string;
    weight?: number;
  }>;
  fit_reasoning?: string;
  fit_score?: number; // 0–100 Claude's subjective fit
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

Your job: find crypto projects that are prime reach-out candidates RIGHT NOW.

Our ICP (Ideal Customer Profile):
- Raised $${minRaise.toLocaleString()}+ in the last ${recencyDays} days
- Pre-TGE OR recent TGE, OR planning a token launch
- Any sign of Korea / APAC market interest (ideal but not required)
- Active team, not dormant
- Categories we serve well: DeFi, Gaming, AI, Infrastructure, L1/L2, RWA, DePIN${categories.length > 0 ? `\n- User-specified category filter: ${categories.join(', ')}` : ''}

For each project, identify OUTREACH TRIGGERS — specific reasons NOW is the moment:
- "recent_raise" — closed a round in the last 30 days
- "tge_within_60d" — token launch scheduled or likely in <60 days
- "korea_expansion_announce" — announced Korea market entry
- "korea_exchange_listing" — listed or about to list on Upbit / Bithumb
- "korea_job_posting" — hiring Korean-speaking staff / community manager
- "mainnet_launch" — mainnet going live soon
- "airdrop_announcement" — airdrop coming
- "partnership_announcement" — major partnership
- "leadership_change" — new CMO/BD hire
- "ecosystem_asia_initiative" — Asia-focused grants/initiatives

Primary source: https://dropstab.com (browse funding rounds, coin pages for contact links and tokenomics).
Also valid: CryptoRank, Messari, project websites, Twitter announcements, Korean crypto news (TokenPost, BlockMedia).

CONTACT LOOKUP: From DropsTab project pages (or the project's own site), find:
- Twitter/X URL (project official account)
- Telegram URL (project official channel or group)
Rate your confidence: "high" if on dropstab/official site, "medium" if from reputable secondary, "low" if inferred.

OUTPUT STRICT JSON ONLY, no markdown, no prose. Schema:

{
  "projects": [
    {
      "name": string (required),
      "symbol": string | null,
      "category": string | null,
      "website_url": string | null,
      "twitter_url": string | null,
      "telegram_url": string | null,
      "discord_url": string | null,
      "dropstab_url": string | null,
      "contact_confidence": "high" | "medium" | "low",
      "funding_round": string | null,
      "funding_amount_usd": number | null,
      "funding_date": string | null,          // ISO YYYY-MM-DD if known
      "investors": string[],
      "triggers": [
        {
          "signal_type": string,                 // one of the list above, or a new snake_case slug
          "headline": string,                    // short, <80 chars
          "detail": string,                      // 1-2 sentences of context
          "source_url": string,                  // link to the evidence
          "weight": number                       // 5-25, higher = stronger trigger
        }
      ],
      "fit_reasoning": string,                   // WHY this is a good fit for HoloHive, 1-2 sentences
      "fit_score": number                        // 0-100, your confidence they'd be a good client
    }
  ]
}

Return at most ${maxProjects} projects, sorted by fit_score descending. Every project must have at least one trigger.`;

    const userPrompt = `Find the top ${maxProjects} crypto projects that HoloHive should reach out to this week.

Start on https://dropstab.com/tab/by-raised-funds to see recent raises. For each promising project, open its DropsTab coin page to get Twitter + Telegram URLs and investor list. Cross-reference with Twitter announcements and Korean crypto news for outreach triggers.

Focus on the last ${recencyDays} days. Minimum raise: $${minRaise.toLocaleString()}.

Remember: output strict JSON only.`;

    // Call Claude with server-side web_search tool enabled.
    // Anthropic executes searches and page fetches internally and gives us
    // the final synthesized answer — no tool-use loop needed on our side.
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 30,
        } as any,
      ],
    });

    // Extract the final text block
    const textBlocks = response.content.filter((b: any) => b.type === 'text');
    const rawText = textBlocks.map((b: any) => b.text).join('\n');

    // Claude sometimes wraps JSON in ```json fences despite instructions
    const jsonMatch =
      rawText.match(/```json\s*([\s\S]*?)```/) ||
      rawText.match(/\{[\s\S]*"projects"[\s\S]*\}/);
    const jsonStr = jsonMatch
      ? (jsonMatch[1] || jsonMatch[0])
      : rawText;

    let parsed: { projects: DiscoveredProject[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      await finishRun('failed', { raw_text: rawText.slice(0, 500) }, 'Failed to parse Claude JSON response');
      return NextResponse.json(
        { error: 'Failed to parse Claude response as JSON', raw: rawText.slice(0, 1000) },
        { status: 502 },
      );
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

      const prospectFields: Record<string, any> = {
        name: p.name,
        symbol: p.symbol ?? null,
        category: p.category ?? null,
        website_url: p.website_url ?? null,
        twitter_url: p.twitter_url ?? null,
        telegram_url: p.telegram_url ?? null,
        discord_url: p.discord_url ?? null,
        source_url: p.dropstab_url ?? null,
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
        // Existing prospect — only update fields we learned (don't overwrite with nulls)
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        if (p.twitter_url && !prospectFields.twitter_url_existing) patch.twitter_url = p.twitter_url;
        if (p.telegram_url) patch.telegram_url = p.telegram_url;
        if (p.category) patch.category = p.category;
        if (p.website_url) patch.website_url = p.website_url;
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
              contact_confidence: p.contact_confidence ?? null,
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
