/**
 * GET /api/dashboard/v2/client — Layer 2: Client Success
 *
 * Answers "are clients getting results?" Returns:
 *   - outputSignals: 4 KPIs above the Health table per spec § 4.1
 *     (Content posted 7d, Active campaigns, Activations live + names,
 *      Total ext. visits 7d). Aggregated across standard clients only.
 *   - clientHealth: per-standard-client row with week number, engagement
 *     context, content posted this week (and all-time), open/overdue
 *     task counts, ext. visits 7d, the renewal tone (red < 14d / amber
 *     < 30d / green), and the computed health tone (0 overdue=green,
 *     1-2=amber, 3+=red).
 *   - callNotes: recent client_meeting_notes (last 10 across all
 *     standard clients) with open action_items count.
 *   - adHocClients: side-list of ad-hoc clients so they're visible
 *     but explicitly NOT in the rollups above.
 *
 * Ad-hoc clients (Impossible, Robonet) are EXCLUDED from clientHealth.
 *
 * Ext. visits (2026-06-15): backed by `portal_visits` table (created
 * by portal_visits_skeleton migration). Reads COUNT(*) per client
 * WHERE is_external = true AND visited_at >= weekStart. Until the
 * portal-side instrumentation lands (TODO: /api/portal/log-visit), the
 * table is empty, so counts return 0. The UI subtitle still surfaces
 * "TBD" while empty so users don't read 0 as healthy. Once visits
 * start flowing, the dashboard light-flips with no code change.
 */

import { NextResponse } from 'next/server';
import { adminSupabase, getStandardClients, getAdHocClients, renewalToneFor, overdueToneFor } from '@/lib/dashboard/queries';
import { getDashboardConfig } from '@/lib/dashboard/config';
import { getThisWeekKolDelivery } from '@/lib/clientDeliveryService';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 60_000;
let cached: { value: any; at: number } | null = null;

