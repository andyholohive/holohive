'use client';

import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { TaskService, Task, DashboardStats } from '@/lib/taskService';
import {
  LayoutDashboard,
  AlertTriangle,
  Clock,
  CheckCircle2,
  PlayCircle,
  Circle,
  PauseCircle,
  MessageCircle,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  to_do: { label: 'To Do', icon: Circle, color: 'text-gray-400' },
  in_progress: { label: 'In Progress', icon: PlayCircle, color: 'text-blue-500' },
  paused: { label: 'Paused', icon: PauseCircle, color: 'text-amber-500' },
  ready_for_feedback: { label: 'Feedback', icon: MessageCircle, color: 'text-purple-500' },
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-green-500' },
};

export default function MyDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    try {
      const [statsData, tasksData] = await Promise.all([
        TaskService.getDashboardStats(user.id),
        TaskService.getTasksForUser(user.id),
      ]);
      setStats(statsData);
      setTasks(tasksData);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'complete');
  const dueThisWeek = tasks.filter(t => t.due_date && t.due_date >= today && t.due_date <= weekEndStr && t.status !== 'complete');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const recentlyCompleted = tasks.filter(t => t.status === 'complete').slice(0, 10);

  const getDueDateColor = (dueDate: string | null) => {
    if (!dueDate) return 'text-gray-500';
    if (dueDate < today) return 'text-red-600 font-semibold';
    const diffDays = Math.ceil((new Date(dueDate + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 3) return 'text-amber-600 font-semibold';
    return 'text-gray-500';
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 p-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="w-full">
        <div className="space-y-4">
          {/* Header */}
          <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="bg-gray-100 p-2 rounded-lg">
                <LayoutDashboard className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">My Dashboard</h2>
                <p className="text-sm text-gray-500">Your assigned tasks and progress</p>
              </div>
            </div>
          </div>

          {/* Stat Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-0">
              <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdue} color="text-red-500" bg="bg-red-50" />
              <StatCard icon={Clock} label="Due This Week" value={stats.dueThisWeek} color="text-amber-500" bg="bg-amber-50" />
              <StatCard icon={PlayCircle} label="In Progress" value={stats.inProgress} color="text-blue-500" bg="bg-blue-50" />
              <StatCard icon={CheckCircle2} label="Completed (7d)" value={stats.completedThisWeek} color="text-green-500" bg="bg-green-50" />
            </div>
          )}

          {/* Overdue Tasks */}
          {overdueTasks.length > 0 && (
            <TaskSection title="Overdue" icon={AlertTriangle} color="text-red-600" tasks={overdueTasks} getDueDateColor={getDueDateColor} />
          )}

          {/* Due This Week */}
          {dueThisWeek.length > 0 && (
            <TaskSection title="Due This Week" icon={Clock} color="text-amber-600" tasks={dueThisWeek} getDueDateColor={getDueDateColor} />
          )}

          {/* In Progress */}
          {inProgressTasks.length > 0 && (
            <TaskSection title="In Progress" icon={PlayCircle} color="text-blue-600" tasks={inProgressTasks} getDueDateColor={getDueDateColor} />
          )}

          {/* Recently Completed */}
          {recentlyCompleted.length > 0 && (
            <TaskSection title="Recently Completed" icon={CheckCircle2} color="text-green-600" tasks={recentlyCompleted} getDueDateColor={getDueDateColor} />
          )}

          {tasks.length === 0 && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-12 text-center">
              <LayoutDashboard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No tasks assigned to you yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: { icon: any; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div className={`${bg} p-2 rounded-lg`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function TaskSection({ title, icon: Icon, color, tasks, getDueDateColor }: {
  title: string;
  icon: any;
  color: string;
  tasks: Task[];
  getDueDateColor: (d: string | null) => string;
}) {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
        <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
      </div>
      <div className="divide-y divide-gray-50">
        {tasks.map((task) => {
          const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.to_do;
          const StatusIcon = cfg.icon;
          return (
            <div key={task.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
              <StatusIcon className={`h-4 w-4 ${cfg.color} flex-shrink-0`} />
              <span className={`flex-1 text-sm ${task.status === 'complete' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                {task.task_name}
              </span>
              {task.due_date && (
                <span className={`text-xs ${getDueDateColor(task.due_date)}`}>
                  {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {task.task_type && (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{task.task_type}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
