/**
 * Typed reader for the `dashboard_config` thresholds with a 60s
 * in-memory cache. Ops can tune any of these via SQL (or a future
 * settings UI) without a redeploy; the dashboard picks the new values
 * up within a minute.
 *
 * Seed values (set in the `dashboard_v2_dashboard_config_table_and_seed`
 * migration on 2026-06-01) are mirrored as DEFAULTS so a missing row
 * or a Supabase outage degrades gracefully instead of breaking the
 * dashboard.
 */

import { createClient } from '@supabase/supabase-js';

export interface DashboardConfig {
  overdue_yellow_days: number;
  overdue_red_days: number;
  initiative_stale_amber_days: number;
  initiative_stale_red_days: number;
  person_escalation_threshold: number;
  renewal_amber_days: number;
  renewal_red_days: number;
  form_deadline_hour_utc: number;
}

export const DASHBOARD_CONFIG_DEFAULTS: DashboardConfig = {
  // 1 = anything past today's due date counts as overdue. Per Andy
  // 2026-06-19 — dropped the prior 3-day grace ("if it's just
  // overdue, it's overdue"). Affects the Layer 1 KPI count, the
  // Workload table, the Overdue panel, and the §7 TG escalation DMs
  // (which all read from this same threshold).
  overdue_yellow_days: 1,
  overdue_red_days: 7,
  initiative_stale_amber_days: 14,
  initiative_stale_red_days: 30,
  person_escalation_threshold: 5,
  renewal_amber_days: 30,
  renewal_red_days: 14,
  form_deadline_hour_utc: 12,
};

const TTL_MS = 60_000;
let cached: { value: DashboardConfig; at: number } | null = null;

export async function getDashboardConfig(): Promise<DashboardConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // No env → return defaults; this is the safe degraded path.
    return DASHBOARD_CONFIG_DEFAULTS;
  }

  const sb = createClient(url, key);
  const { data, error } = await (sb as any)
    .from('dashboard_config')
    .select('key, value');

  if (error || !data) return DASHBOARD_CONFIG_DEFAULTS;

  const merged: DashboardConfig = { ...DASHBOARD_CONFIG_DEFAULTS };
  for (const row of data) {
    const k = row.key as keyof DashboardConfig;
    if (k in DASHBOARD_CONFIG_DEFAULTS) {
      // value is JSONB; for our threshold keys it's always a number.
      const parsed = Number(row.value);
      if (!Number.isNaN(parsed)) merged[k] = parsed;
    }
  }

  cached = { value: merged, at: Date.now() };
  return merged;
}

/** Manual cache bust — useful from the future settings UI on save. */
export function clearDashboardConfigCache() {
  cached = null;
}
