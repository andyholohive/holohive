/**
 * Needs attention — the cross-client to-do list behind /attention.
 *
 * One read of everything that is late, about to be late, or waiting on
 * someone, across every active client. Each item says what, why, and where
 * to go fix it. Read-only: nothing here writes.
 *
 * Sources and rules:
 *  - Engagement end: the client's term (client_coverage.covered_through,
 *    else the latest stint end). Ended or within 7 days = urgent, within
 *    21 = soon.
 *  - Weekly lineup: only for campaigns that ran a lineup in the last 3
 *    weeks (a campaign that never uses lineups isn't "missing" one). No
 *    lineup past the Tuesday deadline = urgent, before it = soon, still a
 *    draft = soon. Slots missed last week = soon.
 *  - Delivery-log drafts (client_delivery_log.pending_review) = soon.
 *  - Korea Signal weekly reports awaiting approval, from the last 8 days = soon.
 *  - Momentum (loadMomentumAlerts, fetched separately because it loads every
 *    client's dashboard): down 15+ points in 3 weeks, or under 35 = soon.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate } from '@/lib/dateFormat';
import { lineupSetupDeadline, deadlineLabel, addWeeks } from '@/lib/lineupDeadline';
import { loadClientDashboard } from '@/lib/clientDashboard';
import { computeMomentum } from '@/lib/clientMomentum';

export type AttentionSeverity = 'urgent' | 'soon' | 'fyi';
export type AttentionKind = 'engagement' | 'lineup' | 'slots' | 'delivery' | 'report' | 'momentum';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  kind: AttentionKind;
  clientId: string;
  clientName: string;
  logoUrl: string | null;
  title: string;
  detail: string;
  href: string;
  hrefLabel: string;
}

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const todayKst = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export async function loadAttention(db: SupabaseClient): Promise<AttentionItem[]> {
  const sb = db as any;
  const today = todayKst();
  const thisWeek = mondayOf(today);
  const lastWeek = addWeeks(thisWeek, -1);

  const { data: clientRows, error } = await sb.from('clients').select('id, name, logo_url').eq('is_active', true).is('archived_at', null);
  if (error) throw new Error(`clients read failed: ${error.message}`);
  const clients = new Map<string, { name: string; logoUrl: string | null }>(
    ((clientRows ?? []) as any[]).map((c) => [c.id, { name: c.name, logoUrl: c.logo_url ?? null }]),
  );
  const ids = [...clients.keys()];
  if (!ids.length) return [];

  const [{ data: stints }, { data: coverage }, { data: campaigns }, { data: drafts }, { data: krClients }] = await Promise.all([
    sb.from('client_stints').select('client_id, end_date').in('client_id', ids),
    sb.from('client_coverage').select('client_id, covered_through').in('client_id', ids),
    sb.from('campaigns').select('id, name, client_id, is_test').in('client_id', ids).is('archived_at', null),
    sb.from('client_delivery_log').select('client_id, created_at').in('client_id', ids).eq('pending_review', true),
    sb.from('kr_signal_clients').select('id, client_id').in('client_id', ids),
  ]);

  const items: AttentionItem[] = [];
  const push = (clientId: string, it: Omit<AttentionItem, 'clientId' | 'clientName' | 'logoUrl'>) => {
    const c = clients.get(clientId);
    if (c) items.push({ ...it, clientId, clientName: c.name, logoUrl: c.logoUrl });
  };

  // ── Engagement end ─────────────────────────────────────────────────
  const termEnd = new Map<string, string>();
  for (const s of (stints ?? []) as any[]) {
    if (s.end_date && (!termEnd.has(s.client_id) || s.end_date > termEnd.get(s.client_id)!)) termEnd.set(s.client_id, s.end_date);
  }
  for (const c of (coverage ?? []) as any[]) if (c.covered_through) termEnd.set(c.client_id, c.covered_through);
  for (const [clientId, end] of termEnd) {
    const left = daysBetween(today, end);
    if (left > 21) continue;
    push(clientId, {
      id: `engagement:${clientId}`,
      severity: left <= 7 ? 'urgent' : 'soon',
      kind: 'engagement',
      title: left < 0 ? `Engagement ended ${formatDate(end)}` : left === 0 ? 'Engagement ends today' : `Engagement ends in ${plural(left, 'day')}`,
      detail: left < 0
        ? 'The client is still marked active. Renew the term or let it lapse.'
        : `Term runs to ${formatDate(end)}. Time for the renewal conversation.`,
      href: `/clients/${clientId}`,
      hrefLabel: 'Open dashboard',
    });
  }

  // ── Weekly lineups ─────────────────────────────────────────────────
  const camps = ((campaigns ?? []) as any[]).filter((c) => !c.is_test);
  if (camps.length) {
    const { data: lineups } = await sb.from('campaign_lineups')
      .select('id, campaign_id, week_number, week_of, status, lineup_angles(lineup_slots(status, master_kols(name)))')
      .in('campaign_id', camps.map((c) => c.id))
      .gte('week_of', addWeeks(thisWeek, -3)).lte('week_of', thisWeek);
    const byCamp = new Map<string, any[]>();
    for (const l of (lineups ?? []) as any[]) byCamp.set(l.campaign_id, [...(byCamp.get(l.campaign_id) ?? []), l]);
    const slotsOf = (l: any) => ((l.lineup_angles ?? []) as any[]).flatMap((a) => (a.lineup_slots ?? []) as any[]);

    for (const camp of camps) {
      const ls = byCamp.get(camp.id);
      if (!ls?.length) continue;
      // An engagement that ended before this week doesn't need this week's lineup.
      const end = termEnd.get(camp.client_id);
      const current = ls.find((l) => l.week_of === thisWeek);
      const prev = ls.find((l) => l.week_of === lastWeek);
      const lineupHref = `/campaigns/${camp.id}?tab=lineups`;

      if (!current && !(end && end < thisWeek)) {
        const past = Date.now() > lineupSetupDeadline(thisWeek).getTime();
        const weekNo = (ls.reduce((m, l) => Math.max(m, l.week_number), 0) || 0) + 1;
        push(camp.client_id, {
          id: `lineup:${camp.id}`,
          severity: past ? 'urgent' : 'soon',
          kind: 'lineup',
          title: past ? `No lineup for week ${weekNo}` : `Week ${weekNo} lineup due ${deadlineLabel(thisWeek)}`,
          detail: past
            ? `${camp.name}: the ${deadlineLabel(thisWeek)} deadline passed, so this week runs without one.`
            : `${camp.name}: set it up by the end of Tuesday, Korea time.`,
          href: lineupHref,
          hrefLabel: 'Open lineups',
        });
      } else if (current?.status === 'draft') {
        push(camp.client_id, {
          id: `lineup:${camp.id}`,
          severity: 'soon',
          kind: 'lineup',
          title: `Week ${current.week_number} lineup is still a draft`,
          detail: `${camp.name}: confirm it so the creators can post.`,
          href: lineupHref,
          hrefLabel: 'Open lineups',
        });
      } else if (current) {
        const slots = slotsOf(current);
        const posted = slots.filter((s) => s.status === 'posted').length;
        if (slots.length && posted < slots.length) {
          push(camp.client_id, {
            id: `progress:${camp.id}`,
            severity: 'fyi',
            kind: 'lineup',
            title: `Week ${current.week_number}: ${posted} of ${slots.length} posted`,
            detail: `${camp.name}: still due from ${slots.filter((s) => s.status === 'pending').map((s) => s.master_kols?.name ?? 'Unknown').join(', ') || 'no one'}.`,
            href: lineupHref,
            hrefLabel: 'Open lineups',
          });
        }
      }

      if (prev) {
        const missed = slotsOf(prev).filter((s) => s.status === 'missed');
        if (missed.length) {
          push(camp.client_id, {
            id: `missed:${camp.id}`,
            severity: 'soon',
            kind: 'slots',
            title: `${plural(missed.length, 'slot')} missed in week ${prev.week_number}`,
            detail: `${camp.name}: ${missed.map((s) => s.master_kols?.name ?? 'Unknown').join(', ')}.`,
            href: lineupHref,
            hrefLabel: 'Open lineups',
          });
        }
      }
    }
  }

  // ── Delivery-log drafts ────────────────────────────────────────────
  const draftsBy = new Map<string, { n: number; oldest: string }>();
  for (const d of (drafts ?? []) as any[]) {
    const v = draftsBy.get(d.client_id) ?? { n: 0, oldest: d.created_at };
    v.n++; if (d.created_at < v.oldest) v.oldest = d.created_at;
    draftsBy.set(d.client_id, v);
  }
  for (const [clientId, v] of draftsBy) {
    push(clientId, {
      id: `delivery:${clientId}`,
      severity: 'soon',
      kind: 'delivery',
      title: `${plural(v.n, 'delivery-log draft')} to review`,
      detail: `Oldest from ${formatDate(v.oldest)}. Confirm them so they show in the client's log.`,
      href: `/clients/${clientId}/delivery-log`,
      hrefLabel: 'Review drafts',
    });
  }

  // ── Korea Signal weekly reports awaiting approval ─────────────────
  const krToClient = new Map<string, string>(((krClients ?? []) as any[]).map((k) => [k.id, k.client_id]));
  if (krToClient.size) {
    const { data: reports } = await sb.from('kr_signal_client_weekly').select('client_id, week_ending')
      .in('client_id', [...krToClient.keys()]).eq('status', 'pending_review')
      .gte('week_ending', new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10));
    for (const r of (reports ?? []) as any[]) {
      const clientId = krToClient.get(r.client_id);
      if (!clientId) continue;
      push(clientId, {
        id: `report:${r.client_id}:${r.week_ending}`,
        severity: 'soon',
        kind: 'report',
        title: 'Korea Signal report awaiting approval',
        detail: `Week ending ${formatDate(r.week_ending)}. Approve it in the Korea Signal review chat before Sunday's send.`,
        href: `/clients/${clientId}`,
        hrefLabel: 'Open dashboard',
      });
    }
  }

  const order: Record<AttentionSeverity, number> = { urgent: 0, soon: 1, fyi: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity] || a.clientName.localeCompare(b.clientName));
}

/**
 * Momentum alerts — a client sliding before anyone notices. Separate from
 * loadAttention because it loads each active client's full dashboard (~2s
 * each, in parallel), so the page shows the main list first and adds these.
 */
