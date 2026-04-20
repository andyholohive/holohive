import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/webhooks/hermes — Ingest signals from the Hermes agent
 *
 * Hermes runs on a separate VPS and watches things we can't scan from here:
 *   - Korean Telegram groups (real-time mentions of our prospects)
 *   - Upbit / Bithumb volume spikes (hourly, between our daily scans)
 *   - Anything else configured as a Hermes skill
 *
 * Auth: `Authorization: Bearer {HERMES_WEBHOOK_SECRET}`
 *
 * Body (single signal or array):
 * {
 *   project_name: string,            // required — project Hermes saw mentioned
 *   prospect_id?: string,            // optional — if Hermes already resolved it
 *   signal_type: string,             // e.g. 'telegram_kr_mention', 'volume_spike_upbit'
 *   headline: string,                // short human-readable summary
 *   snippet?: string,                // longer excerpt / context
 *   source_url?: string,             // link to the mention / trade data
 *   source_name?: string,            // defaults to 'hermes'
 *   relevancy_weight?: number,       // default 10
 *   tier?: number,                   // 1–4, default 3
 *   confidence?: 'confirmed' | 'likely' | 'speculative',
 *   shelf_life_days?: number,        // default 14
 *   metadata?: Record<string, any>,  // anything Hermes wants to attach
 *   detected_at?: string,            // ISO timestamp, default now
 * }
 *
 * Response:
 * { success: boolean, inserted: number, duplicates: number, errors: string[] }
 */

interface HermesSignal {
  project_name: string;
  prospect_id?: string;
  signal_type: string;
  headline: string;
  snippet?: string;
  source_url?: string;
  source_name?: string;
  relevancy_weight?: number;
  tier?: number;
  confidence?: string;
  shelf_life_days?: number;
  metadata?: Record<string, any>;
  detected_at?: string;
}

export async function POST(request: Request) {
  const startedAt = new Date();

  // --- Auth ---
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

  // --- Supabase (service role so we can write without a user session) ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // --- Log agent run (started) ---
  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'HERMES',
      run_type: 'webhook',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: { source: 'hermes_webhook' },
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (
    status: 'completed' | 'failed',
    output: Record<string, any>,
    error?: string,
  ) => {
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
    // --- Parse body ---
    const body = await request.json().catch(() => null);
    if (!body) {
      await finishRun('failed', {}, 'Invalid JSON body');
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const signals: HermesSignal[] = Array.isArray(body) ? body : [body];

    if (signals.length === 0) {
      await finishRun('completed', { inserted: 0, duplicates: 0 });
      return NextResponse.json({ success: true, inserted: 0, duplicates: 0, errors: [] });
    }

    // --- Validate + resolve prospect_id by project_name if not provided ---
    const errors: string[] = [];
    const rowsToInsert: any[] = [];
    let duplicates = 0;

    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];

      if (!s.project_name || !s.signal_type || !s.headline) {
        errors.push(`Signal ${i}: missing required field (project_name, signal_type, headline)`);
        continue;
      }

      // Resolve prospect_id by project_name match if not provided
      let prospectId = s.prospect_id ?? null;
      if (!prospectId) {
        const { data: match } = await (supabase as any)
          .from('prospects')
          .select('id')
          .or(`name.ilike.${s.project_name},symbol.ilike.${s.project_name}`)
          .limit(1)
          .maybeSingle();
        prospectId = match?.id ?? null;
      }

      // Dedupe: same project + signal_type + source_name + headline within last 24h
      const sourceName = s.source_name ?? 'hermes';
      const { data: existing } = await (supabase as any)
        .from('prospect_signals')
        .select('id')
        .eq('project_name', s.project_name)
        .eq('signal_type', s.signal_type)
        .eq('source_name', sourceName)
        .eq('headline', s.headline)
        .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        duplicates++;
        continue;
      }

      rowsToInsert.push({
        prospect_id: prospectId,
        project_name: s.project_name,
        signal_type: s.signal_type,
        headline: s.headline,
        snippet: s.snippet ?? null,
        source_url: s.source_url ?? null,
        source_name: sourceName,
        relevancy_weight: s.relevancy_weight ?? 10,
        tier: s.tier ?? 3,
        confidence: s.confidence ?? 'likely',
        shelf_life_days: s.shelf_life_days ?? 14,
        metadata: { ...(s.metadata ?? {}), ingested_by: 'hermes', hermes_run_id: runId },
        detected_at: s.detected_at ?? new Date().toISOString(),
        is_active: true,
      });
    }

    // --- Batch insert ---
    let inserted = 0;
    if (rowsToInsert.length > 0) {
      const { data: insData, error: insErr } = await (supabase as any)
        .from('prospect_signals')
        .insert(rowsToInsert)
        .select('id');

      if (insErr) {
        errors.push(`Insert error: ${insErr.message}`);
      } else {
        inserted = insData?.length ?? 0;
      }
    }

    await finishRun('completed', { inserted, duplicates, errors: errors.length });

    return NextResponse.json({
      success: true,
      inserted,
      duplicates,
      errors,
    });
  } catch (error: any) {
    await finishRun('failed', {}, error?.message ?? 'Unknown error');
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 });
  }
}
