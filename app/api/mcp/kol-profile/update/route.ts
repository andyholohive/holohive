import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Doc 2 §7 — final niche taxonomy (15 tags). Inbound MCP writes are
 * validated against this set; legacy values get remapped (the same
 * remap rules that the one-time XLSX import applied).
 */
const VALID_NICHES = new Set([
  'AI', 'DeFi', 'L1/L2', 'Trading', 'Airdrop', 'NFT/Gaming',
  'RWA', 'Regulation', 'Macro', 'Meme/Degen',
  'Base', 'Solana', 'Ethereum', 'Infra/DePIN', 'Neobank',
]);
// [2026-07-14] Dropped the CeFi/Exchange→Trading remap per Jdot's July
// taxonomy fix: exchange content is almost never TA, so coercing it to
// Trading mislabelled it. With no remap, an inbound 'CeFi/Exchange' now
// falls through to the drop path (returned in `dropped`), forcing the
// scanner/skill to route by actual topic — Neobank / Regulation / Macro /
// Trading — instead of a lossy catch-all.
const NICHE_REMAP: Record<string, string> = {
  'AI x Crypto': 'AI',
  'Payments/Neobank': 'Neobank',
};

/** HHP Creator Taxonomy (May 2026). Max 2 per KOL enforced below. */
const VALID_CREATOR_TYPES = new Set([
  'Native', 'Scout', 'Tracker', 'Analyst',
  'Educator', 'Visionary', 'Onboarder', 'Curator',
]);

/**
 * POST /api/mcp/kol-profile/update
 *
 * Doc 2 §3 + §10 MCP write endpoint — the Telegram MCP / kol-database
 * skill calls this after profiling a channel (Mode 1) to write the
 * AI-generated profile fields back to master_kols.
 *
 * Body (all fields optional — only supplied fields get updated):
 *   - kol_id: uuid (required)
 *   - niche_tags: string[] (validated against 15-tag enum, remapped)
 *   - creator_types: string[] (max 2 per Creator Taxonomy spec)
 *   - style_summary: text
 *   - audience_summary: text
 *   - brief_angle_hint: text
 *   - follower_count: int (refresh from latest scan)
 *   - link: text
 *
 * Auth: Bearer CRON_SECRET — same gate as the snapshot upsert endpoint.
 *
 * Invalid niche tags get dropped with the dropped list returned in the
 * response so the skill can flag them. Creator types beyond the first
 * 2 valid entries get trimmed silently per spec.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });

  const { kol_id } = body;
  if (!kol_id || typeof kol_id !== 'string') return NextResponse.json({ error: 'kol_id required' }, { status: 400 });

  // Build the patch — only include fields the caller explicitly sent.
  // Sending `niche_tags: []` clears the tags; omitting the key leaves
  // them untouched.
  const patch: Record<string, unknown> = {};
  const droppedNiches: string[] = [];

  if ('niche_tags' in body) {
    if (!Array.isArray(body.niche_tags)) return NextResponse.json({ error: 'niche_tags must be an array' }, { status: 400 });
    const remapped: string[] = [];
    for (const raw of body.niche_tags) {
      if (typeof raw !== 'string') continue;
      const mapped = NICHE_REMAP[raw] ?? raw;
      if (VALID_NICHES.has(mapped)) {
        if (!remapped.includes(mapped)) remapped.push(mapped);
      } else {
        droppedNiches.push(raw);
      }
    }
    patch.niche_tags = remapped;
  }

  if ('creator_types' in body) {
    if (!Array.isArray(body.creator_types)) return NextResponse.json({ error: 'creator_types must be an array' }, { status: 400 });
    patch.creator_types = body.creator_types
      .filter((c: unknown) => typeof c === 'string' && VALID_CREATOR_TYPES.has(c as string))
      .slice(0, 2);
  }

  for (const key of ['style_summary', 'audience_summary', 'brief_angle_hint', 'link'] as const) {
    if (key in body) {
      const v = body[key];
      patch[key] = v == null ? null : String(v);
    }
  }
  if ('follower_count' in body) {
    const n = Number(body.follower_count);
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'follower_count must be a number' }, { status: 400 });
    patch.follower_count = Math.round(n);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no updatable fields supplied' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'supabase not configured' }, { status: 500 });
  }
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from('master_kols')
    .update(patch)
    .eq('id', kol_id)
    .select('id, name, niche_tags, creator_types')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'kol not found' }, { status: 404 });

  return NextResponse.json({
    kol: data,
    droppedNiches: droppedNiches.length ? droppedNiches : undefined,
  });
}
