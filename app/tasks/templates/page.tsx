'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskService, TaskTemplate } from '@/lib/taskService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Plus,
  Trash2,
  Copy,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

const TASK_TYPES = [
  'Admin & Operations', 'Finance & Invoicing', 'General', 'Tech & Tools',
  'Marketing & Sales', 'Client SOP', 'Client Delivery', 'Performance Review', 'Research & Analytics',
];
const FREQUENCIES = ['one-time', 'daily', 'weekly', 'monthly', 'recurring'];
const FREQUENCY_LABELS: Record<string, string> = {
  'one-time': 'One-Time', 'daily': 'Daily', 'weekly': 'Weekly', 'monthly': 'Monthly', 'recurring': 'Recurring',
};
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export default function TemplatesPage() {
  const { user, userProfile } = useAuth();
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

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

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
      toast({ title: 'Created', description: 'Template created successfully.' });
      setShowCreateDialog(false);
      setForm({ name: '', description: '', task_name_template: '', task_type: 'General', frequency: 'one-time', priority: 'medium' });
      loadTemplates();
    } catch (err) {
      console.error('Error creating template:', err);
      toast({ title: 'Error', description: 'Failed to create template.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    if (!user?.id || !userProfile) return;
    try {
      const task = await TaskService.createTaskFromTemplate(templateId, {
        created_by: user.id,
        created_by_name: userProfile.name || userProfile.email || 'Unknown',
      });
      if (task) {
        toast({ title: 'Task Created', description: `Created "${task.task_name}" from template.` });
      }
    } catch (err) {
      console.error('Error creating from template:', err);
      toast({ title: 'Error', description: 'Failed to create task from template.', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await TaskService.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast({ title: 'Deleted', description: 'Template deleted.' });
    } catch (err) {
      console.error('Error deleting template:', err);
    }
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
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
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
              <div className="bg-violet-50 p-2 rounded-lg">
                <FileText className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Task Templates</h2>
                <p className="text-sm text-gray-500">Reusable task presets for quick creation</p>
              </div>
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-2" /> New Template
            </Button>
          </div>
        </div>

        {/* Templates List */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-600" />
            <h3 className="font-semibold text-sm text-gray-900">Templates</h3>
            <Badge variant="secondary" className="text-xs">{templates.length}</Badge>
          </div>

          {templates.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No templates yet. Create one or save a task as a template.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {templates.map((tmpl) => (
                <div key={tmpl.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{tmpl.name}</p>
                    <p className="text-xs text-gray-500">
                      {tmpl.task_name_template} &middot; {tmpl.task_type} &middot; {tmpl.priority}
                    </p>
                    {tmpl.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{tmpl.description.replace(/<[^>]+>/g, '')}</p>
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
                    className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => handleDelete(tmpl.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>Create a reusable task template. Use {'{{field_name}}'} placeholders in the task name for dynamic values.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || !form.task_name_template || creating}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              {creating ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
