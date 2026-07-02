'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { Send, AlertCircle } from 'lucide-react';

/**
 * SendAnnouncementDialog — bulk-message the selected KOLs' group chats.
 *
 * Recipients arrive as MasterKOL rows. We split them into:
 *   - reachable: kol has a linked group chat (chatId map hit)
 *   - unreachable: no linked chat, will be skipped server-side
 *
 * The composer supports Markdown + a {name} placeholder. First-recipient
 * preview renders the substituted body so the sender can eyeball what
 * a real KOL sees before firing.
 */

type Recipient = { id: string; name: string; hasGc: boolean };

export function SendAnnouncementDialog({
  open,
  onOpenChange,
  recipients,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recipients: Recipient[];
}) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const reachable = useMemo(() => recipients.filter(r => r.hasGc), [recipients]);
  const unreachable = useMemo(() => recipients.filter(r => !r.hasGc), [recipients]);
  const firstRecipientName = reachable[0]?.name ?? 'KOL';
  const previewText = text.replace(/\{name\}/gi, firstRecipientName);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: 'Message required', variant: 'destructive' });
      return;
    }
    if (reachable.length === 0) {
      toast({ title: 'No recipients', description: 'None of the selected KOLs have a linked group chat.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/kols/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, kolIds: reachable.map(r => r.id) }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const { okCount, failedCount, failures } = data as {
        okCount: number; failedCount: number;
        failures: Array<{ kol_name: string; error: string }>;
      };
      const desc = failedCount > 0
        ? `${okCount} sent · ${failedCount} failed. Failures: ${failures.slice(0, 3).map(f => f.kol_name).join(', ')}${failures.length > 3 ? '…' : ''}`
        : `${okCount} sent`;
      toast({ title: failedCount > 0 ? 'Announcement partially sent' : 'Announcement sent', description: desc });
      if (failedCount === 0) {
        setText('');
        onOpenChange(false);
      }
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
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-brand" />
            Send Announcement
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4 py-2">
          {/* Recipient roll-up. Reachable count is the green truth;
              unreachable rows are shown as a warning chip so the sender
              can either follow up manually or add the chat. */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge tone="brand">
              {reachable.length} recipient{reachable.length === 1 ? '' : 's'} with GC
            </StatusBadge>
            {unreachable.length > 0 && (
              <StatusBadge tone="warning">
                {unreachable.length} without GC · will be skipped
              </StatusBadge>
            )}
          </div>
          {unreachable.length > 0 && (
            <div className="text-[11px] text-ink-warm-500 -mt-2">
              Skipped: {unreachable.slice(0, 8).map(r => r.name).join(', ')}
              {unreachable.length > 8 ? `, +${unreachable.length - 8} more` : ''}
            </div>
          )}

          <div>
            <Label>Message <span className="text-[11px] text-ink-warm-500">(Markdown supported · use {'{name}'} for KOL name)</span></Label>
            <Textarea
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
                className="text-[11px] text-brand hover:text-brand-dark"
              >
                {showPreview ? 'Hide preview' : `Preview as ${firstRecipientName}`}
              </button>
              <span className="text-[11px] text-ink-warm-500 tabular-nums">{text.length} / 4000</span>
            </div>
          </div>

          {showPreview && text.trim() && (
            <div className="rounded-md border border-cream-200 bg-cream-50/60 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-warm-500 mb-1">Preview for {firstRecipientName}</div>
              <pre className="text-sm text-ink-warm-800 whitespace-pre-wrap font-sans">{previewText}</pre>
            </div>
          )}

          {reachable.length === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <AlertTriangleIcon />
              <div className="text-xs text-amber-900">
                None of the selected KOLs have a linked group chat. Link a chat via <code className="bg-amber-100 px-1 rounded">/wallet</code> or add it via /crm/telegram → KOLs, then try again.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button
            variant="brand"
            onClick={handleSend}
            disabled={sending || !text.trim() || reachable.length === 0}
          >
            {sending ? `Sending 1 / 1.1s…` : `Send to ${reachable.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertTriangleIcon() {
  return <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />;
}
