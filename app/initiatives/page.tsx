'use client';

/**
 * /initiatives — Initiative Tracker admin.
 *
 * Replaces Jdot's Google Sheet Initiative Tracker. Each row drives the
 * Internal Success layer's "Initiatives" card on /dashboard with stale
 * tones (amber 14d / red 30d idle).
 *
 * Tasks link via `tasks.linked_initiative`; updating a linked task
 * bumps the initiative's `updated_at` (in the future — for now the
 * stale clock starts ticking on edit).
 */

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { useToast } from '@/hooks/use-toast';
import { Compass, Plus, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';

type Status = 'active' | 'completed' | 'parked';

type Initiative = {
  id: string;
  name: string;
  owner_user_id: string | null;
  status: Status;
  category_tags: string[];
  created_at: string;
  updated_at: string;
};

type UserRow = { id: string; name: string };

const statusTone: Record<Status, BadgeTone> = {
  active: 'brand',
  completed: 'success',
  parked: 'neutral',
};

function staleTone(updatedAt: string): { tone: BadgeTone; label: string } {
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (days >= 30) return { tone: 'danger', label: `${days}d stale` };
  if (days >= 14) return { tone: 'warning', label: `${days}d idle` };
  return { tone: 'success', label: `${days}d fresh` };
}

export default function InitiativesPage() {
  const { toast } = useToast();
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Initiative | null>(null);
  const [form, setForm] = useState({ name: '', owner_user_id: '', status: 'active' as Status, category_tags: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [iRes, usersRes] = await Promise.all([
        fetch('/api/initiatives'),
        // is_active filter excludes deactivated teammates + pending
        // sign-ups from the Owner picker. 2026-06-04.
        supabase.from('users').select('id, name').in('role', ['admin', 'super_admin', 'member']).eq('is_active', true).order('name'),
      ]);
      const iJson = await iRes.json();
      setInitiatives(iJson.initiatives || []);
      setUsers((usersRes.data || []).map((u: any) => ({ id: u.id, name: u.name })));
    } catch (err) {
      toast({ title: 'Failed to load', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const visible = useMemo(
    () => statusFilter === 'all' ? initiatives : initiatives.filter(i => i.status === statusFilter),
    [initiatives, statusFilter],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', owner_user_id: '', status: 'active', category_tags: '' });
    setModalOpen(true);
  };

  const openEdit = (i: Initiative) => {
    setEditing(i);
    setForm({
      name: i.name,
      owner_user_id: i.owner_user_id || '',
      status: i.status,
      category_tags: (i.category_tags || []).join(', '),
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        owner_user_id: form.owner_user_id || null,
        status: form.status,
        category_tags: form.category_tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      const url = editing ? `/api/initiatives/${editing.id}` : '/api/initiatives';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: editing ? 'Initiative updated' : 'Initiative created' });
      setModalOpen(false);
      await fetchAll();
    } catch (err) {
      toast({ title: 'Save failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // [v11 destructive Dialog] confirm() replaced by deletePending state +
  // confirmDelete below. 2026-06-05.
  const [deletePending, setDeletePending] = useState<Initiative | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = (i: Initiative) => {
    setDeletePending(i);
  };

  const confirmDelete = async () => {
    if (!deletePending) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/initiatives/${deletePending.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: 'Initiative deleted', description: `"${deletePending.name}" removed.` });
      setDeletePending(null);
      await fetchAll();
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Compass}
        title="Initiatives"
        subtitle="Strategic threads the team owns. Drives the dashboard's Initiative Tracker."
        kicker="Operations · Strategy"
        kickerDot="violet"
        actions={(
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />New initiative
          </Button>
        )}
      />

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : (
        <Card className="border-cream-200 overflow-hidden">
          <div className="p-4 border-b border-cream-100 flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as Status | 'all')}>
              <SelectTrigger className="h-9 w-40 focus-brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="parked">Parked</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-xs text-ink-warm-500">{visible.length} shown · {initiatives.length} total</div>
          </div>
          {visible.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Compass}
                title={statusFilter === 'active' ? 'No active initiatives' : 'Nothing here'}
                description="Create your first one to start tracking."
              >
                <Button variant="brand" size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />New initiative
                </Button>
              </EmptyState>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-cream-50/80 hover:bg-cream-50/80">
                  <TableHead className="h-9 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Name</TableHead>
                  <TableHead className="h-9 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Owner</TableHead>
                  <TableHead className="h-9 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Tags</TableHead>
                  <TableHead className="h-9 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Status</TableHead>
                  <TableHead className="h-9 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Freshness</TableHead>
                  <TableHead className="h-9 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(i => {
                  const owner = users.find(u => u.id === i.owner_user_id);
                  const stale = staleTone(i.updated_at);
                  return (
                    <TableRow key={i.id} className="border-cream-100 row-accent cursor-pointer">
                      <TableCell className="py-3 font-medium text-ink-warm-900">{i.name}</TableCell>
                      <TableCell className="py-3 text-sm text-ink-warm-700">
                        {owner?.name ?? <span className="text-ink-warm-400">—</span>}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-ink-warm-700">
                        {i.category_tags?.length > 0
                          ? i.category_tags.map(t => (
                              <span key={t} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-gray-100 text-ink-warm-700">{t}</span>
                            ))
                          : <span className="text-ink-warm-400">—</span>}
                      </TableCell>
                      <TableCell className="py-3">
                        <StatusBadge tone={statusTone[i.status]} size="sm" bordered withDot>{i.status}</StatusBadge>
                      </TableCell>
                      <TableCell className="py-3">
                        <StatusBadge tone={stale.tone} size="sm" bordered withDot={stale.tone === 'danger' ? 'pulse' : true}>{stale.label}</StatusBadge>
                      </TableCell>
                      {/* Canonical row-action menu (2026-06-03): single
                          ⋯ trigger in the last column opening a
                          DropdownMenu align="end". Replaces the inline
                          Edit + Delete buttons. Matches /crm/contacts,
                          /crm/network, /links, /admin/field-options. */}
                      <TableCell className="py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Initiative actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => openEdit(i)}>
                              <Edit className="h-3.5 w-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(i)} className="text-rose-600 focus:text-rose-600">
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit initiative' : 'New initiative'}</DialogTitle>
            <DialogDescription>
              Initiatives drive the dashboard's Initiative Tracker card. Stale-detection thresholds (amber 14d, red 30d) come from <span className="font-mono text-xs">dashboard_config</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ini-name">Name <RequiredAsterisk /></Label>
              <Input id="ini-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="focus-brand" placeholder="e.g. Korean exchange listings push" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ini-owner">Owner</Label>
              <Select value={form.owner_user_id || '_none'} onValueChange={v => setForm({ ...form, owner_user_id: v === '_none' ? '' : v })}>
                <SelectTrigger className="focus-brand"><SelectValue placeholder="Select owner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Unassigned</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ini-status">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as Status })}>
                <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="parked">Parked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ini-tags">Tags <span className="text-xs text-ink-warm-500">(comma-separated)</span></Label>
              <Input id="ini-tags" value={form.category_tags} onChange={e => setForm({ ...form, category_tags: e.target.value })} className="focus-brand" placeholder="growth, partnerships, content" />
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="brand" onClick={handleSubmit} disabled={!form.name.trim() || submitting}>
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create initiative'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete initiative confirm — v11 destructive Dialog replacing
          the native confirm() that used to live in handleDelete.
          Soft-deletes — linked tasks are unaffected. 2026-06-05. */}
      <Dialog open={!!deletePending} onOpenChange={(open) => { if (!open) setDeletePending(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete Initiative?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              <strong>{deletePending?.name ?? ''}</strong> will be soft-deleted. Linked tasks are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeletePending(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
