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
  engagement_start_date: string | null;
  engagement_end_date: string | null;
  engagement_status: string | null;
  is_whitelisted: boolean | null;
  /** v11: client logo for Dashboard / Client Health avatar tile. */
  logo_url: string | null;
  /**
   * [Stint+Period substrate, 2026-06-16] Covered-through date from
   * client_coverage_status view = MAX(period.end_date) per active stint.
   * Preferred over engagement_end_date for renewal-tone math — falls
   * back when client has no stint yet. Full F1 migration (dropping
   * engagement_end_date) lives in the CRM rebuild.
   */
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
    .select('id, name, slug, engagement_start_date, engagement_end_date, engagement_status, is_whitelisted, logo_url')
    .eq('is_active', true)
    .eq('is_ad_hoc', false)
    .is('archived_at', null)
    .order('name');
  if (error || !data) return [];
  // [Stint+Period substrate] Join covered_through from the view so the
  // renewal-tone math can prefer it over engagement_end_date.
  const { data: coverage } = await (sb as any)
    .from('client_coverage_status')
    .select('client_id, covered_through, stint_status');
  const coverageByClient = new Map<string, string | null>();
  for (const row of (coverage ?? []) as Array<{ client_id: string; covered_through: string | null; stint_status: string }>) {
    if (row.stint_status === 'active') coverageByClient.set(row.client_id, row.covered_through);
  }
  return (data as StandardClient[]).map(c => ({
    ...c,
    covered_through: coverageByClient.get(c.id) ?? null,
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
