'use client';

/**
 * Action Board Templates — admin CRUD for `milestone_templates`.
 *
 * Mirrors the pattern in /tasks/deliverables/templates: list view,
 * row actions (edit, duplicate, delete, set-as-default), and an editor
 * dialog for create/edit. Templates are GLOBAL (not per-client), which
 * is why they get a dedicated admin surface here instead of living
 * inside the per-client Context popup's Action Board tab.
 *
 * The existing Context popup still has a "Templates" dropdown for
 * applying / saving-current-as. This page is the management hub for
 * everything else (rename, modify, delete, mark default).
 *
 * Data shape for `milestone_templates.milestones` (jsonb array):
 *   [
 *     {
 *       name: string,
 *       subtitle: string,
 *       items: [{ text: string, court: 'ours' | 'yours' }]
 *     }, ...
 *   ]
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Plus, Settings, Trash2, Copy, Star, StarOff, Pencil, ChevronUp, ChevronDown, Search, X, Lock,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

type Court = 'ours' | 'yours';

interface MilestoneItem {
  text: string;
  court: Court;
}

interface MilestoneEntry {
  name: string;
  subtitle: string;
  items: MilestoneItem[];
  status_message?: string;
}

interface MilestoneTemplate {
  id: string;
  name: string;
  description: string | null;
  milestones: MilestoneEntry[];
  is_default: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

const emptyMilestone = (): MilestoneEntry => ({
  name: '',
  subtitle: '',
  items: [],
});

const cloneMilestones = (ms: MilestoneEntry[]): MilestoneEntry[] =>
  ms.map(m => ({
    name: m.name,
    subtitle: m.subtitle,
    status_message: m.status_message,
    items: m.items.map(i => ({ text: i.text, court: i.court })),
  }));

// ─── Page ───────────────────────────────────────────────────────────

export default function ActionBoardTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<MilestoneTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = new
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editMilestones, setEditMilestones] = useState<MilestoneEntry[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<MilestoneTemplate | null>(null);

  // ─── Data fetch ───────────────────────────────────────────────────
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('milestone_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      setTemplates((data || []).map((t: any) => ({
        ...t,
        milestones: Array.isArray(t.milestones) ? t.milestones : [],
      })));
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      toast({ title: 'Error', description: 'Failed to load templates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTemplates(); }, []);

  const filteredTemplates = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  }, [templates, searchTerm]);

  // ─── Row actions ──────────────────────────────────────────────────

  const openNew = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditIsDefault(false);
    setEditMilestones([]);
    setEditorOpen(true);
  };

  const openEdit = (t: MilestoneTemplate) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDescription(t.description || '');
    setEditIsDefault(!!t.is_default);
    setEditMilestones(cloneMilestones(t.milestones));
    setEditorOpen(true);
  };

  const handleDuplicate = async (t: MilestoneTemplate) => {
    try {
      const { error } = await (supabase as any).from('milestone_templates').insert({
        name: `${t.name} (Copy)`,
        description: t.description,
        milestones: cloneMilestones(t.milestones),
        is_default: false, // duplicate never becomes default
        created_by: user?.id || null,
      });
      if (error) throw error;
      toast({ title: 'Template duplicated' });
      await loadTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleSetDefault = async (t: MilestoneTemplate) => {
    // Mutually exclusive: setting one as default unsets all others.
    // Do the unset first so we never end up with multiple defaults
    // even if the second write fails (better to have zero than two).
    try {
      const { error: clearError } = await (supabase as any)
        .from('milestone_templates')
        .update({ is_default: false })
        .neq('id', t.id);
      if (clearError) throw clearError;
      const { error: setError } = await (supabase as any)
        .from('milestone_templates')
        .update({ is_default: true })
        .eq('id', t.id);
      if (setError) throw setError;
      toast({ title: 'Default updated', description: `"${t.name}" is now the default template.` });
      await loadTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('milestone_templates').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Template deleted' });
      setDeleteTarget(null);
      await loadTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // ─── Editor save ──────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Normalize: drop empty milestones + empty items so we don't
      // persist whitespace junk.
      const cleanedMilestones = editMilestones
        .map(m => ({
          name: m.name.trim(),
          subtitle: (m.subtitle || '').trim(),
          status_message: (m.status_message || '').trim() || undefined,
          items: (m.items || [])
            .map(i => ({ text: i.text.trim(), court: i.court }))
            .filter(i => i.text),
        }))
        .filter(m => m.name);

      const payload: any = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        milestones: cleanedMilestones,
        is_default: editIsDefault,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await (supabase as any)
          .from('milestone_templates')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        payload.created_by = user?.id || null;
        const { error } = await (supabase as any).from('milestone_templates').insert(payload);
        if (error) throw error;
      }

      // If marked as default, unset every OTHER template's default flag.
      if (editIsDefault) {
        const idToExclude = editingId; // null for new templates
        const q = (supabase as any).from('milestone_templates').update({ is_default: false });
        if (idToExclude) q.neq('id', idToExclude);
        // For new: we can't exclude by id (we don't have it yet) — but
        // the freshly-inserted row IS_default=true, so .neq isn't
        // strictly needed. We refetch immediately after.
        await q;
      }

      toast({ title: editingId ? 'Template updated' : 'Template created' });
      setEditorOpen(false);
      await loadTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ─── Editor milestone manipulation ────────────────────────────────

  const addMilestone = () => {
    setEditMilestones(prev => [...prev, emptyMilestone()]);
  };
  const updateMilestone = (idx: number, patch: Partial<MilestoneEntry>) => {
    setEditMilestones(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));
  };
  const removeMilestone = (idx: number) => {
    setEditMilestones(prev => prev.filter((_, i) => i !== idx));
  };
  const moveMilestone = (idx: number, dir: 'up' | 'down') => {
    setEditMilestones(prev => {
      const next = [...prev];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const addItem = (msIdx: number) => {
    setEditMilestones(prev => prev.map((m, i) =>
      i === msIdx ? { ...m, items: [...m.items, { text: '', court: 'ours' }] } : m
    ));
  };
  const updateItem = (msIdx: number, itemIdx: number, patch: Partial<MilestoneItem>) => {
    setEditMilestones(prev => prev.map((m, i) =>
      i === msIdx
        ? { ...m, items: m.items.map((it, j) => j === itemIdx ? { ...it, ...patch } : it) }
        : m
    ));
  };
  const removeItem = (msIdx: number, itemIdx: number) => {
    setEditMilestones(prev => prev.map((m, i) =>
      i === msIdx
        ? { ...m, items: m.items.filter((_, j) => j !== itemIdx) }
        : m
    ));
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header — matches the standard admin page pattern
          (h2 + subtitle on the left, action buttons on the right).
          Outer padding comes from Sidebar's <main className="p-6">. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/clients" className="inline-flex items-center text-xs text-gray-500 hover:text-brand mb-1 transition-colors">
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Clients
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">Action Board Templates</h2>
          <p className="text-gray-600">Reusable milestone sets you can apply to any client's Action Board.</p>
        </div>
        <Button variant="brand" className="hover:opacity-90 flex-shrink-0" onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search templates…"
          className="pl-10 focus-brand"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card className="border-0 shadow-md rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-brand mx-auto" />
            <p className="text-sm text-gray-500 mt-3">Loading templates…</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Settings className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">
              {searchTerm ? 'No templates match your search.' : 'No templates yet — create your first one.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Milestones</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right w-[200px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.map(t => (
                <TableRow key={t.id} className="hover:bg-gray-50/50 transition-colors">
                  <TableCell className="py-3">
                    {t.is_default ? (
                      <Star className="h-4 w-4 text-amber-500" fill="currentColor" />
                    ) : (
                      <StarOff className="h-4 w-4 text-gray-200" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-gray-900">
                    {t.name}
                    {t.is_default && (
                      <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 text-[10px]">Default</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 max-w-[280px] truncate" title={t.description || ''}>
                    {t.description || '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-gray-900">
                    {t.milestones.length}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {t.created_at
                      ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!t.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Set as default"
                          onClick={() => handleSetDefault(t)}
                        >
                          <Star className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Duplicate"
                        onClick={() => handleDuplicate(t)}
                      >
                        <Copy className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Edit"
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-red-50"
                        title="Delete"
                        onClick={() => setDeleteTarget(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Helper text */}
      <p className="text-xs text-gray-500">
        Templates marked as <Star className="h-3 w-3 text-amber-500 inline" fill="currentColor" /> default get auto-applied to new clients. Only one default at a time.
      </p>

      {/* ── Editor dialog ──────────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden border-l-4 border-l-brand rounded-xl flex flex-col">
          <DialogHeader className="pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900">
                  {editingId ? 'Edit Template' : 'New Template'}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 mt-1">
                  Define a reusable set of milestones. Each milestone can have items split between <strong>Ours</strong> (Holo Hive) and <strong>Yours</strong> (client).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto px-1 py-4 space-y-4 flex-1 min-h-0">
            {/* Name + Description */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-gray-700">Template Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Standard Onboarding (Week 1)"
                  className="focus-brand mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-700">Description (optional)</Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="What's this template for?"
                  className="focus-brand mt-1"
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Star className={`h-4 w-4 ${editIsDefault ? 'text-amber-500' : 'text-gray-300'}`} fill={editIsDefault ? 'currentColor' : 'none'} />
                  <div>
                    <Label className="text-sm font-medium text-gray-900">Set as default</Label>
                    <p className="text-xs text-gray-500">Will be applied automatically to new clients.</p>
                  </div>
                </div>
                <Switch checked={editIsDefault} onCheckedChange={setEditIsDefault} />
              </div>
            </div>

            {/* Milestones list */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Milestones</Label>
                  <p className="text-xs text-gray-500">{editMilestones.length} step{editMilestones.length === 1 ? '' : 's'} in this template</p>
                </div>
                <Button variant="outline" size="sm" onClick={addMilestone}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Milestone
                </Button>
              </div>

              {editMilestones.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">No milestones yet. Click "Add Milestone" to start.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {editMilestones.map((ms, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-white">
                      {/* Milestone header */}
                      <div className="flex items-start gap-2 mb-3">
                        <div className="flex flex-col gap-0.5 mt-1">
                          <button
                            type="button"
                            onClick={() => moveMilestone(idx, 'up')}
                            disabled={idx === 0}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveMilestone(idx, 'down')}
                            disabled={idx === editMilestones.length - 1}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-xs font-mono font-semibold text-gray-400 mt-1.5">{idx + 1}.</span>
                        <div className="flex-1 space-y-2">
                          <Input
                            value={ms.name}
                            onChange={(e) => updateMilestone(idx, { name: e.target.value })}
                            placeholder="Milestone name (e.g. Kickoff & Setup)"
                            className="focus-brand font-medium"
                          />
                          <Input
                            value={ms.subtitle || ''}
                            onChange={(e) => updateMilestone(idx, { subtitle: e.target.value })}
                            placeholder="Subtitle (e.g. Onboarding form completed, workspace initialized)"
                            className="focus-brand text-sm"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 hover:bg-red-50 mt-1"
                          onClick={() => removeMilestone(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>

                      {/* Items inside this milestone */}
                      <div className="ml-6 space-y-1.5">
                        {ms.items.map((it, itemIdx) => (
                          <div key={itemIdx} className="flex items-center gap-2">
                            {/* Court toggle */}
                            <button
                              type="button"
                              onClick={() => updateItem(idx, itemIdx, { court: it.court === 'ours' ? 'yours' : 'ours' })}
                              className={`flex-shrink-0 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide ${
                                it.court === 'ours'
                                  ? 'bg-brand/10 text-brand'
                                  : 'bg-orange-100 text-orange-700'
                              }`}
                              title={it.court === 'ours' ? 'Click to toggle to Yours (client)' : 'Click to toggle to Ours (Holo Hive)'}
                            >
                              {it.court === 'ours' ? 'Ours' : 'Yours'}
                            </button>
                            <Input
                              value={it.text}
                              onChange={(e) => updateItem(idx, itemIdx, { text: e.target.value })}
                              placeholder="Item text"
                              className="focus-brand text-sm h-8"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-red-50 flex-shrink-0"
                              onClick={() => removeItem(idx, itemIdx)}
                            >
                              <X className="h-3 w-3 text-gray-400" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-gray-500 hover:text-brand"
                          onClick={() => addItem(idx)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add item
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-gray-100 pt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button variant="brand" className="hover:opacity-90" onClick={handleSave} disabled={saving || !editName.trim()}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ──────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[400px] border-l-4 border-l-red-500 rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-red-500" />
              Delete template?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 pt-2">
              <strong>{deleteTarget?.name}</strong> will be permanently deleted. Clients that previously had this template applied will keep their milestones — only the template itself is removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
