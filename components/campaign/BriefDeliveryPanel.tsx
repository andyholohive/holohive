'use client';

/**
 * KOL Brief Delivery — Briefs & Delivery console (spec v2 §7).
 *
 * Renders under the Lineups tab on a CONFIRMED week, one scroll below the
 * lineup summary. QC gate: before approval it shows a generate-links prompt;
 * on approval it mints per-KOL tokens and reveals the delivery rows. Per angle,
 * the manager writes one {{handle}}/{{link}} message; per KOL, Copy fills it +
 * the per-KOL link, copies to clipboard, and marks the KOL sent. Sent/opened
 * chips + header counts read from the token store.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KolBriefService, type BriefConsole } from '@/lib/kolBriefService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { Send, Copy, Check, ExternalLink, MailCheck, Eye, Sparkles } from 'lucide-react';

const DEFAULT_ANGLE_MESSAGE =
  'Hi {{handle}} — here is your brief for this week:\n{{link}}\n\nLet us know if you have any questions before posting.';

function fillMessage(tmpl: string, handle: string, link: string): string {
  return (tmpl || DEFAULT_ANGLE_MESSAGE)
    .replace(/\{\{\s*handle\s*\}\}/g, handle)
    .replace(/\{\{\s*link\s*\}\}/g, link);
}

export default function BriefDeliveryPanel({
  lineupId,
  campaignId,
  currentUserId,
}: {
  lineupId: string;
  campaignId: string;
  currentUserId: string | null;
}) {
  const { toast } = useToast();
  const service = useMemo(() => new KolBriefService(supabase as any), []);
  const [data, setData] = useState<BriefConsole | null>(null);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [msgDraft, setMsgDraft] = useState<Record<number, string>>({});
  const [copiedKol, setCopiedKol] = useState<string | null>(null);

  const briefUrl = useCallback(
    (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/public/brief/${token}`,
    [],
  );

  const load = useCallback(async () => {
    try {
      const console = await service.getConsoleData(lineupId);
      setData(console);
      setMsgDraft(Object.fromEntries(console.angles.map(a => [a.angle_no, a.message])));
    } catch (err) {
      toast({ title: 'Failed to load briefs', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [lineupId, service, toast]);

  useEffect(() => { void load(); }, [load]);

  const hasTokens = !!data && data.angles.some(a => a.kols.some(k => k.token));

  const handleApprove = async () => {
    setMinting(true);
    try {
      const { minted } = await service.mintTokensForLineup(lineupId, currentUserId ?? undefined);
      toast({ title: 'Brief links generated', description: `${minted} per-KOL link${minted === 1 ? '' : 's'} minted.` });
      await load();
    } catch (err) {
      toast({ title: 'Generate failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setMinting(false);
    }
  };

  const handleSaveMessage = async (angleNo: number) => {
    try {
      await service.upsertAngleMessage(lineupId, campaignId, angleNo, msgDraft[angleNo] ?? '', currentUserId ?? undefined);
      toast({ title: 'Message saved' });
      await load();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const handleCopy = async (angleNo: number, kol: BriefConsole['angles'][number]['kols'][number]) => {
    if (!kol.token) return;
    const filled = fillMessage(msgDraft[angleNo] ?? '', kol.handle ?? kol.name, briefUrl(kol.token));
    try {
      await navigator.clipboard.writeText(filled);
      // Find the token id to mark sent — reload carries it; mark by re-querying.
      const { data: tok } = await (supabase as any)
        .from('kol_brief_tokens').select('id').eq('token', kol.token).maybeSingle();
      if (tok?.id) await service.markSent(tok.id, currentUserId ?? undefined);
      setCopiedKol(kol.kol_id);
      setTimeout(() => setCopiedKol(c => (c === kol.kol_id ? null : c)), 1500);
      toast({ title: 'Copied — paste into the KOL chat', description: kol.name });
      await load();
    } catch (err) {
      toast({ title: 'Copy failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  if (loading) {
    return <Skeleton className="h-40 rounded-lg mt-4" />;
  }
  if (!data) return null;

  return (
    <div className="mt-6 border border-cream-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cream-200 flex items-center gap-2 flex-wrap">
        <Send className="h-3.5 w-3.5 text-brand" />
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-700">
          Briefs &amp; Delivery
        </p>
        {hasTokens && (
          <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-warm-600 tabular-nums">
            <span className="inline-flex items-center gap-1"><MailCheck className="h-3 w-3" />{data.sentCount}/{data.totalCount} sent</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{data.openedCount}/{data.totalCount} opened</span>
            {data.expiresAt && <span>· expires {formatDate(data.expiresAt)}</span>}
          </div>
        )}
      </div>

      {!hasTokens ? (
        /* QC gate — nothing reaches a KOL until approval mints the links. */
        <div className="p-6 text-center">
          <Sparkles className="h-6 w-6 text-brand mx-auto mb-2" />
          <p className="text-sm font-medium text-ink-warm-800">Generate per-KOL brief links</p>
          <p className="text-xs text-ink-warm-500 mt-1 max-w-md mx-auto">
            Approve this confirmed week to mint one unguessable link per KOL and reveal the delivery
            rows. Nothing is sent to a KOL until you copy it below.
          </p>
          <Button variant="brand" className="mt-3" onClick={handleApprove} disabled={minting}>
            <Sparkles className="h-4 w-4 mr-2" />
            {minting ? 'Generating…' : 'Approve & generate links'}
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-cream-100">
          {data.angles.map(angle => (
            <div key={angle.angle_no} className="p-4">
              <p className="text-xs font-semibold text-ink-warm-700 mb-2">
                Angle {angle.angle_no}
                {angle.angle_name ? <span className="text-ink-warm-400 font-normal"> · {angle.angle_name}</span> : null}
              </p>

              {/* By-angle message (one shared template, {{handle}} / {{link}}) */}
              <div className="mb-3">
                <Textarea
                  value={msgDraft[angle.angle_no] ?? ''}
                  onChange={(e) => setMsgDraft(d => ({ ...d, [angle.angle_no]: e.target.value }))}
                  placeholder={DEFAULT_ANGLE_MESSAGE}
                  rows={3}
                  className="focus-brand text-xs"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-ink-warm-400">
                    Tokens: <code>{'{{handle}}'}</code> <code>{'{{link}}'}</code>
                  </span>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => handleSaveMessage(angle.angle_no)}>
                    Save message
                  </Button>
                </div>
              </div>

              {/* Per-KOL delivery rows */}
              <div className="space-y-1">
                {angle.kols.map(kol => (
                  <div key={kol.kol_id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-cream-50">
                    <span className="text-xs font-medium text-ink-warm-800 min-w-0 truncate">{kol.name}</span>
                    {kol.handle && <span className="text-[10px] text-ink-warm-400 truncate">@{kol.handle}</span>}
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      <StatusBadge tone={kol.sent_at ? 'brand' : 'neutral'} size="sm">
                        {kol.sent_at ? 'Sent' : 'Not sent'}
                      </StatusBadge>
                      <StatusBadge tone={kol.opened_at ? 'success' : 'neutral'} size="sm">
                        {kol.opened_at ? `Opened${kol.open_count > 1 ? ` ×${kol.open_count}` : ''}` : 'Not opened'}
                      </StatusBadge>
                      {kol.token && (
                        <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0" title="Open the brief page">
                          <a href={briefUrl(kol.token)} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={!kol.token}
                        onClick={() => handleCopy(angle.angle_no, kol)}
                      >
                        {copiedKol === kol.kol_id
                          ? <><Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />Copied</>
                          : <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>}
                      </Button>
                    </div>
                  </div>
                ))}
                {angle.kols.length === 0 && (
                  <p className="text-[11px] text-ink-warm-400 px-2 py-1">No KOLs on this angle.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
