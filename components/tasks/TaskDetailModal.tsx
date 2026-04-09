'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';
import { Task, TaskService } from '@/lib/taskService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { TaskComments } from './TaskComments';
import { TaskAttachments } from './TaskAttachments';
import { TaskChecklist } from './TaskChecklist';
import { SubtaskList } from './SubtaskList';
import { RecurringConfigEditor } from './RecurringConfig';
import { DeliverableProgressTracker } from './DeliverableProgressTracker';
import { DeliverableService } from '@/lib/deliverableService';
import {
  Calendar as CalendarIcon,
  Circle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  MessageCircle,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  FileText,
} from 'lucide-react';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ClientOption = {
  id: string;
  name: string;
};

interface TaskDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  teamMembers: TeamMember[];
  clients: ClientOption[];
  onSaved: () => void;
}

const FREQUENCIES = ['one-time', 'daily', 'weekly', 'monthly', 'recurring'] as const;
const FREQUENCY_LABELS: Record<string, string> = {
  'one-time': 'One-Time', 'daily': 'Daily', 'weekly': 'Weekly', 'monthly': 'Monthly', 'recurring': 'Recurring',
};
const TASK_TYPES = [
  'Admin & Operations', 'Finance & Invoicing', 'General', 'Tech & Tools',
  'Marketing & Sales', 'Client Delivery', 'Performance Review', 'Research & Analytics',
] as const;
const STATUSES = ['to_do', 'in_progress', 'paused', 'ready_for_feedback', 'complete'] as const;
const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  to_do: { label: 'To Do', icon: Circle, color: 'text-gray-400' },
  in_progress: { label: 'In Progress', icon: PlayCircle, color: 'text-blue-500' },
  paused: { label: 'Paused', icon: PauseCircle, color: 'text-amber-500' },
  ready_for_feedback: { label: 'Ready for Feedback', icon: MessageCircle, color: 'text-purple-500' },
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-green-500' },
};
const PRIORITY_CONFIG: Record<string, { label: string; icon: typeof Minus; color: string; bg: string }> = {
  low: { label: 'Low', icon: ArrowDown, color: 'text-gray-400', bg: 'bg-gray-50' },
  medium: { label: 'Medium', icon: Minus, color: 'text-blue-600', bg: 'bg-blue-50' },
  high: { label: 'High', icon: ArrowUp, color: 'text-orange-600', bg: 'bg-orange-50' },
  urgent: { label: 'Urgent', icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  overdue: { label: 'Overdue', icon: AlertCircle, color: 'text-red-700', bg: 'bg-red-50' },
  complete: { label: 'Done', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
};

/** Compute priority automatically based on due date proximity */
function getComputedPriority(dueDate: Date | undefined, status?: string): string {
  if (status === 'complete') return 'complete';
  if (!dueDate) return 'low';
  const now = new Date();
  const due = new Date(dueDate);
  due.setHours(23, 59, 59);
  const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft < 0) return 'overdue';
  if (hoursLeft <= 24) return 'urgent';
  if (hoursLeft <= 48) return 'high';
  if (hoursLeft <= 72) return 'medium';
  return 'low';
}

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function TaskDetailModal({ open, onOpenChange, task, teamMembers, clients, onSaved }: TaskDetailModalProps) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState('details');
  const [hasDeliverable, setHasDeliverable] = useState(false);

  const [form, setForm] = useState({
    task_name: '',
    assigned_to: '' as string,
    due_date: undefined as Date | undefined,
    frequency: '' as string,
    task_type: '' as string,
    link: '',
    latest_comment: '',
    description: '',
    status: 'to_do' as string,
    priority: 'medium' as string,
    client_id: '' as string,
    recurring_config: null as Record<string, any> | null,
  });

  useEffect(() => {
    if (task) {
      setForm({
        task_name: task.task_name,
        assigned_to: task.assigned_to || '',
        due_date: task.due_date ? new Date(task.due_date + 'T00:00:00') : undefined,
        frequency: task.frequency,
        task_type: task.task_type,
        link: task.link || '',
        latest_comment: task.latest_comment || '',
        description: task.description || '',
        status: task.status || 'to_do',
        priority: task.priority || 'medium',
        client_id: task.client_id || '',
        recurring_config: task.recurring_config || null,
      });
      // Check if this task has a linked deliverable
      DeliverableService.getDeliverableByTaskId(task.id).then(d => {
        setHasDeliverable(!!d);
      }).catch(() => setHasDeliverable(false));
    } else {
      setForm({
        task_name: '',
        assigned_to: '',
        due_date: undefined,
        frequency: '',
        task_type: '',
        link: '',
        latest_comment: '',
        description: '',
        status: 'to_do',
        priority: 'medium',
        client_id: '',
        recurring_config: null,
      });
      setActiveDetailTab('details');
      setHasDeliverable(false);
    }
  }, [task, open]);

  const handleSubmit = async () => {
    if (!form.task_name.trim() || !form.frequency || !form.task_type) return;
    if (!user?.id || !userProfile) return;

    setSubmitting(true);
    try {
      const assignedMember = teamMembers.find(m => m.id === form.assigned_to);
      const payload = {
        task_name: form.task_name.trim(),
        assigned_to: form.assigned_to || null,
        assigned_to_name: assignedMember?.name || null,
        due_date: form.due_date ? toLocalDateString(form.due_date) : null,
        frequency: form.frequency,
        task_type: form.task_type,
        link: form.link.trim() || null,
        latest_comment: form.latest_comment.trim() || null,
        description: form.description.trim() || null,
        status: form.status,
        priority: getComputedPriority(form.due_date, form.status),
        client_id: form.client_id || null,
        recurring_config: form.recurring_config || null,
      };

      if (task) {
        await TaskService.updateTask(task.id, payload);
        toast({ title: 'Updated', description: 'Task updated successfully.' });
      } else {
        await TaskService.createTask({
          ...payload,
          created_by: user.id,
          created_by_name: userProfile.name || userProfile.email || 'Unknown',
        });
        toast({ title: 'Created', description: 'Task created successfully.' });
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('Error saving task:', err);
      toast({ title: 'Error', description: 'Failed to save task.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!task) return;
    setSavingTemplate(true);
    try {
      const template = await TaskService.saveTaskAsTemplate(
        task.id,
        form.task_name || task.task_name,
        user?.id || null
      );
      if (template) {
        toast({ title: 'Template Saved', description: `"${template.name}" template created.` });
      }
    } catch (err) {
      console.error('Error saving as template:', err);
      toast({ title: 'Error', description: 'Failed to save as template.', variant: 'destructive' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const isEditing = !!task;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Task' : 'Add Task'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update task details, add comments, or attach files.' : 'Create a new task for the team.'}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="bg-gray-100 w-full justify-start flex-wrap">
              <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
              {hasDeliverable && <TabsTrigger value="workflow" className="text-xs">Workflow</TabsTrigger>}
              <TabsTrigger value="checklist" className="text-xs">Checklist</TabsTrigger>
              <TabsTrigger value="subtasks" className="text-xs">Subtasks</TabsTrigger>
              <TabsTrigger value="comments" className="text-xs">Comments</TabsTrigger>
              <TabsTrigger value="attachments" className="text-xs">Attachments</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex-1 overflow-y-auto mt-3 px-1 pb-4">
              {renderFormFields()}
            </TabsContent>

            {hasDeliverable && (
              <TabsContent value="workflow" className="flex-1 overflow-y-auto mt-3 px-1 pb-4">
                {task && <DeliverableProgressTracker parentTaskId={task.id} />}
              </TabsContent>
            )}

            <TabsContent value="checklist" className="flex-1 overflow-y-auto mt-3 px-1 pb-4">
              {task && <TaskChecklist taskId={task.id} />}
            </TabsContent>

            <TabsContent value="subtasks" className="flex-1 overflow-y-auto mt-3 px-1 pb-4">
              {task && <SubtaskList parentTaskId={task.id} />}
            </TabsContent>

            <TabsContent value="comments" className="flex-1 overflow-y-auto mt-3 px-1 pb-4">
              {task && <TaskComments taskId={task.id} />}
            </TabsContent>

            <TabsContent value="attachments" className="flex-1 overflow-y-auto mt-3 px-1 pb-4">
              {task && <TaskAttachments taskId={task.id} />}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 overflow-y-auto px-1 pb-4">
            {renderFormFields()}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {isEditing && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs mr-auto"
              onClick={handleSaveAsTemplate}
              disabled={savingTemplate}
            >
              <FileText className="h-3 w-3 mr-1" />
              {savingTemplate ? 'Saving...' : 'Save as Template'}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
            onClick={handleSubmit}
            disabled={!form.task_name.trim() || !form.frequency || !form.task_type || submitting}
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : isEditing ? 'Save Changes' : 'Add Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function renderFormFields() {
    return (
      <div className="space-y-4">
        {/* Task Name */}
        <div className="grid gap-2">
          <Label>Task Name <span className="text-red-500">*</span></Label>
          <Input
            value={form.task_name}
            onChange={(e) => setForm({ ...form, task_name: e.target.value })}
            placeholder="Enter task name"
            className="auth-input"
          />
        </div>

        {/* Description */}
        <div className="grid gap-2">
          <Label>Description</Label>
          <div className="task-editor-wrapper">
            <style jsx global>{`
              .task-editor-wrapper {
                height: 200px;
                min-height: 150px;
                max-height: 50vh;
                overflow-y: auto;
                border: 1px solid #e5e7eb;
                border-radius: 0.375rem;
                resize: vertical;
              }
              .task-editor-wrapper .ql-toolbar {
                position: sticky;
                top: 0;
                z-index: 10;
                background: white;
                border-top: none;
                border-left: none;
                border-right: none;
              }
              .task-editor-wrapper .ql-container {
                border: none;
                min-height: 120px;
              }
            `}</style>
            <ReactQuill
              theme="snow"
              value={form.description}
              onChange={(value) => setForm({ ...form, description: value })}
              modules={{
                toolbar: [
                  [{ 'header': [1, 2, 3, false] }],
                  ['bold', 'italic', 'underline'],
                  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                  [{ 'indent': '-1'}, { 'indent': '+1' }],
                  ['link'],
                  ['clean']
                ],
              }}
              placeholder="Add a description..."
              className="bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Assigned To */}
          <div className="grid gap-2">
            <Label>Assigned To</Label>
            <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
              <SelectTrigger className="auth-input"><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div className="grid gap-2">
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="auth-input justify-start text-left font-normal"
                  style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: form.due_date ? '#111827' : '#9ca3af' }}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.due_date ? form.due_date.toLocaleDateString() : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.due_date}
                  onSelect={(date) => setForm({ ...form, due_date: date || undefined })}
                  initialFocus
                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Frequency */}
          <div className="grid gap-2">
            <Label>Frequency <span className="text-red-500">*</span></Label>
            <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
              <SelectTrigger className="auth-input"><SelectValue placeholder="Select frequency" /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Task Type */}
          <div className="grid gap-2">
            <Label>Task Type <span className="text-red-500">*</span></Label>
            <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
              <SelectTrigger className="auth-input"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Status */}
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="auth-input"><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <SelectItem key={s} value={s}>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                        {cfg.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Priority (auto-computed from due date) */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">Priority <span className="text-[10px] text-gray-400 font-normal">(auto)</span></Label>
            {(() => {
              const level = getComputedPriority(form.due_date, form.status);
              const cfg = PRIORITY_CONFIG[level] || PRIORITY_CONFIG.low;
              const Icon = cfg.icon;
              return (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                  <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                  {!form.due_date && <span className="text-[10px] text-gray-400 ml-auto">Set due date to auto-prioritize</span>}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Client */}
          <div className="grid gap-2">
            <Label>Client</Label>
            <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v === '_none' ? '' : v })}>
              <SelectTrigger className="auth-input"><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Link */}
          <div className="grid gap-2">
            <Label>Link</Label>
            <Input
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="https://..."
              className="auth-input"
            />
          </div>
        </div>

        {/* Recurring Config */}
        <RecurringConfigEditor
          value={form.recurring_config as any}
          onChange={(config) => setForm({ ...form, recurring_config: config })}
        />

        {/* Latest Comment (kept for backward compat, only for non-edit mode) */}
        {!isEditing && (
          <div className="grid gap-2">
            <Label>Comment</Label>
            <Textarea
              value={form.latest_comment}
              onChange={(e) => setForm({ ...form, latest_comment: e.target.value })}
              placeholder="Add an initial comment..."
              className="auth-input"
              rows={2}
            />
          </div>
        )}
      </div>
    );
  }
}
