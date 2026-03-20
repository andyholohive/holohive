'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TaskService, TaskChecklistItem } from '@/lib/taskService';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, CheckSquare, Square, ListChecks } from 'lucide-react';

interface TaskChecklistProps {
  taskId: string;
}

export function TaskChecklist({ taskId }: TaskChecklistProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<TaskChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemText, setNewItemText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    loadItems();
  }, [taskId]);

  const loadItems = async () => {
    try {
      const data = await TaskService.getChecklist(taskId);
      setItems(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newItemText.trim()) return;
    try {
      await TaskService.addChecklistItem(taskId, newItemText.trim(), items.length);
      setNewItemText('');
      await loadItems();
    } catch {
      toast({ title: 'Error', description: 'Failed to add item.', variant: 'destructive' });
    }
  };

  const handleToggle = async (item: TaskChecklistItem) => {
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: !i.is_done } : i));
    try {
      await TaskService.toggleChecklistItem(item.id, !item.is_done);
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: item.is_done } : i));
    }
  };

  const handleEdit = async (itemId: string) => {
    if (!editText.trim()) {
      setEditingItemId(null);
      return;
    }
    try {
      await TaskService.updateChecklistItem(itemId, editText.trim());
      setEditingItemId(null);
      setEditText('');
      await loadItems();
    } catch {
      toast({ title: 'Error', description: 'Failed to update item.', variant: 'destructive' });
    }
  };

  const handleDelete = async (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    try {
      await TaskService.deleteChecklistItem(itemId);
    } catch {
      await loadItems();
    }
  };

  const doneCount = items.filter(i => i.is_done).length;
  const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  if (loading) {
    return <div className="text-sm text-gray-400 py-2 text-center">Loading checklist...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-gray-500" />
        <h4 className="text-sm font-semibold text-gray-700">Checklist</h4>
        {items.length > 0 && (
          <span className="text-xs text-gray-400">{doneCount}/{items.length}</span>
        )}
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#22c55e' : '#3e8692' }}
          />
        </div>
      )}

      {/* Items */}
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group py-0.5">
            <button
              onClick={() => handleToggle(item)}
              className="flex-shrink-0 hover:opacity-80"
            >
              {item.is_done ? (
                <CheckSquare className="h-4 w-4 text-green-500" />
              ) : (
                <Square className="h-4 w-4 text-gray-300 hover:text-gray-500" />
              )}
            </button>
            {editingItemId === item.id ? (
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => handleEdit(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEdit(item.id);
                  if (e.key === 'Escape') { setEditingItemId(null); setEditText(''); }
                }}
                className="flex-1 h-6 text-xs border-none shadow-none p-0 bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                style={{ outline: 'none', boxShadow: 'none' }}
                autoFocus
              />
            ) : (
              <span
                className={`flex-1 text-xs cursor-pointer ${item.is_done ? 'line-through text-gray-400' : 'text-gray-700'}`}
                onDoubleClick={() => { setEditingItemId(item.id); setEditText(item.text); }}
              >
                {item.text}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
              onClick={() => handleDelete(item.id)}
            >
              <Trash2 className="h-3 w-3 text-red-400" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add new item */}
      <div className="flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <Input
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Add checklist item..."
          className="flex-1 h-7 text-xs border-none shadow-none px-0 bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          style={{ outline: 'none', boxShadow: 'none' }}
        />
      </div>
    </div>
  );
}
