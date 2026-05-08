'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { UserService } from '@/lib/userService';
import { TaskService, Task } from '@/lib/taskService';
import { ClientService } from '@/lib/clientService';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { DeliverableWizard } from '@/components/tasks/DeliverableWizard';
import { RecurringConfigEditor } from '@/components/tasks/RecurringConfig';
import { DeliverableService } from '@/lib/deliverableService';
import { useToast } from '@/hooks/use-toast';
import { toneClassName, type BadgeTone } from '@/components/ui/status-badge';
import {
  Plus,
  ListTodo,
  Package,
  Search,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  Expand,
  User,
  GripVertical,
  Circle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  MessageCircle,
  Clock,
  RefreshCw,
  ListChecks,
} from 'lucide-react';

const STALE_DAYS = 7;
function isTaskStale(task: Task): boolean {
  if (task.status === 'complete' || task.status === 'paused') return false;
  const diff = Date.now() - new Date(task.updated_at).getTime();
  return diff > STALE_DAYS * 24 * 60 * 60 * 1000;
}

/** Compute priority automatically based on how close the due date is */
function getComputedPriority(dueDate: string | null, status?: string): { level: string; label: string; color: string; bg: string } {
  if (status === 'complete') return { level: 'complete', label: 'Done', color: 'text-green-600', bg: 'bg-green-50' };
  if (!dueDate) return { level: 'low', label: 'Low', color: 'text-gray-400', bg: 'bg-gray-50' };
  const now = new Date();
  const due = new Date(dueDate + 'T23:59:59');
  const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft < 0) return { level: 'overdue', label: 'Overdue', color: 'text-red-700', bg: 'bg-red-50' };
  if (hoursLeft <= 24) return { level: 'urgent', label: 'Urgent', color: 'text-red-600', bg: 'bg-red-50' };
  if (hoursLeft <= 48) return { level: 'high', label: 'High', color: 'text-orange-600', bg: 'bg-orange-50' };
  if (hoursLeft <= 72) return { level: 'medium', label: 'Medium', color: 'text-blue-600', bg: 'bg-blue-50' };
  return { level: 'low', label: 'Low', color: 'text-gray-400', bg: 'bg-gray-50' };
}

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_photo_url: string | null;
};

type EditingCell = { taskId: string; field: string } | null;

const FREQUENCIES = ['one-time', 'daily', 'weekly', 'monthly', 'recurring'] as const;
const FREQUENCY_LABELS: Record<string, string> = {
  'one-time': 'One-Time',
  'daily': 'Daily',
  'weekly': 'Weekly',
  'monthly': 'Monthly',
  'recurring': 'Recurring',
};
const TASK_TYPES = [
  'Admin & Operations',
  'Finance & Invoicing',
  'General',
  'Tech & Tools',
  'Marketing & Sales',
  'Client Delivery',
  'Performance Review',
  'Research & Analytics',
] as const;

const STATUSES = ['to_do', 'in_progress', 'paused', 'ready_for_feedback', 'complete'] as const;
const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string; bg: string }> = {
  to_do: { label: 'To Do', icon: Circle, color: 'text-gray-400', bg: 'hover:bg-gray-100' },
  in_progress: { label: 'In Progress', icon: PlayCircle, color: 'text-blue-500', bg: 'hover:bg-blue-50' },
  paused: { label: 'Paused', icon: PauseCircle, color: 'text-amber-500', bg: 'hover:bg-amber-50' },
  ready_for_feedback: { label: 'Ready for Feedback', icon: MessageCircle, color: 'text-purple-500', bg: 'hover:bg-purple-50' },
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-green-500', bg: 'hover:bg-green-50' },
};

// Map frequency / type values to badge tones from the centralized
// palette (components/ui/status-badge.tsx). Adding a new value? Pick
// from the existing tone names — don't add brand-new colors here, the
// point of consolidating was to stop inventing palettes per page.
//
// Note: the original tasks-page typeBadge had cyan / violet / indigo
// tones that don't exist in the shared palette. Mapped them to the
// closest neighbors (info / purple / slate) — visually similar, no
// hidden semantic loss.
const FREQUENCY_TONES: Record<string, BadgeTone> = {
  'one-time': 'neutral',
  daily:      'info',
  weekly:     'success',
  monthly:    'purple',
  recurring:  'warning',
};

const TYPE_TONES: Record<string, BadgeTone> = {
  'Admin & Operations':    'slate',
  'Finance & Invoicing':   'success',
  'General':               'neutral',
  'Tech & Tools':          'info',
  'Marketing & Sales':     'pink',
  'Client Delivery':       'brand',
  'Performance Review':    'purple',
  'Research & Analytics':  'slate',
};

const frequencyBadge = (freq: string) =>
  toneClassName(FREQUENCY_TONES[freq] ?? 'neutral');

const typeBadge = (type: string) =>
  toneClassName(TYPE_TONES[type] ?? 'neutral');

