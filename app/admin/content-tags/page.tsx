'use client';

/**
 * Admin Tag Manager — content_tags CRUD.
 *
 * Closes the loop on Section 7.5 of the HHP Campaign Dashboard Spec.
 * The public campaign page already renders client-facing tag badges
 * (when assignments exist); this page lets the team manage the
 * tag library — create / edit / archive — without dropping to SQL.
 *
 * Per-row tag assignment on the content table is a separate piece of
 * work — touches the 11k-line campaign admin page. Tagging via SQL
 * still works in the meantime; the smoke-test recipe in the spec PR
 * shows the pattern.
 *
 * Mounts as a tab on /admin (alongside Field Options + Claude MCP)
 * and is also directly addressable at /admin/content-tags.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Edit, Archive, Tag as TagIcon } from 'lucide-react';

type Visibility = 'client' | 'internal';

type ContentTag = {
  id: string;
  name: string;
  visibility: Visibility;
  color: string | null;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
  usage_count: number;
};

// Default palette — small set rather than a color picker so the
// resulting badge set stays visually coherent across campaigns.
const COLOR_PRESETS = [
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#ef4444', label: 'Rose' },
  { hex: '#64748b', label: 'Slate' },
  { hex: '#0ea5e9', label: 'Sky' },
  { hex: '#ec4899', label: 'Pink' },
] as const;

export default function ContentTagsPage() {
  const { toast } = useToast();
  const { userProfile } = useAuth();

  const [tags, setTags] = useState<ContentTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Edit / create dialog
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ContentTag | null>(null);
  const [form, setForm] = useState<{ name: string; visibility: Visibility; color: string }>(
    { name: '', visibility: 'client', color: COLOR_PRESETS[0].hex }
  );
  const [saving, setSaving] = useState(false);

  // Archive confirm
  const [archivePending, setArchivePending] = useState<ContentTag | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      // Pull tags + a per-tag usage count via a join on the
      // assignments table. Two-step rather than a single SQL view
      // because the assignments table is owned by the campaign page
      // and we don't want a coupled SQL view to migrate later.
      const [{ data: tagRows, error: tagErr }, { data: countRows }] = await Promise.all([
        (supabase as any)
          .from('content_tags')
          .select('id, name, visibility, color, created_by, created_at, archived_at')
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('content_tag_assignments')
          .select('tag_id'),
      ]);
      if (tagErr) throw tagErr;

      // Build a tag_id -> count map client-side.
      const usage = new Map<string, number>();
      for (const row of (countRows || []) as Array<{ tag_id: string }>) {
        usage.set(row.tag_id, (usage.get(row.tag_id) || 0) + 1);
      }
      const enriched = ((tagRows || []) as ContentTag[]).map(t => ({
        ...t,
        usage_count: usage.get(t.id) || 0,
      }));
      setTags(enriched);
    } catch (err) {
      toast({
        title: 'Failed to load tags',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // ── Dialog open helpers ─────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', visibility: 'client', color: COLOR_PRESETS[0].hex });
    setEditorOpen(true);
  };
  const openEdit = (tag: ContentTag) => {
    setEditing(tag);
    setForm({
      name: tag.name,
      visibility: tag.visibility,
      color: tag.color || COLOR_PRESETS[0].hex,
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from('content_tags')
          .update({
            name,
            visibility: form.visibility,
            color: form.color,
          })
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Tag updated', description: name });
      } else {
        const { error } = await (supabase as any)
          .from('content_tags')
          .insert({
            name,
            visibility: form.visibility,
            color: form.color,
            created_by: userProfile?.id ?? null,
          });
        if (error) throw error;
        toast({ title: 'Tag created', description: name });
      }
      setEditorOpen(false);
      await refresh();
    } catch (err) {
      toast({
        title: 'Save failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async (tag: ContentTag) => {
    // Toggle archived_at — no separate "unarchive" UI; same button
    // flips. Confirmation only required for the archive direction
    // because unarchiving is reversible.
    if (tag.archived_at) {
      const { error } = await (supabase as any)
        .from('content_tags')
        .update({ archived_at: null })
        .eq('id', tag.id);
      if (error) {
        toast({ title: 'Unarchive failed', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Tag restored', description: tag.name });
      await refresh();
      return;
    }
    setArchivePending(tag);
  };

  const confirmArchive = async () => {
    if (!archivePending) return;
    const { error } = await (supabase as any)
      .from('content_tags')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', archivePending.id);
    if (error) {
      toast({ title: 'Archive failed', description: error.message, variant: 'destructive' });
      setArchivePending(null);
      return;
    }
    toast({
      title: 'Tag archived',
      description: `${archivePending.name} won't appear in new pickers but existing badges still render.`,
    });
    setArchivePending(null);
    await refresh();
  };

  // ── Render ──────────────────────────────────────────────────────
  const visibleTags = tags.filter(t => showArchived || !t.archived_at);
  const clientTags = visibleTags.filter(t => t.visibility === 'client');
  const internalTags = visibleTags.filter(t => t.visibility === 'internal');

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-full max-w-md rounded-md" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar — toggle archived + create */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm text-ink-warm-500">
          {tags.filter(t => !t.archived_at).length} active · {tags.filter(t => t.archived_at).length} archived
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-8 text-xs text-ink-warm-500 hover:text-brand"
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
        <Button size="sm" variant="brand" className="h-8 text-xs" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New tag
        </Button>
      </div>

      {tags.length === 0 ? (
        <Card className="border-cream-200 overflow-hidden">
          <EmptyState
            icon={TagIcon}
            title="No tags yet"
            description="Create your first tag to start labeling campaign content."
          >
            <Button size="sm" variant="brand" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New tag
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Client-facing tags — rendered first because that's
              the visibility that matters most for client-page output. */}
          <TagListCard
            heading="Client-facing"
            description="Badges render on the public campaign page."
            tags={clientTags}
            onEdit={openEdit}
            onArchiveToggle={handleArchiveToggle}
          />
          <TagListCard
            heading="Internal"
            description="Visible only in HHP admin. Never leaks to clients."
            tags={internalTags}
            onEdit={openEdit}
            onArchiveToggle={handleArchiveToggle}
          />
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit tag' : 'New tag'}</DialogTitle>
            <DialogDescription>
              Visibility controls who sees the badge on the campaign page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tag-name">Name <RequiredAsterisk /></Label>
              <Input
                id="tag-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Complimentary"
                className="focus-brand"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Visibility <RequiredAsterisk /></Label>
              <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v as Visibility })}>
                <SelectTrigger className="focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client-facing — renders on the public page</SelectItem>
                  <SelectItem value="internal">Internal — admin only, never leaks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map(preset => {
                  const active = form.color === preset.hex;
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setForm({ ...form, color: preset.hex })}
                      className={`h-8 w-8 rounded-md border-2 transition ${active ? 'border-ink-warm-700 scale-110' : 'border-cream-200 hover:scale-105'}`}
                      style={{ backgroundColor: preset.hex }}
                      title={preset.label}
                    />
                  );
                })}
              </div>
              {/* Live preview matches the public-page badge shape */}
              <div className="mt-1">
                <span
                  className="inline-block px-2 py-1 rounded text-[11px] font-medium text-white"
                  style={{ backgroundColor: form.color }}
                >
                  {form.name || 'Preview'}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="brand" onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <Dialog open={!!archivePending} onOpenChange={(open) => { if (!open) setArchivePending(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Archive className="h-4 w-4 text-amber-500" />
              Archive tag?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              <strong>{archivePending?.name}</strong> will be hidden from new pickers, but existing badges on tagged content stay visible. You can restore it anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setArchivePending(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmArchive}>
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Subcomponent: visibility-grouped tag list ──────────────────────
function TagListCard({
  heading,
  description,
  tags,
  onEdit,
  onArchiveToggle,
}: {
  heading: string;
  description: string;
  tags: ContentTag[];
  onEdit: (t: ContentTag) => void;
  onArchiveToggle: (t: ContentTag) => void;
}) {
  return (
    <Card className="border-cream-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-cream-100 bg-cream-50/40">
        <p className="text-xs uppercase tracking-[0.18em] font-semibold text-ink-warm-700">{heading}</p>
        <p className="text-[11px] text-ink-warm-500 mt-0.5">{description}</p>
      </div>
      <CardContent className="p-0">
        {tags.length === 0 ? (
          <p className="text-sm text-ink-warm-500 italic px-4 py-6 text-center">
            None yet.
          </p>
        ) : (
          <ul className="divide-y divide-cream-100">
            {tags.map(t => (
              <li key={t.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-cream-50/40">
                <span
                  className="inline-block px-2 py-0.5 rounded text-[11px] font-medium text-white shrink-0"
                  style={{ backgroundColor: t.color || '#64748b' }}
                >
                  {t.name}
                </span>
                {t.archived_at && (
                  <StatusBadge tone="neutral" size="sm" bordered>Archived</StatusBadge>
                )}
                <span className="text-[11px] text-ink-warm-500 ml-auto tabular-nums">
                  {t.usage_count} use{t.usage_count === 1 ? '' : 's'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-ink-warm-400 hover:text-brand"
                  onClick={() => onEdit(t)}
                  title="Edit tag"
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 ${t.archived_at ? 'text-emerald-600 hover:text-emerald-700' : 'text-ink-warm-400 hover:text-rose-600'}`}
                  onClick={() => onArchiveToggle(t)}
                  title={t.archived_at ? 'Restore tag' : 'Archive tag'}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
