'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
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
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

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
      toast({ title: 'Created', description: 'Automation rule created.' });
      setShowCreateDialog(false);
      setNewRule({
        name: '', trigger_type: '', trigger_config: {},
        action_type: '', action_config: {}, scope: 'global', scope_value: null,
      });
      loadData();
    } catch (err) {
      console.error('Error creating automation:', err);
      toast({ title: 'Error', description: 'Failed to create automation.', variant: 'destructive' });
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
      toast({ title: 'Deleted', description: 'Automation rule deleted.' });
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

  if (!isAdmin) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
          <p className="text-gray-600">Admin access required.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="w-full space-y-4">
        {/* Header */}
        <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/tasks">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="bg-amber-50 p-2 rounded-lg">
                <Zap className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Task Automations</h2>
                <p className="text-sm text-gray-500">Manage automation rules and view execution history</p>
              </div>
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-2" /> New Rule
            </Button>
          </div>
        </div>

        {/* Automation Rules */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" />
            <h3 className="font-semibold text-sm text-gray-900">Active Rules</h3>
            <Badge variant="secondary" className="text-xs">{automations.length}</Badge>
          </div>

          {automations.length === 0 ? (
            <div className="p-8 text-center">
              <Zap className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No automation rules yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {automations.map((auto) => (
                <div key={auto.id} className="px-4 py-3 flex items-center gap-3">
                  <Switch
                    checked={auto.is_active}
                    onCheckedChange={() => handleToggle(auto.id, auto.is_active)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{auto.name}</p>
                    <p className="text-xs text-gray-500">
                      When: <span className="font-medium">{TRIGGER_TYPES.find(t => t.value === auto.trigger_type)?.label || auto.trigger_type}</span>
                      {' → '}
                      Then: <span className="font-medium">{ACTION_TYPES.find(a => a.value === auto.action_type)?.label || auto.action_type}</span>
                    </p>
                  </div>
                  <Badge variant={auto.is_active ? 'default' : 'secondary'} className="text-xs">
                    {auto.is_active ? 'Active' : 'Paused'}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {SCOPE_OPTIONS.find(s => s.value === auto.scope)?.label || auto.scope}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => handleDelete(auto.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Execution Log */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-600" />
            <h3 className="font-semibold text-sm text-gray-900">Execution Log</h3>
            <Badge variant="secondary" className="text-xs">{logs.length}</Badge>
          </div>

          {logs.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No automation executions yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="px-4 py-2.5 flex items-center gap-3">
                  {log.action_taken === 'recurring_clone' ? (
                    <RefreshCw className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      {log.action_taken === 'recurring_clone' ? 'Recurring task cloned' : log.action_taken}
                    </p>
                    {log.details && (
                      <p className="text-xs text-gray-500 truncate">
                        {log.details.next_due_date && `Next due: ${log.details.next_due_date}`}
                        {log.details.source_task_id && ` | Source: ${log.details.source_task_id.substring(0, 8)}...`}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{formatTimeAgo(log.executed_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Rule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Automation Rule</DialogTitle>
            <DialogDescription>Set up a new task automation trigger and action.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Rule Name</Label>
              <Input
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                placeholder="e.g., Notify on overdue tasks"
                className="auth-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Trigger</Label>
                <Select value={newRule.trigger_type} onValueChange={(v) => setNewRule({ ...newRule, trigger_type: v })}>
                  <SelectTrigger className="auth-input"><SelectValue placeholder="Select trigger" /></SelectTrigger>
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
                  <SelectTrigger className="auth-input"><SelectValue placeholder="Select action" /></SelectTrigger>
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
                <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newRule.name || !newRule.trigger_type || !newRule.action_type || creating}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              {creating ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