const getDueDateColor = (dueDate: string | null) => {
  if (!dueDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-600 font-semibold';
  if (diffDays <= 3) return 'text-amber-600 font-semibold';
  return 'text-gray-600';
};

/** Format a Date to YYYY-MM-DD in local timezone (avoids UTC offset issues) */
const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Fixed column widths for consistency across all tables
const COL: Record<string, string> = {
  reorder: 'w-[40px]',
  status: 'w-[32px]',
  taskName: 'min-w-[160px]',
  priority: 'w-[80px]',
  assignee: 'w-[100px]',
  client: 'w-[100px]',
  dueDate: 'w-[90px]',
  comment: 'w-[100px]',
  frequency: 'w-[90px]',
  type: 'w-[110px]',
  link: 'w-[60px]',
  createdBy: 'w-[90px]',
  created: 'w-[70px]',
  // Finish-date column. Only rendered when showCompleted=true (filtered
  // out of columnOrder before the table maps over it). Same width as
  // dueDate for visual consistency.
  completedAt: 'w-[90px]',
  // Recurring column. Compact button-trigger that opens a popover with
  // the RecurringConfigEditor (the same UI from the task detail modal).
  // Lets users enable/edit "auto-recreate on complete" without opening
  // the modal.
  recurring: 'w-[100px]',
  actions: 'w-[60px]',
};

type ColumnKey = 'taskName' | 'priority' | 'assignee' | 'client' | 'dueDate' | 'comment' | 'frequency' | 'recurring' | 'type' | 'link' | 'createdBy' | 'created' | 'completedAt';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'taskName', label: 'Task Name' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'client', label: 'Client' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'comment', label: 'Comment' },
  { key: 'frequency', label: 'Frequency' },
  // Recurring auto-recreate config (placed next to Frequency since
  // they're semantically related). Clicking opens a popover with the
  // shared RecurringConfigEditor used in the task detail modal.
  { key: 'recurring', label: 'Recurring' },
  { key: 'type', label: 'Type' },
  { key: 'link', label: 'Link' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'created', label: 'Created' },
  { key: 'completedAt', label: 'Completed' },
];

const DEFAULT_COLUMN_ORDER: ColumnKey[] = COLUMN_DEFS.map(c => c.key);
const COLUMN_ORDER_KEY = 'tasks-column-order';

