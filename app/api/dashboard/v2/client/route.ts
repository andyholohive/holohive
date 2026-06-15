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
 * Ext. visits caveat (2026-06-11): the portal analytics table doesn't
 * exist yet (no `page_views` / `portal_visits`). Both the KPI and the
 * per-client column return 0 with a sub-note flagging "TBD" until the
 * analytics layer ships. The structure matches Jdot's spec so wiring
 * the real data is a one-query swap when the table lands.
 */

import { NextResponse } from 'next/server';
import { adminSupabase, getStandardClients, getAdHocClients, renewalToneFor, overdueToneFor } from '@/lib/dashboard/queries';
import { getDashboardConfig } from '@/lib/dashboard/config';

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

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
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

    const [tasksRes, contentsThisWeekRes, contentsAllTimeRes, campaignsRes, meetingNotesRes] = await Promise.all([
      // Open tasks linked to standard clients
      (sb as any)
        .from('tasks')
        .select('id, client_id, status, due_date, completed_at')
        .in('client_id', standardClientIds),
      // Content posted this week per standard client
      (sb as any)
        .from('contents')
        .select('id, client_id, status, activation_date')
        .in('client_id', standardClientIds)
        .eq('status', 'posted')
        .gte('activation_date', weekStartIso.slice(0, 10)),
      // [2026-06-11] All-time content posted per client — drives spec § 4.2's
      // "Content Posted" column (total count, not just this week).
      (sb as any)
        .from('contents')
        .select('id, client_id')
        .in('client_id', standardClientIds)
        .eq('status', 'posted'),
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
      (sb as any)
        .from('client_context')
        .select('client_id, call_notes')
        .in('client_id', standardClientIds),
    ]);

    const tasks = (tasksRes.data ?? []) as any[];
    const contentsThisWeek = (contentsThisWeekRes.data ?? []) as any[];
    const contentsAllTime = (contentsAllTimeRes.data ?? []) as any[];
    const activeCampaigns = (campaignsRes.data ?? []) as any[];
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

    // Per-client content posted-this-week + all-time counts
    const contentThisWeekByClient = new Map<string, number>();
    for (const c of contentsThisWeek) {
      contentThisWeekByClient.set(c.client_id, (contentThisWeekByClient.get(c.client_id) ?? 0) + 1);
    }
    const contentAllTimeByClient = new Map<string, number>();
    for (const c of contentsAllTime) {
      contentAllTimeByClient.set(c.client_id, (contentAllTimeByClient.get(c.client_id) ?? 0) + 1);
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
      // Ext. visits placeholder — see route header comment. Returns 0
      // until the portal analytics table ships. Subtitle in the UI
      // surfaces this as "TBD" so users don't read 0 as healthy.
      totalExtVisitsLast7d: 0,
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

    // Client name lookup so the call note card can render the client
    // header without a per-row join in the UI.
    const clientNameById = new Map<string, string>();
    for (const c of standardClients) clientNameById.set(c.id, c.name);

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

    // Build client health rows
    const clientHealth = standardClients.map(c => {
      const t = taskAgg.get(c.id) ?? { open: 0, overdue: 0, doneThisWeek: 0 };
      const renewal = renewalToneFor(c.engagement_end_date, cfg.renewal_red_days, cfg.renewal_amber_days);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        engagement_start_date: c.engagement_start_date,
        engagement_end_date: c.engagement_end_date,
        weekNumber: weekNumberFor(c.engagement_start_date),
        renewal_tone: renewal.tone,
        renewal_days_left: renewal.daysLeft,
        openTasks: t.open,
        overdueTasks: t.overdue,
        completedThisWeek: t.doneThisWeek,
        contentPostedThisWeek: contentThisWeekByClient.get(c.id) ?? 0,
        totalContentPosted: contentAllTimeByClient.get(c.id) ?? 0,
        // Ext. visits placeholder — wired when portal analytics ships.
        extVisitsLast7d: 0,
        healthTone: healthToneFor(t.overdue),
        is_whitelisted: c.is_whitelisted ?? false,
      };
    });

    const callNotes = flatCallNotes.slice(0, 10).map(n => ({
      ...n,
      client_name: clientNameById.get(n.client_id) ?? null,
    }));

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
