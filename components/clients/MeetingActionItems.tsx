'use client';

/**
 * Structured action items panel for a client meeting note.
 *
 * Replaces (alongside, for now) the freeform `client_meeting_notes.action_items`
 * rich-text field. When a HH-side item is added (owner_user_id set, NOT client-side),
 * the API auto-creates a task linked back via `auto_created_task_id` — which the
 * Priority Dashboard then surfaces under Layer 1.
 *
 * Why a separate panel rather than restructuring the existing freeform field:
 *   - The freeform field still works for "loose notes" the team writes during
 *     a call. Structured items are for the things that need *follow-up*.
 *   - Backwards compat — existing meeting notes' action_items text stays.
 *
 * Only renders for SAVED meeting notes (needs a meeting_note_id to attach
 * items to). The host modal hides it during note creation.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Trash2, ListChecks, Plus, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type TeamMember = { id: string; name: string };

type ActionItem = {
  id: string;
  meeting_note_id: string;
  text: string;
  owner_user_id: string | null;
  owner_client_side: boolean;
  is_done: boolean;
  auto_created_task_id: string | null;
  created_at: string;
};

const CLIENT_SIDE_KEY = '__client_side__';

export default function MeetingActionItems({
  meetingNoteId,
  teamMembers,
}: {
  meetingNoteId: string;
  teamMembers: TeamMember[];
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [newOwnerSelect, setNewOwnerSelect] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meeting-action-items?meeting_note_id=${meetingNoteId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setItems(json.actionItems || []);
    } catch (err) {
      toast({ title: 'Failed to load action items', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [meetingNoteId, toast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        meeting_note_id: meetingNoteId,
        text: newText.trim(),
      };
      if (newOwnerSelect === CLIENT_SIDE_KEY) {
        payload.owner_client_side = true;
      } else if (newOwnerSelect) {
        payload.owner_user_id = newOwnerSelect;
      }
      const res = await fetch('/api/meeting-action-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || `HTTP ${res.status}`);

      if (json.autoCreatedTask) {
        toast({
          title: 'Action item added',
          description: `Task auto-created for ${teamMembers.find(t => t.id === json.actionItem.owner_user_id)?.name ?? 'owner'}.`,
        });
      } else {
        toast({ title: 'Action item added' });
      }
      setNewText('');
      setNewOwnerSelect('');
      await fetchItems();
    } catch (err) {
      toast({ title: 'Failed to add', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDone = async (item: ActionItem) => {
    // Optimistic
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: !i.is_done } : i));
    try {
      const res = await fetch(`/api/meeting-action-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_done: !item.is_done }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Revert
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: item.is_done } : i));
      toast({ title: 'Failed to update', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleDelete = async (item: ActionItem) => {
    if (!confirm('Delete this action item? Auto-created tasks are NOT removed.')) return;
    try {
      const res = await fetch(`/api/meeting-action-items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchItems();
    } catch (err) {
      toast({ title: 'Failed to delete', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const ownerLabel = (item: ActionItem): string => {
    if (item.owner_client_side) return 'Client side';
    if (item.owner_user_id) {
      const m = teamMembers.find(t => t.id === item.owner_user_id);
      return m ? m.name : 'Owner';
    }
    return 'Unassigned';
  };

  return (
    <div className="space-y-2 border border-stone-200 rounded-md p-3 bg-cream-50/40">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-brand" />
        <Label className="text-sm">Structured action items</Label>
        <span className="text-xs text-gray-500 ml-auto">{items.length}</span>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500 py-2">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-500 py-1">No structured items yet. HH-side items auto-create tasks.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(item => (
            <li key={item.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-stone-50 group">
              <Checkbox
                id={`ai-${item.id}`}
                checked={item.is_done}
                onCheckedChange={() => handleToggleDone(item)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <label htmlFor={`ai-${item.id}`} className={`text-sm cursor-pointer block ${item.is_done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {item.text}
                </label>
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                  <span>{ownerLabel(item)}</span>
                  {item.auto_created_task_id && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="inline-flex items-center gap-0.5 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Task created
                      </span>
                    </>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition"
                onClick={() => handleDelete(item)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2 pt-2 border-t border-stone-200">
        <Input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="New action item…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
          className="focus-brand h-8 text-sm"
        />
        <Select value={newOwnerSelect || '_none'} onValueChange={(v) => setNewOwnerSelect(v === '_none' ? '' : v)}>
          <SelectTrigger className="focus-brand h-8 w-40 text-xs">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Unassigned</SelectItem>
            <SelectItem value={CLIENT_SIDE_KEY}>Client side</SelectItem>
            {teamMembers.length > 0 && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">HH team</div>
            )}
            {teamMembers.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="brand"
          size="sm"
          onClick={handleAdd}
          disabled={!newText.trim() || submitting}
          className="h-8 px-3 text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </div>
    </div>
  );
}
