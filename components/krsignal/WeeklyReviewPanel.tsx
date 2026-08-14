'use client';

/**
 * WeeklyReviewPanel — the in-app half of the weekly-report review gate.
 *
 * Sits at the top of the Korea Signal settings dialog because that is where
 * the Telegram "✏️ Edit" button deep-links to: the report body is a monospace
 * block whose column alignment carries meaning, and Telegram has no sane way
 * to hand back a multi-line edit of it.
 *
 * The operator edits a title line and a plain-text body — never HTML. The
 * server rebuilds `<b>title</b>\n<pre>body</pre>` from those two, so an edited
 * report is byte-identical in shape to a generated one and can't reach
 * Telegram as malformed markup. See lib/krSignal/reportEdit.ts.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { Loader2, Send, SkipForward, Save, AlertTriangle, ClipboardCheck } from 'lucide-react';

export interface ReviewItem {
  id: string;
  client_id: string;
  client_name: string | null;
  week_ending: string;
  status: 'pending_review' | 'approved';
  edited: boolean;
  preflight: { ok: boolean; error?: string; title?: string | null } | null;
  destination_chat_id: string | null;
  title: string;
  body: string;
}

export function WeeklyReviewPanel({
  krClientId,
  onSent,
}: {
  /** kr_signal_clients.id — null until the client has a saved config. */
  krClientId: string | null;
  /** Fires after a successful send/skip so the parent can refresh past reports. */
  onSent?: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Local edits, keyed by row id, so switching between two pending weeks
  // doesn't lose what was typed in the other.
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string }>>({});

  const load = useCallback(async () => {
    if (!krClientId) { setItems([]); setLoaded(true); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/kr-signal/review?clientId=${krClientId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load review queue');
      setItems(json.items ?? []);
    } catch (err: any) {
      toast({ title: 'Could not load pending reports', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [krClientId, toast]);

  useEffect(() => { setLoaded(false); setDrafts({}); load(); }, [load]);

  const draftFor = (item: ReviewItem) => drafts[item.id] ?? { title: item.title, body: item.body };
  const isDirty = (item: ReviewItem) => {
    const d = drafts[item.id];
    return !!d && (d.title !== item.title || d.body !== item.body);
  };

  async function act(item: ReviewItem, action: 'save' | 'send' | 'skip') {
    setBusy(`${item.id}:${action}`);
    try {
      const d = draftFor(item);
      const res = await fetch(`/api/kr-signal/review/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'skip' ? { action } : { action, title: d.title, body: d.body },
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');

      if (action === 'save') {
        toast({ title: 'Draft saved', description: 'Not sent — approve when you’re ready.' });
        await load();
        return;
      }
      toast({
        title: action === 'send' ? 'Report sent' : 'Week skipped',
        description: action === 'send'
          ? `Delivered to ${item.client_name ?? 'the client'}’s chat.`
          : 'Nothing goes to the client for this week.',
      });
      await load();
      onSent?.();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  // Nothing pending is the normal state — stay silent rather than occupy the
  // top of the dialog with an empty panel every other day of the week.
  if (!krClientId || (loaded && !loading && items.length === 0)) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink-warm-900">Pending review</h3>
        <StatusBadge tone="warning" size="sm">{loading ? '…' : items.length}</StatusBadge>
        <span className="text-[11px] text-ink-warm-500">Not sent until approved</span>
      </div>

      {loading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : items.map(item => {
        const d = draftFor(item);
        const sending = busy === `${item.id}:send`;
        const skipping = busy === `${item.id}:skip`;
        const saving = busy === `${item.id}:save`;
        const anyBusy = sending || skipping || saving;
        const blocked = item.preflight && !item.preflight.ok;

        return (
          <Card key={item.id} className="border-amber-200 bg-amber-50/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-semibold text-ink-warm-800">
                Week ending {formatDate(item.week_ending)}
                {item.edited && (
                  <span className="ml-2 font-normal text-ink-warm-500">· edited</span>
                )}
              </div>
              <StatusBadge tone={item.status === 'approved' ? 'success' : 'warning'} size="sm">
                {item.status === 'approved' ? 'Approved' : 'Awaiting approval'}
              </StatusBadge>
            </div>

            {/* Destination reachability, probed when the report was generated.
                This is the line that makes a broken chat visible BEFORE the
                send rather than as a silent weekly failure. */}
            {blocked ? (
              <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-rose-700 leading-snug">
                  <b>Destination unreachable</b> — {item.preflight?.error || 'no chat resolved'}.
                  Fix the Telegram destination below, then send.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-ink-warm-500">
                Sends to chat <code className="text-ink-warm-700">{item.destination_chat_id ?? '—'}</code>
                {item.preflight?.title ? ` · ${item.preflight.title}` : ''}
              </p>
            )}

            <div className="space-y-2">
              <div>
                <Label className="text-[11px] text-ink-warm-500">Title</Label>
                <Input
                  value={d.title}
                  onChange={e => setDrafts(p => ({ ...p, [item.id]: { ...d, title: e.target.value } }))}
                  className="h-9 focus-brand mt-1"
                  disabled={anyBusy}
                />
              </div>
              <div>
                <Label className="text-[11px] text-ink-warm-500">
                  Report body
                  <span className="ml-1.5 font-normal normal-case">
                    — plain text; sent as a monospace block, so keep the column spacing
                  </span>
                </Label>
                <Textarea
                  value={d.body}
                  onChange={e => setDrafts(p => ({ ...p, [item.id]: { ...d, body: e.target.value } }))}
                  className="focus-brand mt-1 font-mono text-[11px] leading-relaxed min-h-[220px]"
                  spellCheck={false}
                  disabled={anyBusy}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 flex-wrap">
              <Button
                variant="outline" size="sm"
                onClick={() => act(item, 'skip')}
                disabled={anyBusy}
                className="border-rose-300 text-rose-600 hover:bg-rose-50"
              >
                {skipping ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <SkipForward className="h-3.5 w-3.5 mr-1.5" />}
                Skip week
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => act(item, 'save')}
                disabled={anyBusy || !isDirty(item)}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Save draft
              </Button>
              <Button
                variant="brand" size="sm"
                onClick={() => act(item, 'send')}
                disabled={anyBusy}
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Approve &amp; send
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
