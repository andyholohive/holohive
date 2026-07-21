import type { SupabaseClient } from '@supabase/supabase-js';
import { grokChatCompletion, estimateGrokCost, extractJson, GrokError } from '@/lib/grok';

/**
 * Shared X-profiling core — the Grok "read timeline → infer taxonomy" step
 * used by both the single-KOL route (/api/kols/[id]/profile-x) and the
 * super-admin bulk backfill (/api/kols/profile-x/bulk). Keeps the prompt,
 * taxonomy validation, and DB write in one place.
 */

// Mirror of the validation in /api/mcp/kol-profile/update.
const VALID_NICHES = new Set([
  'AI', 'DeFi', 'L1/L2', 'Trading', 'Airdrop', 'NFT/Gaming',
  'RWA', 'Regulation', 'Macro', 'Meme/Degen',
  'Base', 'Solana', 'Ethereum', 'Infra/DePIN', 'Neobank',
]);
const NICHE_REMAP: Record<string, string> = {
  'AI x Crypto': 'AI',
  'Payments/Neobank': 'Neobank',
};
const VALID_CREATOR_TYPES = new Set([
  'Native', 'Scout', 'Tracker', 'Analyst',
  'Educator', 'Visionary', 'Onboarder', 'Curator',
]);

/** Pull a bare X handle from a profile URL (x.com / twitter.com). */
export function xHandleFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = link.match(/(?:x\.com|twitter\.com)\/@?([A-Za-z0-9_]{1,15})/i);
  return m ? m[1] : null;
}

const SYSTEM_PROMPT = `You are a crypto-KOL analyst. Given an X (Twitter) handle, use the x_search tool to read their recent posts and bio, then classify them for a KOL database.

Return STRICT JSON only (no prose, no markdown fences) with this exact shape:
{
  "creator_types": string[],   // 1-2 items, MUST be from the Creator Taxonomy below
  "niche_tags": string[],      // 1-4 items, MUST be from the Niche Taxonomy below
  "style_summary": string,     // one sentence on their content style/voice
  "audience_summary": string,  // one sentence on who follows them / their audience
  "confidence": number         // 0-1; use 0 if the account is private, empty, or unreadable
}

CREATOR TAXONOMY (pick the 1-2 that fit best):
- Native: authentic in-culture voice; original takes, memes, community-native content.
- Scout: surfaces early/emerging projects; alpha hunter.
- Tracker: on-chain/data-driven; monitors flows, wallets, metrics.
- Analyst: technical or fundamental analysis; deep dives, charts, theses.
- Educator: explains concepts; teaches; how-to/threads for learning.
- Visionary: big-picture narratives; sets or frames theses.
- Onboarder: brings newcomers in; beginner-friendly tutorials.
- Curator: aggregates/filters others' content; lists, roundups.

NICHE TAXONOMY (pick 1-4): AI, DeFi, L1/L2, Trading, Airdrop, NFT/Gaming, RWA, Regulation, Macro, Meme/Degen, Base, Solana, Ethereum, Infra/DePIN, Neobank.

If the handle is private, doesn't exist, or has no readable content, return empty arrays and confidence 0.`;

export type XProfileResult =
  | {
      ok: true;
      handle: string;
      creator_types: string[];
      niche_tags: string[];
      style_summary: string | null;
      audience_summary: string | null;
      confidence: number | null;
      cost_usd: number;
      dropped_niches?: string[];
    }
  | { ok: false; handle: string; reason: string; cost_usd?: number };

/**
 * Grok live-reads @handle and returns validated taxonomy tags. Does NOT
 * write to the DB — callers persist via applyXProfile.
 */
export async function profileXHandle(handle: string): Promise<XProfileResult> {
  let response;
  try {
    response = await grokChatCompletion({
      model: 'grok-4',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analyze X handle: @${handle}\nUse the x_search tool to read their recent timeline + bio. Return strict JSON per the schema.` },
      ],
      max_tokens: 1500,
      temperature: 0.2,
      tools: [{ type: 'x_search' }],
    });
  } catch (err) {
    const msg = err instanceof GrokError ? err.message : (err as Error)?.message ?? 'Grok call failed';
    return { ok: false, handle, reason: `Grok error: ${msg}` };
  }

  const cost = estimateGrokCost(
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    response.usage?.num_sources_used ?? 0,
  );
  const text = response.choices[0]?.message?.content ?? '';
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, handle, reason: 'Could not parse Grok response', cost_usd: Number(cost.toFixed(4)) };
  }

  const creatorTypes: string[] = Array.isArray(parsed.creator_types)
    ? parsed.creator_types.filter((c: unknown) => typeof c === 'string' && VALID_CREATOR_TYPES.has(c as string)).slice(0, 2)
    : [];
  const droppedNiches: string[] = [];
  const nicheTags: string[] = [];
  if (Array.isArray(parsed.niche_tags)) {
    for (const raw of parsed.niche_tags) {
      if (typeof raw !== 'string') continue;
      const mapped = NICHE_REMAP[raw] ?? raw;
      if (VALID_NICHES.has(mapped)) { if (!nicheTags.includes(mapped)) nicheTags.push(mapped); }
      else droppedNiches.push(raw);
    }
  }
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : null;

  if (creatorTypes.length === 0 && nicheTags.length === 0) {
    return {
      ok: false,
      handle,
      reason: confidence === 0 ? 'No readable content (private/empty/nonexistent handle).' : 'No valid taxonomy tags returned.',
      cost_usd: Number(cost.toFixed(4)),
    };
  }

  return {
    ok: true,
    handle,
    creator_types: creatorTypes,
    niche_tags: nicheTags,
    style_summary: typeof parsed.style_summary === 'string' ? parsed.style_summary : null,
    audience_summary: typeof parsed.audience_summary === 'string' ? parsed.audience_summary : null,
    confidence,
    cost_usd: Number(cost.toFixed(4)),
    dropped_niches: droppedNiches.length ? droppedNiches : undefined,
  };
}

/** Persist a successful profile to master_kols (trigger syncs the singular columns). */
export async function applyXProfile(
  admin: SupabaseClient,
  kolId: string,
  result: Extract<XProfileResult, { ok: true }>,
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = {
    creator_types: result.creator_types,
    niche_tags: result.niche_tags,
    updated_at: new Date().toISOString(),
  };
  if (result.style_summary != null) patch.style_summary = result.style_summary;
  if (result.audience_summary != null) patch.audience_summary = result.audience_summary;
  const { error } = await admin.from('master_kols').update(patch).eq('id', kolId);
  return { error: error ? error.message : null };
}
