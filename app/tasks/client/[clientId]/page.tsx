'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskService, Task, DashboardStats } from '@/lib/taskService';
import { ClientService } from '@/lib/clientService';
import {
  Building2,
  AlertTriangle,
  CheckCircle2,
  PlayCircle,
  Circle,
  PauseCircle,
  MessageCircle,
  ArrowLeft,
  ListTodo,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/dateFormat';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  to_do:              { label: 'To Do',     icon: Circle,         color: 'text-ink-warm-400' },
  in_progress:        { label: 'In Progress', icon: PlayCircle,   color: 'text-blue-500' },
  paused:             { label: 'Paused',    icon: PauseCircle,    color: 'text-amber-500' },
  ready_for_feedback: { label: 'Feedback',  icon: MessageCircle,  color: 'text-purple-500' },
  complete:           { label: 'Complete',  icon: CheckCircle2,   color: 'text-emerald-500' },
};

export default function ClientTasksPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState('');
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    try {
      const [clientData, dashData] = await Promise.all([
        ClientService.getClientByIdOrSlug(clientId),
        TaskService.getClientDashboardData(clientId),
      ]);
      // "Other" matches the new fallback we use everywhere else for
      // archived / inaccessible clients (was "Unknown Client" before
      // 2026-06-03).
      setClientName(clientData?.name || 'Other');
      setClientLogoUrl((clientData as any)?.logo_url ?? null);
      setTasks(dashData.tasks);
      setStats(dashData.stats);
    } catch (err) {
      console.error('Error loading client tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const getDueDateColor = (dueDate: string | null) => {
    if (!dueDate) return 'text-ink-warm-500';
    if (dueDate < today) return 'text-rose-600 font-semibold';
    const diffDays = Math.ceil((new Date(dueDate + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 3) return 'text-amber-600 font-semibold';
    return 'text-ink-warm-500';
  };

  // Back affordance — sits above the PageHeader. /tasks?client= scopes
  // the main HQ list to this same client; nicer landing than
  // /tasks/admin (now a /dashboard redirect anyway).
  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 w-fit">
      <Link href={`/tasks?client=${clientId}`}>
        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
        Back to HQ (this client)
      </Link>
    </Button>
  );

  // ── Loading branch ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader
          icon={Building2}
          title="Client"
          subtitle="Client task overview and deliverables"
          kicker="Workspace · HQ · Client view"
          kickerDot="brand"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Card className="border-cream-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-cream-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-[18px] w-[18px] rounded" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 border-b border-cream-100 last:border-0">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 flex-1 max-w-[280px]" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const activeTasks = tasks.filter(t => t.status !== 'complete');
  const completedTasks = tasks.filter(t => t.status === 'complete');

  // ── Loaded branch ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {backLink}

      {/* PageHeader — use the client's logo as the icon tile when
          available (28px tile in PageHeader replaces the lucide icon).
          Falls back to Building2. */}
      <PageHeader
        icon={Building2}
        title={clientName}
        subtitle="Client task overview and deliverables"
        kicker="Workspace · HQ · Client view"
        kickerDot="brand"
      />

      {/* Logo strip — sits between PageHeader and stats so users see
          which client they're on at a glance. Only renders if we have
          a logo (otherwise the PageHeader icon does the job). */}
      {clientLogoUrl && (
        <div className="flex items-center gap-3 -mt-2">
          <div className="w-10 h-10 rounded-md overflow-hidden border border-cream-200 bg-white shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={clientLogoUrl}
              alt={`${clientName} logo`}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-xs text-ink-warm-500">{tasks.length} task{tasks.length === 1 ? '' : 's'} linked to this client</span>
        </div>
      )}

      {/* KPI strip — v11 KpiCard (rose for overdue, sky for in
          progress, emerald for completed, neutral gray for total). */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={ListTodo}
            label="Total"
            value={stats.total}
            sub="all tasks"
            accent="gray"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Overdue"
            value={stats.overdue}
            sub="past due, not complete"
            accent="rose"
          />
          <KpiCard
            icon={PlayCircle}
            label="In Progress"
            value={stats.inProgress}
            sub="actively being worked"
            accent="sky"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Completed"
            value={stats.byStatus['complete'] || 0}
            sub="closed"
            accent="emerald"
          />
        </div>
      )}

      {/* Active Tasks */}
      {activeTasks.length > 0 && (
        <Card className="border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={PlayCircle}
            iconClassName="text-blue-500"
            title="Active Tasks"
            action={
              <span className="text-sm text-ink-warm-700 tabular-nums">
                <span className="font-semibold text-ink-warm-900">{activeTasks.length}</span>
                <span className="text-ink-warm-500 ml-1">task{activeTasks.length === 1 ? '' : 's'}</span>
              </span>
            }
          />
          <div className="divide-y divide-cream-100">
            {activeTasks.map((task) => {
              const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.to_do;
              const StatusIcon = cfg.icon;
              return (
                <div key={task.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-cream-50/60 transition-colors">
                  <StatusIcon className={`h-4 w-4 ${cfg.color} flex-shrink-0`} />
                  <span className="flex-1 text-sm text-ink-warm-900">{task.task_name}</span>
                  {task.assigned_to_name && (
                    <span className="text-xs text-ink-warm-500">{task.assigned_to_name}</span>
                  )}
                  {task.due_date && (
                    <span className={`text-xs tabular-nums ${getDueDateColor(task.due_date)}`}>
                      {formatDate(task.due_date + 'T00:00:00')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <Card className="border-cream-200 overflow-hidden">
          <CardHeaderEditorial
            icon={CheckCircle2}
            iconClassName="text-emerald-500"
            title="Completed"
            action={
              <span className="text-sm text-ink-warm-700 tabular-nums">
                <span className="font-semibold text-ink-warm-900">{completedTasks.length}</span>
                <span className="text-ink-warm-500 ml-1">closed</span>
              </span>
            }
          />
          <div className="divide-y divide-cream-100">
            {completedTasks.map((task) => (
              <div key={task.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-cream-50/60 transition-colors">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <span className="flex-1 text-sm text-ink-warm-400 line-through">{task.task_name}</span>
                {task.completed_at && (
                  <span className="text-xs text-ink-warm-400 tabular-nums">
                    {formatDate(task.completed_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty state — no tasks linked at all. */}
      {tasks.length === 0 && (
        <Card className="border-cream-200 overflow-hidden">
          <EmptyState
            icon={Building2}
            title="No tasks linked to this client yet."
            description="When a teammate creates a task linked to this client (via the HQ list's Client column), it'll show up here."
            className="py-16"
          />
        </Card>
      )}
    </div>
  );
}
