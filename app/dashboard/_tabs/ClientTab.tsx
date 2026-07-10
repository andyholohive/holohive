'use client';

/**
 * Layer 2 — Client Success. Renders the payload from
 * /api/dashboard/v2/client. "Are clients getting results?"
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KpiCard } from '@/components/ui/kpi-card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import {
  SectionHeaderSkeleton, KpiCardSkeleton, TableCardSkeleton, ListCardSkeleton,
} from './SkeletonHelpers';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Users, FileText, AlertCircle, MessageCircle, Tag, Activity, Megaphone, ExternalLink, Send, CheckCircle2, Link2, ChevronDown, ChevronRight, Clock, Circle } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChatThreadPicker } from '@/components/telegram/ChatThreadPicker';

/**
 * v11 (matches the revamp mockup exactly): client avatar = logo image
 * when available, otherwise a colored letter tile. Color of the fallback
 * tile is driven by **renewal tone** (not a hash), so the avatar visually
 * encodes the client's state — same pattern as the mockup:
 *   Active / green   → brand-soft
 *   Amber soon       → amber-50
 *   Red critical     → rose-50
 *   No end date      → sky-50 (treated as "onboarding-style" neutral)
 */
const STATUS_TILE: Record<RenewalTone | 'unknown', string> = {
  green:   'bg-brand-soft text-brand-deep',
  amber:   'bg-amber-50  text-amber-700',
  red:     'bg-rose-50   text-rose-700',
  unknown: 'bg-sky-50    text-sky-700',
};

function ClientLogoTile({ row }: { row: ClientHealthRow }) {
  const tone = row.renewal_days_left === null ? 'unknown' : row.renewal_tone;
  const letter = (row.name || '?').trim().charAt(0).toUpperCase();
  if (row.logo_url) {
    return (
      <div className="w-7 h-7 rounded-md overflow-hidden border border-cream-200 shrink-0 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.logo_url} alt={`${row.name} logo`} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0 ${STATUS_TILE[tone]}`}>
      {letter}
    </div>
  );
}

type RenewalTone = 'red' | 'amber' | 'green';

type HealthTone = 'green' | 'amber' | 'red';

type ClientHealthRow = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  engagement_start_date: string | null;
  engagement_end_date: string | null;
  weekNumber: number | null;
  renewal_tone: RenewalTone;
  renewal_days_left: number | null;
  openTasks: number;
  overdueTasks: number;
  completedThisWeek: number;
  contentPostedThisWeek: number;
  totalContentPosted: number;
  extVisitsLast7d: number;
  healthTone: HealthTone;
  // [2026-07-10] TG Comment Sentiment v3 — FUD spike in the last 14 days
  // (>=15% of scored comments or 5+ on one post; thresholds per Jdot).
  fudAlert?: boolean;
  // [2026-07-06] Coverage-aware engagement status matching the Clients
  // page (active = covered today, paused = coverage lapsed).
  status: 'active' | 'paused';
  is_whitelisted: boolean;
  // [2026-06-25] This-week KOL delivery roll-up. Populated from the
  // current week's confirmed lineup per active campaign, joined to
  // /submit (content_submissions). See lib/clientDeliveryService.ts.
  kolDelivery: {
    week_number: number | null;
    approved: number;
    total: number;
    rows: Array<{
      kol_id: string;
      name: string;
      campaign_id: string;
      campaign_name: string;
      status: 'approved' | 'in_qa' | 'not_submitted';
    }>;
  };
};

type ActionItemDto = {
  id: string;
  text: string;
  owner: string;
  ownerSide: 'hh' | 'client';
  done: boolean;
};

type CallNote = {
  id: string;
  client_id: string;
  client_name: string | null;
  client_logo_url: string | null;
  client_renewal_tone: RenewalTone | 'unknown';
  title: string | null;
  content: string | null;
  meeting_date: string | null;
  attendees: string | null;
  sent_to_client_tg_at: string | null;
  openHhActionItems: number;
  actionItems: ActionItemDto[];
};

type OutputSignals = {
  contentPostedLast7d: number;
  activeCampaigns: number;
  activationsLive: { count: number; names: string[] };
  totalExtVisitsLast7d: number;
};

