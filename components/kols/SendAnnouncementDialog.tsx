'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/dateFormat';
import { Send, Search, Users, History, ChevronRight, RotateCcw, Megaphone } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { formatHandle, bareHandle, collapseHandleToken } from '@/lib/telegramHandle';

/**
 * SendAnnouncementDialog — pick KOLs with linked GCs + write message + send.
 *
 * Standalone workflow (no pre-selection needed): the parent passes the
 * full KOL roster in, this dialog filters to reachable ones (those with
 * a linked group chat) and renders a searchable picker so the sender
 * can build the recipient set inline.
 *
 * Composer is PLAIN TEXT + a {name} placeholder [2026-07-30]. Markdown
 * was dropped after one underscore in "x.com/konnex_world" cost 48 failed
 * sends — Telegram rejected the entire message with "can't parse entities"
 * because the italic span it opened never closed.
 *
 * Because nothing is parsed any more, the preview is exact: what it shows
 * is byte-for-byte what Telegram delivers. That is why it is always
 * visible rather than behind a toggle — a preview you have to opt into
 * doesn't catch the mistake you didn't know you'd made.
 */

type KolChoice = { id: string; name: string; hasGc: boolean };

/** A campaign as a recipient shortcut: its roster, split by reachability. */
type CampaignChoice = {
  id: string;
  name: string;
  status: string | null;
  /** Roster KOL ids that have a linked group chat — the ones a pick adds. */
  reachableIds: string[];
  /** On the roster but with no group chat. Counted so the pick can say so. */
  unreachableCount: number;
};

/** Active only [Andy, 2026-08-27]. Announcing to a campaign means a running
 *  one; of 44 campaigns, 5 are Active and the other 39 are Planning,
 *  Completed or Paused. Hiding them keeps the wrong campaign out of reach
 *  rather than one slot away in a long list. A finished campaign's KOLs can
 *  still be picked by hand in the list below. */
const ANNOUNCEABLE_STATUSES = ['Active'];

/** Shape returned by GET /api/kols/announcements (History tab). */
type AnnouncementHistoryRow = {
  id: string;
  body_text: string;
  sender_name: string | null;
  recipient_count: number;
  ok_count: number;
  failed_count: number;
  created_at: string;
  recipients: Array<{
    id: string;
    kol_id: string;
    sent_at: string | null;
    ok: boolean;
    error_message: string | null;
    kol: { name: string } | null;
  }>;
};

