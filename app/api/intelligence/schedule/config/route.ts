import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SCHEDULE_KEY = 'discovery_default';

/** Allowed values for each user-tunable param. The cron handler will
 *  pass these straight through to the scan endpoint, so anything we
 *  accept here is what actually gets used in production. */
const VALID_CADENCES = ['daily', 'weekdays', 'weekly'] as const;
const VALID_MODELS = ['sonnet', 'opus'] as const;
const VALID_SOURCES = ['dropstab', 'rootdata', 'cryptorank', 'ethglobal'] as const;
const VALID_RECENCY = [7, 14, 30, 60, 90] as const;
const VALID_MIN_RAISE = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000] as const;
const VALID_MAX_PROJECTS = [5, 10, 15, 20] as const;

/**
 * GET /api/intelligence/schedule/config
 *
 * Returns the current scheduled-scan config row. Used by the settings
 * dialog to populate its initial state.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await (supabase as any)
    .from('scheduled_scans')
    .select('*')
    .eq('schedule_key', SCHEDULE_KEY)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schedule: data });
}

/**
 * PUT /api/intelligence/schedule/config
 *
 * Body fields are all optional — partial updates merge into existing
 * scan_params rather than replacing wholesale. The full schema:
 *
 *   {
 *     is_enabled?: boolean,
 *     cadence?:    'daily' | 'weekdays' | 'weekly',
 *     weekly_day?: 1..7,                              // ISO Mon..Sun
 *     scan_params?: {
 *       recency_days?:  7|14|30|60|90,
 *       min_raise_usd?: 500000|1000000|2000000|5000000|10000000,
 *       max_projects?:  5|10|15|20,
 *       model?:         'sonnet' | 'opus',
 *       sources?:       ('dropstab'|'rootdata'|'cryptorank'|'ethglobal')[]
 *     }
 *   }
 *
 * Validation is strict — we reject the whole request rather than
 * silently dropping bad fields, so the UI fails loudly if it ever
 * sends an invalid value.
 */
export async function PUT(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Load existing so we can merge scan_params
  const { data: existing, error: loadErr } = await (supabase as any)
    .from('scheduled_scans')
    .select('*')
    .eq('schedule_key', SCHEDULE_KEY)
    .single();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  // is_enabled
  if ('is_enabled' in body) {
    update.is_enabled = !!body.is_enabled;
  }

  // cadence
  if ('cadence' in body) {
    if (!(VALID_CADENCES as readonly string[]).includes(body.cadence)) {
      return NextResponse.json({ error: `cadence must be one of: ${VALID_CADENCES.join(', ')}` }, { status: 400 });
    }
    update.cadence = body.cadence;
  }

  // weekly_day
  if ('weekly_day' in body) {
    const v = body.weekly_day;
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > 7)) {
      return NextResponse.json({ error: 'weekly_day must be 1..7 (Mon..Sun) or null' }, { status: 400 });
    }
    update.weekly_day = v;
  }

  // scan_params (merged)
  if ('scan_params' in body) {
    if (!body.scan_params || typeof body.scan_params !== 'object') {
      return NextResponse.json({ error: 'scan_params must be an object' }, { status: 400 });
    }
    const sp = body.scan_params;
    const merged = { ...(existing.scan_params || {}) };

    if ('recency_days' in sp) {
      if (!(VALID_RECENCY as readonly number[]).includes(sp.recency_days)) {
        return NextResponse.json({ error: `recency_days must be one of: ${VALID_RECENCY.join(', ')}` }, { status: 400 });
      }
      merged.recency_days = sp.recency_days;
    }
    if ('min_raise_usd' in sp) {
      if (!(VALID_MIN_RAISE as readonly number[]).includes(sp.min_raise_usd)) {
        return NextResponse.json({ error: `min_raise_usd must be one of: ${VALID_MIN_RAISE.join(', ')}` }, { status: 400 });
      }
      merged.min_raise_usd = sp.min_raise_usd;
    }
    if ('max_projects' in sp) {
      if (!(VALID_MAX_PROJECTS as readonly number[]).includes(sp.max_projects)) {
        return NextResponse.json({ error: `max_projects must be one of: ${VALID_MAX_PROJECTS.join(', ')}` }, { status: 400 });
      }
      merged.max_projects = sp.max_projects;
    }
    if ('model' in sp) {
      if (!(VALID_MODELS as readonly string[]).includes(sp.model)) {
        return NextResponse.json({ error: `model must be one of: ${VALID_MODELS.join(', ')}` }, { status: 400 });
      }
      merged.model = sp.model;
    }
    if ('sources' in sp) {
      if (!Array.isArray(sp.sources) || sp.sources.length === 0) {
        return NextResponse.json({ error: 'sources must be a non-empty array' }, { status: 400 });
      }
      const filtered = sp.sources.filter((s: unknown) =>
        typeof s === 'string' && (VALID_SOURCES as readonly string[]).includes(s),
      );
      if (filtered.length === 0) {
        return NextResponse.json({ error: `sources must include at least one of: ${VALID_SOURCES.join(', ')}` }, { status: 400 });
      }
      merged.sources = filtered;
    }

    update.scan_params = merged;
  }

  // Cross-field validation: cadence='weekly' requires weekly_day to be set
  // (use the new value if present, otherwise the existing one)
  const finalCadence = update.cadence ?? existing.cadence;
  const finalWeeklyDay = 'weekly_day' in update ? update.weekly_day : existing.weekly_day;
  if (finalCadence === 'weekly' && (finalWeeklyDay == null)) {
    return NextResponse.json(
      { error: "cadence='weekly' requires weekly_day to be set (1=Mon..7=Sun)" },
      { status: 400 },
    );
  }

  const { data: saved, error: saveErr } = await (supabase as any)
    .from('scheduled_scans')
    .update(update)
    .eq('schedule_key', SCHEDULE_KEY)
    .select('*')
    .single();
  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  return NextResponse.json({ schedule: saved });
}
