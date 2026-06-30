'use client';

/**
 * Layer 0 — My Work. Personal scope: "what do I owe today?"
 *
 * The original /tasks/my-dashboard page (2026-02 era) was a per-user
 * "what's on my plate" view. As of 2026-06-03 it was merged into the
 * main Priority Dashboard as the first tab — the daily landing for ICs
 * who open /dashboard in the morning. /tasks/my-dashboard now
 * redirects here.
 *
 * Unlike the other three tabs (Internal Success / Client Success /
 * Renewals & Pipeline) which read TEAM-wide data via dedicated API
 * endpoints, this tab pulls from TaskService directly scoped to the
 * current user. No server-side cache — the user's task list is small
 * enough that a 1-second Supabase query is fine.
 *
 * Card chrome matches the other dashboard tabs exactly:
 * SectionHeader chapters → Card + CardHeaderEditorial → ul/li rows with
 * divide-y divide-cream-100. KpiCards + ListCardSkeleton + StatusBadge
 * are the same primitives the other tabs use, so switching between
 * tabs feels like reading the same surface.
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import {
  SectionHeaderSkeleton, KpiCardSkeleton, ListCardSkeleton,
} from './SkeletonHelpers';
import { useAuth } from '@/contexts/AuthContext';
import { TaskService, Task, DashboardStats } from '@/lib/taskService';
import { ClientService } from '@/lib/clientService';
import { UserService } from '@/lib/userService';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertTriangle, Clock, CheckCircle2, PlayCircle, Circle, PauseCircle,
  MessageCircle, LayoutDashboard,
} from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  to_do:              { label: 'To Do',     icon: Circle,         color: 'text-ink-warm-400' },
  in_progress:        { label: 'In Progress', icon: PlayCircle,   color: 'text-blue-500' },
  paused:             { label: 'Paused',    icon: PauseCircle,    color: 'text-amber-500' },
  ready_for_feedback: { label: 'Feedback',  icon: MessageCircle,  color: 'text-purple-500' },
  complete:           { label: 'Complete',  icon: CheckCircle2,   color: 'text-emerald-500' },
};

export default function MyWorkTab() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);
  // Open the existing TaskDetailModal on row click so users can flip
  // status (and edit anything else) from here. Previously rows were
  // read-only — no way to mark a task done without leaving the page.
  const [openTask, setOpenTask] = useState<Task | null>(null);

  // [2026-06-30] Per Andy: clicking the status circle (ClickUp-style)
  // opens an inline picker instead of opening the full modal. Updates
  // optimistically so the row re-buckets immediately; server failure
  // surfaces via console + reverts via the loadData refetch chain.
  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const prev = tasks;
    setTasks(t => t.map(x => x.id === taskId ? { ...x, status: newStatus } : x));
    try {
      await TaskService.updateTask(taskId, { status: newStatus });
    } catch (err) {
      console.error('Failed to update task status', err);
      setTasks(prev);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    try {
      const [statsData, tasksData, clientsData, teamData] = await Promise.all([
        TaskService.getDashboardStats(user.id),
        TaskService.getTasksForUser(user.id),
        ClientService.getAllClients(),
        UserService.getActiveUsers(),
      ]);
      setStats(statsData);
      setTasks(tasksData);
      setClients(clientsData.map((c: any) => ({ id: c.id, name: c.name })));
      setTeamMembers(
        (teamData || [])
          .filter((u: any) => u.role !== 'client')
          .map((u: any) => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role })),
      );
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  // Build client name map — used only for the per-row client chip in
  // the TaskListCard helper (the client-filter Tabs strip was removed
  // 2026-06-03: the "Unknown" tab fallback was confusing for tasks
  // tied to archived/inaccessible clients, and the strip was redundant
  // with the per-row client tag).
  const clientMap: Record<string, string> = {};
  clients.forEach(c => { clientMap[c.id] = c.name; });

  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Bucket all tasks (no client filter) by urgency / status.
  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'complete');
  const dueThisWeek = tasks.filter(t => t.due_date && t.due_date >= today && t.due_date <= weekEndStr && t.status !== 'complete');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const recentlyCompleted = tasks.filter(t => t.status === 'complete').slice(0, 10);

  const getDueDateColor = (dueDate: string | null) => {
    if (!dueDate) return 'text-ink-warm-500';
    if (dueDate < today) return 'text-rose-600 font-semibold';
    const diffDays = Math.ceil((new Date(dueDate + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 3) return 'text-amber-600 font-semibold';
    return 'text-ink-warm-500';
  };

  // ── Loading branch ────────────────────────────────────────────────
  // Mirrors the other dashboard tabs: SectionHeaderSkeleton +
  // KpiCardSkeleton row + ListCardSkeleton list. Reuses the shared
  // helpers in ./SkeletonHelpers so the loading rhythm is identical
  // across all four tabs.
  if (loading) {
    return (
      <div className="space-y-8">
        {/* ── 01 Overview skeleton ─────────────────────────────────── */}
        <div className="space-y-4">
          <SectionHeaderSkeleton first />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
          </div>
        </div>

        {/* ── 02 Active work skeleton ──────────────────────────────── */}
        <div className="space-y-4">
          <SectionHeaderSkeleton />
          <ListCardSkeleton rows={4} />
          <ListCardSkeleton rows={3} />
        </div>
      </div>
    );
  }

  // ── Empty branch ──────────────────────────────────────────────────
  if (tasks.length === 0) {
    return (
      <Card className="border-cream-200 overflow-hidden">
        <EmptyState
          icon={LayoutDashboard}
          title="No tasks assigned to you yet."
          description="When a teammate assigns you a task in HQ, it'll show up here so you can plan your day."
          className="py-16"
        />
      </Card>
    );
  }

  // ── Loaded branch ─────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* ── 01 Overview ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader
          label="Overview"
          dot="brand"
          counter="01 — Your week at a glance"
          first
        />
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={AlertTriangle}
              label="Overdue"
              value={stats.overdue}
              sub="past due, not complete"
              accent="rose"
              topAccent
            />
            <KpiCard
              icon={Clock}
              label="Due This Week"
              value={stats.dueThisWeek}
              sub="within 7 days"
              accent="amber"
              topAccent
            />
            <KpiCard
              icon={PlayCircle}
              label="In Progress"
              value={stats.inProgress}
              sub="actively being worked"
              accent="sky"
              topAccent
            />
            {/* No topAccent — Completed (7d) is a reference metric
                ("here's what landed"), not an urgency signal. Pairs
                with the Recently Completed list card below which is
                also stripe-less. */}
            <KpiCard
              icon={CheckCircle2}
              label="Completed (7d)"
              value={stats.completedThisWeek}
              sub="closed this week"
              accent="emerald"
            />
          </div>
        )}
      </div>

      {/* ── 02 Active work ────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader
          label="Active work"
          dot="sky"
          counter="02 — Tasks by urgency"
        />

        {overdueTasks.length > 0 && (
          <TaskListCard
            title="Overdue"
            subtitle="Past their due date · clear these first"
            icon={AlertTriangle}
            accent="rose"
            tasks={overdueTasks}
            getDueDateColor={getDueDateColor}
            clientMap={clientMap}
            onTaskClick={setOpenTask}
            onStatusChange={handleStatusChange}
          />
        )}

        {dueThisWeek.length > 0 && (
          <TaskListCard
            title="Due This Week"
            subtitle="Within the next 7 days"
            icon={Clock}
            accent="amber"
            tasks={dueThisWeek}
            getDueDateColor={getDueDateColor}
            clientMap={clientMap}
            onTaskClick={setOpenTask}
            onStatusChange={handleStatusChange}
          />
        )}

        {inProgressTasks.length > 0 && (
          <TaskListCard
            title="In Progress"
            subtitle="Actively being worked"
            icon={PlayCircle}
            accent="sky"
            tasks={inProgressTasks}
            getDueDateColor={getDueDateColor}
            clientMap={clientMap}
            onTaskClick={setOpenTask}
            onStatusChange={handleStatusChange}
          />
        )}

        {recentlyCompleted.length > 0 && (
          <TaskListCard
            title="Recently Completed"
            subtitle="Last 10 closed"
            icon={CheckCircle2}
            accent="emerald"
            stripe={false}
            tasks={recentlyCompleted}
            getDueDateColor={getDueDateColor}
            clientMap={clientMap}
            onTaskClick={setOpenTask}
            onStatusChange={handleStatusChange}
          />
        )}

        {/* No active-work cards at all? The user has tasks (the
            tasks.length === 0 branch above wouldn't fire), but none
            are urgent/active/recently-completed — e.g. all are
            "to do" but with no due date. Show a small EmptyState so
            the page doesn't end on a blank section. */}
        {overdueTasks.length === 0 && dueThisWeek.length === 0
          && inProgressTasks.length === 0 && recentlyCompleted.length === 0 && (
          <Card className="border-cream-200 overflow-hidden">
            <EmptyState
              icon={CheckCircle2}
              title="Nothing urgent right now."
              description="You have tasks, but none are overdue, due this week, in progress, or recently closed."
              className="py-12"
            />
          </Card>
        )}
      </div>

      {/* Edit modal — opened by clicking any task row. Reuses the
          /tasks TaskDetailModal so PSG, recurring config, every other
          field stays in lock-step. On save we reload the list so the
          task moves between buckets (e.g. To Do → Complete drops it
          out of Overdue and into Recently Completed). */}
      <TaskDetailModal
        open={!!openTask}
        onOpenChange={(open) => { if (!open) setOpenTask(null); }}
        task={openTask}
        teamMembers={teamMembers}
        clients={clients}
        onSaved={() => { setOpenTask(null); loadData(); }}
      />
    </div>
  );
}

