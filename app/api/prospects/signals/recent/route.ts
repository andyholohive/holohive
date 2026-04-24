import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/prospects/signals/recent
 *
 * Reverse-chron feed of Grok Deep Dive signals across all prospects.
 * This is the "daily review" surface — you scan this once a day instead
 * of expanding every prospect row to find new findings.
 *
 * Query params:
 *   days=7         window in days (1-90, default 7)
 *   min_score=0    drop signals whose parent korea_interest_score is below this (0-100, default 0)
 *   limit=100      max rows to return (1-500, default 100)
 *
 * Response:
 *   {
 *     signals: [
 *       {
 *         id,
 *         prospect_id,
 *         project_name,
 *         project_symbol,
 *         action_tier,
 *         signal_type,
 *         headline,
 *         snippet,
 *         source_url,
 *         source_name,
 *         relevancy_weight,
 *         detected_at,
 *         expires_at,
 *         korea_interest_score,
 *         poc_handle,
 *         poc_name,
 *         poc_role,
 *       }, ...
 *     ],
 *     count,
 *     window_days,
 *     min_score
 *   }
 */
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10), 1), 90);
  const minScore = Math.min(Math.max(parseInt(searchParams.get('min_score') || '0', 10), 0), 100);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10), 1), 500);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Fetch recent Grok signals. We over-fetch a bit and filter client-side
  // by min_score because the score lives in metadata (jsonb) — postgrest
  // can query it but syntax is fiddly across versions. At limit=500 this is fine.
  const overFetch = Math.min(limit * 3, 500);
  const { data: signals, error } = await (supabase as any)
    .from('prospect_signals')
    .select('id, prospect_id, project_name, signal_type, headline, snippet, source_url, source_name, relevancy_weight, metadata, detected_at, expires_at')
    .eq('source_name', 'grok_x_deep_scan')
    .eq('is_active', true)
    .gte('detected_at', since)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('detected_at', { ascending: false })
    .limit(overFetch);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with prospect symbol + action_tier via one follow-up query.
  const prospectIds = Array.from(
    new Set((signals || []).map((s: any) => s.prospect_id).filter(Boolean)),
  );
  const prospectMeta: Record<string, { symbol: string | null; action_tier: string | null; status: string }> = {};
  if (prospectIds.length > 0) {
    const { data: prospects } = await (supabase as any)
      .from('prospects')
      .select('id, symbol, status, discovery_snapshot')
      .in('id', prospectIds);
    for (const p of prospects || []) {
      prospectMeta[p.id] = {
        symbol: p.symbol ?? null,
        action_tier: p.discovery_snapshot?.action_tier ?? null,
        status: p.status ?? 'unknown',
      };
    }
  }

  const rows = (signals || [])
    .map((s: any) => {
      const score = Number(s.metadata?.korea_interest_score);
      return {
        id: s.id,
        prospect_id: s.prospect_id,
        project_name: s.project_name,
        project_symbol: prospectMeta[s.prospect_id]?.symbol ?? null,
        action_tier: prospectMeta[s.prospect_id]?.action_tier ?? null,
        prospect_status: prospectMeta[s.prospect_id]?.status ?? null,
        signal_type: s.signal_type,
        headline: s.headline,
        snippet: s.snippet,
        source_url: s.source_url,
        source_name: s.source_name,
        relevancy_weight: s.relevancy_weight,
        detected_at: s.detected_at,
        expires_at: s.expires_at,
        korea_interest_score: Number.isFinite(score) ? score : null,
        poc_handle: s.metadata?.poc_handle ?? null,
        poc_name: s.metadata?.poc_name ?? null,
        poc_role: s.metadata?.poc_role ?? null,
        finding_type: s.metadata?.finding_type ?? null,
        tweet_date: s.metadata?.tweet_date ?? null,
      };
    })
    // Apply min_score filter (signals inherit their prospect-run score).
    .filter((r: any) => r.korea_interest_score == null || r.korea_interest_score >= minScore)
    .slice(0, limit);

  return NextResponse.json({
    count: rows.length,
    signals: rows,
    window_days: days,
    min_score: minScore,
  });
}
