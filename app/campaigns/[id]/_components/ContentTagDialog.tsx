'use client';

/**
 * Content Tag Dialog — bulk tag assignment for a campaign's content.
 *
 * Standalone so we don't have to weave tag-picker UI into the
 * 1,500-line ContentDashboardTableView. Trade-off: one extra click
 * vs. inline. For the day-to-day "tag this Complimentary" / "set
 * Multi-Post 1 of 2" workflow it's plenty.
 *
 * Section 7.5 of HHP Campaign Dashboard Spec — admin assignment side
 * of the content tag system. The Tag Manager at /admin/content-tags
 * handles tag CRUD; this dialog handles per-row assignment.
 *
 * Features:
 *   • Lists all the campaign's content rows
 *   • Each row: title + current tag chips + a popover picker
 *   • Multi-select tags (active tags only — archived hidden)
 *   • Multi-Post sequence inputs when the Multi-Post tag is picked
 *   • Optimistic UI; per-row save is fire-and-forget
 *
 * Mounts from the "Tag Content" button next to Showcase / Share on
 * the campaign admin header.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tag as TagIcon, Plus, X, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

type ContentTag = {
  id: string;
  name: string;
  visibility: 'client' | 'internal';
  color: string | null;
};

type Assignment = {
  id: string;
  content_id: string;
  tag_id: string;
  sequence_n: number | null;
  sequence_of: number | null;
  multipost_group_id: string | null;
};

type ContentRow = {
  id: string;
  activation_date: string | null;
  content_link: string | null;
  platform: string | null;
  type: string | null;
  notes: string | null;
  kol_name: string | null;
};

export default function ContentTagDialog({
  open,
  onClose,
  campaignId,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
}) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<ContentTag[]>([]);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [search, setSearch] = useState('');

  // ─── Load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      (supabase as any)
        .from('content_tags')
        .select('id, name, visibility, color')
        .is('archived_at', null)
        .order('name'),
      (supabase as any)
        .from('contents')
        .select(`
          id, activation_date, content_link, platform, type, notes,
          campaign_kol:campaign_kols(master_kol:master_kols(name))
        `)
        .eq('campaign_id', campaignId)
        .order('activation_date', { ascending: false }),
      (supabase as any)
        .from('content_tag_assignments')
        .select('id, content_id, tag_id, sequence_n, sequence_of, multipost_group_id')
        .in('content_id', []), // placeholder; real fetch happens below
    ]).then(async ([tagsRes, contentsRes]) => {
      if (tagsRes.error) {
        toast({ title: 'Failed to load tags', description: tagsRes.error.message, variant: 'destructive' });
      } else {
        setTags((tagsRes.data || []) as ContentTag[]);
      }
      if (contentsRes.error) {
        toast({ title: 'Failed to load content', description: contentsRes.error.message, variant: 'destructive' });
      } else {
        const rows: ContentRow[] = ((contentsRes.data || []) as any[]).map(c => ({
          id: c.id,
          activation_date: c.activation_date,
          content_link: c.content_link,
          platform: c.platform,
          type: c.type,
          notes: c.notes,
          kol_name: c.campaign_kol?.master_kol?.name || null,
        }));
        setContents(rows);

        // Now fetch the assignment rows for these contents.
        if (rows.length > 0) {
          const { data: asgs, error: asgErr } = await (supabase as any)
            .from('content_tag_assignments')
            .select('id, content_id, tag_id, sequence_n, sequence_of, multipost_group_id')
            .in('content_id', rows.map(r => r.id));
          if (asgErr) {
            toast({ title: 'Failed to load tag assignments', description: asgErr.message, variant: 'destructive' });
          } else {
            setAssignments((asgs || []) as Assignment[]);
          }
        }
      }
      setLoading(false);
    });
  }, [open, campaignId, toast]);

  // ─── Helpers ─────────────────────────────────────────────────────
  const tagsById = useMemo(() => {
    const m = new Map<string, ContentTag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const assignmentsByContent = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const arr = m.get(a.content_id) || [];
      arr.push(a);
      m.set(a.content_id, arr);
    }
    return m;
  }, [assignments]);

  const filtered = useMemo(() => {
    if (!search.trim()) return contents;
    const s = search.trim().toLowerCase();
    return contents.filter(c =>
      (c.kol_name && c.kol_name.toLowerCase().includes(s))
      || (c.notes && c.notes.toLowerCase().includes(s))
      || (c.content_link && c.content_link.toLowerCase().includes(s))
    );
  }, [contents, search]);

  // ─── Mutate ──────────────────────────────────────────────────────
  const addTag = async (contentId: string, tagId: string) => {
    // Optimistic insert with a placeholder id so the UI updates
    // immediately. Replace with the real row when the DB returns.
    const tempId = `temp_${Date.now()}`;
    const tempAsg: Assignment = {
      id: tempId, content_id: contentId, tag_id: tagId,
      sequence_n: null, sequence_of: null, multipost_group_id: null,
    };
    setAssignments(prev => [...prev, tempAsg]);

    const { data, error } = await (supabase as any)
      .from('content_tag_assignments')
      .insert({ content_id: contentId, tag_id: tagId })
      .select('id, content_id, tag_id, sequence_n, sequence_of, multipost_group_id')
      .single();
    if (error) {
      setAssignments(prev => prev.filter(a => a.id !== tempId));
      toast({ title: 'Failed to add tag', description: error.message, variant: 'destructive' });
      return;
    }
    setAssignments(prev => prev.map(a => a.id === tempId ? (data as Assignment) : a));
  };

  const removeTag = async (assignmentId: string) => {
    const prev = assignments;
    setAssignments(p => p.filter(a => a.id !== assignmentId));
    const { error } = await (supabase as any)
      .from('content_tag_assignments')
      .delete()
      .eq('id', assignmentId);
    if (error) {
      setAssignments(prev); // restore
      toast({ title: 'Failed to remove tag', description: error.message, variant: 'destructive' });
    }
  };

  const updateMultipostSequence = async (
    assignmentId: string,
    sequence_n: number | null,
    sequence_of: number | null,
  ) => {
    setAssignments(prev => prev.map(a =>
      a.id === assignmentId ? { ...a, sequence_n, sequence_of } : a
    ));
    const { error } = await (supabase as any)
      .from('content_tag_assignments')
      .update({ sequence_n, sequence_of })
      .eq('id', assignmentId);
    if (error) {
      toast({ title: 'Failed to save sequence', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[760px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-brand" />
            Tag Campaign Content
          </DialogTitle>
          <DialogDescription>
            Apply tags to content rows. Client-facing badges render on the public page; internal tags stay in HHP only.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-1 pt-1">
          <Input
            placeholder="Search by KOL, notes, or link..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="focus-brand h-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-1 mt-2">
          {loading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-ink-warm-500 italic text-center py-12">
              {contents.length === 0 ? 'No content rows for this campaign yet.' : 'No rows match the search.'}
            </p>
          ) : (
            <ul className="divide-y divide-cream-100">
              {filtered.map(c => {
                const rowAsgs = assignmentsByContent.get(c.id) || [];
                return (
                  <li key={c.id} className="py-2 px-1 hover:bg-cream-50/40">
                    <div className="flex items-start gap-3">
                      {/* Content meta — left column */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-ink-warm-500">
                          {c.activation_date && <span>{c.activation_date}</span>}
                          {c.platform && <span>· {c.platform}</span>}
                          {c.type && <span>· {c.type}</span>}
                          {c.content_link && (
                            <a
                              href={c.content_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:text-brand/80"
                              title="Open content link"
                            >
                              <ExternalLink className="h-3 w-3 inline-block" />
                            </a>
                          )}
                        </div>
                        <p className="text-sm font-medium text-ink-warm-900 truncate">
                          {c.kol_name || 'Unknown KOL'}
                        </p>
                        {c.notes && (
                          <p className="text-[11px] text-ink-warm-500 line-clamp-1 mt-0.5" title={c.notes}>
                            {c.notes}
                          </p>
                        )}
                      </div>

                      {/* Tag chips + add picker — right column */}
                      <div className="shrink-0 flex flex-wrap items-center gap-1.5 max-w-[55%] justify-end">
                        {rowAsgs.map(a => {
                          const tag = tagsById.get(a.tag_id);
                          if (!tag) return null;
                          const isMultiPost = tag.name === 'Multi-Post';
                          const seqLabel = isMultiPost && a.sequence_n && a.sequence_of
                            ? `Post ${a.sequence_n} of ${a.sequence_of}`
                            : tag.name;
                          return (
                            <span
                              key={a.id}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                              style={{ backgroundColor: tag.color || '#64748b' }}
                            >
                              {seqLabel}
                              {isMultiPost && (
                                <span className="inline-flex items-center gap-0.5 ml-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="N"
                                    value={a.sequence_n ?? ''}
                                    onChange={(e) => {
                                      const v = e.target.value ? parseInt(e.target.value, 10) : null;
                                      updateMultipostSequence(a.id, v, a.sequence_of);
                                    }}
                                    className="!w-8 h-4 px-1 text-[10px] text-ink-warm-900 bg-white/90 border-none rounded"
                                    title="This post's position in the set"
                                  />
                                  <span>/</span>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="M"
                                    value={a.sequence_of ?? ''}
                                    onChange={(e) => {
                                      const v = e.target.value ? parseInt(e.target.value, 10) : null;
                                      updateMultipostSequence(a.id, a.sequence_n, v);
                                    }}
                                    className="!w-8 h-4 px-1 text-[10px] text-ink-warm-900 bg-white/90 border-none rounded"
                                    title="Total posts in the set"
                                  />
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeTag(a.id)}
                                className="hover:bg-white/20 rounded-full -mr-0.5"
                                title="Remove tag"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          );
                        })}

                        {/* Add tag popover — shows tags not already
                            assigned to this row. */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] text-ink-warm-500 hover:text-brand border border-dashed border-cream-300"
                            >
                              <Plus className="h-3 w-3 mr-0.5" />
                              Add
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-1 w-44" align="end">
                            <p className="text-[10px] uppercase tracking-wider text-ink-warm-500 px-2 py-1.5">Tags</p>
                            <ul className="space-y-0.5">
                              {tags
                                .filter(t => !rowAsgs.some(a => a.tag_id === t.id))
                                .map(t => (
                                  <li key={t.id}>
                                    <button
                                      type="button"
                                      onClick={() => addTag(c.id, t.id)}
                                      className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded hover:bg-cream-50"
                                    >
                                      <span
                                        className="h-2 w-2 rounded-full shrink-0"
                                        style={{ backgroundColor: t.color || '#64748b' }}
                                      />
                                      <span className="text-xs text-ink-warm-900 truncate">{t.name}</span>
                                      <Label className="ml-auto text-[9px] uppercase tracking-wider text-ink-warm-500">
                                        {t.visibility === 'client' ? 'Client' : 'Internal'}
                                      </Label>
                                    </button>
                                  </li>
                                ))}
                              {tags.filter(t => !rowAsgs.some(a => a.tag_id === t.id)).length === 0 && (
                                <li className="text-[10px] text-ink-warm-500 italic px-2 py-1">All tags already applied.</li>
                              )}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-2 flex-wrap gap-2">
          <span className="text-[11px] text-ink-warm-500 mr-auto">
            Tip: manage tags in <code className="bg-cream-100 px-1 rounded text-[10px]">/admin?tab=content-tags</code>.
          </span>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
