'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { UserService } from '@/lib/userService';
import { ClientService } from '@/lib/clientService';
import { Task } from '@/lib/taskService';
import {
  DeliverableService,
  DeliverableWithProgress,
  DeliverableTemplate,
} from '@/lib/deliverableService';
import { DeliverableWizard } from '@/components/tasks/DeliverableWizard';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import {
  Plus,
  Package,
  Rocket,
  FileText,
  Handshake,
  Search,
  Eye,
  BarChart3,
  ClipboardList,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Timer,
} from 'lucide-react';

const ICON_MAP: Record<string, any> = {
  Rocket, FileText, Handshake, Search, Eye, BarChart3, ClipboardList,
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  active: { label: 'Active', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
};

type TeamMember = { id: string; name: string; email: string; role: string };
type ClientOption = { id: string; name: string };

function getCycleTimeDays(startDate: string | null, completedAt: string | null, status: string): number | null {
  if (!startDate) return null;
  const start = new Date(startDate + 'T00:00:00');
  if (status === 'complete' && completedAt) {
    const end = new Date(completedAt);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }
  // For active, show elapsed days
  return Math.ceil((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DeliverablesPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [deliverables, setDeliverables] = useState<DeliverableWithProgress[]>([]);
  const [templates, setTemplates] = useState<DeliverableTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Task detail modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dels, tmpls, users, cls] = await Promise.all([
        DeliverableService.getDeliverables(),
        DeliverableService.getTemplates(),
        UserService.getAllUsers(),
        ClientService.getAllClients(),
      ]);
      setDeliverables(dels);
      setTemplates(tmpls);
      setTeamMembers(users.map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
      setClients(cls.map((c: any) => ({ id: c.id, name: c.name })));
    } catch (err) {
      console.error('Error loading deliverables:', err);
      toast({ title: 'Error', description: 'Failed to load deliverables', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (d: DeliverableWithProgress) => {
    if (d.parentTask) {
      setSelectedTask(d.parentTask);
      setTaskModalOpen(true);
    }
  };

  const handleDuplicate = async (d: DeliverableWithProgress, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.id || !userProfile) return;
    try {
      const result = await DeliverableService.createDeliverable({
        templateId: d.template_id,
        title: `${d.title} (copy)`,
        clientId: d.client_id,
        startDate: new Date().toISOString().split('T')[0],
        priority: d.parentTask?.priority || 'medium',
        roleAssignments: Object.fromEntries(
          Object.entries(d.role_assignments).map(([role, userId]) => {
            const member = teamMembers.find(m => m.id === userId);
            return [role, { userId: userId as string, userName: member?.name || '' }];
          })
        ),
        createdBy: user.id,
        createdByName: userProfile.name || userProfile.email || '',
      });
      toast({ title: 'Duplicated', description: `Created "${result.parentTask.task_name}" with ${result.subtasks.length} subtasks` });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to duplicate', variant: 'destructive' });
    }
  };

  const filtered = deliverables.filter(d => {
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (filterClient !== 'all' && d.client_id !== filterClient) return false;
    if (filterType !== 'all' && d.template_id !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
        <div className="pb-5 border-b border-gray-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gray-100 p-2 rounded-lg">
              <Package className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Deliverables</h2>
              <p className="text-sm text-gray-500">Structured workflows from templates</p>
            </div>
          </div>
          <Button
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
            onClick={() => setWizardOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Deliverable
          </Button>
        </div>

        {/* Filters */}
        <div className="pt-4 flex flex-wrap gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="Template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No deliverables found</p>
          <Button
            className="mt-4 hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
            onClick={() => setWizardOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create your first deliverable
          </Button>
        </div>
      ) : (
        <TooltipProvider>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(d => {
              const Icon = ICON_MAP[d.template.icon] || ClipboardList;
              const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.active;
              const StatusIcon = statusCfg.icon;
              const progressPct = d.totalSteps > 0 ? (d.completedSteps / d.totalSteps) * 100 : 0;
              const clientName = d.client_id ? clients.find(c => c.id === d.client_id)?.name : null;
              const cycleTime = getCycleTimeDays(d.start_date, d.parentTask?.completed_at || null, d.status);

              return (
                <div
                  key={d.id}
                  onClick={() => handleCardClick(d)}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md" style={{ backgroundColor: d.template.color + '15' }}>
                        <Icon className="h-4 w-4" style={{ color: d.template.color }} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 line-clamp-1">{d.title}</div>
                        <div className="text-[10px] text-gray-400">{d.template.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => handleDuplicate(d, e)}
                          >
                            <Copy className="h-3 w-3 text-gray-400" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Duplicate this deliverable</TooltipContent>
                      </Tooltip>
                      <Badge className={`${statusCfg.bg} ${statusCfg.color} border-0 text-[10px]`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                  </div>

                  {clientName && (
                    <div className="text-xs text-gray-500 mb-2">{clientName}</div>
                  )}

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{d.completedSteps}/{d.totalSteps} steps</span>
                      <span>{Math.round(progressPct)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${progressPct}%`,
                          backgroundColor: d.template.color || '#3e8692',
                        }}
                      />
                    </div>
                  </div>

                  {/* Dates + cycle time */}
                  <div className="flex items-center justify-between mt-3 text-[10px] text-gray-400">
                    <div className="flex items-center gap-2">
                      {d.start_date && (
                        <span>Started {new Date(d.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                      {d.target_completion && (
                        <span>Due {new Date(d.target_completion + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                    </div>
                    {cycleTime !== null && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-0.5">
                            <Timer className="h-3 w-3" />
                            {cycleTime}d
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {d.status === 'complete' ? `Completed in ${cycleTime} days` : `${cycleTime} days elapsed`}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      <DeliverableWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        teamMembers={teamMembers}
        clients={clients}
        onCreated={loadData}
      />

      <TaskDetailModal
        open={taskModalOpen}
        onOpenChange={(open) => { if (!open) { setTaskModalOpen(false); setSelectedTask(null); } }}
        task={selectedTask}
        teamMembers={teamMembers}
        clients={clients}
        onSaved={loadData}
      />
    </div>
  );
}
