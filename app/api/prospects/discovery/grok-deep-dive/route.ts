import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { grokChatCompletion, estimateGrokCost, extractJson, GrokError } from '@/lib/grok';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/prospects/discovery/grok-deep-dive
 *
 * For each eligible POC (outreach_contacts with a twitter_handle on a
 * non-SKIP discovery prospect), asks Grok to read that POC's X timeline
 * over the lookback window and flag Korea / Asia relevance signals.
 *
 * Findings become `prospect_signals` rows with:
 *   signal_type:   'poc_korea_mention' (positive signals) or 'poc_asia_mention'
 *   source_name:   'grok_x_deep_scan'
 *   tier:          1
 *   relevancy_weight: 15-25 based on Grok's confidence
 *   shelf_life_days: caller-specified (default 30)
 *
 * Body:
 *   {
 *     prospect_ids?: string[],      // optional, restrict to these prospects
 *     lookback_days?: number,        // default 90
 *     shelf_life_days?: number,      // default 30
 *     max_tweets?: number,           // default 50 per POC
 *     max_pocs?: number,             // default 500 (safety cap), set lower to limit cost
 *   }
 */

// Tier priority — lower number = "hotter", scanned first when max_pocs caps
// the work. Prospects with no tier fall to the bottom.
const TIER_PRIORITY: Record<string, number> = {
  REACH_OUT_NOW: 0,
  PRE_TOKEN_PRIORITY: 1,
  RESEARCH: 2,
  WATCH: 3,
  NURTURE: 4,
};

interface Finding {
  type: string;                       // e.g. "korea_direct_mention", "asia_strategy_hint"
  tweet_url: string;
  tweet_text: string;
  tweet_date: string;                 // ISO
  confidence: 'high' | 'medium' | 'low';
  relevance: string;                  // short explanation
}

interface GrokResult {
  poc: {
    handle: string;
    display_name?: string;
    follower_count?: number;
    tweets_analyzed?: number;
  };
  findings: Finding[];
  summary: string;
  korea_interest_score: number;      // 0-100
}

const CONFIDENCE_WEIGHT: Record<string, number> = {
  high: 25,
  medium: 18,
  low: 12,
};

function normalizeHandle(h: string): string {
  return h.trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '').replace(/^@/, '').split(/[?/]/)[0];
}

