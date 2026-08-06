'use client';

/**
 * CRM · TG Outreach — MOCKUP (2026-08-07)
 *
 * A port of Yano's "Outreach TG (1)" Notion database into HHP, built as a
 * design mockup: the layout, funnel model, and metric definitions are real,
 * but the rows below are FIXTURES. Nothing here reads or writes Supabase yet.
 *
 * What the Notion source actually contains (surveyed 2026-08-07):
 *   • 1 table, 23 properties, 7 live rows, 11 saved views
 *   • A 21-value status funnel grouped To-do / In progress / Complete
 *   • 3 of the 11 views (Response, Lead Rate, Trial Rate) are CHARTS that
 *     Notion refuses to render — "your workspace has already used its 1
 *     free chart". Those three are the reason this page exists: the KPI
 *     strip + funnel bar below are the charts Yano is paying attention to
 *     and currently cannot see.
 *   • ~10 of the 23 properties are Notion defaults never used
 *     (Text, Checkbox, delete, Date, Hours, Message, Parent item, Sub-item 1,
 *     Bump 2, Bump 3). They're dropped here rather than ported.
 *
 * Mockup scope: read-only. Status cells, row actions, and the New Prospect
 * button are inert — they exist to show the shape of the interaction, not to
 * mutate anything. Wiring is a separate build once Andy signs off on layout.
 */

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Send, Search, Plus, MessageSquare, Target, Users,
  ExternalLink, Repeat2, CalendarDays, Building2, Filter,
} from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

// ── Status model ─────────────────────────────────────────────────────
// The 21 statuses from Notion's "Status 2" property, verbatim. Grouped the
// way Notion groups them, because that grouping is what the funnel math
// keys off. Kept as string literals so the eventual DB CHECK constraint
// can be generated straight from this list.

type OutreachStatus =
  // To-do
  | 'not_started' | 'to_contact' | 'ready_to_send' | 'contacted'
  | 'bump_1_unseen' | 'bump_1_seen' | 'bump_2_unseen' | 'bump_2_seen'
  | 'bump_3_unseen' | 'bump_3_seen' | 'final_bump'
  | 'team_engaged' | 'team_denial' | 'blocked' | 'x'
  // In progress
  | 'response_interested' | 'response_referred'
  | 'response_denial' | 'response_not_working'
  // Complete
  | 'lead' | 'lead_trial';

interface StatusMeta {
  label: string;
  tone: BadgeTone;
  /** Notion's own grouping — drives the funnel bucket + sort order. */
  group: 'todo' | 'in_progress' | 'complete';
}

const STATUS_META: Record<OutreachStatus, StatusMeta> = {
  not_started:          { label: 'Not started',       tone: 'neutral', group: 'todo' },
  to_contact:           { label: 'To Contact',        tone: 'pink',    group: 'todo' },
  ready_to_send:        { label: 'Ready to send',     tone: 'warning', group: 'todo' },
  contacted:            { label: 'Contacted',         tone: 'warning', group: 'todo' },
  bump_1_unseen:        { label: 'Bump 1 (unseen)',   tone: 'slate',   group: 'todo' },
  bump_1_seen:          { label: 'Bump 1 (seen)',     tone: 'slate',   group: 'todo' },
  bump_2_unseen:        { label: 'Bump 2 (unseen)',   tone: 'slate',   group: 'todo' },
  bump_2_seen:          { label: 'Bump 2 (seen)',     tone: 'slate',   group: 'todo' },
  bump_3_unseen:        { label: 'Bump 3 (unseen)',   tone: 'slate',   group: 'todo' },
  bump_3_seen:          { label: 'Bump 3 (seen)',     tone: 'slate',   group: 'todo' },
  final_bump:           { label: 'Final Bump',        tone: 'slate',   group: 'todo' },
  team_engaged:         { label: 'Team Engaged',      tone: 'success', group: 'todo' },
  team_denial:          { label: 'Team Denial',       tone: 'danger',  group: 'todo' },
  blocked:              { label: 'Blocked',           tone: 'danger',  group: 'todo' },
  x:                    { label: 'X',                 tone: 'neutral', group: 'todo' },
  response_interested:  { label: 'Interested',        tone: 'info',    group: 'in_progress' },
  response_referred:    { label: 'Referred',          tone: 'purple',  group: 'in_progress' },
  response_denial:      { label: 'Denied',            tone: 'danger',  group: 'in_progress' },
  response_not_working: { label: 'Not a fit',         tone: 'danger',  group: 'in_progress' },
  lead:                 { label: 'Lead',              tone: 'success', group: 'complete' },
  lead_trial:           { label: 'Lead — Trial',      tone: 'brand',   group: 'complete' },
};

