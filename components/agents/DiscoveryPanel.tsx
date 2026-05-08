'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  HoverCard, HoverCardTrigger, HoverCardContent,
} from '@/components/ui/hover-card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Sparkles, Loader2, ExternalLink, Send, Twitter, Globe,
  ChevronDown, ChevronRight as ChevronRightIcon, CheckCircle, XCircle,
  ArrowRight, AlertTriangle, RefreshCw, UserSearch, Eye, Zap,
  ArrowUp, ArrowDown, ArrowUpDown, Radar, Search, Info, Trash2,
  MessageSquare, Copy as CopyIcon,
} from 'lucide-react';

interface Trigger {
  id: string;
  signal_type: string;
  headline: string;
  detail?: string | null;
  source_url?: string | null;
  // Which pipeline produced this signal — used to show a GROK badge on
  // Grok-sourced triggers in the hover card.
  source_name?: 'discovery_claude' | 'grok_x_deep_scan' | string | null;
  source_type?: 'tweet' | 'article' | 'other' | null;
  tier?: 'TIER_1' | 'TIER_2' | 'TIER_3' | null;
  weight?: number;
  detected_at: string;
}

type IcpCheck = { pass: boolean; evidence: string };
type IcpVerdict = 'PASS' | 'FAIL' | 'BORDERLINE' | null;
type DiscoveryActionTier =
  | 'REACH_OUT_NOW'
  | 'PRE_TOKEN_PRIORITY'
  | 'RESEARCH'
  | 'WATCH'
  | 'NURTURE'
  | 'SKIP'
  | null;

interface OutreachContact {
  name: string;
  role: string;
  twitter_handle?: string;
  telegram_handle?: string;
  source_url?: string;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
  // Grok-sourced POCs are flagged for human review because Grok has been
  // observed to hallucinate. Amber styling + Confirm/Remove buttons until
  // a human reviews. Flipped to false on Confirm.
  is_grok_sourced?: boolean;
  reviewed_at?: string;
}

interface DiscoveryProspect {
  id: string;
  name: string;
  symbol: string | null;
  category: string | null;
  website_url: string | null;
  twitter_url: string | null;          // project-level (community)
  telegram_url: string | null;         // project-level (community)
  source_url: string | null;
  status: string;
  scraped_at: string;
  updated_at: string;
  korea_relevancy_score: number;
  icp_score: number;
  action_tier: string | null;
  outreach_contacts: OutreachContact[];
  triggers: Trigger[];
  // Most recent Grok Deep Dive timestamp (null if never). Used to show
  // "scanned Nd ago" + enforce a 24h cooldown on the row button.
  last_deep_dive_at: string | null;
  // Cost of that most-recent Grok run (null if we can't attribute because
  // input_params wasn't populated at the time the run happened).
  last_deep_dive_cost_usd: number | null;
  // Max korea_interest_score across this prospect's active Grok signals.
  // >= 70 triggers a "Grok-hot" badge for fast triage. Null if never
  // deep-dived.
  grok_korea_score: number | null;
  // Set by the KR exchanges cron when this prospect just listed on a
  // Korean exchange. The presence of post_korea_listing_at flips the UI
  // to show a "LISTED ON UPBIT" badge — they're no longer "no Korea
  // presence yet" so the BD angle has to change. Null when never listed.
  post_korea_listing_at: string | null;
  post_korea_listing_exchange: string | null;   // 'upbit' | 'bithumb'
  post_korea_listing_market_pair: string | null; // e.g. 'KRW-PHAR'
  // SCOUT-aligned qualification
  icp_verdict: IcpVerdict;
  icp_checks: {
    credible_funding: IcpCheck;
    pre_token_or_tge_6mo: IcpCheck;
    no_korea_presence: IcpCheck;
    end_user_product: IcpCheck;
    real_product: IcpCheck;
    not_with_competitor: IcpCheck;
  } | null;
  prospect_score: { icp_fit: number; signal_strength: number; timing: number; total: number } | null;
  discovery_action_tier: DiscoveryActionTier;
  disqualification_reason: string | null;
  consideration_reason: string | null;
  fit_reasoning: string | null;
  funding: {
    round: string | null;
    amount_usd: number | null;
    date: string | null;
    investors: string[];
  } | null;
}

