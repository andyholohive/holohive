import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClaudeClient } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/prospects/discovery/enrich-pocs
 *
 * Runs ONLY the POC-lookup phase (Phase 2) for existing Discovery prospects.
 * For each prospect, Claude uses web_search to find 1-3 individual decision-
 * maker handles, prioritizing Telegram > X.
 *
 * Much cheaper than a full re-scan: no DropsTab research, no ICP re-scoring,
 * just focused POC hunting.
 *
 * Body:
 *   {
 *     prospect_ids?: string[]   // if omitted, enriches ALL discovery prospects
 *                                // with empty outreach_contacts
 *   }
 *
 * Response:
 *   { enriched: number, failed: number, errors: string[], cost_usd: number }
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

async function findPOCsForProject(
  anthropic: any,
  project: {
    name: string;
    symbol: string | null;
    website_url: string | null;
    twitter_url: string | null;
  },
  model: string,
): Promise<{ contacts: OutreachContact[]; inputTokens: number; outputTokens: number }> {
  const systemPrompt = `You are HoloHive's POC hunter. HoloHive does cold BD outreach via Telegram DM — NOT joining community channels. Your job is to find individual decision-maker handles for a single crypto project.

## PRIORITY RULES

Role priority (best → last resort):
  1. CEO / Founder
  2. CMO / Head of Marketing / Head of Growth
  3. Head of BD / BD Lead
  4. Community / Ecosystem Lead

Contact-channel priority: **Telegram handle > X handle**. A Head of BD with findable Telegram is more valuable than a CEO with only X — because Telegram is what we actually DM on.

## WHERE TO LOOK

1. Project's own website — /team, /about, /company pages
2. X/Twitter bios of founders/team members — look for "tg: @handle", "telegram: @handle", "@xxx on TG" patterns (crypto BDs put this in their bio on purpose)
3. Crypto directories and conference speaker pages
4. LinkedIn public previews (titles visible, handles sometimes)

## CONFIDENCE

- "high" — Telegram handle visible on verified X bio, project team page, or conference page
- "medium" — Telegram handle referenced in second-hand source (directory, podcast notes)
- "low" — X handle only, no Telegram found, OR guess from similar-name pattern (ONLY return if no better lead)

## OUTPUT RULES

Return 1-3 contacts per project. Empty array is FINE and better than fabricated.
Sort so contacts WITH telegram_handle come first.

Call submit_pocs exactly once when done. Do NOT reply with plain text.`;

  const userPrompt = `Find the 1-3 best outreach POCs for this project:

Name: ${project.name}${project.symbol ? ` (${project.symbol})` : ''}
Website: ${project.website_url || 'unknown'}
Project X: ${project.twitter_url || 'unknown'}

Use web_search to find individual team members' personal handles. Priority:
  1. Check the project's website team/about page
  2. Scan key team members' X bios for Telegram handles
  3. Try crypto directories / conference bios if needed

Call submit_pocs when done.`;

  const submitTool = {
    name: 'submit_pocs',
    description: 'Submit 1-3 individual decision-maker contacts for this project.',
    input_schema: {
      type: 'object',
      properties: {
        contacts: {
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
      },
      required: ['contacts'],
    },
  };

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 10 } as any,
      submitTool as any,
    ],
  });

  const submitBlock = response.content.find(
    (b: any) => b.type === 'tool_use' && b.name === 'submit_pocs',
  ) as any;

  let contacts: OutreachContact[] = [];
  if (submitBlock?.input?.contacts) {
    contacts = (submitBlock.input.contacts as OutreachContact[]).filter(
      c => c && c.name && c.role,
    );
  }

  // Sort: Telegram-findable first
  contacts.sort((a, b) => {
    const aTG = !!(a.telegram_handle && a.telegram_handle.trim());
    const bTG = !!(b.telegram_handle && b.telegram_handle.trim());
    if (aTG !== bTG) return aTG ? -1 : 1;
    return 0;
  });

  return {
    contacts,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

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
      run_type: 'poc_enrichment',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: {},
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  try {
    const body = await request.json().catch(() => ({}));
    const specificIds: string[] | null = Array.isArray(body.prospect_ids) ? body.prospect_ids : null;

    // Model selector — same rules as the main scan endpoint. Defaults to Opus
    // because POC accuracy > speed for BD outreach.
    const modelAlias = String(body.model || 'opus').toLowerCase();
    const model =
      modelAlias === 'sonnet' ? 'claude-sonnet-4-5'
      : modelAlias === 'opus' ? 'claude-opus-4-7'
      : body.model;

    // Load target prospects. If specific IDs provided, just those. Otherwise,
    // all discovery-sourced prospects that currently have no outreach_contacts.
    let query = (supabase as any)
      .from('prospects')
      .select('id, name, symbol, website_url, twitter_url, outreach_contacts')
      .eq('source', 'dropstab_discovery');
    if (specificIds) {
      query = query.in('id', specificIds);
    } else {
      // null or empty array — enrich everything missing contacts
      // Postgres JSONB: outreach_contacts is '[]' or null for "no contacts"
      query = query.or('outreach_contacts.is.null,outreach_contacts.eq.[]');
    }

    const { data: prospects, error: loadErr } = await query;
    if (loadErr) throw loadErr;

    if (!prospects || prospects.length === 0) {
      if (runId) {
        await (supabase as any)
          .from('agent_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt.getTime(),
            output_summary: { message: 'No prospects needed enrichment' },
          })
          .eq('id', runId);
      }
      return NextResponse.json({
        enriched: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        cost_usd: 0,
        message: 'No prospects needed POC enrichment.',
      });
    }

    const anthropic = getClaudeClient();

    let enriched = 0;
    let failed = 0;
    let totalInput = 0;
    let totalOutput = 0;
    const errors: string[] = [];

    // Sequential to respect web_search rate limits. With ~10 searches per
    // project and a few-per-minute cap, we throttle between projects.
    for (const p of prospects) {
      try {
        const result = await findPOCsForProject(anthropic, p, model);
        totalInput += result.inputTokens;
        totalOutput += result.outputTokens;

        if (result.contacts.length > 0) {
          // Merge with existing contacts (the query filter means they should
          // be empty, but be defensive in case a manual edit happened mid-run)
          const existing: OutreachContact[] = p.outreach_contacts || [];
          const merged = [...existing];
          for (const newC of result.contacts) {
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
          // Re-sort Telegram-first
          merged.sort((a, b) => {
            const aTG = !!(a.telegram_handle && a.telegram_handle.trim());
            const bTG = !!(b.telegram_handle && b.telegram_handle.trim());
            if (aTG !== bTG) return aTG ? -1 : 1;
            return 0;
          });

          await (supabase as any)
            .from('prospects')
            .update({ outreach_contacts: merged, updated_at: new Date().toISOString() })
            .eq('id', p.id);
          enriched++;
        } else {
          // Claude found nothing — record this so the UI knows we tried
          await (supabase as any)
            .from('prospects')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', p.id);
          // Not counted as enriched, not as failed either
        }

        // Throttle — give web_search a breather between projects
        await new Promise(r => setTimeout(r, 1500));
      } catch (err: any) {
        failed++;
        errors.push(`${p.name}: ${err?.message || 'unknown error'}`);
        console.error(`POC enrichment failed for ${p.name}:`, err);
      }
    }

    // Model-specific pricing (approximate, per 1M tokens):
    //   Sonnet 4.5: $3 in / $15 out
    //   Opus 4.7:   $15 in / $75 out
    const isOpus = typeof model === 'string' && model.includes('opus');
    const inPricePerM = isOpus ? 15 : 3;
    const outPricePerM = isOpus ? 75 : 15;
    const costUsd = (totalInput / 1_000_000) * inPricePerM + (totalOutput / 1_000_000) * outPricePerM;

    if (runId) {
      await (supabase as any)
        .from('agent_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt.getTime(),
          output_summary: {
            prospects_processed: prospects.length,
            enriched,
            failed,
            input_tokens: totalInput,
            output_tokens: totalOutput,
          },
        })
        .eq('id', runId);
    }

    return NextResponse.json({
      success: true,
      prospects_processed: prospects.length,
      enriched,
      failed,
      errors,
      cost_usd: Number(costUsd.toFixed(4)),
      duration_ms: Date.now() - startedAt.getTime(),
    });
  } catch (err: any) {
    console.error('POC enrichment error:', err);
    if (runId) {
      await (supabase as any)
        .from('agent_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt.getTime(),
          error_message: err?.message || 'unknown error',
        })
        .eq('id', runId);
    }
    return NextResponse.json(
      { error: err?.message ?? 'POC enrichment failed' },
      { status: 500 },
    );
  }
}
