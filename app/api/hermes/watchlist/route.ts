import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hermes/watchlist — Returns the list of prospects Hermes should monitor
 *
 * Hermes pulls this on a schedule (e.g. every 6 hours) to keep its local watchlist
 * fresh — so when we add/remove/promote prospects on our side, Hermes picks it up
 * without us having to push anything to it.
 *
 * Auth: `Authorization: Bearer {HERMES_WEBHOOK_SECRET}` (same secret both directions)
 *
 * Query params:
 *   ?tier=1,2       → filter by action_tier (defaults to all non-dismissed)
 *   ?min_score=40   → filter by minimum korea_relevancy_score (default 0)
 *   ?limit=500      → cap (default 500, max 2000)
 *
 * Response:
 * {
 *   generated_at: ISO string,
 *   count: number,
 *   prospects: Array<{
 *     id, name, symbol,
 *     twitter_url, telegram_url, website_url,
 *     category, status, action_tier,
 *     icp_score, korea_relevancy_score,
 *     // hints for Hermes skills:
 *     aliases: string[]          // project_name variants to match in TG chatter
 *   }>
 * }
 */

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const hermesSecret = process.env.HERMES_WEBHOOK_SECRET;

  if (!hermesSecret) {
    return NextResponse.json(
      { error: 'Server missing HERMES_WEBHOOK_SECRET' },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${hermesSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { searchParams } = new URL(request.url);
  const tierParam = searchParams.get('tier');
  const minScore = parseInt(searchParams.get('min_score') ?? '0', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10), 2000);

  let query = (supabase as any)
    .from('prospects')
    .select(
      'id, name, symbol, twitter_url, telegram_url, website_url, category, status, action_tier, icp_score, korea_relevancy_score',
    )
    .neq('status', 'dismissed')
    .eq('is_disqualified', false)
    .gte('korea_relevancy_score', minScore)
    .order('korea_relevancy_score', { ascending: false })
    .limit(limit);

  if (tierParam) {
    const tiers = tierParam.split(',').map((t) => t.trim());
    query = query.in('action_tier', tiers);
  }

  const { data: prospects, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (prospects ?? []).map((p: any) => {
    // Build alias list so Hermes can fuzzy-match mentions in chat logs.
    // Include name, symbol, and common variants.
    const aliases = new Set<string>();
    if (p.name) aliases.add(p.name);
    if (p.symbol) {
      aliases.add(p.symbol);
      aliases.add(`$${p.symbol}`);
    }
    // Strip common suffixes so "Avalanche Network" matches "Avalanche"
    if (p.name) {
      const stripped = p.name
        .replace(/\s+(Network|Protocol|Finance|Labs|Chain|Token)$/i, '')
        .trim();
      if (stripped && stripped !== p.name) aliases.add(stripped);
    }

    return {
      id: p.id,
      name: p.name,
      symbol: p.symbol,
      twitter_url: p.twitter_url,
      telegram_url: p.telegram_url,
      website_url: p.website_url,
      category: p.category,
      status: p.status,
      action_tier: p.action_tier,
      icp_score: p.icp_score,
      korea_relevancy_score: p.korea_relevancy_score,
      aliases: Array.from(aliases),
    };
  });

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    count: enriched.length,
    prospects: enriched,
  });
}
