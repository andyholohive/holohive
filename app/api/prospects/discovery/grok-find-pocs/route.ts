import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { grokChatCompletion, estimateGrokCost, extractJson, GrokError } from '@/lib/grok';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/prospects/discovery/grok-find-pocs
 *
 * Grok-powered POC lookup. Same goal as /enrich-pocs (find 1-3 outreach
 * contacts per prospect) but uses Grok's native X search + web_search
 * instead of Claude's web_search alone. Better at scraping X bios for
 * Telegram handles and at finding team members the project X account
 * interacts with.
 *
 * Body:
 *   {
 *     prospect_ids?: string[]   // if omitted, enriches ALL discovery prospects
 *                                // with empty outreach_contacts
 *   }
 *
 * Response:
 *   { enriched, failed, prospects_processed, errors, cost_usd, duration_ms }
 */

interface OutreachContact {
  name: string;
  role: string;
  twitter_handle?: string;
  telegram_handle?: string;
  source_url?: string;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
  // Marks contacts produced by the Grok POC finder so the UI can render
  // them in "needs review" amber until a human confirms. Grok has been
  // observed to hallucinate plausible-sounding but fake contacts —
  // see docs/grok-hallucination-cases (if any) or the initial Pharos run.
  is_grok_sourced?: boolean;
  reviewed_at?: string; // ISO — set when a human confirms / edits
}

interface GrokPocsResult {
  contacts: OutreachContact[];
}

