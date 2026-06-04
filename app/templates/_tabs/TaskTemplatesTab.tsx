'use client';

/**
 * Task Templates tab — formerly /tasks/templates (admin-only page).
 * Reusable task presets for quick creation. Moved here on 2026-06-03
 * when the three "Templates" sidebar entries were consolidated into
 * one Templates page with three tabs. The outer shell handles the
 * admin gate, so this tab assumes it only renders for admins.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskService, TaskTemplate } from '@/lib/taskService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { FileText, Plus, Trash2, Copy } from 'lucide-react';

const TASK_TYPES = [
  'Admin & Operations', 'Finance & Invoicing', 'General', 'Tech & Tools',
  'Marketing & Sales', 'Client SOP', 'Client Delivery', 'Performance Review', 'Research & Analytics',
];
const FREQUENCIES = ['one-time', 'daily', 'weekly', 'monthly', 'recurring'];
const FREQUENCY_LABELS: Record<string, string> = {
  'one-time': 'One-Time', 'daily': 'Daily', 'weekly': 'Weekly', 'monthly': 'Monthly', 'recurring': 'Recurring',
};
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export default function TaskTemplatesTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    task_name_template: '',
    task_type: 'General',
    frequency: 'one-time',
    priority: 'medium',
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await TaskService.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.task_name_template) return;
    setCreating(true);
    try {
      await TaskService.createTemplate({
        name: form.name,
        description: form.description || null,
        task_name_template: form.task_name_template,
        task_type: form.task_type,
        frequency: form.frequency,
        priority: form.priority,
        default_assigned_to: null,
        default_client_id: null,
        recurring_config: null,
        checklist_items: [],
        created_by: user?.id || null,
      });
      toast({ title: 'Template created' });
      setShowCreateDialog(false);
      setForm({ name: '', description: '', task_name_template: '', task_type: 'General', frequency: 'one-time', priority: 'medium' });
      loadTemplates();
    } catch (err) {
      console.error('Error creating template:', err);
      toast({ title: 'Create failed', description: err instanceof Error ? err.message : 'Failed to create template', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    if (!user?.id) return;
    try {
      const task = await TaskService.createTaskFromTemplate(templateId, {
        created_by: user.id,
        created_by_name: '',
      });
      if (task) {
        toast({ title: 'Task created', description: `Created "${task.task_name}" from template.` });
      }
    } catch (err) {
      console.error('Error creating from template:', err);
      toast({ title: 'Create failed', description: err instanceof Error ? err.message : 'Failed to create task from template', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await TaskService.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast({ title: 'Template deleted' });
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  // Header actions — extracted so loading + loaded render the same
  // toolbar shape (only Skeleton on the CTA flips on load).
  const headerToolbar = (loadingState: boolean) => (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-ink-warm-500">
        Reusable task presets for quick creation. Use <code className="bg-cream-100 px-1.5 py-0.5 rounded text-xs">{'{{field_name}}'}</code> placeholders for dynamic values.
      </p>
      <Button variant="brand" onClick={() => setShowCreateDialog(true)} disabled={loadingState}>
        <Plus className="h-4 w-4 mr-2" /> New Template
      </Button>
    </div>
  );

  // ── Loading branch ────────────────────────────────────────────────
  // Structural skeleton mirroring the loaded shape: toolbar + Card
  // with header strip + 4 row skeletons. Was 3 generic h-24 rounded
  // blocks before, which gave no hint of the actual list density.
  if (loading) {
    return (
      <div className="space-y-4">
        {headerToolbar(true)}
        <Card className="border-cream-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-cream-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-[18px] w-[18px] rounded" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
          <div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-cream-100 last:border-0">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-8 w-16 rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {headerToolbar(false)}

      {/* Templates List — Card + CardHeaderEditorial matches the
          treatment used on /tasks/deliverables and /dashboard so the
          three Templates tabs feel like the same surface. */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={FileText}
          title="Task Templates"
          action={
            <span className="text-sm text-ink-warm-700 tabular-nums">
              <span className="font-semibold text-ink-warm-900">{templates.length}</span>
              <span className="text-ink-warm-500 ml-1">template{templates.length === 1 ? '' : 's'}</span>
            </span>
          }
        />

        {templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates yet."
            description="Create one above, or save an existing task as a template from the HQ list."
            className="py-12"
          />
        ) : (
          <div className="divide-y divide-cream-100">
            {templates.map((tmpl) => (
              <div key={tmpl.id} className="px-4 py-3 flex items-center gap-3 hover:bg-cream-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-warm-900">{tmpl.name}</p>
                  <p className="text-xs text-ink-warm-500">
                    {tmpl.task_name_template} &middot; {tmpl.task_type} &middot; {tmpl.priority}
                  </p>
                  {tmpl.description && (
                    <p className="text-xs text-ink-warm-400 mt-0.5 truncate">{tmpl.description.replace(/<[^>]+>/g, '')}</p>
                  )}
                </div>
                {tmpl.checklist_items?.length > 0 && (
                  <Badge variant="outline" className="text-xs">{tmpl.checklist_items.length} items</Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleCreateFromTemplate(tmpl.id)}
                >
                  <Copy className="h-3 w-3 mr-1" /> Use
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-rose-50"
                  onClick={() => handleDelete(tmpl.id)}
                  aria-label="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand" />
              Create Template
            </DialogTitle>
            <DialogDescription>Create a reusable task template. Use {'{{field_name}}'} placeholders in the task name for dynamic values.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
            <div className="grid gap-2">
              <Label>Template Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Monthly Client Report"
                className="focus-brand"
              />
            </div>

            <div className="grid gap-2">
              <Label>Task Name Template</Label>
              <Input
                value={form.task_name_template}
                onChange={(e) => setForm({ ...form, task_name_template: e.target.value })}
                placeholder="e.g., Prepare {{client_name}} monthly report"
                className="focus-brand"
              />
            </div>

            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description..."
                rows={3}
                className="focus-brand"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label className="text-xs">Task Type</Label>
                <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button variant="brand" onClick={handleCreate} disabled={!form.name || !form.task_name_template || creating}>
              {creating ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
