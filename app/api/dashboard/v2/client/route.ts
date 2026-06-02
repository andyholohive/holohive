/**
 * GET /api/dashboard/v2/client — Layer 2: Client Success
 *
 * Answers "are clients getting results?" Returns:
 *   - clientHealth: per-standard-client row with engagement context,
 *     open/overdue task counts, content posted this week, and the
 *     renewal tone (red < 14d / amber < 30d / green).
 *   - callNotes: recent client_meeting_notes (last 10 across all
 *     standard clients) with open action_items count.
 *   - adHocClients: side-list of ad-hoc clients so they're visible
 *     but explicitly NOT in the rollups above.
 *
 * Ad-hoc clients (Impossible, Robonet) are EXCLUDED from clientHealth.
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
        clientHealth: [],
        callNotes: [],
        adHocClients,
      };
      cached = { value: empty, at: Date.now() };
      return NextResponse.json(empty);
    }

    const [tasksRes, contentsRes, meetingNotesRes, actionItemsRes] = await Promise.all([
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
      // Recent meeting notes across standard clients
      (sb as any)
        .from('client_meeting_notes')
        .select('id, client_id, title, meeting_date, attendees, created_at')
        .in('client_id', standardClientIds)
        .order('meeting_date', { ascending: false })
        .limit(10),
      // Open action items per client (Layer 1 also touches; here we want per-client count)
      (sb as any)
        .from('meeting_action_items')
        .select('id, meeting_note_id, owner_client_side, is_done')
        .eq('is_done', false),
    ]);

    const tasks = (tasksRes.data ?? []) as any[];
    const contents = (contentsRes.data ?? []) as any[];
    const notes = (meetingNotesRes.data ?? []) as any[];
    const actionItems = (actionItemsRes.data ?? []) as any[];

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

    // Per-client content posted-this-week count
    const contentByClient = new Map<string, number>();
    for (const c of contents) {
      contentByClient.set(c.client_id, (contentByClient.get(c.client_id) ?? 0) + 1);
    }

    // Per-meeting open action item count (will roll up below)
    const actionItemsByMeeting = new Map<string, number>();
    for (const ai of actionItems) {
      if (ai.owner_client_side) continue; // HH-side only here
      actionItemsByMeeting.set(ai.meeting_note_id, (actionItemsByMeeting.get(ai.meeting_note_id) ?? 0) + 1);
    }

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
        renewal_tone: renewal.tone,
        renewal_days_left: renewal.daysLeft,
        openTasks: t.open,
        overdueTasks: t.overdue,
        completedThisWeek: t.doneThisWeek,
        contentPostedThisWeek: contentByClient.get(c.id) ?? 0,
        is_whitelisted: c.is_whitelisted ?? false,
      };
    });

    const callNotes = notes.map(n => ({
      id: n.id,
      client_id: n.client_id,
      title: n.title,
      meeting_date: n.meeting_date,
      attendees: n.attendees,
      openHhActionItems: actionItemsByMeeting.get(n.id) ?? 0,
    }));

    const payload = {
      asOf: new Date().toISOString(),
      thresholds: cfg,
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
