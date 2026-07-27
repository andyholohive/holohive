'use client';

/**
 * KOL Brief Delivery — Briefs & Delivery console (spec v2 §7).
 *
 * Renders under the Lineups tab on a CONFIRMED week, one scroll below the
 * lineup summary. QC gate: before approval it shows a generate-links prompt;
 * on approval it mints per-KOL tokens and reveals the delivery rows. Per angle,
 * the manager sets the published brief page and writes one
 * {{handle}}/{{link}} message; per KOL, Copy fills it +
 * the per-KOL link, copies to clipboard, and stamps sent_at. Copied/opened
 * chips + header counts read from the token store.
 *
 * The chips say "Copied", not "Sent": the stamp fires on the copy click,
 * before the manager has pasted anything, and HHP never messages a KOL itself
 * (spec §5/§11 — copy-to-clipboard for v1, the bot never messages KOLs). The
 * column keeps the name sent_at so the Friday un-opened nudge and the lineup
 * lifecycle stage are untouched.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KolBriefService, type BriefConsole } from '@/lib/kolBriefService';
import type { LineupBriefStats } from '@/lib/lineupManagerService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { Send, Copy, Check, ExternalLink, Eye, Sparkles } from 'lucide-react';

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
  onDeliveryChange,
}: {
  lineupId: string;
  campaignId: string;
  currentUserId: string | null;
  /**
   * Fired after every console load with the lineup's mint/sent counts so the
   * parent Lineups tab can advance the extended lifecycle badge (Brief
   * preview → Approved → Delivered) live, without refetching.
   */
  onDeliveryChange?: (lineupId: string, stats: LineupBriefStats) => void;
}) {
  const { toast } = useToast();
  const service = useMemo(() => new KolBriefService(supabase as any), []);
  // Ref'd so the load callback doesn't re-create (and re-fire the initial
  // fetch) when the parent passes a fresh closure each render.
  const onDeliveryChangeRef = useRef(onDeliveryChange);
  onDeliveryChangeRef.current = onDeliveryChange;
  const [data, setData] = useState<BriefConsole | null>(null);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [msgDraft, setMsgDraft] = useState<Record<number, string>>({});
  const [refDraft, setRefDraft] = useState<Record<number, string>>({});
  const [savingRef, setSavingRef] = useState<number | null>(null);
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
      setRefDraft(Object.fromEntries(console.angles.map(a => [a.angle_no, a.page_ref ?? ''])));
      // Report mint/sent counts up so the lifecycle badge advances live.
      const kolRows = console.angles.flatMap(a => a.kols);
      onDeliveryChangeRef.current?.(lineupId, {
        minted: kolRows.filter(k => k.token).length,
        sent: kolRows.filter(k => k.sent_at).length,
      });
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
      const { minted, revived } = await service.mintTokensForLineup(lineupId, currentUserId ?? undefined);
      const parts = [`${minted} per-KOL link${minted === 1 ? '' : 's'} minted`];
      if (revived > 0) parts.push(`${revived} expired link${revived === 1 ? '' : 's'} given a fresh expiry`);
      toast({ title: 'Brief links generated', description: `${parts.join(' · ')}.` });
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

  const handleSavePageRef = async (angleNo: number) => {
    setSavingRef(angleNo);
    try {
      const updated = await service.setAnglePageRef(lineupId, angleNo, refDraft[angleNo] ?? '');
      if (updated === 0) {
        // The links have to exist before there is anything to point at.
        toast({
          title: 'No links to update',
          description: `Angle ${angleNo} has no minted tokens yet — approve the week first.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: (refDraft[angleNo] ?? '').trim() ? 'Brief page set' : 'Brief page cleared',
          description: `${updated} link${updated === 1 ? '' : 's'} on angle ${angleNo}.`,
        });
      }
      await load();
    } catch (err) {
      toast({
        title: 'Could not save the page',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSavingRef(null);
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
            <span className="inline-flex items-center gap-1"><Copy className="h-3 w-3" />{data.sentCount}/{data.totalCount} copied</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{data.openedCount}/{data.totalCount} opened</span>
            {data.expiresAt && (
              // An already-past expiry is the difference between "these links
              // work" and "every KOL sees an expired page", so it says so
              // instead of printing a date and leaving you to check the
              // calendar.
              new Date(data.expiresAt) < new Date()
                ? (
                  <>
                    <span className="text-rose-600 font-medium">· expired {formatDate(data.expiresAt)}</span>
                    {/* The Approve action only exists in the pre-mint gate, so
                        without this an expired week is unrecoverable from the
                        UI — the very state this button is here to escape. */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] border-rose-300 text-rose-600 hover:bg-rose-50"
                      disabled={minting}
                      onClick={handleApprove}
                    >
                      {minting ? 'Refreshing…' : 'Refresh expiry'}
                    </Button>
                  </>
                )
                : <span>· expires {formatDate(data.expiresAt)}</span>
            )}
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
            rows. HHP never messages a KOL — you copy each message and paste it
            into their chat yourself.
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

              {/* Published brief page for the angle. Sits above the message
                  box because a link is worth nothing until it points at a
                  page — a manager who fills the message first has written a
                  covering note for an empty envelope. */}
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={refDraft[angle.angle_no] ?? ''}
                    onChange={(e) => setRefDraft(d => ({ ...d, [angle.angle_no]: e.target.value }))}
                    placeholder="https://…  brief page for this angle"
                    className="h-8 focus-brand text-xs flex-1"
                  />
                  {angle.page_ref && (
                    <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="Open the published page">
                      <a href={angle.page_ref} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={savingRef === angle.angle_no}
                    onClick={() => handleSavePageRef(angle.angle_no)}
                  >
                    {savingRef === angle.angle_no ? 'Saving…' : 'Save page'}
                  </Button>
                </div>
                <p className="text-[10px] text-ink-warm-400 mt-1">
                  {angle.page_ref
                    ? 'Live — every KOL on this angle sees this page.'
                    : 'Not set — these links show "your brief is being prepared". Paste the published page, or leave it for the generator.'}
                </p>
              </div>

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
                        {/* "Copied", not "Sent" — the stamp fires on the copy
                            click, before anything is pasted. HHP never sends;
                            the manager does, by hand, in the KOL's chat. The
                            column stays sent_at so the Friday nudge and the
                            lifecycle stage keep working unchanged. */}
                        {kol.sent_at ? 'Copied' : 'Not copied'}
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
