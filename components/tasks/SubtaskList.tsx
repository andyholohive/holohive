'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TaskService, Task } from '@/lib/taskService';
import { UserService } from '@/lib/userService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { DeliverableService } from '@/lib/deliverableService';
import {
  Plus,
  Trash2,
  Circle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  MessageCircle,
  GitBranch,
  Lock,
  UserPlus,
} from 'lucide-react';

interface SubtaskListProps {
  parentTaskId: string;
  onSubtaskClick?: (task: Task) => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  to_do: { label: 'To Do', icon: Circle, color: 'text-gray-400' },
  in_progress: { label: 'In Progress', icon: PlayCircle, color: 'text-blue-500' },
  paused: { label: 'Paused', icon: PauseCircle, color: 'text-amber-500' },
  ready_for_feedback: { label: 'Feedback', icon: MessageCircle, color: 'text-purple-500' },
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-green-500' },
};

// Compact team-member shape used for the inline assignee picker. Loaded
// once per mount; clients are filtered out.
type TeamMember = {
  id: string;
  name: string;
  email: string;
  profile_photo_url: string | null;
};

// Two-letter initials for the assignee chip when no profile photo is
// available. Falls back to '?' for unassigned rows.
function initialsOf(name?: string | null, email?: string | null): string {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Stable color per user-id so the same person always gets the same chip
// background. Cheap hash → palette index.
const AVATAR_PALETTE = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];
function avatarColorFor(id?: string | null): string {
  if (!id) return 'bg-gray-100 text-gray-500';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// Tiny avatar pill (photo if available, else initials). Used both as the
// row's assignee display and as the picker trigger. Doubles as an
// "unassigned" placeholder when no userId is given.
function AssigneeChip({
  userId,
  name,
  photoUrl,
}: {
  userId: string | null;
  name?: string | null;
  photoUrl?: string | null;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || ''}
        className="h-5 w-5 rounded-full object-cover ring-1 ring-white"
      />
    );
  }
  if (!userId) {
    return (
      <div className="h-5 w-5 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center ring-1 ring-dashed ring-gray-300">
        <UserPlus className="h-2.5 w-2.5" />
      </div>
    );
  }
  return (
    <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold ring-1 ring-white ${avatarColorFor(userId)}`}>
      {initialsOf(name)}
    </div>
  );
}

export function SubtaskList({ parentTaskId, onSubtaskClick }: SubtaskListProps) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAssignee, setNewAssignee] = useState<TeamMember | null>(null);
  const [blockingSteps, setBlockingSteps] = useState<Set<number>>(new Set());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  // Tracks which row's assignee picker is open. Single popover at a time
  // — clicking a different row closes the previous one.
  const [pickerOpenForId, setPickerOpenForId] = useState<string | null>(null);

  useEffect(() => {
    loadSubtasks();
  }, [parentTaskId]);

  // Load the team list once; reused across all rows + the add-row picker.
  // Filter out clients — they shouldn't be assignable to internal subtasks.
  useEffect(() => {
    UserService.getAllUsers()
      .then((users) => {
        setTeamMembers(
          users
            .filter((u) => u.role !== 'client')
            .map((u) => ({
              id: u.id,
              name: u.name || u.email,
              email: u.email,
              profile_photo_url: u.profile_photo_url || null,
            }))
        );
      })
      .catch(() => {});
  }, []);

  const loadSubtasks = async () => {
    try {
      const data = await TaskService.getSubtasks(parentTaskId);
      setSubtasks(data);
      // Load blocking step info for deliverables
      DeliverableService.getDeliverableByTaskId(parentTaskId).then(del => {
        if (del) {
          const blocking = new Set<number>();
          del.steps.filter(s => s.is_blocking).forEach(s => blocking.add(s.step_order));
          setBlockingSteps(blocking);
        }
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !user?.id || !userProfile) return;
    try {
      await TaskService.createTask({
        task_name: newName.trim(),
        parent_task_id: parentTaskId,
        status: 'to_do',
        frequency: 'one-time',
        task_type: 'General',
        // If a teammate was picked from the inline picker, use them.
        // Otherwise leave unassigned (don't auto-assign to creator —
        // that surprised users who were just adding subtasks for someone
        // else to pick up).
        assigned_to: newAssignee?.id ?? null,
        assigned_to_name: newAssignee?.name ?? null,
        created_by: user.id,
        created_by_name: userProfile.name || userProfile.email || 'Unknown',
      });
      setNewName('');
      setNewAssignee(null);
      setAdding(false);
      await loadSubtasks();
    } catch {
      toast({ title: 'Error', description: 'Failed to add subtask.', variant: 'destructive' });
    }
  };

  // Reassign (or clear) the assignee on an existing subtask. Updates
  // local state optimistically and falls back to a refetch on error.
  // The TG notification fires automatically via TaskService.updateField
  // when assigned_to is set to a non-null value (deduped server-side).
  const handleReassign = async (subtask: Task, member: TeamMember | null) => {
    setPickerOpenForId(null);
    const optimistic: Partial<Task> = {
      assigned_to: member?.id ?? null,
      assigned_to_name: member?.name ?? null,
    };
    setSubtasks(prev => prev.map(t => t.id === subtask.id ? { ...t, ...optimistic } : t));
    try {
      // Two-field update: assigned_to AND assigned_to_name. updateField
      // takes one field at a time, so issue both — the backend handles
      // them as separate UPDATEs but they land back-to-back.
      await TaskService.updateField(subtask.id, 'assigned_to', member?.id ?? null);
      await TaskService.updateField(subtask.id, 'assigned_to_name', member?.name ?? null);
      if (member) {
        toast({ title: 'Subtask assigned', description: `${subtask.task_name} → ${member.name}` });
      }
    } catch (err: any) {
      console.error('Error reassigning subtask:', err);
      toast({ title: 'Reassign failed', description: err?.message, variant: 'destructive' });
      await loadSubtasks();
    }
  };

  // Check if a step is locked (previous blocking step not complete)
  const isStepLocked = (subtask: Task): boolean => {
    if (blockingSteps.size === 0) return false;
    // Parse step order from task name (e.g. "2. Client Review" → 2)
    const match = subtask.task_name.match(/^(\d+)\./);
    if (!match) return false;
    const stepOrder = parseInt(match[1]);

    // Check if any blocking step before this one is incomplete
    for (const blockOrder of blockingSteps) {
      if (blockOrder < stepOrder) {
        const blockingTask = subtasks.find(t => t.task_name.startsWith(`${blockOrder}.`));
        if (blockingTask && blockingTask.status !== 'complete') return true;
      }
    }
    return false;
  };

  const handleStatusToggle = async (subtask: Task) => {
    // Enforce blocking: prevent starting a step if a prior blocking step is incomplete
    if (subtask.status !== 'complete' && isStepLocked(subtask)) {
      toast({ title: 'Step locked', description: 'Complete the previous blocking step first.', variant: 'destructive' });
      return;
    }

    const newStatus = subtask.status === 'complete' ? 'to_do' : 'complete';
    setSubtasks(prev => prev.map(t => t.id === subtask.id ? { ...t, status: newStatus } : t));
    try {
      await TaskService.updateField(subtask.id, 'status', newStatus);

      // Check if all subtasks are now complete → notify user
      if (newStatus === 'complete') {
        const updatedSubtasks = subtasks.map(t => t.id === subtask.id ? { ...t, status: newStatus } : t);
        const allDone = updatedSubtasks.every(t => t.status === 'complete');
        if (allDone) {
          toast({ title: 'Deliverable complete', description: 'All steps are done — the parent task has been marked complete.' });
        }
      }
    } catch {
      await loadSubtasks();
    }
  };

  const handleDelete = async (id: string) => {
    setSubtasks(prev => prev.filter(t => t.id !== id));
    try {
      await TaskService.deleteTask(id);
    } catch {
      await loadSubtasks();
    }
  };

  // Reusable assignee picker. Used both inline on each subtask row and
  // as a pre-add picker for new subtasks. Searchable; first row clears.
  const renderAssigneePicker = (
    triggerId: string,
    current: { userId: string | null; name?: string | null; photoUrl?: string | null },
    onSelect: (member: TeamMember | null) => void,
    isOpen: boolean,
    setOpen: (open: boolean) => void,
  ) => (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex-shrink-0 hover:opacity-80 transition-opacity"
          title={current.name || 'Assign to...'}
          onClick={(e) => e.stopPropagation()}
        >
          <AssigneeChip userId={current.userId} name={current.name} photoUrl={current.photoUrl} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Assign to..." />
          <CommandList>
            <CommandEmpty>No teammates.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__unassign__"
                onSelect={() => onSelect(null)}
              >
                <span className="text-gray-500 italic">Unassign</span>
              </CommandItem>
              {teamMembers.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.name} ${m.email}`}
                  onSelect={() => onSelect(m)}
                >
                  <AssigneeChip userId={m.id} name={m.name} photoUrl={m.profile_photo_url} />
                  <div className="ml-2 flex flex-col min-w-0">
                    <span className="truncate text-sm">{m.name}</span>
                    {m.name !== m.email && (
                      <span className="truncate text-[10px] text-gray-400">{m.email}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  const doneCount = subtasks.filter(t => t.status === 'complete').length;

  if (loading) {
    return <div className="text-sm text-gray-400 py-2 text-center">Loading subtasks...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-gray-500" />
          <h4 className="text-sm font-semibold text-gray-700">Subtasks</h4>
          {subtasks.length > 0 && (
            <span className="text-xs text-gray-400">{doneCount}/{subtasks.length}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>

      {subtasks.length > 0 && (
        <div className="space-y-0.5">
          {subtasks.map((subtask) => {
            const cfg = STATUS_CONFIG[subtask.status] || STATUS_CONFIG.to_do;
            const Icon = cfg.icon;
            const assigneeMember = teamMembers.find(m => m.id === subtask.assigned_to);
            return (
              <div key={subtask.id} className={`flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 group ${isStepLocked(subtask) ? 'opacity-50' : ''}`}>
                <button onClick={() => handleStatusToggle(subtask)} className="flex-shrink-0" title={isStepLocked(subtask) ? 'Blocked by previous step' : undefined}>
                  {isStepLocked(subtask) ? <Lock className="h-4 w-4 text-gray-300" /> : <Icon className={`h-4 w-4 ${cfg.color}`} />}
                </button>
                <span
                  className={`flex-1 text-xs cursor-pointer ${subtask.status === 'complete' ? 'line-through text-gray-400' : 'text-gray-700'}`}
                  onClick={() => onSubtaskClick?.(subtask)}
                >
                  {subtask.task_name}
                </span>
                {subtask.due_date && (
                  <span className="text-[10px] text-gray-400">
                    {new Date(subtask.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {renderAssigneePicker(
                  subtask.id,
                  {
                    userId: subtask.assigned_to,
                    name: subtask.assigned_to_name,
                    photoUrl: assigneeMember?.profile_photo_url,
                  },
                  (member) => handleReassign(subtask, member),
                  pickerOpenForId === subtask.id,
                  (open) => setPickerOpenForId(open ? subtask.id : null),
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-50"
                  onClick={() => handleDelete(subtask.id)}
                >
                  <Trash2 className="h-3 w-3 text-red-400" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="flex items-center gap-2">
          <Circle className="h-4 w-4 text-gray-300 flex-shrink-0" />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => { if (!newName.trim()) { setAdding(false); setNewAssignee(null); } else handleAdd(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); setNewAssignee(null); }
            }}
            placeholder="Subtask name..."
            className="flex-1 h-7 text-xs border-none shadow-none px-0 bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            style={{ outline: 'none', boxShadow: 'none' }}
            autoFocus
          />
          {/* Pre-add picker — lets the user pick an assignee at the same
              moment they type the name. Open state is `pickerOpenForId
              === '__new__'` so it doesn't collide with row pickers. */}
          {renderAssigneePicker(
            '__new__',
            { userId: newAssignee?.id ?? null, name: newAssignee?.name, photoUrl: newAssignee?.profile_photo_url },
            (member) => setNewAssignee(member),
            pickerOpenForId === '__new__',
            (open) => setPickerOpenForId(open ? '__new__' : null),
          )}
        </div>
      )}

      {subtasks.length === 0 && !adding && (
        <p className="text-xs text-gray-400 text-center py-1">No subtasks</p>
      )}
    </div>
  );
}