function startOfWeekUtc(): Date {
  const x = new Date();
  const day = x.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setUTCDate(x.getUTCDate() - diff);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export async function GET(request: Request) {
  // ?fresh=1 bypasses the 60s in-memory cache. Used by the Client
  // Context modal close handler so a freshly-saved call note shows up
  // immediately instead of after the next TTL window.
  const url = new URL(request.url);
  const force = url.searchParams.get('fresh') === '1';
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.value);
  }

  try {
    const sb = adminSupabase();
    const cfg = await getDashboardConfig();
    const weekStartIso = startOfWeekUtc().toISOString();

    const [standardClients, adHocClients] = await Promise.all([
      getStandardClients(sb),
      getAdHocClients(sb),
    ]);

    const standardClientIds = standardClients.map(c => c.id);
    // [2026-06-16] Recent Call Notes spans ALL live clients (standard +
    // ad-hoc). KPI rollups stay standard-only — the spec only excludes
    // ad-hoc from "average client" math, not from conversation logs.
    const adHocClientIds = adHocClients.map(c => c.id);
    const allLiveClientIds = [...standardClientIds, ...adHocClientIds];
    if (standardClientIds.length === 0) {
      const empty = {
        asOf: new Date().toISOString(),
        thresholds: cfg,
        outputSignals: {
          contentPostedLast7d: 0,
          activeCampaigns: 0,
          activationsLive: { count: 0, names: [] as string[] },
          totalExtVisitsLast7d: 0,
        },
        clientHealth: [],
        callNotes: [],
        adHocClients,
      };
      cached = { value: empty, at: Date.now() };
      return NextResponse.json(empty);
    }

    const [tasksRes, contentsThisWeekRes, contentsAllTimeRes, campaignsRes, meetingNotesRes, extVisitsRes] = await Promise.all([
      // Open tasks linked to standard clients
      (sb as any)
        .from('tasks')
        .select('id, client_id, status, due_date, completed_at')
        .in('client_id', standardClientIds),
      // Content posted this week per standard client.
      // [2026-06-17] Fixed Flow D bug — contents has no client_id column.
      // Embed the campaign so we can derive the client_id via campaign_id.
      // Previously the query silently errored (.in('client_id', ...) on a
      // non-existent column), zeroing out the entire KPI.
      // [2026-07-05 AUDIT-FIX] multipost_group_id included so the
      // aggregation below can collapse cross-platform mirrors to one
      // counted post (same dedup rule as the company leaderboard).
      (sb as any)
        .from('contents')
        .select('id, status, activation_date, campaign_id, multipost_group_id, campaigns!inner(client_id)')
        .eq('status', 'posted')
        .gte('activation_date', weekStartIso.slice(0, 10))
        .in('campaigns.client_id', standardClientIds),
      // [2026-06-11] All-time content posted per client — drives spec § 4.2's
      // "Content Posted" column (total count, not just this week).
      // [2026-06-17] Same client_id-via-campaign fix as above.
      (sb as any)
        .from('contents')
        .select('id, campaign_id, multipost_group_id, campaigns!inner(client_id)')
        .eq('status', 'posted')
        .in('campaigns.client_id', standardClientIds),
      // [2026-06-11] Active campaigns for the Output Signals KPI row — spec
      // § 4.1. status is TitleCase ("Active") not lowercase per a sample query.
      (sb as any)
        .from('campaigns')
        .select('id, client_id, status')
        .in('client_id', standardClientIds)
        .eq('status', 'Active')
        .is('archived_at', null),
      // [2026-06-15] Per HHP Team Dashboard Spec § 4.3 — call notes
      // are pulled from the "portal context field," now backed by
      // `client_context.call_notes` JSONB. Replaces the earlier read
      // from client_meeting_notes + meeting_action_items (parallel
      // tables that were built but never wired to a UI entry point).
      // Each call_notes element holds the meeting date, content,
      // action items, and TG send stamps inline — we flatten them
      // below into the same DTO shape so /dashboard/_tabs/ClientTab.tsx
      // doesn't change.
      // [2026-06-16] Reads across ALL live clients (standard + ad-hoc)
      // so notes logged against an ad-hoc engagement still surface.
      (sb as any)
        .from('client_context')
        .select('client_id, call_notes')
        .in('client_id', allLiveClientIds),
      // [2026-06-15] External portal visits per client this week —
      // wired against portal_visits (created by portal_visits_skeleton
      // migration). Empty table → counts return 0. Once the
      // /api/portal/log-visit instrumentation lands, this lights up
      // automatically with no UI change.
      (sb as any)
        .from('portal_visits')
        .select('client_id')
        .in('client_id', standardClientIds)
        .eq('is_external', true)
        .gte('visited_at', weekStartIso),
    ]);

    const tasks = (tasksRes.data ?? []) as any[];
    const contentsThisWeek = (contentsThisWeekRes.data ?? []) as any[];
    const contentsAllTime = (contentsAllTimeRes.data ?? []) as any[];
    const activeCampaigns = (campaignsRes.data ?? []) as any[];
    const extVisitsThisWeek = (extVisitsRes.data ?? []) as Array<{ client_id: string }>;
    const contextRows = (meetingNotesRes.data ?? []) as Array<{
      client_id: string;
      call_notes: Array<{
        id: string;
        meeting_date: string;
        content: string;
        action_items: Array<{
          id: string;
          text: string;
          owner_user_id: string | null;
          owner_client_side: boolean;
          is_done: boolean;
        }>;
        sent_to_client_tg_at: string | null;
        sent_to_client_tg_by: string | null;
        created_at: string;
      }> | null;
    }>;

    // Per-client task aggregations
    const taskAgg = new Map<string, { open: number; overdue: number; doneThisWeek: number }>();
    for (const t of tasks) {
      const cur = taskAgg.get(t.client_id) ?? { open: 0, overdue: 0, doneThisWeek: 0 };
      if (t.status === 'complete') {
        if (t.completed_at && t.completed_at >= weekStartIso) cur.doneThisWeek += 1;
      } else {
        cur.open += 1;
        if (overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) !== 'none') {
          cur.overdue += 1;
        }
      }
      taskAgg.set(t.client_id, cur);
    }

    // Per-client content posted-this-week + all-time counts.
    // [2026-06-17] client_id resolves via the embedded campaigns row
    // (contents has no client_id column — fixed in the fetch above).
    // [2026-07-05 AUDIT-FIX] multipost dedup — a cross-platform mirror
    // group counts as ONE post (first row per multipost_group_id wins;
    // counts don't care which group member represents it).
    const countDeduped = (rows: any[]): Map<string, number> => {
      const byClient = new Map<string, number>();
      const seenGroups = new Set<string>();
      for (const c of rows) {
        const clientId = c.campaigns?.client_id;
        if (!clientId) continue;
        if (c.multipost_group_id) {
          if (seenGroups.has(c.multipost_group_id)) continue;
          seenGroups.add(c.multipost_group_id);
        }
        byClient.set(clientId, (byClient.get(clientId) ?? 0) + 1);
      }
      return byClient;
    };
    const contentThisWeekByClient = countDeduped(contentsThisWeek);
    const contentAllTimeByClient = countDeduped(contentsAllTime);

    // Per-client external visit counts this week.
    const extVisitsByClient = new Map<string, number>();
    for (const v of extVisitsThisWeek) {
      extVisitsByClient.set(v.client_id, (extVisitsByClient.get(v.client_id) ?? 0) + 1);
    }

    // [2026-06-11] Output Signals row — spec § 4.1.
    // Activations live: count of standard clients with non-empty
    // activations[] array. Subtitle lists the names. The array column
    // already exists per dashboard_v2_clients_lifecycle_columns
    // migration; ops populates it from /clients UI.
    const activationNames: string[] = [];
    for (const c of standardClients) {
      const acts = (c as any).activations as string[] | null | undefined;
      if (Array.isArray(acts) && acts.length > 0) activationNames.push(...acts);
    }
    const outputSignals = {
      contentPostedLast7d: contentsThisWeek.length,
      activeCampaigns: activeCampaigns.length,
      activationsLive: {
        count: activationNames.length,
        names: activationNames,
      },
      // Ext. visits — see route header comment. Reads from
      // portal_visits; returns 0 until portal-side instrumentation
      // starts inserting rows.
      totalExtVisitsLast7d: extVisitsThisWeek.length,
    };

    // [2026-06-15] Flatten client_context.call_notes JSONB into the
    // same shape ClientTab.tsx expects. Each row contributes 0+ notes;
    // we sort newest-first and cap at 10 (legacy behaviour).
    type ActionItemDto = {
      id: string;
      text: string;
      owner: string;
      ownerSide: 'hh' | 'client';
      done: boolean;
    };
    type CallNoteDto = {
      id: string;
      client_id: string;
      client_name: string | null;
      client_logo_url: string | null;
      client_renewal_tone: 'green' | 'amber' | 'red' | 'unknown';
      title: string;
      content: string;
      meeting_date: string;
      attendees: string | null;
      sent_to_client_tg_at: string | null;
      openHhActionItems: number;
      actionItems: ActionItemDto[];
    };

    // Resolve HH owner names (single round-trip across all HH-side items
    // across all flattened call notes).
    const userIdsForActionItems = new Set<string>();
    for (const row of contextRows) {
      for (const n of row.call_notes ?? []) {
        for (const ai of n.action_items ?? []) {
          if (ai.owner_user_id && !ai.owner_client_side) {
            userIdsForActionItems.add(ai.owner_user_id);
          }
        }
      }
    }
    const ownerNameLookup = new Map<string, string>();
    if (userIdsForActionItems.size > 0) {
      const { data: ownerUsers } = await (sb as any)
        .from('users')
        .select('id, name')
        .in('id', Array.from(userIdsForActionItems));
      for (const u of (ownerUsers ?? []) as Array<{ id: string; name: string }>) {
        ownerNameLookup.set(u.id, u.name);
      }
    }

    const flatCallNotes: CallNoteDto[] = [];
    for (const row of contextRows) {
      for (const n of row.call_notes ?? []) {
        const items: ActionItemDto[] = (n.action_items ?? []).map(ai => ({
          id: ai.id,
          text: ai.text,
          owner: ai.owner_client_side
            ? 'Client'
            : (ai.owner_user_id ? ownerNameLookup.get(ai.owner_user_id) ?? 'Holo Hive' : 'Holo Hive'),
          ownerSide: ai.owner_client_side ? 'client' : 'hh',
          done: !!ai.is_done,
        }));
        const openHh = items.filter(i => i.ownerSide === 'hh' && !i.done).length;
        flatCallNotes.push({
          id: n.id,
          client_id: row.client_id,
          client_name: null, // filled in below
          client_logo_url: null, // filled in below
          client_renewal_tone: 'unknown', // filled in below
          title: '', // free-form notes don't have a title in the spec'd shape
          content: n.content,
          meeting_date: n.meeting_date,
          attendees: null,
          sent_to_client_tg_at: n.sent_to_client_tg_at,
          openHhActionItems: openHh,
          actionItems: items,
        });
      }
    }
    flatCallNotes.sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || ''));

    // Client name + logo + renewal-tone lookup so the call note card
    // can render the client header without a per-row join in the UI.
    // Ad-hoc clients are included so notes against them resolve to a
    // name, not "null".
    type ClientMeta = {
      name: string;
      logo_url: string | null;
      renewal_tone: 'green' | 'amber' | 'red' | 'unknown';
    };
    const clientMetaById = new Map<string, ClientMeta>();
    for (const c of standardClients) {
      // [F1 2026-07-02] Legacy engagement_end_date column dropped;
      // renewal math sources purely from covered_through.
      const renewalDate = c.covered_through;
      const renewal = renewalToneFor(renewalDate, cfg.renewal_red_days, cfg.renewal_amber_days);
      clientMetaById.set(c.id, {
        name: c.name,
        logo_url: (c as any).logo_url ?? null,
        renewal_tone: renewalDate ? renewal.tone : 'unknown',
      });
    }
    for (const c of adHocClients) {
      clientMetaById.set(c.id, {
        name: c.name,
        logo_url: c.logo_url ?? null,
        // Ad-hoc engagements have no SLA renewal window — tone stays
        // 'unknown' so the rail / fallback tile use the neutral palette.
        renewal_tone: 'unknown',
      });
    }

    // [2026-06-11] Compute week-number per spec § 4.2:
    // FLOOR((NOW - started_date) / 7) + 1 — week 1 is the week the
    // engagement started. Returns null for clients with no start date.
    const weekNumberFor = (startedDate: string | null | undefined): number | null => {
      if (!startedDate) return null;
      const start = new Date(startedDate + (startedDate.includes('T') ? '' : 'T00:00:00Z'));
      const ms = Date.now() - start.getTime();
      if (ms < 0) return null;
      return Math.floor(ms / (7 * 86_400_000)) + 1;
    };

    // [2026-06-11] Health tone per spec § 4.2:
    // 0 overdue = green/healthy, 1-2 = amber/needs attention, 3+ = red/at risk.
    // No subjective weighting per spec § 12 locked decisions.
    const healthToneFor = (overdueCount: number): 'green' | 'amber' | 'red' => {
      if (overdueCount === 0) return 'green';
      if (overdueCount <= 2) return 'amber';
      return 'red';
    };

    // [2026-06-25] This-Week KOL delivery roll-up per client. Pulls
    // the confirmed/completed lineup for each client's active campaigns
    // and joins against content_submissions to bucket each KOL into
    // Approved / In QA / Not submitted. See lib/clientDeliveryService.
    const deliveryByClient = await getThisWeekKolDelivery(sb as any, standardClientIds);

    // Build client health rows
    const clientHealth = standardClients.map(c => {
      const t = taskAgg.get(c.id) ?? { open: 0, overdue: 0, doneThisWeek: 0 };
      // [F1 2026-07-02] Legacy engagement_end_date column dropped.
      const renewalDate = c.covered_through;
      const renewal = renewalToneFor(renewalDate, cfg.renewal_red_days, cfg.renewal_amber_days);
      const delivery = deliveryByClient[c.id];
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        // Kept in response for callers that still surface engagement dates;
        // now sourced from the active stint via client_coverage_status.
        engagement_start_date: c.stint_start,
        engagement_end_date: c.covered_through,
        weekNumber: weekNumberFor(c.stint_start),
        // Renewal tone/days kept for callers that still read them
        // (e.g. callNotes header tints). The Client Success tab itself
        // no longer renders a Renewal column post-2026-06-25 — the
        // Renewals & Pipeline tab is the single source of truth.
        renewal_tone: renewal.tone,
        renewal_days_left: renewal.daysLeft,
        openTasks: t.open,
        overdueTasks: t.overdue,
        completedThisWeek: t.doneThisWeek,
        contentPostedThisWeek: contentThisWeekByClient.get(c.id) ?? 0,
        totalContentPosted: contentAllTimeByClient.get(c.id) ?? 0,
        // Ext. visits — backed by portal_visits. 0 until portal-side
        // instrumentation lands.
        extVisitsLast7d: extVisitsByClient.get(c.id) ?? 0,
        healthTone: healthToneFor(t.overdue),
        is_whitelisted: c.is_whitelisted ?? false,
        kolDelivery: delivery
          ? {
              week_number: delivery.week_number,
              approved: delivery.approved,
              total: delivery.total,
              rows: delivery.rows,
            }
          : { week_number: null, approved: 0, total: 0, rows: [] },
      };
    });

    const callNotes = flatCallNotes.slice(0, 10).map(n => {
      const meta = clientMetaById.get(n.client_id);
      return {
        ...n,
        client_name: meta?.name ?? null,
        client_logo_url: meta?.logo_url ?? null,
        client_renewal_tone: meta?.renewal_tone ?? 'unknown',
      };
    });

    const payload = {
      asOf: new Date().toISOString(),
      thresholds: cfg,
      outputSignals,
      clientHealth,
      callNotes,
      adHocClients,
    };

    cached = { value: payload, at: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load Client Success layer', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
