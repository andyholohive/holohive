'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Card } from '@/components/ui/card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { formatDate } from '@/lib/dateFormat';
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
  Trash2,
} from 'lucide-react';

const ICON_MAP: Record<string, any> = {
  Rocket, FileText, Handshake, Search, Eye, BarChart3, ClipboardList,
};

// Status pill mapping — pre-v11 used bespoke `${bg-X-50} ${text-X-600}`
// classes. Now driven by the shared StatusBadge palette so the chips
// match every other "status" chip in the app.
const STATUS_TONE: Record<string, BadgeTone> = {
  active:    'info',     // sky
  complete:  'success',  // emerald
  cancelled: 'neutral',  // gray
};
const STATUS_LABEL: Record<string, string> = {
  active:    'Active',
  complete:  'Complete',
  cancelled: 'Cancelled',
};
const STATUS_ICON: Record<string, typeof Clock> = {
  active:    Clock,
  complete:  CheckCircle2,
  cancelled: XCircle,
};

// Subtask status icon tints — kept inline (semantic colors, not chrome).
// These match the STATUS_CONFIG in /tasks/page.tsx for visual parity:
// a "to_do" subtask here is the same gray as a "to_do" task on the
// main HQ list.
const SUBTASK_STATUS: Record<string, { icon: any; color: string }> = {
  to_do:              { icon: Circle,        color: 'text-ink-warm-400' },
  in_progress:        { icon: PlayCircle,    color: 'text-blue-500' },
  paused:             { icon: PauseCircle,   color: 'text-amber-500' },
  ready_for_feedback: { icon: MessageCircle, color: 'text-purple-500' },
  complete:           { icon: CheckCircle2,  color: 'text-emerald-500' },
};

