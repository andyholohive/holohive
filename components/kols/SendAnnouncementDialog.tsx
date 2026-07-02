'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { Send, Search, Users } from 'lucide-react';

/**
 * SendAnnouncementDialog — pick KOLs with linked GCs + write message + send.
 *
 * Standalone workflow (no pre-selection needed): the parent passes the
 * full KOL roster in, this dialog filters to reachable ones (those with
 * a linked group chat) and renders a searchable picker so the sender
 * can build the recipient set inline.
 *
 * Composer supports Markdown + a {name} placeholder. First-recipient
 * preview renders the substituted body so the sender can eyeball what
 * a real KOL sees before firing.
 */

type KolChoice = { id: string; name: string; hasGc: boolean };

/** Insertable per-recipient placeholders. Server substitutes at send. */
const VARIABLES: Array<{ token: string; description: string }> = [
  { token: '{name}', description: 'Replaced with each KOL\'s name at send time.' },
];

export function SendAnnouncementDialog({
  open,
  onOpenChange,
  allKols,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Full KOL roster. Dialog filters to hasGc = true internally. */
  allKols: KolChoice[];
}) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Insert a template token at the current cursor position (or at the end
   * if the textarea hasn't been focused yet). Restores focus + moves the
   * caret to just after the inserted token so successive inserts stack
   * naturally.
   */
  const insertAtCursor = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText(prev => prev + token);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    setText(next);
    // Restore caret + focus after the state flush.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  };

  // Reset picker state each time the dialog opens so a prior draft
  // doesn't linger between sessions.
  useEffect(() => {
    if (open) {
      setText('');
      setSearch('');
      setSelectedIds(new Set());
      setShowPreview(false);
    }
  }, [open]);

  const reachable = useMemo(
    () => allKols.filter(k => k.hasGc).sort((a, b) => a.name.localeCompare(b.name)),
    [allKols],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reachable;
    return reachable.filter(k => k.name.toLowerCase().includes(q));
  }, [reachable, search]);

  const selectedCount = selectedIds.size;
  const firstSelectedName = useMemo(() => {
    for (const k of reachable) if (selectedIds.has(k.id)) return k.name;
    return 'KOL';
  }, [reachable, selectedIds]);
  const previewText = text.replace(/\{name\}/gi, firstSelectedName);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const k of filtered) next.add(k.id);
      return next;
    });
  };

  const clearAll = () => setSelectedIds(new Set());

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: 'Message required', variant: 'destructive' });
      return;
    }
    if (selectedCount === 0) {
      toast({ title: 'Pick at least one recipient', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/kols/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, kolIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const { okCount, failedCount, failures } = data as {
        okCount: number; failedCount: number;
        failures: Array<{ kol_name: string; error: string }>;
      };
      const desc = failedCount > 0
        ? `${okCount} sent · ${failedCount} failed. Failures: ${failures.slice(0, 3).map(f => f.kol_name).join(', ')}${failures.length > 3 ? '…' : ''}`
        : `${okCount} sent`;
      toast({ title: failedCount > 0 ? 'Announcement partially sent' : 'Announcement sent', description: desc });
      if (failedCount === 0) onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Send failed', description: err?.message?.slice(0, 300), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!sending) onOpenChange(v); }}
    >
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-brand" />
            Send Announcement
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4 py-2">
          {/* Recipient picker — only KOLs with a linked GC show up.
              Chip shows how many are picked; search + Select All Visible
              stay in sync with the current filter. */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-ink-warm-500" />
                Recipients
                <StatusBadge tone={selectedCount > 0 ? 'brand' : 'neutral'} size="sm">
                  {selectedCount} / {reachable.length}
                </StatusBadge>
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={selectAllVisible}
                  disabled={filtered.length === 0}
                >
                  Select {search ? 'visible' : 'all'} ({filtered.length})
                </Button>
                {selectedCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-rose-600 hover:text-rose-700"
                    onClick={clearAll}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-warm-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search KOLs with GC…"
                className="h-9 pl-7 focus-brand"
              />
            </div>
            <div className="max-h-[220px] overflow-y-auto rounded-md border border-cream-200">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-ink-warm-500">
                  {reachable.length === 0
                    ? 'No KOLs have a linked group chat.'
                    : `No KOLs match "${search}".`}
                </div>
              ) : (
                <ul className="divide-y divide-cream-100">
                  {filtered.map(k => {
                    const checked = selectedIds.has(k.id);
                    return (
                      <li key={k.id}>
                        <label
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-cream-50 ${checked ? 'bg-brand-light/40' : ''}`}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggle(k.id)} />
                          <span className="text-sm text-ink-warm-900">{k.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div>
            <Label>Message <span className="text-[11px] text-ink-warm-500">(Markdown supported)</span></Label>
            {/* Variables toolbar — click a chip to insert the token at the
                cursor position. One-token list today; grows as we add more
                per-KOL variables (campaign name, wallet, tier, etc.). */}
            <div className="flex items-center gap-2 mb-1.5 mt-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.14em] text-ink-warm-500">Insert</span>
              {VARIABLES.map(v => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertAtCursor(v.token)}
                  className="text-[11px] px-2 py-0.5 rounded border border-cream-200 bg-cream-50 text-ink-warm-800 hover:bg-brand-light hover:border-brand hover:text-brand transition-colors font-mono"
                  title={v.description}
                >
                  {v.token}
                </button>
              ))}
            </div>
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"Hey {name},\n\nQuick heads-up on next week's content push — brief coming Monday.\n\n[HHP dashboard](https://app.holohive.io)"}
              rows={8}
              maxLength={4000}
              className="focus-brand font-mono text-sm"
            />
            <div className="flex items-center justify-between mt-1">
              <button
                type="button"
                onClick={() => setShowPreview(p => !p)}
                className="text-[11px] text-brand hover:text-brand-dark disabled:text-ink-warm-400"
                disabled={selectedCount === 0}
              >
                {showPreview ? 'Hide preview' : `Preview as ${firstSelectedName}`}
              </button>
              <span className="text-[11px] text-ink-warm-500 tabular-nums">{text.length} / 4000</span>
            </div>
          </div>

          {showPreview && text.trim() && (
            <div className="rounded-md border border-cream-200 bg-cream-50/60 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-warm-500 mb-1">Preview for {firstSelectedName}</div>
              <pre className="text-sm text-ink-warm-800 whitespace-pre-wrap font-sans">{previewText}</pre>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button
            variant="brand"
            onClick={handleSend}
            disabled={sending || !text.trim() || selectedCount === 0}
          >
            {sending ? 'Sending 1 / 1.1s…' : `Send to ${selectedCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
