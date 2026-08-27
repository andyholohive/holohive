'use client';

/**
 * CRM · TG Outreach
 *
 * A port of Yano's "Outreach TG" Notion database into HHP. Shipped as a
 * read-only mockup over fixtures on 2026-08-07; wired to a real table
 * (outreach_prospects) on 2026-08-14 so Yano can actually work it.
 *
 * Why this page exists at all: 3 of Notion's 11 views — Response, Lead Rate,
 * Trial Rate — are CHARTS that Notion refuses to render ("your workspace has
 * already used its 1 free chart"). Those three numbers are what Yano is
 * paying attention to and currently cannot see. They're the KPI strip below,
 * and they recompute against whatever view + filters are active, so the same
 * three questions can be asked of one owner or one message type rather than
 * only of the whole board.
 *
 * The data is real: 7 rows carried over from Yano's Notion, plus ~844 copied
 * from crm_opportunities with their stage mapped onto this funnel, so the
 * rates have a genuine denominator instead of an invented one.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Send, Search, Plus, MessageSquare, Target, Users,
  ExternalLink, Repeat2, Trash2, Loader2, Archive, ArchiveRestore,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate, toIsoDate } from '@/lib/dateFormat';
import { useToast } from '@/hooks/use-toast';
import { useGuestPermissions } from '@/hooks/useGuestPermissions';
import { Switch } from '@/components/ui/switch';
import {
  OutreachService, OUTREACH_STATUSES, stageOf, computeRates,
  listOwnerOptions, listMessageTypes, listStatuses, addStatus, addMessageType,
  stageOfRow, type OutreachStatusRow,
  PARK_REASON_LABELS, type ParkReason,
  type OutreachProspect, type OutreachStatus, type Stage,
} from '@/lib/outreachService';
import { RateBreakdownDialog, type RateKey } from '@/components/crm/RateBreakdownDialog';

// ── Status presentation ──────────────────────────────────────────────
// The funnel itself (which statuses mean what) lives in lib/outreachService
// so the rate maths and the UI can't drift. This is only how they look.

interface StatusMeta { label: string; tone: BadgeTone }

const STATUS_META: Record<OutreachStatus, StatusMeta> = {
  not_started:          { label: 'Not started',     tone: 'neutral' },
  to_contact:           { label: 'To Contact',      tone: 'pink'    },
  ready_to_send:        { label: 'Ready to send',   tone: 'warning' },
  contacted:            { label: 'Contacted',       tone: 'warning' },
  bump_1_unseen:        { label: 'Bump 1 (unseen)', tone: 'slate'   },
  bump_1_seen:          { label: 'Bump 1 (seen)',   tone: 'slate'   },
  bump_2_unseen:        { label: 'Bump 2 (unseen)', tone: 'slate'   },
  bump_2_seen:          { label: 'Bump 2 (seen)',   tone: 'slate'   },
  bump_3_unseen:        { label: 'Bump 3 (unseen)', tone: 'slate'   },
  bump_3_seen:          { label: 'Bump 3 (seen)',   tone: 'slate'   },
  final_bump:           { label: 'Final Bump',      tone: 'slate'   },
  team_engaged:         { label: 'Team Engaged',    tone: 'success' },
  team_denial:          { label: 'Team Denial',     tone: 'danger'  },
  blocked:              { label: 'Blocked',         tone: 'danger'  },
  x:                    { label: 'X',               tone: 'neutral' },
  response_interested:  { label: 'Interested',      tone: 'info'    },
  response_referred:    { label: 'Referred',        tone: 'purple'  },
  response_denial:      { label: 'Denied',          tone: 'danger'  },
  response_not_working: { label: 'Not a fit',       tone: 'danger'  },
  lead:                 { label: 'Lead',            tone: 'success' },
  lead_trial:           { label: 'Lead — Trial',    tone: 'brand'   },
};

const STAGE_META: Record<Stage, { label: string; dot: string }> = {
  queued:     { label: 'To Contact',    dot: 'bg-ink-warm-300' },
  ready:      { label: 'Ready to Send', dot: 'bg-amber-400' },
  outreached: { label: 'Outreached',    dot: 'bg-sky-400' },
  responded:  { label: 'Responded',     dot: 'bg-violet-400' },
  lead:       { label: 'Lead',          dot: 'bg-emerald-500' },
  dead:       { label: 'Dead',          dot: 'bg-rose-400' },
};

// Message types now come from field_options so a new one can be added from
// the board. The old constant is gone rather than kept as a fallback: a
// stale hardcoded list is how the owner column drifted from reality.

// Column widths are declared rather than left to the browser's auto layout.
// [2026-08-15] The Prospect column was blowing out to several hundred pixels
// on the All tab: `telegram` was seeded straight from crm_opportunities'
// poc_handle, which holds full profile URLs (sometimes several, space-
// separated), and one 95-character row sets the width of the whole column.
// The data has since been normalized to @handles, but a single bad paste
// would do it again — so the cap lives here too, and `truncate` on the cell
// now has a boundary to truncate against.
const COLUMNS: Array<{ label: string; width: string }> = [
  { label: 'Prospect',      width: 'w-[190px]' },
  { label: 'Role',          width: 'w-[150px]' },
  // [2026-08-22, Yano] Company and Website are one column. In practice the
  // "website" was always the company's X profile — all 67 populated rows were
  // x.com links — so a second column earned nothing. Paste an X link into
  // Company and it stores the link and displays the handle.
  { label: 'Company',       width: 'w-[210px]' },
  { label: 'Status',        width: 'w-[150px]' },
  { label: 'Message',       width: 'w-[140px]' },
  // [2026-08-27, Yano] Which message they were replying to. Message (above)
  // is whatever went out LAST, so after a bump the two are different — and
  // the bumps are most of the board, which is exactly where "which message
  // works" stops being answerable from message_type alone.
  { label: 'Replied To',    width: 'w-[140px]' },
  // Bumps column removed [2026-08-22, Yano]: "the bumps section isn't
  // necessary if the status part covers that". The status values ARE the
  // bump ladder (Bump 1/2/3, Final Bump), so on the board it was the same
  // fact twice. The column stays in the database and setStatus keeps
  // maintaining it — 164 prospects have a bump count whose status has since
  // moved on to replied/dead, and that history is the only record of how
  // many bumps those took.
  { label: 'Last Outreach', width: 'w-[130px]' },
  { label: 'Owner',         width: 'w-[110px]' },
  { label: 'Notes',         width: 'w-[200px]' },
];

/**
 * Split what someone pasted into Company into a display name and a link.
 *
 * [2026-08-22, Yano] "will only paste their twitter links" — so Company
 * accepts either. An x.com/twitter.com URL yields the handle as the name and
 * the tidied URL as the link; anything else is just a name.
 *
 * The tidy-up matters: a real row reads
 * `https://x.com/https://x.com/hyperstiti0ns`, from a full URL pasted into a
 * field that prepended its own prefix. Parsing the LAST handle-looking
 * segment rather than the first makes that case resolve correctly instead of
 * preserving the mangling.
 */