// Accent palette for the TaskListCard top-stripe + header icon.
// Mirrors KpiCard's ACCENT_TOP so the 2px colored stripe on each
// section card lines up tonally with the KPI tile that drives it
// (Overdue card stripe = same rose as Overdue KPI, etc.).
type TaskListAccent = 'rose' | 'amber' | 'sky' | 'emerald';
const STRIPE_BG: Record<TaskListAccent, string> = {
  rose:    'bg-rose-500',
  amber:   'bg-amber-500',
  sky:     'bg-sky-500',
  emerald: 'bg-emerald-500',
};
const ICON_COLOR: Record<TaskListAccent, string> = {
  rose:    'text-rose-500',
  amber:   'text-amber-500',
  sky:     'text-sky-500',
  emerald: 'text-emerald-500',
};

function TaskListCard({
  title,
  subtitle,
  icon,
  accent,
  stripe = true,
  tasks,
  getDueDateColor,
  clientMap,
  onTaskClick,
  onStatusChange,
}: {
  title: string;
  subtitle: string;
  icon: typeof Circle;
  accent: TaskListAccent;
  /** Whether to render the 2px colored top stripe. Default true. Off
   *  for sections that are reference-only (e.g. Recently Completed)
   *  where the stripe would falsely signal "needs your attention." */
  stripe?: boolean;
  tasks: Task[];
  getDueDateColor: (d: string | null) => string;
  clientMap?: Record<string, string>;
  /** Fires when the user clicks a task row. Opens the existing
   *  TaskDetailModal in the parent so status/assignee/due-date can
   *  be edited inline without leaving the dashboard. */
  onTaskClick?: (task: Task) => void;
  /** Fires when the user picks a new status from the inline popover
   *  on the status circle. Optional — when omitted the circle is
   *  decorative only. ClickUp-style: click circle → pick status. */
  onStatusChange?: (taskId: string, newStatus: string) => void;
}) {
  return (
    <Card className="relative border-cream-200 overflow-hidden">
      {/* 2px colored top stripe — same treatment KpiCard's `topAccent`
          adds to the KPI row above. Color matches the section's
          semantic (rose=overdue, amber=this week, sky=in progress)
          so the eye groups each list card with the KPI tile that
          drives it. Suppressed when stripe=false — Recently
          Completed is reference-only, not an urgency signal. */}
      {stripe && (
        <span
          className={`absolute top-0 left-4 right-4 h-[2px] rounded-b ${STRIPE_BG[accent]}`}
          aria-hidden
        />
      )}
      <CardHeaderEditorial
        icon={icon}
        iconClassName={ICON_COLOR[accent]}
        title={title}
        subtitle={subtitle}
        action={
          <span className="text-sm text-ink-warm-700 tabular-nums">
            <span className="font-semibold text-ink-warm-900">{tasks.length}</span>
            <span className="text-ink-warm-500 ml-1">task{tasks.length === 1 ? '' : 's'}</span>
          </span>
        }
      />
      <ul className="divide-y divide-cream-100">
        {tasks.map((task) => {
          const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.to_do;
          const StatusIcon = cfg.icon;
          return (
            <li
              key={task.id}
              role={onTaskClick ? 'button' : undefined}
              tabIndex={onTaskClick ? 0 : undefined}
              onClick={onTaskClick ? () => onTaskClick(task) : undefined}
              onKeyDown={onTaskClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTaskClick(task); } } : undefined}
              className={`px-4 py-2.5 flex items-center gap-3 transition-colors ${onTaskClick ? 'cursor-pointer hover:bg-cream-50' : 'hover:bg-cream-50'}`}
            >
              {onStatusChange ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="flex-shrink-0 rounded-full p-0.5 hover:bg-cream-100 transition-colors"
                      title={`Status: ${cfg.label} — click to change`}
                    >
                      <StatusIcon className={`h-4 w-4 ${cfg.color}`} aria-hidden />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="!bg-white border shadow-md p-1 w-44 z-[80]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {Object.entries(STATUS_CONFIG).map(([key, c]) => {
                      const Icon = c.icon;
                      const active = key === task.status;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (key !== task.status) onStatusChange(task.id, key);
                            // Close the popover by dispatching Escape on
                            // the document; Radix listens for it via the
                            // open-state machinery.
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded text-left transition-colors ${active ? 'bg-cream-100 font-medium' : 'hover:bg-cream-50'}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${c.color}`} aria-hidden />
                          <span className="text-ink-warm-800">{c.label}</span>
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              ) : (
                <StatusIcon className={`h-4 w-4 ${cfg.color} flex-shrink-0`} aria-hidden />
              )}
              <span className={`flex-1 text-sm ${task.status === 'complete' ? 'line-through text-ink-warm-400' : 'text-ink-warm-900'}`}>
                {task.task_name}
              </span>
              {clientMap && task.client_id && clientMap[task.client_id] && (
                <StatusBadge tone="brand" size="sm" bordered>
                  {clientMap[task.client_id]}
                </StatusBadge>
              )}
              {task.due_date && (
                <span className={`text-xs tabular-nums ${getDueDateColor(task.due_date)}`}>
                  {formatDate(task.due_date + 'T00:00:00')}
                </span>
              )}
              {task.task_type && (
                <span className="text-[10px] bg-cream-100 text-ink-warm-500 px-1.5 py-0.5 rounded">
                  {task.task_type}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
