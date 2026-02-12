'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';
import { useAuth } from '@/contexts/AuthContext';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import { supabase } from '@/lib/supabase';
import { UserService } from '@/lib/userService';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  ListTodo,
  Search,
  Trash2,
  Edit,
  Calendar as CalendarIcon,
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
} from 'lucide-react';

type Task = {
  id: string;
  task_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  latest_comment: string | null;
  frequency: string;
  task_type: string;
  link: string | null;
  description: string | null;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

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
  'Client SOP',
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

const frequencyBadge = (freq: string) => {
  switch (freq) {
    case 'one-time': return 'bg-gray-100 text-gray-700';
    case 'daily': return 'bg-blue-100 text-blue-800';
    case 'weekly': return 'bg-green-100 text-green-800';
    case 'monthly': return 'bg-purple-100 text-purple-800';
    case 'recurring': return 'bg-orange-100 text-orange-800';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const typeBadge = (type: string) => {
  switch (type) {
    case 'Admin & Operations': return 'bg-slate-100 text-slate-700';
    case 'Finance & Invoicing': return 'bg-emerald-100 text-emerald-800';
    case 'General': return 'bg-gray-100 text-gray-700';
    case 'Tech & Tools': return 'bg-blue-100 text-blue-800';
    case 'Marketing & Sales': return 'bg-pink-100 text-pink-800';
    case 'Client SOP': return 'bg-amber-100 text-amber-800';
    case 'Client Delivery': return 'bg-cyan-100 text-cyan-800';
    case 'Performance Review': return 'bg-violet-100 text-violet-800';
    case 'Research & Analytics': return 'bg-indigo-100 text-indigo-800';
    default: return 'bg-gray-100 text-gray-700';
  }
};

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
  reorder: 'w-[50px]',
  status: 'w-[36px]',
  taskName: 'w-[22%] min-w-[180px]',
  dueDate: 'w-[110px]',
  comment: 'w-[14%] min-w-[100px]',
  frequency: 'w-[100px]',
  type: 'w-[140px]',
  link: 'w-[80px]',
  createdBy: 'w-[100px]',
  created: 'w-[80px]',
  actions: 'w-[80px]',
};

type ColumnKey = 'taskName' | 'dueDate' | 'comment' | 'frequency' | 'type' | 'link' | 'createdBy' | 'created';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'taskName', label: 'Task Name' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'comment', label: 'Comment' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'type', label: 'Type' },
  { key: 'link', label: 'Link' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'created', label: 'Created' },
];

const DEFAULT_COLUMN_ORDER: ColumnKey[] = COLUMN_DEFS.map(c => c.key);
const COLUMN_ORDER_KEY = 'tasks-column-order';

