/**
 * Per-client "This Week" KOL delivery roll-up.
 *
 * Read-only join layer over Lineup Manager (campaign_lineups +
 * lineup_angles + lineup_slots) and the /submit pipeline
 * (content_submissions). Powers the expandable KOL row under each
 * client on the Team Dashboard's Client Success tab.
 *
 * Per Andy 2026-06-25:
 *   - Source: KOLs in the **current week's confirmed/completed lineup**
 *     for each of the client's active campaigns.
 *   - Per-KOL status: Approved (content_submission.status='approved'
 *     this week) → In QA (any 'pending') → Not submitted (no rows).
 *   - Week math anchored to the first Monday on/after campaign
 *     start_date via lib/campaignWeekHelpers.ts — same anchor the
 *     Lineup Manager uses post-2026-06-23.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCampaignWeek } from '@/lib/campaignWeekHelpers';
import type { Database } from '@/lib/database.types';

export type KolDeliveryStatus = 'approved' | 'in_qa' | 'not_submitted';

export type KolDeliveryRow = {
  kol_id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
  status: KolDeliveryStatus;
};

export type ClientWeekDelivery = {
  client_id: string;
  week_number: number | null;
  approved: number;
  total: number;
  rows: KolDeliveryRow[];
};

const MS_PER_DAY = 86_400_000;

/**
 * Computes the Monday-anchored window for week N of a campaign and
 * returns { weekStart, weekEnd } as ISO strings (UTC midnight bounds).
 * Content submissions matched by submitted_at ∈ [start, end).
 */
function weekWindow(startDateIso: string, weekNumber: number): { start: Date; end: Date } | null {
  const week = getCampaignWeek(startDateIso);
  if (!week) return null;
  // Anchor day = Monday of week N (1-indexed).
  const anchor = new Date(week.week1Monday);
  anchor.setDate(anchor.getDate() + (weekNumber - 1) * 7);
  anchor.setHours(0, 0, 0, 0);
  const end = new Date(anchor.getTime() + 7 * MS_PER_DAY);
  return { start: anchor, end };
}

/**
 * Roll up this week's KOL delivery for one or more clients.
 *
 * For each client:
 *   1. Pull every active campaign (campaigns.client_id = X, status = 'Active').
 *   2. For each campaign, find the confirmed/completed lineup matching
 *      its current week (or the latest such lineup if none for current).
 *   3. Pull every KOL in that lineup's slots.
 *   4. Match each KOL's content_submissions for the campaign within the
 *      Monday–Sunday window of that week. Approved beats pending beats
 *      nothing.
 *
 * Returns a map keyed by client_id with the rows ready to render.
 * Clients with no active campaign + lineup get an empty entry.
 */