const STATUS_TABS = [
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const CONTACT_CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

const ACTION_TIER_STYLE: Record<string, { label: string; className: string }> = {
  REACH_OUT_NOW:       { label: 'REACH OUT NOW',      className: 'bg-red-100 text-red-700 border-red-200' },
  PRE_TOKEN_PRIORITY:  { label: 'PRE-TOKEN PRIORITY', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  RESEARCH:            { label: 'RESEARCH FIRST',     className: 'bg-blue-100 text-blue-700 border-blue-200' },
  WATCH:               { label: 'WATCH',              className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  NURTURE:             { label: 'NURTURE',            className: 'bg-gray-100 text-gray-700 border-gray-200' },
  SKIP:                { label: 'SKIP',               className: 'bg-gray-50 text-gray-400 border-gray-200 line-through decoration-gray-300' },
};

const VERDICT_STYLE: Record<string, string> = {
  PASS: 'bg-emerald-100 text-emerald-700',
  BORDERLINE: 'bg-amber-100 text-amber-700',
  FAIL: 'bg-red-100 text-red-700',
};

const ICP_CRITERIA_LABELS: Record<string, string> = {
  credible_funding: 'Credible funding',
  pre_token_or_tge_6mo: 'Pre-token or TGE <6mo',
  no_korea_presence: 'No Korea presence',
  end_user_product: 'End-user product',
  real_product: 'Real product',
  not_with_competitor: 'Not with competitor agency',
};

/** Normalize a twitter handle or URL to a clickable URL */
function twitterUrl(handle?: string): string | null {
  if (!handle) return null;
  if (handle.startsWith('http')) return handle;
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) return null;
  return `https://x.com/${clean}`;
}
/** Normalize a telegram handle or URL to a clickable URL */
function telegramUrl(handle?: string): string | null {
  if (!handle) return null;
  if (handle.startsWith('http')) return handle;
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) return null;
  return `https://t.me/${clean}`;
}

function formatSignalType(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Compact "Nd ago" / "Nh ago" / "just now" for row-level timestamps. */
function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const mos = Math.floor(days / 30);
  return `${mos}mo ago`;
}

const DEEP_DIVE_COOLDOWN_HOURS = 24;

/**
 * Toggle the prospect score column on/off across the prospect list +
 * expanded view. Andy asked for the score field to be hidden on the
 * Intelligence page; flipping this back to true restores it. The
 * score data still gets persisted from the scan endpoint — we're
 * only hiding the UI surfaces.
 *
 * Surfaces gated by this:
 *   - Score column header + sort button (table)
 *   - Score number cell (table row)
 *   - "Score: X+Y+Z = N/100" chip (expanded row)
 *
 * Sort logic for sort.field='score' is left intact — it's just
 * unreachable while the header is hidden.
 */
const SHOW_SCORE_COLUMN = false;

// Discovery source picker — the sources the Run Discovery scan can
// query (must match SUPPORTED_SOURCES in app/api/prospects/discovery/scan/route.ts).
type DiscoverySourceId = 'dropstab' | 'cryptorank' | 'rootdata' | 'ethglobal' | 'defillama';
const DISCOVERY_SOURCE_CARDS: Array<{
  id: DiscoverySourceId;
  title: string;
  oneLiner: string;
  footnote: string;
}> = [
  {
    id: 'dropstab',
    title: 'DropsTab',
    oneLiner: 'Trending crypto funding list',
    footnote: 'Default · battle-tested',
  },
  {
    id: 'rootdata',
    title: 'RootData',
    oneLiner: 'SSR funding tracker (APAC bias)',
    footnote: 'Leads DefiLlama by 24-48h · clean HTML',
  },
  {
    id: 'cryptorank',
    title: 'CryptoRank',
    oneLiner: 'Catches rounds DropsTab may miss',
    footnote: 'JS-rendered · noisy · optional',
  },
  {
    id: 'ethglobal',
    title: 'ETHGlobal',
    oneLiner: 'Hackathon prize-winners',
    footnote: 'Pre-funding teams · orthogonal signal',
  },
  {
    id: 'defillama',
    title: 'DeFiLlama',
    oneLiner: 'DeFi-protocol fundraising tracker',
    footnote: 'Distinct universe · DEX/perps/lending/RWA/restaking',
  },
];

/**
 * Build a Telegram DM draft for a single POC using their prospect context
 * and the strongest available Grok signal. Pure templating — no LLM call,
 * zero cost, runs client-side so the dialog opens instantly.
 *
 * Variants let the user re-roll wording without editing manually.
 */
function buildTelegramDraft(
  prospect: DiscoveryProspect,
  poc: OutreachContact,
  variant: 'signal' | 'generic' | 'pretoken' = 'signal',
): string {
  const firstName = (poc.name || '').split(/\s+/)[0] || 'there';

  // Pick the most actionable Grok signal — prefer Korea-direct over Asia-generic.
  const grokTriggers = prospect.triggers.filter(t => t.source_name === 'grok_x_deep_scan');
  const koreaSignal = grokTriggers.find(t => t.signal_type === 'poc_korea_mention');
  const asiaSignal = grokTriggers.find(t => t.signal_type === 'poc_asia_mention');
  const bestSignal = koreaSignal || asiaSignal;

  // Strip the "POC name (role): " prefix from the signal headline so the
  // hook reads naturally in first person.
  const cleanHeadline = bestSignal?.headline?.replace(/^[^:]+:\s*/, '') || '';

  const intro = `Hey ${firstName} — Andy from HoloHive, we run Korean KOL + community campaigns for crypto projects (ecosystem clients include L1s, perps DEXs, CEXs).`;

  let hook = '';
  if (variant === 'signal' && bestSignal && cleanHeadline) {
    hook = `Saw the recent ${koreaSignal ? 'Korean community activity' : 'Asia presence'} — ${cleanHeadline.toLowerCase().slice(0, 140)}. Korea is the right moment.`;
  } else if (variant === 'pretoken') {
    const tier = prospect.discovery_action_tier;
    if (tier === 'PRE_TOKEN_PRIORITY') {
      hook = `Pre-TGE is the best window to build Korean KOL momentum — by launch day, the right 8–12 KOLs are already vouching for ${prospect.name}.`;
    } else {
      hook = `${prospect.name} looks like a strong fit for the Korean market based on what we're seeing on X.`;
    }
  } else {
    hook = `${prospect.name} caught our radar — looks like a strong fit for Korea based on the team and current traction.`;
  }

  const valueProp = `We're specifically Korea-first: Upbit/Bithumb relationships, Seoul event coverage (KBW, Token2049-adjacent), and a vetted KOL roster that actually converts. Recent campaigns moved the needle for ${randomClientExample(prospect.id)}.`;

  const cta = `Worth 15 min to walk through what the Korea push could look like? Calendly in my bio, or happy to share a deck first.`;

  return [intro, '', hook, '', valueProp, '', cta, '', '— Andy @ HoloHive'].join('\n');
}

/** Rotate through a few client name examples deterministically per prospect
 *  so drafts aren't identical across different prospects (looks templated)
 *  but are stable across re-draws (doesn't feel random). */
function randomClientExample(seed: string): string {
  const examples = ['a recent L1 launch', 'a perps DEX at TGE', 'a CEX listing push'];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return examples[Math.abs(h) % examples.length];
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function DiscoveryPanel() {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<DiscoveryProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('needs_review');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hideSkip, setHideSkip] = useState<boolean>(true);
  // Free-text filter matching project name, symbol, or any POC name/handle.
  // Client-side only; the list is already capped at 200 rows.
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Bulk selection state — set of prospect IDs checked via the row checkboxes.
  // Enables the Promote-all / Dismiss-all / Deep-Dive-all toolbar.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);

  // Column sort state — cycles through none → asc → desc → none
  type SortField = 'tier' | 'score' | 'funding' | null;
  const [sort, setSort] = useState<{ field: SortField; direction: 'asc' | 'desc' }>({
    field: null,
    direction: 'asc',
  });
  const toggleSort = (field: Exclude<SortField, null>) => {
    setSort(prev => {
      if (prev.field !== field) return { field, direction: 'asc' };
      if (prev.direction === 'asc') return { field, direction: 'desc' };
      return { field: null, direction: 'asc' }; // clear
    });
  };

  // Order used to rank tiers (lower index = "hotter")
  const TIER_ORDER: Record<string, number> = {
    REACH_OUT_NOW: 0,
    PRE_TOKEN_PRIORITY: 1,
    RESEARCH: 2,
    WATCH: 3,
    NURTURE: 4,
    SKIP: 5,
  };

  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanParams, setScanParams] = useState({
    recency_days: '30',
    min_raise_usd: '1000000',
    max_projects: '20',
    categories: '',
    model: 'opus' as 'sonnet' | 'opus',
    // Which candidate sources Claude queries. DropsTab only is the
    // battle-tested default. RootData / CryptoRank are funding-tracker
    // alternatives; ETHGlobal is orthogonal (pre-funding hackathon
    // winners). All four can be toggled independently.
    sources: ['dropstab'] as DiscoverySourceId[],
  });
  const toggleScanSource = (src: DiscoverySourceId) => {
    setScanParams(p => {
      const has = p.sources.includes(src);
      // Never allow the empty set — at minimum one source must be selected.
      if (has && p.sources.length === 1) return p;
      return {
        ...p,
        sources: has ? p.sources.filter(s => s !== src) : [...p.sources, src],
      };
    });
  };
  const [lastScanResult, setLastScanResult] = useState<any>(null);

  // Live progress (polled from /api/prospects/discovery/progress while scanning).
  // `detail` is the rich block added 2026-05-05 — per-source counts, what got
  // filtered out, and the rolling list of enriched projects as Stage 2 batches
  // settle. See progress endpoint comments for the full shape.
  type ScanDetail = {
    sources?: {
      per_source_counts?: Record<string, number>;
      errors?: string[];
      list?: string[];
    };
    filtered?: {
      recent_skipped?: number;
      crm_skipped_total?: number;
      crm_filtered_names?: { items: string[]; truncated: number };
      candidate_names?: { items: string[]; truncated: number };
    };
    enriched?: Array<{
      name: string;
      tier: string | null;
      score: number | null;
      poc_count: number;
      icp_verdict: string | null;
    }>;
    tier_breakdown?: Record<string, number>;
    batch_errors?: string[];
  };
  const [scanProgress, setScanProgress] = useState<{
    stage: string | null;
    message: string | null;
    percent: number | null;
    candidates_found: number | null;
    batches_total: number | null;
    batches_complete: number | null;
    detail?: ScanDetail | null;
  } | null>(null);
  // Whether the user has expanded the "Show details" panel under the
  // progress bar. Default collapsed so the dialog isn't tall by default.
  const [progressDetailOpen, setProgressDetailOpen] = useState(false);
  const progressPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Defaults for Deep Dive runs (previously user-tunable via the batch
  // Scan dialog, now constants since the per-row dialog has its own
  // lookback/shelf-life controls). Bulk Deep Dive uses the POC cap
  // below as a hardcoded safety brake.
  const DEEP_DIVE_DEFAULT_LOOKBACK_DAYS = 90;
  const DEEP_DIVE_DEFAULT_SHELF_LIFE_DAYS = 30;
  const BULK_DEEP_DIVE_MAX_POCS = 5;

  // Per-prospect Deep Dive state — tracks which rows are currently running
  // so we can show a spinner on just that row and disable the button to
  // prevent double-clicks.
  const [deepDivingIds, setDeepDivingIds] = useState<Set<string>>(new Set());
  // Per-prospect "Find POCs" state (Grok-powered).
  const [findingPocsIds, setFindingPocsIds] = useState<Set<string>>(new Set());
  // Signals currently being deleted — lets us dim the row + disable the
  // button so the user can't double-click.
  const [deletingSignalIds, setDeletingSignalIds] = useState<Set<string>>(new Set());
  // POCs (prospectId + index keys) currently being confirmed / removed.
  // Keyed as `${prospectId}|${pocIndex}` so one POC action doesn't block
  // actions on other POCs or other prospects.
  const [pocActionInFlight, setPocActionInFlight] = useState<Set<string>>(new Set());

  // Telegram DM draft dialog — opened from the per-POC "Draft DM" button
  // in the expanded row. Generates a templated message using the prospect's
  // strongest Grok signal; user can re-roll wording or edit before copying.
  const [dmDialog, setDmDialog] = useState<{
    open: boolean;
    prospect: DiscoveryProspect | null;
    poc: OutreachContact | null;
    variant: 'signal' | 'generic' | 'pretoken';
    text: string;
    copiedAt: number | null;
  }>({
    open: false,
    prospect: null,
    poc: null,
    variant: 'signal',
    text: '',
    copiedAt: null,
  });

  // Per-prospect Deep Dive dialog — opens when the user clicks the row's
  // Deep Dive button. Lets them pick lookback / shelf-life per-project
  // instead of inheriting the batch dialog's settings, and shows live
  // elapsed-time progress since the API itself doesn't stream updates.
  //
  // When `pocHandle` is set, the scan targets exactly that one handle
  // (used by the per-POC Deep Dive button on each POC card).
  const [rowDeepDive, setRowDeepDive] = useState<{
    open: boolean;
    prospectId: string | null;
    projectName: string;
    xPocCount: number;
    pocHandle: string | null;   // null = all POCs on this prospect
    pocName: string | null;
    lookbackDays: 30 | 90 | 180 | 365;
    shelfLifeDays: 7 | 14 | 30 | 60 | 90;
    running: boolean;
    startedAt: number | null;
    elapsedSec: number;
    result: any | null;
  }>({
    open: false,
    prospectId: null,
    projectName: '',
    xPocCount: 0,
    pocHandle: null,
    pocName: null,
    lookbackDays: 90,
    shelfLifeDays: 30,
    running: false,
    startedAt: null,
    elapsedSec: 0,
    result: null,
  });
  const rowDeepDiveTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prospects/discovery?status=${statusFilter}`);
      const data = await res.json();
      if (data.prospects) setProspects(data.prospects);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load discovered prospects', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Start polling the progress endpoint. Anchors on the scan's start-time
  // so we don't confuse the UI by showing an unrelated prior run's progress.
  const startProgressPolling = (scanStartedAt: number) => {
    setScanProgress({
      stage: 'starting',
      message: 'Starting scan...',
      percent: 1,
      candidates_found: null,
      batches_total: null,
      batches_complete: null,
    });
    if (progressPollRef.current) clearInterval(progressPollRef.current);
    progressPollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/prospects/discovery/progress', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        // Only trust this row if it represents OUR scan: started_at after we fired POST.
        // Allow 5s grace because the server inserts the row after the POST arrives.
        const rowStartMs = data.started_at ? new Date(data.started_at).getTime() : 0;
        if (rowStartMs < scanStartedAt - 5000) return;
        // Merge progress + detail. The progress endpoint sends them as
        // sibling fields; we flatten so the UI can read them off one
        // state object instead of plumbing two.
        if (data.progress) {
          setScanProgress({ ...data.progress, detail: data.detail ?? null });
        }
        if (data.status === 'completed' || data.status === 'failed') {
          stopProgressPolling();
        }
      } catch {
        // swallow — the POST will still return the real result
      }
    }, 2000);
  };

  const stopProgressPolling = () => {
    if (progressPollRef.current) {
      clearInterval(progressPollRef.current);
      progressPollRef.current = null;
    }
  };

  React.useEffect(() => {
    return () => stopProgressPolling();
  }, []);

  const runScan = async () => {
    setScanning(true);
    setLastScanResult(null);
    setScanProgress(null);
    const scanStartedAt = Date.now();
    startProgressPolling(scanStartedAt);

    try {
      const body: any = {
        recency_days: parseInt(scanParams.recency_days, 10) || 30,
        min_raise_usd: parseInt(scanParams.min_raise_usd, 10) || 1_000_000,
        max_projects: parseInt(scanParams.max_projects, 10) || 20,
        model: scanParams.model,
        sources: scanParams.sources,
      };
      const cats = scanParams.categories.split(',').map(s => s.trim()).filter(Boolean);
      if (cats.length > 0) body.categories = cats;

      const res = await fetch('/api/prospects/discovery/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setLastScanResult(data);
      stopProgressPolling();
      // One last fetch so the final detail block (with tier_breakdown,
      // batch_errors, etc.) lands in the UI. Without this the panel
      // would still show the next-to-last batch's mid-flight state.
      try {
        const finalRes = await fetch('/api/prospects/discovery/progress', { cache: 'no-store' });
        if (finalRes.ok) {
          const finalData = await finalRes.json();
          setScanProgress(prev => ({
            stage: res.ok && !data.error ? 'done' : 'failed',
            message: res.ok && !data.error ? 'Scan complete' : (data.error || 'Scan failed'),
            percent: 100,
            candidates_found: data.candidates_found ?? prev?.candidates_found ?? null,
            batches_total: data.batches_run ?? prev?.batches_total ?? null,
            batches_complete: data.batches_run ?? prev?.batches_complete ?? null,
            detail: finalData.detail ?? prev?.detail ?? null,
          }));
        }
      } catch {
        // Fallback: keep whatever detail we already have from polling
        setScanProgress(prev => ({
          stage: res.ok && !data.error ? 'done' : 'failed',
          message: res.ok && !data.error ? 'Scan complete' : (data.error || 'Scan failed'),
          percent: 100,
          candidates_found: data.candidates_found ?? null,
          batches_total: data.batches_run ?? null,
          batches_complete: data.batches_run ?? null,
          detail: prev?.detail ?? null,
        }));
      }

      if (!res.ok || data.error) {
        toast({ title: 'Scan failed', description: data.error || 'Unknown error', variant: 'destructive' });
      } else {
        toast({
          title: 'Discovery complete',
          description: `Found ${data.projects_found} projects · ${data.inserted} new · ${data.signals_added} triggers · $${data.cost_usd?.toFixed(2) ?? '—'}`,
        });
        fetchProspects();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Scan failed', variant: 'destructive' });
    } finally {
      stopProgressPolling();
      setScanning(false);
    }
  };

  // Open the Telegram DM draft dialog for a specific POC and generate
  // an initial message using the 'signal' variant (most specific).
  const openDmDraft = (prospect: DiscoveryProspect, poc: OutreachContact) => {
    const text = buildTelegramDraft(prospect, poc, 'signal');
    setDmDialog({ open: true, prospect, poc, variant: 'signal', text, copiedAt: null });
  };

  const regenerateDmDraft = (variant: 'signal' | 'generic' | 'pretoken') => {
    setDmDialog(prev => {
      if (!prev.prospect || !prev.poc) return prev;
      return {
        ...prev,
        variant,
        text: buildTelegramDraft(prev.prospect, prev.poc, variant),
        copiedAt: null,
      };
    });
  };

  const copyDmToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(dmDialog.text);
      setDmDialog(prev => ({ ...prev, copiedAt: Date.now() }));
      toast({ title: 'Copied to clipboard', description: 'Paste into Telegram.' });
    } catch (err: any) {
      toast({
        title: 'Copy failed',
        description: err?.message ?? 'Clipboard API unavailable — select manually and copy.',
        variant: 'destructive',
      });
    }
  };

  // Confirm a Grok-sourced POC as legitimate (flips is_grok_sourced to
  // false, removes the amber tint). Or delete it if it's a hallucination.
  const confirmOrDeletePoc = async (
    prospectId: string,
    pocIndex: number,
    pocName: string,
    action: 'confirm' | 'delete',
  ) => {
    if (action === 'delete') {
      const ok = window.confirm(`Remove "${pocName}" from this project's POCs?`);
      if (!ok) return;
    }
    const key = `${prospectId}|${pocIndex}`;
    setPocActionInFlight(prev => { const n = new Set(prev); n.add(key); return n; });
    try {
      const res = await fetch('/api/prospects/discovery/confirm-poc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId, poc_index: pocIndex, action }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Action failed', description: data.error || 'Unknown error', variant: 'destructive' });
      } else {
        toast({
          title: action === 'delete' ? 'POC removed' : 'POC confirmed',
          description: `${pocName} — remaining POCs: ${data.remaining_contacts}`,
        });
        fetchProspects();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Action failed', variant: 'destructive' });
    } finally {
      setPocActionInFlight(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  // Soft-delete a signal (sets is_active=false on the DB row). Used to prune
  // obvious hallucinations without opening SQL. Requires a window.confirm
  // because the UI gives no other safety net.
  const deleteSignal = async (signalId: string, headline: string) => {
    const ok = window.confirm(`Delete this signal?\n\n"${headline}"\n\nThe DB row stays (soft delete); only marked inactive.`);
    if (!ok) return;
    setDeletingSignalIds(prev => {
      const next = new Set(prev);
      next.add(signalId);
      return next;
    });
    try {
      const res = await fetch(`/api/prospects/signals/${signalId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({
          title: 'Delete failed',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Signal deleted', description: 'Marked inactive. Refresh to remove from view.' });
      fetchProspects();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Delete failed', variant: 'destructive' });
    } finally {
      setDeletingSignalIds(prev => {
        const next = new Set(prev);
        next.delete(signalId);
        return next;
      });
    }
  };

  // Per-prospect Grok POC finder — searches for 1-3 decision-maker handles
  // (X + Telegram) for ONE project. Grok's native X access is better than
  // Claude's web search for scraping X bios for Telegram handles.
  const runFindPocsForProspect = async (prospectId: string, projectName: string) => {
    setFindingPocsIds(prev => {
      const next = new Set(prev);
      next.add(prospectId);
      return next;
    });
    toast({
      title: 'Finding POCs',
      description: `Grok is searching X + web for decision-makers at ${projectName}. ~1-2 min.`,
    });
    try {
      const res = await fetch('/api/prospects/discovery/grok-find-pocs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: [prospectId] }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({
          title: `Find POCs failed — ${projectName}`,
          description: data.error || (data.errors?.[0] ?? 'Unknown error'),
          variant: 'destructive',
        });
      } else {
        const didEnrich = (data.enriched ?? 0) > 0;
        toast({
          title: didEnrich
            ? `POCs found — ${projectName}`
            : `No POCs found — ${projectName}`,
          description: didEnrich
            ? `${data.enriched} prospect updated · $${data.cost_usd?.toFixed(2) ?? '—'}`
            : `Grok couldn't find credible decision-makers. Try manually. $${data.cost_usd?.toFixed(2) ?? '—'}`,
          variant: didEnrich ? 'default' : 'destructive',
        });
        fetchProspects();
      }
    } catch (err: any) {
      toast({
        title: `Error — ${projectName}`,
        description: err?.message ?? 'Find POCs failed',
        variant: 'destructive',
      });
    } finally {
      setFindingPocsIds(prev => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  };

  // Grok-powered Deep Dive: reads each eligible POC's X timeline for
  // Korea / Asia signals over the chosen lookback window.
  // Open the per-row Deep Dive dialog (does NOT start the scan — user picks
  // lookback / shelf-life first, then hits Run inside the popup).
  const openRowDeepDive = (
    prospectId: string,
    projectName: string,
    xPocCount: number,
  ) => {
    setRowDeepDive(prev => ({
      ...prev,
      open: true,
      prospectId,
      projectName,
      xPocCount,
      pocHandle: null,
      pocName: null,
      // Start from the house defaults; user can change per-scan inside the popup.
      lookbackDays: DEEP_DIVE_DEFAULT_LOOKBACK_DAYS,
      shelfLifeDays: DEEP_DIVE_DEFAULT_SHELF_LIFE_DAYS,
      running: false,
      startedAt: null,
      elapsedSec: 0,
      result: null,
    }));
  };

  // Open the Deep Dive dialog targeting ONE specific POC on a prospect.
  // Same dialog, same flow — just scopes the scan to one X handle so you
  // only pay for the person you care about (e.g. "just dive the CEO").
  const openSinglePocDeepDive = (
    prospect: DiscoveryProspect,
    poc: OutreachContact,
  ) => {
    const handle = (poc.twitter_handle || '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').split(/[?/#]/)[0];
    if (!handle) return;
    setRowDeepDive(prev => ({
      ...prev,
      open: true,
      prospectId: prospect.id,
      projectName: prospect.name,
      xPocCount: 1, // single-POC scope
      pocHandle: handle,
      pocName: poc.name,
      lookbackDays: DEEP_DIVE_DEFAULT_LOOKBACK_DAYS,
      shelfLifeDays: DEEP_DIVE_DEFAULT_SHELF_LIFE_DAYS,
      running: false,
      startedAt: null,
      elapsedSec: 0,
      result: null,
    }));
  };

  // Close the per-row Deep Dive dialog. Safe to call mid-run — the fetch
  // will still complete in the background and write signals, we just stop
  // displaying progress.
  const closeRowDeepDive = () => {
    if (rowDeepDiveTimerRef.current) {
      clearInterval(rowDeepDiveTimerRef.current);
      rowDeepDiveTimerRef.current = null;
    }
    setRowDeepDive(prev => ({ ...prev, open: false }));
  };

  // Actually fires the scan — called from the Run button inside the popup.
  const startRowDeepDive = async () => {
    const prospectId = rowDeepDive.prospectId;
    const projectName = rowDeepDive.projectName;
    const xPocCount = rowDeepDive.xPocCount;
    if (!prospectId) return;

    setDeepDivingIds(prev => {
      const next = new Set(prev);
      next.add(prospectId);
      return next;
    });
    const startedAt = Date.now();
    setRowDeepDive(prev => ({ ...prev, running: true, startedAt, elapsedSec: 0, result: null }));

    // Tick the elapsed counter every 1s so the progress bar animates smoothly.
    if (rowDeepDiveTimerRef.current) clearInterval(rowDeepDiveTimerRef.current);
    rowDeepDiveTimerRef.current = setInterval(() => {
      setRowDeepDive(prev => ({ ...prev, elapsedSec: Math.floor((Date.now() - startedAt) / 1000) }));
    }, 1000);

    try {
      const res = await fetch('/api/prospects/discovery/grok-deep-dive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: [prospectId],
          // When the dialog was opened from the per-POC button, scope the
          // scan to that single handle. Otherwise scan all POCs on the
          // prospect (original behavior).
          ...(rowDeepDive.pocHandle ? { poc_handles: [rowDeepDive.pocHandle] } : {}),
          lookback_days: rowDeepDive.lookbackDays,
          shelf_life_days: rowDeepDive.shelfLifeDays,
        }),
      });
      const data = await res.json();

      if (rowDeepDiveTimerRef.current) {
        clearInterval(rowDeepDiveTimerRef.current);
        rowDeepDiveTimerRef.current = null;
      }
      setRowDeepDive(prev => ({ ...prev, running: false, result: data }));

      if (!res.ok || data.error) {
        toast({
          title: `Deep Dive failed — ${projectName}`,
          description: data.error || (data.errors?.[0] ?? 'Unknown error'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: `Deep Dive complete — ${projectName}`,
          description: `${data.pocs_scanned ?? 0} POCs scanned · ${data.signals_added ?? 0} signals added · $${data.cost_usd?.toFixed(2) ?? '—'}`,
        });
        fetchProspects();
      }
    } catch (err: any) {
      if (rowDeepDiveTimerRef.current) {
        clearInterval(rowDeepDiveTimerRef.current);
        rowDeepDiveTimerRef.current = null;
      }
      setRowDeepDive(prev => ({ ...prev, running: false, result: { error: err?.message ?? 'Deep Dive failed' } }));
      toast({
        title: `Error — ${projectName}`,
        description: err?.message ?? 'Deep Dive failed',
        variant: 'destructive',
      });
    } finally {
      setDeepDivingIds(prev => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  };

  // Clean up the per-row progress timer on unmount.
  React.useEffect(() => {
    return () => {
      if (rowDeepDiveTimerRef.current) clearInterval(rowDeepDiveTimerRef.current);
    };
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/prospects/discovery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Promote can auto-create a crm_opportunities row. Report what
      // actually happened so the user knows the CRM is in sync.
      if (status === 'promoted') {
        if (data.crm_already_existed) {
          toast({
            title: 'Promoted',
            description: 'This project was already in CRM — prospect marked as promoted.',
          });
        } else if (data.crm_opportunity_id) {
          toast({
            title: 'Promoted + added to CRM',
            description: 'New opportunity created with discovery context and signals.',
          });
        } else if (data.crm_error) {
          toast({
            title: 'Promoted (CRM partial)',
            description: data.crm_error,
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Promoted', description: 'Moved to promoted.' });
        }
      } else {
        toast({ title: 'Updated', description: `Moved to ${status.replace('_', ' ')}` });
      }
      fetchProspects();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Update failed', variant: 'destructive' });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Bulk Promote / Dismiss — fires PATCH sequentially with a small
  // throttle to stay friendly to Supabase. Reports success count +
  // first failure if any.
  const bulkUpdateStatus = async (status: 'promoted' | 'dismissed') => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const verb = status === 'promoted' ? 'Promote' : 'Dismiss';
    const ok = window.confirm(`${verb} ${ids.length} prospect${ids.length !== 1 ? 's' : ''}?`);
    if (!ok) return;

    setBulkBusy(true);
    let okCount = 0;
    let firstError: string | null = null;
    let crmAdded = 0;
    let crmAlready = 0;
    try {
      for (const id of ids) {
        try {
          const res = await fetch('/api/prospects/discovery', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            if (!firstError) firstError = data.error || res.statusText;
            continue;
          }
          okCount++;
          if (status === 'promoted') {
            if (data.crm_already_existed) crmAlready++;
            else if (data.crm_opportunity_id) crmAdded++;
          }
        } catch (err: any) {
          if (!firstError) firstError = err?.message || 'unknown';
        }
        // Small throttle so a 30-prospect bulk doesn't hammer the API
        await new Promise(r => setTimeout(r, 80));
      }
    } finally {
      setBulkBusy(false);
      clearSelection();
      const parts = [`${okCount} ${status}`];
      if (status === 'promoted') {
        parts.push(`${crmAdded} added to CRM`);
        if (crmAlready > 0) parts.push(`${crmAlready} already in CRM`);
      }
      if (firstError) parts.push(`first error: ${firstError}`);
      toast({
        title: firstError ? `Bulk ${verb} partial` : `Bulk ${verb} complete`,
        description: parts.join(' · '),
        variant: firstError ? 'destructive' : 'default',
      });
      fetchProspects();
    }
  };

  // Bulk Deep Dive — passes all selected prospect_ids to the existing
  // Grok endpoint in one request. Uses the max_pocs cap from the batch
  // dialog so this can't accidentally sweep 50+ POCs.
  const bulkDeepDive = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Rough cost preview — we don't know the actual POC-with-X count per
    // prospect without walking `prospects`, so estimate 1 POC per prospect.
    const estMin = ids.length * 0.10;
    const estMax = ids.length * 0.44; // 2 POCs × $0.22 upper bound
    const ok = window.confirm(
      `Deep Dive ${ids.length} prospect${ids.length !== 1 ? 's' : ''}?\n\n` +
      `Rough cost: $${estMin.toFixed(2)}–$${estMax.toFixed(2)}\n` +
      `Time: ~${Math.round(ids.length * 2)} min (sequential).\n` +
      `Capped at ${BULK_DEEP_DIVE_MAX_POCS} total POCs across all selected projects.`
    );
    if (!ok) return;

    setBulkBusy(true);
    toast({
      title: 'Bulk Deep Dive started',
      description: `${ids.length} prospects · capped at ${BULK_DEEP_DIVE_MAX_POCS} POCs total.`,
    });
    try {
      const res = await fetch('/api/prospects/discovery/grok-deep-dive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: ids,
          lookback_days: DEEP_DIVE_DEFAULT_LOOKBACK_DAYS,
          shelf_life_days: DEEP_DIVE_DEFAULT_SHELF_LIFE_DAYS,
          max_pocs: BULK_DEEP_DIVE_MAX_POCS,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Bulk Deep Dive failed', description: data.error || 'Unknown error', variant: 'destructive' });
      } else {
        toast({
          title: 'Bulk Deep Dive complete',
          description: `${data.pocs_scanned} POCs · ${data.signals_added} signals · $${data.cost_usd?.toFixed(2)}`,
        });
        fetchProspects();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Bulk Deep Dive failed', variant: 'destructive' });
    } finally {
      setBulkBusy(false);
      clearSelection();
    }
  };

  // Apply client-side "hide disqualified" filter. We ALWAYS keep disqualified
  // prospects in state so flipping the toggle off shows them immediately
  // (no refetch needed) — satisfies the "show rejects with reason" requirement.
  let filteredProspectsUnsorted = hideSkip
    ? prospects.filter(p => p.discovery_action_tier !== 'SKIP')
    : prospects;

  // Free-text search: matches project name, symbol, or any POC name / twitter /
  // telegram handle. Case-insensitive substring match — intentionally loose so
  // typos like "phar" still find "Pharos Network".
  const q = searchQuery.trim().toLowerCase();
  if (q.length > 0) {
    filteredProspectsUnsorted = filteredProspectsUnsorted.filter(p => {
      if (p.name?.toLowerCase().includes(q)) return true;
      if (p.symbol?.toLowerCase().includes(q)) return true;
      for (const c of p.outreach_contacts || []) {
        if (c.name?.toLowerCase().includes(q)) return true;
        if (c.twitter_handle?.toLowerCase().includes(q)) return true;
        if (c.telegram_handle?.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }

  // Apply sort if a column is selected
  const filteredProspects = (() => {
    if (!sort.field) return filteredProspectsUnsorted;
    const copy = [...filteredProspectsUnsorted];
    const dir = sort.direction === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      switch (sort.field) {
        case 'tier': {
          const av = TIER_ORDER[a.discovery_action_tier || 'SKIP'] ?? 99;
          const bv = TIER_ORDER[b.discovery_action_tier || 'SKIP'] ?? 99;
          return (av - bv) * dir;
        }
        case 'score': {
          const av = a.prospect_score?.total ?? -1;
          const bv = b.prospect_score?.total ?? -1;
          return (av - bv) * dir;
        }
        case 'funding': {
          const av = a.funding?.amount_usd ?? -1;
          const bv = b.funding?.amount_usd ?? -1;
          return (av - bv) * dir;
        }
      }
      return 0;
    });
    return copy;
  })();
  const hiddenSkipCount = hideSkip
    ? prospects.filter(p => p.discovery_action_tier === 'SKIP').length
    : 0;

  // Summary stats for the cards at top (always derived from the full prospects
  // list, ignoring the hide-disqualified toggle — we want stable counts that
  // don't flicker when the filter changes).
  const totalCount = prospects.length;
  const needsReviewCount = prospects.filter(p => p.status === 'needs_review').length;
  const hotLeadCount = prospects.filter(
    p => p.discovery_action_tier === 'REACH_OUT_NOW' || p.discovery_action_tier === 'PRE_TOKEN_PRIORITY',
  ).length;
  const withTelegramCount = prospects.filter(
    p => (p.outreach_contacts || []).some(c => c.telegram_handle && c.telegram_handle.trim()),
  ).length;

  return (
    <div className="pb-8 space-y-4">
      {/* Description + primary actions */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-600 max-w-2xl">
          AI-driven lead finder. Claude scans configurable funding sources
          (DropsTab, RootData, CryptoRank, ETHGlobal), scores each candidate
          against our ICP, and finds Telegram/X decision-maker handles.
          Use the per-row actions to deep-dive a POC's X timeline with Grok,
          draft a DM, or promote to CRM.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProspects}
            disabled={loading}
            className="h-9"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setScanOpen(true)}
            style={{ backgroundColor: 'var(--brand)', color: 'white' }}
            className="hover:opacity-90 h-9"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Run Discovery
          </Button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
            <div className="text-xs text-gray-500 mt-0.5">discovered projects</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Needs Review</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{needsReviewCount}</div>
            <div className="text-xs text-gray-500 mt-0.5">awaiting your decision</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hot Leads</span>
            </div>
            <div className="text-2xl font-bold text-red-700">{hotLeadCount}</div>
            <div className="text-xs text-gray-500 mt-0.5">Reach Out Now / Pre-Token</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Send className="h-3.5 w-3.5 text-[#229ED9]" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">With Telegram</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{withTelegramCount}</div>
            <div className="text-xs text-gray-500 mt-0.5">DM-ready POCs found</div>
          </CardContent>
        </Card>
      </div>

      {/* Status filter tabs + search + hide-disqualified toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === tab.value
                  ? 'text-white'
                  : 'text-gray-600 hover:bg-gray-100 border border-transparent'
              }`}
              style={statusFilter === tab.value ? { backgroundColor: 'var(--brand)' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search projects by name, symbol, or POC..."
              className="pl-10 focus-brand"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="hide-disqualified"
              checked={hideSkip}
              onCheckedChange={setHideSkip}
            />
            <Label htmlFor="hide-disqualified" className="text-xs text-gray-600 cursor-pointer select-none">
              Hide disqualified
              {hideSkip && hiddenSkipCount > 0 && (
                <span className="text-[10px] text-gray-400 ml-1">({hiddenSkipCount})</span>
              )}
            </Label>
          </div>
        </div>
      </div>

      {/* Bulk actions toolbar — appears only when rows are selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-brand-light border border-brand/40 rounded-lg px-3 py-2">
          <div className="text-sm font-semibold text-gray-800">
            {selectedIds.size} selected
          </div>
          <div className="h-4 w-px bg-brand/30" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              onClick={() => bulkUpdateStatus('promoted')}
              disabled={bulkBusy}
            >
              {bulkBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Promote all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs text-gray-700"
              onClick={() => bulkUpdateStatus('dismissed')}
              disabled={bulkBusy}
            >
              {bulkBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
              Dismiss all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs text-violet-700 border-violet-200 hover:bg-violet-50"
              onClick={bulkDeepDive}
              disabled={bulkBusy}
            >
              {bulkBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Radar className="h-3 w-3 mr-1" />}
              Deep Dive all
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={clearSelection}
            disabled={bulkBusy}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </CardContent>
        </Card>
      ) : filteredProspects.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
              <Sparkles className="h-6 w-6 text-gray-500" />
            </div>
            <p className="text-gray-900 font-medium text-base">
              {statusFilter === 'needs_review'
                ? 'No prospects awaiting review'
                : `No ${statusFilter.replace('_', ' ')} prospects yet`}
            </p>
            <p className="text-gray-500 text-sm mt-1 mb-5 max-w-md mx-auto">
              {statusFilter === 'needs_review'
                ? 'Run a Discovery scan to surface crypto projects with live outreach triggers from DropsTab.'
                : 'Run a scan to surface new candidates matching the SCOUT ICP framework.'}
            </p>
            <Button
              onClick={() => setScanOpen(true)}
              size="sm"
              style={{ backgroundColor: 'var(--brand)', color: 'white' }}
              className="hover:opacity-90"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              Run Discovery
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-8 px-2">
                  {(() => {
                    // Indeterminate state: some but not all visible rows selected.
                    const visible = filteredProspects.map(p => p.id);
                    const selectedVisible = visible.filter(id => selectedIds.has(id));
                    const allChecked = visible.length > 0 && selectedVisible.length === visible.length;
                    return (
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={v => {
                          if (v) setSelectedIds(new Set(visible));
                          else clearSelection();
                        }}
                        aria-label="Select all visible"
                      />
                    );
                  })()}
                </TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort('funding')}
                    className="flex items-center gap-1 group hover:text-gray-900"
                    title="Sort by funding amount"
                  >
                    <span>Funding</span>
                    {sort.field === 'funding' ? (
                      sort.direction === 'asc'
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                    )}
                  </button>
                </TableHead>
                <TableHead>Triggers</TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort('tier')}
                    className="flex items-center gap-1 group hover:text-gray-900"
                    title="Sort by action tier (hot leads first)"
                  >
                    <span>Tier</span>
                    {sort.field === 'tier' ? (
                      sort.direction === 'asc'
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                    )}
                  </button>
                </TableHead>
                {SHOW_SCORE_COLUMN && (
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleSort('score')}
                        className="flex items-center gap-1 group hover:text-gray-900"
                        title="Sort by prospect score"
                      >
                        <span>Score</span>
                        {sort.field === 'score' ? (
                          sort.direction === 'asc'
                            ? <ArrowUp className="h-3 w-3" />
                            : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />
                        )}
                      </button>
                      {/* Score rubric — shown on hover. Makes the 60/30 color
                          thresholds self-documenting instead of folklore. */}
                      <HoverCard openDelay={100} closeDelay={50}>
                        <HoverCardTrigger asChild>
                          <Info className="h-3 w-3 text-gray-400 hover:text-gray-700 cursor-help" />
                        </HoverCardTrigger>
                        <HoverCardContent side="bottom" align="start" className="w-72 text-xs">
                          <div className="font-semibold text-gray-800 mb-1.5">
                            Prospect score (0–100)
                          </div>
                          <div className="text-gray-600 mb-2">
                            Sum of three components, each 0–33:
                            ICP fit · Signal strength · Timing.
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-baseline gap-2">
                              <span className="inline-block w-10 text-right text-emerald-700 font-semibold tabular-nums">≥60</span>
                              <span className="text-gray-700">Strong — prioritize outreach now.</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="inline-block w-10 text-right text-amber-700 font-semibold tabular-nums">30–59</span>
                              <span className="text-gray-700">Borderline — review reasoning before reaching out.</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="inline-block w-10 text-right text-gray-500 font-semibold tabular-nums">&lt;30</span>
                              <span className="text-gray-700">Weak — probably nurture or skip.</span>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                  </TableHead>
                )}
                <TableHead>POC</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProspects.map(p => {
                const isExpanded = expanded.has(p.id);
                return (
                  <React.Fragment key={p.id}>
                    <TableRow className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(p.id)}>
                      <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelected(p.id)}
                          aria-label={`Select ${p.name}`}
                        />
                      </TableCell>
                      <TableCell className="px-2">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-gray-400" />
                          : <ChevronRightIcon className="h-4 w-4 text-gray-400" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <a
                            href={`/intelligence/discovery/${p.id}`}
                            onClick={e => e.stopPropagation()}
                            className="font-medium text-gray-900 hover:underline hover:text-brand"
                            title="Open prospect detail page"
                          >
                            {p.name}
                          </a>
                          {p.symbol && <span className="text-xs text-gray-500">{p.symbol}</span>}
                          {p.source_url && (
                            <a
                              href={p.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-gray-400 hover:text-gray-700"
                              title="View on DropsTab"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {p.category || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.funding?.amount_usd ? (
                          <div>
                            <div className="font-medium">{formatMoney(p.funding.amount_usd)}</div>
                            {p.funding.round && (
                              <div className="text-xs text-gray-500">{p.funding.round}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.triggers.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <HoverCard openDelay={150} closeDelay={50}>
                            <HoverCardTrigger asChild>
                              <div className="flex flex-wrap gap-1 max-w-[280px] cursor-help">
                                {p.triggers.slice(0, 2).map(t => (
                                  <Badge
                                    key={t.id}
                                    variant="outline"
                                    className="text-[10px] pointer-events-none"
                                  >
                                    {formatSignalType(t.signal_type)}
                                  </Badge>
                                ))}
                                {p.triggers.length > 2 && (
                                  <span className="text-[10px] text-gray-500">
                                    +{p.triggers.length - 2} more
                                  </span>
                                )}
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent
                              align="start"
                              side="bottom"
                              className="w-96 p-3"
                              onClick={e => e.stopPropagation()}
                            >
                              <div className="text-[11px] font-semibold text-gray-700 mb-2">
                                Triggers ({p.triggers.length})
                              </div>
                              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                {p.triggers.map(t => (
                                  <div key={t.id} className="text-[11px] border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                                    <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                      <Badge variant="outline" className="text-[9px] pointer-events-none">
                                        {formatSignalType(t.signal_type)}
                                      </Badge>
                                      {t.source_name === 'grok_x_deep_scan' && (
                                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700 pointer-events-none">
                                          GROK
                                        </span>
                                      )}
                                      {t.weight && (
                                        <span className="text-[9px] text-gray-500">w:{t.weight}</span>
                                      )}
                                      {t.source_url && (
                                        <a
                                          href={t.source_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-gray-400 hover:text-gray-700 ml-auto"
                                          title="View source"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                    </div>
                                    <div className="font-medium text-gray-900">{t.headline}</div>
                                    {t.detail && (
                                      <p className="text-gray-600 mt-0.5 line-clamp-3">{t.detail}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {p.discovery_action_tier ? (
                            <span
                              className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border pointer-events-none ${ACTION_TIER_STYLE[p.discovery_action_tier]?.className || ''}`}
                              title={p.disqualification_reason || p.consideration_reason || ''}
                            >
                              {ACTION_TIER_STYLE[p.discovery_action_tier]?.label || p.discovery_action_tier}
                            </span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                          {/* Grok-hot flag: fires when Grok's korea_interest_score
                              hits 70+. Orthogonal to tier — a REACH_OUT_NOW
                              prospect might have no Grok coverage yet, and a
                              WATCH prospect might be Grok-hot (worth re-evaluating). */}
                          {p.grok_korea_score != null && p.grok_korea_score >= 70 && (
                            <span
                              className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 pointer-events-none"
                              title={`Grok korea_interest_score: ${p.grok_korea_score}`}
                            >
                              <Radar className="h-2.5 w-2.5" />
                              GROK-HOT {p.grok_korea_score}
                            </span>
                          )}
                          {/* KR-listing badge — set by the KR exchanges cron
                              when this prospect just listed on Upbit/Bithumb.
                              Means "no Korea presence yet" no longer holds —
                              BD needs to change angle or dismiss. Red because
                              it's a hard ICP-violation signal. */}
                          {p.post_korea_listing_at && (
                            <span
                              className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 pointer-events-none"
                              title={`Listed on ${p.post_korea_listing_exchange} (${p.post_korea_listing_market_pair}) on ${new Date(p.post_korea_listing_at).toLocaleString()}`}
                            >
                              📍 LISTED ON {String(p.post_korea_listing_exchange || '').toUpperCase()}
                              <span className="font-normal text-red-600 ml-0.5">
                                {timeAgo(p.post_korea_listing_at)}
                              </span>
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {SHOW_SCORE_COLUMN && (
                        <TableCell>
                          {p.prospect_score?.total != null ? (
                            <span className={`text-sm font-semibold ${
                              p.prospect_score.total >= 60 ? 'text-emerald-700' :
                              p.prospect_score.total >= 30 ? 'text-amber-700' :
                              'text-gray-500'
                            }`}>
                              {p.prospect_score.total}<span className="text-xs text-gray-400">/100</span>
                            </span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </TableCell>
                      )}
                      <TableCell>
                        {p.outreach_contacts && p.outreach_contacts.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-gray-700">
                              {p.outreach_contacts[0].name}
                              <span className="text-gray-400 ml-1">· {p.outreach_contacts[0].role}</span>
                              {!p.outreach_contacts[0].telegram_handle && (
                                <span className="ml-1 text-[9px] text-amber-600 font-semibold">(No TG)</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {telegramUrl(p.outreach_contacts[0].telegram_handle) && (
                                <a
                                  href={telegramUrl(p.outreach_contacts[0].telegram_handle)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-[#229ED9] hover:opacity-80"
                                  title={`Telegram: ${p.outreach_contacts[0].telegram_handle}`}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                </a>
                              )}
                              {twitterUrl(p.outreach_contacts[0].twitter_handle) && (
                                <a
                                  href={twitterUrl(p.outreach_contacts[0].twitter_handle)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-gray-500 hover:text-[#1DA1F2]"
                                  title={`X: ${p.outreach_contacts[0].twitter_handle}`}
                                >
                                  <Twitter className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <span
                                className={`text-[9px] font-semibold px-1 py-0.5 rounded pointer-events-none ${CONTACT_CONFIDENCE_STYLE[p.outreach_contacts[0].confidence]}`}
                                title={`Confidence: ${p.outreach_contacts[0].confidence}`}
                              >
                                {p.outreach_contacts[0].confidence[0].toUpperCase()}
                              </span>
                              {p.outreach_contacts.length > 1 && (
                                <span className="text-[10px] text-gray-500">+{p.outreach_contacts.length - 1}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No POC found</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end flex-wrap" onClick={e => e.stopPropagation()}>
                          {/* Find POCs button (Grok) — only shown when the
                              prospect has fewer than 3 POCs. Re-runnable if
                              the first attempt missed some. */}
                          {(() => {
                            const pocCount = (p.outreach_contacts || []).length;
                            if (pocCount >= 3) return null;
                            const isSkip = p.discovery_action_tier === 'SKIP';
                            const isFinding = findingPocsIds.has(p.id);
                            const disabled = isSkip || isFinding;
                            const title = isSkip
                              ? 'Disqualified — POC search disabled'
                              : isFinding
                                ? 'Searching X + web for POCs…'
                                : pocCount === 0
                                  ? 'Find 1-3 decision-maker handles with Grok (~$0.20, ~1-2 min)'
                                  : `Find more POCs (currently ${pocCount}) with Grok`;
                            return (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-amber-700 border-amber-200 hover:bg-amber-50 disabled:text-gray-300 disabled:border-gray-200"
                                onClick={() => runFindPocsForProspect(p.id, p.name)}
                                disabled={disabled}
                                title={title}
                              >
                                {isFinding
                                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  : <UserSearch className="h-3 w-3 mr-1" />}
                                {pocCount === 0 ? 'Find POCs' : 'Find more'}
                              </Button>
                            );
                          })()}
                          {(() => {
                            const xPocCount = (p.outreach_contacts || []).filter(c => !!c.twitter_handle).length;
                            const isSkip = p.discovery_action_tier === 'SKIP';
                            const isDiving = deepDivingIds.has(p.id);
                            const disabled = xPocCount === 0 || isSkip || isDiving;
                            // Cooldown: if last deep dive was under 24h ago,
                            // warn the user via confirm() so they don't pay
                            // $0.22 to re-scan a fresh prospect by accident.
                            const lastDiveAgo = timeAgo(p.last_deep_dive_at);
                            const isRecent = (() => {
                              if (!p.last_deep_dive_at) return false;
                              const hrs = (Date.now() - new Date(p.last_deep_dive_at).getTime()) / 3_600_000;
                              return hrs < DEEP_DIVE_COOLDOWN_HOURS;
                            })();
                            const title = xPocCount === 0
                              ? 'No POC with X handle — run Find POCs first'
                              : isSkip
                                ? 'Disqualified — deep dive disabled'
                                : isDiving
                                  ? 'Deep dive in progress…'
                                  : isRecent
                                    ? `Already scanned ${lastDiveAgo}. Click to re-scan (confirm required).`
                                    : lastDiveAgo
                                      ? `Scanned ${lastDiveAgo}. Re-run Grok deep dive on ${xPocCount} X timeline${xPocCount !== 1 ? 's' : ''}.`
                                      : `Configure and run Grok deep dive on ${xPocCount} X timeline${xPocCount !== 1 ? 's' : ''}`;
                            const handleClick = () => {
                              if (isRecent) {
                                const ok = window.confirm(
                                  `${p.name} was deep-dived ${lastDiveAgo}. Re-scan anyway? Costs ~$${(xPocCount * 0.22).toFixed(2)}.`
                                );
                                if (!ok) return;
                              }
                              openRowDeepDive(p.id, p.name, xPocCount);
                            };
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-violet-700 border-violet-200 hover:bg-violet-50 disabled:text-gray-300 disabled:border-gray-200"
                                  onClick={handleClick}
                                  disabled={disabled}
                                  title={title}
                                >
                                  {isDiving
                                    ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    : <Radar className="h-3 w-3 mr-1" />}
                                  Deep Dive
                                </Button>
                                {lastDiveAgo && !isDiving && (
                                  <span className={`text-[9px] tabular-nums ${isRecent ? 'text-amber-600' : 'text-gray-400'}`}>
                                    {isRecent ? '⚠ ' : ''}scanned {lastDiveAgo}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {p.status !== 'promoted' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                              onClick={() => updateStatus(p.id, 'promoted')}
                              title="Promote to pipeline"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Promote
                            </Button>
                          )}
                          {p.status !== 'dismissed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-gray-600"
                              onClick={() => updateStatus(p.id, 'dismissed')}
                              title="Dismiss"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Dismiss
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableCell colSpan={10} className="py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                            {/* Verdict summary + reasons */}
                            <div className="md:col-span-2">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                {p.icp_verdict && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded pointer-events-none ${VERDICT_STYLE[p.icp_verdict]}`}>
                                    ICP: {p.icp_verdict}
                                  </span>
                                )}
                                {SHOW_SCORE_COLUMN && p.prospect_score && (
                                  <span className="text-[10px] text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 pointer-events-none">
                                    Score: {p.prospect_score.icp_fit}+{p.prospect_score.signal_strength}+{p.prospect_score.timing} = {p.prospect_score.total}/100
                                  </span>
                                )}
                              </div>
                              {p.disqualification_reason && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-2">
                                  <h4 className="font-semibold text-red-700 text-xs mb-0.5">Disqualified</h4>
                                  <p className="text-red-700 text-xs">{p.disqualification_reason}</p>
                                </div>
                              )}
                              {p.consideration_reason && !p.disqualification_reason && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-2">
                                  <h4 className="font-semibold text-amber-700 text-xs mb-0.5">Reason to consider</h4>
                                  <p className="text-amber-700 text-xs">{p.consideration_reason}</p>
                                </div>
                              )}
                              {p.fit_reasoning && (
                                <div>
                                  <h4 className="font-semibold text-gray-700 mb-1">Why they're a fit</h4>
                                  <p className="text-gray-600">{p.fit_reasoning}</p>
                                </div>
                              )}
                            </div>

                            {/* ICP checklist */}
                            {p.icp_checks && (
                              <div className="md:col-span-2">
                                <h4 className="font-semibold text-gray-700 mb-2">ICP Checklist</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                  {Object.entries(ICP_CRITERIA_LABELS).map(([key, label]) => {
                                    const check = (p.icp_checks as any)[key] as IcpCheck | undefined;
                                    if (!check) return null;
                                    return (
                                      <div key={key} className="flex items-start gap-2 text-xs bg-white border rounded px-2 py-1.5">
                                        {check.pass ? (
                                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                        ) : (
                                          <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className={`font-medium ${check.pass ? 'text-gray-900' : 'text-red-700'}`}>{label}</div>
                                          <div className="text-gray-600 text-[11px]">{check.evidence}</div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Funding detail */}
                            {p.funding && (p.funding.amount_usd || p.funding.investors?.length) && (
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1">Funding</h4>
                                {p.funding.amount_usd && (
                                  <div className="text-gray-600">
                                    <span className="font-medium">{formatMoney(p.funding.amount_usd)}</span>
                                    {p.funding.round && ` · ${p.funding.round}`}
                                    {p.funding.date && ` · ${p.funding.date}`}
                                  </div>
                                )}
                                {p.funding.investors && p.funding.investors.length > 0 && (
                                  <div className="text-gray-600 mt-1">
                                    <span className="text-xs text-gray-500">Investors: </span>
                                    {p.funding.investors.join(', ')}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Outreach contacts — the humans to DM */}
                            <div className="md:col-span-2">
                              <h4 className="font-semibold text-gray-700 mb-2">
                                Outreach POCs ({p.outreach_contacts?.length || 0})
                                <span className="font-normal text-xs text-gray-500 ml-2">— individual handles for cold BD, not the project community channel</span>
                              </h4>
                              {!p.outreach_contacts || p.outreach_contacts.length === 0 ? (
                                <p className="text-xs text-gray-500 italic">No decision-maker handles found. Worth a manual search on X.</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {p.outreach_contacts.map((c, i) => {
                                    const key = `${p.id}|${i}`;
                                    const pocActionBusy = pocActionInFlight.has(key);
                                    const needsReview = !!c.is_grok_sourced;
                                    return (
                                    <div
                                      key={i}
                                      className={`border rounded-lg p-2.5 text-xs transition-opacity ${
                                        pocActionBusy ? 'opacity-50' : ''
                                      } ${
                                        needsReview ? 'bg-amber-50 border-amber-200' : 'bg-white'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-gray-900">{c.name}</span>
                                            <span className={`text-[9px] font-semibold px-1 py-0.5 rounded pointer-events-none ${CONTACT_CONFIDENCE_STYLE[c.confidence]}`}>
                                              {c.confidence}
                                            </span>
                                            {needsReview && (
                                              <span
                                                className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 pointer-events-none"
                                                title="Found by Grok — human hasn't verified this name/handle matches"
                                              >
                                                <AlertTriangle className="h-2.5 w-2.5" />
                                                UNVERIFIED
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-gray-500 text-[11px]">{c.role}</div>
                                          {c.notes && (
                                            <p className="text-gray-600 text-[11px] mt-1">{c.notes}</p>
                                          )}
                                          {needsReview && (
                                            <div className="flex items-center gap-1.5 mt-2">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-6 text-[10px] text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                                onClick={() => confirmOrDeletePoc(p.id, i, c.name, 'confirm')}
                                                disabled={pocActionBusy}
                                                title="Mark this POC as human-verified"
                                              >
                                                <CheckCircle className="h-2.5 w-2.5 mr-1" />
                                                Confirm
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-6 text-[10px] text-red-700 border-red-200 hover:bg-red-50"
                                                onClick={() => confirmOrDeletePoc(p.id, i, c.name, 'delete')}
                                                disabled={pocActionBusy}
                                                title="Remove this POC (hallucination / wrong person)"
                                              >
                                                <XCircle className="h-2.5 w-2.5 mr-1" />
                                                Remove
                                              </Button>
                                            </div>
                                          )}
                                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                            {twitterUrl(c.twitter_handle) && (
                                              <a
                                                href={twitterUrl(c.twitter_handle)!}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[11px] text-gray-600 hover:text-[#1DA1F2] flex items-center gap-1"
                                              >
                                                <Twitter className="h-3 w-3" />
                                                {c.twitter_handle?.replace(/^https?:\/\/[^/]+\//, '@').replace(/^@@/, '@')}
                                              </a>
                                            )}
                                            {telegramUrl(c.telegram_handle) ? (
                                              <a
                                                href={telegramUrl(c.telegram_handle)!}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[11px] text-gray-600 hover:text-[#229ED9] flex items-center gap-1"
                                              >
                                                <Send className="h-3 w-3" />
                                                {c.telegram_handle?.replace(/^https?:\/\/[^/]+\//, '@').replace(/^@@/, '@')}
                                              </a>
                                            ) : (
                                              <span className="text-[10px] text-amber-600 italic">No TG found</span>
                                            )}
                                          </div>
                                          {/* Per-POC action row — Deep Dive
                                              needs an X handle. Draft DM is
                                              gated off until the feature is
                                              finalized (shows as disabled
                                              "Coming soon" placeholder). */}
                                          {(c.telegram_handle || c.twitter_handle) && (
                                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                              {(c.telegram_handle || c.twitter_handle) && (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-6 text-[10px] text-gray-400 border-gray-200 bg-gray-50 cursor-not-allowed"
                                                  disabled
                                                  title="Draft DM is coming soon — not yet ready to ship."
                                                  aria-disabled="true"
                                                >
                                                  <MessageSquare className="h-2.5 w-2.5 mr-1" />
                                                  Draft DM
                                                  <span className="ml-1 text-[8px] font-bold px-1 py-0.5 rounded bg-gray-200 text-gray-500">
                                                    SOON
                                                  </span>
                                                </Button>
                                              )}
                                              {c.twitter_handle && p.discovery_action_tier !== 'SKIP' && (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-6 text-[10px] text-violet-700 border-violet-200 hover:bg-violet-50"
                                                  onClick={() => openSinglePocDeepDive(p, c)}
                                                  title={`Deep dive @${(c.twitter_handle||'').replace(/^@/,'')} — ~$0.22, ~2 min`}
                                                >
                                                  <Radar className="h-2.5 w-2.5 mr-1" />
                                                  Deep Dive
                                                </Button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        {c.source_url && (
                                          <a
                                            href={c.source_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-gray-400 hover:text-gray-700 shrink-0"
                                            title="Where we found this contact"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Project community channels (for monitoring, not outreach) */}
                            {(p.twitter_url || p.telegram_url || p.website_url) && (
                              <div className="md:col-span-2">
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">Community channels <span className="font-normal text-gray-500">(not for outreach)</span></h4>
                                <div className="flex items-center gap-3 text-xs">
                                  {p.website_url && (
                                    <a href={p.website_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-900 flex items-center gap-1">
                                      <Globe className="h-3 w-3" /> Website
                                    </a>
                                  )}
                                  {p.twitter_url && (
                                    <a href={p.twitter_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#1DA1F2] flex items-center gap-1">
                                      <Twitter className="h-3 w-3" /> Project X
                                    </a>
                                  )}
                                  {p.telegram_url && (
                                    <a href={p.telegram_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#229ED9] flex items-center gap-1">
                                      <Send className="h-3 w-3" /> Community TG
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Last Deep Dive summary — only if the prospect
                                has been Grok-scanned. Shows scan recency, max
                                Grok korea score, and links to the raw run. */}
                            {p.last_deep_dive_at && (
                              <div className="md:col-span-2">
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs flex items-center gap-1.5">
                                  <Radar className="h-3 w-3 text-violet-600" />
                                  Last Deep Dive
                                </h4>
                                <div className="bg-violet-50 border border-violet-200 rounded-lg p-2.5 text-xs">
                                  <div className="flex items-center gap-2 flex-wrap text-gray-700">
                                    <span>Scanned <span className="font-semibold">{timeAgo(p.last_deep_dive_at)}</span></span>
                                    <span className="text-gray-400">·</span>
                                    <span>
                                      {p.triggers.filter(t => t.source_name === 'grok_x_deep_scan').length} Grok signal
                                      {p.triggers.filter(t => t.source_name === 'grok_x_deep_scan').length !== 1 ? 's' : ''}
                                    </span>
                                    {p.last_deep_dive_cost_usd != null && (
                                      <>
                                        <span className="text-gray-400">·</span>
                                        <span className="tabular-nums">
                                          Cost: <span className="font-semibold">${p.last_deep_dive_cost_usd.toFixed(2)}</span>
                                        </span>
                                      </>
                                    )}
                                    {p.grok_korea_score != null && (
                                      <>
                                        <span className="text-gray-400">·</span>
                                        <span>
                                          Korea interest:{' '}
                                          <span className={`font-semibold ${
                                            p.grok_korea_score >= 70 ? 'text-emerald-700' :
                                            p.grok_korea_score >= 40 ? 'text-amber-700' :
                                            'text-gray-600'
                                          }`}>
                                            {p.grok_korea_score}/100
                                          </span>
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* All triggers */}
                            <div className="md:col-span-2">
                              <h4 className="font-semibold text-gray-700 mb-2">Triggers ({p.triggers.length})</h4>
                              <div className="space-y-2">
                                {p.triggers.map(t => {
                                  const isDeleting = deletingSignalIds.has(t.id);
                                  return (
                                    <div
                                      key={t.id}
                                      className={`border rounded-lg p-2.5 text-xs transition-opacity ${
                                        isDeleting ? 'opacity-50' : ''
                                      } ${
                                        t.source_name === 'grok_x_deep_scan'
                                          ? 'bg-violet-50/40 border-violet-200'
                                          : 'bg-white'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant="outline" className="text-[10px] pointer-events-none">
                                              {formatSignalType(t.signal_type)}
                                            </Badge>
                                            {t.source_name === 'grok_x_deep_scan' && (
                                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 pointer-events-none">
                                                <Radar className="h-2.5 w-2.5" />
                                                GROK
                                              </span>
                                            )}
                                            {t.source_type && (
                                              <Badge
                                                variant="outline"
                                                className={`text-[10px] pointer-events-none ${
                                                  t.source_type === 'tweet' ? 'bg-brand-light text-[#1DA1F2]' : ''
                                                }`}
                                              >
                                                {t.source_type === 'tweet' ? 'X' : t.source_type}
                                              </Badge>
                                            )}
                                            {t.weight && (
                                              <span className="text-[10px] text-gray-500">weight: {t.weight}</span>
                                            )}
                                            {t.detected_at && (
                                              <span className="text-[10px] text-gray-400">· {timeAgo(t.detected_at)}</span>
                                            )}
                                          </div>
                                          <div className="font-medium text-gray-900 mt-1">{t.headline}</div>
                                          {t.detail && (
                                            <p className="text-gray-600 mt-0.5">{t.detail}</p>
                                          )}
                                        </div>
                                        <div className="flex items-start gap-1 shrink-0">
                                          {t.source_url && (
                                            <a
                                              href={t.source_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-gray-400 hover:text-gray-700 p-0.5"
                                              title="View source"
                                            >
                                              <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => deleteSignal(t.id, t.headline)}
                                            disabled={isDeleting}
                                            className="text-gray-400 hover:text-red-600 p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Delete this signal (soft delete — DB row stays)"
                                            aria-label="Delete signal"
                                          >
                                            {isDeleting
                                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              : <Trash2 className="h-3.5 w-3.5" />}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Scan config dialog */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run Discovery Scan</DialogTitle>
            <DialogDescription>
              Stage 1 fires one parallel Claude call per selected source, then Stage 2 enriches
              each candidate (POC hunt with Telegram priority, ICP check, score). Expect 30-90s
              and ~$0.30-$1 per run depending on source count.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="recency">Recency (days)</Label>
                <Input
                  id="recency"
                  type="number"
                  value={scanParams.recency_days}
                  onChange={e => setScanParams(p => ({ ...p, recency_days: e.target.value }))}
                  className="focus-brand mt-1"
                />
              </div>
              <div>
                <Label htmlFor="minraise">Min raise (USD)</Label>
                <Input
                  id="minraise"
                  type="number"
                  value={scanParams.min_raise_usd}
                  onChange={e => setScanParams(p => ({ ...p, min_raise_usd: e.target.value }))}
                  className="focus-brand mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="maxproj">Max projects</Label>
              <Input
                id="maxproj"
                type="number"
                value={scanParams.max_projects}
                onChange={e => setScanParams(p => ({ ...p, max_projects: e.target.value }))}
                className="focus-brand mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Higher = more coverage, more cost. 20 is a good default.</p>
            </div>
            <div>
              <Label htmlFor="cats">Categories (optional)</Label>
              <Input
                id="cats"
                value={scanParams.categories}
                onChange={e => setScanParams(p => ({ ...p, categories: e.target.value }))}
                className="focus-brand mt-1"
                placeholder="DeFi, Gaming, AI"
              />
              <p className="text-xs text-gray-500 mt-1">Comma-separated. Leave blank to scan all.</p>
            </div>

            <div>
              <Label className="mb-1.5 block">
                Sources
                <span className="font-normal text-[10px] text-gray-500 ml-1">
                  — click to toggle; at least one must stay selected
                </span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {DISCOVERY_SOURCE_CARDS.map(card => {
                  const selected = scanParams.sources.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => toggleScanSource(card.id)}
                      className={`text-left rounded-lg border p-2.5 transition-colors ${
                        selected
                          ? 'border-brand bg-brand-light ring-1 ring-brand'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-xs font-semibold text-gray-900 flex items-center gap-1">
                        {card.title}
                        {selected && <CheckCircle className="h-3 w-3 text-brand" />}
                      </div>
                      <div className="text-[10px] text-gray-600 mt-0.5">{card.oneLiner}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{card.footnote}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                Each source is a public HTML page Claude reads via web_search. Sources fire
                in PARALLEL — each gets its own 12-search budget so they don&apos;t compete
                for context. Adding sources adds linear cost (~$0.05-0.20 per source) but
                widens the candidate pool meaningfully. RootData and DeFiLlama are the best
                additions for broader funding coverage; ETHGlobal is orthogonal (pre-funding
                hackathon winners — frequently returns 0 against the $1M+ raise filter).
              </p>
            </div>

            <div>
              <Label className="mb-1.5 block">Model</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScanParams(p => ({ ...p, model: 'opus' }))}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${
                    scanParams.model === 'opus'
                      ? 'border-brand bg-brand-light ring-1 ring-brand'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-900">Opus 4.7</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">Thorough · Better judgment</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">~$2-$6 per scan</div>
                </button>
                <button
                  type="button"
                  onClick={() => setScanParams(p => ({ ...p, model: 'sonnet' }))}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${
                    scanParams.model === 'sonnet'
                      ? 'border-brand bg-brand-light ring-1 ring-brand'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-900">Sonnet 4.5</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">Fast · Cheaper</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">~$0.40-$1.50 per scan</div>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                Opus is better at POC accuracy and edge-case ICP judgment. Sonnet is fine for bulk/experimental scans. Scans now run in parallel batches with prompt caching, so costs are 2-3x lower than before.
              </p>
            </div>

            {/* Live progress (while scanning, AND for the post-scan
                summary so users see the final detail block). When
                `scanning` is false but `scanProgress.detail` is set,
                the dialog still renders the panel — useful for "what
                did the last scan actually find" without scrolling
                back to a separate Last scan card. */}
            {scanProgress && (
              <div className="rounded-lg border border-brand/40 bg-brand-light p-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {scanning ? (
                      <Loader2 className="h-3.5 w-3.5 text-brand animate-spin shrink-0" />
                    ) : scanProgress.stage === 'failed' ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span className="font-semibold text-gray-800">
                      {scanProgress.message || 'Scanning...'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-gray-600 tabular-nums">
                    {typeof scanProgress.percent === 'number' ? `${scanProgress.percent}%` : ''}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-white/60 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${Math.max(2, Math.min(100, scanProgress.percent ?? 0))}%`,
                      backgroundColor: 'var(--brand)',
                    }}
                  />
                </div>

                {/* Top-line stats — always visible. Shows running totals
                    so the user has a number to track without expanding. */}
                {(scanProgress.candidates_found != null || scanProgress.batches_total != null) && (
                  <div className="text-[10px] text-gray-600 flex items-center gap-3 flex-wrap">
                    {scanProgress.candidates_found != null && (
                      <span><span className="text-gray-400">Candidates:</span> <span className="font-semibold text-gray-800">{scanProgress.candidates_found}</span></span>
                    )}
                    {scanProgress.batches_total != null && (
                      <span><span className="text-gray-400">Batches:</span> <span className="font-semibold text-gray-800">{scanProgress.batches_complete ?? 0} / {scanProgress.batches_total}</span></span>
                    )}
                    {scanProgress.detail?.enriched && scanProgress.detail.enriched.length > 0 && (
                      <span><span className="text-gray-400">Enriched:</span> <span className="font-semibold text-gray-800">{scanProgress.detail.enriched.length}</span></span>
                    )}
                  </div>
                )}

                {/* Per-source mini-chips — appear as soon as Stage 1 settles.
                    Tells the user where candidates came from at a glance,
                    e.g. "DropsTab 7 · DefiLlama 4 · ETHGlobal 0". */}
                {scanProgress.detail?.sources?.per_source_counts && Object.keys(scanProgress.detail.sources.per_source_counts).length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    {Object.entries(scanProgress.detail.sources.per_source_counts).map(([src, n]) => (
                      <span
                        key={src}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                          n === 0
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-white/70 text-gray-700 border border-gray-200'
                        }`}
                        title={n === 0 ? `${src} returned no candidates this scan` : undefined}
                      >
                        {src} <span className={`font-mono font-semibold ${n === 0 ? 'text-gray-400' : 'text-brand'}`}>{n}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Show details toggle — the heavy stuff is hidden by
                    default to keep the dialog compact. Expanding reveals
                    filtered names, the enriched list, batch errors. */}
                {scanProgress.detail && (
                  <>
                    <button
                      type="button"
                      onClick={() => setProgressDetailOpen(o => !o)}
                      className="flex items-center gap-1 text-[10px] text-brand hover:underline pt-0.5"
                    >
                      {progressDetailOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
                      {progressDetailOpen ? 'Hide details' : 'Show details'}
                    </button>

                    {progressDetailOpen && (
                      <div className="space-y-2 pt-1 border-t border-brand/20">
                        {/* Filtered out — what got dropped pre-Stage-2 and why */}
                        {scanProgress.detail.filtered && (
                          <div>
                            <div className="text-[10px] font-semibold text-gray-700 mb-0.5">Filtered out</div>
                            <div className="text-[10px] text-gray-600 flex items-center gap-3 flex-wrap">
                              {scanProgress.detail.filtered.recent_skipped != null && (
                                <span>Recently scanned: <span className="font-semibold">{scanProgress.detail.filtered.recent_skipped}</span></span>
                              )}
                              {scanProgress.detail.filtered.crm_skipped_total != null && (
                                <span>Active CRM: <span className="font-semibold">{scanProgress.detail.filtered.crm_skipped_total}</span></span>
                              )}
                              {scanProgress.detail.filtered.crm_filtered_names && scanProgress.detail.filtered.crm_filtered_names.items.length > 0 && (
                                <span>Dropped this scan: <span className="font-semibold">{scanProgress.detail.filtered.crm_filtered_names.items.length + (scanProgress.detail.filtered.crm_filtered_names.truncated || 0)}</span></span>
                              )}
                            </div>
                            {scanProgress.detail.filtered.crm_filtered_names && scanProgress.detail.filtered.crm_filtered_names.items.length > 0 && (
                              <div className="mt-1 text-[10px] text-gray-500 italic">
                                {scanProgress.detail.filtered.crm_filtered_names.items.join(', ')}
                                {scanProgress.detail.filtered.crm_filtered_names.truncated > 0 && ` +${scanProgress.detail.filtered.crm_filtered_names.truncated} more`}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Enriched list — rolling, oldest first since that's
                            the order Claude returned them. Tier-coloured chip
                            per row + score + POC count. */}
                        {scanProgress.detail.enriched && scanProgress.detail.enriched.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-gray-700 mb-0.5">Enriched ({scanProgress.detail.enriched.length})</div>
                            <div className="space-y-0.5 max-h-40 overflow-y-auto">
                              {scanProgress.detail.enriched.slice().reverse().map((e, idx) => (
                                <div key={`${e.name}-${idx}`} className="flex items-center justify-between gap-2 py-0.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[10px] text-gray-800 truncate">{e.name}</span>
                                    {e.tier && (
                                      <span
                                        className={`text-[9px] px-1 rounded font-semibold whitespace-nowrap ${
                                          e.tier === 'REACH_OUT_NOW' ? 'bg-emerald-100 text-emerald-700' :
                                          e.tier === 'PRE_TOKEN_PRIORITY' ? 'bg-blue-100 text-blue-700' :
                                          e.tier === 'RESEARCH' ? 'bg-amber-100 text-amber-700' :
                                          e.tier === 'WATCH' ? 'bg-purple-100 text-purple-700' :
                                          e.tier === 'NURTURE' ? 'bg-gray-100 text-gray-600' :
                                          e.tier === 'SKIP' ? 'bg-red-50 text-red-500' :
                                          'bg-gray-100 text-gray-500'
                                        }`}
                                      >
                                        {e.tier.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-gray-500 shrink-0">
                                    {e.score != null && <span className="tabular-nums">{e.score}</span>}
                                    {e.poc_count > 0 && <span>{e.poc_count} POC</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tier breakdown — appears at writing-stage when
                            tier_breakdown is populated. Compact summary. */}
                        {scanProgress.detail.tier_breakdown && Object.keys(scanProgress.detail.tier_breakdown).length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-gray-700 mb-0.5">By tier</div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {Object.entries(scanProgress.detail.tier_breakdown).map(([tier, n]) => (
                                <span key={tier} className="text-[10px] text-gray-600">
                                  {tier.replace(/_/g, ' ')} <span className="font-semibold text-gray-800">{n}</span>
                                </span>
                              )).reduce((acc: any[], el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} className="text-gray-300">·</span>, el], [])}
                            </div>
                          </div>
                        )}

                        {/* Source errors / batch errors — only visible if
                            something went wrong. Helps explain "why DropsTab
                            returned 0" without diving into agent_runs SQL. */}
                        {((scanProgress.detail.sources?.errors?.length ?? 0) > 0 ||
                          (scanProgress.detail.batch_errors?.length ?? 0) > 0) && (
                          <div>
                            <div className="text-[10px] font-semibold text-red-700 mb-0.5">Errors</div>
                            <ul className="text-[10px] text-red-600 space-y-0.5">
                              {scanProgress.detail.sources?.errors?.map((e, i) => (
                                <li key={`s-${i}`} className="truncate" title={e}>· {e}</li>
                              ))}
                              {scanProgress.detail.batch_errors?.map((e, i) => (
                                <li key={`b-${i}`} className="truncate" title={e}>· {e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {lastScanResult && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
                <div className="font-semibold text-gray-700">Last scan</div>
                {lastScanResult.error ? (
                  <div className="text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {lastScanResult.error}
                  </div>
                ) : (
                  <>
                    <div>Found: {lastScanResult.projects_found} · New: {lastScanResult.inserted} · Triggers: {lastScanResult.signals_added}</div>
                    <div>Cost: ${lastScanResult.cost_usd?.toFixed(3) ?? '—'} · Duration: {Math.round((lastScanResult.duration_ms || 0) / 1000)}s</div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScanOpen(false)} disabled={scanning}>
              Close
            </Button>
            <Button
              onClick={runScan}
              disabled={scanning}
              style={{ backgroundColor: 'var(--brand)', color: 'white' }}
              className="hover:opacity-90"
            >
              {scanning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {scanning ? 'Scanning...' : 'Start Scan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NOTE: The old "Unified Scan" batch dialog (POC Lookup + Deep
          Dive X + Both mode picker, 340 lines of JSX) was removed in
          favor of per-row actions. Users now run POC Lookup via the
          amber "Find POCs" row button (always Grok) and Deep Dive via
          the violet row button (per-POC popup). Bulk actions cover the
          "do it for multiple prospects at once" use case. */}

      {/* Per-prospect Deep Dive dialog — opened from the row Deep Dive button.
          Styled to match the Run Discovery + batch Scan dialogs:
          brand teal accent (#3e8692), amber cost card, same progress structure. */}
      <Dialog
        open={rowDeepDive.open}
        onOpenChange={o => { if (!o && !rowDeepDive.running) closeRowDeepDive(); }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deep Dive</DialogTitle>
            <DialogDescription>
              Grok reads each POC's X timeline for Korea / Asia relevance signals.
              Target: <span className="font-semibold text-gray-900">{rowDeepDive.projectName}</span>
              {' · '}
              {rowDeepDive.pocHandle ? (
                <>
                  1 POC (<span className="font-mono">@{rowDeepDive.pocHandle}</span>
                  {rowDeepDive.pocName && <> · {rowDeepDive.pocName}</>})
                </>
              ) : (
                <>{rowDeepDive.xPocCount} POC{rowDeepDive.xPocCount !== 1 ? 's' : ''} with X handle</>
              )}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Lookback window */}
            <div>
              <Label htmlFor="row-lookback">Lookback window</Label>
              <Select
                value={String(rowDeepDive.lookbackDays)}
                onValueChange={v => setRowDeepDive(prev => ({ ...prev, lookbackDays: Number(v) as 30 | 90 | 180 | 365 }))}
                disabled={rowDeepDive.running}
              >
                <SelectTrigger id="row-lookback" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days — very recent / active signals</SelectItem>
                  <SelectItem value="90">Last 90 days — balanced (default)</SelectItem>
                  <SelectItem value="180">Last 6 months — broader pattern</SelectItem>
                  <SelectItem value="365">Last 12 months — historical</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                How far back Grok looks when reading the POC's tweets.
              </p>
            </div>

            {/* Signal shelf life */}
            <div>
              <Label htmlFor="row-shelf">Signal shelf life</Label>
              <Select
                value={String(rowDeepDive.shelfLifeDays)}
                onValueChange={v => setRowDeepDive(prev => ({ ...prev, shelfLifeDays: Number(v) as 7 | 14 | 30 | 60 | 90 }))}
                disabled={rowDeepDive.running}
              >
                <SelectTrigger id="row-shelf" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days — very fresh only</SelectItem>
                  <SelectItem value="14">14 days — short-term actionable</SelectItem>
                  <SelectItem value="30">30 days — standard (default)</SelectItem>
                  <SelectItem value="60">60 days — extended</SelectItem>
                  <SelectItem value="90">90 days — long-lived (use sparingly)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                How long resulting signals stay "fresh" on the prospect before expiring.
              </p>
            </div>

            {/* Cost + time estimate — matches the amber box in the batch Scan dialog */}
            {!rowDeepDive.running && !rowDeepDive.result && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
                <p className="font-semibold mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Estimated cost
                </p>
                <p>
                  {rowDeepDive.xPocCount} POC{rowDeepDive.xPocCount !== 1 ? 's' : ''} × Grok deep dive: roughly{' '}
                  <strong>${(rowDeepDive.xPocCount * 0.10).toFixed(2)} to ${(rowDeepDive.xPocCount * 0.30).toFixed(2)}</strong>
                  <span className="text-amber-700">
                    {' · '}
                    ~{rowDeepDive.xPocCount * 2} min
                  </span>
                </p>
              </div>
            )}

            {/* Live progress — same structure / brand colors as the Run Discovery
                dialog's progress card. Time-based since the API doesn't stream. */}
            {rowDeepDive.running && (() => {
              const expectedSec = Math.max(30, rowDeepDive.xPocCount * 110);
              const pct = Math.min(95, Math.floor((rowDeepDive.elapsedSec / expectedSec) * 100));
              const pocIndex = Math.min(rowDeepDive.xPocCount, Math.floor(rowDeepDive.elapsedSec / 110) + 1);
              const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
              return (
                <div className="rounded-lg border border-brand/40 bg-brand-light p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 text-brand animate-spin shrink-0" />
                      <span className="font-semibold text-gray-800">
                        {rowDeepDive.xPocCount > 1
                          ? `Reading X timeline ${pocIndex} of ${rowDeepDive.xPocCount}…`
                          : 'Reading X timeline with Grok…'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-600 tabular-nums">
                      {mmss(rowDeepDive.elapsedSec)} / ~{mmss(expectedSec)} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        backgroundColor: 'var(--brand)',
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-600">
                    Grok pulls recent tweets, filters by your {rowDeepDive.lookbackDays}-day window,
                    and extracts Korea / Asia signals.
                  </div>
                </div>
              );
            })()}

            {/* Result card — matches the "Last run" summary style from the other dialogs */}
            {rowDeepDive.result && !rowDeepDive.running && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
                <div className="font-semibold text-gray-700">Result</div>
                {rowDeepDive.result.error ? (
                  <div className="text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {rowDeepDive.result.error}
                  </div>
                ) : (
                  <>
                    <div>
                      POCs scanned: {rowDeepDive.result.pocs_scanned ?? 0} · Signals added: {rowDeepDive.result.signals_added ?? 0}
                    </div>
                    <div>
                      Cost: ${rowDeepDive.result.cost_usd?.toFixed(3) ?? '—'} · Duration: {Math.round((rowDeepDive.result.duration_ms || 0) / 1000)}s
                    </div>
                    {Array.isArray(rowDeepDive.result.per_poc) && rowDeepDive.result.per_poc.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-gray-200 space-y-1.5">
                        {rowDeepDive.result.per_poc.map((r: any) => (
                          <div key={r.handle} className="text-[11px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium">@{r.handle}</span>
                              <span className="text-gray-500">·</span>
                              <span className="text-gray-600">
                                {r.findings_written} signal{r.findings_written !== 1 ? 's' : ''}
                              </span>
                              {typeof r.korea_interest_score === 'number' && (
                                <>
                                  <span className="text-gray-500">·</span>
                                  <span className={`font-semibold ${
                                    r.korea_interest_score >= 70 ? 'text-emerald-700' :
                                    r.korea_interest_score >= 40 ? 'text-amber-700' :
                                    'text-gray-500'
                                  }`}>
                                    score {r.korea_interest_score}
                                  </span>
                                </>
                              )}
                            </div>
                            {r.summary && (
                              <p className="text-gray-600 mt-0.5">{r.summary}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeRowDeepDive}
              disabled={rowDeepDive.running}
            >
              {rowDeepDive.result ? 'Close' : 'Cancel'}
            </Button>
            {!rowDeepDive.result && (
              <Button
                onClick={startRowDeepDive}
                disabled={rowDeepDive.running || rowDeepDive.xPocCount === 0}
                style={{ backgroundColor: 'var(--brand)', color: 'white' }}
                className="hover:opacity-90"
              >
                {rowDeepDive.running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {rowDeepDive.running ? 'Running…' : 'Run Deep Dive'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Telegram DM draft dialog — styled consistently with the other
          discovery dialogs (brand teal accent, same Label / focus-brand,
          canonical Cancel/primary button pair). */}
      <Dialog
        open={dmDialog.open}
        onOpenChange={o => { if (!o) setDmDialog(prev => ({ ...prev, open: false })); }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Draft Telegram DM</DialogTitle>
            <DialogDescription>
              Pre-filled using the strongest Grok signal. Edit freely before copying.
              {dmDialog.prospect && dmDialog.poc && (
                <>
                  {' '}To:{' '}
                  <span className="font-semibold text-gray-900">
                    {dmDialog.poc.name}
                  </span>
                  {' '}at{' '}
                  <span className="font-semibold text-gray-900">
                    {dmDialog.prospect.name}
                  </span>
                  {dmDialog.poc.telegram_handle && (
                    <> · <span className="font-mono text-[#229ED9]">
                      @{dmDialog.poc.telegram_handle.replace(/^@/, '')}
                    </span></>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Variant picker — deterministic re-rolls of the template */}
            <div>
              <Label className="mb-1.5 block">
                Hook style
                <span className="font-normal text-[10px] text-gray-500 ml-1">
                  — re-roll without losing your manual edits
                </span>
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 'signal',    label: 'Signal-led',   help: 'Cites a specific Grok finding' },
                  { v: 'pretoken',  label: 'Timing-led',   help: 'Pre-TGE urgency hook' },
                  { v: 'generic',   label: 'Generic',      help: 'No specifics, safest' },
                ] as const).map(({ v, label, help }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => regenerateDmDraft(v)}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      dmDialog.variant === v
                        ? 'border-brand bg-brand-light ring-1 ring-brand'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-gray-900">{label}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{help}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Editable draft */}
            <div>
              <Label htmlFor="dm-text" className="mb-1.5 block">Message</Label>
              <textarea
                id="dm-text"
                className="focus-brand w-full font-sans text-sm leading-relaxed p-3 resize-y min-h-[240px]"
                value={dmDialog.text}
                onChange={e => setDmDialog(prev => ({ ...prev, text: e.target.value, copiedAt: null }))}
                spellCheck
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px] text-gray-500">
                  {dmDialog.text.length} chars · Telegram has no length limit for DMs.
                </p>
                {dmDialog.copiedAt && Date.now() - dmDialog.copiedAt < 5000 && (
                  <p className="text-[10px] text-emerald-600 font-semibold">
                    ✓ Copied to clipboard
                  </p>
                )}
              </div>
            </div>

            {/* Friendly reminder card */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-[11px]">
              <p className="font-semibold mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Quick gut-check before sending
              </p>
              <ul className="space-y-0.5 list-disc pl-4">
                <li>Does the hook feel natural in your voice? Rewrite if not.</li>
                <li>Replace "Andy" if you're DMing as someone else.</li>
                <li>Double-check the handle — <code>@</code>s can be impersonated.</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDmDialog(prev => ({ ...prev, open: false }))}
            >
              Close
            </Button>
            {dmDialog.poc?.telegram_handle && (
              <a
                href={`https://t.me/${dmDialog.poc.telegram_handle.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                <Send className="h-4 w-4 mr-2 text-[#229ED9]" />
                Open in Telegram
              </a>
            )}
            <Button
              onClick={copyDmToClipboard}
              style={{ backgroundColor: 'var(--brand)', color: 'white' }}
              className="hover:opacity-90"
            >
              <CopyIcon className="h-4 w-4 mr-2" />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
