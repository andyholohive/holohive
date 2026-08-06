/**
 * Service layer for client_stints + client_engagement_periods CRUD.
 *
 * Background: the Stint + Period schema was shipped as a substrate
 * (tables + lapse cron + dashboard coverage pills) but never got a
 * direct UI. This service backs the Engagement tab inside the Client
 * Context modal so the team can manually create/edit stints + periods
 * instead of editing rows in Supabase Studio.
 *
 * Reads from `client_coverage_status` view alongside the raw tables so
 * the UI gets the same `covered_through` + `coverage_tone` (red / amber /
 * green) values the dashboard renders — single source of truth.
 *
 * Writes go straight to the base tables. The daily lapse-sweep cron at
 * /api/cron/stint-lapse-sweep continues to auto-end any stint whose
 * latest period ends > 7 days ago — manual edits here just pre-empt or
 * correct what the cron would have done.
 */
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type ClientStint = Database['public']['Tables']['client_stints']['Row'];
export type ClientStintInsert = Database['public']['Tables']['client_stints']['Insert'];
export type ClientStintUpdate = Database['public']['Tables']['client_stints']['Update'];
export type EngagementPeriod = Database['public']['Tables']['client_engagement_periods']['Row'];
export type EngagementPeriodInsert = Database['public']['Tables']['client_engagement_periods']['Insert'];
export type EngagementPeriodUpdate = Database['public']['Tables']['client_engagement_periods']['Update'];
export type CoverageStatus = Database['public']['Views']['client_coverage_status']['Row'];

export type StintWithPeriods = ClientStint & {
  periods: EngagementPeriod[];
  coverage: CoverageStatus | null;
};

/** All stints for a client, each with its periods and current coverage. */
export async function fetchClientEngagement(clientId: string): Promise<StintWithPeriods[]> {
  const [stintsRes, periodsRes, coverageRes] = await Promise.all([
    supabase
      .from('client_stints')
      .select('*')
      .eq('client_id', clientId)
      .order('start_date', { ascending: false }),
    supabase
      .from('client_engagement_periods')
      .select('*')
      .order('period_n', { ascending: true }),
    supabase
      .from('client_coverage_status')
      .select('*')
      .eq('client_id', clientId),
  ]);

  if (stintsRes.error) throw stintsRes.error;
  if (periodsRes.error) throw periodsRes.error;
  if (coverageRes.error) throw coverageRes.error;

  const stints = stintsRes.data ?? [];
  const allPeriods = periodsRes.data ?? [];
  const coverageByStint = new Map((coverageRes.data ?? []).map((c) => [c.stint_id, c]));

  return stints.map((stint) => ({
    ...stint,
    periods: allPeriods.filter((p) => p.stint_id === stint.id),
    coverage: coverageByStint.get(stint.id) ?? null,
  }));
}

export async function createStint(payload: ClientStintInsert): Promise<ClientStint> {
  const { data, error } = await supabase
    .from('client_stints')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStint(id: string, patch: ClientStintUpdate): Promise<ClientStint> {
  const { data, error } = await supabase
    .from('client_stints')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStint(id: string): Promise<void> {
  // ON DELETE CASCADE on client_engagement_periods.stint_id means periods
  // go with the stint — no manual cleanup needed.
  const { error } = await supabase.from('client_stints').delete().eq('id', id);
  if (error) throw error;
}

/** Next period_n for a stint — used to pre-fill the Add Period dialog. */
export async function nextPeriodN(stintId: string): Promise<number> {
  const { data, error } = await supabase
    .from('client_engagement_periods')
    .select('period_n')
    .eq('stint_id', stintId)
    .order('period_n', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.period_n ?? 0) + 1;
}

export async function createPeriod(payload: EngagementPeriodInsert): Promise<EngagementPeriod> {
  const { data, error } = await supabase
    .from('client_engagement_periods')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePeriod(id: string, patch: EngagementPeriodUpdate): Promise<EngagementPeriod> {
  const { data, error } = await supabase
    .from('client_engagement_periods')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePeriod(id: string): Promise<void> {
  const { error } = await supabase.from('client_engagement_periods').delete().eq('id', id);
  if (error) throw error;
}

// ─── Draft engagement (Add Client) ──────────────────────────────────
//
// [2026-08-06 per Andy] The Engagement tab is now usable while ADDING a
// client, before any row exists. Stints and terms are foreign-keyed to
// clients.id, so nothing can be written until Create runs — the tab
// therefore edits an in-memory draft, and this module flushes it once we
// have an id.
//
// Draft rows carry a client-side `key` instead of a DB `id`. Everything
// else matches the insert shape, so the flush below is a straight
// translation with no re-derivation of user input.

export type DraftPeriod = {
  key: string;
  period_n: number;
  start_date: string;   // ISO yyyy-mm-dd
  end_date: string;     // ISO yyyy-mm-dd
  amount: number;
  notes: string | null;
};

export type DraftStint = {
  key: string;
  start_date: string;        // ISO yyyy-mm-dd
  end_date: string | null;
  notes: string | null;
  periods: DraftPeriod[];
};

/** Unique enough for React keys + draft identity within one dialog session. */
export function draftKey(): string {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Write a drafted engagement against a freshly-created client.
 *
 * Sequential on purpose: each stint's periods need its real id, and the
 * client_engagement_periods sync trigger rewrites the parent stint's date
 * envelope on every period write — running those concurrently would have
 * them race over the same row.
 *
 * Partial failure is reported, not swallowed. The client already exists by
 * this point, so the caller lands the user on the Engagement tab where
 * whatever did save is visible and the rest can be re-entered.
 */
export async function persistDraftEngagement(
  clientId: string,
  draft: DraftStint[],
): Promise<{ stints: number; periods: number }> {
  let stintCount = 0;
  let periodCount = 0;

  for (const d of draft) {
    const stint = await createStint({
      client_id: clientId,
      start_date: d.start_date,
      end_date: d.end_date,
      notes: d.notes,
    });
    stintCount += 1;

    for (const p of d.periods) {
      // scope + signed_date omitted so the DB defaults apply — same
      // reasoning as the live Add Term path (scope has a CHECK constraint).
      await createPeriod({
        stint_id: stint.id,
        period_n: p.period_n,
        start_date: p.start_date,
        end_date: p.end_date,
        amount: p.amount,
        notes: p.notes,
      });
      periodCount += 1;
    }
  }

  return { stints: stintCount, periods: periodCount };
}