function normalizeHandle(h: string | undefined): string | undefined {
  if (!h) return undefined;
  const clean = h.trim().replace(/^https?:\/\/(www\.)?(x|twitter|t)\.(com|me)\//i, '').replace(/^@/, '').split(/[?/#]/)[0];
  return clean || undefined;
}

async function findPOCsWithGrok(project: {
  name: string;
  symbol: string | null;
  website_url: string | null;
  twitter_url: string | null;
}): Promise<{ contacts: OutreachContact[]; inputTokens: number; outputTokens: number; sourcesUsed: number }> {
  const systemPrompt = `You are HoloHive's POC hunter. HoloHive does cold BD outreach via Telegram DM — NOT joining community channels. Your job is to find individual decision-maker handles for a single crypto project.

## PRIORITY RULES

Role priority (best → last resort):
  1. CEO / Founder / Co-founder
  2. CMO / Head of Marketing / Head of Growth
  3. Head of BD / BD Lead / Partnerships
  4. Community / Ecosystem Lead

Contact-channel priority: **Telegram handle > X handle**. A Head of BD with findable Telegram is more valuable than a CEO with only X — Telegram is what we actually DM on.

## SEARCH BUDGET — STRICT

You MUST finish in at most 4 total tool calls. Be decisive.
  - Up to 2× x_search (e.g. one for team members, one for a specific candidate's bio)
  - Up to 2× web_search (e.g. one for the team page, one for a directory)
Do not chain more than this. If you can't find POCs in 4 calls, return an empty contacts array.

## WHERE TO LOOK

1. **x_search**: the project's own X account — find accounts with the project name in their bio ("Co-founder @projectX", "BD at @projectX"). Read those accounts' bios for "tg: @handle" / "Telegram: @handle" / "t.me/handle" patterns.
2. **web_search**: project's website /team or /about page. A crypto directory as backup.

## CONFIDENCE

- "high" — Telegram handle visible on verified X bio, project team page, or conference page
- "medium" — Telegram handle referenced in second-hand source (directory, podcast notes, old forum posts)
- "low" — X handle only, no Telegram found. Only return a "low" if nothing better exists.

## HARD RULES — violating these invalidates the entire response

1. **Real names only.** No "Unknown", "TBD", "N/A", "team member", or role-only entries. If you don't have a real name, omit the contact.
2. **No duplicate X handles.** Each twitter_handle in your response must map to exactly one person. If you see the same handle claimed by two names, only one is real — pick the better-sourced one and drop the other.
3. **Handle must match the person.** The X handle you return should be visibly tied to that specific person's name/photo/bio at the source URL. Don't pair a real name with a guessed handle.
4. **source_url must be a real URL** that shows the name + handle together. Not a homepage, not a retweet thread with no attribution.
5. **Prefer fewer high-quality contacts** over more low-confidence ones. 1 "high" is worth more than 3 "low".

## OUTPUT

Return strict JSON (no markdown fences, no prose before or after):
{
  "contacts": [
    {
      "name": "string — person's real name (NOT 'Unknown' or a role)",
      "role": "string — their title at the project",
      "twitter_handle": "string — without @, leave empty if none",
      "telegram_handle": "string — without @, leave empty if none",
      "source_url": "string — URL where you confirmed name+handle together",
      "confidence": "high" | "medium" | "low",
      "notes": "string — brief context, optional"
    }
  ]
}

Return 0-3 contacts. Sort contacts WITH telegram_handle first. Empty array is the right answer when nothing credible exists — far better than fabricated handles.`;

  const userPrompt = `Find the 1-3 best outreach POCs for this crypto project:

Name: ${project.name}${project.symbol ? ` (${project.symbol})` : ''}
Website: ${project.website_url || 'unknown'}
Project X: ${project.twitter_url || 'unknown'}

Use x_search to scan the project's X account for team members the project interacts with, then read those team members' X bios for Telegram handles. Also use web_search to check the project's website team page and crypto directories. Return strict JSON per the schema in the system prompt.`;

  const response = await grokChatCompletion({
    model: 'grok-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 3000,
    temperature: 0.2,
    tools: [{ type: 'x_search' }, { type: 'web_search' }],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const parsed: GrokPocsResult | null = extractJson(text);
  let contacts: OutreachContact[] = [];
  if (parsed?.contacts && Array.isArray(parsed.contacts)) {
    // Names we reject as obvious placeholders / hallucinated fillers.
    const INVALID_NAMES = new Set([
      'unknown', 'n/a', 'na', 'tbd', 'tba',
      'team member', 'team', 'contact',
      'anonymous', 'not available',
    ]);

    contacts = parsed.contacts
      .filter(c => c && c.name && c.role)
      // Reject placeholder names
      .filter(c => {
        const n = c.name.trim().toLowerCase();
        if (INVALID_NAMES.has(n)) return false;
        if (n.length < 2) return false;
        return true;
      })
      .map(c => ({
        ...c,
        twitter_handle: normalizeHandle(c.twitter_handle),
        telegram_handle: normalizeHandle(c.telegram_handle),
      }))
      // Drop contacts with neither handle — useless for outreach
      .filter(c => c.twitter_handle || c.telegram_handle);

    // Dedupe by twitter_handle — if Grok returned the same handle for two
    // different names, it's hallucinated at least one. Keep the first.
    const seenHandles = new Set<string>();
    contacts = contacts.filter(c => {
      const key = c.twitter_handle?.toLowerCase();
      if (!key) return true; // telegram-only contact — dedupe separately below
      if (seenHandles.has(key)) return false;
      seenHandles.add(key);
      return true;
    });
    // Dedupe by telegram_handle
    const seenTg = new Set<string>();
    contacts = contacts.filter(c => {
      const key = c.telegram_handle?.toLowerCase();
      if (!key) return true;
      if (seenTg.has(key)) return false;
      seenTg.add(key);
      return true;
    });
  }

  // Sort: Telegram-findable first
  contacts.sort((a, b) => {
    const aTG = !!(a.telegram_handle && a.telegram_handle.trim());
    const bTG = !!(b.telegram_handle && b.telegram_handle.trim());
    if (aTG !== bTG) return aTG ? -1 : 1;
    return 0;
  });

  return {
    contacts: contacts.slice(0, 3),
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    sourcesUsed: response.usage?.num_sources_used ?? 0,
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

  if (!process.env.GROK_API_KEY) {
    return NextResponse.json(
      { error: 'GROK_API_KEY env var is not set. Add it (from https://x.ai/api) to use the Grok POC finder.' },
      { status: 400 },
    );
  }

  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'DISCOVERY',
      run_type: 'grok_poc_enrichment',
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

    // Load target prospects. If specific IDs provided, just those. Otherwise,
    // all discovery-sourced prospects that currently have no outreach_contacts.
    let query = (supabase as any)
      .from('prospects')
      .select('id, name, symbol, website_url, twitter_url, outreach_contacts')
      .eq('source', 'dropstab_discovery');
    if (specificIds) {
      query = query.in('id', specificIds);
    } else {
      query = query.or('outreach_contacts.is.null,outreach_contacts.eq.[]');
    }

    const { data: prospects, error: loadErr } = await query;
    if (loadErr) throw loadErr;

    if (!prospects || prospects.length === 0) {
      await finishRun('completed', { message: 'No prospects needed enrichment' });
      return NextResponse.json({
        enriched: 0,
        failed: 0,
        prospects_processed: 0,
        errors: [],
        cost_usd: 0,
        message: 'No prospects needed POC enrichment.',
      });
    }

    let enriched = 0;
    let failed = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalSources = 0;
    const errors: string[] = [];

    for (const p of prospects) {
      try {
        const result = await findPOCsWithGrok(p);
        totalInput += result.inputTokens;
        totalOutput += result.outputTokens;
        totalSources += result.sourcesUsed;

        if (result.contacts.length > 0) {
          // Merge with existing contacts (should be empty due to query filter,
          // but defensive in case of mid-run manual edits)
          const existing: OutreachContact[] = p.outreach_contacts || [];
          const merged = [...existing];
          for (const newC of result.contacts) {
            const match = merged.findIndex(
              e => e.name?.toLowerCase() === newC.name.toLowerCase() && e.role === newC.role,
            );
            if (match >= 0) {
              const cur = merged[match];
              // Preserve any existing review status on the existing contact —
              // if a human already confirmed them, Grok's re-find shouldn't
              // reset them to "needs review".
              merged[match] = {
                ...cur,
                twitter_handle: cur.twitter_handle || newC.twitter_handle,
                telegram_handle: cur.telegram_handle || newC.telegram_handle,
                source_url: cur.source_url || newC.source_url,
                notes: cur.notes || newC.notes,
                confidence: newC.confidence === 'high' ? 'high' : cur.confidence,
              };
            } else {
              // Brand new contact from Grok — mark it for human review.
              merged.push({ ...newC, is_grok_sourced: true });
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
          // Grok found nothing — record the attempt timestamp so the UI knows
          await (supabase as any)
            .from('prospects')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', p.id);
        }

        // Brief throttle between projects
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        failed++;
        errors.push(`${p.name}: ${err instanceof GrokError ? err.message : err?.message || 'unknown error'}`);
        console.error(`Grok POC enrichment failed for ${p.name}:`, err);
      }
    }

    const costUsd = estimateGrokCost(totalInput, totalOutput, totalSources);

    await finishRun('completed', {
      prospects_processed: prospects.length,
      enriched,
      failed,
      input_tokens: totalInput,
      output_tokens: totalOutput,
      sources_used: totalSources,
      cost_usd: Number(costUsd.toFixed(4)),
    });

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
    console.error('Grok POC enrichment error:', err);
    await finishRun('failed', {}, err?.message ?? 'unknown error');
    return NextResponse.json(
      { error: err?.message ?? 'Grok POC enrichment failed' },
      { status: 500 },
    );
  }
}