export default function TasksPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activeTab, setActiveTab] = useState<string>('one-time');
  const [searchTerm, setSearchTerm] = useState('');
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

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
  });

  useEffect(() => {
    fetchTasks();
    UserService.getAllUsers().then((users) => {
      setTeamMembers(
        users
          .filter(u => u.role !== 'client')
          .map(u => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role, profile_photo_url: u.profile_photo_url || null }))
      );
    });
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    setTasks(data || []);
    setLoading(false);
  };

  // Build a map of user id -> profile photo
  const userPhotoMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    teamMembers.forEach(m => { map[m.id] = m.profile_photo_url; });
    return map;
  }, [teamMembers]);

  // Tab counts
  const oneTimeCount = useMemo(() =>
    tasks.filter(t => t.frequency === 'one-time' && t.task_type !== 'Client SOP').length,
    [tasks]
  );
  const recurringCount = useMemo(() =>
    tasks.filter(t => t.frequency !== 'one-time' && t.task_type !== 'Client SOP').length,
    [tasks]
  );
  const clientSopCount = useMemo(() =>
    tasks.filter(t => t.task_type === 'Client SOP').length,
    [tasks]
  );

  // Filter tasks by tab + search
  const filtered = useMemo(() => {
    let tabFiltered: Task[];
    if (activeTab === 'one-time') {
      tabFiltered = tasks.filter(t => t.frequency === 'one-time' && t.task_type !== 'Client SOP');
    } else if (activeTab === 'recurring') {
      tabFiltered = tasks.filter(t => t.frequency !== 'one-time' && t.task_type !== 'Client SOP');
    } else {
      tabFiltered = tasks.filter(t => t.task_type === 'Client SOP');
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
  }, [tasks, activeTab, searchTerm]);

  // Group filtered tasks by assigned_to
  const groupedByUser = useMemo(() => {
    const groups: { key: string; label: string; tasks: Task[] }[] = [];
    const map = new Map<string, Task[]>();

    for (const task of filtered) {
      const key = task.assigned_to || '_unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }

    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === '_unassigned') return 1;
      if (b === '_unassigned') return -1;
      const nameA = map.get(a)![0].assigned_to_name || '';
      const nameB = map.get(b)![0].assigned_to_name || '';
      return nameA.localeCompare(nameB);
    });

    for (const key of sortedKeys) {
      const tasks = map.get(key)!;
      const label = key === '_unassigned' ? 'Unassigned' : (tasks[0].assigned_to_name || 'Unknown');
      groups.push({ key, label, tasks });
    }

    return groups;
  }, [filtered]);

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
      await supabase.from('tasks').update({
        [field]: value,
        updated_at: new Date().toISOString(),
      }).eq('id', taskId);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchTasks();
    }
  };

  const saveSelectField = async (taskId: string, field: string, value: string, extra?: Record<string, string | null>) => {
    const updates: Record<string, string | null> = { [field]: value || null, ...extra };
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates, updated_at: new Date().toISOString() } : t));
    try {
      await supabase.from('tasks').update({
        ...updates,
        updated_at: new Date().toISOString(),
      }).eq('id', taskId);
    } catch (error) {
      console.error('Error saving:', error);
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
      await supabase.from('tasks').update({
        due_date: dateStr,
        updated_at: new Date().toISOString(),
      }).eq('id', taskId);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchTasks();
    }
  };

  const openForm = (task?: Task) => {
    if (task) {
      setEditingId(task.id);
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
      });
    } else {
      setEditingId(null);
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
      });
    }
    setIsFormOpen(true);
  };

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
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Updated', description: 'Task updated successfully.' });
      } else {
        const { error } = await supabase
          .from('tasks')
          .insert({
            ...payload,
            created_by: user.id,
            created_by_name: userProfile.name || userProfile.email || 'Unknown',
          });
        if (error) throw error;
        toast({ title: 'Created', description: 'Task created successfully.' });
      }

      setIsFormOpen(false);
      setEditingId(null);
      setForm({ task_name: '', assigned_to: '', due_date: undefined, frequency: '', task_type: '', link: '', latest_comment: '', description: '', status: 'to_do' });
      await fetchTasks();
    } catch (err) {
      console.error('Error saving task:', err);
      toast({ title: 'Error', description: 'Failed to save task.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await supabase.from('tasks').delete().eq('id', id);
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
      await Promise.all([
        supabase.from('tasks').update({ sort_order: newCurrentOrder }).eq('id', current.id),
        supabase.from('tasks').update({ sort_order: newSwapOrder }).eq('id', swap.id),
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
      const defaultType = activeTab === 'client-sop' ? 'Client SOP' : 'General';

      const { error } = await supabase.from('tasks').insert({
        task_name: name,
        assigned_to: assignedTo,
        assigned_to_name: assignedMember?.name || null,
        frequency: defaultFrequency,
        task_type: defaultType,
        created_by: user.id,
        created_by_name: userProfile.name || userProfile.email || 'Unknown',
      });
      if (error) throw error;
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

  const colLabel: Record<ColumnKey, string> = {
    taskName: 'Task Name', dueDate: 'Due Date', comment: 'Comment',
    frequency: 'Frequency', type: 'Type', link: 'Link',
    createdBy: 'Created By', created: 'Created',
  };

  const tableHeader = (
    <thead>
      <tr className="border-b border-gray-200 bg-gray-50/80">
        <th className={`text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider ${COL.reorder}`}></th>
        <th className={`py-3 px-1 ${COL.status}`}></th>
        {columnOrder.map((col) => (
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
                      className="text-gray-900 font-medium line-clamp-2 cursor-pointer"
                      onDoubleClick={() => startEditing(task.id, 'task_name', task.task_name)}
                    >
                      {task.task_name}
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
                className="text-gray-900 font-medium line-clamp-2 cursor-pointer"
                onDoubleClick={() => startEditing(task.id, 'task_name', task.task_name)}
                title="Double-click to edit"
              >
                {task.task_name}
              </span>
            )}
          </td>
        );
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
      case 'comment':
        return (
          <td key={col} className={`py-3 px-3 ${COL.comment}`}>
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
                className="text-gray-600 line-clamp-2 whitespace-pre-wrap cursor-pointer text-xs"
                onDoubleClick={() => startEditing(task.id, 'latest_comment', task.latest_comment || '')}
                title="Double-click to edit"
              >
                {task.latest_comment || '—'}
              </span>
            )}
          </td>
        );
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
                className="text-[#3e8692] hover:underline inline-flex items-center gap-1 text-xs"
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
                        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#3e8692] to-[#2d6470] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
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
        {columnOrder.map((col) => renderCell(task, col))}

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
      <table className="w-full text-sm table-fixed">
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
              <Button
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
                onClick={() => openForm()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
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
                      className="data-[state=active]:bg-white data-[state=active]:text-[#3e8692] data-[state=active]:shadow-sm text-sm px-4 py-2"
                    >
                      One-Time
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{oneTimeCount}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="recurring"
                      className="data-[state=active]:bg-white data-[state=active]:text-[#3e8692] data-[state=active]:shadow-sm text-sm px-4 py-2"
                    >
                      Recurring
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{recurringCount}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="client-sop"
                      className="data-[state=active]:bg-white data-[state=active]:text-[#3e8692] data-[state=active]:shadow-sm text-sm px-4 py-2"
                    >
                      Client SOP
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{clientSopCount}</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>

            {/* Search */}
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tasks, assignees, comments..."
                  className="pl-10 auth-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchTerm && (
                <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')}>
                  Clear
                </Button>
              )}
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
                            <div className="h-7 w-7 bg-gradient-to-br from-[#3e8692] to-[#2d6470] rounded-full flex items-center justify-center absolute top-0 left-0 hidden text-white text-xs font-bold">
                              {getUserInitials(group.label)}
                            </div>
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#3e8692] to-[#2d6470] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
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

      {/* Add/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingId(null); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Task' : 'Add Task'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the task details below.' : 'Create a new task for the team.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1 pb-4">
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
                  placeholder="Add a description (shown on hover)..."
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

            {/* Latest Comment */}
            <div className="grid gap-2">
              <Label>Latest Comment</Label>
              <Textarea
                value={form.latest_comment}
                onChange={(e) => setForm({ ...form, latest_comment: e.target.value })}
                placeholder="Add a comment or note..."
                className="auth-input"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button
              className="hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              onClick={handleSubmit}
              disabled={!form.task_name.trim() || !form.frequency || !form.task_type || submitting}
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : editingId ? 'Save Changes' : 'Add Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