function parseCompanyInput(input: string): { company: string; company_url: string | null } {
  const raw = input.trim();
  if (!raw) return { company: '', company_url: null };

  const matches = [...raw.matchAll(/(?:x\.com|twitter\.com)\/@?([A-Za-z0-9_]{1,15})/gi)];
  if (matches.length === 0) return { company: raw, company_url: null };

  const handle = matches[matches.length - 1][1];
  return { company: handle, company_url: `https://x.com/${handle}` };
}

/** Every column that can be edited in place. */
type EditField =
  | 'telegram' | 'role' | 'company'
  | 'status' | 'message_type' | 'responded_to_message' | 'date_outreached'
  | 'owner' | 'notes';

/** Radix Select forbids an empty-string value, so "no message type" needs a
 *  sentinel that is mapped back to NULL on save. */
const NONE = '__none__';

// ── View tabs ────────────────────────────────────────────────────────
//
// ⚠️ DELIBERATE DIVERGENCE FROM NOTION [2026-08-07, Andy's call]
//
// Notion's views are narrow hand-built filters, not a partition, and two of
// them drop people on the floor:
//
//   • "Outreached" filters on `Status 2 is Contacted` — exactly that one
//     value. The moment someone gets bumped they stop matching and appear
//     in NO view except All.
//   • "Dead" filters on `Response - Denial` only, so Blocked, X and Team
//     Denial rows are likewise homeless.
//
// Nobody designs a pipeline where following up removes a prospect from the
// board, so both are treated as bugs: Outreached means "messaged, no answer
// yet" (bumps included) and Dead means every terminal-negative status.

type ViewKey = 'all' | 'to_contact' | 'ready' | 'outreached' | 'engaged' | 'leads' | 'dead' | 'parked';

const VIEWS: Array<{ key: ViewKey; label: string; match: (p: OutreachProspect, cat?: OutreachStatusRow[] | null) => boolean }> = [
  { key: 'all',        label: 'All',           match: () => true },
  { key: 'to_contact', label: 'To Contact',    match: (p, cat) => stageOfRow(p.status, cat ?? null) === 'queued' },
  { key: 'ready',      label: 'Ready to Send', match: (p, cat) => stageOfRow(p.status, cat ?? null) === 'ready' },
  { key: 'outreached', label: 'Outreached',    match: (p, cat) => stageOfRow(p.status, cat ?? null) === 'outreached' },
  { key: 'engaged',    label: 'Engaged',       match: (p, cat) => stageOfRow(p.status, cat ?? null) === 'responded' },
  { key: 'leads',      label: 'Leads',         match: (p, cat) => stageOfRow(p.status, cat ?? null) === 'lead' },
  { key: 'dead',       label: 'Dead',          match: (p, cat) => stageOfRow(p.status, cat ?? null) === 'dead' },
  // Parked is the only view that shows parked rows; every other view is the
  // live worklist. Nothing here is deleted — this tab is where it went.
  { key: 'parked',     label: 'Parked',        match: p => p.parked_at !== null },
];

const emptyDraft = () => ({
  telegram: '', company: '', role: '',
  owner: '', owner_user_id: '', status: 'to_contact' as OutreachStatus, message_type: '',
});

/** The pre-HHP import: 844 rows out of crm_opportunities plus 7 out of
 *  Yano's Notion. Everything tracked from here on is 'manual'. The cut is
 *  the import itself, not a date — a row added today by anyone is new. */
const isLegacy = (p: OutreachProspect) => p.source !== 'manual';

