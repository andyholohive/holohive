'use client';

/**
 * BacklogItemDialog — quick-add modal + edit detail surface.
 *
 * One component handles both modes because the field set is the same;
 * `state = 'new'` shows the create flow, `state = BacklogItem` shows
 * the edit flow with attachment list + transition controls.
 *
 * Attachment input supports three paths so screenshots land fast:
 *   1. Paste-from-clipboard (paste a screenshot directly into the
 *      textarea — Cmd+V on a screenshot copy)
 *   2. Drag-and-drop onto the drop zone
 *   3. File picker via the button
 * Per the spec section 4.2: "The modal must support paste-from-
 * clipboard and drag-drop for images, not just a file picker."
 */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/dateFormat';
import {
  Upload, X, Paperclip, ExternalLink, FileText, Bug,
} from 'lucide-react';
import {
  BacklogService,
  BACKLOG_AREA_LABELS,
  BACKLOG_TYPE_LABELS,
  BACKLOG_STATUS_LABELS,
  type BacklogArea,
  type BacklogAttachment,
  type BacklogItem,
  type BacklogStatus,
  type BacklogType,
  getValidTransitions,
} from '@/lib/backlogService';

type DialogState = null | 'new' | BacklogItem;

type UserRow = { id: string; name: string };

export default function BacklogItemDialog({
  state,
  onClose,
  onSaved,
}: {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const isOpen = state !== null;
  const isEdit = state !== null && state !== 'new';
  const item = isEdit ? (state as BacklogItem) : null;

  const [users, setUsers] = useState<UserRow[]>([]);

  // Form state — reset whenever the dialog opens.
  const [form, setForm] = useState({
    type: 'bug' as BacklogType,
    area: 'other' as BacklogArea,
    title: '',
    description: '',
    reference_url: '',
    assignee_id: '' as string,
  });
  const [submitting, setSubmitting] = useState(false);

  // Attachments. Two buckets:
  //   • `pendingFiles` — selected client-side, not uploaded yet.
  //     For new items we batch-upload after the row is inserted;
  //     for edits we upload immediately and rely on the dialog's
  //     attachment list re-render.
  //   • `attachments` — already-persisted rows, with their signed URLs.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<BacklogAttachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Inline two-state delete confirm for attachments — same pattern as
  // /clients action items. Cleaner than window.confirm() (which the
  // rest of the codebase has been actively removing) but lighter than
  // a full Dialog for a single-attachment removal.
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  // Reset on open. Edit mode pre-fills from the item; new mode clears.
  useEffect(() => {
    if (!isOpen) return;
    if (item) {
      setForm({
        type: item.type,
        area: item.area,
        title: item.title,
        description: item.description,
        reference_url: item.reference_url || '',
        assignee_id: item.assignee_id || '',
      });
      // Fetch attachments lazily so opening the dialog is fast.
      BacklogService.listAttachments(item.id).then(async rows => {
        setAttachments(rows);
        // Pre-resolve signed URLs in parallel so thumbnails render
        // immediately rather than each fetching on first paint.
        const urls = await Promise.all(rows.map(async r => {
          try {
            const u = await BacklogService.getAttachmentUrl(r.storage_path);
            return [r.id, u] as const;
          } catch {
            return [r.id, ''] as const;
          }
        }));
        setAttachmentUrls(Object.fromEntries(urls));
      }).catch(err => {
        toast({ title: 'Failed to load attachments', description: (err as Error).message, variant: 'destructive' });
      });
    } else {
      setForm({
        type: 'bug',
        area: 'other',
        title: '',
        description: '',
        reference_url: '',
        assignee_id: '',
      });
      setAttachments([]);
      setAttachmentUrls({});
    }
    setPendingFiles([]);
  }, [isOpen, item?.id]);

  // Load team members for the Assignee picker. Same gate as
  // /initiatives — active members only.
  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from('users')
      .select('id, name')
      .in('role', ['admin', 'super_admin', 'member'])
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setUsers(((data || []) as UserRow[]).map(u => ({ id: u.id, name: u.name })));
      });
  }, [isOpen]);

  // ─── Attachment input handlers ────────────────────────────────────
  // All three paths (picker, drag-drop, paste) funnel into the same
  // `addFiles` function so the validation + state logic lives once.

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    // Filter to allowed types — matches the storage bucket policy.
    const allowed = arr.filter(f =>
      /^image\//.test(f.type) || f.type === 'application/pdf' || /^video\//.test(f.type)
    );
    const rejected = arr.length - allowed.length;
    if (rejected > 0) {
      toast({
        title: 'Some files skipped',
        description: `${rejected} file${rejected === 1 ? '' : 's'} rejected — only images, PDFs, and videos allowed.`,
        variant: 'destructive',
      });
    }
    if (allowed.length === 0) return;

    if (item) {
      // Edit mode: upload immediately so the attachment list updates.
      uploadImmediately(allowed);
    } else {
      // New mode: queue for batch-upload after the item is created.
      setPendingFiles(prev => [...prev, ...allowed]);
    }
  };

  const uploadImmediately = async (files: File[]) => {
    if (!item || !userProfile) return;
    setUploadingAttachment(true);
    try {
      for (const f of files) {
        const row = await BacklogService.uploadAttachment(item.id, f, userProfile.id);
        const url = await BacklogService.getAttachmentUrl(row.storage_path);
        setAttachments(prev => [...prev, row]);
        setAttachmentUrls(prev => ({ ...prev, [row.id]: url }));
      }
      await onSaved(); // bump the parent's attachment-count map
    } catch (err) {
      toast({ title: 'Upload failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const deleteAttachment = async (att: BacklogAttachment) => {
    try {
      await BacklogService.deleteAttachment(att.id, att.storage_path);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
      setAttachmentUrls(prev => {
        const next = { ...prev };
        delete next[att.id];
        return next;
      });
      setDeletingAttachmentId(null);
      await onSaved();
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  // ─── Submit ───────────────────────────────────────────────────────

  const canSave = !!form.title.trim() && !!form.description.trim() && !!userProfile;

  const handleSubmit = async () => {
    if (!canSave || !userProfile) return;
    setSubmitting(true);
    try {
      if (item) {
        await BacklogService.update(item.id, {
          type: form.type,
          area: form.area,
          title: form.title,
          description: form.description,
          reference_url: form.reference_url || null,
          assignee_id: form.assignee_id || null,
        });
        toast({ title: 'Saved', description: form.title });
      } else {
        const created = await BacklogService.create({
          type: form.type,
          area: form.area,
          title: form.title,
          description: form.description,
          reference_url: form.reference_url || null,
          reporter_id: userProfile.id,
          assignee_id: form.assignee_id || null,
        });
        // Upload queued attachments now that we have an id.
        if (pendingFiles.length > 0) {
          for (const f of pendingFiles) {
            await BacklogService.uploadAttachment(created.id, f, userProfile.id);
          }
        }
        toast({ title: 'Item created', description: created.title });
      }
      await onSaved();
      onClose();
    } catch (err) {
      toast({
        title: 'Save failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Quick status transition from inside the edit dialog. Same gating
  // as the row menu — invalid moves get rejected by the service.
  // Phase 4: ready_for_review transitions fire the reporter-verify
  // notification + Telegram DM. Fire-and-forget so the dialog closes
  // immediately and doesn't wait on Telegram's round-trip.
  const transition = async (next: BacklogStatus) => {
    if (!item || !userProfile) return;
    try {
      await BacklogService.transitionStatus(item.id, next, {
        id: userProfile.id,
        role: userProfile.role ?? null,
      });
      toast({ title: `Moved to ${BACKLOG_STATUS_LABELS[next]}` });
      if (next === 'ready_for_review') {
        fetch('/api/backlog/notify-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: item.id }),
        }).catch(err => {
          console.error('Notify-verify failed:', err);
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'Transition failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  if (!isOpen) return null;

  const transitions = item ? getValidTransitions(item.status) : { forward: [], backward: [] };
  const canMoveLive = item?.status === 'ready_for_review' && (
    userProfile?.id === item.reporter_id || userProfile?.role === 'super_admin'
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-brand" />
            {item ? 'Edit backlog item' : 'New backlog item'}
          </DialogTitle>
          <DialogDescription>
            {item
              ? `Reported ${formatDate(item.created_at)} · ${BACKLOG_STATUS_LABELS[item.status]}`
              : 'Bug or feature request. Attachments help — paste screenshots directly.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4">
          {/* Type + Area row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type <RequiredAsterisk /></Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as BacklogType })}>
                <SelectTrigger className="focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">{BACKLOG_TYPE_LABELS.bug}</SelectItem>
                  <SelectItem value="request">{BACKLOG_TYPE_LABELS.request}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Area <RequiredAsterisk /></Label>
              <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v as BacklogArea })}>
                <SelectTrigger className="focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BACKLOG_AREA_LABELS) as BacklogArea[]).map(a => (
                    <SelectItem key={a} value={a}>{BACKLOG_AREA_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Title */}
          <div className="grid gap-1.5">
            <Label htmlFor="bl-title">Title <RequiredAsterisk /></Label>
            <Input
              id="bl-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="One-line summary"
              className="focus-brand"
            />
          </div>

          {/* Description with paste-from-clipboard */}
          <div className="grid gap-1.5">
            <Label htmlFor="bl-desc">
              Description <RequiredAsterisk />
              <span className="ml-2 text-[10px] text-ink-warm-500 font-normal">Cmd+V a screenshot to attach it</span>
            </Label>
            <Textarea
              id="bl-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              onPaste={onPaste}
              placeholder="What's wrong or what's wanted? Reproduction steps, expected vs actual, etc."
              className="focus-brand min-h-[120px]"
              rows={5}
            />
          </div>

          {/* Reference link */}
          <div className="grid gap-1.5">
            <Label htmlFor="bl-ref">Reference link</Label>
            <Input
              id="bl-ref"
              value={form.reference_url}
              onChange={(e) => setForm({ ...form, reference_url: e.target.value })}
              placeholder="https://... (TG message link, doc, etc.)"
              className="focus-brand"
            />
          </div>

          {/* Assignee */}
          <div className="grid gap-1.5">
            <Label>Assignee</Label>
            <Select
              value={form.assignee_id || '_none'}
              onValueChange={(v) => setForm({ ...form, assignee_id: v === '_none' ? '' : v })}
            >
              <SelectTrigger className="focus-brand">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ─── Attachments ───────────────────────────────────────
              Drag-drop zone + file picker + thumbnail strip below.
              The zone listens for `dragenter` / `dragleave` to give
              users feedback when they're holding a file over it. */}
          <div className="grid gap-1.5">
            <Label>Attachments</Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`rounded-md border-2 border-dashed p-4 text-center text-xs transition-colors ${
                isDragging ? 'border-brand bg-brand/5' : 'border-cream-300 bg-cream-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,video/*"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = ''; // allow re-picking same file
                }}
                className="hidden"
              />
              <Upload className="h-5 w-5 mx-auto text-ink-warm-400 mb-1" />
              <p className="text-ink-warm-700">
                Drop files here, paste from clipboard, or{' '}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-brand hover:text-brand-dark underline"
                >
                  browse
                </button>
              </p>
              <p className="text-[10px] text-ink-warm-400 mt-1">Images, PDFs, videos · up to 10MB each</p>
            </div>

            {/* Already-saved attachments — only in edit mode */}
            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map(att => {
                  const url = attachmentUrls[att.id];
                  const isImage = att.content_type?.startsWith('image/');
                  const isConfirming = deletingAttachmentId === att.id;
                  return (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 p-2 bg-white border border-cream-200 rounded-md"
                    >
                      {isConfirming ? (
                        // Inline two-state confirm strip — matches the
                        // /clients action-item delete pattern.
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-xs text-ink-warm-700 flex-1">Delete this attachment?</span>
                          {/* [2026-07-10] type="button" required — inside the
                              dialog <form> the default is "submit", so the
                              click was saving the form (refresh) instead of
                              deleting the attachment. */}
                          <Button type="button" size="sm" variant="destructive" className="h-7 text-xs" onClick={() => deleteAttachment(att)}>
                            Delete
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDeletingAttachmentId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          {isImage && url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt="" className="h-10 w-10 object-cover rounded border border-cream-100" />
                          ) : (
                            <div className="h-10 w-10 rounded bg-cream-100 flex items-center justify-center">
                              <FileText className="h-4 w-4 text-ink-warm-500" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-ink-warm-900 truncate">
                              {att.storage_path.split('/').pop()}
                            </div>
                            <div className="text-[10px] text-ink-warm-500">
                              {att.size_bytes != null ? `${Math.round(att.size_bytes / 1024)} KB` : '—'} · {formatDate(att.uploaded_at)}
                            </div>
                          </div>
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:text-brand-dark"
                              title="Open in new tab"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeletingAttachmentId(att.id)}
                            className="text-ink-warm-400 hover:text-rose-600"
                            title="Delete attachment"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pending uploads — only in new mode (queued for batch
                upload on submit) */}
            {pendingFiles.length > 0 && (
              <div className="space-y-1">
                {pendingFiles.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-ink-warm-700 bg-white border border-cream-200 rounded-md p-2">
                    <Paperclip className="h-3 w-3 text-ink-warm-400" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-ink-warm-500">{Math.round(f.size / 1024)} KB</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      className="text-ink-warm-400 hover:text-rose-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploadingAttachment && (
              <p className="text-[10px] text-ink-warm-500 italic">Uploading…</p>
            )}
          </div>

          {/* Status transitions — only in edit mode. Renders the same
              affordances as the row menu. */}
          {item && (transitions.forward.length > 0 || transitions.backward.length > 0) && (
            <div className="border-t border-cream-100 pt-3">
              <Label className="text-xs uppercase tracking-wider text-ink-warm-500">Status transitions</Label>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {transitions.forward.map(next => {
                  if (next === 'live' && !canMoveLive) return null;
                  return (
                    <Button
                      key={`fwd-${next}`}
                      size="sm"
                      variant="brand"
                      className="text-xs h-8"
                      onClick={() => transition(next)}
                    >
                      Move to {BACKLOG_STATUS_LABELS[next]}
                    </Button>
                  );
                })}
                {transitions.backward.map(prev => (
                  <Button
                    key={`back-${prev}`}
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    onClick={() => transition(prev)}
                  >
                    Back to {BACKLOG_STATUS_LABELS[prev]}
                  </Button>
                ))}
              </div>
              {item.status === 'ready_for_review' && !canMoveLive && (
                <p className="text-[10px] text-ink-warm-500 italic mt-2">
                  Only the reporter or a super-admin can mark this Live.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="brand" onClick={handleSubmit} disabled={!canSave || submitting}>
            {submitting ? 'Saving…' : item ? 'Save changes' : 'Create item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
