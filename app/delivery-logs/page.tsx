'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { UserService } from '@/lib/userService';
import { toneClassName, type BadgeTone } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/dateFormat';
import {
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Search,
  Filter,
  ClipboardList,
  Building2,
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
  // Phase 3: auto-drafts from Weekly Update Zone B done-flips.
  pending_review?: boolean;
  source?: string | null;
  source_ref?: string | null;
};

type Client = {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  is_ad_hoc: boolean | null;
};

const WORK_TYPES = ['Client-Facing', 'Internal'] as const;
const TRIGGERS = ['Client Request', 'Follow-Up Needed', 'SOP', 'Extra'] as const;

// Tone maps migrated to centralized palette 2026-05-06. 'yellow' and
// 'orange' aren't in the shared palette; mapped to warning (amber).
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

export default function DeliveryLogsPage() {
  const { user } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [entries, setEntries] = useState<DeliveryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
  // Phase 3: per-client pending-review draft count (used by the
  // amber pill on each client tab). Populated alongside the clients
  // list so we don't fan out an extra round-trip per tab.
  const [pendingDraftCounts, setPendingDraftCounts] = useState<Record<string, number>>({});
  // [2026-06-04 v2] View mode tabs — match /clients semantics exactly:
  //   all      → every non-archived client
  //   active   → is_active = true AND NOT is_ad_hoc
  //   adhoc    → is_ad_hoc = true
  //   inactive → is_active = false
  // All views EXCLUDE archived clients (archived_at IS NOT NULL).
  const [viewMode, setViewMode] = useState<'all' | 'active' | 'adhoc' | 'inactive'>('active');
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [whoMode, setWhoMode] = useState<'team' | 'custom'>('team');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWorkType, setFilterWorkType] = useState<string>('all');
  const [filterTrigger, setFilterTrigger] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState(true);

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

  // Fetch ALL non-archived clients once on mount. Filtering by tab
  // (All / Active / Ad-hoc / Inactive) happens client-side from this
  // single list — same pattern /clients uses, and lets us compute tab
  // counts without a separate head-count round-trip.
  useEffect(() => {
    const fetchClients = async () => {
      setClientsLoading(true);
      const clientsQuery = supabase
        .from('clients')
        .select('id, name, logo_url, is_active, is_ad_hoc')
        .is('archived_at', null);

      // Phase 3: pull pending-review draft counts in the same
      // round-trip so the per-client tabs can show a "draft" badge
      // without an N+1 fetch. Filtered by the partial index added
      // in the pending_review migration so this stays cheap.
      const [{ data: clientData }, { data: logData }, { data: draftRows }] = await Promise.all([
        clientsQuery,
        supabase
          .from('client_delivery_log')
          .select('client_id, updated_at')
          .order('updated_at', { ascending: false }),
        supabase
          .from('client_delivery_log')
          .select('client_id')
          .eq('pending_review', true),
      ]);

      // Build a map of client_id -> latest activity timestamp
      const latestActivity = new Map<string, string>();
      for (const log of (logData || [])) {
        if (!latestActivity.has(log.client_id) && log.updated_at) {
          latestActivity.set(log.client_id, log.updated_at);
        }
      }

      // Build a map of client_id -> pending-review draft count.
      const draftCounts = new Map<string, number>();
      for (const r of (draftRows || []) as Array<{ client_id: string }>) {
        draftCounts.set(r.client_id, (draftCounts.get(r.client_id) || 0) + 1);
      }
      setPendingDraftCounts(Object.fromEntries(draftCounts));

      // Sort: clients with pending drafts first, then by activity,
      // then alphabetical. Drafts-first puts CMs' attention where
      // it's needed when they open the page.
      const sorted = (clientData || []).sort((a, b) => {
        const aDrafts = draftCounts.get(a.id) || 0;
        const bDrafts = draftCounts.get(b.id) || 0;
        if (aDrafts !== bDrafts) return bDrafts - aDrafts;
        const aTime = latestActivity.get(a.id) || '';
        const bTime = latestActivity.get(b.id) || '';
        if (aTime && bTime) return bTime.localeCompare(aTime);
        if (aTime) return -1;
        if (bTime) return 1;
        return a.name.localeCompare(b.name);
      });

      setClients(sorted);
      setClientsLoading(false);
    };
    fetchClients();
  }, []);

  // Team members only need to load once — independent of viewMode
  useEffect(() => {
    UserService.getActiveUsers().then((users) => {
      setTeamMembers(users.filter(u => u.role !== 'client').map(u => ({ id: u.id, name: u.name || u.email })));
    });
  }, []);

  // Derived tab counts + filtered list — same /clients semantics:
  //   active = is_active && !is_ad_hoc (Ad-hoc is its own bucket)
  //   adhoc  = is_ad_hoc
  //   inactive = !is_active
  const tabCounts = useMemo(() => ({
    all: clients.length,
    active: clients.filter(c => c.is_active && !c.is_ad_hoc).length,
    adhoc: clients.filter(c => !!c.is_ad_hoc).length,
    inactive: clients.filter(c => !c.is_active).length,
  }), [clients]);

  const visibleClients = useMemo(() => {
    if (viewMode === 'all') return clients;
    if (viewMode === 'active') return clients.filter(c => c.is_active && !c.is_ad_hoc);
    if (viewMode === 'adhoc') return clients.filter(c => !!c.is_ad_hoc);
    return clients.filter(c => !c.is_active);
  }, [clients, viewMode]);

  // Keep the selected client visible across tab switches — if it falls
  // out of the visible list (e.g. user switches from Active to Inactive
  // and the picked client is in the other bucket), reset to the first
  // of the visible set.
  useEffect(() => {
    if (!visibleClients.length) {
      setSelectedClientId('');
      return;
    }
    const stillVisible = visibleClients.some(c => c.id === selectedClientId);
    if (!stillVisible) setSelectedClientId(visibleClients[0].id);
  }, [viewMode, visibleClients, selectedClientId]);

  // Fetch entries when client changes
  useEffect(() => {
    if (selectedClientId) {
      fetchEntries(true);
      // Reset filters when switching clients
      setSearchTerm('');
      setFilterWorkType('all');
      setFilterTrigger('all');
      setIsAddingInline(false);
      setEditingCell(null);
    }
  }, [selectedClientId]);

  const fetchEntries = async (showLoading = false) => {
    if (!selectedClientId) return;
    if (showLoading) setLoading(true);
    const { data } = await supabase
      .from('client_delivery_log')
      .select('*')
      .eq('client_id', selectedClientId)
      .order('logged_at', { ascending: false })
      .order('sort_order', { ascending: true });
    // Cast: DB nullable fields vs interface (see archive/page.tsx note).
    setEntries((data || []) as DeliveryLogEntry[]);
    setLoading(false);
  };

  const selectedClient = clients.find(c => c.id === selectedClientId);

  // --- Inline cell editing ---
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
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, [field]: value, updated_at: new Date().toISOString() } : e));
    try {
      await supabase.from('client_delivery_log').update({
        [field]: value,
        updated_at: new Date().toISOString(),
      }).eq('id', entryId);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchEntries();
    }
  };

  const saveSelectField = async (entryId: string, field: string, value: string) => {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, [field]: value || null, updated_at: new Date().toISOString() } : e));
    try {
      await supabase.from('client_delivery_log').update({
        [field]: value || null,
        updated_at: new Date().toISOString(),
      }).eq('id', entryId);
    } catch (error) {
      console.error('Error saving:', error);
      await fetchEntries();
    }
  };

  const saveDateField = async (entryId: string, date: Date | undefined) => {
    if (!date) return;
    const dateStr = toLocalDateStr(date);
    setEditingCell(null);
    setEditingValue('');
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
      client_id: selectedClientId,
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
      client_id: selectedClientId,
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
      await fetchEntries();
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
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

    const currentOrder = current.sort_order;
    const swapOrder = swap.sort_order;
    const newCurrentOrder = currentOrder === swapOrder
      ? (direction === 'up' ? swapOrder - 1 : swapOrder + 1)
      : swapOrder;
    const newSwapOrder = currentOrder === swapOrder
      ? currentOrder
      : currentOrder;

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

  // Phase 3: split drafts off the main table same way the per-client
  // page does. The amber section above the table holds drafts; the
  // main table is for confirmed entries only.
  const pendingReviewEntries = entries.filter(e => e.pending_review === true).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const filtered = entries.filter((e) => {
    if (e.pending_review === true) return false;
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

  /** Phase 3 — Confirm: flip pending_review to false. Refreshes the
   *  per-client tab counts so the amber pill on the picker also
   *  updates without a full page reload. */
  const confirmDraft = async (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, pending_review: false } : e));
    const { error } = await supabase
      .from('client_delivery_log')
      .update({ pending_review: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('Confirm draft failed:', error);
      await fetchEntries();
      return;
    }
    setPendingDraftCounts(prev => {
      const next = { ...prev };
      if (next[selectedClientId]) next[selectedClientId] = Math.max(0, next[selectedClientId] - 1);
      return next;
    });
  };

  const dismissDraft = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    const { error } = await supabase
      .from('client_delivery_log')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Dismiss draft failed:', error);
      await fetchEntries();
      return;
    }
    setPendingDraftCounts(prev => {
      const next = { ...prev };
      if (next[selectedClientId]) next[selectedClientId] = Math.max(0, next[selectedClientId] - 1);
      return next;
    });
  };

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
      return;
    }
    setPendingDraftCounts(prev => ({ ...prev, [selectedClientId]: 0 }));
  };

  // Render an editable cell
  const renderEditableCell = (entry: DeliveryLogEntry, field: string, type: 'text' | 'textarea' | 'select-type' | 'select-trigger' | 'who' = 'text') => {
    const value = (entry as any)[field] || '';
    const isEditing = editingCell?.entryId === entry.id && editingCell?.field === field;

    if (type === 'select-type') {
      return (
        <td className="py-3.5 px-4 border-r border-cream-200">
          <Select value={entry.work_type} onValueChange={(v) => saveSelectField(entry.id, 'work_type', v)}>
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
          <Select value={entry.trigger || ''} onValueChange={(v) => saveSelectField(entry.id, 'trigger', v)}>
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
        <td className="py-3.5 px-4 border-r border-cream-200 cursor-pointer whitespace-nowrap" onDoubleClick={() => startEditing(entry.id, field, value)} title="Double-click to edit">
          <span className="text-ink-warm-700">{value || '—'}</span>
        </td>
      );
    }

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
        <td className="py-3.5 px-4 border-r border-cream-200 cursor-pointer max-w-[200px]" onDoubleClick={() => startEditing(entry.id, field, value)} title="Double-click to edit">
          <span className="text-ink-warm-700 line-clamp-2 whitespace-pre-wrap">{value || '—'}</span>
        </td>
      );
    }

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

  return (
    <div className="space-y-6">
      {/* v11 PageHeader — icon dropped 2026-06-03 to match /kols and
          other v11 list pages that read cleaner without an icon next
          to the title. */}
      <PageHeader
        title="Delivery Logs"
        subtitle="Track work delivered for each client"
        kicker="Clients · Delivery Logs"
        kickerDot="sky"
        actions={(selectedClientId ? (
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
        ) : undefined)}
      />

      {/* v11 chapter divider — counter shows live narrowing the same
          way /kols's Roster header does. When no client is picked yet,
          counter shows the client-pool size. */}
      <SectionHeader
        label="Entries"
        dot="brand"
        counter={
          !selectedClientId
            ? `${visibleClients.length} ${viewMode === 'all' ? '' : viewMode + ' '}client${visibleClients.length === 1 ? '' : 's'}`
            : `${filtered.length} of ${entries.length} entries${
                (filterWorkType !== 'all' || filterTrigger !== 'all' || searchTerm)
                  ? ' · filtered'
                  : ''
              }`
        }
        first
      />
      {/* Status tabs — match /clients exactly so the same status names
          show across both pages. All / Active / Ad-hoc / Inactive. */}

      {/* v11 filter toolbar — Active/Inactive view-mode tabs (left) +
          Search (middle) + Work-type / Trigger filters (right). The
          Inactive tab is for paused/between-contracts clients that
          aren't archived — both views exclude archived. */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'all' | 'active' | 'adhoc' | 'inactive')}>
          <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card text-sm px-4 py-2"
            >
              All
              <span className="ml-2 text-xs bg-cream-200 data-[state=active]:bg-cream-100 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{tabCounts.all}</span>
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm px-4 py-2"
            >
              Active
              <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{tabCounts.active}</span>
            </TabsTrigger>
            <TabsTrigger
              value="adhoc"
              className="data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-card text-sm px-4 py-2"
            >
              Ad-hoc
              <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{tabCounts.adhoc}</span>
            </TabsTrigger>
            <TabsTrigger
              value="inactive"
              className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-700 data-[state=active]:shadow-card text-sm px-4 py-2"
            >
              Inactive
              <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">{tabCounts.inactive}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {selectedClientId && (
          <>
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
          </>
        )}
      </div>

      {/* Client picker — secondary tabs row for picking which client
          to view. Sits between the primary toolbar above and the
          table below. */}
      <div>
        {clientsLoading ? (
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-24 rounded" />)}
          </div>
        ) : visibleClients.length === 0 ? (
          <Card className="border-cream-200 overflow-hidden">
            <EmptyState
              icon={Building2}
              title={
                viewMode === 'active' ? 'No active clients found.'
                : viewMode === 'adhoc' ? 'No ad-hoc clients found.'
                : viewMode === 'inactive' ? 'No inactive clients found.'
                : 'No clients found.'
              }
              description={
                viewMode === 'active' ? 'Activate a client (or create one on /clients) to start logging deliveries.'
                : viewMode === 'adhoc' ? 'No one-off / specialized engagements right now — flag a client as Ad-hoc from /clients to surface them here.'
                : viewMode === 'inactive' ? 'No paused or between-contract clients right now — when one is deactivated (without being archived) it will show up here.'
                : 'No clients on the books right now.'
              }
              className="py-12"
            />
          </Card>
        ) : (
          <Tabs value={selectedClientId} onValueChange={setSelectedClientId}>
            <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200 flex-wrap">
              {visibleClients.map((client) => {
                const draftCount = pendingDraftCounts[client.id] || 0;
                return (
                  <TabsTrigger
                    key={client.id}
                    value={client.id}
                    className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm px-4 py-2"
                  >
                    {client.logo_url ? (
                      <img src={client.logo_url} alt="" className="h-4 w-4 object-contain rounded mr-2 inline-block" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 mr-2 inline-block" />
                    )}
                    {client.name}
                    {draftCount > 0 && (
                      // Phase 3: amber pulse pill — surfaces drafts
                      // before the CM clicks into the client. Pulse
                      // animation kept subtle (text only, no full bg
                      // pulse) so a roster of 20 clients with drafts
                      // doesn't strobe.
                      <span
                        className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-full pointer-events-none"
                        title={`${draftCount} pending review draft${draftCount === 1 ? '' : 's'}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {draftCount}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}
      </div>

            {/* ─── Phase 3 — Pending Review section ───────────────
                Same structure as the per-client `/clients/[id]/delivery-log`
                page: amber Card with pre-filled rows + Confirm /
                Dismiss / Confirm All. Renders above the main table
                when the selected client has any drafts. */}
            {selectedClientId && pendingReviewEntries.length > 0 && (
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
                      <Button size="sm" variant="brand" className="h-8 text-xs" onClick={confirmAllDrafts}>
                        Confirm All ({pendingReviewEntries.length})
                      </Button>
                    )}
                  </div>
                  <div className="divide-y divide-amber-200">
                    {pendingReviewEntries.map(draft => (
                      <div key={draft.id} className="px-4 py-3 space-y-2 hover:bg-amber-50/60">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs text-ink-warm-500 mb-0.5">
                              <CalendarIcon className="h-3 w-3" />
                              {formatDate(draft.logged_at + 'T00:00:00')}
                              <span className="text-amber-700/70">·</span>
                              <span className="text-[10px] uppercase tracking-wider text-ink-warm-600">{draft.work_type}</span>
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
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                          {(() => {
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
                                <Input defaultValue={draft.who || ''} placeholder="Who" className="h-8 text-xs focus-brand bg-white" onBlur={(e) => setDraftField('who', e.target.value)} />
                                <Input defaultValue={draft.method || ''} placeholder="How (method)" className="h-8 text-xs focus-brand bg-white" onBlur={(e) => setDraftField('method', e.target.value)} />
                                <Input defaultValue={draft.location || ''} placeholder="Where" className="h-8 text-xs focus-brand bg-white" onBlur={(e) => setDraftField('location', e.target.value)} />
                                <Select value={draft.trigger || ''} onValueChange={(v) => setDraftField('trigger', v)}>
                                  <SelectTrigger className="h-8 text-xs focus-brand bg-white">
                                    <SelectValue placeholder="Trigger" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TRIGGERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Input defaultValue={draft.notes || ''} placeholder="Notes (optional)" className="h-8 text-xs focus-brand bg-white" onBlur={(e) => setDraftField('notes', e.target.value)} />
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

            {/* Table — used to have `-mx-6 -mb-6` negative margins
                that pushed it beyond the page's horizontal padding,
                making the table visibly wider than the PageHeader +
                toolbar above. Dropped 2026-06-03 so the table sits
                inside the same horizontal grid as the rest of the
                page content. */}
            <div className="mt-5">
              {!selectedClientId ? (
                <Card className="border-cream-200 overflow-hidden">
                  <EmptyState
                    icon={Building2}
                    title="Pick a client to view their delivery log."
                    description="Use the client picker above. The table loads its entries once a client is selected."
                    className="py-12"
                  />
                </Card>
              ) : loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
                </div>
              ) : filtered.length === 0 && !isAddingInline ? (
                <div className="text-center py-16">
                  <ClipboardList className="h-12 w-12 text-ink-warm-300 mx-auto mb-3" />
                  <p className="text-ink-warm-500 font-medium">
                    {entries.length === 0 ? 'No delivery log entries yet.' : 'No entries match your filters.'}
                  </p>
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
                </div>
              ) : (
                // Card wrapper gives the table the same v11 chrome
                // (border-cream-200 + rounded) as other v11 surfaces;
                // inner overflow-x-auto preserves horizontal scroll
                // for wider-than-viewport tables on narrow screens.
                <Card className="border-cream-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      {/* v11 spreadsheet header — matches /kols pattern
                          (solid `bg-cream-50` + `border-r border-cream-200`
                          between cells) since delivery-logs is also an
                          inline-editable spreadsheet. Was the lighter
                          `bg-cream-50/80` with no column separators,
                          which made the table feel different from
                          the rest of v11. 2026-06-03. */}
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
                                  {inlineNew.logged_at ? formatDate(inlineNew.logged_at + 'T00:00:00') : 'Select date'}
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
                        // via border-r on each cell (added via replace
                        // below). Matches /kols spreadsheet chrome.
                        <tr key={entry.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-cream-50'} hover:bg-cream-100 transition-colors border-b border-cream-200 group`}>
                          <td className="py-3.5 px-4 border-r border-cream-200">
                            <span className="inline-flex items-center justify-center bg-cream-100 text-ink-warm-700 text-xs font-bold rounded-full h-6 w-6">{getDayNumber(entry.logged_at)}</span>
                          </td>
                          <td className="py-3.5 px-4 border-r border-cream-200 whitespace-nowrap">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-ink-warm-500 text-sm hover:text-ink-warm-700 cursor-pointer">
                                  {formatDate(entry.logged_at + 'T00:00:00')}
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
                          {renderEditableCell(entry, 'work_type', 'select-type')}
                          {renderEditableCell(entry, 'action', 'text')}
                          {renderEditableCell(entry, 'who', 'who')}
                          {renderEditableCell(entry, 'method', 'textarea')}
                          {renderEditableCell(entry, 'location', 'text')}
                          {renderEditableCell(entry, 'trigger', 'select-trigger')}
                          {renderEditableCell(entry, 'notes', 'textarea')}
                          <td className="py-3.5 px-4 border-r border-cream-200 text-right">
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Entry' : 'Add Delivery Log Entry'}</DialogTitle>
            <DialogDescription>Log work delivered for {selectedClient?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Work Type <span className="text-rose-500">*</span></Label>
                <Select value={form.work_type} onValueChange={(v) => setForm({ ...form, work_type: v })}>
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Date <span className="text-rose-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="focus-brand justify-start text-left font-normal" style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: form.logged_at ? '#111827' : '#9ca3af' }}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.logged_at ? formatDate(form.logged_at) : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.logged_at} onSelect={(date) => setForm({ ...form, logged_at: date || undefined })} initialFocus classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }} modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Action <span className="text-rose-500">*</span></Label>
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
            <DialogTitle>Delete Entry</DialogTitle>
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
