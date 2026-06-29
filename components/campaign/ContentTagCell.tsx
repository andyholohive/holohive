'use client';

/**
 * Per-row tag picker for the admin content table.
 *
 * Lives in `components/campaign/ContentTagCell.tsx` rather than inline
 * in ContentDashboardTableView because that file is already huge —
 * keeping this self-contained means future tag work doesn't grow it.
 *
 * Spec section 7.5 — the standalone ContentTagDialog handles bulk
 * tagging (search + filter across many rows); this cell handles the
 * inline "log content, tag it right there" daily workflow.
 *
 * Each cell:
 *   • Self-fetches its assignments on mount (small payload per row)
 *   • Receives the global active-tags list via the optional tags prop
 *     (one parent-level fetch beats N per-cell queries when present);
 *     falls back to a one-shot fetch if not provided.
 *   • Renders chips inline with a small "+ Add" popover for picking
 *     new tags. Multi-Post gets two N/M inputs for the sequence.
 *   • Mutates `content_tag_assignments` directly; optimistic UI.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { Plus, X } from 'lucide-react';

export type ContentTag = {
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

export default function ContentTagCell({
  contentId,
  tags: tagsProp,
}: {
  contentId: string;
  /** Pass the global tag list from the parent to skip a per-cell fetch.
   *  Optional — falls back to a one-shot self-fetch when missing. */
  tags?: ContentTag[];
}) {
  const { toast } = useToast();
  const [tags, setTags] = useState<ContentTag[]>(tagsProp || []);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch — assignments always, tags only if not provided.
  useEffect(() => {
    let alive = true;
    const fetchTags = tagsProp
      ? Promise.resolve({ data: tagsProp, error: null })
      : (supabase as any)
          .from('content_tags')
          .select('id, name, visibility, color')
          .is('archived_at', null)
          .order('name');
    Promise.all([
      fetchTags,
      (supabase as any)
        .from('content_tag_assignments')
        .select('id, content_id, tag_id, sequence_n, sequence_of, multipost_group_id')
        .eq('content_id', contentId),
    ]).then(([tagsRes, asgsRes]: any[]) => {
      if (!alive) return;
      if (tagsRes.error) {
        // Non-fatal — the picker just shows no options.
        console.warn('ContentTagCell: tag fetch failed', tagsRes.error);
      } else if (!tagsProp) {
        setTags((tagsRes.data || []) as ContentTag[]);
      }
      if (asgsRes.error) {
        console.warn('ContentTagCell: assignment fetch failed', asgsRes.error);
      } else {
        setAssignments((asgsRes.data || []) as Assignment[]);
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [contentId, tagsProp]);

  // Sync from parent prop if it changes after mount (e.g. parent
  // refreshes its tag list).
  useEffect(() => {
    if (tagsProp) setTags(tagsProp);
  }, [tagsProp]);

  const tagsById = useMemo(() => {
    const m = new Map<string, ContentTag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const availableForAdd = useMemo(
    () => tags.filter(t => !assignments.some(a => a.tag_id === t.id)),
    [tags, assignments],
  );

  // ── Mutations ────────────────────────────────────────────────────
  const addTag = async (tagId: string) => {
    const tempId = `temp_${Date.now()}`;
    const temp: Assignment = {
      id: tempId, content_id: contentId, tag_id: tagId,
      sequence_n: null, sequence_of: null, multipost_group_id: null,
    };
    setAssignments(prev => [...prev, temp]);
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
      setAssignments(prev);
      toast({ title: 'Failed to remove tag', description: error.message, variant: 'destructive' });
    }
  };

  const updateMultipost = async (
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

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return <div className="h-5 w-12 rounded bg-cream-100 animate-pulse" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {assignments.map(a => {
        const tag = tagsById.get(a.tag_id);
        if (!tag) return null;
        const isMultiPost = tag.name === 'Multi-Post';
        const label = isMultiPost && a.sequence_n && a.sequence_of
          ? `Post ${a.sequence_n} of ${a.sequence_of}`
          : tag.name;
        return (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap"
            style={{ backgroundColor: tag.color || '#64748b' }}
            // Show internal vs client at-a-glance via title
            title={`${tag.name} · ${tag.visibility === 'client' ? 'Client-facing' : 'Internal'}`}
          >
            {label}
            {isMultiPost && (
              <span className="inline-flex items-center gap-0.5">
                <Input
                  type="number"
                  min={1}
                  value={a.sequence_n ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? parseInt(e.target.value, 10) : null;
                    updateMultipost(a.id, v, a.sequence_of);
                  }}
                  className="!w-7 h-4 px-1 text-[10px] text-ink-warm-900 bg-white/90 border-none rounded"
                  placeholder="N"
                />
                <span>/</span>
                <Input
                  type="number"
                  min={1}
                  value={a.sequence_of ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? parseInt(e.target.value, 10) : null;
                    updateMultipost(a.id, a.sequence_n, v);
                  }}
                  className="!w-7 h-4 px-1 text-[10px] text-ink-warm-900 bg-white/90 border-none rounded"
                  placeholder="M"
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

      {availableForAdd.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-ink-warm-500 hover:text-brand border border-dashed border-cream-300"
            >
              <Plus className="h-3 w-3 mr-0.5" />
              Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-1 w-48" align="start">
            <p className="text-[10px] uppercase tracking-wider text-ink-warm-500 px-2 py-1.5">Add tag</p>
            <ul className="space-y-0.5">
              {availableForAdd.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => addTag(t.id)}
                    className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded hover:bg-cream-50"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.color || '#64748b' }}
                    />
                    <span className="text-xs text-ink-warm-900 truncate">{t.name}</span>
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-ink-warm-500">
                      {t.visibility === 'client' ? 'Client' : 'Internal'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/**
 * ClientFacingTagBadges — read-only render of just the `visibility==='client'`
 * tags assigned to a content row.
 *
 * Mirrors the public campaign page's Notes-cell badge treatment so the
 * team sees the same "this content is client-facing" signal on the
 * internal Content Dashboard. Public page renders identical markup at
 * `app/public/campaigns/[id]/page.tsx:3136`; the two must stay in
 * sync — if the tag color/label rules change there, change here.
 *
 * Self-fetches assignments per row (cheap — same shape ContentTagCell
 * already does). Takes the global active-tags list as a prop so a
 * parent that already loaded it doesn't pay the per-cell fetch.
 */
export function ClientFacingTagBadges({
  contentId,
  tags,
}: {
  contentId: string;
  tags: ContentTag[];
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    let alive = true;
    (supabase as any)
      .from('content_tag_assignments')
      .select('id, content_id, tag_id, sequence_n, sequence_of, multipost_group_id')
      .eq('content_id', contentId)
      .then(({ data }: any) => {
        if (alive) setAssignments((data || []) as Assignment[]);
      });
    return () => { alive = false; };
  }, [contentId]);

  const tagsById = useMemo(() => {
    const m = new Map<string, ContentTag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const clientAssignments = assignments
    .map((a) => ({ a, tag: tagsById.get(a.tag_id) }))
    .filter(({ tag }) => tag && tag.visibility === 'client');

  if (clientAssignments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      {clientAssignments.map(({ a, tag }) => {
        const isMultiPost = tag!.name === 'Multi-Post' && a.sequence_n && a.sequence_of;
        const label = isMultiPost
          ? `Post ${a.sequence_n} of ${a.sequence_of}`
          : tag!.name;
        return (
          <span
            key={a.id}
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
            style={{ backgroundColor: tag!.color || '#10b981' }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
