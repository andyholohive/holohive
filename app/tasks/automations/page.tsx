'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { TaskService, TaskAutomation, TaskAutomationLog } from '@/lib/taskService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Zap,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

const TRIGGER_TYPES = [
  { value: 'status_change', label: 'Status Change' },
  { value: 'due_date_passed', label: 'Due Date Passed' },
  { value: 'stale_task', label: 'Task Becomes Stale' },
];

const ACTION_TYPES = [
  { value: 'notify_telegram', label: 'Send Telegram Notification' },
  { value: 'change_status', label: 'Change Status' },
  { value: 'assign_to', label: 'Assign To User' },
  { value: 'add_comment', label: 'Add Comment' },
];

const SCOPE_OPTIONS = [
  { value: 'global', label: 'All Tasks' },
  { value: 'task_type', label: 'By Task Type' },
  { value: 'client', label: 'By Client' },
];

export default function AutomationsPage() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [automations, setAutomations] = useState<TaskAutomation[]>([]);
  const [logs, setLogs] = useState<TaskAutomationLog[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newRule, setNewRule] = useState({
    name: '',
    trigger_type: '',
    trigger_config: {} as Record<string, any>,
    action_type: '',
    action_config: {} as Record<string, any>,
    scope: 'global',
    scope_value: null as string | null,
  });

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [automationsData, logsData] = await Promise.all([
        TaskService.getAutomations(),
        TaskService.getAutomationLogs(50),
      ]);
      setAutomations(automationsData);
      setLogs(logsData);
    } catch (err) {
      console.error('Error loading automations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newRule.name || !newRule.trigger_type || !newRule.action_type) return;
    setCreating(true);
    try {
      await TaskService.createAutomation({
        name: newRule.name,
        trigger_type: newRule.trigger_type,
        trigger_config: newRule.trigger_config,
        action_type: newRule.action_type,
        action_config: newRule.action_config,
        scope: newRule.scope,
        scope_value: newRule.scope_value,
        is_active: true,
        created_by: userProfile?.id || null,
      });
      toast({ title: 'Automation created' });
      setShowCreateDialog(false);
      setNewRule({
        name: '', trigger_type: '', trigger_config: {},
        action_type: '', action_config: {}, scope: 'global', scope_value: null,
      });
      loadData();
    } catch (err) {
      console.error('Error creating automation:', err);
      toast({ title: 'Create failed', description: err instanceof Error ? err.message : 'Failed to create automation', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await TaskService.updateAutomation(id, { is_active: !isActive });
      setAutomations(prev => prev.map(a => a.id === id ? { ...a, is_active: !isActive } : a));
    } catch (err) {
      console.error('Error toggling automation:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await TaskService.deleteAutomation(id);
      setAutomations(prev => prev.filter(a => a.id !== id));
      toast({ title: 'Automation deleted' });
    } catch (err) {
      console.error('Error deleting automation:', err);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // ── Locked-out branch ────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Zap}
          title="Task Automations"
          subtitle="Manage automation rules and view execution history"
          kicker="Workspace · HQ · Automations"
          kickerDot="brand"
        />
        <Card className="border-cream-200 overflow-hidden">
          <EmptyState
            icon={AlertTriangle}
            title="Admin access required."
            description="Automation rules are managed by team admins. Reach out if you think you should have access."
            className="py-16"
          />
        </Card>
      </div>
    );
  }

  // Header CTA — shared between loading + loaded so the row doesn't
  // shift when data arrives.
  const headerActions = (
    <Button variant="brand" onClick={() => setShowCreateDialog(true)} disabled={loading}>
      <Plus className="h-4 w-4 mr-2" /> New Rule
    </Button>
  );

  // ── Loading branch ───────────────────────────────────────────────
  // Structural skeleton mirroring loaded shape: PageHeader (same
  // kicker) + 2 Card skeletons (Rules + Log) each with a header strip
  // and 3 row skeletons. Was 3 generic h-20 rounded blocks before.
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Zap}
          title="Task Automations"
          subtitle="Manage automation rules and view execution history"
          kicker="Workspace · HQ · Automations"
          kickerDot="brand"
          actions={headerActions}
        />
        {Array.from({ length: 2 }).map((_, ci) => (
          <Card key={ci} className="border-cream-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-cream-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-[18px] w-[18px] rounded" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
            <div>
              {Array.from({ length: 3 }).map((_, ri) => (
                <div key={ri} className="px-4 py-3 flex items-center gap-3 border-b border-cream-100 last:border-0">
                  <Skeleton className="h-5 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-72" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded" />
                  <Skeleton className="h-5 w-16 rounded" />
                  <Skeleton className="h-7 w-7 rounded-md" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // ── Loaded branch ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Zap}
        title="Task Automations"
        subtitle="Manage automation rules and view execution history"
        kicker="Workspace · HQ · Automations"
        kickerDot="brand"
        actions={headerActions}
      />

      {/* Automation Rules — Card + CardHeaderEditorial matches the
          treatment on /templates so HQ admin surfaces feel like the
          same family. */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Zap}
          iconClassName="text-amber-600"
          title="Active Rules"
          action={
            <span className="text-sm text-ink-warm-700 tabular-nums">
              <span className="font-semibold text-ink-warm-900">{automations.length}</span>
              <span className="text-ink-warm-500 ml-1">rule{automations.length === 1 ? '' : 's'}</span>
            </span>
          }
        />

        {automations.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No automation rules yet."
            description="Create one with the button above to trigger Telegram pings, status changes, or auto-assignments on task events."
            className="py-12"
          />
        ) : (
          <div className="divide-y divide-cream-100">
            {automations.map((auto) => (
              <div key={auto.id} className="px-4 py-3 flex items-center gap-3 hover:bg-cream-50/60 transition-colors">
                <Switch
                  checked={auto.is_active}
                  onCheckedChange={() => handleToggle(auto.id, auto.is_active)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-warm-900">{auto.name}</p>
                  <p className="text-xs text-ink-warm-500">
                    When: <span className="font-medium">{TRIGGER_TYPES.find(t => t.value === auto.trigger_type)?.label || auto.trigger_type}</span>
                    {' → '}
                    Then: <span className="font-medium">{ACTION_TYPES.find(a => a.value === auto.action_type)?.label || auto.action_type}</span>
                  </p>
                </div>
                <StatusBadge tone={auto.is_active ? 'success' : 'neutral'} size="sm">
                  {auto.is_active ? 'Active' : 'Paused'}
                </StatusBadge>
                <Badge variant="outline" className="text-xs">
                  {SCOPE_OPTIONS.find(s => s.value === auto.scope)?.label || auto.scope}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-rose-50"
                  onClick={() => handleDelete(auto.id)}
                  aria-label="Delete automation"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Execution Log */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Clock}
          iconClassName="text-ink-warm-500"
          title="Execution Log"
          action={
            <span className="text-sm text-ink-warm-700 tabular-nums">
              <span className="font-semibold text-ink-warm-900">{logs.length}</span>
              <span className="text-ink-warm-500 ml-1">event{logs.length === 1 ? '' : 's'}</span>
            </span>
          }
        />

        {logs.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No automation executions yet."
            description="When a rule fires, its execution will show up here with the action taken."
            className="py-12"
          />
        ) : (
          <div className="divide-y divide-cream-100 max-h-[400px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex items-center gap-3">
                {log.action_taken === 'recurring_clone' ? (
                  <RefreshCw className="h-4 w-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-warm-900">
                    {log.action_taken === 'recurring_clone' ? 'Recurring task cloned' : log.action_taken}
                  </p>
                  {log.details && (
                    <p className="text-xs text-ink-warm-500 truncate">
                      {log.details.next_due_date && `Next due: ${log.details.next_due_date}`}
                      {log.details.source_task_id && ` | Source: ${log.details.source_task_id.substring(0, 8)}...`}
                    </p>
                  )}
                </div>
                <span className="text-xs text-ink-warm-400 tabular-nums">{formatTimeAgo(log.executed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create Rule Dialog — v11 scroll/footer pattern (max-h-[85vh]
          flex flex-col + inner scroll surface + footer with border-t). */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand" />
              Create Automation Rule
            </DialogTitle>
            <DialogDescription>Set up a new task automation trigger and action.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
            <div className="grid gap-2">
              <Label>Rule Name</Label>
              <Input
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                placeholder="e.g., Notify on overdue tasks"
                className="focus-brand"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Trigger</Label>
                <Select value={newRule.trigger_type} onValueChange={(v) => setNewRule({ ...newRule, trigger_type: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select trigger" /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Action</Label>
                <Select value={newRule.action_type} onValueChange={(v) => setNewRule({ ...newRule, action_type: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select action" /></SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Scope</Label>
              <Select value={newRule.scope} onValueChange={(v) => setNewRule({ ...newRule, scope: v })}>
                <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button variant="brand" onClick={handleCreate} disabled={!newRule.name || !newRule.trigger_type || !newRule.action_type || creating}>
              {creating ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
