'use client';

import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { TaskService, DashboardStats } from '@/lib/taskService';
import { ClientService } from '@/lib/clientService';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  PlayCircle,
  Users,
  Building2,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overall, setOverall] = useState<DashboardStats | null>(null);
  const [byUser, setByUser] = useState<{ userId: string; userName: string; stats: DashboardStats }[]>([]);
  const [byClient, setByClient] = useState<{ clientId: string; clientName: string; count: number }[]>([]);

  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin' && userProfile.role !== 'super_admin') {
      router.push('/tasks');
      return;
    }
    loadData();
  }, [userProfile]);

  const loadData = async () => {
    try {
      const data = await TaskService.getAdminDashboardStats();
      setOverall(data.overall);
      setByUser(data.byUser);

      // Resolve client names
      const clients = await ClientService.getAllClients();
      const clientMap = new Map(clients.map(c => [c.id, c.name]));
      setByClient(data.byClient.map(bc => ({
        ...bc,
        clientName: clientMap.get(bc.clientId) || 'Unknown',
      })));
    } catch (err) {
      console.error('Error loading admin dashboard:', err);
    } finally {
      setLoading(false);
    }
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
                <ShieldCheck className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Admin Overview</h2>
                <p className="text-sm text-gray-500">Team task overview and workload distribution</p>
              </div>
            </div>
          </div>

          {/* Overall Stats */}
          {overall && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Total Tasks" value={overall.total} color="text-gray-600" bg="bg-gray-50" />
              <StatCard label="Overdue" value={overall.overdue} color="text-red-500" bg="bg-red-50" icon={AlertTriangle} />
              <StatCard label="Due This Week" value={overall.dueThisWeek} color="text-amber-500" bg="bg-amber-50" icon={Clock} />
              <StatCard label="In Progress" value={overall.inProgress} color="text-blue-500" bg="bg-blue-50" icon={PlayCircle} />
              <StatCard label="Completed (7d)" value={overall.completedThisWeek} color="text-green-500" bg="bg-green-50" icon={CheckCircle2} />
            </div>
          )}

          {/* Per Member */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-600" />
              <h3 className="font-semibold text-sm text-gray-900">Tasks per Member</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left py-2 px-4 font-semibold text-xs text-gray-600 uppercase">Member</th>
                    <th className="text-center py-2 px-3 font-semibold text-xs text-gray-600 uppercase">Total</th>
                    <th className="text-center py-2 px-3 font-semibold text-xs text-gray-600 uppercase">Overdue</th>
                    <th className="text-center py-2 px-3 font-semibold text-xs text-gray-600 uppercase">In Progress</th>
                    <th className="text-center py-2 px-3 font-semibold text-xs text-gray-600 uppercase">Due Soon</th>
                    <th className="text-center py-2 px-3 font-semibold text-xs text-gray-600 uppercase">Done (7d)</th>
                  </tr>
                </thead>
                <tbody>
                  {byUser.sort((a, b) => b.stats.overdue - a.stats.overdue).map((u) => (
                    <tr key={u.userId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{u.userName}</td>
                      <td className="py-2.5 px-3 text-center text-gray-600">{u.stats.total}</td>
                      <td className="py-2.5 px-3 text-center">
                        {u.stats.overdue > 0 ? (
                          <Badge variant="destructive" className="text-xs">{u.stats.overdue}</Badge>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-blue-600">{u.stats.inProgress}</td>
                      <td className="py-2.5 px-3 text-center text-amber-600">{u.stats.dueThisWeek}</td>
                      <td className="py-2.5 px-3 text-center text-green-600">{u.stats.completedThisWeek}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per Client */}
          {byClient.length > 0 && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-600" />
                <h3 className="font-semibold text-sm text-gray-900">Tasks per Client</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {byClient.sort((a, b) => b.count - a.count).map((c) => (
                  <div
                    key={c.clientId}
                    className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/tasks/client/${c.clientId}`)}
                  >
                    <span className="text-sm font-medium text-gray-900">{c.clientName}</span>
                    <Badge variant="secondary" className="text-xs">{c.count} tasks</Badge>
                  </div>
                ))}
              </div>
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
