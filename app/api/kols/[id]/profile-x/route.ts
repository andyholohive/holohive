import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { grokChatCompletion, estimateGrokCost, extractJson, GrokError } from '@/lib/grok';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/kols/[id]/profile-x
 *
 * The X analogue of the Telegram profile scan (PROF.1–7). The TG pipeline
 * reads a channel via Telethon and infers creator_type + niche with Claude;
 * X KOLs can't be read that way, so this route uses Grok's live X search
 * (the same capability the prospect Deep Dive uses) to read the handle's
 * recent timeline + bio and infer the same taxonomy.
 *
 * Writes creator_types + niche_tags (plus style/audience summaries) straight
 * to master_kols via the service role. The DB triggers
 * (master_kols_sync_creator_type / trigger_sync_kol_renames) mirror these
 * into the legacy singular columns the UI reads, so no separate call to
 * /api/mcp/kol-profile/update is needed.
 *
 * Auth: any authenticated user (same as refresh-tg). A single-KOL Grok read
 * is cheap; the eventual bulk backfill gates on super-admin + cost preview.
 *
 * Env: GROK_API_KEY (xAI, from https://x.ai/api).
 */

// Mirror of the taxonomy validation in /api/mcp/kol-profile/update.
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
function xHandleFromLink(link: string | null): string | null {
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

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!process.env.GROK_API_KEY) {
      return NextResponse.json({
        error: 'GROK_API_KEY not configured',
        hint: 'Add your xAI key (https://x.ai/api) to Vercel env vars to enable X profiling.',
      }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'supabase not configured' }, { status: 500 });
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: kol, error: kolErr } = await admin
      .from('master_kols')
      .select('id, name, link, platform')
      .eq('id', params.id)
      .single();
    if (kolErr || !kol) return NextResponse.json({ error: 'KOL not found' }, { status: 404 });

    const handle = xHandleFromLink((kol as any).link);
    if (!handle) {
      return NextResponse.json({
        error: 'No X handle on this KOL',
        hint: 'This route only profiles X KOLs — the link must be an x.com / twitter.com URL. Use the TG scan for Telegram KOLs.',
      }, { status: 400 });
    }

    // Grok live-reads the timeline via the x_search agent tool.
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
      return NextResponse.json({ error: `Grok error: ${msg}` }, { status: 502 });
    }

    const text = response.choices[0]?.message?.content ?? '';
    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ error: 'Could not parse Grok response', raw: text.slice(0, 400) }, { status: 502 });
    }

    // Validate against the taxonomies (same rules as the MCP writeback).
    const creatorTypes: string[] = Array.isArray(parsed.creator_types)
      ? parsed.creator_types.filter((c: unknown) => typeof c === 'string' && VALID_CREATOR_TYPES.has(c)).slice(0, 2)
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
      return NextResponse.json({
        ok: false,
        handle,
        reason: confidence === 0 ? 'Grok found no readable content (private/empty/nonexistent handle).' : 'Grok returned no valid taxonomy tags.',
        raw_summary: typeof parsed.style_summary === 'string' ? parsed.style_summary : null,
      }, { status: 200 });
    }

    const patch: Record<string, unknown> = {
      creator_types: creatorTypes,
      niche_tags: nicheTags,
      updated_at: new Date().toISOString(),
    };
    if (typeof parsed.style_summary === 'string') patch.style_summary = parsed.style_summary;
    if (typeof parsed.audience_summary === 'string') patch.audience_summary = parsed.audience_summary;

    const { error: updErr } = await admin.from('master_kols').update(patch).eq('id', params.id);
    if (updErr) return NextResponse.json({ error: `DB update failed: ${updErr.message}` }, { status: 500 });

    const cost = estimateGrokCost(
      response.usage?.prompt_tokens ?? 0,
      response.usage?.completion_tokens ?? 0,
      response.usage?.num_sources_used ?? 0,
    );

    return NextResponse.json({
      ok: true,
      kol: { id: (kol as any).id, name: (kol as any).name },
      handle,
      creator_types: creatorTypes,
      niche_tags: nicheTags,
      style_summary: patch.style_summary ?? null,
      audience_summary: patch.audience_summary ?? null,
      confidence,
      cost_usd: Number(cost.toFixed(4)),
      dropped_niches: droppedNiches.length ? droppedNiches : undefined,
    });
  } catch (err: any) {
    console.error('[profile-x] unexpected error:', err);
    return NextResponse.json({ error: err?.message ?? 'unexpected error' }, { status: 500 });
  }
}
