'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TaskService, Task, DashboardStats } from '@/lib/taskService';
import { ClientService } from '@/lib/clientService';
import {
  Building2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  PlayCircle,
  Circle,
  PauseCircle,
  MessageCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  to_do: { label: 'To Do', icon: Circle, color: 'text-gray-400' },
  in_progress: { label: 'In Progress', icon: PlayCircle, color: 'text-blue-500' },
  paused: { label: 'Paused', icon: PauseCircle, color: 'text-amber-500' },
  ready_for_feedback: { label: 'Feedback', icon: MessageCircle, color: 'text-purple-500' },
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-green-500' },
};

export default function ClientTasksPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState('');
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
      setClientName(clientData?.name || 'Unknown Client');
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
        </div>
      </div>
    );
  }

  const activeTasks = tasks.filter(t => t.status !== 'complete');
  const completedTasks = tasks.filter(t => t.status === 'complete');

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="w-full">
        <div className="space-y-4">
          {/* Header */}
          <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <Link href="/tasks/admin">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="bg-gray-100 p-2 rounded-lg">
                <Building2 className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{clientName}</h2>
                <p className="text-sm text-gray-500">Client task overview and deliverables</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total" value={stats.total} color="text-gray-600" bg="bg-gray-50" />
              <StatCard label="Overdue" value={stats.overdue} color="text-red-500" bg="bg-red-50" icon={AlertTriangle} />
              <StatCard label="In Progress" value={stats.inProgress} color="text-blue-500" bg="bg-blue-50" icon={PlayCircle} />
              <StatCard label="Completed" value={stats.byStatus['complete'] || 0} color="text-green-500" bg="bg-green-50" icon={CheckCircle2} />
            </div>
          )}

          {/* Active Tasks */}
          {activeTasks.length > 0 && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-blue-600" />
                <h3 className="font-semibold text-sm text-gray-900">Active Tasks</h3>
                <Badge variant="secondary" className="text-xs">{activeTasks.length}</Badge>
              </div>
              <div className="divide-y divide-gray-50">
                {activeTasks.map((task) => {
                  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.to_do;
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={task.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
                      <StatusIcon className={`h-4 w-4 ${cfg.color} flex-shrink-0`} />
                      <span className="flex-1 text-sm text-gray-900">{task.task_name}</span>
                      {task.assigned_to_name && (
                        <span className="text-xs text-gray-400">{task.assigned_to_name}</span>
                      )}
                      {task.due_date && (
                        <span className={`text-xs ${getDueDateColor(task.due_date)}`}>
                          {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <h3 className="font-semibold text-sm text-gray-900">Completed</h3>
                <Badge variant="secondary" className="text-xs">{completedTasks.length}</Badge>
              </div>
              <div className="divide-y divide-gray-50">
                {completedTasks.map((task) => (
                  <div key={task.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-400 line-through">{task.task_name}</span>
                    {task.completed_at && (
                      <span className="text-xs text-gray-400">
                        {new Date(task.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tasks.length === 0 && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-12 text-center">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No tasks linked to this client yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg, icon: Icon }: { label: string; value: number; color: string; bg: string; icon?: any }) {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`${bg} p-2 rounded-lg`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        )}
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