/** Insertable per-recipient placeholders. Server substitutes at send. */
const VARIABLES: Array<{ token: string; description: string }> = [
  { token: '{name}', description: 'Replaced with each KOL\'s name at send time.' },
  {
    token: '{handle}',
    description: 'Their Telegram @handle — the @ is included. Falls back to their name when we do not have one.',
  },
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
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // [2026-07-06] History tab — past sends with per-KOL receipts.
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  // [2026-08-27] Recipients by campaign. Picking one adds its roster to the
  // selection rather than replacing it, so two campaigns can go out in one
  // send and the sender can still drop individuals afterwards.
  const [campaigns, setCampaigns] = useState<CampaignChoice[] | null>(null);
  /** Who each KOL actually is on Telegram, and where the message lands.
   *
   *  [Andy, 2026-09-01] The list was names only. Names repeat, several are
   *  Korean with a bracketed romanisation, and two roster rows share a
   *  telegram_id — so "Buy LOW Sell HIGH" and "킬베로스" are indistinguishable
   *  at the moment you press send to sixty people.
   *
   *  master_kols has no @username column; telegram_id is numeric. The handle
   *  is recovered from the most recent message the bot saw from that user,
   *  which covers 42 of the 60 reachable KOLs. The destination chat title is
   *  shown alongside it and is always known — it is the more load-bearing of
   *  the two, because it is literally where the text goes. */
  const [identity, setIdentity] = useState<Map<string, { handle: string | null; chat: string | null }>>(new Map());
  const [campaignPick, setCampaignPick] = useState('');
  const [historyRows, setHistoryRows] = useState<AnnouncementHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/kols/announcements');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setHistoryRows(data.announcements ?? []);
      setHistoryLoaded(true);
    } catch (err: any) {
      toast({ title: 'Failed to load history', description: err?.message, variant: 'destructive' });
    } finally {
      setHistoryLoading(false);
    }
  };

  // Lazy-load history on first switch to the tab; refetch on re-open of
  // the tab so a send made moments ago shows up.
  useEffect(() => {
    if (open && tab === 'history') fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  /** Re-fire the same message to just the recipients that failed. */
  const resendToFailed = async (row: AnnouncementHistoryRow) => {
    const failedKolIds = row.recipients.filter(r => !r.ok).map(r => r.kol_id);
    if (failedKolIds.length === 0) return;
    setResendingId(row.id);
    try {
      const res = await fetch('/api/kols/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: row.body_text, kolIds: failedKolIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast({
        title: data.failedCount > 0 ? 'Resend partially delivered' : 'Resend delivered',
        description: `${data.okCount} sent · ${data.failedCount} failed`,
      });
      await fetchHistory();
    } catch (err: any) {
      toast({ title: 'Resend failed', description: err?.message?.slice(0, 300), variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

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
      setCampaignPick('');
      setTab('compose');
      setExpandedId(null);
      setHistoryLoaded(false);
    }
  }, [open]);

  const reachable = useMemo(
    () => allKols.filter(k => k.hasGc).sort((a, b) => a.name.localeCompare(b.name)),
    [allKols],
  );

  // Campaign rosters, loaded once per open. Reachability is resolved here
  // against the same hasGc the picker uses, so the count on the option is
  // exactly how many recipients the pick will add — no promise the send
  // then fails to keep.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const ids = allKols.filter(k => k.hasGc).map(k => k.id);
      if (ids.length === 0) return;
      // Reads the stored column now, not message history.
      //
      // [2026-09-03] master_kols.telegram_username exists and is editable on
      // /kols, so the handle is roster data with an owner rather than
      // something reconstructed from whoever last spoke in a chat. Anyone can
      // correct it in the table and it is correct everywhere.
      const [{ data: chats }, { data: kolRows }] = await Promise.all([
        supabase.from('telegram_chats').select('master_kol_id, title').in('master_kol_id', ids),
        supabase.from('master_kols').select('id, telegram_username').in('id', ids),
      ]);
      const chatByKol = new Map<string, string>();
      for (const c of ((chats ?? []) as any[])) {
        if (c.master_kol_id && !chatByKol.has(c.master_kol_id)) chatByKol.set(c.master_kol_id, c.title);
      }
      const next = new Map<string, { handle: string | null; chat: string | null }>();
      for (const r of ((kolRows ?? []) as any[])) {
        next.set(r.id, {
          handle: r.telegram_username || null,
          chat: chatByKol.get(r.id) ?? null,
        });
      }
      if (alive) setIdentity(next);
    })().catch(() => {});
    return () => { alive = false; };
  }, [open, allKols]);

  useEffect(() => {
    if (!open || campaigns !== null) return;
    let alive = true;
    (async () => {
      const gcIds = new Set(allKols.filter(k => k.hasGc).map(k => k.id));
      const [{ data: cRows }, { data: ckRows }] = await Promise.all([
        supabase.from('campaigns').select('id, name, status'),
        supabase.from('campaign_kols').select('campaign_id, master_kol_id'),
      ]);
      if (!alive) return;
      const byCampaign = new Map<string, { hit: string[]; miss: number }>();
      for (const r of (ckRows ?? []) as any[]) {
        if (!r.campaign_id || !r.master_kol_id) continue;
        const bucket = byCampaign.get(r.campaign_id) ?? { hit: [], miss: 0 };
        if (gcIds.has(r.master_kol_id)) bucket.hit.push(r.master_kol_id);
        else bucket.miss++;
        byCampaign.set(r.campaign_id, bucket);
      }
      const list: CampaignChoice[] = ((cRows ?? []) as any[])
        .map(c => {
          const b = byCampaign.get(c.id) ?? { hit: [], miss: 0 };
          return {
            id: c.id,
            name: c.name as string,
            status: c.status as string | null,
            reachableIds: Array.from(new Set(b.hit)),
            unreachableCount: b.miss,
          };
        })
        // A campaign with nobody reachable is not a recipient shortcut, it
        // is a dead option that reads like a bug when picking it does
        // nothing. Left out rather than shown disabled.
        .filter(c => c.reachableIds.length > 0
          && ANNOUNCEABLE_STATUSES.includes(c.status ?? ''))
        .sort((a, b) => a.name.localeCompare(b.name));
      setCampaigns(list);
    })().catch(() => { if (alive) setCampaigns([]); });
    return () => { alive = false; };
  }, [open, campaigns, allKols]);

  const addCampaign = (campaignId: string) => {
    const c = campaigns?.find(x => x.id === campaignId);
    if (!c) return;
    let added = 0;
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const id of c.reachableIds) if (!next.has(id)) { next.add(id); added++; }
      return next;
    });
    setCampaignPick('');
    toast({
      title: `${c.name} added`,
      description: [
        `${added} recipient${added === 1 ? '' : 's'} added`,
        c.reachableIds.length - added > 0 ? `${c.reachableIds.length - added} already selected` : null,
        c.unreachableCount > 0 ? `${c.unreachableCount} on the roster have no group chat` : null,
      ].filter(Boolean).join(' · '),
    });
  };
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reachable;
    // Handle is searchable as well — showing an identifier you cannot then
    // type into the box is half a feature.
    return reachable.filter(k =>
      k.name.toLowerCase().includes(q)
      // Compared bare on both sides, so searching "@raoni" and "raoni" behave
      // the same.
      || bareHandle(identity.get(k.id)?.handle).includes(bareHandle(q)));
  }, [reachable, search, identity]);

  const selectedCount = selectedIds.size;
  const firstSelectedName = useMemo(() => {
    for (const k of reachable) if (selectedIds.has(k.id)) return k.name;
    return 'KOL';
  }, [reachable, selectedIds]);
  /** The first selected KOL, so the preview shows a real substitution rather
   *  than a placeholder. */
  const firstSelectedId = useMemo(() => {
    for (const k of reachable) if (selectedIds.has(k.id)) return k.id;
    return null;
  }, [reachable, selectedIds]);
  const firstSelectedHandle = firstSelectedId ? identity.get(firstSelectedId)?.handle ?? null : null;

  // Preview runs the same collapse as the send, so what you see is what
  // arrives — including when you typed the @ yourself.
  const previewText = collapseHandleToken(text)
    .replace(/\{name\}/gi, firstSelectedName)
    .replace(/\{handle\}/gi, formatHandle(firstSelectedHandle) ?? firstSelectedName);

  /** Selected recipients we have no handle for. Only matters once {handle} is
   *  actually used — those people receive their name instead, and the sender
   *  should know how many before pressing send, not after. */
  const missingHandles = useMemo(() => {
    if (!/\{handle\}/i.test(text)) return [] as string[];
    return reachable
      .filter(k => selectedIds.has(k.id) && !identity.get(k.id)?.handle)
      .map(k => k.name);
  }, [text, reachable, selectedIds, identity]);

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

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'compose' | 'history')} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-fit bg-cream-100 border border-cream-200 p-1">
            <TabsTrigger value="compose" className="px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand">
              Compose
            </TabsTrigger>
            <TabsTrigger value="history" className="px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand">
              <History className="h-3.5 w-3.5 mr-1.5" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="flex-1 flex flex-col min-h-0 mt-0">
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
            {/* Campaign shortcut. Adds to the selection rather than
                replacing it, so two campaigns can go out together and
                individuals can still be dropped afterwards. */}
            <div className="flex items-center gap-2 mb-2">
              <Select value={campaignPick} onValueChange={addCampaign}>
                <SelectTrigger className="h-9 focus-brand w-[230px] flex-shrink-0 gap-2">
                  <Megaphone className="h-3.5 w-3.5 text-ink-warm-400 flex-shrink-0" />
                  <SelectValue placeholder={campaigns === null ? 'Loading campaigns…' : 'Add a campaign…'} />
                </SelectTrigger>
                <SelectContent>
                  {(campaigns ?? []).length === 0 ? (
                    <div className="px-2 py-3 text-xs text-ink-warm-500">
                      No active campaign has a KOL with a linked group chat.
                    </div>
                  ) : (campaigns ?? []).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className="text-[11px] text-ink-warm-400 tabular-nums flex-shrink-0">
                          {c.reachableIds.length}
                          {c.unreachableCount > 0 && ` · ${c.unreachableCount} no GC`}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-warm-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search KOLs with GC…"
                  className="h-9 pl-7 focus-brand"
                />
              </div>
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
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="text-sm text-ink-warm-900 truncate">{k.name}</span>
                              {identity.get(k.id)?.handle && (
                                <span className="text-[11px] font-mono text-brand flex-shrink-0">
                                  {formatHandle(identity.get(k.id)!.handle)}
                                </span>
                              )}
                            </span>
                            {/* The destination, not a decoration: this is the
                                chat the text lands in, and it is the only
                                identifier known for all of them. */}
                            {identity.get(k.id)?.chat && (
                              <span className="block text-[11px] text-ink-warm-400 truncate">
                                → {identity.get(k.id)!.chat}
                              </span>
                            )}
                          </span>
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
              placeholder={"Hey {name},\n\nQuick heads-up on next week's content push — brief coming Monday.\n\nhttps://app.holohive.io"}
              rows={8}
              maxLength={4000}
              className="focus-brand font-mono text-sm"
            />
            <div className="flex items-center justify-end mt-1">
              <span className="text-[11px] text-ink-warm-500 tabular-nums">{text.length} / 4000</span>
            </div>
          </div>

          {/* Always shown. Sent as plain text with no parse_mode, so this is
              exactly what arrives — no formatting is applied or stripped. */}
          {text.trim() && (
            <div className="rounded-md border border-cream-200 bg-cream-50/60 p-3">
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-warm-500">
                  Exactly what {selectedCount > 0 ? firstSelectedName : 'each KOL'} receives
                </div>
                <div className="text-[10px] text-ink-warm-400">plain text · no formatting</div>
              </div>
              <pre className="text-sm text-ink-warm-800 whitespace-pre-wrap font-sans">{previewText}</pre>
            </div>
          )}

          {missingHandles.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
              <b>{missingHandles.length} of the selected have no handle on record</b> — they get
              their name where <code>{'{handle}'}</code> appears, not a blank.
              {' '}{missingHandles.slice(0, 4).join(', ')}
              {missingHandles.length > 4 && ` +${missingHandles.length - 4} more`}
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
          </TabsContent>

          {/* [2026-07-06] History — every past send with per-KOL delivery
              receipts. Failed recipients keep their Telegram error message
              and can be retried with the same body via Resend. */}
          <TabsContent value="history" className="flex-1 min-h-0 overflow-y-auto mt-0 py-2 px-1">
            {historyLoading && !historyLoaded ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : historyRows.length === 0 ? (
              <EmptyState
                icon={History}
                title="No announcements sent yet"
                description="Sends from the Compose tab will show up here with per-KOL delivery receipts."
              />
            ) : (
              <ul className="space-y-2">
                {historyRows.map(row => {
                  const isExpanded = expandedId === row.id;
                  const tone = row.failed_count === 0 ? 'success' : row.ok_count === 0 ? 'danger' : 'warning';
                  return (
                    <li key={row.id} className="rounded-lg border border-cream-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-cream-50/60"
                      >
                        <ChevronRight className={`h-3.5 w-3.5 text-ink-warm-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-ink-warm-900 truncate">{row.body_text}</p>
                          <p className="text-[11px] text-ink-warm-500">
                            {formatDateTime(row.created_at)}
                            {row.sender_name ? ` · ${row.sender_name}` : ''}
                          </p>
                        </div>
                        <StatusBadge tone={tone} size="sm">
                          {row.ok_count}/{row.recipient_count} delivered
                        </StatusBadge>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-cream-100 bg-cream-50/40 px-3 py-2.5 space-y-2">
                          <pre className="text-xs text-ink-warm-800 whitespace-pre-wrap font-sans bg-white border border-cream-200 rounded-md p-2.5">{row.body_text}</pre>
                          <ul className="divide-y divide-cream-100 rounded-md border border-cream-200 bg-white">
                            {row.recipients.map(r => (
                              <li key={r.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                                <span className="flex-1 text-ink-warm-900 truncate">{r.kol?.name ?? r.kol_id.slice(0, 8)}</span>
                                {r.ok ? (
                                  <span className="text-ink-warm-500 tabular-nums">{r.sent_at ? formatDateTime(r.sent_at) : ''}</span>
                                ) : (
                                  <span className="text-rose-600 truncate max-w-[260px]" title={r.error_message ?? undefined}>
                                    {r.error_message ?? 'failed'}
                                  </span>
                                )}
                                <StatusBadge tone={r.ok ? 'success' : 'danger'} size="sm">
                                  {r.ok ? 'Delivered' : 'Failed'}
                                </StatusBadge>
                              </li>
                            ))}
                          </ul>
                          {row.failed_count > 0 && (
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => resendToFailed(row)}
                                disabled={resendingId === row.id}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                {resendingId === row.id ? 'Resending…' : `Resend to ${row.failed_count} failed`}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