export default function OutreachPage() {
  const { toast } = useToast();
  const { roleView } = useGuestPermissions();

  // Who gets the legacy board at all. The new starter tracks his own outreach
  // from this week and nothing is passed to him, so the old import would only
  // drown his numbers — the rates re-scope to whatever is on screen, and 851
  // imported rows would peg his response rate at the import's 11% no matter
  // what he actually does. Admin and above keep it, defaulted on, so Yano's
  // board is unchanged.
  //
  // This is a UI-level hide, not a security boundary: the rows are still
  // readable through the API. It's about whose numbers are whose, not secrecy.
  // roleView, not userProfile.role — this decides visibility, so previewing
  // "view as <the new guy>" has to show what he'll actually see. Gating on the
  // signed-in user is the exact bug that made the sidebar preview useless.
  const canSeeLegacy = roleView === 'admin' || roleView === 'super_admin';
  const [showLegacy, setShowLegacy] = useState(true);
  const [prospects, setProspects] = useState<OutreachProspect[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<ViewKey>('all');
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [msgFilter, setMsgFilter] = useState<string>('all');

  // Which cell is open for editing, and the uncommitted text in it. One cell
  // at a time: opening another commits or discards the first, which is what
  // makes click-anywhere-and-type safe on a board this size.
  const [edit, setEdit] = useState<{ id: string; field: EditField } | null>(null);
  const [draftValue, setDraftValue] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [rateDrill, setRateDrill] = useState<RateKey | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProspects(await OutreachService.list());
    } catch (err: any) {
      toast({ title: 'Could not load prospects', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Owners are real users now, from app_settings.outreach_owner_emails.
  // Deriving them from the rows (the previous approach) meant the filter only
  // ever offered people who ALREADY had prospects — a new rep was invisible
  // until someone else assigned them something.
  const [ownerOptions, setOwnerOptions] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [messageTypes, setMessageTypes] = useState<string[]>([]);
  // The status catalogue. Drives the dropdown, the badge label/tone, and —
  // via stageOfRow — which funnel bucket each row counts in.
  const [statusCatalogue, setStatusCatalogue] = useState<OutreachStatusRow[] | null>(null);
  const [addStatusOpen, setAddStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<{ label: string; stage: Stage }>({ label: '', stage: 'queued' });
  const [addMsgOpen, setAddMsgOpen] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [savingOption, setSavingOption] = useState(false);

  // Status keys to offer, catalogue first and the compiled list as the
  // fallback while it loads.
  const statusKeys = useMemo<string[]>(
    () => (statusCatalogue?.length ? statusCatalogue.map(s => s.key) : OUTREACH_STATUSES),
    [statusCatalogue],
  );
  const metaFor = (key: string): StatusMeta => {
    const row = statusCatalogue?.find(r => r.key === key);
    if (row) return { label: row.label, tone: row.tone as BadgeTone };
    return STATUS_META[key as OutreachStatus] ?? { label: key, tone: 'neutral' };
  };

  const submitNewStatus = async () => {
    setSavingOption(true);
    try {
      const res = await addStatus(newStatus);
      if (!res.ok) {
        toast({ title: 'Could not add status', description: res.error, variant: 'destructive' });
        return;
      }
      setStatusCatalogue(await listStatuses(true));
      setAddStatusOpen(false);
      setNewStatus({ label: '', stage: 'queued' });
      toast({ title: 'Status added', description: 'Available on every prospect now.' });
    } finally { setSavingOption(false); }
  };

  const submitNewMessage = async () => {
    setSavingOption(true);
    try {
      const ok = await addMessageType(newMsg);
      if (!ok) {
        toast({ title: 'Could not add message type', variant: 'destructive' });
        return;
      }
      setMessageTypes(await listMessageTypes());
      setAddMsgOpen(false);
      setNewMsg('');
      toast({ title: 'Message type added' });
    } finally { setSavingOption(false); }
  };
  useEffect(() => {
    let alive = true;
    listOwnerOptions().then(o => { if (alive) setOwnerOptions(o); }).catch(() => {});
    listMessageTypes().then(m => { if (alive) setMessageTypes(m); }).catch(() => {});
    listStatuses().then(c => { if (alive) setStatusCatalogue(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const owners = useMemo(() => ownerOptions.map(o => o.name), [ownerOptions]);

  // Two populations, deliberately.
  //
  // [2026-08-15, Andy] The rates must NOT follow the view tabs. A tab is a
  // filter on funnel STAGE, and stage is the very thing the rates measure —
  // standing on the Leads tab and reading "Lead Rate 100%" is a tautology,
  // not a metric, and the same collapse happens on every other tab. So the
  // denominator is the whole board.
  //
  // Owner / message type / search are different in kind: they slice WHO was
  // contacted, not how far they got. Those still move the rates, which is
  // what makes "what's my response rate" and "which opener works" askable —
  // the reason these cards exist (Notion paywalled the charts).
  /** Everything the current user is allowed to see, before any filter. */
  const visible = useMemo(
    () => (canSeeLegacy && showLegacy ? prospects : prospects.filter(p => !isLegacy(p))),
    [prospects, canSeeLegacy, showLegacy],
  );

  const rateRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible
      .filter(p => ownerFilter === 'all' || p.owner === ownerFilter)
      .filter(p => msgFilter === 'all' || p.message_type === msgFilter)
      .filter(p => !q
        || p.telegram.toLowerCase().includes(q)
        || p.company.toLowerCase().includes(q)
        || p.role.toLowerCase().includes(q));
  }, [visible, search, ownerFilter, msgFilter]);

  const rows = useMemo(() => {
    const viewMatch = VIEWS.find(v => v.key === view)?.match ?? (() => true);
    const live = view === 'parked' ? rateRows : rateRows.filter(p => p.parked_at === null);
    return live.filter(p => viewMatch(p, statusCatalogue));
  }, [rateRows, view, statusCatalogue]);

  const metrics = useMemo(() => computeRates(rateRows, statusCatalogue), [rateRows, statusCatalogue]);

  // Rates are deliberately computed over parked rows too. A row parked for
  // "no reply in 90 days" is a real message that got no answer — dropping it
  // from the denominator would lift Response Rate from 11% to a number that
  // describes nothing. Parking changes the worklist, not the history.
  const liveMetrics = useMemo(
    () => computeRates(rateRows.filter(p => p.parked_at === null), statusCatalogue),
    [rateRows, statusCatalogue],
  );
  const parkedCount = useMemo(() => visible.filter(p => p.parked_at !== null).length, [visible]);
  const liveCount = visible.length - parkedCount;

  const activeFilter = [
    ownerFilter !== 'all' ? ownerFilter : null,
    msgFilter !== 'all' ? msgFilter : null,
    search.trim() ? `"${search.trim()}"` : null,
  ].filter(Boolean).join(' · ');

  // Names the rate population — never the view tab, which no longer scopes it.
  const scopeLabel = activeFilter || 'whole board';

  async function changeStatus(p: OutreachProspect, status: OutreachStatus) {
    if (status === p.status) return;
    setSaving(true);
    try {
      // setStatus, not a raw column write: it stamps date_outreached on the
      // first send and derives the bump count, so the rates keep a correct
      // denominator no matter which surface moved the prospect.
      const updated = await OutreachService.setStatus(p, status);
      setProspects(prev => prev.map(x => (x.id === updated.id ? updated : x)));
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // ── Inline editing ─────────────────────────────────────────────────
  //
  // Optimistic: the cell shows the new value immediately and only reverts
  // (via a reload) if the write fails. On a board Yano is typing through,
  // waiting on a round-trip per cell would feel broken.

  function startEdit(p: OutreachProspect, field: EditField, current: string) {
    setEdit({ id: p.id, field });
    setDraftValue(current);
  }

  async function saveField(p: OutreachProspect, field: EditField, value: string | number | null) {
    if ((p as any)[field] === value) return;
    setProspects(prev => prev.map(x => (x.id === p.id ? { ...x, [field]: value } as OutreachProspect : x)));
    try {
      await OutreachService.update(p.id, { [field]: value } as any);
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
      load();
    }
  }

  async function commitEdit() {
    if (!edit) return;
    const { id, field } = edit;
    const p = prospects.find(x => x.id === id);
    setEdit(null);
    if (!p) return;

    const raw = draftValue.trim();

    // telegram and company are the row's identity and carry a unique index —
    // blanking either would orphan the row, so an empty edit is a no-op.
    if ((field === 'telegram' || field === 'company') && !raw) return;

    // Company holds both halves now. Pasting an X link sets the name and the
    // link together; typing a plain name clears any stale link, since the
    // link is no longer separately editable and would otherwise point at the
    // previous company forever.
    if (field === 'company') {
      const parsed = parseCompanyInput(raw);
      setProspects(prev => prev.map(x =>
        x.id === p.id ? { ...x, company: parsed.company, company_url: parsed.company_url } : x));
      try {
        await OutreachService.update(p.id, {
          company: parsed.company,
          company_url: parsed.company_url,
        } as any);
      } catch (err: any) {
        toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
        load();
      }
      return;
    }

    // Clearing a cell writes NULL, and `role` and `owner` are NOT NULL —
    // the save failed with a constraint error and the cleared value
    // reappeared on the next load.
    //
    // They get different treatment because the columns mean different
    // things. `role` is optional information, and '—' is already the
    // board's marker for "unknown" (the cell renders it as an empty
    // placeholder), so an emptied Role stores that. `owner` is an
    // assignment: falling back to its 'Yano' default would hand someone
    // else's prospect to Yano because a cell was cleared, so an emptied
    // Owner is a no-op, the same guard telegram and company get above.
    if (field === 'owner' && !raw) return;
    if (field === 'role' && !raw) {
      await saveField(p, field, '—');
      return;
    }

    await saveField(p, field, raw || null);
  }

  async function handleCreate() {
    if (!draft.telegram.trim() || !draft.company.trim()) return;
    setCreating(true);
    try {
      const created = await OutreachService.create({
        telegram: draft.telegram.trim(),
        company: parseCompanyInput(draft.company).company,
        role: draft.role.trim() || '—',
        company_url: parseCompanyInput(draft.company).company_url,
        owner: draft.owner,
        status: draft.status,
        message_type: draft.message_type || null,
        owner_user_id: draft.owner_user_id || null,
      });
      setProspects(prev => [created, ...prev]);
      setAddOpen(false);
      setDraft(emptyDraft());
      toast({ title: 'Prospect added', description: `${created.telegram} · ${created.company}` });
    } catch (err: any) {
      toast({ title: 'Could not add prospect', description: err?.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  // [2026-08-27] Delete used to fire straight off the trash icon — a
  // hover-revealed control, one click, gone, sitting directly beside Park.
  // 19 prospects were deleted in a single afternoon and there is no audit log
  // on this table, so nothing about them is recoverable. The dialog names the
  // row and offers Park, because "get it off my board" is what the click
  // usually means and Park is the reversible way to do it.
  const [confirmDelete, setConfirmDelete] = useState<OutreachProspect | null>(null);

  async function handleDelete(p: OutreachProspect) {
    setConfirmDelete(null);
    setDeleting(true);
    try {
      await OutreachService.remove(p.id);
      setProspects(prev => prev.filter(x => x.id !== p.id));
      toast({ title: 'Prospect removed', description: `${p.telegram} · ${p.company}` });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  async function handlePark(p: OutreachProspect, parked: boolean) {
    setDeleting(true);
    try {
      await OutreachService.setParked(p.id, parked, 'terminal');
      const stamp = parked ? new Date().toISOString() : null;
      setProspects(prev => prev.map(x => x.id === p.id
        ? { ...x, parked_at: stamp, parked_reason: parked ? 'terminal' as ParkReason : null }
        : x));
      toast({
        title: parked ? 'Parked' : 'Back on the board',
        description: parked
          ? `${p.telegram} · ${p.company} — nothing deleted, it's in the Parked tab.`
          : `${p.telegram} · ${p.company}`,
      });
    } catch (err: any) {
      toast({ title: 'Could not update', description: err?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  const header = (
    <PageHeader
      icon={Send}
      kicker="CRM · Outreach"
      kickerDot="brand"
      title="TG Outreach"
      subtitle="Cold Telegram prospecting — who's queued, who's been bumped, who converted"
      actions={(
        <Button variant="brand" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Prospect
        </Button>
      )}
    />
  );

  // Structural skeleton — same KPI grid and table shape as the loaded state,
  // so nothing reflows on arrival.
  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="section-head first flex items-center gap-3">
          <span className="dot bg-brand/30" />
          <Skeleton className="h-3 w-24" />
          <span className="flex-1 h-px bg-cream-200" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="section-head flex items-center gap-3">
          <span className="dot bg-sky-500/30" />
          <Skeleton className="h-3 w-24" />
          <span className="flex-1 h-px bg-cream-200" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-10 w-[420px] rounded-md" />
          <Skeleton className="h-9 flex-1 min-w-[220px] max-w-sm rounded-md" />
          <Skeleton className="h-9 w-[130px] rounded-md ml-auto" />
          <Skeleton className="h-9 w-[150px] rounded-md" />
        </div>
        <Card className="border-cream-200 overflow-hidden">
          <div className="border-b border-cream-200 bg-cream-50/80 py-2.5 px-5 flex items-center gap-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-2.5 w-20" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-cream-100 py-3.5 px-5 flex items-center gap-6">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <SectionHeader
        label="Rates"
        dot="brand"
        counter={`01 — ${scopeLabel} · ${metrics.contacted} contacted${parkedCount ? ` (incl. ${parkedCount} parked)` : ''} · click a rate to break it down`}
        first
      />

      {/* The three Notion charts Yano can't render, plus the pipeline count.
          Every rate is denominated on outreach actually sent — a prospect
          still in To Contact hasn't been given the chance to reply and would
          only deflate all three. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label="In Pipeline"
          value={liveMetrics.total - liveMetrics.dead}
          sub={`${liveCount} live · ${parkedCount} parked · ${visible.length} total`}
          accent="brand"
          topAccent
        />
        <KpiCard
          icon={MessageSquare}
          label="Response Rate"
          value={metrics.responseRate === null ? '—' : `${metrics.responseRate}%`}
          sub={`${metrics.responded} replied of ${metrics.contacted} contacted`}
          accent="sky"
          topAccent
          onClick={() => setRateDrill('response')}
          actionLabel="Break down Response Rate by owner and message type"
        />
        <KpiCard
          icon={Target}
          label="Lead Rate"
          value={metrics.leadRate === null ? '—' : `${metrics.leadRate}%`}
          sub={`${metrics.leads} trial, convo or call of ${metrics.contacted}`}
          accent="emerald"
          topAccent
          onClick={() => setRateDrill('lead')}
          actionLabel="Break down Lead Rate by owner and message type"
        />
        <KpiCard
          icon={Repeat2}
          label="Trial Rate"
          value={metrics.trialRate === null ? '—' : `${metrics.trialRate}%`}
          sub={`${metrics.trials} took the free offer of ${metrics.contacted}`}
          accent="purple"
          topAccent
          onClick={() => setRateDrill('trial')}
          actionLabel="Break down Trial Rate by owner and message type"
        />
      </div>

      <SectionHeader
        label="Prospects"
        dot="sky"
        counter={`02 — ${rows.length} of ${view === 'parked' ? parkedCount : liveCount} ${view === 'parked' ? 'parked' : 'live'} prospects${activeFilter ? ` · ${activeFilter}` : ''}`}
      />

      {/* Filter toolbar — tabs left, search middle, power-user right. */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={view} onValueChange={v => setView(v as ViewKey)}>
          <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
            {VIEWS.map(v => {
              const n = visible
                .filter(p => (v.key === 'parked' ? true : p.parked_at === null))
                .filter(p => v.match(p, statusCatalogue)).length;
              return (
                <TabsTrigger
                  key={v.key}
                  value={v.key}
                  className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
                >
                  {v.label}
                  <span className="ml-1.5 text-xs bg-brand-light/100 text-brand px-2 py-0.5 rounded-full tabular-nums">
                    {n}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search handle, company, or role..."
            className="pl-10 h-9 focus-brand"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-9 w-[130px] focus-brand">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={msgFilter} onValueChange={setMsgFilter}>
            <SelectTrigger className="h-9 w-[150px] focus-brand">
              <SelectValue placeholder="Message type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All messages</SelectItem>
              {messageTypes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Only rendered for admin and above — the new starter's board is
              his own outreach, and he never sees the switch or the rows. */}
          {canSeeLegacy && (
            <label className="flex items-center gap-2 pl-1 cursor-pointer select-none">
              <Switch
                checked={showLegacy}
                onCheckedChange={setShowLegacy}
                aria-label="Show the pre-HHP CRM import"
              />
              <span className="text-xs text-ink-warm-500 whitespace-nowrap">
                Previous CRM
              </span>
            </label>
          )}
        </div>
      </div>

      {/* ── The board ────────────────────────────────────────────────────
          [2026-08-15, Yano] "id like to be able to edit from whereever /
          doesnt let me edit anything atm / on notion i click and edit."
          He was right — only Status was editable, and only from inside a
          row dialog. Every column is now edited in place on a single click,
          which is also why this is a raw <table> rather than the shadcn
          Table primitives: per CLAUDE.md, inline-editable spreadsheets use
          the v11 chrome (cream header, per-cell gridlines) and read-only
          data tables use the primitives. The row-detail dialog is gone —
          it held a second copy of the same fields, which is the exact
          "where do I edit this" confusion Yano hit. */}
      <Card className="border-cream-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-4">
            {visible.length === 0 ? (
              /* A fresh board rather than a failed filter — this is what the
                 new starter sees on day one, so it says what to do, not that
                 nothing matched. */
              <EmptyState
                icon={Send}
                title="No outreach tracked yet"
                description="Add the first prospect and the response, lead and trial rates start building from there."
              >
                <Button variant="brand" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />Add First Prospect
                </Button>
              </EmptyState>
            ) : (
              <EmptyState
                icon={Send}
                title="No prospects match"
                description="Try a different view or widen the owner / message-type filters."
              />
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-50 hover:bg-cream-50 border-b border-cream-200">
                  {COLUMNS.map(c => (
                    <th
                      key={c.label}
                      className={`bg-cream-50 text-left py-2.5 px-4 font-semibold text-ink-warm-500 text-[10px] uppercase tracking-[0.18em] border-r border-cream-200 whitespace-nowrap ${c.width}`}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="bg-cream-50 w-10 border-cream-200" />
                </tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const meta = metaFor(p.status);
                  const stage = stageOfRow(p.status, statusCatalogue);
                  const isEditing = (f: EditField) => edit?.id === p.id && edit.field === f;
                  // Only rows that actually came back need a message attributed.
                  const hasReplied = stage === 'responded' || stage === 'lead';

                  /** Text/number cell: one click swaps the value for an input. */
                  const textCell = (
                    field: EditField,
                    value: string,
                    opts?: { placeholder?: string; numeric?: boolean; render?: React.ReactNode },
                  ) => (
                    <td
                      className="border-r border-cream-200 align-middle"
                      onClick={() => !isEditing(field) && startEdit(p, field, value)}
                    >
                      {isEditing(field) ? (
                        <div className="py-1 px-2">
                          <Input
                            autoFocus
                            type={opts?.numeric ? 'number' : 'text'}
                            value={draftValue}
                            onChange={e => setDraftValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                              if (e.key === 'Escape') { e.preventDefault(); setEdit(null); }
                            }}
                            className="h-8 text-xs focus-brand bg-white"
                            placeholder={opts?.placeholder}
                          />
                        </div>
                      ) : (
                        <div className="py-3.5 px-4 cursor-text hover:bg-cream-50/60 min-h-[3rem] flex items-center">
                          {opts?.render ?? (
                            value
                              ? <span className="text-xs text-ink-warm-800 truncate">{value}</span>
                              : <span className="text-xs text-ink-warm-300">{opts?.placeholder ?? '—'}</span>
                          )}
                        </div>
                      )}
                    </td>
                  );

                  return (
                    <tr key={p.id} className="border-b border-cream-100 hover:bg-cream-50/40 group">
                      {/* Prospect handle */}
                      {textCell('telegram', p.telegram, {
                        placeholder: '@handle',
                        render: (
                          <span className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STAGE_META[stage].dot}`} />
                            <span className="text-sm font-medium text-ink-warm-900 truncate" title={p.telegram}>
                              {p.telegram === '—'
                                ? <span className="text-ink-warm-300 italic">no handle</span>
                                : p.telegram}
                            </span>
                            {p.parked_reason && (
                              <StatusBadge tone="neutral" size="sm">
                                {PARK_REASON_LABELS[p.parked_reason]}
                              </StatusBadge>
                            )}
                          </span>
                        ),
                      })}

                      {/* Role — '—' is the seed's stand-in for unknown, so show
                          it as empty rather than making Yano delete a dash. */}
                      {textCell('role', p.role === '—' ? '' : p.role, { placeholder: 'Role' })}

                      {/* Company — one cell for the name and the X link.
                          Editing it shows the plain name so a paste replaces
                          the name rather than a URL the user never typed; the
                          link only decorates the read state, and stops the
                          click bubbling so following it doesn't open an
                          editor. */}
                      {textCell('company', p.company, {
                        placeholder: 'Company or x.com link',
                        render: p.company_url ? (
                          <a
                            href={p.company_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark truncate"
                            title={p.company_url}
                          >
                            {p.company}
                            <ExternalLink className="h-3 w-3 opacity-60 flex-shrink-0" />
                          </a>
                        ) : undefined,
                      })}

                      {/* Status — the one field with bookkeeping behind it
                          (stamps date_outreached, derives bumps), so it goes
                          through setStatus rather than a raw column write. */}
                      <td
                        className="border-r border-cream-200 align-middle"
                        onClick={() => !isEditing('status') && setEdit({ id: p.id, field: 'status' })}
                      >
                        {isEditing('status') ? (
                          <div className="py-1 px-2">
                            <Select
                              defaultOpen
                              value={p.status}
                              onValueChange={v => { setEdit(null); changeStatus(p, v as OutreachStatus); }}
                              onOpenChange={o => { if (!o) setEdit(null); }}
                            >
                              <SelectTrigger className="h-8 text-xs focus-brand bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <button
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 text-xs text-brand hover:bg-cream-50 border-b border-cream-100 mb-1"
                                  onPointerDown={(e) => { e.preventDefault(); setEdit(null); setTimeout(() => setAddStatusOpen(true), 0); }}
                                >
                                  + Add status…
                                </button>
                                {statusKeys.map(k => (
                                  <SelectItem key={k} value={k}>{metaFor(k).label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="py-3.5 px-4 cursor-pointer hover:bg-cream-50/60 min-h-[3rem] flex items-center">
                            <StatusBadge tone={meta.tone} size="sm">{meta.label}</StatusBadge>
                          </div>
                        )}
                      </td>

                      {/* Message type */}
                      <td
                        className="border-r border-cream-200 align-middle"
                        onClick={() => !isEditing('message_type') && setEdit({ id: p.id, field: 'message_type' })}
                      >
                        {isEditing('message_type') ? (
                          <div className="py-1 px-2">
                            <Select
                              defaultOpen
                              value={p.message_type ?? NONE}
                              onValueChange={v => {
                                setEdit(null);
                                saveField(p, 'message_type', v === NONE ? null : v);
                              }}
                              onOpenChange={o => { if (!o) setEdit(null); }}
                            >
                              <SelectTrigger className="h-8 text-xs focus-brand bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>—</SelectItem>
                                                                <button
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 text-xs text-brand hover:bg-cream-50 border-b border-cream-100 mb-1"
                                  onPointerDown={(e) => { e.preventDefault(); setEdit(null); setTimeout(() => setAddMsgOpen(true), 0); }}
                                >
                                  + Add message type…
                                </button>
                                {messageTypes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="py-3.5 px-4 cursor-pointer hover:bg-cream-50/60 min-h-[3rem] flex items-center">
                            {p.message_type
                              ? <span className="text-xs text-ink-warm-700">{p.message_type}</span>
                              : <span className="text-xs text-ink-warm-300">—</span>}
                          </div>
                        )}
                      </td>


                      {/* Replied To — same catalogue as Message. Only asks
                          the question once there is a reply to attribute:
                          before that the cell is empty and quiet, and after it
                          carries a RequiredAsterisk while unfilled, per the
                          inline-required convention in CLAUDE.md. */}
                      <td
                        className="border-r border-cream-200 align-middle"
                        onClick={() => !isEditing('responded_to_message') && setEdit({ id: p.id, field: 'responded_to_message' })}
                      >
                        {isEditing('responded_to_message') ? (
                          <div className="py-1 px-2">
                            <Select
                              defaultOpen
                              value={p.responded_to_message ?? NONE}
                              onValueChange={v => {
                                setEdit(null);
                                saveField(p, 'responded_to_message', v === NONE ? null : v);
                              }}
                              onOpenChange={o => { if (!o) setEdit(null); }}
                            >
                              <SelectTrigger className="h-8 text-xs focus-brand bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <button
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 text-xs text-brand hover:bg-cream-50 border-b border-cream-100 mb-1"
                                  onPointerDown={(e) => { e.preventDefault(); setEdit(null); setTimeout(() => setAddMsgOpen(true), 0); }}
                                >
                                  + Add message type…
                                </button>
                                <SelectItem value={NONE}>—</SelectItem>
                                {messageTypes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="py-3.5 px-4 cursor-pointer hover:bg-cream-50/60 min-h-[3rem] flex items-center gap-1">
                            {p.responded_to_message
                              ? <span className="text-xs text-ink-warm-700">{p.responded_to_message}</span>
                              : hasReplied
                                ? <><span className="text-xs text-ink-warm-300">—</span><RequiredAsterisk /></>
                                : <span className="text-xs text-ink-warm-300">—</span>}
                          </div>
                        )}
                      </td>

                      {/* Last outreach — Popover + Calendar, never a native
                          date input (CLAUDE.md). Opens straight from the click. */}
                      <td className="border-r border-cream-200 align-middle">
                        <Popover
                          open={isEditing('date_outreached')}
                          onOpenChange={o => setEdit(o ? { id: p.id, field: 'date_outreached' } : null)}
                        >
                          <PopoverTrigger asChild>
                            <div className="py-3.5 px-4 cursor-pointer hover:bg-cream-50/60 min-h-[3rem] flex items-center">
                              {p.date_outreached
                                ? <span className="text-xs tabular-nums text-ink-warm-700">{formatDate(p.date_outreached)}</span>
                                : <span className="text-xs text-ink-warm-300">Not sent</span>}
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                            <Calendar
                              mode="single"
                              selected={p.date_outreached ? new Date(p.date_outreached + 'T00:00:00') : undefined}
                              onSelect={d => {
                                setEdit(null);
                                saveField(p, 'date_outreached', d ? toIsoDate(d) : null);
                              }}
                              classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                              modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                            />
                            <div className="border-t border-cream-100 p-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full h-7 text-xs text-ink-warm-500"
                                onClick={() => { setEdit(null); saveField(p, 'date_outreached', null); }}
                              >
                                Clear date
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>

                      {/* Owner — a user, not free text. Writes owner_user_id
                          (the truth) and owner (the display name) together, so
                          the pair cannot disagree. */}
                      <td
                        className="border-r border-cream-200 align-middle"
                        onClick={() => !isEditing('owner') && setEdit({ id: p.id, field: 'owner' })}
                      >
                        {isEditing('owner') ? (
                          <div className="py-1 px-2">
                            <Select
                              defaultOpen
                              value={p.owner_user_id ?? ''}
                              onValueChange={async (userId) => {
                                const u = ownerOptions.find(o => o.id === userId);
                                setEdit(null);
                                if (!u) return;
                                setProspects(prev => prev.map(x =>
                                  x.id === p.id ? { ...x, owner: u.name, owner_user_id: u.id } : x));
                                try {
                                  await OutreachService.update(p.id, {
                                    owner: u.name, owner_user_id: u.id,
                                  } as any);
                                } catch (err: any) {
                                  toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
                                  load();
                                }
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs focus-brand"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ownerOptions.map(o => (
                                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-ink-warm-700 truncate">
                            {p.owner || <span className="text-ink-warm-300">Unassigned</span>}
                          </div>
                        )}
                      </td>

                      {/* Notes */}
                      {textCell('notes', p.notes ?? '', { placeholder: 'Notes' })}

                      <td className="px-2 align-middle whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-ink-warm-400 hover:text-brand"
                          onClick={() => handlePark(p, p.parked_at === null)}
                          disabled={deleting}
                          title={p.parked_at ? `Put ${p.telegram} back on the board` : `Park ${p.telegram} — not deleted`}
                        >
                          {p.parked_at
                            ? <ArchiveRestore className="h-3.5 w-3.5" />
                            : <Archive className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-ink-warm-400 hover:text-rose-600"
                          onClick={() => setConfirmDelete(p)}
                          disabled={deleting}
                          title={`Delete ${p.telegram} permanently — Park keeps it`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── New prospect ─────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-brand" />New Prospect
            </DialogTitle>
            <DialogDescription>
              One row per person per company — the board refuses a duplicate rather than
              letting it inflate the rates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="op-tg">Telegram <RequiredAsterisk /></Label>
                <Input
                  id="op-tg"
                  value={draft.telegram}
                  onChange={e => setDraft({ ...draft, telegram: e.target.value })}
                  placeholder="@handle"
                  className="h-9 focus-brand mt-1"
                />
              </div>
              <div>
                <Label htmlFor="op-co">Company <RequiredAsterisk /></Label>
                <Input
                  id="op-co"
                  value={draft.company}
                  onChange={e => setDraft({ ...draft, company: e.target.value })}
                  placeholder="Morpho or https://x.com/Morpho"
                  className="h-9 focus-brand mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="op-role">Role</Label>
              <Input
                id="op-role"
                value={draft.role}
                onChange={e => setDraft({ ...draft, role: e.target.value })}
                placeholder="Founder / Growth / HoM"
                className="h-9 focus-brand mt-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Owner</Label>
                <Select
                  value={draft.owner_user_id}
                  onValueChange={v => {
                    const u = ownerOptions.find(o => o.id === v);
                    setDraft({ ...draft, owner_user_id: v, owner: u?.name ?? '' });
                  }}
                >
                  <SelectTrigger className="h-9 focus-brand mt-1"><SelectValue placeholder="Pick an owner" /></SelectTrigger>
                  <SelectContent>
                    {ownerOptions.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={v => setDraft({ ...draft, status: v as OutreachStatus })}
                >
                  <SelectTrigger className="h-9 focus-brand mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-xs text-brand hover:bg-cream-50 border-b border-cream-100 mb-1"
                      onPointerDown={(e) => { e.preventDefault(); setTimeout(() => setAddStatusOpen(true), 0); }}
                    >
                      + Add status…
                    </button>
                    {statusKeys.map(k => (
                      <SelectItem key={k} value={k}>{metaFor(k).label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Message</Label>
                <Select
                  value={draft.message_type || 'none'}
                  onValueChange={v => setDraft({ ...draft, message_type: v === 'none' ? '' : v })}
                >
                  <SelectTrigger className="h-9 focus-brand mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-xs text-brand hover:bg-cream-50 border-b border-cream-100 mb-1"
                      onPointerDown={(e) => { e.preventDefault(); setTimeout(() => setAddMsgOpen(true), 0); }}
                    >
                      + Add message type…
                    </button>
                    <SelectItem value="none">None yet</SelectItem>
                    {messageTypes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="brand"
              onClick={handleCreate}
              disabled={creating || !draft.telegram.trim() || !draft.company.trim()}
            >
              {creating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Prospect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate drill-down. Fed `rateRows`, the same attribute-filtered
          population the cards use — so the dialog can never disagree with the
          card that opened it. */}
      {/* Add status — stage is required, not optional. A status with no
          bucket would save and then be invisible to Response / Lead / Trial
          rate, so the rates would under-count with nothing on screen saying
          so. Asking here is what keeps them total. */}
      <Dialog open={confirmDelete !== null} onOpenChange={o => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this prospect?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.telegram}{confirmDelete?.company ? ` · ${confirmDelete.company}` : ''} would be
              erased — status, notes, outreach dates, all of it. There is no undo and no
              record kept. The sales-CRM opportunity behind it is not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-cream-200 bg-cream-50 p-3 text-xs text-ink-warm-600">
            If you just want it off the board, <b>Park</b> it instead — the row keeps
            everything and one click brings it back.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="outline"
              className="border-brand text-brand hover:bg-brand-light"
              onClick={() => { const t = confirmDelete; setConfirmDelete(null); if (t) handlePark(t, true); }}
              disabled={deleting}
            >
              <Archive className="h-4 w-4 mr-2" />Park instead
            </Button>
            <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete)} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addStatusOpen} onOpenChange={setAddStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a status</DialogTitle>
            <DialogDescription>
              It appears on every prospect straight away.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name <RequiredAsterisk /></Label>
              <Input
                className="h-9 focus-brand mt-1"
                value={newStatus.label}
                onChange={e => setNewStatus({ ...newStatus, label: e.target.value })}
                placeholder="e.g. Awaiting intro"
              />
            </div>
            <div>
              <Label>Counts as <RequiredAsterisk /></Label>
              <Select
                value={newStatus.stage}
                onValueChange={v => setNewStatus({ ...newStatus, stage: v as Stage })}
              >
                <SelectTrigger className="h-9 focus-brand mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STAGE_META) as Stage[]).map(st => (
                    <SelectItem key={st} value={st}>{STAGE_META[st].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-ink-warm-500 mt-1">
                Which funnel bucket this status counts in. The rates above are built from these.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStatusOpen(false)} disabled={savingOption}>Cancel</Button>
            <Button variant="brand" onClick={submitNewStatus} disabled={savingOption || !newStatus.label.trim()}>
              {savingOption ? 'Adding…' : 'Add status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addMsgOpen} onOpenChange={setAddMsgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a message type</DialogTitle>
            <DialogDescription>Available on every prospect straight away.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Name <RequiredAsterisk /></Label>
            <Input
              className="h-9 focus-brand mt-1"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder="e.g. Case Study v2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMsgOpen(false)} disabled={savingOption}>Cancel</Button>
            <Button variant="brand" onClick={submitNewMessage} disabled={savingOption || !newMsg.trim()}>
              {savingOption ? 'Adding…' : 'Add message type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RateBreakdownDialog
        rateKey={rateDrill}
        rows={rateRows}
        scopeLabel={scopeLabel}
        onClose={() => setRateDrill(null)}
      />
    </div>
  );
}