export async function POST(request: Request) {
  const startedAt = new Date();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Pre-flight: GROK_API_KEY must be set
  if (!process.env.GROK_API_KEY) {
    return NextResponse.json(
      { error: 'GROK_API_KEY env var is not set. Add it in Vercel (from https://x.ai/api) to enable Deep Dive.' },
      { status: 400 },
    );
  }

  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'DISCOVERY',
      run_type: 'grok_deep_dive',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: {},
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (status: 'completed' | 'failed', output: any, error?: string) => {
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
    const specificIds: string[] | null = Array.isArray(body.prospect_ids) ? body.prospect_ids : null;
    const lookbackDays = Math.max(7, Math.min(365, Number(body.lookback_days) || 90));
    const shelfLifeDays = Math.max(1, Math.min(180, Number(body.shelf_life_days) || 30));
    const maxTweets = Math.max(10, Math.min(200, Number(body.max_tweets) || 50));
    // Safety cap: refuse to scan more than `max_pocs` POCs in a single run.
    // Prospects are prioritized by action_tier so hot leads get the budget.
    const maxPocs = Math.max(1, Math.min(500, Number(body.max_pocs) || 500));

    // Load target prospects. Non-SKIP, with outreach_contacts that have x handles.
    let query = (supabase as any)
      .from('prospects')
      .select('id, name, outreach_contacts, discovery_snapshot')
      .eq('source', 'dropstab_discovery')
      .range(0, 4999);
    if (specificIds && specificIds.length > 0) query = query.in('id', specificIds);

    const { data: prospects, error: loadErr } = await query;
    if (loadErr) throw loadErr;

    // Sort prospects by tier priority so hot leads are first. That way, if
    // `max_pocs` caps the run, the highest-value POCs are the ones scanned.
    const sortedProspects = [...(prospects || [])].sort((a: any, b: any) => {
      const aTier = a.discovery_snapshot?.action_tier ?? '';
      const bTier = b.discovery_snapshot?.action_tier ?? '';
      const aPri = TIER_PRIORITY[aTier] ?? 99;
      const bPri = TIER_PRIORITY[bTier] ?? 99;
      return aPri - bPri;
    });

    // Flatten to a per-POC work list. Skip SKIP-tier and any POC without a handle.
    type PocTarget = { prospect_id: string; project_name: string; poc_name: string; poc_role: string; handle: string };
    const allTargets: PocTarget[] = [];
    for (const p of sortedProspects) {
      const tier = p.discovery_snapshot?.action_tier;
      if (tier === 'SKIP') continue;
      for (const c of p.outreach_contacts || []) {
        if (!c?.twitter_handle) continue;
        allTargets.push({
          prospect_id: p.id,
          project_name: p.name,
          poc_name: c.name,
          poc_role: c.role || 'contact',
          handle: normalizeHandle(c.twitter_handle),
        });
      }
    }

    // Apply the max_pocs cap after sorting — hot leads first.
    const targets = allTargets.slice(0, maxPocs);
    const skippedDueToCap = allTargets.length - targets.length;

    if (targets.length === 0) {
      await finishRun('completed', { pocs_scanned: 0, signals_added: 0 });
      return NextResponse.json({
        success: true,
        pocs_scanned: 0,
        signals_added: 0,
        errors: [],
        message: 'No POCs with X handles to deep-dive.',
      });
    }

    // Date window for Grok's search
    const now = new Date();
    const fromDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const fromDateISO = fromDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const SYSTEM_PROMPT = `You are a BD research analyst for HoloHive, a Seoul-based KOL growth agency.

Given an X/Twitter handle, read their recent posts (tweets + replies) and flag ANY content relevant to Korea / Asia strategy. Use live X search to pull fresh data.

## WHAT TO FLAG
- Korea / Seoul / KBW / Busan / Korean language content
- Upbit / Bithumb / Korean exchange listings
- Hashed / Dunamu / Kakao Ventures / Samsung / Korean VCs
- APAC / Asia expansion / Tokyo / Singapore (as lead-in to Korea intent)
- Korean partnerships / collaborations / advisors
- Trips to Korea / conferences in Korea / hiring in Korea
- Korean community / KOL / influencer mentions

## TIME WINDOW
Only consider posts from {lookback_start_date} forward (last {lookback_days} days).
Do NOT include anything older, even if it mentions Korea.

## OUTPUT
Return strict JSON (no markdown fences, no prose):
{
  "poc": {
    "handle": "string (without @)",
    "display_name": "string",
    "follower_count": number,
    "tweets_analyzed": number
  },
  "findings": [
    {
      "type": "korea_direct_mention" | "asia_strategy_hint" | "korean_partnership" | "kbw_attendance" | "korean_travel" | "exchange_mention" | "korean_vc" | "other",
      "tweet_url": "https://x.com/handle/status/...",
      "tweet_text": "quoted tweet (truncate to 280 chars)",
      "tweet_date": "ISO timestamp",
      "confidence": "high" | "medium" | "low",
      "relevance": "short explanation of why this matters"
    }
  ],
  "summary": "2-3 sentences on the POC's Korea/Asia activity pattern",
  "korea_interest_score": 0-100
}

If the handle is private, doesn't exist, or has no relevant content, return an empty findings array with korea_interest_score: 0 and explain in summary.`;

    // Run POCs sequentially — xAI rate limits are modest, and this keeps
    // cost predictable (a runaway parallel loop could be expensive).
    let pocsScanned = 0;
    let pocsFailed = 0;
    let signalsAdded = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalSources = 0;
    const errors: string[] = [];
    const perPocResults: any[] = [];

    for (const t of targets) {
      try {
        const systemPrompt = SYSTEM_PROMPT
          .replace('{lookback_start_date}', fromDateISO)
          .replace('{lookback_days}', String(lookbackDays));

        const userPrompt = `Analyze X handle: @${t.handle}
Role context: ${t.poc_name} (${t.poc_role}) at project "${t.project_name}".
Tweet budget: read up to ${maxTweets} posts.

STRICT DATE FILTER: only include posts dated ${fromDateISO} or later (i.e. the last ${lookbackDays} days). Ignore anything older, even if it's strongly Korea-related. Each finding MUST include an accurate tweet_date ISO timestamp so this can be verified.

Use the x_search tool to pull the POC's recent timeline. Return strict JSON per the schema in the system prompt.`;

        const response = await grokChatCompletion({
          model: 'grok-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 4000,
          temperature: 0.2,
          // xAI Agent Tools API (replaces the deprecated `search_parameters`
          // live-search config). No date range option — the lookback window
          // is enforced via the system prompt and a server-side post-filter
          // on tweet_date below.
          tools: [{ type: 'x_search' }],
        });

        totalInputTokens += response.usage?.prompt_tokens ?? 0;
        totalOutputTokens += response.usage?.completion_tokens ?? 0;
        totalSources += response.usage?.num_sources_used ?? 0;

        const text = response.choices[0]?.message?.content ?? '';
        const parsed: GrokResult | null = extractJson(text);
        if (!parsed) {
          errors.push(`${t.handle}: couldn't parse Grok response`);
          pocsFailed++;
          continue;
        }

        // Write findings as prospect_signals
        let findingsWritten = 0;
        const cutoffMs = fromDate.getTime();
        for (const f of parsed.findings || []) {
          if (!f.tweet_text || !f.tweet_url) continue;
          // Safety: filter anything older than the lookback window
          const tweetMs = f.tweet_date ? new Date(f.tweet_date).getTime() : NaN;
          if (Number.isFinite(tweetMs) && tweetMs < cutoffMs) continue;

          // Map Grok's finding type to our signal_type taxonomy
          const signalType =
            f.type === 'korea_direct_mention' || f.type === 'kbw_attendance' || f.type === 'korean_travel' || f.type === 'korean_partnership' || f.type === 'exchange_mention' || f.type === 'korean_vc'
              ? 'poc_korea_mention'
              : 'poc_asia_mention';

          const weight = CONFIDENCE_WEIGHT[f.confidence] ?? 12;

          const { error: sigErr } = await (supabase as any)
            .from('prospect_signals')
            .insert({
              prospect_id: t.prospect_id,
              project_name: t.project_name,
              signal_type: signalType,
              headline: `${t.poc_name} (${t.poc_role}): ${f.relevance?.slice(0, 70) || f.type}`,
              snippet: `Tweeted: "${f.tweet_text.slice(0, 260)}"`,
              source_url: f.tweet_url,
              source_name: 'grok_x_deep_scan',
              relevancy_weight: weight,
              tier: 1,
              confidence: f.confidence === 'high' ? 'confirmed' : f.confidence === 'medium' ? 'likely' : 'speculative',
              shelf_life_days: shelfLifeDays,
              metadata: {
                grok_model: 'grok-4',
                poc_name: t.poc_name,
                poc_role: t.poc_role,
                poc_handle: t.handle,
                tweet_date: f.tweet_date,
                finding_type: f.type,
                korea_interest_score: parsed.korea_interest_score,
                agent_run_id: runId,
              },
              detected_at: new Date().toISOString(),
              is_active: true,
            });
          if (!sigErr) {
            findingsWritten++;
          }
        }

        signalsAdded += findingsWritten;
        perPocResults.push({
          handle: t.handle,
          poc_name: t.poc_name,
          findings_count: parsed.findings?.length ?? 0,
          findings_written: findingsWritten,
          korea_interest_score: parsed.korea_interest_score,
          summary: parsed.summary,
        });
        pocsScanned++;

        // Brief throttle between POCs to be kind to xAI rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        pocsFailed++;
        errors.push(`${t.handle}: ${err instanceof GrokError ? err.message : err?.message || 'unknown error'}`);
        console.error(`Grok deep-dive failed for @${t.handle}:`, err);
      }
    }

    const costUsd = estimateGrokCost(totalInputTokens, totalOutputTokens, totalSources);

    await finishRun('completed', {
      targets_total: targets.length,
      targets_available: allTargets.length,
      skipped_due_to_cap: skippedDueToCap,
      pocs_scanned: pocsScanned,
      pocs_failed: pocsFailed,
      signals_added: signalsAdded,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      sources_used: totalSources,
      cost_usd: Number(costUsd.toFixed(4)),
      lookback_days: lookbackDays,
      shelf_life_days: shelfLifeDays,
      max_pocs: maxPocs,
    });

    return NextResponse.json({
      success: true,
      pocs_scanned: pocsScanned,
      pocs_failed: pocsFailed,
      pocs_skipped_due_to_cap: skippedDueToCap,
      targets_available: allTargets.length,
      signals_added: signalsAdded,
      per_poc: perPocResults,
      errors,
      cost_usd: Number(costUsd.toFixed(4)),
      duration_ms: Date.now() - startedAt.getTime(),
    });
  } catch (err: any) {
    console.error('Grok deep-dive error:', err);
    await finishRun('failed', {}, err?.message ?? 'Unknown error');
    return NextResponse.json({ error: err?.message ?? 'Grok deep-dive failed' }, { status: 500 });
  }
}