type TeamMember = { id: string; name: string; email: string; role: string };
type ClientOption = { id: string; name: string; logo_url: string | null };

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

  // Delete confirmation state. Holds the target deliverable while the
  // dialog is open; `null` = no confirmation pending. Separate
  // `deleting` flag drives the busy state on the Confirm button.
  const [deleteTarget, setDeleteTarget] = useState<DeliverableWithProgress | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        UserService.getActiveUsers(),
        ClientService.getAllClients(),
      ]);
      setDeliverables(dels);
      setTemplates(tmpls);
      setTeamMembers(users.map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
      setClients(cls.map((c: any) => ({ id: c.id, name: c.name, logo_url: c.logo_url ?? null })));
    } catch (err) {
      console.error('Error loading deliverables:', err);
      toast({ title: 'Load failed', description: err instanceof Error ? err.message : 'Failed to load deliverables', variant: 'destructive' });
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
      toast({ title: 'Deliverable duplicated', description: `Created "${result.parentTask.task_name}" with ${result.subtasks.length} subtasks` });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Duplicate failed', description: err?.message ?? 'Failed to duplicate', variant: 'destructive' });
    }
  };

  /**
   * Permanently remove a deliverable + its workflow (parent task +
   * all subtasks via FK cascade). Called from the confirmation
   * dialog so the user has to acknowledge before anything destructive
   * happens. Closes the dialog on success/failure and reloads the
   * list so the row disappears.
   */
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await DeliverableService.deleteDeliverable(deleteTarget.id);
      toast({
        title: 'Deliverable deleted',
        description: `Removed "${deleteTarget.title}" and its ${deleteTarget.totalSteps} step${deleteTarget.totalSteps === 1 ? '' : 's'}.`,
      });
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message ?? 'Failed to delete', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => deliverables.filter(d => {
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (filterClient !== 'all' && d.client_id !== filterClient) return false;
    if (filterType !== 'all' && d.template_id !== filterType) return false;
    return true;
  }), [deliverables, filterStatus, filterClient, filterType]);

  // Active-filter pretty-string for the SectionHeader counter so it
  // doubles as a "what's narrowed" readout.
  const activeFilterText = useMemo(() => {
    const parts: string[] = [];
    if (filterStatus !== 'all') parts.push(filterStatus);
    if (filterClient !== 'all') {
      const c = clients.find(c => c.id === filterClient);
      if (c) parts.push(c.name);
    }
    if (filterType !== 'all') {
      const t = templates.find(t => t.id === filterType);
      if (t) parts.push(t.name);
    }
    return parts.join(' · ');
  }, [filterStatus, filterClient, filterType, clients, templates]);

  // Header actions — shared between loading + loaded states so the
  // title row doesn't shift on data arrival.
  const headerActions = (
    <Button variant="brand" onClick={() => setWizardOpen(true)}>
      <Plus className="h-4 w-4 mr-2" />
      New Deliverable
    </Button>
  );

  // ── Loading branch ────────────────────────────────────────────────
  // Structural skeleton mirroring the loaded layout: PageHeader (same
  // kicker) → SectionHeader → 3-filter strip → 2 group-card skeletons
  // each with a header + 3 deliverable-row skeletons. Was 2 generic
  // h-64 rounded blocks before, which read as "something's loading"
  // rather than "the page is about to look like X."
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Package}
          title="Deliverables"
          subtitle="Structured workflows from templates"
          kicker="Pinned · HQ · Deliverables"
          kickerDot="amber"
          actions={headerActions}
        />

        {/* SectionHeader skeleton */}
        <div className="section-head first flex items-center gap-3">
          <span className="dot bg-brand/30" aria-hidden />
          <Skeleton className="h-3 w-24" />
          <span className="flex-1 h-px bg-cream-200" aria-hidden />
          <Skeleton className="h-3 w-36" />
        </div>

        {/* Filter row skeleton — 3 select-shaped placeholders. */}
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-[140px] rounded-md" />
          <Skeleton className="h-9 w-[160px] rounded-md" />
          <Skeleton className="h-9 w-[180px] rounded-md" />
        </div>

        {/* Two client-grouped card skeletons. */}
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, gi) => (
            <Card key={gi} className="border-cream-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-cream-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-5 w-40" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
              <div>
                {Array.from({ length: 3 }).map((_, ri) => (
                  <div key={ri} className="px-5 py-3 flex items-center gap-3 border-b border-cream-100 last:border-0">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-7 w-7 rounded-md" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-2 w-24 rounded-full" />
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Loaded branch ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title="Deliverables"
        subtitle="Structured workflows from templates"
        kicker="Pinned · HQ · Deliverables"
        kickerDot="amber"
        actions={headerActions}
      />

      {/* v11 chapter divider — counter shows the live narrowing so
          users see how aggressive their filters are. */}
      <SectionHeader
        label="Deliverables"
        dot="brand"
        counter={`${filtered.length} of ${deliverables.length} deliverables${activeFilterText ? ` · ${activeFilterText}` : ''}`}
        first
      />

      {/* Filters — focus-brand on each SelectTrigger so the focus ring
          stays brand-teal instead of the default browser blue. */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9 text-sm focus-brand">
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
          <SelectTrigger className="w-[160px] h-9 text-sm focus-brand">
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
          <SelectTrigger className="w-[180px] h-9 text-sm focus-brand">
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

      {/* Content — grouped by client */}
      {filtered.length === 0 ? (
        <Card className="border-cream-200 overflow-hidden">
          <EmptyState
            icon={Package}
            title={deliverables.length === 0 ? 'No deliverables yet.' : 'No deliverables match your filters.'}
            description={deliverables.length === 0
              ? 'Create a deliverable from a template to start tracking a structured workflow.'
              : 'Try widening the filters or clearing one.'}
            className="py-16"
          >
            {deliverables.length === 0 && (
              <Button variant="brand" onClick={() => setWizardOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first deliverable
              </Button>
            )}
          </EmptyState>
        </Card>
      ) : (() => {
        // Group deliverables by client. `name` falls back to "Other"
        // (not "Unknown Client") when the deliverable points at a
        // client the user can't see (archived / inaccessible). Reads
        // as a neutral catch-all instead of a bug signal. The
        // `__none__` bucket stays "Internal / No Client" — that's a
        // distinct concept (client_id=null on purpose).
        const grouped: Record<string, { name: string; logoUrl: string | null; deliverables: typeof filtered }> = {};
        for (const d of filtered) {
          const key = d.client_id || '__none__';
          if (!grouped[key]) {
            const matched = d.client_id ? clients.find(c => c.id === d.client_id) : null;
            grouped[key] = {
              name: d.client_id ? (matched?.name || 'Other') : 'Internal / No Client',
              logoUrl: matched?.logo_url ?? null,
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
                <Card key={groupKey} className="border-cream-200 overflow-hidden">
                  {/* Client header — same display-serif rhythm as
                      CardHeaderEditorial, but with a 28px logo tile
                      instead of the 18px lucide icon so the client
                      reads instantly. Falls back to a Building2
                      letter tile for archived/inaccessible clients
                      (the "Other" bucket), and a Briefcase tile for
                      the no-client "Internal" bucket. */}
                  <ClientGroupHeader
                    isNoClientBucket={groupKey === '__none__'}
                    logoUrl={group.logoUrl}
                    name={group.name}
                    count={group.deliverables.length}
                  />

                  {/* Deliverable rows within this client */}
                  <div className="divide-y divide-cream-100">
                    {group.deliverables.map(d => {
                      const Icon = ICON_MAP[d.template.icon] || ClipboardList;
                      // Sort subtasks by step number prefix (e.g. "1. Research", "2. Draft")
                      const sortedSubtasks = [...d.subtasks].sort((a, b) => {
                        const numA = parseInt(a.task_name.match(/^(\d+)\./)?.[1] || '999');
                        const numB = parseInt(b.task_name.match(/^(\d+)\./)?.[1] || '999');
                        if (numA !== numB) return numA - numB;
                        return a.sort_order - b.sort_order;
                      });
                      const tone = STATUS_TONE[d.status] || 'neutral';
                      const StatusIcon = STATUS_ICON[d.status] || Clock;
                      const statusLabel = STATUS_LABEL[d.status] || d.status;
                      const progressPct = d.totalSteps > 0 ? (d.completedSteps / d.totalSteps) * 100 : 0;
                      const cycleTime = getCycleTimeDays(d.start_date, d.parentTask?.completed_at || null, d.status);
                      const isExpanded = expandedCards.has(d.id);

                      return (
                        <div key={d.id} className="group">
                          {/* Deliverable header row */}
                          <div
                            className="px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-cream-50/50 transition-colors"
                            onClick={() => handleCardClick(d)}
                          >
                            {/* Expand toggle */}
                            <button
                              type="button"
                              className="shrink-0 p-0.5 rounded hover:bg-cream-200 transition-colors"
                              onClick={(e) => toggleExpand(d.id, e)}
                              aria-label={isExpanded ? 'Collapse steps' : 'Expand steps'}
                            >
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-ink-warm-400" />
                                : <ChevronRight className="h-4 w-4 text-ink-warm-400" />}
                            </button>

                            {/* Icon — template-color background tint kept
                                (each template has its own accent). */}
                            <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: d.template.color + '15' }}>
                              <Icon className="h-4 w-4" style={{ color: d.template.color }} />
                            </div>

                            {/* Title + template */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-ink-warm-900 truncate">{d.title}</div>
                              <div className="text-[10px] text-ink-warm-400">{d.template.name}</div>
                            </div>

                            {/* Progress bar (compact) */}
                            <div className="w-24 shrink-0">
                              <div className="flex items-center justify-between text-[10px] text-ink-warm-500 mb-0.5 tabular-nums">
                                <span>{d.completedSteps}/{d.totalSteps}</span>
                                <span>{Math.round(progressPct)}%</span>
                              </div>
                              <div className="w-full bg-cream-100 rounded-full h-1">
                                <div
                                  className="h-1 bg-brand rounded-full transition-all"
                                  style={d.template.color
                                    ? { width: `${progressPct}%`, backgroundColor: d.template.color }
                                    : { width: `${progressPct}%` }}
                                />
                              </div>
                            </div>

                            {/* Cycle time */}
                            {cycleTime !== null && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-ink-warm-500 shrink-0 flex items-center gap-0.5 tabular-nums">
                                    <Timer className="h-3 w-3" />
                                    {cycleTime}d
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {d.status === 'complete' ? `Completed in ${cycleTime} days` : `${cycleTime} days elapsed`}
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {/* Status badge — v11 StatusBadge (sky/emerald/
                                neutral from the shared palette). */}
                            <StatusBadge tone={tone} size="sm" className="shrink-0">
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusLabel}
                            </StatusBadge>

                            {/* Duplicate */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                                  onClick={(e) => handleDuplicate(d, e)}
                                  aria-label="Duplicate deliverable"
                                >
                                  <Copy className="h-3.5 w-3.5 text-ink-warm-400" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate</TooltipContent>
                            </Tooltip>

                            {/* Delete — opens a confirmation dialog so
                                a stray click doesn't nuke a workflow. */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 shrink-0 hover:bg-rose-50"
                                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(d); }}
                                  aria-label="Delete deliverable"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>

                          {/* Expanded subtask flow */}
                          {isExpanded && sortedSubtasks.length > 0 && (
                            <div className="px-5 pb-4 pt-1 ml-[52px]">
                              <div className="relative">
                                {/* Vertical connector line */}
                                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-cream-200" />

                                <div className="space-y-0.5">
                                  {sortedSubtasks.map((sub, idx) => {
                                    const sCfg = SUBTASK_STATUS[sub.status] || SUBTASK_STATUS.to_do;
                                    const SIcon = sCfg.icon;
                                    // Check if previous blocking step is incomplete
                                    const prevIncomplete = idx > 0 && sortedSubtasks[idx - 1].status !== 'complete';
                                    const isBlocked = prevIncomplete && sub.status === 'to_do';

                                    return (
                                      <div
                                        key={sub.id}
                                        className={`flex items-center gap-3 py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
                                          isBlocked ? 'opacity-50' : 'hover:bg-cream-50'
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
                                            ? 'line-through text-ink-warm-400'
                                            : isBlocked ? 'text-ink-warm-400' : 'text-ink-warm-700 font-medium'
                                        }`}>
                                          {sub.task_name}
                                        </span>

                                        {/* Blocked indicator */}
                                        {isBlocked && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Lock className="h-3 w-3 text-ink-warm-300 shrink-0" />
                                            </TooltipTrigger>
                                            <TooltipContent>Blocked by previous step</TooltipContent>
                                          </Tooltip>
                                        )}

                                        {/* Assignee */}
                                        {sub.assigned_to_name && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="text-[10px] text-ink-warm-500 shrink-0 flex items-center gap-0.5 bg-cream-100 px-1.5 py-0.5 rounded">
                                                <User className="h-2.5 w-2.5" />
                                                {sub.assigned_to_name.split(' ')[0]}
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent>{sub.assigned_to_name}</TooltipContent>
                                          </Tooltip>
                                        )}

                                        {/* Due date */}
                                        {sub.due_date && (
                                          <span className={`text-[10px] shrink-0 tabular-nums ${
                                            new Date(sub.due_date + 'T23:59:59') < new Date() && sub.status !== 'complete'
                                              ? 'text-rose-500 font-semibold'
                                              : 'text-ink-warm-400'
                                          }`}>
                                            {formatDate(sub.due_date + 'T00:00:00')}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Dates footer */}
                              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-cream-100 text-[10px] text-ink-warm-500 tabular-nums">
                                {d.start_date && (
                                  <span>Started {formatDate(d.start_date + 'T00:00:00')}</span>
                                )}
                                {d.target_completion && (
                                  <span>Target {formatDate(d.target_completion + 'T00:00:00')}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
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

      {/* Delete confirmation dialog — v11 chrome (icon-in-title,
          pinned footer). Lists the step count so users get a sense
          of what's about to disappear ("Delete X and its 8 steps"). */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete deliverable
            </DialogTitle>
            <DialogDescription>
              Permanently remove{' '}
              <span className="font-medium text-ink-warm-900">{deleteTarget?.title}</span>
              {deleteTarget && deleteTarget.totalSteps > 0 && (
                <> and its <span className="font-medium text-ink-warm-900">{deleteTarget.totalSteps}</span> step{deleteTarget.totalSteps === 1 ? '' : 's'}</>
              )}
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Per-client section header. Renders a 28px logo tile on the left
 * (img when available, Building2 letter-tile fallback for "Other",
 * Briefcase tile for the no-client "Internal" bucket), then a
 * display-serif title in the same typography CardHeaderEditorial uses
 * elsewhere, and a count on the right.
 *
 * Bypasses CardHeaderEditorial because its icon slot is fixed at 18px,
 * which is too small for a meaningful client logo. Same hairline +
 * padding as the editorial primitive so the surfaces still match
 * visually.
 */
function ClientGroupHeader({
  isNoClientBucket,
  logoUrl,
  name,
  count,
}: {
  isNoClientBucket: boolean;
  logoUrl: string | null;
  name: string;
  count: number;
}) {
  return (
    <div className="px-5 py-4 border-b border-cream-100 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1 flex items-center gap-2.5">
        {/* Logo / icon tile */}
        {isNoClientBucket ? (
          <div className="w-7 h-7 rounded-md bg-cream-100 border border-cream-200 flex items-center justify-center shrink-0">
            <Briefcase className="h-3.5 w-3.5 text-ink-warm-400" />
          </div>
        ) : logoUrl ? (
          <div className="w-7 h-7 rounded-md overflow-hidden border border-cream-200 bg-white shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={`${name} logo`}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
            {/* Letter tile for clients without a logo, or the "Other"
                bucket where we have no logo by definition. */}
            <Building2 className="h-3.5 w-3.5" />
          </div>
        )}
        <h3 className="display-serif text-[19px] text-ink-warm-900 leading-none truncate">{name}</h3>
      </div>
      <div className="shrink-0 self-center">
        <span className="text-sm text-ink-warm-700 tabular-nums">
          <span className="font-semibold text-ink-warm-900">{count}</span>
          <span className="text-ink-warm-500 ml-1">deliverable{count === 1 ? '' : 's'}</span>
        </span>
      </div>
    </div>
  );
}