// ── Funnel stages ────────────────────────────────────────────────────
// Notion has no funnel — it has 11 flat views, and you infer the shape by
// clicking between them. These five stages are the collapse of those views
// into the order a prospect actually moves through.
//
// ⚠️ DELIBERATE DIVERGENCE FROM NOTION [2026-08-07, Andy's call]
//
// Notion's views are narrow hand-built filters, not a partition, and two of
// them drop people on the floor:
//
//   • "Outreached" filters on `Status 2 is Contacted` — exactly that one
//     value. The moment someone gets bumped (Bump 1 (unseen), …) they stop
//     matching and appear in NO view except All. Euler / @gupta_kanv is the
//     live example: messaged 7/28, bumped, now invisible in every working
//     list Yano has.
//   • "Dead" filters on `Response - Denial` only, so Blocked, X, and Team
//     Denial rows are likewise homeless.
//
// Nobody designs a pipeline where following up removes a prospect from the
// board, so this treats both as bugs and fixes them: Outreached means "we've
// messaged them and they haven't answered yet" (bumps included), and Dead
// means every terminal-negative status. Consequence: on the same data this
// page shows rows where Notion shows zero. That's the point.

type Stage = 'queued' | 'ready' | 'outreached' | 'responded' | 'lead' | 'dead';

// Every way a prospect can end without becoming a lead. Notion counts only
// the first of these.
const DEAD_STATUSES: OutreachStatus[] = [
  'response_denial', 'response_not_working', 'team_denial', 'blocked', 'x',
];
// A bump is still outreach awaiting a reply — these belong with 'contacted',
// which is exactly what Notion's Outreached view fails to do.
const BUMP_STATUSES: OutreachStatus[] = [
  'bump_1_unseen', 'bump_1_seen', 'bump_2_unseen', 'bump_2_seen',
  'bump_3_unseen', 'bump_3_seen', 'final_bump',
];

function stageOf(status: OutreachStatus): Stage {
  if (DEAD_STATUSES.includes(status)) return 'dead';
  if (status === 'lead' || status === 'lead_trial') return 'lead';
  if (status === 'response_interested' || status === 'response_referred'
      || status === 'team_engaged') return 'responded';
  if (status === 'contacted' || BUMP_STATUSES.includes(status)) return 'outreached';
  if (status === 'ready_to_send') return 'ready';
  return 'queued';
}

// Drives the stage dot on each table row and the stage name in the row
// dialog. (A `bar` colour per stage lived here for the hidden funnel; it
// comes back with the funnel, not before.)
const STAGE_META: Record<Stage, { label: string; dot: string }> = {
  queued:     { label: 'To Contact',    dot: 'bg-ink-warm-300' },
  ready:      { label: 'Ready to Send', dot: 'bg-amber-400' },
  outreached: { label: 'Outreached',    dot: 'bg-sky-400' },
  responded:  { label: 'Responded',     dot: 'bg-violet-400' },
  lead:       { label: 'Lead',          dot: 'bg-emerald-500' },
  dead:       { label: 'Dead',          dot: 'bg-rose-400' },
};

// ── Fixture data ─────────────────────────────────────────────────────
// The 7 real Notion rows, plus 17 invented ones so the funnel and the rate
// cards have enough denominator to look like themselves. Invented rows are
// flagged so nobody mistakes this for a live export.

