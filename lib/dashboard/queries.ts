/**
 * Shared query helpers used by /api/dashboard/v2/* routes.
 *
 * The two `is_ad_hoc` flags shipped 2026-06-01 do OPPOSITE things,
 * which is the easiest thing in this codebase to get wrong:
 *
 *   clients.is_ad_hoc = true → EXCLUDE from rollups (specialized
 *     engagement model, would contaminate KPIs / renewal alerts).
 *   tasks.is_ad_hoc   = true → SURFACE separately (unplanned work,
 *     a Layer 1 signal in its own right).
 *
 * Same word, opposite filter direction. Use the helpers below and
 * the direction is baked in.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function adminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

export interface StandardClient {
  id: string;
  name: string;
  slug: string | null;
  engagement_status: string | null;
  is_whitelisted: boolean | null;
  /** v11: client logo for Dashboard / Client Health avatar tile. */
  logo_url: string | null;
  /**
   * [F1 2026-07-02] Dates now sourced from client_coverage_status view,
   * not from retired clients.engagement_start_date / engagement_end_date.
   * stint_start = active stint's start_date. covered_through = latest
   * term end within that stint. Both null when client has no active stint.
   */
  stint_start: string | null;
  covered_through: string | null;
}

/**
 * Live clients with a standard engagement model. EXCLUDES:
 *   - archived (archived_at IS NOT NULL)
 *   - is_active = false
 *   - is_ad_hoc = true  ← Impossible, Robonet, future ad-hoc engagements
 *
 * This is the only client set that should drive KPI rollups, renewal
 * alerts, completion-rate aggregations, or anything else where
 * "average client" matters.
 */
export async function getStandardClients(
  sb: SupabaseClient = adminSupabase(),
): Promise<StandardClient[]> {
  const { data, error } = await (sb as any)
    .from('clients')
    .select('id, name, slug, engagement_status, is_whitelisted, logo_url')
    .eq('is_active', true)
    .eq('is_ad_hoc', false)
    .is('archived_at', null)
    .order('name');
  if (error || !data) return [];
  // [F1 2026-07-02] Source engagement dates from client_coverage_status
  // view (active stint's start_date + latest term end). Legacy
  // clients.engagement_start_date + engagement_end_date have been dropped.
  const { data: coverage } = await (sb as any)
    .from('client_coverage_status')
    .select('client_id, stint_start, covered_through, stint_status');
  const stintByClient = new Map<string, { stint_start: string | null; covered_through: string | null }>();
  for (const row of (coverage ?? []) as Array<{ client_id: string; stint_start: string | null; covered_through: string | null; stint_status: string }>) {
    if (row.stint_status === 'active') {
      stintByClient.set(row.client_id, { stint_start: row.stint_start, covered_through: row.covered_through });
    }
  }
  return (data as Array<Omit<StandardClient, 'stint_start' | 'covered_through'>>).map(c => ({
    ...c,
    stint_start: stintByClient.get(c.id)?.stint_start ?? null,
    covered_through: stintByClient.get(c.id)?.covered_through ?? null,
  }));
}

/** Live ad-hoc clients — for the side-list "ad-hoc engagements" section.
 * logo_url is included so Recent Call Notes cards can render the client
 * logo on notes logged against an ad-hoc engagement. */
export async function getAdHocClients(
  sb: SupabaseClient = adminSupabase(),
): Promise<Array<{ id: string; name: string; slug: string | null; logo_url: string | null }>> {
  const { data, error } = await (sb as any)
    .from('clients')
    .select('id, name, slug, logo_url')
    .eq('is_active', true)
    .eq('is_ad_hoc', true)
    .is('archived_at', null)
    .order('name');
  if (error || !data) return [];
  return data;
}

export type RenewalTone = 'red' | 'amber' | 'green';

/** Computes the renewal alert tone for a given end_date relative to today. */
export function renewalToneFor(
  endDate: string | null,
  redDays: number,
  amberDays: number,
): { tone: RenewalTone; daysLeft: number | null } {
  if (!endDate) return { tone: 'green', daysLeft: null };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);
  const daysLeft = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft <= redDays) return { tone: 'red', daysLeft };
  if (daysLeft <= amberDays) return { tone: 'amber', daysLeft };
  return { tone: 'green', daysLeft };
}

export type OverdueTone = 'red' | 'yellow' | 'none';

export function overdueToneFor(
  dueDate: string | null,
  status: string | null,
  yellowDays: number,
  redDays: number,
): OverdueTone {
  if (!dueDate) return 'none';
  if (status === 'complete') return 'none';
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setUTCHours(0, 0, 0, 0);
  const daysOver = Math.round((today.getTime() - due.getTime()) / 86_400_000);
  if (daysOver >= redDays) return 'red';
  if (daysOver >= yellowDays) return 'yellow';
  return 'none';
}
