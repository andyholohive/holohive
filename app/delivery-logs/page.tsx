'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { UserService } from '@/lib/userService';
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
};

type Client = {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
};

const WORK_TYPES = ['Client-Facing', 'Internal'] as const;
const TRIGGERS = ['Client Request', 'Follow-Up Needed', 'SOP', 'Extra'] as const;

const workTypeBadge = (type: string) => {
  return type === 'Client-Facing'
    ? 'bg-blue-100 text-blue-800'
    : 'bg-gray-100 text-gray-700';
};

const triggerBadge = (trigger: string) => {
  switch (trigger) {
    case 'Client Request': return 'bg-purple-100 text-purple-800';
    case 'Follow-Up Needed': return 'bg-yellow-100 text-yellow-800';
    case 'SOP': return 'bg-green-100 text-green-800';
    case 'Extra': return 'bg-orange-100 text-orange-800';
    default: return 'bg-gray-100 text-gray-700';
  }
};

type EditingCell = { entryId: string; field: string } | null;

export default function DeliveryLogsPage() {
  const { user } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [entries, setEntries] = useState<DeliveryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
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
    logged_at: new Date().toISOString().split('T')[0],
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

  // Fetch clients on mount
  useEffect(() => {
    const fetchClients = async () => {
      setClientsLoading(true);
      const { data } = await supabase
        .from('clients')
        .select('id, name, logo_url, is_active')
        .eq('is_active', true)
        .is('archived_at', null)
        .order('name');
      setClients(data || []);
      if (data && data.length > 0 && !selectedClientId) {
        setSelectedClientId(data[0].id);
      }
      setClientsLoading(false);
    };
    fetchClients();
    UserService.getAllUsers().then((users) => {
      setTeamMembers(users.filter(u => u.role !== 'client').map(u => ({ id: u.id, name: u.name || u.email })));
    });
  }, []);

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
    setEntries(data || []);
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
    const dateStr = date.toISOString().split('T')[0];
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
    setInlineNew({ work_type: '', action: '', who: '', method: '', location: '', trigger: '', notes: '', logged_at: new Date().toISOString().split('T')[0] });
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
      logged_at: form.logged_at.toISOString().split('T')[0],
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

  const filtered = entries.filter((e) => {
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

  // Render an editable cell
  const renderEditableCell = (entry: DeliveryLogEntry, field: string, type: 'text' | 'textarea' | 'select-type' | 'select-trigger' | 'who' = 'text') => {
    const value = (entry as any)[field] || '';
    const isEditing = editingCell?.entryId === entry.id && editingCell?.field === field;

    if (type === 'select-type') {
      return (
        <td className="py-3 px-4">
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
        <td className="py-3 px-4">
          <Select value={entry.trigger || ''} onValueChange={(v) => saveSelectField(entry.id, 'trigger', v)}>
            <SelectTrigger
              className={`border-none shadow-none bg-transparent w-auto h-auto ${entry.trigger ? triggerBadge(entry.trigger) : 'text-gray-400'} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
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
                <button type="button" className="text-[10px] text-green-600 hover:underline" onClick={saveInlineEdit}>Save</button>
              )}
              <button type="button" className="text-[10px] text-[#3e8692] hover:underline" onClick={() => { setInlineWhoMode(inlineWhoMode === 'team' ? 'custom' : 'team'); setEditingValue(''); }}>
                {inlineWhoMode === 'team' ? 'Manual' : 'Team'}
              </button>
              <button type="button" className="text-[10px] text-gray-400 hover:underline" onClick={cancelEditing}>Cancel</button>
            </div>
          </td>
        );
      }
      return (
        <td className="py-3 px-4 cursor-pointer whitespace-nowrap" onDoubleClick={() => startEditing(entry.id, field, value)} title="Double-click to edit">
          <span className="text-gray-600">{value || '—'}</span>
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
        <td className="py-3 px-4 cursor-pointer max-w-[200px]" onDoubleClick={() => startEditing(entry.id, field, value)} title="Double-click to edit">
          <span className="text-gray-600 line-clamp-2 whitespace-pre-wrap">{value || '—'}</span>
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
        className={`py-3 px-4 cursor-pointer ${field === 'action' ? 'max-w-[200px]' : field === 'location' ? 'max-w-[150px]' : ''}`}
        onDoubleClick={() => startEditing(entry.id, field, value)}
        title="Double-click to edit"
      >
        <span className={`${field === 'action' ? 'line-clamp-2 text-gray-900 font-medium' : 'text-gray-600'} ${field === 'location' ? 'truncate block' : ''}`}>
          {value || '—'}
        </span>
      </td>
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
                  <ClipboardList className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Delivery Logs</h2>
                  <p className="text-sm text-gray-500">Track work delivered for each client</p>
                </div>
              </div>
              {selectedClientId && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setIsAddingInline(true); }}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Inline
                  </Button>
                  <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }} onClick={() => openForm()}>
                    <Expand className="h-4 w-4 mr-2" />
                    Add via Form
                  </Button>
                </div>
              )}
            </div>

            {/* Client Tabs */}
            <div className="pt-4">
              {clientsLoading ? (
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-24 rounded" />)}
                </div>
              ) : clients.length === 0 ? (
                <p className="text-sm text-gray-500">No active clients found.</p>
              ) : (
                <Tabs value={selectedClientId} onValueChange={setSelectedClientId}>
                  <TabsList className="bg-gray-100 p-1 h-auto flex-wrap">
                    {clients.map((client) => (
                      <TabsTrigger
                        key={client.id}
                        value={client.id}
                        className="data-[state=active]:bg-white data-[state=active]:text-[#3e8692] data-[state=active]:shadow-sm text-sm px-4 py-2"
                      >
                        {client.logo_url ? (
                          <img src={client.logo_url} alt="" className="h-4 w-4 object-contain rounded mr-2 inline-block" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5 mr-2 inline-block" />
                        )}
                        {client.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            </div>

            {/* Filters */}
            {selectedClientId && (
              <div className="flex flex-wrap items-center gap-3 pt-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search actions, who, notes..."
                    className="pl-10 auth-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={filterWorkType} onValueChange={setFilterWorkType}>
                  <SelectTrigger className="w-[160px] auth-input">
                    <Filter className="h-3.5 w-3.5 mr-2 text-gray-400" />
                    <SelectValue placeholder="Work Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterTrigger} onValueChange={setFilterTrigger}>
                  <SelectTrigger className="w-[180px] auth-input">
                    <Filter className="h-3.5 w-3.5 mr-2 text-gray-400" />
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
            )}

            {/* Table */}
            <div className="mt-5 -mx-6 -mb-6">
              {!selectedClientId ? (
                <div className="text-center py-16">
                  <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Select a client to view their delivery log.</p>
                </div>
              ) : loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
                </div>
              ) : filtered.length === 0 && !isAddingInline ? (
                <div className="text-center py-16">
                  <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">
                    {entries.length === 0 ? 'No delivery log entries yet.' : 'No entries match your filters.'}
                  </p>
                  {entries.length === 0 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button variant="outline" onClick={() => setIsAddingInline(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Add Inline
                      </Button>
                      <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }} onClick={() => openForm()}>
                        <Expand className="h-4 w-4 mr-2" /> Add via Form
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-b border-gray-200 bg-gray-50/80">
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap w-14">
                          <button className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors" onClick={() => setSortAsc(!sortAsc)}>
                            Day
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Type</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Action</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Who</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">How</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Where</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Trigger</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Notes</th>
                        <th className="text-right py-3 px-4 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Inline add row */}
                      {isAddingInline && (
                        <tr className="border-b border-[#3e8692]/20 bg-[#e8f4f5]/20">
                          <td className="py-3 px-4 text-gray-400 text-xs">—</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
                                  {inlineNew.logged_at ? new Date(inlineNew.logged_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Select date'}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={inlineNew.logged_at ? new Date(inlineNew.logged_at + 'T00:00:00') : undefined}
                                  onSelect={(date) => setInlineNew({ ...inlineNew, logged_at: date ? date.toISOString().split('T')[0] : '' })}
                                  initialFocus
                                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                                />
                              </PopoverContent>
                            </Popover>
                          </td>
                          <td className="py-3 px-4">
                            <Select value={inlineNew.work_type} onValueChange={(v) => setInlineNew({ ...inlineNew, work_type: v })}>
                              <SelectTrigger
                                className={`border-none shadow-none bg-transparent w-auto h-auto ${inlineNew.work_type ? workTypeBadge(inlineNew.work_type) : 'text-gray-400'} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
                                style={{ outline: 'none', boxShadow: 'none' }}
                              >
                                <SelectValue placeholder="Type *" />
                              </SelectTrigger>
                              <SelectContent>
                                {WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              value={inlineNew.action}
                              onChange={(e) => setInlineNew({ ...inlineNew, action: e.target.value })}
                              placeholder="Action *"
                              className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs font-medium text-gray-900"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            />
                          </td>
                          <td className="py-3 px-4">
                            {inlineNewWhoMode === 'team' ? (
                              <div>
                                <Select value={inlineNew.who} onValueChange={(v) => setInlineNew({ ...inlineNew, who: v })}>
                                  <SelectTrigger
                                    className="border-none shadow-none bg-transparent w-auto h-auto px-0 py-0 text-xs text-gray-600 inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
                                    style={{ outline: 'none', boxShadow: 'none' }}
                                  >
                                    <SelectValue placeholder="Who" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {teamMembers.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <button type="button" className="text-[10px] text-[#3e8692] hover:underline mt-0.5 block" onClick={() => { setInlineNewWhoMode('custom'); setInlineNew({ ...inlineNew, who: '' }); }}>Manual</button>
                              </div>
                            ) : (
                              <div>
                                <Input
                                  value={inlineNew.who}
                                  onChange={(e) => setInlineNew({ ...inlineNew, who: e.target.value })}
                                  placeholder="Who"
                                  className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs text-gray-600"
                                  style={{ outline: 'none', boxShadow: 'none' }}
                                />
                                <button type="button" className="text-[10px] text-[#3e8692] hover:underline mt-0.5 block" onClick={() => { setInlineNewWhoMode('team'); setInlineNew({ ...inlineNew, who: '' }); }}>Team</button>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              value={inlineNew.method}
                              onChange={(e) => setInlineNew({ ...inlineNew, method: e.target.value })}
                              placeholder="How"
                              className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs text-gray-600"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              value={inlineNew.location}
                              onChange={(e) => setInlineNew({ ...inlineNew, location: e.target.value })}
                              placeholder="Where"
                              className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs text-gray-600"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Select value={inlineNew.trigger} onValueChange={(v) => setInlineNew({ ...inlineNew, trigger: v })}>
                              <SelectTrigger
                                className={`border-none shadow-none bg-transparent w-auto h-auto ${inlineNew.trigger ? triggerBadge(inlineNew.trigger) : 'text-gray-400'} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
                                style={{ outline: 'none', boxShadow: 'none' }}
                              >
                                <SelectValue placeholder="Trigger" />
                              </SelectTrigger>
                              <SelectContent>
                                {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              value={inlineNew.notes}
                              onChange={(e) => setInlineNew({ ...inlineNew, notes: e.target.value })}
                              placeholder="Notes"
                              className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs text-gray-600"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleInlineAdd} disabled={!inlineNew.work_type || !inlineNew.action.trim()}>
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setIsAddingInline(false); setInlineNew({ work_type: '', action: '', who: '', method: '', location: '', trigger: '', notes: '', logged_at: new Date().toISOString().split('T')[0] }); }}>
                                <X className="h-4 w-4 text-gray-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {filtered.map((entry) => (
                        <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors group">
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center justify-center bg-gray-100 text-gray-600 text-xs font-bold rounded-full h-6 w-6">{getDayNumber(entry.logged_at)}</span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-gray-500 text-sm hover:text-gray-700 cursor-pointer">
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
                          {renderEditableCell(entry, 'work_type', 'select-type')}
                          {renderEditableCell(entry, 'action', 'text')}
                          {renderEditableCell(entry, 'who', 'who')}
                          {renderEditableCell(entry, 'method', 'textarea')}
                          {renderEditableCell(entry, 'location', 'text')}
                          {renderEditableCell(entry, 'trigger', 'select-trigger')}
                          {renderEditableCell(entry, 'notes', 'textarea')}
                          <td className="py-3 px-4 text-right">
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
                                      className="w-auto px-1 hover:bg-gray-100 disabled:opacity-30"
                                      onClick={() => handleReorder(entry.id, 'up')}
                                      disabled={posInGroup === 0}
                                      title="Move up within same date"
                                    >
                                      <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-auto px-1 hover:bg-gray-100 disabled:opacity-30"
                                      onClick={() => handleReorder(entry.id, 'down')}
                                      disabled={posInGroup === sameDateSorted.length - 1}
                                      title="Move down within same date"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                                    </Button>
                                  </>
                                );
                              })()}
                              <Button variant="ghost" size="sm" className="w-auto px-2 hover:bg-gray-100" onClick={() => openForm(entry)} title="Edit in popup">
                                <Expand className="h-3.5 w-3.5 text-gray-600" />
                              </Button>
                              <Button variant="ghost" size="sm" className="w-auto px-2 hover:bg-red-50" onClick={() => setDeletingId(entry.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
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
                <Label>Work Type <span className="text-red-500">*</span></Label>
                <Select value={form.work_type} onValueChange={(v) => setForm({ ...form, work_type: v })}>
                  <SelectTrigger className="auth-input"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {WORK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="auth-input justify-start text-left font-normal" style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: form.logged_at ? '#111827' : '#9ca3af' }}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.logged_at ? form.logged_at.toLocaleDateString() : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.logged_at} onSelect={(date) => setForm({ ...form, logged_at: date || undefined })} initialFocus classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }} modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Action <span className="text-red-500">*</span></Label>
              <Input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder="What was done?" className="auth-input" />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Who</Label>
                <button
                  type="button"
                  className="text-xs text-[#3e8692] hover:underline"
                  onClick={() => { setWhoMode(whoMode === 'team' ? 'custom' : 'team'); setForm({ ...form, who: '' }); }}
                >
                  {whoMode === 'team' ? 'Enter manually instead' : 'Pick from team'}
                </button>
              </div>
              {whoMode === 'team' ? (
                <Select value={form.who} onValueChange={(v) => setForm({ ...form, who: v })}>
                  <SelectTrigger className="auth-input"><SelectValue placeholder="Select team member" /></SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} placeholder="Enter name manually" className="auth-input" />
              )}
            </div>
            <div className="grid gap-2">
              <Label>How (Method)</Label>
              <Textarea value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="Method, script, tool, process used..." className="auth-input" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Where</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location or platform" className="auth-input" />
              </div>
              <div className="grid gap-2">
                <Label>Trigger</Label>
                <Select value={form.trigger} onValueChange={(v) => setForm({ ...form, trigger: v })}>
                  <SelectTrigger className="auth-input"><SelectValue placeholder="Select trigger" /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." className="auth-input" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button
              className="hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              onClick={handleSubmit}
              disabled={!form.work_type || !form.action.trim() || !form.logged_at}
            >
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && handleDelete(deletingId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
