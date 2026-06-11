'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { toneClassName, type BadgeTone } from '@/components/ui/status-badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { UserService } from '@/lib/userService';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Search,
  Filter,
  ClipboardList,
  Check,
  X,
  Expand,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

type DeliveryLogEntry = {
  id: string;
  client_id: string;
  work_type: string;
  action: string;
  who: string | null;
  method: string | null;
  location: string | null;
  trigger: string | null;
  notes: string | null;
  logged_at: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Phase 3 (Post-Onboarding Campaign View v2): auto-drafts created
  // when a Weekly Update "This Week" item flips to done. Drafts render
  // in the amber Pending Review section at the top of the table;
  // confirming a draft flips pending_review to false and it joins the
  // main log.
  pending_review?: boolean;
  source?: string | null;
  source_ref?: string | null;
};

type Client = {
  id: string;
  name: string;
  logo_url: string | null;
};

const WORK_TYPES = ['Client-Facing', 'Internal'] as const;
const TRIGGERS = ['Client Request', 'Follow-Up Needed', 'SOP', 'Extra'] as const;

// Tone maps migrated to the centralized palette to match the parent
// /delivery-logs page. 'yellow' and 'orange' aren't in the shared
// palette; mapped to warning (amber).
const TRIGGER_TONES: Record<string, BadgeTone> = {
  'Client Request':    'purple',
  'Follow-Up Needed':  'warning', // amber, was yellow
  'SOP':               'success', // emerald, was green
  'Extra':             'warning', // amber, was orange — same family
};

const workTypeBadge = (type: string) =>
  toneClassName(type === 'Client-Facing' ? 'info' : 'neutral');

const triggerBadge = (trigger: string) =>
  toneClassName(TRIGGER_TONES[trigger] ?? 'neutral');

type EditingCell = { entryId: string; field: string } | null;

const toLocalDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function DeliveryLogPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const router = useRouter();
  const clientId = params.id;

  const [client, setClient] = useState<Client | null>(null);
  const [entries, setEntries] = useState<DeliveryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [whoMode, setWhoMode] = useState<'team' | 'custom'>('team');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWorkType, setFilterWorkType] = useState<string>('all');
  const [filterTrigger, setFilterTrigger] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState(true); // true = earliest first (Day 0 at top)

  // Inline editing state
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [inlineWhoMode, setInlineWhoMode] = useState<'team' | 'custom'>('team');

  // Inline add row state
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [inlineNew, setInlineNew] = useState({
    work_type: '',
    action: '',
    who: '',
    method: '',
    location: '',
    trigger: '',
    notes: '',
    logged_at: toLocalDateStr(new Date()),
  });
  const [inlineNewWhoMode, setInlineNewWhoMode] = useState<'team' | 'custom'>('team');

  // Popup form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    work_type: '' as string,
    action: '',
    who: '',
    method: '',
    location: '',
    trigger: '' as string,
    notes: '',
    logged_at: undefined as Date | undefined,
  });

  // Compute day numbers
  const dayZeroDate = useMemo(() => {
    if (entries.length === 0) return null;
    const dates = entries.map(e => new Date(e.logged_at + 'T00:00:00').getTime());
    return Math.min(...dates);
  }, [entries]);

  const getDayNumber = (loggedAt: string) => {
    if (!dayZeroDate) return 0;
    const d = new Date(loggedAt + 'T00:00:00').getTime();
    return Math.round((d - dayZeroDate) / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    fetchClient();
    fetchEntries(true);
    UserService.getActiveUsers().then((users) => {
      setTeamMembers(users.filter(u => u.role !== 'client').map(u => ({ id: u.id, name: u.name || u.email })));
    });
  }, [clientId]);

  const fetchClient = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, name, logo_url')
      .eq('id', clientId)
      .single();
    setClient(data);
  };

  const fetchEntries = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const { data } = await supabase
      .from('client_delivery_log')
      .select('*')
      .eq('client_id', clientId)
      .order('logged_at', { ascending: false })
      .order('sort_order', { ascending: true });
    // Cast: DB nullable fields vs interface (see archive/page.tsx note).
    setEntries((data || []) as DeliveryLogEntry[]);
    setLoading(false);
  };

  // --- Inline cell editing (KOL-style: double-click, blur-to-save) ---
  const startEditing = (entryId: string, field: string, currentValue: string) => {
    setEditingCell({ entryId, field });
    setEditingValue(currentValue);
    if (field === 'who') {
      const isTeam = teamMembers.some(m => m.name === currentValue);
      setInlineWhoMode(isTeam ? 'team' : (currentValue ? 'custom' : 'team'));
    }
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const saveInlineEdit = async () => {
    if (!editingCell) return;
    const { entryId, field } = editingCell;
    const value = editingValue.trim() || null;
    setEditingCell(null);
    setEditingValue('');
    // Optimistic update
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, [field]: value, updated_at: new Date().toISOString() } : e));
    try {
      await supabase.from('client_delivery_log').update({
        [field]: value,
        updated_at: new Date().toISOString(),
      }).eq('id', entryId);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchEntries(); // revert on error
    }
  };

  // Immediate save for select fields (work_type, trigger)
  const saveSelectField = async (entryId: string, field: string, value: string) => {
    // Optimistic update
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, [field]: value || null, updated_at: new Date().toISOString() } : e));
    try {
      await supabase.from('client_delivery_log').update({
        [field]: value || null,
        updated_at: new Date().toISOString(),
      }).eq('id', entryId);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchEntries(); // revert on error
    }
  };

  // Save date via Popover+Calendar
  const saveDateField = async (entryId: string, date: Date | undefined) => {
    if (!date) return;
    const dateStr = toLocalDateStr(date);
    setEditingCell(null);
    setEditingValue('');
    // Optimistic update
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, logged_at: dateStr, updated_at: new Date().toISOString() } : e));
    try {
      await supabase.from('client_delivery_log').update({
        logged_at: dateStr,
        updated_at: new Date().toISOString(),
      }).eq('id', entryId);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchEntries();
    }
  };

  // --- Inline add row ---
  const handleInlineAdd = async () => {
    if (!inlineNew.work_type || !inlineNew.action.trim() || !inlineNew.logged_at) return;
    await supabase.from('client_delivery_log').insert({
      client_id: clientId,
      work_type: inlineNew.work_type,
      action: inlineNew.action.trim(),
      who: inlineNew.who.trim() || null,
      method: inlineNew.method.trim() || null,
      location: inlineNew.location.trim() || null,
      trigger: inlineNew.trigger || null,
      notes: inlineNew.notes.trim() || null,
      logged_at: inlineNew.logged_at,
      created_by: user?.id,
    });
    setIsAddingInline(false);
    setInlineNew({ work_type: '', action: '', who: '', method: '', location: '', trigger: '', notes: '', logged_at: toLocalDateStr(new Date()) });
    setInlineNewWhoMode('team');
    await fetchEntries();
  };

  // --- Popup form ---
  const openForm = (entry?: DeliveryLogEntry) => {
    if (entry) {
      setEditingId(entry.id);
      const isTeamMember = teamMembers.some(m => m.name === entry.who);
      setWhoMode(isTeamMember ? 'team' : (entry.who ? 'custom' : 'team'));
      setForm({
        work_type: entry.work_type,
        action: entry.action,
        who: entry.who || '',
        method: entry.method || '',
        location: entry.location || '',
        trigger: entry.trigger || '',
        notes: entry.notes || '',
        logged_at: new Date(entry.logged_at + 'T00:00:00'),
      });
    } else {
      setEditingId(null);
      setWhoMode('team');
      setForm({
        work_type: '',
        action: '',
        who: '',
        method: '',
        location: '',
        trigger: '',
        notes: '',
        logged_at: new Date(),
      });
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.work_type || !form.action.trim() || !form.logged_at) return;
    const payload = {
      client_id: clientId,
      work_type: form.work_type,
      action: form.action.trim(),
      who: form.who.trim() || null,
      method: form.method.trim() || null,
      location: form.location.trim() || null,
      trigger: form.trigger || null,
      notes: form.notes.trim() || null,
      logged_at: toLocalDateStr(form.logged_at),
      updated_at: new Date().toISOString(),
    };
    setIsFormOpen(false);
    if (editingId) {
      // Optimistic update for edits
      setEntries(prev => prev.map(e => e.id === editingId ? { ...e, ...payload } : e));
      setEditingId(null);
      try {
        await supabase.from('client_delivery_log').update(payload).eq('id', editingId);
      } catch (error) {
        console.error('Error saving:', error);
        await fetchEntries();
      }
    } else {
      setEditingId(null);
      await supabase.from('client_delivery_log').insert({ ...payload, created_by: user?.id });
      await fetchEntries(); // need server-generated ID
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
    // Optimistic delete
    setEntries(prev => prev.filter(e => e.id !== id));
    try {
      await supabase.from('client_delivery_log').delete().eq('id', id);
    } catch (error) {
      console.error('Error deleting:', error);
      await fetchEntries();
    }
  };

  // Reorder entries within the same date
  const handleReorder = async (entryId: string, direction: 'up' | 'down') => {
    // Get entries for the same date, sorted by sort_order
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    const sameDateEntries = entries
      .filter(e => e.logged_at === entry.logged_at)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = sameDateEntries.findIndex(e => e.id === entryId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameDateEntries.length) return;

    const current = sameDateEntries[idx];
    const swap = sameDateEntries[swapIdx];

    // Swap sort_order values
    const currentOrder = current.sort_order;
    const swapOrder = swap.sort_order;
    // If they have the same sort_order (both 0), assign distinct values
    const newCurrentOrder = currentOrder === swapOrder
      ? (direction === 'up' ? swapOrder - 1 : swapOrder + 1)
      : swapOrder;
    const newSwapOrder = currentOrder === swapOrder
      ? currentOrder
      : currentOrder;

    // Optimistic update
    setEntries(prev => prev.map(e => {
      if (e.id === current.id) return { ...e, sort_order: newCurrentOrder };
      if (e.id === swap.id) return { ...e, sort_order: newSwapOrder };
      return e;
    }));

    try {
      await Promise.all([
        supabase.from('client_delivery_log').update({ sort_order: newCurrentOrder }).eq('id', current.id),
        supabase.from('client_delivery_log').update({ sort_order: newSwapOrder }).eq('id', swap.id),
      ]);
    } catch (error) {
      console.error('Error reordering:', error);
      await fetchEntries();
    }
  };

  // Phase 3: pending-review drafts live in a separate amber section at
  // the top of the page (see below). The main filtered list excludes
  // them so the confirmed log reads as a clean history.
  const pendingReviewEntries = entries.filter(e => e.pending_review === true).sort((a, b) => {
    // Newest drafts first — the CM usually wants to act on the most
    // recently flipped item.
    return b.updated_at.localeCompare(a.updated_at);
  });

  const filtered = entries.filter((e) => {
    if (e.pending_review === true) return false; // drafts handled separately
    const matchesSearch = !searchTerm ||
      e.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.who && e.who.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (e.notes && e.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (e.location && e.location.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesWorkType = filterWorkType === 'all' || e.work_type === filterWorkType;
    const matchesTrigger = filterTrigger === 'all' || e.trigger === filterTrigger;
    return matchesSearch && matchesWorkType && matchesTrigger;
  }).sort((a, b) => {
    const dateDiff = a.logged_at.localeCompare(b.logged_at);
    if (dateDiff !== 0) return sortAsc ? dateDiff : -dateDiff;
    return a.sort_order - b.sort_order;
  });

  /** Phase 3 — Confirm: flip pending_review to false (joins the log). */
  const confirmDraft = async (id: string) => {
    const draft = entries.find(e => e.id === id);
    if (!draft) return;
    // Optimistic update so the row disappears from Pending Review
    // immediately and slots into the main log.
    setEntries(prev => prev.map(e => e.id === id ? { ...e, pending_review: false } : e));
    const { error } = await supabase
      .from('client_delivery_log')
      .update({ pending_review: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('Confirm draft failed:', error);
      await fetchEntries(); // revert on error
    }
  };

  /** Phase 3 — Dismiss: hard-delete the draft. */
  const dismissDraft = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    const { error } = await supabase
      .from('client_delivery_log')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Dismiss draft failed:', error);
      await fetchEntries(); // revert on error
    }
  };

  /** Confirm All — flips every draft to confirmed in one round-trip. */
  const confirmAllDrafts = async () => {
    if (pendingReviewEntries.length === 0) return;
    const ids = pendingReviewEntries.map(e => e.id);
    setEntries(prev => prev.map(e => ids.includes(e.id) ? { ...e, pending_review: false } : e));
    const { error } = await supabase
      .from('client_delivery_log')
      .update({ pending_review: false, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) {
      console.error('Confirm all drafts failed:', error);
      await fetchEntries();
    }
  };

  // Render an editable cell (KOL-style: double-click to edit text, blur to save, selects save immediately)
  const renderEditableCell = (entry: DeliveryLogEntry, field: string, type: 'text' | 'textarea' | 'select-type' | 'select-trigger' | 'who' = 'text') => {
    const value = (entry as any)[field] || '';
    const isEditing = editingCell?.entryId === entry.id && editingCell?.field === field;

    // Select fields: always-visible inline dropdown, saves immediately on change (no hover effect)
    if (type === 'select-type') {
      return (
        <td className="py-3.5 px-4 border-r border-cream-200">
          <Select
            value={entry.work_type}
            onValueChange={(v) => saveSelectField(entry.id, 'work_type', v)}
          >
            <SelectTrigger
              className={`border-none shadow-none bg-transparent w-auto h-auto ${workTypeBadge(entry.work_type)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
              style={{ outline: 'none', boxShadow: 'none' }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </td>
      );
    }

    if (type === 'select-trigger') {
      return (
        <td className="py-3.5 px-4 border-r border-cream-200">
          <Select
            value={entry.trigger || ''}
            onValueChange={(v) => saveSelectField(entry.id, 'trigger', v)}
          >
            <SelectTrigger
              className={`border-none shadow-none bg-transparent w-auto h-auto ${entry.trigger ? triggerBadge(entry.trigger) : 'text-ink-warm-400'} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
              style={{ outline: 'none', boxShadow: 'none' }}
            >
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </td>
      );
    }

    // Who field: double-click to edit with team/manual toggle
    if (type === 'who') {
      if (isEditing) {
        return (
          <td className="py-1 px-2 whitespace-nowrap">
            {inlineWhoMode === 'team' ? (
              <Select value={editingValue} onValueChange={(v) => { setEditingValue(v); }}>
                <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {teamMembers.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={saveInlineEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveInlineEdit();
                  if (e.key === 'Escape') cancelEditing();
                }}
                className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs"
                style={{ outline: 'none', boxShadow: 'none' }}
                autoFocus
              />
            )}
            <div className="flex items-center gap-1 mt-0.5">
              {inlineWhoMode === 'team' && (
                <button type="button" className="text-[10px] text-emerald-600 hover:underline" onClick={saveInlineEdit}>Save</button>
              )}
              <button type="button" className="text-[10px] text-brand hover:underline" onClick={() => { setInlineWhoMode(inlineWhoMode === 'team' ? 'custom' : 'team'); setEditingValue(''); }}>
                {inlineWhoMode === 'team' ? 'Manual' : 'Team'}
              </button>
              <button type="button" className="text-[10px] text-ink-warm-400 hover:underline" onClick={cancelEditing}>Cancel</button>
            </div>
          </td>
        );
      }
      return (
        <td
          className="py-3.5 px-4 border-r border-cream-200 cursor-pointer whitespace-nowrap"
          onDoubleClick={() => startEditing(entry.id, field, value)}
          title="Double-click to edit"
        >
          <span className="text-ink-warm-700">{value || '—'}</span>
        </td>
      );
    }

    // Textarea fields: double-click to edit, blur to save
    if (type === 'textarea') {
      if (isEditing) {
        return (
          <td className="py-1 px-2">
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
          </td>
        );
      }
      return (
        <td
          className="py-3.5 px-4 border-r border-cream-200 cursor-pointer max-w-[200px]"
          onDoubleClick={() => startEditing(entry.id, field, value)}
          title="Double-click to edit"
        >
          <span className="text-ink-warm-700 line-clamp-2 whitespace-pre-wrap">{value || '—'}</span>
        </td>
      );
    }

    // Default text fields: double-click to edit, blur to save
    if (isEditing) {
      return (
        <td className="py-1 px-2">
          <Input
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={saveInlineEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveInlineEdit();
              if (e.key === 'Escape') cancelEditing();
            }}
            className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs"
            style={{ outline: 'none', boxShadow: 'none' }}
            autoFocus
          />
        </td>
      );
    }

    return (
      <td
        className={`py-3.5 px-4 border-r border-cream-200 cursor-pointer ${field === 'action' ? 'max-w-[200px]' : field === 'location' ? 'max-w-[150px]' : ''}`}
        onDoubleClick={() => startEditing(entry.id, field, value)}
        title="Double-click to edit"
      >
        <span className={`${field === 'action' ? 'line-clamp-2 text-ink-warm-900 font-medium' : 'text-ink-warm-700'} ${field === 'location' ? 'truncate block' : ''}`}>
          {value || '—'}
        </span>
      </td>
    );
  };

  // v11 structural loading skeleton — PageHeader + SectionHeader +
  // filter toolbar + table card mirror the loaded layout so the
  // title doesn't shift when data arrives.
  if (loading) {
    return (
      <div className="space-y-6">
        {/* v11 breadcrumb back affordance — matches /campaigns/[id]
            ("Campaigns / NAME"). Was previously a ghost Button with
            `Back to Clients` copy; the breadcrumb shows location
            context ("Clients > Delivery Log") instead of just an
            undo affordance. 2026-06-05. */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => router.push('/clients')}
            className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Clients
          </button>
          <span className="text-ink-warm-300">/</span>
          <span className="text-ink-warm-700 font-medium uppercase text-[10px] tracking-[0.2em] truncate">
            Delivery Log
          </span>
        </div>
        <PageHeader
          title={`${client?.name || 'Client'} — Delivery Log`}
          subtitle="Per-client delivery log entries"
          kicker="Clients · Delivery Log"
          kickerDot="brand"
        />
        <SectionHeader label="Entries" dot="brand" counter="Loading…" first />
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-9 w-[260px] rounded-md" />
          <div className="flex items-center gap-2 ml-auto">
            <Skeleton className="h-9 w-[150px] rounded-md" />
            <Skeleton className="h-9 w-[150px] rounded-md" />
          </div>
        </div>
        <Card className="border-cream-200">
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-xs">
        <button
          onClick={() => router.push('/clients')}
          className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Clients
        </button>
        <span className="text-ink-warm-300">/</span>
        <span className="text-ink-warm-700 font-medium uppercase text-[10px] tracking-[0.2em] truncate">
          {client?.name ?? '…'} · Delivery Log
        </span>
      </div>

      <PageHeader
        title={`${client?.name || 'Client'} — Delivery Log`}
        subtitle="Per-client delivery log entries"
        kicker="Clients · Delivery Log"
        kickerDot="brand"
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => { setIsAddingInline(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add Inline
            </Button>
            <Button variant="brand" onClick={() => openForm()}>
              <Expand className="h-4 w-4 mr-2" />
              Add via Form
            </Button>
          </>
        )}
      />

      {/* v11 chapter divider — counter narrows the same way the
          parent /delivery-logs SectionHeader does. */}
      <SectionHeader
        label="Entries"
        dot="brand"
        counter={`${filtered.length} of ${entries.length} entries${
          (filterWorkType !== 'all' || filterTrigger !== 'all' || searchTerm)
            ? ' · filtered'
            : ''
        }`}
        first
      />

      {/* v11 filter toolbar — Search (left, flex-1) + Work-type /
          Trigger filters (right, ml-auto). Matches parent
          /delivery-logs toolbar minus the view-mode tabs (this page
          is already scoped to a single client). */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-warm-400 pointer-events-none" />
          <Input
            placeholder="Search actions, who, notes..."
            className="pl-10 focus-brand"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Select value={filterWorkType} onValueChange={setFilterWorkType}>
            <SelectTrigger className="w-[150px] h-9 text-sm focus-brand">
              <Filter className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
              <SelectValue placeholder="Work Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTrigger} onValueChange={setFilterTrigger}>
            <SelectTrigger className="w-[150px] h-9 text-sm focus-brand">
              <Filter className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Triggers</SelectItem>
              {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterWorkType !== 'all' || filterTrigger !== 'all' || searchTerm) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterWorkType('all'); setFilterTrigger('all'); setSearchTerm(''); }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ─── Phase 3 — Pending Review section ───────────────────────
          Drafts auto-created when a Weekly Update "This Week" item
          flips to done. Sits above the main Entries table, amber-bg
          so it reads as "needs your attention." Each row is a
          compact form — pre-filled action/date/type from the Zone B
          item, blank Who/How/Where/Trigger that the CM fills in
          before clicking Confirm. Dismiss removes the draft without
          logging it. Confirm All shows when every draft has at
          least a Who filled (the spec's minimum signal of
          completeness). */}
      {pendingReviewEntries.length > 0 && (
        <div className="mt-5">
          <Card className="border-amber-200 bg-amber-50/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider">Pending Review</p>
                <p className="text-xs text-amber-800/80">
                  {pendingReviewEntries.length} draft{pendingReviewEntries.length === 1 ? '' : 's'} from the Weekly Update feed · fill in details, then Confirm
                </p>
              </div>
              {pendingReviewEntries.every(e => !!e.who) && pendingReviewEntries.length > 1 && (
                <Button
                  size="sm"
                  variant="brand"
                  className="h-8 text-xs"
                  onClick={confirmAllDrafts}
                >
                  Confirm All ({pendingReviewEntries.length})
                </Button>
              )}
            </div>
            <div className="divide-y divide-amber-200">
              {pendingReviewEntries.map(draft => (
                <div key={draft.id} className="px-4 py-3 space-y-2 hover:bg-amber-50/60">
                  {/* Top line: pre-filled fields read-only-ish, with
                      visual cues that they came from the Zone B item. */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-ink-warm-500 mb-0.5">
                        <CalendarIcon className="h-3 w-3" />
                        {new Date(draft.logged_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        <span className="text-amber-700/70">·</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${workTypeBadge(draft.work_type)}`}>
                          {draft.work_type}
                        </span>
                        <span className="text-amber-700/70">·</span>
                        <span className="text-[10px] text-amber-700 italic">from This Week feed</span>
                      </div>
                      <p className="text-sm font-medium text-ink-warm-900">{draft.action}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="brand"
                        className="h-7 px-2 text-xs"
                        onClick={() => confirmDraft(draft.id)}
                        disabled={!draft.who}
                        title={!draft.who ? 'Add a Who before confirming' : 'Move this draft to the main log'}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-rose-300 text-rose-600 hover:bg-rose-50"
                        onClick={() => dismissDraft(draft.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                  {/* Empty-fields row — Who / How / Where / Trigger /
                      Notes inputs that the CM fills before confirming.
                      Compact inline inputs so the section doesn't
                      explode to full-table width. Save on blur. */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    {(() => {
                      // Tiny helper to upsert one field on a draft
                      // optimistically + persist on blur.
                      const setDraftField = async (field: keyof DeliveryLogEntry, value: string) => {
                        const next = value.trim() || null;
                        setEntries(prev => prev.map(e => e.id === draft.id ? { ...e, [field]: next, updated_at: new Date().toISOString() } : e));
                        await supabase
                          .from('client_delivery_log')
                          .update({ [field]: next, updated_at: new Date().toISOString() } as any)
                          .eq('id', draft.id);
                      };
                      return (
                        <>
                          <Input
                            defaultValue={draft.who || ''}
                            placeholder="Who"
                            className="h-8 text-xs focus-brand bg-white"
                            onBlur={(e) => setDraftField('who', e.target.value)}
                          />
                          <Input
                            defaultValue={draft.method || ''}
                            placeholder="How (method)"
                            className="h-8 text-xs focus-brand bg-white"
                            onBlur={(e) => setDraftField('method', e.target.value)}
                          />
                          <Input
                            defaultValue={draft.location || ''}
                            placeholder="Where"
                            className="h-8 text-xs focus-brand bg-white"
                            onBlur={(e) => setDraftField('location', e.target.value)}
                          />
                          <Select
                            value={draft.trigger || ''}
                            onValueChange={(v) => setDraftField('trigger', v)}
                          >
                            <SelectTrigger className="h-8 text-xs focus-brand bg-white">
                              <SelectValue placeholder="Trigger" />
                            </SelectTrigger>
                            <SelectContent>
                              {TRIGGERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input
                            defaultValue={draft.notes || ''}
                            placeholder="Notes (optional)"
                            className="h-8 text-xs focus-brand bg-white"
                            onBlur={(e) => setDraftField('notes', e.target.value)}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Table — v11 spreadsheet chrome matching parent
          /delivery-logs: Card wrapper + bg-cream-50 header +
          border-r border-cream-200 separators + alternating row
          backgrounds. */}
      <div className="mt-5">
        {filtered.length === 0 && !isAddingInline ? (
          <Card className="border-cream-200 overflow-hidden">
            <EmptyState
              icon={ClipboardList}
              title={entries.length === 0 ? 'No delivery log entries yet.' : 'No entries match your filters.'}
              description={entries.length === 0 ? 'Add the first entry to start tracking work delivered for this client.' : undefined}
              className="py-12"
            >
              {entries.length === 0 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button variant="outline" onClick={() => setIsAddingInline(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Inline
                  </Button>
                  <Button variant="brand" onClick={() => openForm()}>
                    <Expand className="h-4 w-4 mr-2" /> Add via Form
                  </Button>
                </div>
              )}
            </EmptyState>
          </Card>
        ) : (
          <Card className="border-cream-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 hover:bg-cream-50 border-b border-cream-200">
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 whitespace-nowrap w-14">
                      <button className="inline-flex items-center gap-1 hover:text-ink-warm-900 transition-colors" onClick={() => setSortAsc(!sortAsc)}>
                        Day
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 whitespace-nowrap">Date</th>
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 whitespace-nowrap">Type</th>
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200">Action</th>
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 whitespace-nowrap">Who</th>
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 whitespace-nowrap">How</th>
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 whitespace-nowrap">Where</th>
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 whitespace-nowrap">Trigger</th>
                    <th className="bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200">Notes</th>
                    <th className="bg-cream-50 text-right py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] whitespace-nowrap w-20">Actions</th>
                  </tr>
                </thead>
                    <tbody>
                      {/* Inline add row */}
                      {isAddingInline && (
                        <tr className="border-b border-brand/20 bg-brand-light/20">
                          <td className="py-3.5 px-4 border-r border-cream-200 text-ink-warm-400 text-xs">—</td>
                          <td className="py-3.5 px-4 border-r border-cream-200 whitespace-nowrap">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-sm text-ink-warm-500 hover:text-ink-warm-700 cursor-pointer">
                                  {inlineNew.logged_at ? new Date(inlineNew.logged_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Select date'}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={inlineNew.logged_at ? new Date(inlineNew.logged_at + 'T00:00:00') : undefined}
                                  onSelect={(date) => setInlineNew({ ...inlineNew, logged_at: date ? toLocalDateStr(date) : '' })}
                                  initialFocus
                                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                                />
                              </PopoverContent>
                            </Popover>
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            <div className="inline-flex items-center">
                              <Select value={inlineNew.work_type} onValueChange={(v) => setInlineNew({ ...inlineNew, work_type: v })}>
                                <SelectTrigger
                                  className={`border-none shadow-none bg-transparent w-auto h-auto ${inlineNew.work_type ? workTypeBadge(inlineNew.work_type) : 'text-ink-warm-400'} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
                                  style={{ outline: 'none', boxShadow: 'none' }}
                                >
                                  <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {!inlineNew.work_type && <RequiredAsterisk />}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            <div className="flex items-center">
                              <Input
                                value={inlineNew.action}
                                onChange={(e) => setInlineNew({ ...inlineNew, action: e.target.value })}
                                placeholder="Action"
                                className="flex-1 border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs font-medium text-ink-warm-900"
                                style={{ outline: 'none', boxShadow: 'none' }}
                              />
                              {!inlineNew.action && <RequiredAsterisk />}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            {inlineNewWhoMode === 'team' ? (
                              <div>
                                <Select value={inlineNew.who} onValueChange={(v) => setInlineNew({ ...inlineNew, who: v })}>
                                  <SelectTrigger
                                    className="border-none shadow-none bg-transparent w-auto h-auto px-0 py-0 text-xs text-ink-warm-700 inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
                                    style={{ outline: 'none', boxShadow: 'none' }}
                                  >
                                    <SelectValue placeholder="Who" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {teamMembers.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <button type="button" className="text-[10px] text-brand hover:underline mt-0.5 block" onClick={() => { setInlineNewWhoMode('custom'); setInlineNew({ ...inlineNew, who: '' }); }}>Manual</button>
                              </div>
                            ) : (
                              <div>
                                <Input
                                  value={inlineNew.who}
                                  onChange={(e) => setInlineNew({ ...inlineNew, who: e.target.value })}
                                  placeholder="Who"
                                  className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs text-ink-warm-700"
                                  style={{ outline: 'none', boxShadow: 'none' }}
                                />
                                <button type="button" className="text-[10px] text-brand hover:underline mt-0.5 block" onClick={() => { setInlineNewWhoMode('team'); setInlineNew({ ...inlineNew, who: '' }); }}>Team</button>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            <Input
                              value={inlineNew.method}
                              onChange={(e) => setInlineNew({ ...inlineNew, method: e.target.value })}
                              placeholder="How"
                              className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs text-ink-warm-700"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            />
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            <Input
                              value={inlineNew.location}
                              onChange={(e) => setInlineNew({ ...inlineNew, location: e.target.value })}
                              placeholder="Where"
                              className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs text-ink-warm-700"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            />
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            <Select value={inlineNew.trigger} onValueChange={(v) => setInlineNew({ ...inlineNew, trigger: v })}>
                              <SelectTrigger
                                className={`border-none shadow-none bg-transparent w-auto h-auto ${inlineNew.trigger ? triggerBadge(inlineNew.trigger) : 'text-ink-warm-400'} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
                                style={{ outline: 'none', boxShadow: 'none' }}
                              >
                                <SelectValue placeholder="Trigger" />
                              </SelectTrigger>
                              <SelectContent>
                                {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            <Input
                              value={inlineNew.notes}
                              onChange={(e) => setInlineNew({ ...inlineNew, notes: e.target.value })}
                              placeholder="Notes"
                              className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs text-ink-warm-700"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            />
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleInlineAdd} disabled={!inlineNew.work_type || !inlineNew.action.trim()}>
                                <Check className="h-4 w-4 text-emerald-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setIsAddingInline(false); setInlineNew({ work_type: '', action: '', who: '', method: '', location: '', trigger: '', notes: '', logged_at: toLocalDateStr(new Date()) }); }}>
                                <X className="h-4 w-4 text-ink-warm-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {filtered.map((entry, idx) => (
                        // v11 spreadsheet body row — alternating bg
                        // (white / cream-50) + visible column separators
                        // via border-r on each cell. Matches parent
                        // /delivery-logs chrome.
                        <tr key={entry.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-cream-50'} hover:bg-cream-100 transition-colors border-b border-cream-200 group`}>
                          {/* Day number — not editable */}
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            <span className="inline-flex items-center justify-center bg-cream-100 text-ink-warm-700 text-xs font-bold rounded-full h-6 w-6">{getDayNumber(entry.logged_at)}</span>
                          </td>
                          {/* Date — Popover+Calendar picker */}
                          <td className="py-3.5 px-4 border-r border-cream-200 whitespace-nowrap">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-ink-warm-500 text-sm hover:text-ink-warm-700 cursor-pointer">
                                  {new Date(entry.logged_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={new Date(entry.logged_at + 'T00:00:00')}
                                  onSelect={(date) => saveDateField(entry.id, date)}
                                  initialFocus
                                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                                />
                              </PopoverContent>
                            </Popover>
                          </td>
                          {/* Type — inline select, saves immediately */}
                          {renderEditableCell(entry, 'work_type', 'select-type')}
                          {/* Action */}
                          {renderEditableCell(entry, 'action', 'text')}
                          {/* Who */}
                          {renderEditableCell(entry, 'who', 'who')}
                          {/* How */}
                          {renderEditableCell(entry, 'method', 'textarea')}
                          {/* Where */}
                          {renderEditableCell(entry, 'location', 'text')}
                          {/* Trigger — inline select, saves immediately */}
                          {renderEditableCell(entry, 'trigger', 'select-trigger')}
                          {/* Notes */}
                          {renderEditableCell(entry, 'notes', 'textarea')}
                          {/* Actions */}
                          <td className="py-3.5 px-4 border-r border-cream-200 text-right">
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Reorder arrows — only show if there are other entries with the same date */}
                              {(() => {
                                const sameDateEntries = filtered.filter(e => e.logged_at === entry.logged_at);
                                if (sameDateEntries.length <= 1) return null;
                                const sameDateSorted = [...sameDateEntries].sort((a, b) => a.sort_order - b.sort_order);
                                const posInGroup = sameDateSorted.findIndex(e => e.id === entry.id);
                                return (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-auto px-1 hover:bg-cream-100 disabled:opacity-30"
                                      onClick={() => handleReorder(entry.id, 'up')}
                                      disabled={posInGroup === 0}
                                      title="Move up within same date"
                                    >
                                      <ChevronUp className="h-3.5 w-3.5 text-ink-warm-500" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-auto px-1 hover:bg-cream-100 disabled:opacity-30"
                                      onClick={() => handleReorder(entry.id, 'down')}
                                      disabled={posInGroup === sameDateSorted.length - 1}
                                      title="Move down within same date"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5 text-ink-warm-500" />
                                    </Button>
                                  </>
                                );
                              })()}
                              <Button variant="ghost" size="sm" className="w-auto px-2 hover:bg-cream-100" onClick={() => openForm(entry)} title="Edit in popup">
                                <Expand className="h-3.5 w-3.5 text-ink-warm-700" />
                              </Button>
                              <Button variant="ghost" size="sm" className="w-auto px-2 hover:bg-rose-50" onClick={() => setDeletingId(entry.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingId(null); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-brand" />
              {editingId ? 'Edit Entry' : 'Add Delivery Log Entry'}
            </DialogTitle>
            <DialogDescription>Log work delivered for {client?.name}.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-1 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Work Type <RequiredAsterisk /></Label>
                <Select value={form.work_type} onValueChange={(v) => setForm({ ...form, work_type: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Date <RequiredAsterisk /></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="focus-brand justify-start text-left font-normal" style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: form.logged_at ? '#111827' : '#9ca3af' }}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.logged_at ? form.logged_at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.logged_at} onSelect={(date) => setForm({ ...form, logged_at: date || undefined })} initialFocus classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }} modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Action <RequiredAsterisk /></Label>
              <Input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder="What was done?" className="focus-brand" />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Who</Label>
                <button
                  type="button"
                  className="text-xs text-brand hover:underline"
                  onClick={() => { setWhoMode(whoMode === 'team' ? 'custom' : 'team'); setForm({ ...form, who: '' }); }}
                >
                  {whoMode === 'team' ? 'Enter manually instead' : 'Pick from team'}
                </button>
              </div>
              {whoMode === 'team' ? (
                <Select value={form.who} onValueChange={(v) => setForm({ ...form, who: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select team member" /></SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} placeholder="Enter name manually" className="focus-brand" />
              )}
            </div>
            <div className="grid gap-2">
              <Label>How (Method)</Label>
              <Textarea value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="Method, script, tool, process used..." className="focus-brand" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Where</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location or platform" className="focus-brand" />
              </div>
              <div className="grid gap-2">
                <Label>Trigger</Label>
                <Select value={form.trigger} onValueChange={(v) => setForm({ ...form, trigger: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select trigger" /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." className="focus-brand" rows={3} />
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button variant="brand" onClick={handleSubmit} disabled={!form.work_type || !form.action.trim() || !form.logged_at}>
              {editingId ? 'Save Changes' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" />
              Delete Entry
            </DialogTitle>
            <DialogDescription>Are you sure you want to delete this delivery log entry? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && handleDelete(deletingId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
