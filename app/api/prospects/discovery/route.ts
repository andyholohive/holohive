import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/prospects/discovery
 *
 * Lists prospects that were discovered via the Discovery scanner
 * (source='dropstab_discovery'), along with their triggers (signals
 * with source_name='discovery_claude').
 *
 * Query params:
 *   status=needs_review|reviewed|promoted|dismissed|all  (default: needs_review)
 *   limit=N  (default 50, max 200)
 */

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status') || 'needs_review';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);

  let query = (supabase as any)
    .from('prospects')
    .select(
      'id, name, symbol, category, website_url, twitter_url, telegram_url, discord_url, source_url, status, scraped_at, updated_at, korea_relevancy_score, icp_score, action_tier, outreach_contacts, discovery_snapshot',
    )
    .eq('source', 'dropstab_discovery')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (statusParam !== 'all') {
    query = query.eq('status', statusParam);
  }

  const { data: prospects, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Load triggers for these prospects. We include signals from both the
  // Claude Discovery scan AND the Grok Deep Dive. Previously the filter
  // was `source_name='discovery_claude'` only, which meant Grok signals
  // were written to the DB but invisible in the UI.
  const prospectIds = (prospects || []).map((p: any) => p.id);
  let signalsByProspect: Map<string, any[]> = new Map();
  // Per-prospect last Deep Dive timestamp — used by the UI to show
  // "scanned Nd ago" and enforce a 24h cooldown on the Deep Dive button.
  let lastDeepDiveByProspect: Map<string, string> = new Map();

  if (prospectIds.length > 0) {
    const { data: signals } = await (supabase as any)
      .from('prospect_signals')
      .select('id, prospect_id, signal_type, headline, snippet, source_url, source_name, relevancy_weight, metadata, detected_at')
      .in('prospect_id', prospectIds)
      .in('source_name', ['discovery_claude', 'grok_x_deep_scan'])
      .eq('is_active', true)
      .order('detected_at', { ascending: false });

    for (const s of signals || []) {
      if (!s.prospect_id) continue;
      const arr = signalsByProspect.get(s.prospect_id) || [];
      arr.push(s);
      signalsByProspect.set(s.prospect_id, arr);
      // First grok signal we see per prospect is the most recent one
      // (query is ordered by detected_at desc).
      if (s.source_name === 'grok_x_deep_scan' && !lastDeepDiveByProspect.has(s.prospect_id)) {
        lastDeepDiveByProspect.set(s.prospect_id, s.detected_at);
      }
    }
  }

  const enriched = (prospects || []).map((p: any) => {
    const signals = signalsByProspect.get(p.id) || [];
    const snap = p.discovery_snapshot || {};
    return {
      ...p,
      triggers: signals.map((s: any) => ({
        id: s.id,
        signal_type: s.signal_type,
        headline: s.headline,
        detail: s.snippet,
        source_url: s.source_url,
        source_name: s.source_name,
        source_type: s.metadata?.source_type ?? null,
        tier: s.metadata?.tier ?? null,
        weight: s.relevancy_weight,
        detected_at: s.detected_at,
      })),
      last_deep_dive_at: lastDeepDiveByProspect.get(p.id) ?? null,
      // Hoist the commonly-used fields up for easier client consumption
      icp_verdict: snap.icp_verdict ?? null,
      icp_checks: snap.icp_checks ?? null,
      prospect_score: snap.prospect_score ?? null,
      discovery_action_tier: snap.action_tier ?? null,
      disqualification_reason: snap.disqualification_reason ?? null,
      consideration_reason: snap.consideration_reason ?? null,
      fit_reasoning: snap.fit_reasoning ?? null,
      funding: snap.funding ?? null,
    };
  });

  return NextResponse.json({
    count: enriched.length,
    prospects: enriched,
  });
}

/**
 * PATCH /api/prospects/discovery
 *
 * Update the status of a discovered prospect (promote / dismiss / mark reviewed).
 * Body: { id: string, status: 'needs_review' | 'reviewed' | 'promoted' | 'dismissed' }
 */
export async function PATCH(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await request.json().catch(() => null);
  if (!body?.id || !body?.status) {
    return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
  }
  const allowed = ['needs_review', 'reviewed', 'promoted', 'dismissed'];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { error } = await (supabase as any)
    .from('prospects')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
