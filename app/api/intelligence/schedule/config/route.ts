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
// Bumped from [5,10,15,20] to expose higher-volume tiers. The scan
// endpoint also has a server-side cap (see scan/route.ts) — both must
// accept the same upper bound for the dialog selection to actually
// take effect.
const VALID_MAX_PROJECTS = [5, 10, 15, 20, 25, 30, 50] as const;
// Volume controls (added with migration 042):
const VALID_RUNS_PER_DAY = [1, 2] as const;
const VALID_COOLDOWN = [3, 7, 14, 30] as const;

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

  // runs_per_day (volume control, added Apr 30 2026)
  // 1 = morning only (00:00 UTC = 09:00 KST). 2 = morning + evening
  // (also fires at 12:00 UTC = 21:00 KST = 09:00 ET). The 2nd cron
  // entry exists in vercel.json; the cron handler reads this column
  // to decide whether to run when the 12:00 UTC fire happens.
  if ('runs_per_day' in body) {
    if (!(VALID_RUNS_PER_DAY as readonly number[]).includes(body.runs_per_day)) {
      return NextResponse.json({ error: `runs_per_day must be one of: ${VALID_RUNS_PER_DAY.join(', ')}` }, { status: 400 });
    }
    update.runs_per_day = body.runs_per_day;
  }

  // cooldown_days (volume control, added Apr 30 2026)
  // How many days a prospect must NOT be re-scanned. Lower = more
  // aggressive re-evaluation (catches prospects whose Korea signal
  // fired AFTER their last scan). Higher = more cost-conservative.
  if ('cooldown_days' in body) {
    if (!(VALID_COOLDOWN as readonly number[]).includes(body.cooldown_days)) {
      return NextResponse.json({ error: `cooldown_days must be one of: ${VALID_COOLDOWN.join(', ')}` }, { status: 400 });
    }
    update.cooldown_days = body.cooldown_days;
  }

  // weekly_cost_cap_usd
  // Null = no cap. Number must be a sane positive amount; the cron
  // checks rolling 7-day DISCOVERY spend against this and auto-disables
  // the schedule if breached. We bound at $1000/week which is well
  // beyond any real usage scenario but keeps a typo from setting an
  // effectively-disabled cap.
  if ('weekly_cost_cap_usd' in body) {
    const v = body.weekly_cost_cap_usd;
    if (v === null) {
      update.weekly_cost_cap_usd = null;
    } else if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1000) {
      update.weekly_cost_cap_usd = v;
    } else {
      return NextResponse.json({ error: 'weekly_cost_cap_usd must be a positive number ≤ 1000, or null' }, { status: 400 });
    }
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

  // Reset stale failure status when the user changes the scan config —
  // they presumably edited something to fix the failure, so showing
  // "failed" forever in the dialog is misleading. We only clear when
  // the previous status was 'failed' or 'skipped_cap_breached' AND the
  // user is actually changing something meaningful (params, cadence, or
  // turning enabled back on). Just toggling enabled off doesn't count.
  const meaningfulChange = (
    'cadence' in update ||
    'weekly_day' in update ||
    'scan_params' in update ||
    'weekly_cost_cap_usd' in update ||
    'runs_per_day' in update ||
    'cooldown_days' in update ||
    (update.is_enabled === true && existing.is_enabled === false)
  );
  const previouslyFailed = existing.last_run_status === 'failed'
    || existing.last_run_status === 'skipped_cap_breached';
  if (meaningfulChange && previouslyFailed) {
    update.last_run_status = null;
    update.last_run_summary = null;
    // Note: we don't clear last_run_at — keeping the timestamp gives the
    // user context ("last attempt was 2d ago") while removing the
    // misleading "failed" tag.
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