interface Prospect {
  id: string;
  /** Notion's title column is confusingly named "Reason" and holds the
   *  contact's role — Founder / Growth / HoM. Renamed to `role` here. */
  role: string;
  telegram: string;
  company: string;
  companyUrl: string;
  owner: string;
  status: OutreachStatus;
  messageType: string | null;
  dateOutreached: string | null;
  bumpsUsed: number;
  /** Only set once they convert — Notion's "Bump used Before conversion". */
  bumpsBeforeConversion: number | null;
  fromNotion: boolean;
}

const PROSPECTS: Prospect[] = [
  // ---- The 7 real rows, as they stood on 2026-08-07 ----
  { id: 'p1',  role: 'Growth',  telegram: '@maccanomics',   company: 'Morpho',       companyUrl: 'https://x.com/Morpho',        owner: 'Yano', status: 'to_contact',   messageType: '3 Line TLDR', dateOutreached: null,         bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: true },
  { id: 'p2',  role: 'Founder', telegram: '@PaulFrambot',   company: 'Morpho',       companyUrl: 'https://x.com/Morpho',        owner: 'Yano', status: 'to_contact',   messageType: null,          dateOutreached: null,         bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: true },
  { id: 'p3',  role: 'Founder', telegram: '@MerlinEgalite', company: 'Morpho',       companyUrl: 'https://x.com/Morpho',        owner: 'Yano', status: 'to_contact',   messageType: null,          dateOutreached: null,         bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: true },
  { id: 'p4',  role: 'OPEN',    telegram: '@elk_xyz',       company: 'Arc',          companyUrl: 'https://x.com/Arc',           owner: 'Yano', status: 'to_contact',   messageType: null,          dateOutreached: null,         bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: true },
  { id: 'p5',  role: '—',       telegram: '@drakebreeding', company: 'Arc',          companyUrl: 'https://x.com/Arc',           owner: 'Yano', status: 'to_contact',   messageType: null,          dateOutreached: null,         bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: true },
  { id: 'p6',  role: 'HoM',     telegram: 'mgushansky',     company: '375ai',        companyUrl: 'https://x.com/375ai_',        owner: 'Yano', status: 'to_contact',   messageType: null,          dateOutreached: null,         bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: true },
  { id: 'p7',  role: 'Growth',  telegram: '@gupta_kanv',    company: 'Euler',        companyUrl: 'https://x.com/eulerfinance',  owner: 'Yano', status: 'bump_1_unseen', messageType: '3 Line TLDR', dateOutreached: '2026-07-28', bumpsUsed: 1, bumpsBeforeConversion: null, fromNotion: true },

  // ---- Invented rows, for funnel/metric shape only ----
  { id: 'p8',  role: 'Founder', telegram: '@sky_protocol',  company: 'Sky',          companyUrl: 'https://x.com/SkyEcosystem',  owner: 'Yano',  status: 'lead_trial',          messageType: '3 Line TLDR', dateOutreached: '2026-06-30', bumpsUsed: 1, bumpsBeforeConversion: 1,    fromNotion: false },
  { id: 'p9',  role: 'Growth',  telegram: '@pendle_gm',     company: 'Pendle',       companyUrl: 'https://x.com/pendle_fi',     owner: 'Yano',  status: 'lead',                messageType: 'Case Study',  dateOutreached: '2026-07-02', bumpsUsed: 2, bumpsBeforeConversion: 2,    fromNotion: false },
  { id: 'p10', role: 'HoM',     telegram: '@ethena_mktg',   company: 'Ethena',       companyUrl: 'https://x.com/ethena_labs',   owner: 'Jdot',  status: 'lead',                messageType: '3 Line TLDR', dateOutreached: '2026-07-09', bumpsUsed: 0, bumpsBeforeConversion: 0,    fromNotion: false },
  { id: 'p11', role: 'Founder', telegram: '@monad_dev',     company: 'Monad',        companyUrl: 'https://x.com/monad_xyz',     owner: 'Yano',  status: 'response_interested', messageType: 'Case Study',  dateOutreached: '2026-07-21', bumpsUsed: 1, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p12', role: 'Growth',  telegram: '@berachain_bd',  company: 'Berachain',    companyUrl: 'https://x.com/berachain',     owner: 'Jdot',  status: 'response_referred',   messageType: '3 Line TLDR', dateOutreached: '2026-07-23', bumpsUsed: 2, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p13', role: 'HoM',     telegram: '@eigen_growth',  company: 'EigenLayer',   companyUrl: 'https://x.com/eigenlayer',    owner: 'Yano',  status: 'team_engaged',        messageType: 'Korea Deck',  dateOutreached: '2026-07-25', bumpsUsed: 1, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p14', role: 'Growth',  telegram: '@jito_sol',      company: 'Jito',         companyUrl: 'https://x.com/jito_sol',      owner: 'Yano',  status: 'bump_2_seen',         messageType: '3 Line TLDR', dateOutreached: '2026-07-15', bumpsUsed: 2, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p15', role: 'Founder', telegram: '@drift_dev',     company: 'Drift',        companyUrl: 'https://x.com/DriftProtocol', owner: 'Jdot',  status: 'bump_1_seen',         messageType: '3 Line TLDR', dateOutreached: '2026-07-27', bumpsUsed: 1, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p16', role: 'HoM',     telegram: '@kamino_mktg',   company: 'Kamino',       companyUrl: 'https://x.com/KaminoFinance', owner: 'Yano',  status: 'bump_3_unseen',       messageType: 'Case Study',  dateOutreached: '2026-07-06', bumpsUsed: 3, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p17', role: 'Growth',  telegram: '@hyperliquid_x', company: 'Hyperliquid',  companyUrl: 'https://x.com/HyperliquidX',  owner: 'Yano',  status: 'final_bump',          messageType: 'Korea Deck',  dateOutreached: '2026-06-24', bumpsUsed: 4, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p18', role: 'Founder', telegram: '@zora_founder',  company: 'Zora',         companyUrl: 'https://x.com/zora',          owner: 'Jdot',  status: 'contacted',           messageType: '3 Line TLDR', dateOutreached: '2026-08-05', bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p19', role: 'Growth',  telegram: '@story_growth',  company: 'Story',        companyUrl: 'https://x.com/StoryProtocol', owner: 'Yano',  status: 'contacted',           messageType: 'Korea Deck',  dateOutreached: '2026-08-06', bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p20', role: 'HoM',     telegram: '@sui_korea',     company: 'Sui',          companyUrl: 'https://x.com/SuiNetwork',    owner: 'Jdot',  status: 'ready_to_send',       messageType: 'Korea Deck',  dateOutreached: null,         bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p21', role: 'Growth',  telegram: '@seinetwork_bd', company: 'Sei',          companyUrl: 'https://x.com/SeiNetwork',    owner: 'Yano',  status: 'ready_to_send',       messageType: '3 Line TLDR', dateOutreached: null,         bumpsUsed: 0, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p22', role: 'Founder', telegram: '@blast_io',      company: 'Blast',        companyUrl: 'https://x.com/Blast_L2',      owner: 'Yano',  status: 'response_denial',     messageType: '3 Line TLDR', dateOutreached: '2026-07-11', bumpsUsed: 2, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p23', role: 'Growth',  telegram: '@linea_build',   company: 'Linea',        companyUrl: 'https://x.com/LineaBuild',    owner: 'Jdot',  status: 'response_not_working', messageType: 'Case Study',  dateOutreached: '2026-07-14', bumpsUsed: 3, bumpsBeforeConversion: null, fromNotion: false },
  { id: 'p24', role: 'HoM',     telegram: '@scroll_zkp',    company: 'Scroll',       companyUrl: 'https://x.com/Scroll_ZKP',    owner: 'Yano',  status: 'blocked',             messageType: '3 Line TLDR', dateOutreached: '2026-06-18', bumpsUsed: 4, bumpsBeforeConversion: null, fromNotion: false },
];

const MESSAGE_TYPES = ['3 Line TLDR', 'Case Study', 'Korea Deck'];
const OWNERS = ['Yano', 'Jdot'];

// ── View tabs ────────────────────────────────────────────────────────
// Notion's 8 table views (the other 3 are the paywalled charts, replaced by
// the KPI strip above the table).

type ViewKey = 'all' | 'to_contact' | 'ready' | 'today' | 'outreached' | 'engaged' | 'leads' | 'dead';

const VIEWS: Array<{ key: ViewKey; label: string; match: (p: Prospect) => boolean }> = [
  { key: 'all',        label: 'All',           match: () => true },
  { key: 'to_contact', label: 'To Contact',    match: p => stageOf(p.status) === 'queued' },
  { key: 'ready',      label: 'Ready to Send', match: p => stageOf(p.status) === 'ready' },
  // Notion filters this on "Date Outreached: This day" + status in the
  // In-progress/Complete groups. Fixture dates make it a rolling 2-day
  // window here so the tab isn't permanently empty in the mockup.
  { key: 'today',      label: 'Today',         match: p => p.dateOutreached === '2026-08-06' || p.dateOutreached === '2026-08-05' },
  { key: 'outreached', label: 'Outreached',    match: p => stageOf(p.status) === 'outreached' },
  { key: 'engaged',    label: 'Engaged',       match: p => stageOf(p.status) === 'responded' },
  { key: 'leads',      label: 'Leads',         match: p => stageOf(p.status) === 'lead' },
  { key: 'dead',       label: 'Dead',          match: p => stageOf(p.status) === 'dead' },
];

export default function OutreachMockupPage() {
  const [view, setView] = useState<ViewKey>('all');
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [msgFilter, setMsgFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Prospect | null>(null);

  // Mock fetch. The data is a constant, but the page should boot the way
  // every other page does — header first, skeleton where the data goes —
  // so the layout can be judged as it'll actually feel.
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, []);

  // ── Rates ──────────────────────────────────────────────────────────
  // These are the three paywalled Notion charts, computed. Definitions are
  // spelled out in the card subtext because "response rate" means three
  // different things depending on what you put in the denominator.
  const metrics = useMemo(() => {
    const byStage = (s: Stage) => PROSPECTS.filter(p => stageOf(p.status) === s).length;

    // Denominator for every rate: anyone we've actually sent to. A prospect
    // still sitting in To Contact / Ready to Send has not been given the
    // chance to respond and would only deflate the rates.
    const contacted = PROSPECTS.filter(p => p.dateOutreached !== null).length;
    const responded = PROSPECTS.filter(p => {
      const st = stageOf(p.status);
      // A denial IS a response — counting only positive replies would make
      // "response rate" a synonym for "interest rate" and overstate reach.
      return st === 'responded' || st === 'lead'
        || p.status === 'response_denial' || p.status === 'response_not_working';
    }).length;
    const leads = PROSPECTS.filter(p => stageOf(p.status) === 'lead').length;
    const trials = PROSPECTS.filter(p => p.status === 'lead_trial').length;

    const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));

    return {
      total: PROSPECTS.length,
      contacted,
      responded,
      leads,
      trials,
      responseRate: pct(responded, contacted),
      leadRate: pct(leads, contacted),
      // Trial rate is leads→trial, not contacted→trial: it measures how many
      // closed leads actually started, which is a different question.
      trialRate: pct(trials, leads),
      dead: byStage('dead'),
    };
  }, []);

  const rows = useMemo(() => {
    const viewMatch = VIEWS.find(v => v.key === view)?.match ?? (() => true);
    const q = search.trim().toLowerCase();
    return PROSPECTS
      .filter(viewMatch)
      .filter(p => ownerFilter === 'all' || p.owner === ownerFilter)
      .filter(p => msgFilter === 'all' || p.messageType === msgFilter)
      .filter(p => !q
        || p.telegram.toLowerCase().includes(q)
        || p.company.toLowerCase().includes(q)
        || p.role.toLowerCase().includes(q))
      .sort((a, b) => {
        // Most recently touched first; never-contacted rows sink to the
        // bottom rather than sorting as epoch-zero.
        if (!a.dateOutreached && !b.dateOutreached) return a.company.localeCompare(b.company);
        if (!a.dateOutreached) return 1;
        if (!b.dateOutreached) return -1;
        return b.dateOutreached.localeCompare(a.dateOutreached);
      });
  }, [view, search, ownerFilter, msgFilter]);

  const activeFilter = [
    ownerFilter !== 'all' ? ownerFilter : null,
    msgFilter !== 'all' ? msgFilter : null,
    search.trim() ? `"${search.trim()}"` : null,
  ].filter(Boolean).join(' · ');

  // Rendered identically in both branches so the title doesn't jump when
  // the data lands.
  const header = (
    <PageHeader
      icon={Send}
      kicker="CRM · Outreach"
      kickerDot="brand"
      title="TG Outreach"
      subtitle="Cold Telegram prospecting — who's queued, who's been bumped, who converted"
      actions={(
        <>
          <Button variant="outline" size="sm" disabled>
            <Filter className="h-4 w-4 mr-2" />Saved views
          </Button>
          <Button variant="brand" size="sm" disabled>
            <Plus className="h-4 w-4 mr-2" />New Prospect
          </Button>
        </>
      )}
    />
  );

  // Structural skeleton — same KPI grid and same table shape as the loaded
  // state, so nothing reflows on arrival.
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

      {/* One quiet line, not a banner — the page should read as the real
          thing, with the caveat available rather than shouted. */}
      <p className="text-xs text-ink-warm-500">
        Mockup — sample data, no live connection. Buttons and status cells are inert.
      </p>

      <SectionHeader
        label="Overview"
        dot="brand"
        counter={`01 — ${metrics.total} prospects · ${metrics.contacted} contacted`}
        first
      />

      {/* The three paywalled Notion charts, as KPI cards. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label="In Pipeline"
          value={metrics.total - metrics.dead}
          sub={`${metrics.dead} dead · ${metrics.total} all-time`}
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
        />
        <KpiCard
          icon={Target}
          label="Lead Rate"
          value={metrics.leadRate === null ? '—' : `${metrics.leadRate}%`}
          sub={`${metrics.leads} leads of ${metrics.contacted} contacted`}
          accent="emerald"
          topAccent
        />
        <KpiCard
          icon={Repeat2}
          label="Trial Rate"
          value={metrics.trialRate === null ? '—' : `${metrics.trialRate}%`}
          sub={`${metrics.trials} of ${metrics.leads} leads started a trial`}
          accent="purple"
          topAccent
        />
      </div>

      {/* Stage-breakdown funnel bar lived here — hidden 2026-08-07 per Andy
          until the table itself is signed off. The stage model still drives the
          view tabs and the row dots, so nothing else changes when it returns. */}

      <SectionHeader
        label="Prospects"
        dot="sky"
        counter={`02 — ${rows.length} of ${PROSPECTS.length} prospects${activeFilter ? ` · ${activeFilter}` : ''}`}
      />

      {/* Filter toolbar — tabs left, search middle, power-user right. */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={view} onValueChange={v => setView(v as ViewKey)}>
          <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
            {VIEWS.map(v => {
              const n = PROSPECTS.filter(v.match).length;
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
              {OWNERS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={msgFilter} onValueChange={setMsgFilter}>
            <SelectTrigger className="h-9 w-[150px] focus-brand">
              <SelectValue placeholder="Message type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All messages</SelectItem>
              {MESSAGE_TYPES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-cream-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-4">
            <EmptyState
              icon={Send}
              title="No prospects match"
              description="Try a different view or widen the owner / message-type filters."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Prospect</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Company</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Status</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Message</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Bumps</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Last Outreach</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(p => {
                const meta = STATUS_META[p.status];
                const stage = stageOf(p.status);
                return (
                  <TableRow
                    key={p.id}
                    className="border-cream-100 row-accent cursor-pointer"
                    onClick={() => setSelected(p)}
                  >
                    <TableCell className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STAGE_META[stage].dot}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-ink-warm-900 truncate">
                            {p.telegram}
                          </div>
                          <div className="text-[11px] text-ink-warm-500 truncate">
                            {p.role === '—' ? 'Role unknown' : p.role}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-5">
                      <a
                        href={p.companyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand-dark"
                      >
                        {p.company}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    </TableCell>
                    <TableCell className="py-3.5 px-5">
                      <StatusBadge tone={meta.tone} size="sm">{meta.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="py-3.5 px-5">
                      {p.messageType
                        ? <span className="text-xs text-ink-warm-700">{p.messageType}</span>
                        : <span className="text-xs text-ink-warm-400">—</span>}
                    </TableCell>
                    <TableCell className="py-3.5 px-5">
                      {p.bumpsUsed === 0
                        ? <span className="text-xs text-ink-warm-400">—</span>
                        : (
                          <span className="inline-flex items-center gap-1 text-xs tabular-nums text-ink-warm-700">
                            <Repeat2 className="h-3 w-3 text-ink-warm-400" />
                            {p.bumpsUsed}
                          </span>
                        )}
                    </TableCell>
                    <TableCell className="py-3.5 px-5">
                      {p.dateOutreached
                        ? <span className="text-xs tabular-nums text-ink-warm-700">{formatDate(p.dateOutreached)}</span>
                        : <span className="text-xs text-ink-warm-400">Not sent</span>}
                    </TableCell>
                    <TableCell className="py-3.5 px-5">
                      <span className="text-xs text-ink-warm-700">{p.owner}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Row detail — read-only in the mockup. */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-brand" />
              {selected?.telegram}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex-1 overflow-y-auto px-1 space-y-3">
              <div className="flex items-center gap-2">
                <StatusBadge tone={STATUS_META[selected.status].tone}>
                  {STATUS_META[selected.status].label}
                </StatusBadge>
                <span className="text-xs text-ink-warm-500">
                  {STAGE_META[stageOf(selected.status)].label} stage
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-warm-500 mb-1">Company</dt>
                  <dd className="flex items-center gap-1.5 text-ink-warm-900">
                    <Building2 className="h-3.5 w-3.5 text-ink-warm-400" />
                    {selected.company}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-warm-500 mb-1">Role</dt>
                  <dd className="text-ink-warm-900">{selected.role === '—' ? 'Unknown' : selected.role}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-warm-500 mb-1">Owner</dt>
                  <dd className="text-ink-warm-900">{selected.owner}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-warm-500 mb-1">Message type</dt>
                  <dd className="text-ink-warm-900">{selected.messageType ?? 'Not chosen'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-warm-500 mb-1">Last outreach</dt>
                  <dd className="flex items-center gap-1.5 text-ink-warm-900 tabular-nums">
                    <CalendarDays className="h-3.5 w-3.5 text-ink-warm-400" />
                    {selected.dateOutreached ? formatDate(selected.dateOutreached) : 'Not sent'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-warm-500 mb-1">Bumps used</dt>
                  <dd className="text-ink-warm-900 tabular-nums">
                    {selected.bumpsUsed}
                    {selected.bumpsBeforeConversion !== null && (
                      <span className="text-ink-warm-500 text-xs">
                        {' '}({selected.bumpsBeforeConversion} before converting)
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              {!selected.fromNotion && (
                <p className="text-[11px] text-amber-700 bg-amber-50/60 border border-amber-200 rounded-md px-2.5 py-2">
                  Fixture row — invented for the mockup, not from Yano&apos;s Notion.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            <Button variant="brand" disabled>Advance status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
