'use client';

/**
 * Edit a pending Korea listings digest before it reaches clients.
 *
 * [2026-09-14, Andy] The weekly report has had an edit path since August. The
 * digest did not — it carried an `edited_html` column and a helper that
 * prefers it, but nothing could write to either, so whatever the cron
 * generated was what a client got.
 *
 * The editor is plain text, never markup: `*bold*` is the only formatting that
 * survives, and everything else is escaped on save. See lib/krSignal/digestEdit
 * for why — a stray `<` in Telegram HTML fails at send time, long after the
 * person who typed it has moved on.
 *
 * Only digests still awaiting review appear here. Once one is sent, its copy is
 * the record of what a client received and editing it would quietly rewrite
 * history.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { CheckCircle, FileText } from 'lucide-react';
import { digestHtmlToText, unpairedBoldMarkers } from '@/lib/krSignal/digestEdit';

interface DigestRow {
  id: string;
  week_ending: string;
  digest_html: string;
  edited_html: string | null;
  preflight: any;
  review_message_id: number | null;
}

export function ListingDigestEditor() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DigestRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('kr_signal_listing_digests')
      .select('id, week_ending, digest_html, edited_html, preflight, review_message_id')
      .eq('status', 'pending_review')
      .order('week_ending', { ascending: false });
    if (error) {
      toast({ title: 'Could not load pending digests', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    const list = (data ?? []) as DigestRow[];
    setRows(list);
    setDrafts(Object.fromEntries(
      list.map(r => [r.id, digestHtmlToText(r.edited_html ?? r.digest_html)]),
    ));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function save(row: DigestRow) {
    const text = drafts[row.id] ?? '';
    setSaving(row.id);
    try {
      const res = await fetch(`/api/kr-signal/listing-digest/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');

      toast({
        title: 'Digest saved',
        // Whether the Telegram card kept up is worth saying out loud: if it did
        // not, someone could approve the previous copy from the chat.
        description: json.cardUpdated
          ? 'The review card in Telegram now shows this version.'
          : json.cardError
            ? `Saved, but the Telegram card did not update (${json.cardError}). Approve from here or re-post the card.`
            : 'No review card is posted for this digest yet.',
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  }

  if (rows === null) return <Skeleton className="h-64 rounded-lg" />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Nothing waiting for review"
        description="Listing digests appear here between being generated on Saturday and being approved or skipped."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map(row => {
        const text = drafts[row.id] ?? '';
        const unpaired = unpairedBoldMarkers(text);
        const reachable = (row.preflight ?? []).filter((p: any) => p.ok).length;
        const total = (row.preflight ?? []).length;
        const dirty = text !== digestHtmlToText(row.edited_html ?? row.digest_html);

        return (
          <Card key={row.id} className="border-cream-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-cream-100 flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-brand flex-shrink-0" />
              <span className="text-[13px] font-semibold text-ink-warm-900">
                Week ending {formatDate(row.week_ending)}
              </span>
              <StatusBadge tone={reachable === total && total > 0 ? 'success' : 'warning'} size="sm">
                goes to {reachable} of {total}
              </StatusBadge>
              {row.edited_html && <StatusBadge tone="brand" size="sm">edited</StatusBadge>}
              {!row.review_message_id && (
                <StatusBadge tone="warning" size="sm">no review card posted</StatusBadge>
              )}
            </div>

            <div className="p-4 flex flex-col gap-2">
              <Textarea
                value={text}
                onChange={e => setDrafts({ ...drafts, [row.id]: e.target.value })}
                rows={18}
                spellCheck={false}
                className="focus-brand font-mono text-[12px] leading-relaxed"
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[11.5px] text-ink-warm-400">
                  Plain text. Wrap a phrase in *asterisks* for bold — everything else is sent as
                  typed.
                  {unpaired > 0 && (
                    <b className="text-amber-700">
                      {' '}{unpaired} line{unpaired === 1 ? '' : 's'} have an unpaired *, which will
                      show as a literal asterisk.
                    </b>
                  )}
                </span>
                <Button
                  variant="brand"
                  size="sm"
                  disabled={!dirty || !text.trim() || saving === row.id}
                  onClick={() => save(row)}
                >
                  {saving === row.id ? 'Saving…' : 'Save digest'}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
