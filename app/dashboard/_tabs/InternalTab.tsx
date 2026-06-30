'use client';

/**
 * Layer 1 — Internal Success. Renders the payload from
 * /api/dashboard/v2/internal. "Are we executing?"
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime, formatRelativeShort } from '@/lib/dateFormat';
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
import {
  Users, ListTodo, AlertCircle, CheckCircle2, Flame, Compass, ClipboardCheck,
} from 'lucide-react';

type WorkloadRow = { id: string | null; name: string; photo: string | null; open: number; overdue: number; completed: number };
type OverdueTaskRow = {
  id: string;
  task_name: string;
  client_id: string | null;
  client_name: string | null;
  assignee_name: string | null;
  due_date: string | null;
  daysOverdue: number;
};
type Initiative = {
  id: string;
  name: string;
  owner_user_id: string | null;
  owner_name: string | null;
  category_tags: string[];
  daysIdle: number;
  updated_at: string | null;
  linkedTaskCount: number;
  tone: 'red' | 'amber' | 'fresh';
  /** Current uncompleted milestone (lowest sort_order) per TD §3.3.
   *  null when the initiative has no milestones or all are done. */
  currentGate: string | null;
};
type AdHocTask = {
  id: string;
  name: string;
  assignee: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  client_id: string | null;
};

type MondayFormEntry = {
  user_id: string;
  name: string;
  email: string | null;
  role: string | null;
  submitted: boolean;
  submitted_at: string | null;
  isLate: boolean;
};

type MondayFormStatus = {
  formSlug: string;
  weekOf: string;
  deadlineHourUtc: number;
  deadlinePassed: boolean;
  totalTeamMembers: number;
  submittedCount: number;
  entries: MondayFormEntry[];
};

type Scorecard = {
  kind: 'renewal' | 'on_time' | 'composite';
  person: { id: string; name: string; photo: string | null };
  /** Headline value, 0–100. null means "no signal yet" — UI shows "—". */
  valuePct: number | null;
  formulaCaption: string;
  sourceCaption: string;
  detail: string;
};

type InternalPayload = {
  asOf: string;
  thresholds: { person_escalation_threshold: number; overdue_yellow_days: number; overdue_red_days: number };
  kpis: {
    activeStandardClients: number;
    openTasks: number;
    overdueTasks: number;
    overdueRed: number;
    completedThisWeek: number;
    completionRate: number;
    // Week-over-week deltas — feed the trend arrows on each KPI card
    // per HHP Initiative Feature Checklist vF (TD §2.3).
    openTasksDelta: number;
    overdueDelta: number;
    completedThisWeekDelta: number;
    completionRateDelta: number;
  };
  workload: WorkloadRow[];
  escalations: WorkloadRow[];
  scorecards: Scorecard[];
  overdueTasks: OverdueTaskRow[];
  initiatives: Initiative[];
  adHocWork: { recentCount: number; recent: AdHocTask[] };
  mondayForm: MondayFormStatus;
};

const initiativeTone: Record<Initiative['tone'], BadgeTone> = {
  red: 'danger',
  amber: 'warning',
  fresh: 'success',
};

/**
 * v11: tiny colored avatar circle with initials, used in the Workload
 * table (and anywhere else a teammate is named). Color derived from
 * the name so the same person stays the same color across renders.
 */
const AVATAR_TONES = [
  'bg-brand-soft text-brand-deep border-brand-light',
  'bg-sky-50 text-sky-700 border-sky-100',
  'bg-amber-50 text-amber-700 border-amber-100',
  'bg-emerald-50 text-emerald-700 border-emerald-100',
  'bg-violet-50 text-violet-700 border-violet-100',
  'bg-rose-50 text-rose-700 border-rose-100',
] as const;

function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function NameWithAvatar({ name, photo }: { name: string; photo?: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      {photo ? (
        <div className="w-7 h-7 rounded-md overflow-hidden border border-cream-200 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt={`${name}'s profile`} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold border shrink-0 ${avatarTone(name)}`}>
          {initials(name)}
        </div>
      )}
      <span className="font-medium text-ink-warm-900 truncate">{name}</span>
    </div>
  );
}

const initiativeLabel: Record<Initiative['tone'], string> = {
  red: 'Stale',
  amber: 'Idle',
  fresh: 'Fresh',
};

