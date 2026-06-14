'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { UserService } from '@/lib/userService';
import { TaskService, Task } from '@/lib/taskService';
import { ClientService } from '@/lib/clientService';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { DeliverableWizard } from '@/components/tasks/DeliverableWizard';
import { ThisWeekFeedWidget } from '@/components/tasks/ThisWeekFeedWidget';
import { PreShipGateModal, logPreShipGate, type PreShipGateState } from '@/components/tasks/PreShipGateModal';
import { RecurringConfigEditor } from '@/components/tasks/RecurringConfig';
import { InitiativesTaskTab } from '@/components/tasks/InitiativesTaskTab';
import { DeliverableService } from '@/lib/deliverableService';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { toneClassName, type BadgeTone } from '@/components/ui/status-badge';
import { formatDate as fmtDate } from '@/lib/dateFormat';
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
  X,
  Link2,
  AlertTriangle,
} from 'lucide-react';

const STALE_DAYS = 7;
function isTaskStale(task: Task): boolean {
  if (task.status === 'complete' || task.status === 'paused') return false;
  const diff = Date.now() - new Date(task.updated_at).getTime();
  return diff > STALE_DAYS * 24 * 60 * 60 * 1000;
}

/** Compute priority automatically based on how close the due date is */
function getComputedPriority(dueDate: string | null, status?: string): { level: string; label: string; color: string; bg: string } {
  if (status === 'complete') return { level: 'complete', label: 'Done', color: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (!dueDate) return { level: 'low', label: 'Low', color: 'text-gray-400', bg: 'bg-gray-50' };
  const now = new Date();
  const due = new Date(dueDate + 'T23:59:59');
  const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft < 0) return { level: 'overdue', label: 'Overdue', color: 'text-rose-700', bg: 'bg-rose-50' };
  if (hoursLeft <= 24) return { level: 'urgent', label: 'Urgent', color: 'text-rose-600', bg: 'bg-rose-50' };
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

// [Frequency consolidation, May 2026] FREQUENCIES + FREQUENCY_LABELS
// removed. The user-facing dropdown is gone; tasks.frequency is now
// auto-derived from recurring_config. Tab filtering, column display,
// and badges all read recurring_config directly. The DB column stays
// populated for back-compat with the cron cloner's fallback path.
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
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-emerald-500', bg: 'hover:bg-emerald-50' },
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
// [Frequency consolidation, May 2026] FREQUENCY_TONES + frequencyBadge
// removed — the Frequency column was deleted in favor of the unified
// Repeats column (uses recurring_config). Kept the BadgeTone import
// since TYPE_TONES still uses it.
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

const typeBadge = (type: string) =>
  toneClassName(TYPE_TONES[type] ?? 'neutral');

const getDueDateColor = (dueDate: string | null) => {
  if (!dueDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-rose-600 font-semibold';
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
  // [Frequency consolidation] `frequency` column width kept for back-
  // compat with old user preferences (saved column-order arrays may
  // still reference it); the cell render switch ignores it, so unused
  // entries fall through harmlessly.
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
  // [Frequency consolidation, May 2026] The standalone 'frequency'
  // column was removed — it was redundant with this Repeats column,
  // which already opens the RecurringConfigEditor popover. One field,
  // one source of truth.
  { key: 'recurring', label: 'Repeats' },
  { key: 'type', label: 'Type' },
  { key: 'link', label: 'Link' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'created', label: 'Created' },
  { key: 'completedAt', label: 'Completed' },
];

const DEFAULT_COLUMN_ORDER: ColumnKey[] = COLUMN_DEFS.map(c => c.key);
const COLUMN_ORDER_KEY = 'tasks-column-order';

// Group-by dimensions. 'assignee' = original/historical default. 'none'
// flattens everything into a single ungrouped list (useful when the
// table is already small enough that bucketing adds friction).
type GroupByKey = 'assignee' | 'client' | 'type' | 'status' | 'priority' | 'none';
const GROUP_BY_KEY = 'tasks-group-by';
const GROUP_BY_OPTIONS: { value: GroupByKey; label: string }[] = [
  { value: 'assignee', label: 'Assignee' },
  { value: 'client',   label: 'Client' },
  { value: 'type',     label: 'Type' },
  { value: 'status',   label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'none',     label: 'None (flat)' },
];
const isValidGroupBy = (s: string | null): s is GroupByKey =>
  !!s && GROUP_BY_OPTIONS.some(o => o.value === s);

// Status group ordering — matches the workflow direction so the
// kanban-ish view reads left-to-right. The label map comes from
// STATUS_CONFIG above.
const STATUS_GROUP_ORDER: readonly string[] = STATUSES;

// Priority group ordering — most-urgent first so overdue work is at
// the top of the page.
const PRIORITY_GROUP_ORDER: readonly string[] = ['overdue', 'urgent', 'high', 'medium', 'low', 'complete'];
const PRIORITY_GROUP_LABELS: Record<string, string> = {
  overdue:  'Overdue',
  urgent:   'Urgent',
  high:     'High',
  medium:   'Medium',
  low:      'Low',
  complete: 'Done',
};

/** Initials helper (e.g. "Andy Lee" → "AL"). Module-scoped so both
 *  the in-component renderers and the GroupHeaderIcon helper below
 *  the component can call it. */
function getUserInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function TasksPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Optional URL filter — `/tasks?client=<uuid>` scopes the list to a
  // single client. Used by the /clients page's "HQ tasks" badge to
  // bridge into this view. When unset, the list is unfiltered (all
  // clients + unassigned tasks).
  const clientFilterId = searchParams.get('client');
  // [HQ Tasks ↔ Action Board link] When the Action Board on /clients
  // links here, it passes ?actionItem=<id> so the list narrows to
  // just the tasks linked to that one client action item. Filter
  // chip shows + a Clear link, mirroring the client filter pattern.
  const actionItemFilterId = searchParams.get('actionItem');

  const [tasks, setTasks] = useState<Task[]>([]);
  // [2026-06-11] Pre-Ship Gate state. When saveSelectField detects a
  // client-linked task transitioning to 'complete', it stashes the
  // pending updates here and opens the modal. On confirm, the gate
  // log row is written + the updates are applied. On cancel, the
  // local optimistic update is rolled back from the tasks list.
  const [gateTarget, setGateTarget] = useState<{
    taskId: string;
    taskName: string;
    pendingUpdates: Record<string, string | null>;
  } | null>(null);
  const [gateSubmitting, setGateSubmitting] = useState(false);
  // [Subtasks v1] Tracks which parent tasks are expanded to show their
  // subtasks inline. Default: all collapsed. State lives in-memory only
  // (resets on page reload) — matches the deliverables page pattern.
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const toggleTaskExpand = (id: string) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; logo_url: string | null }[]>([]);
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
  // Group-by dimension. Default 'assignee' preserves the historical
  // behavior; other modes let the user re-pivot the same task list
  // by client / type / status / priority / due-date bucket, or flatten
  // it into one ungrouped list. Persists across sessions in
  // localStorage so the user doesn't have to re-select on each visit.
  const [groupBy, setGroupBy] = useState<GroupByKey>(() => {
    if (typeof window === 'undefined') return 'assignee';
    const saved = window.localStorage.getItem(GROUP_BY_KEY);
    return isValidGroupBy(saved) ? saved : 'assignee';
  });
  // Persist + reset collapsed-groups state on each switch — a key set
  // collected under "assignee" mode wouldn't make sense under "status"
  // mode (the keys live in different namespaces), so re-expand on
  // pivot.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GROUP_BY_KEY, groupBy);
    }
    setCollapsedUsers(new Set());
  }, [groupBy]);

  // Column order (persisted to localStorage)
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const dragColRef = useRef<ColumnKey | null>(null);
  const dragOverColRef = useRef<ColumnKey | null>(null);

  // Single-vs-double-click disambiguation for the task name cell.
  // Single click should open the detail modal; double click should
  // start inline rename. Both onClick and onDoubleClick fire on a
  // dblclick in browsers, so we delay the single-click action briefly
  // and cancel it if a second click arrives — standard pattern.
  const nameClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTaskNameClick = (task: Task) => {
    if (nameClickTimerRef.current) clearTimeout(nameClickTimerRef.current);
    nameClickTimerRef.current = setTimeout(() => {
      nameClickTimerRef.current = null;
      openForm(task);
    }, 220);
  };
  const handleTaskNameDoubleClick = (task: Task) => {
    if (nameClickTimerRef.current) {
      clearTimeout(nameClickTimerRef.current);
      nameClickTimerRef.current = null;
    }
    startEditing(task.id, 'task_name', task.task_name);
  };

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
  // [HQ Tasks ↔ Action Board link, May 2026] action item id → text label.
  // Populated by a small bulk fetch alongside the task list so the
  // "Client task" badge tooltip can show the linked item's text
  // without a per-row query.
  const [actionItemLabels, setActionItemLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchTasks();
    UserService.getActiveUsers().then((users) => {
      setTeamMembers(
        users
          .filter(u => u.role !== 'client')
          .map(u => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role, profile_photo_url: u.profile_photo_url || null }))
      );
    });
    ClientService.getAllClients().then((c) => {
      // [Client filter] Only ACTIVE clients in the Client dropdown.
      // getAllClients already drops archived rows; this layer drops
      // is_active=false (deactivated but not archived). 5 inactive
      // clients were leaking into the picker before this change.
      // is_active !== false admits NULL too so legacy rows still appear.
      setClients(
        c.filter(cl => (cl as any).is_active !== false)
          .map(cl => ({ id: cl.id, name: cl.name, logo_url: (cl as any).logo_url ?? null }))
      );
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
      // [HQ Tasks ↔ Action Board link] Resolve linked action-item
      // texts for any task carrying a client_action_item_id, so the
      // "Client task" badge can show a meaningful tooltip without
      // per-row queries. Single bulk select.
      const linkedIds = Array.from(new Set(data.map(t => t.client_action_item_id).filter((x): x is string => !!x)));
      if (linkedIds.length > 0) {
        const { data: items } = await (supabase as any)
          .from('client_action_items')
          .select('id, text')
          .in('id', linkedIds);
        const labels: Record<string, string> = {};
        for (const it of (items || []) as any[]) labels[it.id] = it.text;
        setActionItemLabels(labels);
      } else {
        setActionItemLabels({});
      }
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

  // [Subtasks v1] Group every subtask by its parent_task_id. Used to
  // (a) decide whether a parent row gets an expand chevron, and
  // (b) render the subtask rows inline when expanded.
  // We iterate the full tasks state (not the tab-filtered view) so a
  // parent's subtasks are always available regardless of which tab the
  // user is on.
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.parent_task_id) {
        if (!map.has(t.parent_task_id)) map.set(t.parent_task_id, []);
        map.get(t.parent_task_id)!.push(t);
      }
    }
    return map;
  }, [tasks]);

  // Tab counts. Counts reflect what the user actually SEES on each tab,
  // so completed tasks are excluded from the totals when the toggle is
  // off (matches the filtered list rendered below). Otherwise the
  // count would be larger than the visible row count, which is confusing.
  const deliverableTaskIds = useMemo(() => new Set(Object.keys(deliverableProgress)), [deliverableProgress]);
  const visibilityFilter = (t: Task) => showCompleted || t.status !== 'complete';

  // [Subtask visibility v3] Subtasks are now first-class rows in the
  // three tabs (one-time / recurring / deliverables) — they appear
  // in whichever tab matches their own frequency / deliverable status.
  // Visual grouping in renderTaskTable keeps them right under their
  // parent in the list, with an indent + parent-name subtitle on the
  // row itself so users can see context at a glance.
  // [Frequency consolidation] Tabs now read recurring_config directly,
  // not the legacy frequency string. A task is "recurring" iff
  // recurring_config is non-null; otherwise it's one-time.
  const oneTimeCount = useMemo(() =>
    tasks.filter(t => !t.recurring_config && visibilityFilter(t)).length,
    [tasks, showCompleted]
  );
  const recurringCount = useMemo(() =>
    tasks.filter(t => !!t.recurring_config && visibilityFilter(t)).length,
    [tasks, showCompleted]
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

  // Filter tasks by tab + search. Subtasks ARE included now — they
  // fall into whichever tab matches their own frequency, and the
  // deliverables tab also pulls in subtasks of deliverable parents
  // (since they're deliverable-related work). renderTaskTable orders
  // them right under their parent so the visual grouping is preserved.
  const filtered = useMemo(() => {
    let tabFiltered: Task[];
    if (activeTab === 'one-time') {
      tabFiltered = tasks.filter(t => !t.recurring_config);
    } else if (activeTab === 'recurring') {
      tabFiltered = tasks.filter(t => !!t.recurring_config);
    } else {
      // Deliverables tab: parents + their subtasks (so users see the
      // full deliverable picture in one view).
      tabFiltered = tasks.filter(t =>
        deliverableTaskIds.has(t.id) ||
        (t.parent_task_id !== null && t.parent_task_id !== undefined && deliverableTaskIds.has(t.parent_task_id))
      );
    }

    // ?client=<uuid> URL filter — bridge from the /clients page's
    // "HQ tasks" badge. Applied BEFORE the completed/search filters
    // so counts at the bottom of the page reflect the scoped roster.
    if (clientFilterId) {
      tabFiltered = tabFiltered.filter(t => t.client_id === clientFilterId);
    }

    // ?actionItem=<uuid> URL filter — bridge from the Action Board on
    // /clients. Narrows to just the HQ tasks linked to that single
    // client action item.
    if (actionItemFilterId) {
      tabFiltered = tabFiltered.filter(t => t.client_action_item_id === actionItemFilterId);
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
  }, [tasks, activeTab, searchTerm, showCompleted, clientFilterId, actionItemFilterId]);

  // Client id → name lookup used by group labels + the Client column.
  // Hoisted above `grouped` so the useMemo can reference it.
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [clients]);
  // Parallel id → logo_url lookup. Used by GroupHeaderIcon when
  // grouping by client so the header shows the client's actual logo
  // tile instead of a generic letter chip.
  const clientLogoMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    clients.forEach(c => { map[c.id] = c.logo_url; });
    return map;
  }, [clients]);

  // Group filtered tasks by the user-selected dimension. Returns a
  // stable list of { key, label, tasks } that the render loop walks
  // through. Each grouping mode defines its own bucket key (which
  // doubles as the localStorage-collapsed-set key) and a custom sort
  // order so e.g. priority groups read overdue→done top-to-bottom,
  // status groups follow the workflow direction, assignee/client/type
  // groups are alphabetical.
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; tasks: Task[] }[] = [];

    if (groupBy === 'none') {
      // Flat mode — one synthetic group containing everything. The
      // group header still renders so users keep the "+ Add" /
      // collapse affordances; just no per-bucket pivoting.
      return [{ key: '_all', label: 'All tasks', tasks: filtered }];
    }

    const map = new Map<string, Task[]>();
    for (const task of filtered) {
      let key: string;
      switch (groupBy) {
        case 'assignee':
          key = task.assigned_to || '_unassigned';
          break;
        case 'client':
          key = task.client_id || '_internal';
          break;
        case 'type':
          key = task.task_type || '_untyped';
          break;
        case 'status':
          key = task.status || 'to_do';
          break;
        case 'priority':
          key = getComputedPriority(task.due_date, task.status).level;
          break;
        default:
          key = '_other';
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }

    const getLabel = (key: string): string => {
      switch (groupBy) {
        case 'assignee':
          if (key === '_unassigned') return 'Unassigned';
          return teamMembers.find(m => m.id === key)?.name || 'Unknown';
        case 'client':
          if (key === '_internal') return 'Internal · No client';
          // Fall back to "Other" (not "Unknown client") for tasks
          // pointed at an archived / inaccessible client — reads as
          // a neutral catch-all instead of a bug signal.
          return clientMap[key] || 'Other';
        case 'type':
          if (key === '_untyped') return 'Untyped';
          return key;
        case 'status':
          return STATUS_CONFIG[key]?.label || key;
        case 'priority':
          return PRIORITY_GROUP_LABELS[key] || key;
        default:
          return key;
      }
    };

    // Per-mode sort. Falls back to alphabetical by label for the
    // free-text modes (assignee / client / type) so the same set of
    // groups renders in the same order each visit.
    const sortKeys = (keys: string[]): string[] => {
      const arr = [...keys];
      switch (groupBy) {
        case 'status':
          return arr.sort((a, b) =>
            STATUS_GROUP_ORDER.indexOf(a) - STATUS_GROUP_ORDER.indexOf(b)
          );
        case 'priority':
          return arr.sort((a, b) =>
            PRIORITY_GROUP_ORDER.indexOf(a) - PRIORITY_GROUP_ORDER.indexOf(b)
          );
        case 'assignee':
          return arr.sort((a, b) => {
            // Push the _unassigned / _internal / _untyped catch-all
            // buckets to the bottom — real names read first.
            if (a === '_unassigned') return 1;
            if (b === '_unassigned') return -1;
            return getLabel(a).localeCompare(getLabel(b));
          });
        case 'client':
          return arr.sort((a, b) => {
            if (a === '_internal') return 1;
            if (b === '_internal') return -1;
            return getLabel(a).localeCompare(getLabel(b));
          });
        case 'type':
          return arr.sort((a, b) => {
            if (a === '_untyped') return 1;
            if (b === '_untyped') return -1;
            return getLabel(a).localeCompare(getLabel(b));
          });
        default:
          return arr;
      }
    };

    for (const key of sortKeys(Array.from(map.keys()))) {
      groups.push({ key, label: getLabel(key), tasks: map.get(key)! });
    }
    return groups;
  }, [filtered, groupBy, teamMembers, clientMap]);

  // Kept the `collapsedUsers` state name to minimize churn — under
  // non-assignee group modes it just stores arbitrary group keys.
  const toggleGroupCollapse = (key: string) => {
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

        // [2026-06-11] Pre-Ship Gate intercept. If the task has a client
        // linked AND it's transitioning INTO 'complete' (not idempotent),
        // open the gate modal instead of writing. The modal's confirm
        // path will replay this update — see handleGateConfirm below.
        // Internal tasks (no client_id) bypass the gate per spec.
        if (current?.client_id && current.status !== 'complete') {
          setGateTarget({
            taskId,
            taskName: current.task_name || 'this task',
            pendingUpdates: updates,
          });
          return;
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
   * [2026-06-11] Pre-Ship Gate confirm handler. Writes the append-only
   * log row first, then applies the pending updates (which already have
   * status='complete' baked in via saveSelectField's intercept). On log
   * write failure, surface a toast and DON'T flip status — better to
   * leave the task open than have a status flip with no audit row.
   */
  const handleGateConfirm = async (state: PreShipGateState) => {
    if (!gateTarget) return;
    setGateSubmitting(true);
    try {
      const logged = await logPreShipGate(supabase, {
        taskId: gateTarget.taskId,
        state,
        completedBy: user?.id || null,
        completedByName: userProfile?.name || userProfile?.email || null,
        viaSource: 'hq',
      });
      if (!logged) {
        toast({
          title: 'Gate log failed',
          description: "Task wasn't completed. Try again — if it keeps failing, ping the engineering channel.",
          variant: 'destructive',
        });
        return;
      }
      // Apply optimistic UI + persist
      const updates = gateTarget.pendingUpdates;
      setTasks(prev => prev.map(t => t.id === gateTarget.taskId
        ? { ...t, ...updates, updated_at: new Date().toISOString() }
        : t));
      try {
        await TaskService.updateTask(gateTarget.taskId, updates);
        toast({ title: 'Task complete', description: 'Pre-Ship Gate passed.' });
      } catch (err) {
        console.error('[PSG] update failed after gate pass:', err);
        await fetchTasks();
        toast({
          title: 'Save failed after gate pass',
          description: 'Gate row was logged but status update failed. Refreshing tasks.',
          variant: 'destructive',
        });
      }
      setGateTarget(null);
    } finally {
      setGateSubmitting(false);
    }
  };

  /**
   * Save the JSONB recurring_config field. Separate from saveSelectField
   * because that one assumes string|null values; recurring_config is a
   * structured object (frequency, day_of_week, end_date, etc.) defined
   * in lib/taskService. Optimistic local update + server roundtrip.
   */
  const saveRecurringConfig = async (taskId: string, config: any | null) => {
    // [Frequency consolidation] When the user toggles Repeats on/off,
    // keep tasks.frequency in sync so legacy readers (cron cloner
    // fallback, MCP tools) see the right value. derived = 'recurring'
    // when config is set, 'one-time' otherwise.
    const derivedFrequency = config ? 'recurring' : 'one-time';
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, recurring_config: config, frequency: derivedFrequency, updated_at: new Date().toISOString() }
      : t));
    try {
      await TaskService.updateTask(taskId, { recurring_config: config, frequency: derivedFrequency });
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
      // [Frequency consolidation] Inline-add inherits the active tab's
      // recurrence: One-Time tab → no recurring_config; Recurring tab
      // → default weekly config (user can refine in the popover/modal).
      // tasks.frequency field is set in sync so the DB stays consistent
      // for legacy readers.
      const isRecurringTab = activeTab === 'recurring';
      const defaultRecurringConfig = isRecurringTab ? { frequency: 'weekly' as const } : null;
      const defaultFrequency = isRecurringTab ? 'recurring' : 'one-time';
      const defaultType = 'General';

      await TaskService.createTask({
        task_name: name,
        assigned_to: assignedTo,
        assigned_to_name: assignedMember?.name || null,
        frequency: defaultFrequency,
        task_type: defaultType,
        recurring_config: defaultRecurringConfig,
        created_by: user.id,
        created_by_name: userProfile.name || userProfile.email || 'Unknown',
        status: 'to_do',
      });
      await fetchTasks();
    } catch (err) {
      console.error('Error adding task:', err);
      toast({ title: 'Add task failed', description: err instanceof Error ? err.message : 'Failed to add task', variant: 'destructive' });
    }
  };

  const formatDate = (dateStr: string) => fmtDate(dateStr + 'T00:00:00');

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

  const colLabel: Record<ColumnKey, string> = {
    taskName: 'Task Name', priority: 'Priority', assignee: 'Assignee', client: 'Client', dueDate: 'Due Date', comment: 'Comment',
    // [Frequency consolidation] 'frequency' label kept for back-compat
    // with saved prefs (renders empty cell); 'recurring' relabeled to
    // 'Repeats' for the user-facing column header.
    frequency: 'Frequency', recurring: 'Repeats', type: 'Type', link: 'Link',
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
      {/* v11 header strip — cream-50/80 background, ink-warm-500
          tracked-out labels at text-[10px] with 0.18em letter-spacing.
          Matches the table chrome on /clients, /intelligence,
          /crm/submissions. 2026-06-03. */}
      <tr className="border-b border-cream-200 bg-cream-50/80">
        <th className={`text-left py-2.5 px-3 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] ${COL.reorder}`}></th>
        <th className={`py-2.5 px-1 ${COL.status}`}></th>
        {visibleColumnOrder.map((col) => (
          <th
            key={col}
            className={`text-left py-2.5 px-3 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] ${COL[col]} cursor-grab select-none`}
            draggable
            onDragStart={() => handleColumnDragStart(col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
            onDrop={handleColumnDrop}
          >
            <div className="flex items-center gap-1">
              <GripVertical className="h-3 w-3 text-ink-warm-300 flex-shrink-0" />
              {colLabel[col]}
            </div>
          </th>
        ))}
        <th className={`text-right py-2.5 px-3 ${COL.actions}`}></th>
      </tr>
    </thead>
  );

  const renderCell = (task: Task, col: ColumnKey, isSubtask: boolean = false, showParentLink: boolean = false) => {
    const isEditingField = (field: string) => editingCell?.taskId === task.id && editingCell?.field === field;
    // [Subtask visibility v4]
    //   - Top-level parent: render the chevron when the task has any
    //     subtasks (data comes from the global subtasksByParent map).
    //     Lets the parent assignee expand for full visibility.
    //   - Nested subtask (under expanded parent): indent + left-border,
    //     no subtitle (parent is right above).
    //   - Standalone subtask (in subtask assignee's group, parent in
    //     another group): indent + left-border AND a "↳ Part of..."
    //     subtitle linking back to the parent.
    const childCount = isSubtask ? 0 : (subtasksByParent.get(task.id)?.length || 0);
    const isExpanded = expandedTaskIds.has(task.id);
    const parentTask = showParentLink && task.parent_task_id
      ? tasks.find(t => t.id === task.parent_task_id)
      : null;

    switch (col) {
      case 'taskName':
        return (
          <td key={col} className={`py-3 px-3 ${COL.taskName}`}>
            <div className={`flex items-center gap-2 ${isSubtask ? 'pl-6 border-l-2 border-cream-100' : ''}`}>
              {/* Chevron — only on top-level parents that have at least
                  one subtask anywhere. */}
              {!isSubtask && childCount > 0 && (
                <button
                  type="button"
                  className="p-0.5 rounded hover:bg-cream-200 transition-colors flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); toggleTaskExpand(task.id); }}
                  title={isExpanded ? 'Collapse subtasks' : `Expand ${childCount} subtask${childCount === 1 ? '' : 's'}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-ink-warm-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-ink-warm-400" />
                  )}
                </button>
              )}
              {/* Spacer for top-level rows that have no subtasks — keeps
                  task names vertically aligned across all rows. */}
              {!isSubtask && childCount === 0 && (
                <span className="w-4 flex-shrink-0" aria-hidden />
              )}
              <div className="flex-1 min-w-0">
            {isEditingField('task_name') ? (
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={saveInlineEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') cancelEditing(); }}
                className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-sm font-medium text-ink-warm-900"
                style={{ outline: 'none', boxShadow: 'none' }}
                autoFocus
              />
            ) : task.description && task.description !== '<p><br></p>' ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="text-ink-warm-900 font-medium line-clamp-2 cursor-pointer inline-flex items-center gap-1.5 hover:text-brand transition-colors"
                      // Single click opens the full detail modal — primary
                      // affordance for users who want to see / edit
                      // everything about a task. Double-click stays the
                      // power-user shortcut for inline-renaming, debounced
                      // via the shared timer so the modal doesn't open
                      // when the user is actually double-clicking.
                      onClick={() => handleTaskNameClick(task)}
                      onDoubleClick={(e) => { e.stopPropagation(); handleTaskNameDoubleClick(task); }}
                      title="Click to expand · Double-click to rename inline"
                    >
                      {task.short_id && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-cream-100 text-ink-warm-700 flex-shrink-0"
                          title={`Short ID — type "/done ${task.short_id}" in Telegram to close`}
                        >
                          {task.short_id}
                        </span>
                      )}
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
                              : 'bg-cream-100 text-ink-warm-700'
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
                className="text-ink-warm-900 font-medium line-clamp-2 cursor-pointer inline-flex items-center gap-1.5 hover:text-brand transition-colors"
                onClick={() => handleTaskNameClick(task)}
                onDoubleClick={(e) => { e.stopPropagation(); handleTaskNameDoubleClick(task); }}
                title="Click to expand · Double-click to rename inline"
              >
                {task.short_id && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-cream-100 text-ink-warm-700 flex-shrink-0"
                    title={`Short ID — type "/done ${task.short_id}" in Telegram to close`}
                  >
                    {task.short_id}
                  </span>
                )}
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
                {/* [HQ Tasks ↔ Action Board link, May 2026] Lights up
                    when this task is tied to a client Action Board item.
                    Tooltip shows the linked item's text — fetched into
                    actionItemLabels keyed by client_action_item_id. */}
                {task.client_action_item_id && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 flex-shrink-0"
                    title={
                      actionItemLabels[task.client_action_item_id]
                        ? `Linked: ${actionItemLabels[task.client_action_item_id]}`
                        : 'Linked to a client Action Board item'
                    }
                  >
                    <Link2 className="h-2.5 w-2.5" /> Client task
                  </span>
                )}
              </span>
            )}
            {/* [Subtask visibility v4] Parent-link subtitle — only on
                STANDALONE subtask rows (subtask assignee's group, where
                the parent isn't visible above). Nested rows under an
                expanded parent skip this because context is obvious. */}
            {showParentLink && parentTask && (
              <p
                className="text-[10px] text-ink-warm-400 mt-0.5 truncate"
                title={`Part of: ${parentTask.task_name}`}
              >
                ↳ Part of: {parentTask.task_name}
              </p>
            )}
              </div>
            </div>
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
                    <span className="text-ink-warm-700 flex items-center gap-1">
                      {userPhotoMap[task.assigned_to || ''] ? (
                        <img src={userPhotoMap[task.assigned_to || '']!} className="h-4 w-4 rounded-full" />
                      ) : (
                        <User className="h-3 w-3 text-ink-warm-400" />
                      )}
                      {task.assigned_to_name.split(' ')[0]}
                    </span>
                  ) : (
                    <span className="text-ink-warm-400">—</span>
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
                      <span className="text-ink-warm-700">{clientMap[task.client_id]}</span>
                    ) : (
                      <span className="text-ink-warm-400">—</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No client</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <span className="px-2 py-1 text-xs font-medium text-ink-warm-700 truncate max-w-[100px] inline-block">
                {task.client_id && clientMap[task.client_id] ? clientMap[task.client_id] : <span className="text-ink-warm-400">—</span>}
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
                <button className={`text-sm hover:text-ink-warm-700 cursor-pointer ${getDueDateColor(task.due_date) || 'text-ink-warm-500'}`}>
                  {task.due_date ? fmtDate(task.due_date + 'T00:00:00') : '—'}
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
                  className="text-ink-warm-700 line-clamp-2 whitespace-pre-wrap cursor-pointer text-xs flex-1"
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
      // [Frequency consolidation] No-op for any saved column-order
      // arrays that still include 'frequency' — renders an empty
      // cell to keep table alignment instead of dropping the <td>.
      // Safe to delete this case after a few months of user pref
      // turnover.
      case 'frequency':
        return <td key={col} className={`py-3 px-3 ${COL.frequency}`} />;
      case 'recurring': {
        // [Frequency consolidation, May 2026] Now labeled "Repeats" in
        // the column header. The legacy 'frequency' cell case was
        // removed — it duplicated this column. Cell still opens the
        // shared RecurringConfigEditor popover; turning it on/off
        // is the single user-facing control for whether a task
        // auto-recreates on completion.
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
                      ? 'bg-brand-light text-brand hover:bg-brand-light/70 border border-brand/30'
                      : 'text-ink-warm-400 hover:text-ink-warm-700 hover:bg-cream-100 border border-transparent'
                  }`}
                  title={isOn ? `Auto-recreates on complete (${summary})` : 'Click to enable auto-recreate on completion'}
                >
                  <RefreshCw className={`h-3 w-3 ${isOn ? 'text-brand' : 'text-ink-warm-400'}`} />
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
                className="text-ink-warm-400 cursor-pointer text-xs"
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
              <span className="text-ink-warm-400 text-xs">—</span>
            )}
          </td>
        );
      }
      case 'created':
        return (
          <td key={col} className={`py-3 px-3 whitespace-nowrap ${COL.created}`}>
            <span className="text-ink-warm-500 text-xs">
              {fmtDate(task.created_at)}
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
              <span className="text-emerald-700 text-xs font-medium">
                {fmtDate(task.completed_at)}
              </span>
            ) : (
              <span className="text-ink-warm-300 text-xs">—</span>
            )}
          </td>
        );
    }
  };

  const renderTaskRow = (task: Task, isSubtask: boolean = false, showParentLink: boolean = false) => {
    const globalIdx = globalSorted.findIndex(t => t.id === task.id);

    return (
      <tr
        key={task.id}
        className={`border-b border-cream-100 hover:bg-cream-50/50 transition-colors group ${
          // [Subtasks v1] Subtle background tint + lighter border so subtask
          // rows visually nest under their parent. Combined with the
          // task-name-cell indent (renderCell), it creates the tree look.
          isSubtask ? 'bg-cream-50/40' : ''
        }`}
      >
        {/* Reorder arrows — hidden for subtasks (they're ordered within
            their parent, not across the global flat list). The cell still
            exists to preserve the table grid alignment. */}
        <td className={`py-3 px-3 ${COL.reorder}`}>
          {!isSubtask && (
            <div className="flex flex-col items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-auto h-auto px-1 py-0 hover:bg-cream-100 disabled:opacity-20"
                onClick={() => handleReorder(task.id, 'up')}
                disabled={globalIdx === 0}
              >
                <ChevronUp className="h-3.5 w-3.5 text-ink-warm-400" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-auto h-auto px-1 py-0 hover:bg-cream-100 disabled:opacity-20"
                onClick={() => handleReorder(task.id, 'down')}
                disabled={globalIdx === globalSorted.length - 1}
              >
                <ChevronDown className="h-3.5 w-3.5 text-ink-warm-400" />
              </Button>
            </div>
          )}
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
                      className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-cream-100 transition-colors text-left ${task.status === s ? 'bg-cream-100 font-medium' : ''}`}
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
        {visibleColumnOrder.map((col) => renderCell(task, col, isSubtask, showParentLink))}

        {/* Actions - always last */}
        <td className={`py-3 px-3 text-right ${COL.actions}`}>
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-cream-200" onClick={() => openForm(task)} title="Edit in popup">
              <Expand className="h-3.5 w-3.5 text-ink-warm-500" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-rose-50" onClick={() => setDeletingId(task.id)}>
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const renderTaskTable = (groupTasks: Task[], groupKey: string) => {
    // [Subtask visibility v4] Two kinds of subtask rows:
    //
    //   1. NESTED: appears under an expanded parent (chevron toggles).
    //      Used when the subtask's parent is in this SAME assignee
    //      group. The parent owns the visual relationship via the
    //      chevron — no subtitle needed since context is right above.
    //
    //   2. STANDALONE: appears as its own row in the subtask
    //      assignee's group, WITH a "↳ Part of: [parent name]"
    //      subtitle. Used when the parent is in a DIFFERENT group
    //      (or no group at all — e.g., orphan).
    //
    // Net effect: parent assignee sees parent + chevron (collapse to
    // keep the list clean, expand for full sub-visibility). Subtask
    // assignee sees their work with a link back to the main deliverable.
    // No duplication when both assignees are the same person.
    const topLevel = groupTasks.filter(t => !t.parent_task_id);
    const topLevelIdSet = new Set(topLevel.map(t => t.id));
    const standaloneSubtasks: Task[] = [];
    for (const t of groupTasks) {
      if (!t.parent_task_id) continue;
      // If parent is in this group, the subtask is NESTED only —
      // rendered under the parent when expanded. Don't push standalone.
      if (topLevelIdSet.has(t.parent_task_id)) continue;
      standaloneSubtasks.push(t);
    }
    const sortStep = (a: Task, b: Task) => {
      const numA = parseInt(a.task_name.match(/^(\d+)\./)?.[1] || '999');
      const numB = parseInt(b.task_name.match(/^(\d+)\./)?.[1] || '999');
      if (numA !== numB) return numA - numB;
      return a.sort_order - b.sort_order;
    };
    const sortedTopLevel = [...topLevel].sort((a, b) => a.sort_order - b.sort_order);
    const rows: Array<{ task: Task; isSubtask: boolean; showParentLink: boolean }> = [];
    for (const t of sortedTopLevel) {
      rows.push({ task: t, isSubtask: false, showParentLink: false });
      // If expanded, show ALL the parent's subtasks (across all
      // assignees) — gives the parent assignee full visibility into
      // every step under their deliverable.
      if (expandedTaskIds.has(t.id)) {
        const allKids = subtasksByParent.get(t.id) || [];
        for (const k of [...allKids].sort(sortStep)) {
          rows.push({ task: k, isSubtask: true, showParentLink: false });
        }
      }
    }
    // Standalone subtasks appended after the top-level rows — these
    // are this assignee's subtasks whose parent lives elsewhere.
    for (const s of [...standaloneSubtasks].sort(sortStep)) {
      rows.push({ task: s, isSubtask: true, showParentLink: true });
    }
    return (
      // [Responsive cleanup, May 2026] Wrap the wide tasks table in
      // overflow-x-auto so it scrolls horizontally on narrow viewports
      // instead of breaking the layout. min-w on the inner table keeps
      // columns from squeezing.
      <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm min-w-[900px]">
        {tableHeader}
        <tbody>
          {rows.map(({ task, isSubtask, showParentLink }) => renderTaskRow(task, isSubtask, showParentLink))}
          {addingToGroup === groupKey && (
            <tr className="border-b border-cream-100 bg-cream-50/30">
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
      </div>
    );
  };

  // Header actions — extracted so loading + loaded states share the
  // same shape (only the dropdown menu is interactive in the loaded
  // state; loading shows a Skeleton-disabled version so the title row
  // doesn't shift when data arrives).
  const headerActions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="brand">
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
  );

  // ── Loading branch ────────────────────────────────────────────────
  // Unified structural skeleton mirroring the loaded layout:
  // PageHeader (same kicker so the title strip doesn't shift) →
  // SectionHeader skeleton → tab strip (v11 cream-100 outer) →
  // filter row → 2 group-card skeletons. The previous version had
  // TWO separate piecewise skeletons mid-render (one for the tabs,
  // one for the table content) which made the layout flash twice
  // and didn't reflect the actual grouped-by-assignee shape.
  // 2026-06-03 v11 pass.
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={ListTodo}
          title="Tasks"
          subtitle="Manage team tasks, SOPs, and recurring work"
          kicker="Workspace · HQ"
          kickerDot="brand"
          actions={headerActions}
        />

        {/* SectionHeader skeleton */}
        <div className="section-head first flex items-center gap-3">
          <span className="dot bg-brand/30" aria-hidden />
          <Skeleton className="h-3 w-20" />
          <span className="flex-1 h-px bg-cream-200" aria-hidden />
          <Skeleton className="h-3 w-40" />
        </div>

        {/* Tab strip skeleton — 3 chip placeholders inside the v11
            cream-100 container. */}
        <div className="flex p-1 rounded-md bg-cream-100 border border-cream-200 w-fit">
          <Skeleton className="h-9 w-28 rounded" />
          <Skeleton className="h-9 w-28 rounded" />
          <Skeleton className="h-9 w-32 rounded" />
        </div>

        {/* Filter row skeleton — search (max-w-sm) + show-completed
            toggle. Matches the loaded toolbar. */}
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 flex-1 max-w-sm rounded-md" />
          <Skeleton className="h-9 w-44 rounded-md" />
        </div>

        {/* Two group-card skeletons — most HQ users see 2-3 assignee
            groups (their own + a teammate or two). Each has a header
            row (avatar + name + count) + 4 task rows. */}
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, gi) => (
            <div key={gi} className="border border-cream-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-cream-50 border-b border-cream-200">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-8 rounded-full" />
                </div>
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
              <div className="bg-white">
                {Array.from({ length: 4 }).map((_, ri) => (
                  <div key={ri} className="flex items-center gap-3 py-3 px-4 border-b border-cream-100 last:border-0">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 flex-1 max-w-[300px]" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ListTodo}
        title="Tasks"
        subtitle="Manage team tasks, SOPs, and recurring work"
        kicker="Workspace · HQ"
        kickerDot="brand"
        actions={headerActions}
      />

      {/* [2026-06-11] Post-Onboarding spec Q4 — Jdot picked "widget is
          good." Surfaces every pending Zone B feed item across the
          current week so a CM can flip items Done without leaving HQ.
          Hides itself when nothing's pending; mounts above the
          SectionHeader so the chapter divider stays correct for the
          task list below. */}
      <ThisWeekFeedWidget
        currentUserId={user?.id ?? null}
        currentUserName={userProfile?.name ?? user?.email ?? null}
      />

      {/* v11 chapter divider — counter shows the live narrowing so
          users can see at a glance how aggressive their filters are
          ("12 of 47 tasks · one-time · search:foo"). */}
      <SectionHeader
        label="Tasks"
        dot="brand"
        counter={`${filtered.length} of ${tasks.length} tasks${
          activeTab === 'recurring' ? ' · recurring' :
          activeTab === 'deliverables' ? ' · deliverables' :
          ' · one-time'
        }${searchTerm ? ` · search:${searchTerm}` : ''}${groupBy !== 'assignee' ? ` · grouped by ${groupBy}` : ''}`}
        first
      />

      {/* Tabs */}
      <div>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                {/* Client-filter pill — visible only when /tasks?client=
                    is set (e.g. arrived from /clients HQ tasks badge).
                    Click X to clear the filter back to "all clients". */}
                {clientFilterId && (
                  <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 bg-brand/10 text-brand rounded-full text-xs font-medium">
                    <span>Client: {clientMap[clientFilterId] || 'unknown'}</span>
                    <button
                      type="button"
                      onClick={() => router.replace('/tasks')}
                      className="hover:bg-brand/20 rounded-full p-0.5"
                      aria-label="Clear client filter"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {/* [HQ Tasks ↔ Action Board link] Pill for the
                    ?actionItem= URL filter. Sits next to the client
                    pill (they typically come together since action
                    items are scoped per client). Clears just the
                    actionItem param while preserving ?client=. */}
                {actionItemFilterId && (
                  <div className="mb-2 ml-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-xs font-medium">
                    <Link2 className="h-3 w-3" />
                    <span>
                      Client task: {actionItemLabels[actionItemFilterId] || '…'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        // Preserve client filter if it's set
                        if (clientFilterId) {
                          router.replace(`/tasks?client=${clientFilterId}`);
                        } else {
                          router.replace('/tasks');
                        }
                      }}
                      className="hover:bg-emerald-100 rounded-full p-0.5"
                      aria-label="Clear action item filter"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {/* v11 tab chrome — cream-100 outer, white active tile
                    with shadow-card + brand text, brand-light count
                    chips. Replaces the old `bg-gray-100 p-1` + `shadow-sm`
                    + `bg-gray-200 text-gray-600` count pattern. */}
                <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200 flex-wrap">
                  <TabsTrigger
                    value="one-time"
                    className="text-sm px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card"
                  >
                    One-Time
                    <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full tabular-nums">{oneTimeCount}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="recurring"
                    className="text-sm px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card"
                  >
                    Recurring
                    <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full tabular-nums">{recurringCount}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="deliverables"
                    className="text-sm px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card"
                  >
                    Deliverables
                    <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full tabular-nums">{deliverableCount}</span>
                  </TabsTrigger>
                  {/* [2026-06-12] Initiatives tab per Appendix v3 Initiative
                      Milestones Add-on placement: "Initiatives are a new tab
                      on HQ (/tasks), alongside One-Time, Recurring, and
                      Deliverables." Renders inline table from
                      InitiativesTaskTab; deep edit still lives at /initiatives. */}
                  <TabsTrigger
                    value="initiatives"
                    className="text-sm px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card"
                  >
                    Initiatives
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Search + Show-completed toggle */}
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-warm-400 pointer-events-none" aria-hidden />
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
                  in the vault" signal so users notice they exist.

                  2026-06-03 v11 — was a bespoke green-tinted button; now
                  reads as a checked-state chip with brand-tinted active
                  treatment so it matches other on/off chips elsewhere
                  in the app. */}
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
                    ? 'bg-brand-light border-brand/30 text-brand hover:bg-brand-light/80'
                    : 'bg-white border-cream-200 text-ink-warm-700 hover:bg-cream-50'
                }`}
                title={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
              >
                <CheckCircle2 className={`h-4 w-4 ${showCompleted ? 'text-brand' : 'text-ink-warm-400'}`} />
                <span className="font-medium">
                  {showCompleted ? 'Showing completed' : 'Show completed'}
                </span>
                {hiddenCompletedCount > 0 && !showCompleted && (
                  <span className="text-[11px] bg-cream-100 text-ink-warm-700 rounded-full px-1.5 py-0.5 tabular-nums">
                    {hiddenCompletedCount} hidden
                  </span>
                )}
              </button>

              {/* Group-by — re-pivots the grouped list. Default
                  'Assignee' preserves the historical behavior; other
                  modes bucket by client / type / status / priority,
                  or flatten everything into one list. Choice persists
                  in localStorage; the "+ Add" button hides in non-
                  assignee modes since the row-add flow assumes the
                  group key maps to assigned_to. */}
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs font-medium text-ink-warm-500 uppercase tracking-wider">Group by</span>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByKey)}>
                  <SelectTrigger className="h-9 w-[150px] text-sm focus-brand">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_BY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
      {/* Grouped Tables — no separate loading branch (handled at the
          top of the component for a structural skeleton). */}
      {filtered.length === 0 ? (
            <Card className="overflow-hidden">
              <EmptyState
                icon={ClipboardList}
                title={tasks.length === 0 ? 'No tasks yet.' : 'No tasks match your filters.'}
                description={tasks.length === 0 ? 'Create your first task to start tracking work for the team.' : 'Try widening the filter or clearing the search.'}
                className="py-16"
              >
                {tasks.length === 0 && (
                  <Button variant="brand" onClick={() => openForm()}>
                    <Plus className="h-4 w-4 mr-2" /> Create Your First Task
                  </Button>
                )}
              </EmptyState>
            </Card>
          ) : activeTab === 'initiatives' ? (
            // [2026-06-12] Initiative Milestones Add-on placement: render
            // the dedicated tab component, fully separate from the task
            // grouping logic. Deep edit + create still happens at /initiatives.
            <InitiativesTaskTab />
          ) : (
            <div className="space-y-4">
              {grouped.map((group, groupIdx) => {
                const isCollapsed = collapsedUsers.has(group.key);
                // Catch-all bucket keys for each mode that we want
                // visually de-emphasized (slate, not the rotation
                // brand colors). Reads as "not categorized yet."
                const isCatchAllBucket = group.key === '_unassigned'
                  || group.key === '_internal'
                  || group.key === '_untyped';
                const colors = isCatchAllBucket
                  ? { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' }
                  : getColorForIndex(groupIdx);
                // Photo lookup only meaningful in assignee mode.
                const photoUrl = groupBy === 'assignee' && !isCatchAllBucket
                  ? userPhotoMap[group.key]
                  : null;
                // "+ Add" makes sense only when the group key maps
                // cleanly to an assigned_to. Other modes hide the
                // button to avoid the "new task in the 'urgent'
                // bucket → which assignee?" ambiguity.
                const showAddButton = groupBy === 'assignee';

                return (
                  <div key={group.key}>
                    {/* Group Header */}
                    <div
                      className={`flex items-center justify-between px-4 py-3 ${colors.bg} ${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} border ${colors.border} ${isCollapsed ? '' : 'border-b-0'} cursor-pointer select-none transition-all`}
                      onClick={() => toggleGroupCollapse(group.key)}
                    >
                      <div className="flex items-center gap-3">
                        {isCollapsed ? (
                          <ChevronRight className={`w-4 h-4 ${colors.text}`} />
                        ) : (
                          <ChevronDown className={`w-4 h-4 ${colors.text}`} />
                        )}
                        <GroupHeaderIcon
                          groupBy={groupBy}
                          groupKey={group.key}
                          groupLabel={group.label}
                          photoUrl={photoUrl}
                          clientLogoUrl={groupBy === 'client' && !isCatchAllBucket ? clientLogoMap[group.key] : null}
                          colors={colors}
                          isCatchAllBucket={isCatchAllBucket}
                        />
                        <h3 className={`font-semibold ${colors.text}`}>{group.label}</h3>
                        <Badge variant="secondary" className="text-xs font-medium">
                          {group.tasks.length}
                        </Badge>
                      </div>
                      {showAddButton && (
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
                      )}
                    </div>

                    {/* Group Table */}
                    {!isCollapsed && (
                      <div className="bg-white rounded-b-lg border border-cream-200 border-t-0 overflow-hidden">
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
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
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

      {/* [2026-06-11] Pre-Ship Gate — opens when saveSelectField detects
          a client-linked task transitioning to 'complete' (status dropdown,
          kanban drag, bulk update — all funnel through saveSelectField).
          See handleGateConfirm for the post-pass flow. */}
      <PreShipGateModal
        open={!!gateTarget}
        taskName={gateTarget?.taskName ?? null}
        onConfirm={handleGateConfirm}
        onCancel={() => setGateTarget(null)}
        submitting={gateSubmitting}
      />
    </div>
  );
}

/**
 * Renders the 28×28 round icon at the left of each group header.
 * Behavior depends on the grouping dimension:
 *   - assignee → photo (if available), initials fallback, or User icon
 *     for the _unassigned bucket.
 *   - client / type → letter tile in the rotation color.
 *   - status / priority → semantic mini-icon (Circle/PlayCircle/
 *     AlertTriangle/etc.) so the bucket reads at a glance without
 *     reading the label.
 *
 * Kept as a sibling component instead of inlining because the assignee
 * case alone is ~25 lines of conditional render.
 */
function GroupHeaderIcon({
  groupBy,
  groupKey,
  groupLabel,
  photoUrl,
  clientLogoUrl,
  colors,
  isCatchAllBucket,
}: {
  groupBy: GroupByKey;
  groupKey: string;
  groupLabel: string;
  photoUrl: string | null | undefined;
  /** Client logo URL — only meaningful when groupBy === 'client' AND
   *  the bucket isn't a catch-all (`_internal` / 'Other'). */
  clientLogoUrl?: string | null;
  colors: { bg: string; text: string; border: string };
  isCatchAllBucket: boolean;
}) {
  // Assignee mode → photo / initials / generic User catch-all.
  if (groupBy === 'assignee') {
    if (isCatchAllBucket) {
      return (
        <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center">
          <User className="h-3.5 w-3.5 text-slate-500" />
        </div>
      );
    }
    if (photoUrl) {
      return (
        <div className="h-7 w-7 rounded-full overflow-hidden relative flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={groupLabel}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="h-7 w-7 bg-gradient-to-br from-brand to-[#2d6470] rounded-full flex items-center justify-center absolute top-0 left-0 hidden text-white text-xs font-bold">
            {getUserInitials(groupLabel)}
          </div>
        </div>
      );
    }
    return (
      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand to-[#2d6470] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {getUserInitials(groupLabel)}
      </div>
    );
  }

  // Status mode → status mini-icon (Circle/PlayCircle/etc.) in the
  // status-config tint, on a neutral background so the icon does the
  // signaling.
  if (groupBy === 'status') {
    const cfg = STATUS_CONFIG[groupKey] || STATUS_CONFIG.to_do;
    const Icon = cfg.icon;
    return (
      <div className="h-7 w-7 rounded-full bg-white border border-cream-200 flex items-center justify-center">
        <Icon className={`h-4 w-4 ${cfg.color}`} />
      </div>
    );
  }

  // Priority mode → AlertTriangle for overdue/urgent, ChevronUp for
  // high/medium, ChevronDown for low, CheckCircle2 for done. Tinted
  // by the computed-priority palette.
  if (groupBy === 'priority') {
    const palette: Record<string, { Icon: typeof Circle; color: string }> = {
      overdue:  { Icon: AlertTriangle, color: 'text-rose-700' },
      urgent:   { Icon: AlertTriangle, color: 'text-rose-600' },
      high:     { Icon: ChevronUp,     color: 'text-orange-600' },
      medium:   { Icon: ChevronUp,     color: 'text-blue-600' },
      low:      { Icon: ChevronDown,   color: 'text-ink-warm-400' },
      complete: { Icon: CheckCircle2,  color: 'text-emerald-500' },
    };
    const cfg = palette[groupKey] || palette.low;
    const Icon = cfg.Icon;
    return (
      <div className="h-7 w-7 rounded-full bg-white border border-cream-200 flex items-center justify-center">
        <Icon className={`h-4 w-4 ${cfg.color}`} />
      </div>
    );
  }

  // Client mode → show the client's logo when available, otherwise
  // fall through to the letter-tile fallback. Logo tile sits on a
  // white background with a cream hairline so dark client logos
  // don't blend into the colored header bg.
  if (groupBy === 'client' && clientLogoUrl) {
    return (
      <div className="h-7 w-7 rounded-md overflow-hidden border border-cream-200 bg-white shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={clientLogoUrl}
          alt={`${groupLabel} logo`}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Client / type / none modes (no logo, or non-client) → first-letter
  // tile in the rotation color, slate for catch-all buckets.
  const letter = (groupLabel || '?').trim().charAt(0).toUpperCase();
  return (
    <div className={`h-7 w-7 rounded-md flex items-center justify-center text-xs font-semibold ${colors.bg} ${colors.text} border ${colors.border}`}>
      {letter}
    </div>
  );
}