export async function getThisWeekKolDelivery(
  supabase: SupabaseClient<Database>,
  clientIds: string[],
): Promise<Record<string, ClientWeekDelivery>> {
  const out: Record<string, ClientWeekDelivery> = {};
  for (const id of clientIds) {
    out[id] = { client_id: id, week_number: null, approved: 0, total: 0, rows: [] };
  }
  if (clientIds.length === 0) return out;

  // ── 1. Active campaigns for these clients ───────────────────────
  const { data: campaigns } = await (supabase as any)
    .from('campaigns')
    .select('id, name, client_id, start_date, end_date, status')
    .in('client_id', clientIds)
    .eq('status', 'Active')
    .not('start_date', 'is', null);

  if (!campaigns || campaigns.length === 0) return out;

  // ── 2. Current week per campaign + look up the matching lineup ──
  type CampaignMeta = {
    id: string;
    name: string;
    client_id: string;
    start_date: string;
    week_number: number;
    window: { start: Date; end: Date };
  };
  const campaignMetas: CampaignMeta[] = [];
  for (const c of campaigns) {
    if (!c.start_date) continue;
    const week = getCampaignWeek(c.start_date);
    if (!week) continue;
    const win = weekWindow(c.start_date, week.weekNumber);
    if (!win) continue;
    campaignMetas.push({
      id: c.id,
      name: c.name,
      client_id: c.client_id,
      start_date: c.start_date,
      week_number: week.weekNumber,
      window: win,
    });
  }

  // ── 3. Lineups for those (campaign, week) pairs ─────────────────
  // [2026-06-25] Filter widened to include 'proposed' per Andy's call:
  // strict confirmed/completed left the dashboard blank all build week.
  // Proposed = CM has deliberately drafted a roster for the week (not
  // random draft state). The proposed → confirmed roster delta is
  // typically small. Draft/empty states are still excluded.
  const campaignIds = campaignMetas.map((c) => c.id);
  const weekNumbers = [...new Set(campaignMetas.map((c) => c.week_number))];
  const { data: lineups } = await (supabase as any)
    .from('campaign_lineups')
    .select('id, campaign_id, week_number, status')
    .in('campaign_id', campaignIds)
    .in('week_number', weekNumbers)
    .in('status', ['proposed', 'confirmed', 'completed']);

  if (!lineups || lineups.length === 0) return out;

  // Build (campaign_id, week) → lineup_id lookup, restricted to each
  // campaign's actual current week.
  const lineupByKey = new Map<string, string>();
  for (const lu of lineups) {
    const key = `${lu.campaign_id}:${lu.week_number}`;
    if (!lineupByKey.has(key)) lineupByKey.set(key, lu.id);
  }
  const activeLineupIds: string[] = [];
  const campaignMetaByLineupId = new Map<string, CampaignMeta>();
  for (const meta of campaignMetas) {
    const id = lineupByKey.get(`${meta.id}:${meta.week_number}`);
    if (id) {
      activeLineupIds.push(id);
      campaignMetaByLineupId.set(id, meta);
    }
  }
  if (activeLineupIds.length === 0) return out;

  // ── 4. Slots → angles → lineups join (get the per-KOL roster) ───
  const { data: slots } = await (supabase as any)
    .from('lineup_slots')
    .select(`
      id,
      kol_id,
      status,
      angle:lineup_angles!inner ( lineup_id ),
      master_kol:master_kols!inner ( id, name )
    `)
    .in('angle.lineup_id', activeLineupIds);

  if (!slots || slots.length === 0) return out;

  // ── 5. Content submissions for those (campaign, kol) within each
  //       campaign's Monday-Sunday window. We pull all for the active
  //       campaigns then bucket per-row.
  const kolIds = [...new Set(slots.map((s: any) => s.kol_id))];
  const earliestStart = new Date(
    Math.min(...campaignMetas.map((c) => c.window.start.getTime())),
  ).toISOString();
  const latestEnd = new Date(
    Math.max(...campaignMetas.map((c) => c.window.end.getTime())),
  ).toISOString();
  const { data: submissions } = await (supabase as any)
    .from('content_submissions')
    .select('campaign_id, kol_id, status, submitted_at')
    .in('campaign_id', campaignIds)
    .in('kol_id', kolIds)
    .gte('submitted_at', earliestStart)
    .lt('submitted_at', latestEnd);

  // Build (campaign_id, kol_id) → best status. Approved beats pending.
  type SubStatus = 'approved' | 'pending';
  const subKey = (c: string, k: string) => `${c}:${k}`;
  const bestSub = new Map<string, SubStatus>();
  for (const s of submissions ?? []) {
    const key = subKey(s.campaign_id, s.kol_id);
    // Only consider rows inside THIS campaign's specific week window.
    const meta = campaignMetas.find((m) => m.id === s.campaign_id);
    if (!meta) continue;
    const t = new Date(s.submitted_at).getTime();
    if (t < meta.window.start.getTime() || t >= meta.window.end.getTime()) continue;
    // Approved is terminal; pending only set if no better is recorded.
    if (s.status === 'approved') bestSub.set(key, 'approved');
    else if (s.status === 'pending' && bestSub.get(key) !== 'approved') {
      bestSub.set(key, 'pending');
    }
  }

  // ── 6. Compose rows + per-client roll-up ───────────────────────
  for (const slot of slots as any[]) {
    const angle = Array.isArray(slot.angle) ? slot.angle[0] : slot.angle;
    const master = Array.isArray(slot.master_kol) ? slot.master_kol[0] : slot.master_kol;
    if (!angle || !master) continue;
    const meta = campaignMetaByLineupId.get(angle.lineup_id);
    if (!meta) continue;
    const sub = bestSub.get(subKey(meta.id, slot.kol_id));
    const status: KolDeliveryStatus =
      sub === 'approved' ? 'approved' : sub === 'pending' ? 'in_qa' : 'not_submitted';

    const clientBucket = out[meta.client_id];
    if (!clientBucket) continue;
    clientBucket.week_number = meta.week_number;
    clientBucket.rows.push({
      kol_id: slot.kol_id,
      name: master.name,
      campaign_id: meta.id,
      campaign_name: meta.name,
      status,
    });
    clientBucket.total += 1;
    if (status === 'approved') clientBucket.approved += 1;
  }

  // Sort rows: approved → in_qa → not_submitted, then name asc.
  const order: Record<KolDeliveryStatus, number> = { approved: 0, in_qa: 1, not_submitted: 2 };
  for (const id of clientIds) {
    out[id].rows.sort((a, b) => {
      const d = order[a.status] - order[b.status];
      if (d !== 0) return d;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  return out;
}
