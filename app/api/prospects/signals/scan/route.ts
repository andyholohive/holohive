import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import type { ScanContext, RawSignal, ProspectRef } from '@/lib/signals/types';
import { SIGNAL_WEIGHTS } from '@/lib/signals/types';
import { normalizeForMatch } from '@/lib/signals/matching';
import { headlineFingerprint } from '@/lib/signals/dedup';
import { processDiscoveryQueue } from '@/lib/signals/discovery';
import { calculateScore } from '@/lib/signals/scoringEngine';
import { checkDisqualifiers } from '@/lib/signals/disqualifiers';
import { getScannersByModes, getScannersByCadence } from '@/lib/signals/scanners';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();

    // Auth check — allow cron-triggered scans to bypass
    const cronSecret = request.headers.get('x-cron-secret');
    const isCron = cronSecret && (cronSecret === process.env.CRON_SECRET || cronSecret === 'dev');

    if (!isCron) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scanStartTime = Date.now();

    // Parse options
    const body = await request.json().catch(() => ({}));
    const discover = body.discover !== false;
    const modes: string[] = body.modes || ['api'];
    const cadence: string | undefined = body.cadence; // 'daily' | 'weekly' | 'monthly'
    const recencyMonths: number = Math.max(1, Math.min(12, body.recency_months || 1));

    // 0. Deactivate expired signals
    await supabase
      .from('prospect_signals')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('expires_at', new Date().toISOString());

    // 1. Fetch all prospects
    const { data: allProspects, error: pError } = await supabase
      .from('prospects')
      .select('id, name, symbol, status');
    if (pError) return NextResponse.json({ error: pError.message }, { status: 500 });
    let prospects: ProspectRef[] = (allProspects || []).map(p => ({
      id: p.id,
      name: p.name,
      symbol: p.symbol || null,
      status: p.status || 'needs_review',
    }));

    // 2. Fetch existing signals for dedup (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingSignals } = await supabase
      .from('prospect_signals')
      .select('prospect_id, signal_type, source_name, headline')
      .gte('detected_at', sevenDaysAgo);
    const existingKeys = new Set(
      (existingSignals || []).map(s => `${s.prospect_id}|${s.signal_type}|${s.source_name}|${s.headline?.substring(0, 100)}`)
    );

    // 3. Build scan context
    const ctx: ScanContext = {
      prospects,
      existingSignalKeys: existingKeys,
      supabase,
      recencyMonths,
      metadata: {},
    };

    // 4. Select scanners based on cadence or legacy modes
    const scanners = cadence
      ? getScannersByCadence(cadence as 'daily' | 'weekly' | 'monthly')
      : getScannersByModes(modes);

    // 5. Run scanners and collect signals
    const allRawSignals: RawSignal[] = [];
    const scannerResults: Record<string, { signals: number; error?: string }> = {};
    const semanticDedupSet = new Set<string>();

    for (const scanner of scanners) {
      try {
        const signals = await scanner.scan(ctx);
        let accepted = 0;
        for (const signal of signals) {
          // Source-specific dedup
          const key = `${signal.prospect_id}|${signal.signal_type}|${signal.source_name}|${signal.headline?.substring(0, 100)}`;
          if (existingKeys.has(key)) continue;

          // Semantic dedup
          const semanticKey = `${signal.prospect_id}|${signal.signal_type}|${headlineFingerprint(signal.headline)}`;
          if (semanticDedupSet.has(semanticKey)) continue;

          existingKeys.add(key);
          semanticDedupSet.add(semanticKey);
          allRawSignals.push(signal);
          accepted++;
        }
        scannerResults[scanner.id] = { signals: accepted };
      } catch (err: any) {
        console.error(`Scanner ${scanner.id} error:`, err);
        scannerResults[scanner.id] = { signals: 0, error: err.message };
      }
    }

    // 6. Discovery — create new prospects from unmatched tokens/names
    let discovered = 0;
    let discoveryErrors = 0;
    if (discover) {
      const result = await processDiscoveryQueue(ctx, supabase);
      discovered = result.created;
      discoveryErrors = result.errors;

      // Add discovered prospects to the working list
      for (const p of result.newProspects) {
        prospects.push(p);
      }

      // Add discovery signals
      for (const signal of result.signals) {
        const key = `${signal.prospect_id}|${signal.signal_type}|${signal.source_name}|${signal.headline?.substring(0, 100)}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          allRawSignals.push(signal);
        }
      }
    }

    // 7. Insert signals in batches
    let inserted = 0;
    const signalsToInsert = allRawSignals.map(s => ({
      prospect_id: s.prospect_id,
      project_name: s.project_name,
      signal_type: s.signal_type,
      headline: s.headline?.substring(0, 300),
      snippet: s.snippet?.substring(0, 500),
      source_url: s.source_url || '',
      source_name: s.source_name,
      relevancy_weight: s.relevancy_weight,
      tier: s.tier || SIGNAL_WEIGHTS[s.signal_type]?.tier || 3,
      shelf_life_days: s.shelf_life_days || SIGNAL_WEIGHTS[s.signal_type]?.shelf_life_days || 30,
      expires_at: s.expires_at || new Date(Date.now() + (s.shelf_life_days || 30) * 24 * 60 * 60 * 1000).toISOString(),
    }));

    for (let i = 0; i < signalsToInsert.length; i += 100) {
      const batch = signalsToInsert.slice(i, i + 100);
      const { error } = await supabase.from('prospect_signals').insert(batch);
      if (!error) inserted += batch.length;
      else console.error('Signal insert error:', error.message);
    }

    // 8. Recalculate scores for affected prospects
    const affectedIds = Array.from(new Set(allRawSignals.map(s => s.prospect_id).filter(Boolean)));
    const trendingProspects: string[] = [];

    if (affectedIds.length > 0) {
      for (const prospectId of affectedIds) {
        // Fetch all active signals for this prospect
        const { data: activeSignals } = await supabase
          .from('prospect_signals')
          .select('signal_type, relevancy_weight, is_active, detected_at')
          .eq('prospect_id', prospectId)
          .eq('is_active', true);

        const scoreResult = calculateScore((activeSignals || []) as any[]);

        // Check disqualifiers
        const prospect = prospects.find(p => p.id === prospectId);
        const disqualResult = prospect
          ? checkDisqualifiers(prospect, (activeSignals || []) as any[], {})
          : { disqualified: false, reason: undefined };

        await supabase
          .from('prospects')
          .update({
            korea_relevancy_score: scoreResult.score,
            korea_signal_count: scoreResult.signal_count,
            action_tier: scoreResult.action_tier,
            last_new_signal_date: scoreResult.last_new_signal_date,
            last_signal_scan: new Date().toISOString(),
            is_disqualified: disqualResult.disqualified,
            disqualification_reason: disqualResult.reason || null,
          })
          .eq('id', prospectId);

        if (scoreResult.is_trending) {
          const p = prospects.find(pr => pr.id === prospectId);
          if (p) trendingProspects.push(p.name);
        }
      }
    }

    // Update last_signal_scan for prospects that were scanned but had no signals
    await supabase
      .from('prospects')
      .update({ last_signal_scan: new Date().toISOString() })
      .is('last_signal_scan', null);

    const scanDurationMs = Date.now() - scanStartTime;

    // 9. Identify high-value signals for alerts
    const HIGH_VALUE_TYPES = [
      'tge_within_60d', 'mainnet_launch', 'funding_round_5m', 'airdrop_announcement',
      'korea_expansion_announce', 'dao_asia_governance', 'korea_job_posting',
      'korea_exchange_no_community', 'warm_intro_available',
      // Legacy types
      'korea_partnership', 'korea_hiring', 'korea_intent_vc', 'korea_intent_apac',
    ];
    const highValueSignals = allRawSignals
      .filter(s => HIGH_VALUE_TYPES.includes(s.signal_type))
      .map(s => ({
        project: s.project_name,
        type: s.signal_type,
        headline: s.headline,
        tier: s.tier,
      }));

    return NextResponse.json({
      success: true,
      modes: cadence ? [cadence] : modes,
      cadence: cadence || undefined,
      recency_months: recencyMonths,
      scan_duration_ms: scanDurationMs,
      scan_duration_seconds: Math.round(scanDurationMs / 1000),
      alerts: highValueSignals.length > 0 ? highValueSignals : undefined,
      trending: trendingProspects.length > 0 ? trendingProspects : undefined,
      scanners_run: Object.keys(scannerResults).length,
      scanner_results: scannerResults,
      signals_found: allRawSignals.length,
      signals_inserted: inserted,
      prospects_with_signals: affectedIds.length,
      discovery: {
        new_prospects: discovered,
        errors: discoveryErrors,
      },
      claude: ctx.metadata._claudeCost ? {
        cost_usd: Math.round((ctx.metadata._claudeCost as number) * 10000) / 10000,
        tokens_used: ctx.metadata._claudeTokens as number,
      } : undefined,
    });
  } catch (error: any) {
    console.error('Signal scan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
