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
import { Users, FileText, AlertCircle, MessageCircle, Tag, Activity, Megaphone, ExternalLink, Send, CheckCircle2 } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

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
  is_whitelisted: boolean;
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

export default function ClientTab() {
  const [data, setData] = useState<ClientPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <SectionHeader label="Output Signals" dot="emerald" counter="01 — Last 7 days · live counts" first />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={FileText}
            label="Content Posted (7d)"
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
          <KpiCard
            icon={ExternalLink}
            label="Ext. Visits (7d)"
            value={data.outputSignals.totalExtVisitsLast7d}
            sub="TBD · portal analytics"
            accent="amber"
            topAccent
          />
        </div>
      </div>

      {/* ── 02 Health ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Engagements" dot="brand" counter="02 — Client health · Renewal · Health tone" />

      {/* Client Health table — columns now match spec § 4.2:
          Client | Week | HQ Tasks | Content Posted | Ext. Visits (7d) | Renewal | Health
          (Was: Client | Open | Overdue | Done wk | Posted wk | Renewal.
          The Overdue column collapsed into the Health tone column.) */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Users}
          title="Client Health"
          subtitle={`${data.clientHealth.length} standard engagement${data.clientHealth.length === 1 ? '' : 's'}${data.adHocClients.length > 0 ? ` · ${data.adHocClients.length} ad-hoc excluded` : ''}`}
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
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Client</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Week</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">HQ Tasks</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Content Posted</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Ext. Visits</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Renewal</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clientHealth.map(c => (
                <TableRow key={c.id} className="border-cream-100 row-accent cursor-pointer">
                  <TableCell className="py-3.5 px-5">
                    <Link href={`/clients/${c.id}`} className="group flex items-center gap-2.5">
                      <ClientLogoTile row={c} />
                      <div className="min-w-0">
                        <div className="font-medium text-ink-warm-900 group-hover:text-brand transition-colors truncate">
                          {c.name}
                        </div>
                      </div>
                      {c.is_whitelisted && (
                        <span className="ml-1 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold shrink-0">whitelisted</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-ink-warm-700 tabular-nums">
                    {c.weekNumber !== null ? `Wk ${c.weekNumber}` : '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">{c.openTasks}</TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">{c.totalContentPosted}</TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-500" title="Portal analytics not yet wired — see API header comment.">
                    {c.extVisitsLast7d}
                  </TableCell>
                  <TableCell className="py-3.5 px-5">
                    <StatusBadge tone={renewalTone[c.renewal_tone]} size="sm" bordered withDot={c.renewal_tone === 'red' ? 'pulse' : true}>
                      {renewalLabel(c)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="py-3.5 px-5">
                    <StatusBadge tone={HEALTH_TO_BADGE[c.healthTone]} size="sm" bordered withDot>
                      {HEALTH_LABEL[c.healthTone]}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
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
                    href={`/clients/${c.id}`}
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

  return (
    <div className="bg-white border border-cream-200 rounded-lg p-3.5">
      {/* Header row — client + date + send status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <Link
            href={`/clients/${note.client_id}`}
            className="text-sm font-semibold text-ink-warm-900 hover:text-brand transition-colors"
          >
            {note.client_name || 'Client'}
          </Link>
          {meetingDateFmt && (
            <span className="text-xs text-ink-warm-500 ml-2">Sync — {meetingDateFmt}</span>
          )}
        </div>
        {sentAt ? (
          <StatusBadge tone="success" size="sm" bordered>
            <CheckCircle2 className="h-3 w-3 mr-1" />Sent to client TG
          </StatusBadge>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-cream-300 bg-cream-50 text-ink-warm-700 hover:bg-cream-100 transition-colors focus-brand disabled:opacity-60"
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
      {note.actionItems.length > 0 && (
        <div className="border-t border-cream-100 mt-2 pt-2">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-500 mb-1.5">
            Action items
          </p>
          <ul className="space-y-1">
            {note.actionItems.map(it => (
              <li key={it.id} className="flex items-center gap-2 text-xs">
                <span className={`inline-flex w-3.5 h-3.5 rounded-sm border items-center justify-center shrink-0 ${
                  it.done
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-amber-400'
                }`}>
                  {it.done && <CheckCircle2 className="h-2.5 w-2.5" />}
                </span>
                <span className={it.done ? 'line-through text-ink-warm-400' : 'text-ink-warm-700'}>
                  {it.text}
                </span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-ink-warm-700 border border-cream-200 shrink-0">
                  {it.owner}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-rose-600 mt-2">{error}</p>
      )}
    </div>
  );
}
