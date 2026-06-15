'use client';

/**
 * CallNotesTab — Weekly Sync Notes tab inside the Client Context modal.
 *
 * Per HHP Team Dashboard Spec § 4.3 — call notes "are logged in the
 * portal context field." This implementation stores them on
 * `client_context.call_notes` as a JSONB array. The dashboard reads
 * from the same column so there's one source of truth.
 *
 * Each note holds:
 *   - meeting_date (the canonical "call date" the dashboard surfaces)
 *   - content (free-form summary; dashboard splits by newline for bullets)
 *   - action_items[] with owner + done state
 *   - TG-send stamps so the dashboard can render the "Sent to TG" badge
 *
 * HH-side action items auto-create HQ tasks on save (per spec): tasks
 * land with source='call_note', source_ref=action_item.id, client_id
 * linked, so they flow into Team Workload + count toward overdue.
 *
 * Owner picker accepts a team member from users.id (HH-side) OR the
 * "Client" sentinel (owner_client_side=true) — the spec explicitly
 * says client-side items display but do not auto-create tasks.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  MessageCircle, Plus, Pencil, Trash2, Calendar as CalIcon,
  X, Send, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { formatDate, toIsoDate } from '@/lib/dateFormat';

// ─── Types ──────────────────────────────────────────────────────────

export type CallNoteActionItem = {
  id: string;
  text: string;
  owner_user_id: string | null;
  owner_client_side: boolean;
  is_done: boolean;
  auto_created_task_id: string | null;
};

export type CallNote = {
  id: string;
  meeting_date: string; // ISO YYYY-MM-DD
  content: string;
  action_items: CallNoteActionItem[];
  sent_to_client_tg_at: string | null;
  sent_to_client_tg_by: string | null;
  created_at: string;
  created_by: string | null;
};

type UserRow = { id: string; name: string | null };

type ActionItemDraft = {
  id: string;
  text: string;
  owner: string; // user_id OR 'client' OR ''
  is_done: boolean;
};

type FormState = {
  meeting_date: Date | undefined;
  content: string;
  action_items: ActionItemDraft[];
};

const EMPTY_FORM: FormState = {
  meeting_date: undefined,
  content: '',
  action_items: [],
};

// ─── Component ──────────────────────────────────────────────────────

export function CallNotesTab({
  clientId,
  currentUserId,
}: {
  clientId: string;
  currentUserId: string | null;
}) {
  const { toast } = useToast();

  // Notes are stored on client_context. We refetch the row on mount and
  // after each mutation so the local view stays in sync with whatever
  // other tabs in the same modal might be writing.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [contextRowId, setContextRowId] = useState<string | null>(null);

  const [teamUsers, setTeamUsers] = useState<UserRow[]>([]);

  // Form / mode
  const [mode, setMode] = useState<'list' | 'add' | { edit: string }>('list');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Fetch ────────────────────────────────────────────────────────

  async function refresh() {
    setLoading(true);
    try {
      const [ctxRes, usersRes] = await Promise.all([
        (supabase as any)
          .from('client_context')
          .select('id, call_notes')
          .eq('client_id', clientId)
          .maybeSingle(),
        (supabase as any)
          .from('users')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('name'),
      ]);
      if (ctxRes.error && ctxRes.error.code !== 'PGRST116') {
        // PGRST116 = no row, which is fine; we'll create one on first save
        console.error('[CallNotesTab] context fetch failed', ctxRes.error);
      }
      const arr = (ctxRes.data?.call_notes ?? []) as CallNote[];
      // Latest first
      arr.sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || ''));
      setNotes(arr);
      setContextRowId((ctxRes.data as any)?.id ?? null);
      setTeamUsers(((usersRes.data ?? []) as UserRow[]).filter(u => u.name));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  // ─── Save ─────────────────────────────────────────────────────────

  async function persist(nextNotes: CallNote[]) {
    setSaving(true);
    try {
      let rowId = contextRowId;
      if (!rowId) {
        // No client_context row yet for this client — create one with
        // just the call_notes payload. Other fields stay null.
        const { data, error } = await (supabase as any)
          .from('client_context')
          .insert({ client_id: clientId, call_notes: nextNotes })
          .select('id')
          .single();
        if (error) throw error;
        rowId = data.id;
        setContextRowId(rowId);
      } else {
        const { error } = await (supabase as any)
          .from('client_context')
          .update({ call_notes: nextNotes, updated_at: new Date().toISOString() })
          .eq('id', rowId);
        if (error) throw error;
      }
      const sorted = [...nextNotes].sort((a, b) =>
        (b.meeting_date || '').localeCompare(a.meeting_date || ''),
      );
      setNotes(sorted);
      return true;
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Reconcile HH-side action items → HQ tasks. New HH-owned items get
   *  a task. Items that were HH-owned and are now done don't auto-close
   *  their task (humans decide). Items removed from a note keep their
   *  task (auto_created_task_id stays, but the link disappears from the
   *  note — by spec, this is a "fork once" relationship). */
  async function reconcileAutoTasks(
    noteId: string,
    items: CallNoteActionItem[],
    meetingDateIso: string,
  ): Promise<CallNoteActionItem[]> {
    const updated: CallNoteActionItem[] = [];
    for (const it of items) {
      if (it.auto_created_task_id || it.owner_client_side || !it.owner_user_id) {
        // Already linked, client-side, or unassigned — no task creation.
        updated.push(it);
        continue;
      }
      // HH-owned + no task yet → create one.
      const owner = teamUsers.find(u => u.id === it.owner_user_id);
      const { data: task, error } = await (supabase as any)
        .from('tasks')
        .insert({
          task_name: it.text,
          assigned_to: it.owner_user_id,
          assigned_to_name: owner?.name || null,
          client_id: clientId,
          status: 'to_do',
          priority: 'medium',
          task_type: 'General',
          frequency: 'one-time',
          source: 'call_note',
          source_date: meetingDateIso,
          source_ref: it.id,
          description: `Auto-created from call note ${formatDate(meetingDateIso)}`,
        })
        .select('id')
        .single();
      if (error || !task) {
        console.error('[CallNotesTab] auto-task insert failed:', error);
        updated.push(it);
        continue;
      }
      updated.push({ ...it, auto_created_task_id: task.id });
    }
    void noteId; // reserved for future per-note logging
    return updated;
  }

  async function saveNote() {
    if (!form.meeting_date) {
      toast({ title: 'Date required', description: 'Pick a meeting date.', variant: 'destructive' });
      return;
    }
    if (!form.content.trim()) {
      toast({ title: 'Content required', description: 'Summary cannot be empty.', variant: 'destructive' });
      return;
    }

    const meetingDateIso = toIsoDate(form.meeting_date);
    const editing = typeof mode === 'object' && 'edit' in mode ? mode.edit : null;
    const existing = editing ? notes.find(n => n.id === editing) : null;

    // Build the action items, preserving auto_created_task_id from
    // existing items so we don't re-create tasks on edit.
    const draftItems: CallNoteActionItem[] = form.action_items
      .filter(a => a.text.trim())
      .map(a => {
        const prev = existing?.action_items.find(p => p.id === a.id);
        return {
          id: a.id,
          text: a.text.trim(),
          owner_user_id: a.owner === 'client' || !a.owner ? null : a.owner,
          owner_client_side: a.owner === 'client',
          is_done: a.is_done,
          auto_created_task_id: prev?.auto_created_task_id ?? null,
        };
      });

    // Auto-task reconciliation (HH-side items without a task yet)
    const finalItems = await reconcileAutoTasks(editing ?? '', draftItems, meetingDateIso);

    const note: CallNote = editing && existing ? {
      ...existing,
      meeting_date: meetingDateIso,
      content: form.content.trim(),
      action_items: finalItems,
    } : {
      id: cryptoUUID(),
      meeting_date: meetingDateIso,
      content: form.content.trim(),
      action_items: finalItems,
      sent_to_client_tg_at: null,
      sent_to_client_tg_by: null,
      created_at: new Date().toISOString(),
      created_by: currentUserId,
    };

    const nextNotes = editing
      ? notes.map(n => n.id === editing ? note : n)
      : [note, ...notes];

    const ok = await persist(nextNotes);
    if (ok) {
      setMode('list');
      setForm(EMPTY_FORM);
      toast({
        title: editing ? 'Note updated' : 'Note saved',
        description: finalItems.some(i => !i.owner_client_side && i.owner_user_id && i.auto_created_task_id)
          ? 'HH action items auto-created as HQ tasks.'
          : undefined,
      });
    }
  }

  async function deleteNote(id: string) {
    const nextNotes = notes.filter(n => n.id !== id);
    const ok = await persist(nextNotes);
    if (ok) {
      setDeletingId(null);
      toast({ title: 'Note deleted' });
    }
  }

  /** Toggle a single action item's is_done flag inline (from the list
   *  view), without opening the edit form. Optimistic UI + write-through
   *  to client_context.call_notes JSONB. */
  async function toggleActionItem(noteId: string, itemId: string) {
    const target = notes.find(n => n.id === noteId);
    if (!target) return;
    const nextItems = target.action_items.map(it =>
      it.id === itemId ? { ...it, is_done: !it.is_done } : it,
    );
    const nextNote = { ...target, action_items: nextItems };
    const nextNotes = notes.map(n => n.id === noteId ? nextNote : n);
    // Optimistic local update so the checkbox feels instant
    setNotes(nextNotes);
    const ok = await persist(nextNotes);
    if (!ok) {
      // Persist failed — revert by refetching authoritative state
      await refresh();
    }
  }

  function startEdit(note: CallNote) {
    setForm({
      meeting_date: note.meeting_date ? new Date(note.meeting_date + 'T00:00:00') : undefined,
      content: note.content,
      action_items: note.action_items.map(a => ({
        id: a.id,
        text: a.text,
        owner: a.owner_client_side ? 'client' : (a.owner_user_id || ''),
        is_done: a.is_done,
      })),
    });
    setMode({ edit: note.id });
  }

  function ownerNameFor(item: CallNoteActionItem): string {
    if (item.owner_client_side) return 'Client';
    if (!item.owner_user_id) return 'Unassigned';
    return teamUsers.find(u => u.id === item.owner_user_id)?.name || 'Unknown';
  }

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return <Skeleton className="h-64 rounded-lg" />;
  }

  if (mode === 'add' || (typeof mode === 'object' && 'edit' in mode)) {
    return (
      <CallNoteForm
        form={form}
        setForm={setForm}
        teamUsers={teamUsers}
        saving={saving}
        onCancel={() => { setMode('list'); setForm(EMPTY_FORM); }}
        onSave={saveNote}
        isEdit={typeof mode === 'object'}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-warm-500">
          Weekly sync summaries. Action items assigned to Holo Hive auto-create HQ tasks.
        </p>
        <Button
          size="sm"
          variant="brand"
          onClick={() => {
            setForm({ ...EMPTY_FORM, meeting_date: new Date(), action_items: [newDraftItem()] });
            setMode('add');
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add note
        </Button>
      </div>

      {notes.length === 0 ? (
        <Card className="border-cream-200">
          <CardContent className="p-0">
            <EmptyState
              icon={MessageCircle}
              title="No call notes yet"
              description="Log a weekly sync summary. It appears on the Team Dashboard's Client Success tab."
              className="py-10"
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notes.map(note => (
            <li key={note.id}>
              <Card className="border-cream-200">
                <CardContent className="p-3.5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CalIcon className="h-3.5 w-3.5 text-ink-warm-400" />
                      <span className="text-sm font-semibold text-ink-warm-900">
                        {formatDate(note.meeting_date)}
                      </span>
                      {note.sent_to_client_tg_at && (
                        <StatusBadge tone="success" size="sm" bordered>
                          <CheckCircle2 className="h-3 w-3 mr-1" />Sent to TG
                        </StatusBadge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => startEdit(note)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                        onClick={() => setDeletingId(note.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-ink-warm-700 whitespace-pre-wrap mb-2">
                    {note.content}
                  </p>

                  {note.action_items.length > 0 && (
                    <div className="border-t border-cream-100 pt-2 mt-2 space-y-1">
                      <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-500 mb-1">
                        Action items
                      </p>
                      <ul className="space-y-1">
                        {note.action_items.map(it => (
                          <li key={it.id} className="flex items-center gap-2 text-xs group/aitem">
                            <Checkbox
                              checked={it.is_done}
                              onCheckedChange={() => toggleActionItem(note.id, it.id)}
                              disabled={saving}
                              aria-label={it.is_done ? `Mark "${it.text}" not done` : `Mark "${it.text}" done`}
                              className="h-3.5 w-3.5 shrink-0"
                            />
                            <span className={it.is_done ? 'line-through text-ink-warm-400' : 'text-ink-warm-700'}>
                              {it.text}
                            </span>
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-ink-warm-700 border border-cream-200 shrink-0">
                              {ownerNameFor(it)}
                            </span>
                            {it.auto_created_task_id && !it.owner_client_side && (
                              <span className="text-[9px] text-ink-warm-400 shrink-0" title="HQ task auto-created">
                                ↗ task
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {deletingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setDeletingId(null)}>
          <div className="bg-white rounded-lg p-5 max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold mb-2">Delete this call note?</p>
            <p className="text-xs text-ink-warm-500 mb-4">
              The note disappears from the dashboard. Auto-created tasks stay (delete them in /tasks if needed).
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setDeletingId(null)} disabled={saving}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={() => deleteNote(deletingId)} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Form ───────────────────────────────────────────────────────────

function CallNoteForm({
  form, setForm, teamUsers, saving, onCancel, onSave, isEdit,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  teamUsers: UserRow[];
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  isEdit: boolean;
}) {
  const updateItem = (id: string, patch: Partial<ActionItemDraft>) => {
    setForm({
      ...form,
      action_items: form.action_items.map(a => a.id === id ? { ...a, ...patch } : a),
    });
  };
  const removeItem = (id: string) => {
    setForm({ ...form, action_items: form.action_items.filter(a => a.id !== id) });
  };
  const addItem = () => {
    setForm({ ...form, action_items: [...form.action_items, newDraftItem()] });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label>Meeting date <RequiredAsterisk /></Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 w-full justify-start font-normal focus-brand">
              <CalIcon className="mr-2 h-3.5 w-3.5" />
              {form.meeting_date ? formatDate(form.meeting_date) : 'Select date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
            <Calendar
              mode="single"
              selected={form.meeting_date}
              onSelect={(d) => setForm({ ...form, meeting_date: d })}
              classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
              modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid gap-1.5">
        <Label>Summary <RequiredAsterisk /></Label>
        <Textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder={'One key takeaway per line — the dashboard splits these into bullets.\n\nExample:\n- Launch date confirmed for end of Q3\n- Client wants creative review SLA tightened'}
          className="focus-brand min-h-[120px]"
        />
        <p className="text-[10px] text-ink-warm-500">Newline-separated bullets appear on the Team Dashboard's Client Success tab.</p>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label>Action items</Label>
          <Button size="sm" variant="ghost" onClick={addItem} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Add item
          </Button>
        </div>
        {form.action_items.length === 0 ? (
          <p className="text-[11px] text-ink-warm-500 italic">No action items yet.</p>
        ) : (
          <ul className="space-y-2">
            {form.action_items.map((a, idx) => (
              <li key={a.id} className="flex items-center gap-2 bg-cream-50/40 p-2 rounded">
                {isEdit && (
                  <Checkbox
                    checked={a.is_done}
                    onCheckedChange={(v) => updateItem(a.id, { is_done: v === true })}
                    aria-label={a.is_done ? 'Mark not done' : 'Mark done'}
                  />
                )}
                <Input
                  value={a.text}
                  onChange={(e) => updateItem(a.id, { text: e.target.value })}
                  placeholder={`Item ${idx + 1}`}
                  className="focus-brand h-8 flex-1"
                />
                <Select value={a.owner} onValueChange={(v) => updateItem(a.id, { owner: v })}>
                  <SelectTrigger className="h-8 w-[150px] focus-brand text-xs">
                    <SelectValue placeholder="Owner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    {teamUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                  onClick={() => removeItem(a.id)}
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-ink-warm-500">
          Items assigned to a Holo Hive team member auto-create an HQ task on save. Client-side items display only.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-cream-100 pt-3">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save note'}
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function newDraftItem(): ActionItemDraft {
  return { id: cryptoUUID(), text: '', owner: '', is_done: false };
}

function cryptoUUID(): string {
  // crypto.randomUUID is broadly supported in modern browsers; fall back
  // to a low-effort generator for ancient runtimes.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'x-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
