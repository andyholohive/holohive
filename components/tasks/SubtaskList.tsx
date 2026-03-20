'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TaskService, Task } from '@/lib/taskService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Trash2,
  Circle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  MessageCircle,
  GitBranch,
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

export function SubtaskList({ parentTaskId, onSubtaskClick }: SubtaskListProps) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadSubtasks();
  }, [parentTaskId]);

  const loadSubtasks = async () => {
    try {
      const data = await TaskService.getSubtasks(parentTaskId);
      setSubtasks(data);
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
        created_by: user.id,
        created_by_name: userProfile.name || userProfile.email || 'Unknown',
      });
      setNewName('');
      setAdding(false);
      await loadSubtasks();
    } catch {
      toast({ title: 'Error', description: 'Failed to add subtask.', variant: 'destructive' });
    }
  };

  const handleStatusToggle = async (subtask: Task) => {
    const newStatus = subtask.status === 'complete' ? 'to_do' : 'complete';
    setSubtasks(prev => prev.map(t => t.id === subtask.id ? { ...t, status: newStatus } : t));
    try {
      await TaskService.updateField(subtask.id, 'status', newStatus);
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
            return (
              <div key={subtask.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 group">
                <button onClick={() => handleStatusToggle(subtask)} className="flex-shrink-0">
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
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
            onBlur={() => { if (!newName.trim()) setAdding(false); else handleAdd(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            placeholder="Subtask name..."
            className="flex-1 h-7 text-xs border-none shadow-none px-0 bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            style={{ outline: 'none', boxShadow: 'none' }}
            autoFocus
          />
        </div>
      )}

      {subtasks.length === 0 && !adding && (
        <p className="text-xs text-gray-400 text-center py-1">No subtasks</p>
      )}
    </div>
  );
}