type ClientPayload = {
  asOf: string;
  thresholds: { renewal_red_days: number; renewal_amber_days: number };
  outputSignals: OutputSignals;
  clientHealth: ClientHealthRow[];
  pausedExcludedCount: number;
  callNotes: CallNote[];
  adHocClients: Array<{ id: string; name: string; slug: string | null }>;
};

// Health tone labels + badge tone mapping per spec § 4.2.
const HEALTH_LABEL: Record<HealthTone, string> = {
  green: 'Healthy',
  amber: 'Needs attention',
  red:   'At risk',
};
const HEALTH_TO_BADGE: Record<HealthTone, BadgeTone> = {
  green: 'success',
  amber: 'warning',
  red:   'danger',
};

const renewalTone: Record<RenewalTone, BadgeTone> = {
  red: 'danger',
  amber: 'warning',
  green: 'success',
};

const renewalLabel = (row: ClientHealthRow): string => {
  if (row.renewal_days_left === null) return 'No end date';
  if (row.renewal_days_left < 0) return `${Math.abs(row.renewal_days_left)}d overdue`;
  return `${row.renewal_days_left}d`;
};

// [2026-06-25] FragmentRow renders the main client row AND its
// expanded KOL roll-up sub-rows. Lives outside the parent component
// so it has its own render scope; the parent supplies expansion state
// + toggler.
function FragmentRow({
  client,
  isExpanded,
  hasDelivery,
  onToggle,
}: {
  client: ClientHealthRow;
  isExpanded: boolean;
  hasDelivery: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow
        className="border-cream-100 row-accent cursor-pointer"
        onClick={onToggle}
      >
        <TableCell className="py-3.5 px-2 align-middle">
          {hasDelivery ? (
            isExpanded
              ? <ChevronDown className="h-4 w-4 text-ink-warm-400" />
              : <ChevronRight className="h-4 w-4 text-ink-warm-400" />
          ) : null}
        </TableCell>
        <TableCell className="py-3.5 px-5">
          <Link
            href={`/clients?clientId=${client.id}`}
            className="group flex items-center gap-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <ClientLogoTile row={client} />
            <div className="min-w-0">
              <div className="font-medium text-ink-warm-900 group-hover:text-brand transition-colors truncate">
                {client.name}
              </div>
            </div>
            {client.is_whitelisted && (
              <span className="ml-1 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold shrink-0">whitelisted</span>
            )}
          </Link>
          {/* [2026-07-06] Paused chip matching the Clients page — coverage
              has lapsed (renewal pending), so it isn't counted as Active. */}
          {client.status === 'paused' && (
            <StatusBadge tone="warning" size="sm" className="mt-1">Paused</StatusBadge>
          )}
          {/* [2026-07-10] Sentiment v3 client-layer alert — trust/security
              concerns spiking in the client's TG comment sections; needs a
              faster response than ordinary criticism. Details live in the
              campaign Overview sentiment module. */}
          {client.fudAlert && (
            <StatusBadge tone="danger" size="sm" className="mt-1">FUD spike</StatusBadge>
          )}
        </TableCell>
        <TableCell className="py-3.5 px-5 text-ink-warm-700 tabular-nums">
          {client.weekNumber !== null ? `Wk ${client.weekNumber}` : '—'}
        </TableCell>
        <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">{client.openTasks}</TableCell>
        <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">{client.totalContentPosted}</TableCell>
        <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">
          {client.extVisitsLast7d}
        </TableCell>
        <TableCell className="py-3.5 px-5">
          <StatusBadge tone={HEALTH_TO_BADGE[client.healthTone]} size="sm" bordered withDot>
            {HEALTH_LABEL[client.healthTone]}
          </StatusBadge>
        </TableCell>
        {/* [2026-07-10] KOL delivery roll-up promoted from the expanded
            sub-row header to its own column right of Health, so the
            approved/total ratio is scannable without expanding rows. */}
        <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">
          {client.kolDelivery.total > 0
            ? `${client.kolDelivery.approved}/${client.kolDelivery.total}`
            : <span className="text-ink-warm-300">—</span>}
        </TableCell>
      </TableRow>

      {/* ── Expanded KOL roll-up sub-row ────────────────────────────── */}
      {isExpanded && hasDelivery && (
        <TableRow className="bg-cream-50/40 hover:bg-cream-50/40 border-cream-100">
          <TableCell colSpan={8} className="py-0 px-5">
            <div className="py-3">
              {/* [2026-07-10] approved/total counter moved up into the main
                  row's Approved column (next to Health) — no dup here. */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.18em]">
                  KOL Delivery · This week
                  <span className="ml-2 text-ink-warm-400 normal-case font-normal tracking-normal">from /submit</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {client.kolDelivery.rows.map((row) => (
                  <KolDeliveryRowLine key={`${row.campaign_id}:${row.kol_id}`} row={row} />
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

const KOL_STATUS_LABEL: Record<'approved' | 'in_qa' | 'not_submitted', string> = {
  approved: 'Approved',
  in_qa: 'In QA',
  not_submitted: 'Not submitted',
};

const KOL_STATUS_TONE: Record<'approved' | 'in_qa' | 'not_submitted', BadgeTone> = {
  approved: 'success',
  in_qa: 'warning',
  not_submitted: 'neutral',
};

function KolDeliveryRowLine({ row }: { row: ClientHealthRow['kolDelivery']['rows'][number] }) {
  const Icon = row.status === 'approved' ? CheckCircle2 : row.status === 'in_qa' ? Clock : Circle;
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-cream-100/60 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`h-3 w-3 flex-shrink-0 ${row.status === 'approved' ? 'text-emerald-500' : row.status === 'in_qa' ? 'text-amber-500' : 'text-ink-warm-300'}`} />
        <span className="text-sm text-ink-warm-800 truncate">{row.name}</span>
      </div>
      <StatusBadge tone={KOL_STATUS_TONE[row.status]} size="sm" bordered={row.status === 'approved' || row.status === 'in_qa'}>
        {KOL_STATUS_LABEL[row.status]}
      </StatusBadge>
    </div>
  );
}

export default function ClientTab() {
  const [data, setData] = useState<ClientPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // [2026-06-25] Expanded client IDs for the KOL delivery roll-up.
  // Per Andy's mockup: rows expand to a roster of this-week's KOLs +
  // their /submit status. Click anywhere on the row to toggle.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  useEffect(() => {
    let cancelled = false;
    // [2026-06-16] Pass ?fresh=1 to bypass the 60s server cache on
    // initial load + when the window regains focus. Without this, call
    // notes saved in another tab (e.g. /clients Edit Portal modal)
    // don't appear here until the TTL expires.
    const fetchClientData = async (fresh: boolean) => {
      try {
        const qs = fresh ? '?fresh=1' : '';
        const res = await fetch(`/api/dashboard/v2/client${qs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchClientData(true);
    const onFocus = () => { void fetchClientData(true); };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (loading) return <ClientTabSkeleton />;
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load Client Success"
        description={error}
      />
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* ── 01 Output Signals ──────────────────────────────────────── */}
      {/* [2026-06-11] Per spec § 4.1 — 4 KPI cards at the top of Layer 2
          aggregating across all standard clients. Activations live
          subtitle lists the names when present so users see WHICH
          activations are running, not just the count. */}
      <div className="space-y-4">
        <SectionHeader label="Output Signals" dot="emerald" counter="01 — This week · live counts" first />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={FileText}
            label="Content Posted"
            value={data.outputSignals.contentPostedLast7d}
            sub="across active clients"
            accent="brand"
            topAccent
          />
          <KpiCard
            icon={Megaphone}
            label="Active Campaigns"
            value={data.outputSignals.activeCampaigns}
            sub="status = Active"
            accent="sky"
            topAccent
          />
          <KpiCard
            icon={Activity}
            label="Activations Live"
            value={data.outputSignals.activationsLive.count}
            sub={data.outputSignals.activationsLive.names.length > 0
              ? data.outputSignals.activationsLive.names.slice(0, 3).join(', ') + (data.outputSignals.activationsLive.names.length > 3 ? ` +${data.outputSignals.activationsLive.names.length - 3}` : '')
              : 'None active'}
            accent="purple"
            topAccent
          />
          {/* [2026-07-10] Live: portal_visits now populated by
              /api/portal/log-access on every client portal visit —
              subtitle dropped the old "TBD · portal analytics". */}
          <KpiCard
            icon={ExternalLink}
            label="Ext. Visits"
            value={data.outputSignals.totalExtVisitsLast7d}
            sub="This week · external portal visits"
            accent="amber"
            topAccent
          />
        </div>
      </div>

      {/* ── 02 Health ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Client Health" dot="brand" counter="02 — Delivery only · This week" />

      {/* Client Health table — post-2026-06-25 redesign:
          Client | Week | HQ Tasks | Content | Visits | Health | Approved.
          Renewal column moved to the dedicated Renewals & Pipeline tab
          (single source of renewal math). Rows expand to show this week's
          KOL roster from confirmed lineups + /submit status; the
          approved/total roll-up sits in the Approved column (2026-07-10). */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Users}
          title="Client Health"
          subtitle={(() => {
            // [2026-07-06] Active-only table. Paused + ad-hoc clients are
            // excluded; the counts are noted so the omission is explicit.
            const active = data.clientHealth.length;
            const excluded: string[] = [];
            if (data.pausedExcludedCount > 0) excluded.push(`${data.pausedExcludedCount} paused`);
            if (data.adHocClients.length > 0) excluded.push(`${data.adHocClients.length} ad-hoc`);
            const parts = [`${active} active`];
            if (excluded.length > 0) parts.push(`${excluded.join(' + ')} excluded`);
            return parts.join(' · ');
          })()}
        />

        {data.clientHealth.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title="No standard clients"
              description="Activate a client to see them here."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-8" />
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Client</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Week</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">HQ Tasks</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Content</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Visits</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Health</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clientHealth.map(c => {
                const isExpanded = expandedIds.has(c.id);
                const hasDelivery = c.kolDelivery.total > 0;
                return (
                  <FragmentRow
                    key={c.id}
                    client={c}
                    isExpanded={isExpanded}
                    hasDelivery={hasDelivery}
                    onToggle={() => toggleExpanded(c.id)}
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      </div>

      {/* ── 03 Conversations ───────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Conversations" dot="sky" counter="03 — Call notes · Ad-hoc clients" />

      {/* Call notes + ad-hoc clients side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={MessageCircle}
            iconClassName="text-sky-500"
            title="Recent Call Notes"
            subtitle={`${data.callNotes.length} logged`}
          />

          {data.callNotes.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={MessageCircle}
                title="No recent call notes"
                description="Log a meeting on a client to see it here."
              />
            </div>
          ) : (
            // [2026-06-11] Per-call-note rich cards matching the mockup:
            // client name + sync date in the header, "Sent to client TG"
            // status badge in the corner, bulleted content takeaways,
            // and inline action items with checkboxes + owner pills.
            <div className="p-4 space-y-3">
              {data.callNotes.map(n => (
                <CallNoteCard key={n.id} note={n} />
              ))}
            </div>
          )}
        </Card>

        <Card className="border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={Tag}
            iconClassName="text-purple-500"
            title="Ad-Hoc Clients"
            subtitle="Excluded from rollups"
          />

          {data.adHocClients.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Tag}
                title="None"
                description="No ad-hoc engagements."
              />
            </div>
          ) : (
            <ul className="divide-y divide-cream-100">
              {data.adHocClients.map(c => (
                <li key={c.id} className="px-4 py-3 flex items-center justify-between">
                  <Link
                    href={`/clients?clientId=${c.id}`}
                    className="text-sm font-medium text-ink-warm-900 hover:text-brand transition-colors"
                  >
                    {c.name}
                  </Link>
                  <StatusBadge tone="purple" size="sm" bordered withDot>Ad-hoc</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      </div>
    </div>
  );
}

function ClientTabSkeleton() {
  return (
    <div className="space-y-8">
      {/* ── 01 Output Signals ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton first />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
        </div>
      </div>
      {/* ── 02 Engagements ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton />
        <TableCardSkeleton rows={5} cols={7} />
      </div>
      {/* ── 03 Conversations ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><ListCardSkeleton rows={4} /></div>
          <ListCardSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}

/**
 * Rich call-note card for the Conversations section. Matches the
 * mockup: client name + sync date header, "Sent to client TG" badge
 * in the corner, bulleted takeaways from the note's content, and
 * inline action items with checkboxes + owner pills. The Send-to-TG
 * button calls /api/clients/.../send-tg and the badge flips on success.
 *
 * Optimistic-toggles done items on click — the backend write happens
 * via the existing meeting-action-items API; rollback on failure.
 */
function CallNoteCard({ note }: { note: CallNote }) {
  const [sentAt, setSentAt] = useState<string | null>(note.sent_to_client_tg_at);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // [2026-06-16] Inline "Link TG chat" affordance — when the send fails
  // with "no chat configured," we surface a Dialog with ChatThreadPicker
  // so the user can link a chat without leaving the dashboard. Saving
  // auto-retries the send.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkChatId, setLinkChatId] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const isMissingChat = !!error && /telegram_chat_id|No telegram_chat_id|No chat configured/i.test(error);

  // [2026-06-16] Local copy of action items so we can toggle is_done
  // optimistically. Reverts on persist failure. Same UX as the
  // CallNotesTab modal's inline toggle, backed by a dedicated endpoint
  // because the dashboard reads through /api/dashboard/v2/client (no
  // direct Supabase JS handle).
  const [items, setItems] = useState<ActionItemDto[]>(note.actionItems);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  async function toggleItem(itemId: string) {
    const target = items.find(i => i.id === itemId);
    if (!target) return;
    const next = !target.done;
    // Optimistic update + lock the row while the write is in flight.
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, done: next } : i));
    setTogglingIds(prev => { const s = new Set(prev); s.add(itemId); return s; });
    try {
      const res = await fetch(
        `/api/clients/${note.client_id}/meeting-notes/${note.id}/toggle-action-item`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, is_done: next }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        // Roll back the optimistic toggle
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, done: !next } : i));
        setError(json.error || 'Toggle failed');
      }
    } catch (e: any) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, done: !next } : i));
      setError(e?.message || 'Network error');
    } finally {
      setTogglingIds(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  }

  const meetingDateFmt = note.meeting_date
    ? formatDate(note.meeting_date + 'T00:00:00')
    : '';

  // Split content into bullets — newline-separated, strip bullet
  // prefixes the human wrote in the textarea. Caps at the first 5 so
  // a verbose note doesn't push the action items below the fold.
  const bullets = (note.content || '')
    .split('\n')
    .map(l => l.replace(/^[-•*\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 5);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clients/${note.client_id}/meeting-notes/${note.id}/send-tg`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || 'Send failed');
        return;
      }
      setSentAt(json.sent_at);
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setSending(false);
    }
  }

  /** Save the picked chat ID, then retry the send so the operator
   *  doesn't have to click twice. */
  async function handleLinkSave() {
    if (!linkChatId.trim()) return;
    setLinkSaving(true);
    try {
      const res = await fetch(
        `/api/clients/${note.client_id}/telegram-chat-id`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: linkChatId.trim() }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || 'Failed to link chat');
        return;
      }
      setLinkOpen(false);
      setError(null);
      await handleSend();
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLinkSaving(false);
    }
  }

  // Logo tile reuses the same renewal-tone fallback palette as the
  // Client Health table so the visual language matches across cards.
  const tone = note.client_renewal_tone || 'unknown';
  const letter = (note.client_name || '?').trim().charAt(0).toUpperCase();
  // Subtle left rail tinted by renewal tone — gives a quick at-a-glance
  // signal without adding another badge.
  const RAIL_TONE: Record<string, string> = {
    green: 'bg-brand/40',
    amber: 'bg-amber-300',
    red:   'bg-rose-300',
    unknown: 'bg-cream-200',
  };

  return (
    <div className="relative bg-white border border-cream-200 rounded-lg overflow-hidden hover:border-cream-300 hover:shadow-sm transition-all">
      {/* Renewal-tone rail */}
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${RAIL_TONE[tone] || RAIL_TONE.unknown}`} />

      <div className="p-3.5 pl-4">
        {/* Header — logo + client + date + send status */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {note.client_logo_url ? (
              <div className="w-8 h-8 rounded-md overflow-hidden border border-cream-200 shrink-0 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={note.client_logo_url} alt={`${note.client_name} logo`} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold shrink-0 ${STATUS_TILE[tone]}`}>
                {letter}
              </div>
            )}
            <div className="min-w-0">
              <Link
                href={`/clients?clientId=${note.client_id}`}
                className="text-sm font-semibold text-ink-warm-900 hover:text-brand transition-colors block leading-tight"
              >
                {note.client_name || 'Client'}
              </Link>
              {meetingDateFmt && (
                <span className="text-[11px] text-ink-warm-500 leading-tight">
                  Sync · {meetingDateFmt}
                </span>
              )}
            </div>
          </div>
          {sentAt ? (
            <StatusBadge tone="success" size="sm" bordered>
              <CheckCircle2 className="h-3 w-3 mr-1" />Sent to TG
            </StatusBadge>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-cream-300 bg-cream-50 text-ink-warm-700 hover:bg-cream-100 transition-colors focus-brand disabled:opacity-60 shrink-0"
              title="Push summary + open action items to the client's Telegram group"
            >
              <Send className="h-3 w-3" />
              {sending ? 'Sending…' : 'Send to TG'}
            </button>
          )}
        </div>

        {/* Bulleted takeaways from the note content */}
        {bullets.length > 0 && (
          <ul className="space-y-1 mb-2">
            {bullets.map((b, i) => (
              <li key={i} className="text-xs text-ink-warm-700 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-ink-warm-400">
                {b}
              </li>
            ))}
          </ul>
        )}

        {/* Inline action items */}
        {items.length > 0 && (
          <div className="border-t border-cream-100 mt-2.5 pt-2">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-500 mb-1.5">
              Action items
            </p>
            <ul className="space-y-1.5">
              {items.map(it => (
                <li key={it.id} className="flex items-center gap-2 text-xs min-h-[20px]">
                  <Checkbox
                    checked={it.done}
                    onCheckedChange={() => toggleItem(it.id)}
                    disabled={togglingIds.has(it.id)}
                    aria-label={it.done ? `Mark "${it.text}" not done` : `Mark "${it.text}" done`}
                    className="shrink-0 self-center"
                  />
                  <span className={`leading-tight ${it.done ? 'line-through text-ink-warm-400' : 'text-ink-warm-700'}`}>
                    {it.text}
                  </span>
                  <span className="ml-auto text-[10px] leading-none px-1.5 py-0.5 rounded bg-cream-100 text-ink-warm-700 border border-cream-200 shrink-0 self-center">
                    {it.owner}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          isMissingChat ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50/60 px-2.5 py-1.5">
              <span className="text-[11px] text-amber-800 leading-tight">
                No Telegram chat linked for this client.
              </span>
              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 transition-colors focus-brand shrink-0"
              >
                <Link2 className="h-3 w-3" />
                Link chat
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-rose-600 mt-2">{error}</p>
          )
        )}
      </div>

      {/* Link TG chat dialog — same picker UX as /admin/telegram-comm */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="!bg-white sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Link Telegram chat to {note.client_name || 'client'}</DialogTitle>
            <DialogDescription>
              Pick the client's Telegram group so the bot knows where to post call notes. Saves to the client's context — only needs to be done once.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <ChatThreadPicker
              chatId={linkChatId}
              threadId=""
              onChange={({ chatId }) => setLinkChatId(chatId)}
              label="Telegram chat"
              showManualThreadInput={false}
              disabled={linkSaving}
            />
            <p className="text-[11px] text-ink-warm-500 mt-2">
              Bot must already be a member of the chat. Threads aren't required — call notes post in the chat's General topic.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkOpen(false)} disabled={linkSaving}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleLinkSave} disabled={linkSaving || !linkChatId.trim()}>
              {linkSaving ? 'Linking…' : 'Link + Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