export async function loadMomentumAlerts(db: SupabaseClient): Promise<AttentionItem[]> {
  const sb = db as any;
  const { data: clientRows } = await sb.from('clients').select('id, name, logo_url').eq('is_active', true).is('archived_at', null);
  const results = await Promise.all(((clientRows ?? []) as any[]).map(async (c) => {
    try {
      const d = await loadClientDashboard(db, c.id);
      if (!d || !d.totals) return null;
      const m = computeMomentum(d);
      if (!m) return null;
      const falling = m.change3w !== null && m.change3w <= -15;
      if (!falling && m.score >= 35) return null;
      const weakest = [...m.parts].sort((a, b) => a.score - b.score)[0];
      const item: AttentionItem = {
        id: `momentum:${c.id}`,
        severity: 'soon',
        kind: 'momentum',
        clientId: c.id, clientName: c.name, logoUrl: c.logo_url ?? null,
        title: falling ? `Momentum down ${Math.abs(m.change3w!)} points in 3 weeks` : `Momentum low at ${m.score}`,
        detail: `Now ${m.score}/100${weakest ? `, weakest on ${weakest.label.toLowerCase()} (${weakest.score})` : ''}.`,
        href: `/clients/${c.id}`,
        hrefLabel: 'Open dashboard',
      };
      return item;
    } catch {
      return null; // one client's bad data shouldn't sink the list
    }
  }));
  return results.filter((x): x is AttentionItem => x !== null);
}