export default function InternalTab() {
  const [data, setData] = useState<InternalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/v2/internal');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <InternalTabSkeleton />;
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load Internal Success"
        description={error}
      />
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* ── 01 Overview ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Overview" dot="brand" counter="01 — KPIs · Live" first />

        {/* [2026-06-11] KPI row realigned to spec § 3.1 exactly:
            Active Tasks (to-do) | Overdue | Completed (7d) | Completion Rate (7d).
            Dropped the "Clients" card — that count lives on the Client tab
            via the Health table's row count + ad-hoc side list. Promoted
            "Completed this week" from a sub-line on Tasks to its own card. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Trend arrows per HHP Initiative Feature Checklist vF
              (TD §2.3 · HHP-C §6): "all live from HQ with trend arrows".
              Green up = good for Active / Completed / Completion Rate;
              for Overdue the polarity flips so up = red. Flat is
              always neutral. Computed in the API by comparing this 7d
              window to the prior 7d. */}
          <KpiCard
            icon={ListTodo}
            label="Active Tasks"
            value={data.kpis.openTasks}
            sub="to-do"
            accent="sky"
            topAccent
            trend={{ delta: data.kpis.openTasksDelta, upIsGood: false }}
          />
          {/* Per Andy 2026-06-19: drop the "N red · M yellow" sub-line
              and the rose-vs-amber accent flip. Overdue is overdue —
              the days-overdue distinction lives in the per-task tone
              on the workload + Attention surfaces; the KPI card just
              needs the count. Accent kept rose so any value > 0 stays
              legible at a glance, but constant across thresholds. */}
          <KpiCard
            icon={AlertCircle}
            label="Overdue"
            value={data.kpis.overdueTasks}
            sub="past due"
            accent="rose"
            topAccent
            trend={{ delta: data.kpis.overdueDelta, upIsGood: false }}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Completed (7d)"
            value={data.kpis.completedThisWeek}
            sub="this week"
            accent="emerald"
            topAccent
            trend={{ delta: data.kpis.completedThisWeekDelta, upIsGood: true }}
          />
          <KpiCard
            icon={Compass}
            label="Completion Rate (7d)"
            value={`${data.kpis.completionRate}%`}
            sub="completed / total"
            accent="brand"
            topAccent
            trend={{
              delta: data.kpis.completionRateDelta,
              upIsGood: true,
              label: `${data.kpis.completionRateDelta > 0 ? '+' : ''}${data.kpis.completionRateDelta}pp`,
            }}
          />
        </div>
      </div>

      {/* ── 02 Scorecards ────────────────────────────────────────────── */}
      {/* Per HHP Team Dashboard Spec § Scorecards: one anchor metric
          per role, auto-pulled from HQ. Andy's composite excludes the
          ext-visits weight (20%) until portal analytics ships — that's
          surfaced in the card's detail line so the partial weighting
          is visible. The metric value renders large; formula caption
          + source line keep the formula auditable inline. */}
      {data.scorecards.length > 0 && (
        <div className="space-y-4">
          <SectionHeader label="Scorecards" dot="violet" counter="02 — Anchor metrics · Live" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.scorecards.map(sc => (
              <Card key={sc.person.id} className="border-cream-200 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  {sc.person.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={sc.person.photo} alt={`${sc.person.name}'s profile`} className="w-8 h-8 rounded-md object-cover border border-cream-200" />
                  ) : (
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold border ${avatarTone(sc.person.name)}`}>
                      {initials(sc.person.name)}
                    </div>
                  )}
                  <div className="text-sm font-semibold text-ink-warm-900">{sc.person.name}</div>
                </div>
                <div className="text-3xl font-bold tabular-nums text-ink-warm-900 leading-none">
                  {sc.valuePct === null ? <span className="text-ink-warm-400">—</span> : `${sc.valuePct}%`}
                </div>
                <div className="text-[11px] text-ink-warm-600 font-medium">{sc.formulaCaption}</div>
                <div className="text-[11px] text-ink-warm-500 leading-snug">{sc.detail}</div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-warm-400 mt-1">{sc.sourceCaption}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── 03 Workload ─────────────────────────────────────────────── */}
      {/* Mockup pattern: only the Engagements section sits in an inset
          block. Workload / Strategy / etc. sit directly on the page bg
          so the chrome doesn't compete with the cards. */}
      {/* [2026-06-15] id="workload" anchor target so /tasks/admin redirect
          (and any bookmarked /dashboard#workload link) jumps straight to
          the workload table — the closest analogue to the old Tasks-per-
          Member admin view. scroll-mt offsets the sticky chrome. */}
      <div id="workload" className="space-y-4 scroll-mt-20">
        <SectionHeader label="Workload" dot="sky" counter="03 — Team · Escalations · Check-in" />

      {/* Workload + escalations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={Users}
            title="Team Workload"
            subtitle={`Open tasks per teammate · ${data.workload.length} with work`}
          />

          {data.workload.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={ListTodo} title="No open tasks" description="Everyone's clear." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Teammate</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">To Do</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Overdue</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Completed (7d)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Per Andy + TD §3.2/§12 (2026-06-19): Status column
                    replaced with Completed (7d). Escalation/clear signal
                    is already legible from the rose Overdue cell + the
                    dedicated "Attention" card to the right. Open header
                    label updated to "To Do" to match TD §3.2. */}
                {data.workload.map(w => (
                  <TableRow key={w.id ?? w.name} className="border-cream-100 row-accent cursor-pointer">
                    <TableCell className="py-3.5 px-5"><NameWithAvatar name={w.name} photo={w.photo} /></TableCell>
                    <TableCell className="py-3.5 px-5 text-right tabular-nums">{w.open}</TableCell>
                    <TableCell className={`py-3 text-right tabular-nums ${w.overdue > 0 ? 'text-rose-600 font-semibold' : 'text-ink-warm-700'}`}>
                      {w.overdue}
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">
                      {w.completed}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Overdue panel per TD §3.2: task-level list sorted by days
            overdue desc. Active clients only — orphans/test/inactive
            are filtered in the API via the standardClients allowlist.
            Replaces the prior per-person Attention card; per-person
            escalation signal is still legible from the rose-coloured
            Overdue column on the workload table to the left. */}
        <Card className="border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={Flame}
            iconClassName="text-rose-500"
            title="Attention Required"
            subtitle={`${data.overdueTasks.length} overdue · sorted by days overdue`}
          />

          {data.overdueTasks.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CheckCircle2}
                title="Nothing overdue"
                description="Active client tasks are all on time."
              />
            </div>
          ) : (
            <ul className="divide-y divide-cream-100 max-h-[420px] overflow-y-auto">
              {data.overdueTasks.slice(0, 20).map(t => (
                <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink-warm-900 truncate">{t.task_name}</div>
                    <div className="text-[11px] text-ink-warm-500 truncate">
                      {t.client_name ? <Link href={`/clients/${t.client_id}`} className="hover:text-brand">{t.client_name}</Link> : <span className="italic">No client</span>}
                      {t.assignee_name ? <> · {t.assignee_name}</> : null}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold tabular-nums shrink-0 ${t.daysOverdue >= data.thresholds.overdue_red_days ? 'text-rose-600' : 'text-amber-700'}`}>
                    {t.daysOverdue}d
                  </span>
                </li>
              ))}
              {data.overdueTasks.length > 20 && (
                <li className="px-4 py-2 text-[11px] text-ink-warm-500 italic">
                  + {data.overdueTasks.length - 20} more — open /tasks?status=overdue for full list
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {/* Monday Check-in */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={ClipboardCheck}
          title="Monday Check-In"
          subtitle={`Week of ${data.mondayForm.weekOf} · deadline ${data.mondayForm.deadlineHourUtc}:00 UTC${data.mondayForm.deadlinePassed ? ' · DEADLINE PASSED' : ''}`}
          action={
            <div className="flex items-center gap-3">
              <span className="text-sm text-ink-warm-700 tabular-nums">
                <span className="font-semibold text-ink-warm-900">{data.mondayForm.submittedCount}</span>
                <span className="text-ink-warm-400"> / {data.mondayForm.totalTeamMembers}</span>
                <span className="text-ink-warm-500 ml-1">submitted</span>
              </span>
              <Link
                href={`/forms/${data.mondayForm.formSlug}`}
                className="text-xs font-medium text-brand hover:text-brand-dark transition-colors"
              >
                Open form →
              </Link>
            </div>
          }
        />

        {data.mondayForm.entries.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={ClipboardCheck}
              title="No team members configured"
              description="Add admin or super_admin users to track check-ins."
            />
          </div>
        ) : (
          <ul className="divide-y divide-cream-100">
            {data.mondayForm.entries.map(e => (
              <li key={e.user_id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {e.submitted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : e.isLate ? (
                    <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-cream-300 shrink-0" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-ink-warm-900">{e.name}</div>
                    {e.submitted_at && (
                      <div className="text-[11px] text-ink-warm-500 tabular-nums">
                        submitted {formatDateTime(new Date(e.submitted_at))}
                      </div>
                    )}
                  </div>
                </div>
                {/* "No submission" label per TD §6: visible to everyone
                    when deadline has passed and member hasn't filed.
                    Replaces the prior "Late" wording to match spec. */}
                {e.submitted ? (
                  <StatusBadge tone="success" size="sm" bordered withDot>Submitted</StatusBadge>
                ) : e.isLate ? (
                  <StatusBadge tone="danger" size="sm" bordered withDot="pulse">No submission</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral" size="sm" bordered withDot>Pending</StatusBadge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>

      {/* ── 03 Strategy ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader label="Strategy" dot="violet" counter="04 — Initiatives" />

      {/* Initiatives — card grid per mockup. Each card shows name + tone
          status badge, owner + updated date, linked task count chip,
          and free-form category tag chips. Click navigates to /initiatives
          (the admin page) since cards on the dashboard are read-only.
          Stale (amber/red) cards get a colored top accent rail so the
          eye lands on them in a dense grid. */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Compass}
          title="Initiatives"
          subtitle={`${data.initiatives.length} active`}
        />

        {data.initiatives.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Compass}
              title="No active initiatives"
              description="Add one to start tracking strategic work."
            />
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.initiatives.map(i => {
              const accentRail =
                i.tone === 'red' ? 'before:bg-rose-400' :
                i.tone === 'amber' ? 'before:bg-amber-400' :
                'before:bg-transparent';
              const updatedLabel = i.updated_at
                ? formatRelativeDays(i.updated_at)
                : 'Never updated';
              return (
                <Link
                  key={i.id}
                  href="/initiatives"
                  className={`group relative bg-white border border-cream-200 rounded-lg p-3 hover:border-brand/40 hover:shadow-sm transition-all before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:rounded-t-lg ${accentRail}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-sm font-semibold text-ink-warm-900 group-hover:text-brand transition-colors truncate flex-1">
                      {i.name}
                    </p>
                    <StatusBadge tone={initiativeTone[i.tone]} size="sm">
                      {i.tone === 'fresh' ? 'Active' : `Stale ${i.daysIdle}d`}
                    </StatusBadge>
                  </div>
                  {/* Current gate badge per TD §3.3 — the lowest-sort_order
                      milestone that isn't done yet. Hidden when no
                      milestones are seeded for this initiative. */}
                  {i.currentGate && (
                    <p className="text-[11px] text-ink-warm-700 mb-1.5 truncate">
                      <span className="text-[9px] uppercase tracking-[0.15em] text-ink-warm-400 font-semibold mr-1">Gate</span>
                      {i.currentGate}
                    </p>
                  )}
                  <p className="text-[11px] text-ink-warm-500 mb-2">
                    {i.owner_name ? <span className="font-medium text-ink-warm-700">{i.owner_name}</span> : 'Unassigned'}
                    {' · '}
                    Updated {updatedLabel}
                  </p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-ink-warm-700 border border-cream-200 font-medium">
                      {i.linkedTaskCount} task{i.linkedTaskCount === 1 ? '' : 's'} linked
                    </span>
                    {i.category_tags.map(t => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-cream-50 text-ink-warm-500 border border-cream-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {/* Ad-Hoc Work card removed 2026-06-08 per Andy — the team
          wasn't actively flagging tasks as ad-hoc so the card
          consistently rendered empty. AdHocTask type + the
          `adHocWork` field on DashboardData stay in place because
          /api/dashboard/internal still returns them; revive the
          surfaces above + restore this Card block to bring the
          feature back. */}
      </div>
    </div>
  );
}

function InternalTabSkeleton() {
  return (
    <div className="space-y-8">
      {/* ── 01 Overview ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton first />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)}
        </div>
      </div>
      {/* ── 02 Workload ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><TableCardSkeleton rows={4} cols={4} /></div>
          <ListCardSkeleton rows={3} />
        </div>
        <ListCardSkeleton rows={4} />
      </div>
      {/* ── 03 Strategy ─── */}
      <div className="space-y-4">
        <SectionHeaderSkeleton />
        <TableCardSkeleton rows={4} cols={4} />
        <ListCardSkeleton rows={3} />
      </div>
    </div>
  );
}

/**
 * Humane "Updated Nd ago" / "Updated 3w ago" relative-time string for
 * the initiative card grid. Avoids pulling a full date library for one
 * cosmetic helper. Caps at days < 14, then weeks; the actual stale-tone
 * logic that matters lives in the API.
 */
function formatRelativeDays(iso: string): string {
  return formatRelativeShort(iso);
}
