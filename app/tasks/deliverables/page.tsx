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
  Circle,
  PlayCircle,
  PauseCircle,
  MessageCircle,
  Clock,
  XCircle,
  Copy,
  Timer,
  ChevronDown,
  ChevronRight,
  User,
  Lock,
  Building2,
  Briefcase,
} from 'lucide-react';

const ICON_MAP: Record<string, any> = {
  Rocket, FileText, Handshake, Search, Eye, BarChart3, ClipboardList,
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  active: { label: 'Active', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
};

const SUBTASK_STATUS: Record<string, { icon: any; color: string }> = {
  to_do: { icon: Circle, color: 'text-gray-400' },
  in_progress: { icon: PlayCircle, color: 'text-blue-500' },
  paused: { icon: PauseCircle, color: 'text-amber-500' },
  ready_for_feedback: { icon: MessageCircle, color: 'text-purple-500' },
  complete: { icon: CheckCircle2, color: 'text-green-500' },
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

  // Expanded cards (show subtasks inline)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

      {/* Content — grouped by client */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-64 rounded-lg" />
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
      ) : (() => {
        // Group deliverables by client
        const grouped: Record<string, { name: string; deliverables: typeof filtered }> = {};
        for (const d of filtered) {
          const key = d.client_id || '__none__';
          if (!grouped[key]) {
            grouped[key] = {
              name: d.client_id ? clients.find(c => c.id === d.client_id)?.name || 'Unknown Client' : 'Internal / No Client',
              deliverables: [],
            };
          }
          grouped[key].deliverables.push(d);
        }
        // Sort: client groups first (alphabetical), then "no client" last
        const sortedGroups = Object.entries(grouped).sort(([aKey, aVal], [bKey, bVal]) => {
          if (aKey === '__none__') return 1;
          if (bKey === '__none__') return -1;
          return aVal.name.localeCompare(bVal.name);
        });

        return (
          <TooltipProvider>
            <div className="space-y-6">
              {sortedGroups.map(([groupKey, group]) => (
                <div key={groupKey} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {/* Client header */}
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {groupKey === '__none__'
                        ? <Briefcase className="h-4 w-4 text-gray-400" />
                        : <Building2 className="h-4 w-4" style={{ color: '#3e8692' }} />}
                      <span className="text-sm font-semibold text-gray-900">{group.name}</span>
                      <Badge variant="outline" className="text-[10px]">{group.deliverables.length}</Badge>
                    </div>
                  </div>

                  {/* Deliverable cards within this client */}
                  <div className="divide-y divide-gray-100">
                    {group.deliverables.map(d => {
                      const Icon = ICON_MAP[d.template.icon] || ClipboardList;
                      const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.active;
                      const StatusIcon = statusCfg.icon;
                      const progressPct = d.totalSteps > 0 ? (d.completedSteps / d.totalSteps) * 100 : 0;
                      const cycleTime = getCycleTimeDays(d.start_date, d.parentTask?.completed_at || null, d.status);
                      const isExpanded = expandedCards.has(d.id);

                      return (
                        <div key={d.id} className="group">
                          {/* Deliverable header row */}
                          <div
                            className="px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                            onClick={() => handleCardClick(d)}
                          >
                            {/* Expand toggle */}
                            <button
                              className="shrink-0 p-0.5 rounded hover:bg-gray-200 transition-colors"
                              onClick={(e) => toggleExpand(d.id, e)}
                            >
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-gray-400" />
                                : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            </button>

                            {/* Icon */}
                            <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: d.template.color + '15' }}>
                              <Icon className="h-4 w-4" style={{ color: d.template.color }} />
                            </div>

                            {/* Title + template */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{d.title}</div>
                              <div className="text-[10px] text-gray-400">{d.template.name}</div>
                            </div>

                            {/* Progress bar (compact) */}
                            <div className="w-24 shrink-0">
                              <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                                <span>{d.completedSteps}/{d.totalSteps}</span>
                                <span>{Math.round(progressPct)}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1">
                                <div
                                  className="h-1 rounded-full transition-all"
                                  style={{ width: `${progressPct}%`, backgroundColor: d.template.color || '#3e8692' }}
                                />
                              </div>
                            </div>

                            {/* Cycle time */}
                            {cycleTime !== null && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-0.5">
                                    <Timer className="h-3 w-3" />
                                    {cycleTime}d
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {d.status === 'complete' ? `Completed in ${cycleTime} days` : `${cycleTime} days elapsed`}
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {/* Status badge */}
                            <Badge className={`${statusCfg.bg} ${statusCfg.color} border-0 text-[10px] shrink-0`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusCfg.label}
                            </Badge>

                            {/* Duplicate */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                                  onClick={(e) => handleDuplicate(d, e)}
                                >
                                  <Copy className="h-3 w-3 text-gray-400" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate</TooltipContent>
                            </Tooltip>
                          </div>

                          {/* Expanded subtask flow */}
                          {isExpanded && d.subtasks.length > 0 && (
                            <div className="px-5 pb-4 pt-1 ml-[52px]">
                              <div className="relative">
                                {/* Vertical connector line */}
                                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />

                                <div className="space-y-0.5">
                                  {d.subtasks.map((sub, idx) => {
                                    const sCfg = SUBTASK_STATUS[sub.status] || SUBTASK_STATUS.to_do;
                                    const SIcon = sCfg.icon;
                                    // Check if previous blocking step is incomplete
                                    const prevIncomplete = idx > 0 && d.subtasks[idx - 1].status !== 'complete';
                                    const isBlocked = prevIncomplete && sub.status === 'to_do';

                                    return (
                                      <div
                                        key={sub.id}
                                        className={`flex items-center gap-3 py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
                                          isBlocked ? 'opacity-50' : 'hover:bg-gray-50'
                                        }`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTask(sub);
                                          setTaskModalOpen(true);
                                        }}
                                      >
                                        {/* Status icon (overlays the connector line) */}
                                        <div className="relative z-10 bg-white rounded-full shrink-0">
                                          <SIcon className={`h-4 w-4 ${sCfg.color}`} />
                                        </div>

                                        {/* Step name */}
                                        <span className={`flex-1 text-xs truncate ${
                                          sub.status === 'complete'
                                            ? 'line-through text-gray-400'
                                            : isBlocked ? 'text-gray-400' : 'text-gray-700 font-medium'
                                        }`}>
                                          {sub.task_name}
                                        </span>

                                        {/* Blocked indicator */}
                                        {isBlocked && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Lock className="h-3 w-3 text-gray-300 shrink-0" />
                                            </TooltipTrigger>
                                            <TooltipContent>Blocked by previous step</TooltipContent>
                                          </Tooltip>
                                        )}

                                        {/* Assignee */}
                                        {sub.assigned_to_name && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded">
                                                <User className="h-2.5 w-2.5" />
                                                {sub.assigned_to_name.split(' ')[0]}
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent>{sub.assigned_to_name}</TooltipContent>
                                          </Tooltip>
                                        )}

                                        {/* Due date */}
                                        {sub.due_date && (
                                          <span className={`text-[10px] shrink-0 ${
                                            new Date(sub.due_date + 'T23:59:59') < new Date() && sub.status !== 'complete'
                                              ? 'text-red-500 font-semibold'
                                              : 'text-gray-400'
                                          }`}>
                                            {new Date(sub.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Dates footer */}
                              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
                                {d.start_date && (
                                  <span>Started {new Date(d.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                )}
                                {d.target_completion && (
                                  <span>Target {new Date(d.target_completion + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </TooltipProvider>
        );
      })()}

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