export default function TasksPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<string>('one-time');
  const [searchTerm, setSearchTerm] = useState('');
  // Completed tasks are HIDDEN by default — they were cluttering the list.
  // Persisted in localStorage so the choice survives reloads.
  const [showCompleted, setShowCompleted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tasks_show_completed') === 'true';
    }
    return false;
  });
  const [collapsedUsers, setCollapsedUsers] = useState<Set<string>>(new Set());

  // Column order (persisted to localStorage)
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const dragColRef = useRef<ColumnKey | null>(null);
  const dragOverColRef = useRef<ColumnKey | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_ORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnKey[];
        // Validate: must contain exactly the same keys
        if (parsed.length === DEFAULT_COLUMN_ORDER.length && DEFAULT_COLUMN_ORDER.every(k => parsed.includes(k))) {
          setColumnOrder(parsed);
        }
      }
    } catch {}
  }, []);

  const handleColumnDragStart = (col: ColumnKey) => {
    dragColRef.current = col;
  };

  const handleColumnDragOver = (e: React.DragEvent, col: ColumnKey) => {
    e.preventDefault();
    dragOverColRef.current = col;
  };

  const handleColumnDrop = () => {
    const from = dragColRef.current;
    const to = dragOverColRef.current;
    dragColRef.current = null;
    dragOverColRef.current = null;
    if (!from || !to || from === to) return;

    setColumnOrder(prev => {
      const newOrder = [...prev];
      const fromIdx = newOrder.indexOf(from);
      const toIdx = newOrder.indexOf(to);
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, from);
      localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(newOrder));
      return newOrder;
    });
  };

  // Inline editing state
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Adding new row inline (pipeline pattern)
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newRowName, setNewRowName] = useState('');

  // Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deliverableProgress, setDeliverableProgress] = useState<Record<string, { done: number; total: number }>>({}); // taskId -> progress
  // Per-task checklist progress. Built by a single bulk fetch in
  // fetchTasks. Used to render a clickable badge on the task row so
  // checklists become visible from the table view (was previously
  // hidden inside the detail modal).
  const [checklistCounts, setChecklistCounts] = useState<Record<string, { done: number; total: number }>>({});

  useEffect(() => {
    fetchTasks();
    UserService.getAllUsers().then((users) => {
      setTeamMembers(
        users
          .filter(u => u.role !== 'client')
          .map(u => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role, profile_photo_url: u.profile_photo_url || null }))
      );
    });
    ClientService.getAllClients().then((c) => {
      setClients(c.map(cl => ({ id: cl.id, name: cl.name })));
    }).catch(() => {});
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await TaskService.getAllTasks();
      setTasks(data);
      // Load comment + checklist counts in parallel — each is a single
      // bulk select. Both maps drive small badges on the task row.
      if (data.length > 0) {
        const ids = data.map(t => t.id);
        const [comments, checklists] = await Promise.all([
          TaskService.getCommentCounts(ids),
          TaskService.getChecklistCounts(ids),
        ]);
        setCommentCounts(comments);
        setChecklistCounts(checklists);
      }
      // Load deliverable progress for parent tasks
      DeliverableService.getDeliverables().then(dels => {
        const progress: Record<string, { done: number; total: number }> = {};
        dels.forEach(d => {
          progress[d.parent_task_id] = { done: d.completedSteps, total: d.totalSteps };
        });
        setDeliverableProgress(progress);
      }).catch(() => {});
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
    setLoading(false);
  };

  // Build a map of user id -> profile photo
  const userPhotoMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    teamMembers.forEach(m => { map[m.id] = m.profile_photo_url; });
    return map;
  }, [teamMembers]);

  // Tab counts. Counts reflect what the user actually SEES on each tab,
  // so completed tasks are excluded from the totals when the toggle is
  // off (matches the filtered list rendered below). Otherwise the
  // count would be larger than the visible row count, which is confusing.
  const deliverableTaskIds = useMemo(() => new Set(Object.keys(deliverableProgress)), [deliverableProgress]);
  const visibilityFilter = (t: Task) => showCompleted || t.status !== 'complete';

  const oneTimeCount = useMemo(() =>
    tasks.filter(t => t.frequency === 'one-time' && !deliverableTaskIds.has(t.id) && !t.parent_task_id && visibilityFilter(t)).length,
    [tasks, deliverableTaskIds, showCompleted]
  );
  const recurringCount = useMemo(() =>
    tasks.filter(t => t.frequency !== 'one-time' && !deliverableTaskIds.has(t.id) && !t.parent_task_id && visibilityFilter(t)).length,
    [tasks, deliverableTaskIds, showCompleted]
  );
  const deliverableCount = useMemo(() =>
    tasks.filter(t => deliverableTaskIds.has(t.id) && visibilityFilter(t)).length,
    [tasks, deliverableTaskIds, showCompleted]
  );
  // How many completed tasks are currently being hidden — surfaced next
  // to the toggle so the user knows there's stuff in the "vault".
  const hiddenCompletedCount = useMemo(() =>
    showCompleted ? 0 : tasks.filter(t => t.status === 'complete' && !t.parent_task_id).length,
    [tasks, showCompleted]
  );

  // Filter tasks by tab + search (exclude subtasks from one-time/recurring — they belong in Deliverables)
  const filtered = useMemo(() => {
    let tabFiltered: Task[];
    if (activeTab === 'one-time') {
      tabFiltered = tasks.filter(t => t.frequency === 'one-time' && !deliverableTaskIds.has(t.id) && !t.parent_task_id);
    } else if (activeTab === 'recurring') {
      tabFiltered = tasks.filter(t => t.frequency !== 'one-time' && !deliverableTaskIds.has(t.id) && !t.parent_task_id);
    } else {
      tabFiltered = tasks.filter(t => deliverableTaskIds.has(t.id));
    }

    // Hide completed unless the user has toggled them on.
    if (!showCompleted) {
      tabFiltered = tabFiltered.filter(t => t.status !== 'complete');
    }

    if (!searchTerm) return tabFiltered.sort((a, b) => a.sort_order - b.sort_order);

    const term = searchTerm.toLowerCase();
    return tabFiltered.filter(t =>
      t.task_name.toLowerCase().includes(term) ||
      (t.assigned_to_name && t.assigned_to_name.toLowerCase().includes(term)) ||
      (t.latest_comment && t.latest_comment.toLowerCase().includes(term)) ||
      t.task_type.toLowerCase().includes(term) ||
      (t.created_by_name && t.created_by_name.toLowerCase().includes(term))
    ).sort((a, b) => a.sort_order - b.sort_order);
  }, [tasks, activeTab, searchTerm, showCompleted]);

  // Group filtered tasks by assigned_to
  const groupedByUser = useMemo(() => {
    const groups: { key: string; label: string; tasks: Task[] }[] = [];
    const map = new Map<string, Task[]>();

    for (const task of filtered) {
      const key = task.assigned_to || '_unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }

    // Resolve group label from teamMembers by ID (not from first task's name)
    const getLabel = (key: string) => {
      if (key === '_unassigned') return 'Unassigned';
      const member = teamMembers.find(m => m.id === key);
      return member?.name || 'Unknown';
    };

    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === '_unassigned') return 1;
      if (b === '_unassigned') return -1;
      return getLabel(a).localeCompare(getLabel(b));
    });

    for (const key of sortedKeys) {
      const tasks = map.get(key)!;
      groups.push({ key, label: getLabel(key), tasks });
    }

    return groups;
  }, [filtered, teamMembers]);

  const toggleUserCollapse = (key: string) => {
    setCollapsedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };

  // --- Inline editing ---
  const startEditing = (taskId: string, field: string, currentValue: string) => {
    setEditingCell({ taskId, field });
    setEditingValue(currentValue);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const saveInlineEdit = async () => {
    if (!editingCell) return;
    const { taskId, field } = editingCell;
    const value = editingValue.trim() || null;
    setEditingCell(null);
    setEditingValue('');
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value, updated_at: new Date().toISOString() } : t));
    try {
      await TaskService.updateField(taskId, field, value);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchTasks();
    }
  };

  const saveSelectField = async (taskId: string, field: string, value: string, extra?: Record<string, string | null>) => {
    const updates: Record<string, string | null> = { [field]: value || null, ...extra };

    // Auto-stamp completed_at when transitioning to/from 'complete' status.
    // This is the "finish date" that the row + filter UI needs. We set it
    // here so all status changes (status dropdown, kanban move, bulk
    // update, anywhere that calls saveSelectField with field='status')
    // get the timestamp without separate plumbing per call site.
    if (field === 'status') {
      if (value === 'complete') {
        // Only stamp if it's not already complete — avoid clobbering an
        // earlier completion timestamp on idempotent updates.
        const current = tasks.find(t => t.id === taskId);
        if (current?.status !== 'complete') {
          updates.completed_at = new Date().toISOString();
        }
      } else {
        // Status moved away from complete — clear the timestamp so the
        // task isn't surfaced in "completed" views with a stale date.
        updates.completed_at = null;
      }
    }

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates, updated_at: new Date().toISOString() } : t));
    try {
      await TaskService.updateTask(taskId, updates);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchTasks();
    }
  };

  /**
   * Save the JSONB recurring_config field. Separate from saveSelectField
   * because that one assumes string|null values; recurring_config is a
   * structured object (frequency, day_of_week, end_date, etc.) defined
   * in lib/taskService. Optimistic local update + server roundtrip.
   */
  const saveRecurringConfig = async (taskId: string, config: any | null) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, recurring_config: config, updated_at: new Date().toISOString() } : t));
    try {
      await TaskService.updateTask(taskId, { recurring_config: config });
    } catch (error) {
      console.error('Error saving recurring_config:', error);
      await fetchTasks();
    }
  };

  const saveDateField = async (taskId: string, date: Date | undefined) => {
    if (!date) return;
    const dateStr = toLocalDateString(date);
    setEditingCell(null);
    setEditingValue('');
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: dateStr, updated_at: new Date().toISOString() } : t));
    try {
      await TaskService.updateField(taskId, 'due_date', dateStr);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchTasks();
    }
  };

  const openForm = (task?: Task) => {
    setEditingTask(task || null);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await TaskService.deleteTask(id);
    } catch (error) {
      console.error('Error deleting:', error);
      await fetchTasks();
    }
  };

  // Global sorted list of all filtered tasks (used for reordering across groups)
  const globalSorted = useMemo(() =>
    [...filtered].sort((a, b) => a.sort_order - b.sort_order),
    [filtered]
  );

  const handleReorder = async (taskId: string, direction: 'up' | 'down') => {
    const idx = globalSorted.findIndex(t => t.id === taskId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= globalSorted.length) return;

    const current = globalSorted[idx];
    const swap = globalSorted[swapIdx];

    const currentOrder = current.sort_order;
    const swapOrder = swap.sort_order;
    const newCurrentOrder = currentOrder === swapOrder
      ? (direction === 'up' ? swapOrder - 1 : swapOrder + 1)
      : swapOrder;
    const newSwapOrder = currentOrder === swapOrder
      ? currentOrder
      : currentOrder;

    setTasks(prev => prev.map(t => {
      if (t.id === current.id) return { ...t, sort_order: newCurrentOrder };
      if (t.id === swap.id) return { ...t, sort_order: newSwapOrder };
      return t;
    }));

    try {
      await TaskService.reorderTasks([
        { id: current.id, sort_order: newCurrentOrder },
        { id: swap.id, sort_order: newSwapOrder },
      ]);
    } catch (error) {
      console.error('Error reordering:', error);
      await fetchTasks();
    }
  };

  const handleAddNewRow = (groupKey: string) => {
    // Expand the group if collapsed
    if (collapsedUsers.has(groupKey)) {
      setCollapsedUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(groupKey);
        return newSet;
      });
    }
    setAddingToGroup(groupKey);
    setNewRowName('');
  };

  const handleSaveNewRow = async () => {
    if (!addingToGroup || !newRowName.trim()) {
      setAddingToGroup(null);
      setNewRowName('');
      return;
    }

    const groupKey = addingToGroup;
    const name = newRowName.trim();
    setAddingToGroup(null);
    setNewRowName('');

    if (!user?.id || !userProfile) return;

    try {
      const assignedTo = groupKey === '_unassigned' ? null : groupKey;
      const assignedMember = assignedTo ? teamMembers.find(m => m.id === assignedTo) : null;
      const defaultFrequency = activeTab === 'one-time' ? 'one-time' : activeTab === 'recurring' ? 'daily' : 'one-time';
      const defaultType = 'General';

      await TaskService.createTask({
        task_name: name,
        assigned_to: assignedTo,
        assigned_to_name: assignedMember?.name || null,
        frequency: defaultFrequency,
        task_type: defaultType,
        created_by: user.id,
        created_by_name: userProfile.name || userProfile.email || 'Unknown',
        status: 'to_do',
      });
      await fetchTasks();
    } catch (err) {
      console.error('Error adding task:', err);
      toast({ title: 'Error', description: 'Failed to add task.', variant: 'destructive' });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const userColors = [
    { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
    { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  ];

  const getColorForIndex = (idx: number) => userColors[idx % userColors.length];

  const getUserInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  };

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [clients]);

  const colLabel: Record<ColumnKey, string> = {
    taskName: 'Task Name', priority: 'Priority', assignee: 'Assignee', client: 'Client', dueDate: 'Due Date', comment: 'Comment',
    frequency: 'Frequency', recurring: 'Recurring', type: 'Type', link: 'Link',
    createdBy: 'Created By', created: 'Created',
    completedAt: 'Completed',
  };

  // Filter columnOrder so the Completed column only appears when the
  // user has the show-completed toggle on (otherwise it'd be a column
  // of dashes for every visible row, since hidden rows are the only
  // ones that have a completed_at value).
  const visibleColumnOrder = useMemo(
    () => columnOrder.filter(c => showCompleted || c !== 'completedAt'),
    [columnOrder, showCompleted],
  );

  const tableHeader = (
    <thead>
      <tr className="border-b border-gray-200 bg-gray-50/80">
        <th className={`text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider ${COL.reorder}`}></th>
        <th className={`py-3 px-1 ${COL.status}`}></th>
        {visibleColumnOrder.map((col) => (
          <th
            key={col}
            className={`text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider ${COL[col]} cursor-grab select-none`}
            draggable
            onDragStart={() => handleColumnDragStart(col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
            onDrop={handleColumnDrop}
          >
            <div className="flex items-center gap-1">
              <GripVertical className="h-3 w-3 text-gray-300 flex-shrink-0" />
              {colLabel[col]}
            </div>
          </th>
        ))}
        <th className={`text-right py-3 px-3 ${COL.actions}`}></th>
      </tr>
    </thead>
  );

  const renderCell = (task: Task, col: ColumnKey) => {
    const isEditingField = (field: string) => editingCell?.taskId === task.id && editingCell?.field === field;

    switch (col) {
      case 'taskName':
        return (
          <td key={col} className={`py-3 px-3 ${COL.taskName}`}>
            {isEditingField('task_name') ? (
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={saveInlineEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') cancelEditing(); }}
                className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-sm font-medium text-gray-900"
                style={{ outline: 'none', boxShadow: 'none' }}
                autoFocus
              />
            ) : task.description && task.description !== '<p><br></p>' ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="text-gray-900 font-medium line-clamp-2 cursor-pointer inline-flex items-center gap-1.5"
                      onDoubleClick={() => startEditing(task.id, 'task_name', task.task_name)}
                    >
                      {task.task_name}
                      {deliverableProgress[task.id] && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand/10 text-brand flex-shrink-0">
                          {deliverableProgress[task.id].done}/{deliverableProgress[task.id].total}
                        </span>
                      )}
                      {checklistCounts[task.id] && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openForm(task); }}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 hover:opacity-80 transition-opacity ${
                            checklistCounts[task.id].done === checklistCounts[task.id].total
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                          title={`Checklist: ${checklistCounts[task.id].done}/${checklistCounts[task.id].total} done — click to open`}
                        >
                          <ListChecks className="h-2.5 w-2.5" />
                          {checklistCounts[task.id].done}/{checklistCounts[task.id].total}
                        </button>
                      )}
                      {isTaskStale(task) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 flex-shrink-0">
                          <Clock className="h-2.5 w-2.5" /> Stale
                        </span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-xs text-xs">
                    <div className="max-h-[200px] overflow-y-auto">
                      <div className="prose prose-xs max-w-none [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0" dangerouslySetInnerHTML={{ __html: task.description }} />
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span
                className="text-gray-900 font-medium line-clamp-2 cursor-pointer inline-flex items-center gap-1.5"
                onDoubleClick={() => startEditing(task.id, 'task_name', task.task_name)}
                title="Double-click to edit"
              >
                {task.task_name}
                {deliverableProgress[task.id] && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand/10 text-brand flex-shrink-0">
                    {deliverableProgress[task.id].done}/{deliverableProgress[task.id].total}
                  </span>
                )}
                {isTaskStale(task) && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 flex-shrink-0">
                    <Clock className="h-2.5 w-2.5" /> Stale
                  </span>
                )}
              </span>
            )}
          </td>
        );
      case 'priority': {
        const p = getComputedPriority(task.due_date, task.status);
        return (
          <td key={col} className={`py-3 px-3 ${COL.priority}`}>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${p.color} ${p.bg}`}>
              {p.label}
            </span>
          </td>
        );
      }
      case 'assignee':
        return (
          <td key={col} className={`py-3 px-3 ${COL.assignee}`}>
            <Select
              value={task.assigned_to || '_unassigned'}
              onValueChange={(v) => {
                const member = teamMembers.find(m => m.id === v);
                saveSelectField(task.id, 'assigned_to', v === '_unassigned' ? '' : v, {
                  assigned_to_name: member?.name || null,
                });
              }}
            >
              <SelectTrigger
                className="border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 truncate max-w-[110px]"
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <SelectValue>
                  {task.assigned_to_name ? (
                    <span className="text-gray-700 flex items-center gap-1">
                      {userPhotoMap[task.assigned_to || ''] ? (
                        <img src={userPhotoMap[task.assigned_to || '']!} className="h-4 w-4 rounded-full" />
                      ) : (
                        <User className="h-3 w-3 text-gray-400" />
                      )}
                      {task.assigned_to_name.split(' ')[0]}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_unassigned">Unassigned</SelectItem>
                {teamMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
        );
      case 'client': {
        const canEditClient = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
        return (
          <td key={col} className={`py-3 px-3 ${COL.client}`}>
            {canEditClient ? (
              <Select
                value={task.client_id || '_none'}
                onValueChange={(v) => saveSelectField(task.id, 'client_id', v === '_none' ? '' : v)}
              >
                <SelectTrigger
                  className="border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 truncate max-w-[100px]"
                  style={{ outline: 'none', boxShadow: 'none' }}
                >
                  <SelectValue>
                    {task.client_id && clientMap[task.client_id] ? (
                      <span className="text-gray-700">{clientMap[task.client_id]}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No client</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <span className="px-2 py-1 text-xs font-medium text-gray-700 truncate max-w-[100px] inline-block">
                {task.client_id && clientMap[task.client_id] ? clientMap[task.client_id] : <span className="text-gray-400">—</span>}
              </span>
            )}
          </td>
        );
      }
      case 'dueDate':
        return (
          <td key={col} className={`py-3 px-3 ${COL.dueDate}`}>
            <Popover>
              <PopoverTrigger asChild>
                <button className={`text-sm hover:text-gray-700 cursor-pointer ${getDueDateColor(task.due_date) || 'text-gray-500'}`}>
                  {task.due_date ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={task.due_date ? new Date(task.due_date + 'T00:00:00') : undefined}
                  onSelect={(date) => saveDateField(task.id, date)}
                  initialFocus
                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                />
              </PopoverContent>
            </Popover>
          </td>
        );
      case 'comment': {
        const count = commentCounts[task.id] || 0;
        return (
          <td key={col} className={`py-3 px-3 ${COL.comment}`}>
            <div className="flex items-center gap-1.5">
              {count > 0 && (
                <button
                  className="inline-flex items-center gap-1 text-xs text-brand hover:underline cursor-pointer"
                  onClick={() => openForm(task)}
                  title="View comments"
                >
                  <MessageCircle className="h-3 w-3" />
                  {count}
                </button>
              )}
              {isEditingField('latest_comment') ? (
                <textarea
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={saveInlineEdit}
                  onKeyDown={(e) => { if (e.key === 'Escape') cancelEditing(); }}
                  className="w-full min-w-[140px] border-none shadow-none p-0 bg-transparent focus:outline-none focus:ring-0 text-xs resize-none"
                  style={{ outline: 'none', boxShadow: 'none' }}
                  rows={2}
                  autoFocus
                />
              ) : (
                <span
                  className="text-gray-600 line-clamp-2 whitespace-pre-wrap cursor-pointer text-xs flex-1"
                  onDoubleClick={() => startEditing(task.id, 'latest_comment', task.latest_comment || '')}
                  title="Double-click to edit"
                >
                  {task.latest_comment || (count === 0 ? '—' : '')}
                </span>
              )}
            </div>
          </td>
        );
      }
      case 'frequency':
        return (
          <td key={col} className={`py-3 px-3 ${COL.frequency}`}>
            <Select value={task.frequency} onValueChange={(v) => saveSelectField(task.id, 'frequency', v)}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-auto h-auto ${frequencyBadge(task.frequency)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
        );
      case 'recurring': {
        // Auto-recreate-on-completion config (separate from `frequency`,
        // which is just metadata). Was previously only editable inside
        // the task detail modal — exposing it here as a popover trigger
        // so users can toggle it without opening the modal.
        const isOn = !!task.recurring_config;
        const cfg = task.recurring_config as any | null;
        const summary = cfg?.frequency
          ? cfg.frequency.charAt(0).toUpperCase() + cfg.frequency.slice(1)
          : null;
        return (
          <td key={col} className={`py-3 px-3 ${COL.recurring}`}>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    isOn
                      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 border border-transparent'
                  }`}
                  title={isOn ? `Auto-recreates on complete (${summary})` : 'Click to enable auto-recreate on completion'}
                >
                  <RefreshCw className={`h-3 w-3 ${isOn ? 'text-blue-600' : 'text-gray-400'}`} />
                  {isOn ? summary : 'Off'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3">
                <RecurringConfigEditor
                  value={cfg}
                  onChange={(newConfig) => saveRecurringConfig(task.id, newConfig)}
                />
              </PopoverContent>
            </Popover>
          </td>
        );
      }
      case 'type':
        return (
          <td key={col} className={`py-3 px-3 ${COL.type}`}>
            <Select value={task.task_type} onValueChange={(v) => saveSelectField(task.id, 'task_type', v)}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-auto max-w-full h-auto ${typeBadge(task.task_type)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none truncate`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
        );
      case 'link':
        return (
          <td key={col} className={`py-3 px-3 ${COL.link}`}>
            {isEditingField('link') ? (
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={saveInlineEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') cancelEditing(); }}
                className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs"
                style={{ outline: 'none', boxShadow: 'none' }}
                autoFocus
              />
            ) : task.link ? (
              <a
                href={task.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline inline-flex items-center gap-1 text-xs"
                onDoubleClick={(e) => { e.preventDefault(); startEditing(task.id, 'link', task.link || ''); }}
                title="Double-click to edit"
              >
                <ExternalLink className="h-3 w-3" />
                Link
              </a>
            ) : (
              <span
                className="text-gray-400 cursor-pointer text-xs"
                onDoubleClick={() => startEditing(task.id, 'link', '')}
                title="Double-click to edit"
              >
                —
              </span>
            )}
          </td>
        );
      case 'createdBy': {
        const creatorPhoto = task.created_by ? userPhotoMap[task.created_by] : null;
        const creatorName = task.created_by_name || '—';
        return (
          <td key={col} className={`py-3 px-3 whitespace-nowrap ${COL.createdBy}`}>
            {task.created_by_name ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center cursor-default">
                      {creatorPhoto ? (
                        <div className="h-6 w-6 rounded-full overflow-hidden flex-shrink-0">
                          <img src={creatorPhoto} alt={creatorName} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand to-[#2d6470] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                          {getUserInitials(creatorName)}
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {creatorName}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="text-gray-400 text-xs">—</span>
            )}
          </td>
        );
      }
      case 'created':
        return (
          <td key={col} className={`py-3 px-3 whitespace-nowrap ${COL.created}`}>
            <span className="text-gray-500 text-xs">
              {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </td>
        );
      case 'completedAt':
        // The "finish date" — populated by saveSelectField when a task
        // moves to status='complete'. Only visible when the show-completed
        // toggle is on (column is filtered out of visibleColumnOrder
        // otherwise). Shows "—" for tasks that never completed.
        return (
          <td key={col} className={`py-3 px-3 whitespace-nowrap ${COL.completedAt}`}>
            {task.completed_at ? (
              <span className="text-green-700 text-xs font-medium">
                {new Date(task.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </td>
        );
    }
  };

  const renderTaskRow = (task: Task) => {
    const globalIdx = globalSorted.findIndex(t => t.id === task.id);

    return (
      <tr key={task.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors group">
        {/* Reorder arrows - always first */}
        <td className={`py-3 px-3 ${COL.reorder}`}>
          <div className="flex flex-col items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-auto h-auto px-1 py-0 hover:bg-gray-100 disabled:opacity-20"
              onClick={() => handleReorder(task.id, 'up')}
              disabled={globalIdx === 0}
            >
              <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-auto h-auto px-1 py-0 hover:bg-gray-100 disabled:opacity-20"
              onClick={() => handleReorder(task.id, 'down')}
              disabled={globalIdx === globalSorted.length - 1}
            >
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </Button>
          </div>
        </td>

        {/* Status dropdown */}
        <td className={`py-3 px-1 ${COL.status}`}>
          <Popover>
            <PopoverTrigger asChild>
              {(() => {
                const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.to_do;
                const Icon = cfg.icon;
                return (
                  <button className={`p-1 rounded ${cfg.bg} transition-colors`} title={cfg.label}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </button>
                );
              })()}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1" align="start">
              <div className="flex flex-col gap-0.5">
                {STATUSES.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={s}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-gray-100 transition-colors text-left ${task.status === s ? 'bg-gray-100 font-medium' : ''}`}
                      onClick={() => saveSelectField(task.id, 'status', s)}
                    >
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </td>

        {/* Dynamic columns based on columnOrder */}
        {visibleColumnOrder.map((col) => renderCell(task, col))}

        {/* Actions - always last */}
        <td className={`py-3 px-3 text-right ${COL.actions}`}>
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-gray-200" onClick={() => openForm(task)} title="Edit in popup">
              <Expand className="h-3.5 w-3.5 text-gray-500" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-red-50" onClick={() => setDeletingId(task.id)}>
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const renderTaskTable = (groupTasks: Task[], groupKey: string) => {
    const sorted = [...groupTasks].sort((a, b) => a.sort_order - b.sort_order);
    return (
      <table className="w-full text-sm">
        {tableHeader}
        <tbody>
          {sorted.map((task) => renderTaskRow(task))}
          {addingToGroup === groupKey && (
            <tr className="border-b border-gray-100 bg-gray-50/30">
              <td className={`py-3 px-3 ${COL.reorder}`}></td>
              <td className={`py-3 px-3 ${COL.taskName}`} colSpan={9}>
                <Input
                  value={newRowName}
                  onChange={(e) => setNewRowName(e.target.value)}
                  onBlur={handleSaveNewRow}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNewRow();
                    if (e.key === 'Escape') { setAddingToGroup(null); setNewRowName(''); }
                  }}
                  placeholder="Enter task name..."
                  className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-sm font-medium"
                  style={{ outline: 'none', boxShadow: 'none' }}
                  autoFocus
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50">
      <div className="w-full">
        <div className="space-y-4">
          {/* Header */}
          <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
            <div className="pb-5 border-b border-gray-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <ListTodo className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Tasks</h2>
                  <p className="text-sm text-gray-500">Manage team tasks, SOPs, and recurring work</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="hover:opacity-90"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Task
                    <ChevronDown className="h-3 w-3 ml-1.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openForm()}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Task
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setWizardOpen(true)}>
                    <Package className="h-4 w-4 mr-2" />
                    New Deliverable
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Tabs */}
            <div className="pt-4">
              {loading ? (
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-28 rounded" />)}
                </div>
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="bg-gray-100 p-1 h-auto flex-wrap">
                    <TabsTrigger
                      value="one-time"
                      className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm text-sm px-4 py-2"
                    >
                      One-Time
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{oneTimeCount}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="recurring"
                      className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm text-sm px-4 py-2"
                    >
                      Recurring
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{recurringCount}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="deliverables"
                      className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm text-sm px-4 py-2"
                    >
                      Deliverables
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{deliverableCount}</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>

            {/* Search + Show-completed toggle */}
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tasks, assignees, comments..."
                  className="pl-10 focus-brand"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchTerm && (
                <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')}>
                  Clear
                </Button>
              )}

              {/* Show-completed toggle. Persists choice in localStorage so
                  the user doesn't have to re-toggle every session. The hidden
                  count next to the label gives a quick "you have N done tasks
                  in the vault" signal so users notice they exist. */}
              <button
                type="button"
                onClick={() => {
                  setShowCompleted(prev => {
                    const next = !prev;
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('tasks_show_completed', String(next));
                    }
                    return next;
                  });
                }}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors ${
                  showCompleted
                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                title={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
              >
                <CheckCircle2 className={`h-4 w-4 ${showCompleted ? 'text-green-600' : 'text-gray-400'}`} />
                <span className="font-medium">
                  {showCompleted ? 'Showing completed' : 'Show completed'}
                </span>
                {hiddenCompletedCount > 0 && !showCompleted && (
                  <span className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 tabular-nums">
                    {hiddenCompletedCount} hidden
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Grouped Tables */}
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="w-full bg-white border border-gray-200 shadow-sm">
              <div className="text-center py-16">
                <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">
                  {tasks.length === 0 ? 'No tasks yet.' : 'No tasks match your filters.'}
                </p>
                {tasks.length === 0 && (
                  <Button
                    className="mt-4 hover:opacity-90"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                    onClick={() => openForm()}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Create Your First Task
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedByUser.map((group, groupIdx) => {
                const isCollapsed = collapsedUsers.has(group.key);
                const colors = group.key === '_unassigned'
                  ? { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' }
                  : getColorForIndex(groupIdx);
                const photoUrl = group.key !== '_unassigned' ? userPhotoMap[group.key] : null;

                return (
                  <div key={group.key}>
                    {/* Group Header */}
                    <div
                      className={`flex items-center justify-between px-4 py-3 ${colors.bg} ${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} border ${colors.border} ${isCollapsed ? '' : 'border-b-0'} cursor-pointer select-none transition-all`}
                      onClick={() => toggleUserCollapse(group.key)}
                    >
                      <div className="flex items-center gap-3">
                        {isCollapsed ? (
                          <ChevronRight className={`w-4 h-4 ${colors.text}`} />
                        ) : (
                          <ChevronDown className={`w-4 h-4 ${colors.text}`} />
                        )}
                        {group.key === '_unassigned' ? (
                          <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center">
                            <User className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                        ) : photoUrl ? (
                          <div className="h-7 w-7 rounded-full overflow-hidden relative flex-shrink-0">
                            <img
                              src={photoUrl}
                              alt={group.label}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="h-7 w-7 bg-gradient-to-br from-brand to-[#2d6470] rounded-full flex items-center justify-center absolute top-0 left-0 hidden text-white text-xs font-bold">
                              {getUserInitials(group.label)}
                            </div>
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand to-[#2d6470] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {getUserInitials(group.label)}
                          </div>
                        )}
                        <h3 className={`font-semibold ${colors.text}`}>{group.label}</h3>
                        <Badge variant="secondary" className="text-xs font-medium">
                          {group.tasks.length}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 px-2 ${colors.text} hover:bg-black/10`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddNewRow(group.key);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Group Table */}
                    {!isCollapsed && (
                      <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 overflow-hidden">
                        <div className="overflow-x-auto">
                          {renderTaskTable(group.tasks, group.key)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        open={isFormOpen}
        onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingTask(null); } }}
        task={editingTask}
        teamMembers={teamMembers}
        clients={clients}
        onSaved={fetchTasks}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>Are you sure you want to delete this task? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && handleDelete(deletingId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeliverableWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        teamMembers={teamMembers}
        clients={clients}
        onCreated={fetchTasks}
      />
    </div>
  );
}
