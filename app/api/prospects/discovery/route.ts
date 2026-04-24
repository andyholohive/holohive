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
  // Per-prospect max korea_interest_score across their active Grok signals.
  // If >= 70 the row gets a "Grok-hot" badge to make triage obvious.
  let maxGrokScoreByProspect: Map<string, number> = new Map();
  // Per-prospect cumulative Grok cost so the expanded view can show
  // "$0.22 · 5 signals" for the most recent dive.
  let lastDeepDiveCostByProspect: Map<string, number> = new Map();

  if (prospectIds.length > 0) {
    const nowIso = new Date().toISOString();
    const { data: signals } = await (supabase as any)
      .from('prospect_signals')
      .select('id, prospect_id, signal_type, headline, snippet, source_url, source_name, relevancy_weight, metadata, detected_at, expires_at')
      .in('prospect_id', prospectIds)
      .in('source_name', ['discovery_claude', 'grok_x_deep_scan'])
      .eq('is_active', true)
      // Filter out expired signals — an expires_at IN THE PAST means the
      // signal has aged out of its shelf_life. NULL expires_at means "never
      // set" (older signals pre-dating expires_at population) — keep those.
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('detected_at', { ascending: false });

    for (const s of signals || []) {
      if (!s.prospect_id) continue;
      const arr = signalsByProspect.get(s.prospect_id) || [];
      arr.push(s);
      signalsByProspect.set(s.prospect_id, arr);
      if (s.source_name === 'grok_x_deep_scan') {
        // First grok signal we see per prospect is the most recent one
        // (query is ordered by detected_at desc).
        if (!lastDeepDiveByProspect.has(s.prospect_id)) {
          lastDeepDiveByProspect.set(s.prospect_id, s.detected_at);
        }
        const score = Number(s.metadata?.korea_interest_score);
        if (Number.isFinite(score)) {
          const cur = maxGrokScoreByProspect.get(s.prospect_id) ?? 0;
          if (score > cur) maxGrokScoreByProspect.set(s.prospect_id, score);
        }
      }
    }

    // Attribute Grok run costs to prospects via agent_runs.input_params.
    // Newer runs populate input_params.prospect_ids; older runs (before
    // that field was added) get left out — that's fine, they'll simply
    // show a null cost next to "Scanned Nd ago".
    const { data: runs } = await (supabase as any)
      .from('agent_runs')
      .select('input_params, output_summary, started_at')
      .eq('run_type', 'grok_deep_dive')
      .eq('status', 'completed')
      .order('started_at', { ascending: false })
      .limit(200);

    // Walk most-recent-first so the first cost we see per prospect is
    // from their most recent run (matches lastDeepDiveByProspect).
    for (const r of runs || []) {
      const runProspectIds: string[] = Array.isArray(r.input_params?.prospect_ids)
        ? r.input_params.prospect_ids
        : [];
      const cost = Number(r.output_summary?.cost_usd);
      if (!Number.isFinite(cost)) continue;
      for (const pid of runProspectIds) {
        if (!prospectIds.includes(pid)) continue;
        if (!lastDeepDiveCostByProspect.has(pid)) {
          lastDeepDiveCostByProspect.set(pid, cost);
        }
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
      last_deep_dive_cost_usd: lastDeepDiveCostByProspect.get(p.id) ?? null,
      grok_korea_score: maxGrokScoreByProspect.get(p.id) ?? null,
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
 *
 * Side effect on `status='promoted'`:
 *   If a `crm_opportunities` row doesn't already exist for this project
 *   (case-insensitive name match), one is auto-created using the fields
 *   we've already enriched during discovery — funding, tier, scores, POC
 *   handles, the top-3 Grok signals as a note. No more "promote then
 *   manually re-enter everything in CRM."
 *
 * Body: { id: string, status: 'needs_review' | 'reviewed' | 'promoted' | 'dismissed' }
 *
 * Response:
 *   { success: true, crm_opportunity_id?: string, crm_already_existed?: true }
 */

// Helper: map a discovery prospect + its signals onto the crm_opportunities
// schema. Returns only the fields we have data for so we don't overwrite
// columns with junk defaults.
function buildCrmRowFromProspect(
  prospect: any,
  signals: any[],
): Record<string, unknown> {
  const snap = prospect.discovery_snapshot || {};
  const score = snap.prospect_score || {};
  const funding = snap.funding || {};
  const contacts = Array.isArray(prospect.outreach_contacts) ? prospect.outreach_contacts : [];

  // Prefer the contact with a Telegram handle — that's what we actually DM.
  const primaryContact = contacts.find((c: any) => c?.telegram_handle?.trim()) || contacts[0];
  const pocHandle = primaryContact?.telegram_handle || primaryContact?.twitter_handle || null;
  const pocPlatform = primaryContact?.telegram_handle
    ? 'telegram'
    : primaryContact?.twitter_handle
      ? 'twitter'
      : null;

  // Flatten twitter_url to a bare handle for the crm column.
  let twitterHandle: string | null = null;
  if (typeof prospect.twitter_url === 'string') {
    const m = prospect.twitter_url.match(/(?:x|twitter)\.com\/([^/?#]+)/i);
    if (m) twitterHandle = m[1];
  }

  // Pull the most actionable Grok findings into a compact note.
  const grokSignals = signals
    .filter(s => s.source_name === 'grok_x_deep_scan')
    .slice(0, 3);
  const claudeSignals = signals
    .filter(s => s.source_name === 'discovery_claude')
    .slice(0, 2);
  const noteLines: string[] = [
    `Promoted from Discovery on ${new Date().toISOString().slice(0, 10)}.`,
  ];
  if (snap.fit_reasoning) noteLines.push('', `Why fit: ${snap.fit_reasoning}`);
  if (grokSignals.length > 0) {
    noteLines.push('', 'Recent Grok signals:');
    for (const s of grokSignals) {
      const when = s.detected_at ? new Date(s.detected_at).toISOString().slice(0, 10) : '';
      noteLines.push(`  • [${when}] ${s.headline}`);
    }
  }
  if (claudeSignals.length > 0) {
    noteLines.push('', 'Discovery triggers:');
    for (const s of claudeSignals) noteLines.push(`  • ${s.headline}`);
  }

  // last_signal_at = most recent detected_at across all signals
  const lastSignalAt = signals
    .map(s => s.detected_at)
    .filter(Boolean)
    .sort()
    .pop() || null;

  return {
    name: prospect.name,
    stage: 'new',
    source: 'discovery',
    scope: prospect.name, // free-form; mirrors the name for quick search
    website_url: prospect.website_url || null,
    category: prospect.category || null,
    twitter_handle: twitterHandle,
    poc_handle: pocHandle,
    poc_platform: pocPlatform,
    tg_handle: primaryContact?.telegram_handle || null,
    notes: noteLines.join('\n'),
    icp_fit_score: Number(score.icp_fit) || 0,
    signal_strength_score: Number(score.signal_strength) || 0,
    timing_score: Number(score.timing) || 0,
    composite_score: Number(score.total) || 0,
    action_tier: snap.action_tier || null,
    last_scored_at: new Date().toISOString(),
    funding_stage: funding.round || null,
    funding_amount: funding.amount_usd != null ? String(funding.amount_usd) : null,
    lead_investors: Array.isArray(funding.investors) ? funding.investors.join(', ') : null,
    korea_presence: snap.icp_checks?.no_korea_presence?.pass === true ? 'NONE' : 'UNKNOWN',
    last_signal_at: lastSignalAt,
    dedup_key: typeof prospect.name === 'string' ? prospect.name.trim().toLowerCase() : null,
  };
}

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

  // Flip the prospect status first.
  const { error: updateErr } = await (supabase as any)
    .from('prospects')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', body.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // If not a promotion, we're done.
  if (body.status !== 'promoted') {
    return NextResponse.json({ success: true });
  }

  // ── Promotion: upsert into crm_opportunities ──────────────────────
  // Load the full prospect + its signals so we can map everything in one go.
  const { data: prospect, error: loadErr } = await (supabase as any)
    .from('prospects')
    .select('id, name, symbol, category, website_url, twitter_url, outreach_contacts, discovery_snapshot')
    .eq('id', body.id)
    .single();

  if (loadErr || !prospect) {
    // Status change succeeded; CRM row didn't. Report both honestly.
    return NextResponse.json({
      success: true,
      crm_error: `Status updated but CRM row not created: ${loadErr?.message || 'prospect not found'}`,
    });
  }

  // Dedup: skip if a CRM row already exists for this project.
  // Case-insensitive name match using dedup_key; fallback to name ilike.
  const dedupKey = typeof prospect.name === 'string' ? prospect.name.trim().toLowerCase() : '';
  const { data: existing } = await (supabase as any)
    .from('crm_opportunities')
    .select('id')
    .or(`dedup_key.eq.${dedupKey},name.ilike.${prospect.name}`)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({
      success: true,
      crm_opportunity_id: existing[0].id,
      crm_already_existed: true,
    });
  }

  // Load signals so the CRM note has context.
  const { data: signals } = await (supabase as any)
    .from('prospect_signals')
    .select('source_name, headline, detected_at')
    .eq('prospect_id', body.id)
    .eq('is_active', true)
    .in('source_name', ['discovery_claude', 'grok_x_deep_scan'])
    .order('detected_at', { ascending: false })
    .limit(10);

  const row = buildCrmRowFromProspect(prospect, signals || []);
  const { data: inserted, error: insErr } = await (supabase as any)
    .from('crm_opportunities')
    .insert(row)
    .select('id')
    .single();

  if (insErr) {
    return NextResponse.json({
      success: true,
      crm_error: `Status updated but CRM insert failed: ${insErr.message}`,
    });
  }

  return NextResponse.json({
    success: true,
    crm_opportunity_id: inserted?.id ?? null,
    crm_already_existed: false,
  });
}
