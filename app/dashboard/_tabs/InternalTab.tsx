'use client';

/**
 * Layer 1 — Internal Success. Renders the payload from
 * /api/dashboard/v2/internal. "Are we executing?"
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
import {
  Users, ListTodo, AlertCircle, CheckCircle2, Flame, Compass, Sparkles, ClipboardCheck,
} from 'lucide-react';

type WorkloadRow = { id: string | null; name: string; photo: string | null; open: number; overdue: number };
type Initiative = {
  id: string;
  name: string;
  owner_user_id: string | null;
  category_tags: string[];
  daysIdle: number;
  tone: 'red' | 'amber' | 'fresh';
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
  };
  workload: WorkloadRow[];
  escalations: WorkloadRow[];
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

        {/* KPI strip — v11: shorter labels (no wrap on tighter cards),
            5 columns only at lg+; sm/md fall back to 2 then 3 columns. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            icon={Users}
            label="Clients"
            value={data.kpis.activeStandardClients}
            sub="standard"
            accent="brand"
            topAccent
          />
          <KpiCard
            icon={ListTodo}
            label="Tasks"
            value={data.kpis.openTasks}
            sub={`${data.kpis.completedThisWeek} done this wk`}
            accent="sky"
            topAccent
          />
          <KpiCard
            icon={AlertCircle}
            label="Overdue"
            value={data.kpis.overdueTasks}
            sub={`${data.kpis.overdueRed} red · ${data.kpis.overdueTasks - data.kpis.overdueRed} yellow`}
            accent={data.kpis.overdueRed > 0 ? 'rose' : 'amber'}
            topAccent
          />
          <KpiCard
            icon={CheckCircle2}
            label="Completion"
            value={`${data.kpis.completionRate}%`}
            sub="this week"
            accent="emerald"
            topAccent
          />
          <KpiCard
            icon={Sparkles}
            label="Ad-hoc"
            value={data.adHocWork.recentCount}
            sub="open"
            accent="purple"
            topAccent
          />
        </div>
      </div>

      {/* ── 02 Workload ─────────────────────────────────────────────── */}
      {/* Mockup pattern: only the Engagements section sits in an inset
          block. Workload / Strategy / etc. sit directly on the page bg
          so the chrome doesn't compete with the cards. */}
      <div className="space-y-4">
        <SectionHeader label="Workload" dot="sky" counter="02 — Team · Escalations · Check-in" />

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
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Open</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Overdue</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.workload.map(w => {
                  const isEscalation = w.overdue >= data.thresholds.person_escalation_threshold;
                  return (
                    <TableRow key={w.id ?? w.name} className="border-cream-100 row-accent cursor-pointer">
                      <TableCell className="py-3.5 px-5"><NameWithAvatar name={w.name} photo={w.photo} /></TableCell>
                      <TableCell className="py-3.5 px-5 text-right tabular-nums">{w.open}</TableCell>
                      <TableCell className={`py-3 text-right tabular-nums ${w.overdue > 0 ? 'text-rose-600 font-semibold' : 'text-ink-warm-700'}`}>
                        {w.overdue}
                      </TableCell>
                      <TableCell className="py-3.5 px-5">
                        {isEscalation ? (
                          <StatusBadge tone="danger" size="sm" bordered withDot="pulse">Escalation</StatusBadge>
                        ) : w.overdue > 0 ? (
                          <StatusBadge tone="warning" size="sm" bordered withDot>Has overdue</StatusBadge>
                        ) : (
                          <StatusBadge tone="success" size="sm" bordered withDot>Clear</StatusBadge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={Flame}
            iconClassName="text-rose-500"
            title="Attention"
            subtitle={`Above ${data.thresholds.person_escalation_threshold} overdue`}
          />

          {data.escalations.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CheckCircle2}
                title="No escalations"
                description="Everyone's under threshold."
              />
            </div>
          ) : (
            <ul className="divide-y divide-cream-100">
              {data.escalations.map(e => (
                <li key={e.id ?? e.name} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-ink-warm-900">{e.name}</div>
                    <div className="text-xs text-ink-warm-500 tabular-nums">{e.overdue} overdue · {e.open} open</div>
                  </div>
                  <StatusBadge tone="danger" size="sm" bordered withDot="pulse">Escalate</StatusBadge>
                </li>
              ))}
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
                        submitted {new Date(e.submitted_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
                {e.submitted ? (
                  <StatusBadge tone="success" size="sm" bordered withDot>Submitted</StatusBadge>
                ) : e.isLate ? (
                  <StatusBadge tone="danger" size="sm" bordered withDot="pulse">Late</StatusBadge>
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
        <SectionHeader label="Strategy" dot="violet" counter="03 — Initiatives · Ad-hoc work" />

      {/* Initiatives */}
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
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Initiative</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Tags</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Days idle</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.initiatives.map(i => (
                <TableRow key={i.id} className="border-cream-100 row-accent cursor-pointer">
                  <TableCell className="py-3.5 px-5 font-medium text-ink-warm-900">{i.name}</TableCell>
                  <TableCell className="py-3.5 px-5 text-xs text-ink-warm-700">
                    {i.category_tags.length > 0 ? i.category_tags.join(', ') : <span className="text-ink-warm-400">—</span>}
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right tabular-nums text-ink-warm-700">{i.daysIdle}d</TableCell>
                  <TableCell className="py-3.5 px-5">
                    <StatusBadge tone={initiativeTone[i.tone]} size="sm" bordered withDot>{initiativeLabel[i.tone]}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Ad-hoc work */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Sparkles}
          iconClassName="text-purple-500"
          title="Ad-Hoc Work"
          subtitle={`Unplanned · ${data.adHocWork.recentCount} recent`}
        />

        {data.adHocWork.recent.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Sparkles}
              title="No ad-hoc work logged"
              description="When fires come in, flag them as ad-hoc to surface here."
            />
          </div>
        ) : (
          <ul className="divide-y divide-cream-100">
            {data.adHocWork.recent.map(t => (
              <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-warm-900 truncate">{t.name}</div>
                  <div className="text-xs text-ink-warm-500 mt-0.5">
                    {t.assignee ?? 'Unassigned'}
                    {t.due_date ? <span className="ml-2">· due {t.due_date}</span> : null}
                  </div>
                </div>
                <StatusBadge
                  tone={t.status === 'complete' ? 'success' : t.status === 'in_progress' ? 'info' : 'neutral'}
                  size="sm"
                  bordered
                  withDot
                >
                  {t.status.replace(/_/g, ' ')}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
