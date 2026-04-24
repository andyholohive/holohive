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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Sparkles, Loader2, ExternalLink, Send, Twitter, Globe,
  ChevronDown, ChevronRight as ChevronRightIcon, CheckCircle, XCircle,
  ArrowRight, AlertTriangle, RefreshCw, UserSearch, Eye, Zap,
  ArrowUp, ArrowDown, ArrowUpDown, Radar,
} from 'lucide-react';

interface Trigger {
  id: string;
  signal_type: string;
  headline: string;
  detail?: string | null;
  source_url?: string | null;
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
  });
  const [lastScanResult, setLastScanResult] = useState<any>(null);

  // Live progress (polled from /api/prospects/discovery/progress while scanning)
  const [scanProgress, setScanProgress] = useState<{
    stage: string | null;
    message: string | null;
    percent: number | null;
    candidates_found: number | null;
    batches_total: number | null;
    batches_complete: number | null;
  } | null>(null);
  const progressPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // POC enrichment state
  const [enrichDialogOpen, setEnrichDialogOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [lastEnrichResult, setLastEnrichResult] = useState<any>(null);
  // POC Lookup engine — Claude (Opus/Sonnet) uses web_search;
  // Grok uses native x_search + web_search (better at scraping X bios).
  const [enrichModel, setEnrichModel] = useState<'sonnet' | 'opus' | 'grok'>('grok');

  // Unified "Scan" dialog settings
  type ScanMode = 'poc_lookup' | 'deep_dive_x' | 'both';
  const [scanMode, setScanMode] = useState<ScanMode>('poc_lookup');
  const [scanLookbackDays, setScanLookbackDays] = useState<30 | 90 | 180 | 365>(90);
  const [scanShelfLifeDays, setScanShelfLifeDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  // Deep Dive safety cap: max POCs Grok will scan in one BATCH run. Default 5
  // so a misclick doesn't spend $10+. Per-prospect runs (the row button) are
  // not subject to this cap — they're scoped to one prospect's POCs.
  const [scanMaxPocs, setScanMaxPocs] = useState<1 | 3 | 5 | 10 | 25 | 9999>(5);

  // Per-prospect Deep Dive state — tracks which rows are currently running
  // so we can show a spinner on just that row and disable the button to
  // prevent double-clicks.
  const [deepDivingIds, setDeepDivingIds] = useState<Set<string>>(new Set());
  // Per-prospect "Find POCs" state (Grok-powered).
  const [findingPocsIds, setFindingPocsIds] = useState<Set<string>>(new Set());

  // Per-prospect Deep Dive dialog — opens when the user clicks the row's
  // Deep Dive button. Lets them pick lookback / shelf-life per-project
  // instead of inheriting the batch dialog's settings, and shows live
  // elapsed-time progress since the API itself doesn't stream updates.
  const [rowDeepDive, setRowDeepDive] = useState<{
    open: boolean;
    prospectId: string | null;
    projectName: string;
    xPocCount: number;
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
        if (data.progress) setScanProgress(data.progress);
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
      setScanProgress({
        stage: res.ok && !data.error ? 'done' : 'failed',
        message: res.ok && !data.error ? 'Scan complete' : (data.error || 'Scan failed'),
        percent: 100,
        candidates_found: data.candidates_found ?? null,
        batches_total: data.batches_run ?? null,
        batches_complete: data.batches_run ?? null,
      });

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

  const runPocEnrichment = async () => {
    setEnriching(true);
    setLastEnrichResult(null);
    // Route to Grok endpoint when the user picks Grok; otherwise use Claude.
    const endpoint = enrichModel === 'grok'
      ? '/api/prospects/discovery/grok-find-pocs'
      : '/api/prospects/discovery/enrich-pocs';
    const bodyPayload = enrichModel === 'grok'
      ? {}                           // Grok endpoint doesn't need model param
      : { model: enrichModel };
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      setLastEnrichResult(data);
      if (!res.ok || data.error) {
        toast({
          title: 'Enrichment failed',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'POC enrichment complete',
          description: `${data.enriched} enriched · ${data.failed || 0} failed · $${data.cost_usd?.toFixed(2) ?? '—'}`,
        });
        fetchProspects();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Enrichment failed', variant: 'destructive' });
    } finally {
      setEnriching(false);
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
  const runDeepDive = async () => {
    setEnriching(true);
    setLastEnrichResult(null);
    try {
      const res = await fetch('/api/prospects/discovery/grok-deep-dive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookback_days: scanLookbackDays,
          shelf_life_days: scanShelfLifeDays,
          max_pocs: scanMaxPocs,
        }),
      });
      const data = await res.json();
      setLastEnrichResult(data);
      if (!res.ok || data.error) {
        toast({
          title: 'Deep Dive failed',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Deep Dive complete',
          description: `${data.pocs_scanned ?? 0} POCs scanned · ${data.signals_added ?? 0} signals added · $${data.cost_usd?.toFixed(2) ?? '—'}`,
        });
        fetchProspects();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Deep Dive failed', variant: 'destructive' });
    } finally {
      setEnriching(false);
    }
  };

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
      // Inherit last-used values from the batch dialog so power users don't
      // re-pick the same settings every time. They can still change them.
      lookbackDays: scanLookbackDays,
      shelfLifeDays: scanShelfLifeDays,
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

  // Unified scan dispatcher — routes to POC Lookup, Deep Dive, or both
  // based on the mode selected in the Scan dialog.
  const runUnifiedScan = async () => {
    if (scanMode === 'poc_lookup') {
      await runPocEnrichment();
    } else if (scanMode === 'deep_dive_x') {
      await runDeepDive();
    } else {
      // both — POC lookup first so newly-found POCs are available for Deep Dive
      await runPocEnrichment();
      await runDeepDive();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/prospects/discovery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast({ title: 'Updated', description: `Moved to ${status.replace('_', ' ')}` });
      fetchProspects();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Update failed', variant: 'destructive' });
    }
  };

  // Apply client-side "hide disqualified" filter. We ALWAYS keep disqualified
  // prospects in state so flipping the toggle off shows them immediately
  // (no refetch needed) — satisfies the "show rejects with reason" requirement.
  const filteredProspectsUnsorted = hideSkip
    ? prospects.filter(p => p.discovery_action_tier !== 'SKIP')
    : prospects;

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

  // Count prospects with no outreach contacts — candidates for POC enrichment.
  // We only count non-SKIP (no point enriching dismissed/disqualified).
  const missingPocCount = prospects.filter(
    p => p.discovery_action_tier !== 'SKIP' && (!p.outreach_contacts || p.outreach_contacts.length === 0),
  ).length;

  // POCs with findable X handles — the target set for Deep Dive X scans.
  // We only deep-dive non-SKIP prospects (no point spending money on disqualified ones).
  const pocsWithXCount = prospects
    .filter(p => p.discovery_action_tier !== 'SKIP')
    .reduce((acc, p) => acc + (p.outreach_contacts || []).filter(c => !!c.twitter_handle).length, 0);

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
          AI-driven lead finder anchored on DropsTab. For each candidate, Claude hunts
          outreach triggers from X and decision-maker contacts — Telegram priority,
          X fallback — using the SCOUT ICP framework to score fit.
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
          {/* Batch "Scan" button hidden — the per-row Find POCs and Deep Dive
              buttons on each prospect are the primary paths now. The batch
              dialog component is kept mounted in the tree (we don't render
              it via the button anymore) so any future keyboard shortcut or
              re-exposure is trivial. */}
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

      {/* Status filter tabs + hide-disqualified toggle */}
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
                <TableHead>
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
                </TableHead>
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
                      <TableCell className="px-2">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-gray-400" />
                          : <ChevronRightIcon className="h-4 w-4 text-gray-400" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{p.name}</span>
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
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {p.triggers.slice(0, 2).map(t => (
                            <Badge
                              key={t.id}
                              variant="outline"
                              className="text-[10px] pointer-events-none"
                              title={t.detail || t.headline}
                            >
                              {formatSignalType(t.signal_type)}
                            </Badge>
                          ))}
                          {p.triggers.length > 2 && (
                            <span className="text-[10px] text-gray-500">+{p.triggers.length - 2} more</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.discovery_action_tier ? (
                          <span
                            className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border pointer-events-none ${ACTION_TIER_STYLE[p.discovery_action_tier]?.className || ''}`}
                            title={p.disqualification_reason || p.consideration_reason || ''}
                          >
                            {ACTION_TIER_STYLE[p.discovery_action_tier]?.label || p.discovery_action_tier}
                          </span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </TableCell>
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
                            const title = xPocCount === 0
                              ? 'No POC with X handle — run Find POCs first'
                              : isSkip
                                ? 'Disqualified — deep dive disabled'
                                : isDiving
                                  ? 'Deep dive in progress…'
                                  : `Configure and run Grok deep dive on ${xPocCount} X timeline${xPocCount !== 1 ? 's' : ''}`;
                            return (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-violet-700 border-violet-200 hover:bg-violet-50 disabled:text-gray-300 disabled:border-gray-200"
                                onClick={() => openRowDeepDive(p.id, p.name, xPocCount)}
                                disabled={disabled}
                                title={title}
                              >
                                {isDiving
                                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  : <Radar className="h-3 w-3 mr-1" />}
                                Deep Dive
                              </Button>
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
                        <TableCell colSpan={9} className="py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                            {/* Verdict summary + reasons */}
                            <div className="md:col-span-2">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                {p.icp_verdict && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded pointer-events-none ${VERDICT_STYLE[p.icp_verdict]}`}>
                                    ICP: {p.icp_verdict}
                                  </span>
                                )}
                                {p.prospect_score && (
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
                                  {p.outreach_contacts.map((c, i) => (
                                    <div key={i} className="bg-white border rounded-lg p-2.5 text-xs">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-gray-900">{c.name}</span>
                                            <span className={`text-[9px] font-semibold px-1 py-0.5 rounded pointer-events-none ${CONTACT_CONFIDENCE_STYLE[c.confidence]}`}>
                                              {c.confidence}
                                            </span>
                                          </div>
                                          <div className="text-gray-500 text-[11px]">{c.role}</div>
                                          {c.notes && (
                                            <p className="text-gray-600 text-[11px] mt-1">{c.notes}</p>
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
                                  ))}
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

                            {/* All triggers */}
                            <div className="md:col-span-2">
                              <h4 className="font-semibold text-gray-700 mb-2">Triggers ({p.triggers.length})</h4>
                              <div className="space-y-2">
                                {p.triggers.map(t => (
                                  <div key={t.id} className="bg-white border rounded-lg p-2.5 text-xs">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Badge variant="outline" className="text-[10px] pointer-events-none">
                                            {formatSignalType(t.signal_type)}
                                          </Badge>
                                          {t.source_type && (
                                            <Badge
                                              variant="outline"
                                              className={`text-[10px] pointer-events-none ${
                                                t.source_type === 'tweet' ? 'bg-[#e8f4f5] text-[#1DA1F2]' : ''
                                              }`}
                                            >
                                              {t.source_type === 'tweet' ? 'X' : t.source_type}
                                            </Badge>
                                          )}
                                          {t.weight && (
                                            <span className="text-[10px] text-gray-500">weight: {t.weight}</span>
                                          )}
                                        </div>
                                        <div className="font-medium text-gray-900 mt-1">{t.headline}</div>
                                        {t.detail && (
                                          <p className="text-gray-600 mt-0.5">{t.detail}</p>
                                        )}
                                      </div>
                                      {t.source_url && (
                                        <a
                                          href={t.source_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-gray-400 hover:text-gray-700 shrink-0"
                                          title="View source"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run Discovery Scan</DialogTitle>
            <DialogDescription>
              Candidates sourced from DropsTab only. For each, Claude leaves DropsTab to hunt
              individual POC handles (project team pages, X bios, crypto directories) —
              Telegram priority, X fallback. Expect 30-90s and ~$0.30-$1 per run.
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
                  className="auth-input mt-1"
                />
              </div>
              <div>
                <Label htmlFor="minraise">Min raise (USD)</Label>
                <Input
                  id="minraise"
                  type="number"
                  value={scanParams.min_raise_usd}
                  onChange={e => setScanParams(p => ({ ...p, min_raise_usd: e.target.value }))}
                  className="auth-input mt-1"
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
                className="auth-input mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Higher = more coverage, more cost. 20 is a good default.</p>
            </div>
            <div>
              <Label htmlFor="cats">Categories (optional)</Label>
              <Input
                id="cats"
                value={scanParams.categories}
                onChange={e => setScanParams(p => ({ ...p, categories: e.target.value }))}
                className="auth-input mt-1"
                placeholder="DeFi, Gaming, AI"
              />
              <p className="text-xs text-gray-500 mt-1">Comma-separated. Leave blank to scan all.</p>
            </div>

            <div>
              <Label className="mb-1.5 block">Model</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScanParams(p => ({ ...p, model: 'opus' }))}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${
                    scanParams.model === 'opus'
                      ? 'border-[#3e8692] bg-[#e8f4f5] ring-1 ring-[#3e8692]'
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
                      ? 'border-[#3e8692] bg-[#e8f4f5] ring-1 ring-[#3e8692]'
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

            {/* Live progress (while scanning) */}
            {scanning && scanProgress && (
              <div className="rounded-lg border border-[#3e8692]/40 bg-[#e8f4f5] p-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 text-[#3e8692] animate-spin shrink-0" />
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
                {/* Sub-details */}
                {(scanProgress.candidates_found != null || scanProgress.batches_total != null) && (
                  <div className="text-[10px] text-gray-600 flex items-center gap-3">
                    {scanProgress.candidates_found != null && (
                      <span>Candidates: {scanProgress.candidates_found}</span>
                    )}
                    {scanProgress.batches_total != null && (
                      <span>Batches: {scanProgress.batches_complete ?? 0} / {scanProgress.batches_total}</span>
                    )}
                  </div>
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

      {/* Unified Scan dialog — POC Lookup (Claude) or Deep Dive X (Grok) */}
      <Dialog open={enrichDialogOpen} onOpenChange={setEnrichDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scan</DialogTitle>
            <DialogDescription>
              Pick what you want to scan and how aggressive the freshness window should be.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {/* Mode picker */}
            <div>
              <Label className="mb-1.5 block">Scan type</Label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setScanMode('poc_lookup')}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    scanMode === 'poc_lookup'
                      ? 'border-[#3e8692] bg-[#e8f4f5] ring-1 ring-[#3e8692]'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-900">POC Lookup</div>
                    <span className="text-[10px] text-gray-500">{missingPocCount} missing</span>
                  </div>
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    Claude searches project sites + X bios for decision-maker handles.
                    Targets prospects without any POC yet.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScanMode('deep_dive_x')}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    scanMode === 'deep_dive_x'
                      ? 'border-[#3e8692] bg-[#e8f4f5] ring-1 ring-[#3e8692]'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-900">
                      Deep Dive X Timeline
                      <span className="ml-1.5 inline-flex items-center text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700 pointer-events-none">
                        GROK
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500">{pocsWithXCount} POCs</span>
                  </div>
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    Grok (grok-4) reads each POC's X feed for Korea / Asia relevance signals.
                    Batch mode — scans many at once, hot leads first.
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 italic">
                    Tip: for a single project, use the Deep Dive button on its row instead.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScanMode('both')}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    scanMode === 'both'
                      ? 'border-[#3e8692] bg-[#e8f4f5] ring-1 ring-[#3e8692]'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-900">Both (POC Lookup → Deep Dive)</div>
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    Runs POC Lookup first, then Deep Dive on all resulting POCs.
                    Most thorough. Highest cost.
                  </div>
                </button>
              </div>
            </div>

            {/* POC Lookup engine picker. Three choices:
                  - Grok: native X search + web_search (best for X bios w/ TG)
                  - Opus: Claude via web_search (better judgment on edge cases)
                  - Sonnet: Claude via web_search (fastest, cheapest)
                Deep Dive always uses Grok, so this picker only affects POC Lookup. */}
            {(scanMode === 'poc_lookup' || scanMode === 'both') && (
              <div>
                <Label className="mb-1.5 block">
                  POC Lookup engine
                  <span className="font-normal text-[10px] text-gray-500 ml-1">
                    — Deep Dive always uses Grok
                  </span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEnrichModel('grok')}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      enrichModel === 'grok'
                        ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-gray-900 flex items-center gap-1">
                      Grok
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700">X</span>
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Native X + web</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnrichModel('opus')}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      enrichModel === 'opus'
                        ? 'border-[#3e8692] bg-[#e8f4f5] ring-1 ring-[#3e8692]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-gray-900">Opus 4.7</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Web search</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnrichModel('sonnet')}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      enrichModel === 'sonnet'
                        ? 'border-[#3e8692] bg-[#e8f4f5] ring-1 ring-[#3e8692]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-gray-900">Sonnet 4.5</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Web search</div>
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5">
                  Grok is better at finding Telegram handles from X bios (crypto BDs often put "tg: @handle" there).
                  Claude is a better fallback when X turns up nothing.
                </p>
              </div>
            )}

            {/* Lookback window (Deep Dive only) */}
            {(scanMode === 'deep_dive_x' || scanMode === 'both') && (
              <div>
                <Label htmlFor="lookback" className="mb-1.5 block">Lookback window (Deep Dive)</Label>
                <Select
                  value={String(scanLookbackDays)}
                  onValueChange={v => setScanLookbackDays(Number(v) as 30 | 90 | 180 | 365)}
                >
                  <SelectTrigger id="lookback">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 days — very recent / active signals</SelectItem>
                    <SelectItem value="90">Last 90 days — balanced (default)</SelectItem>
                    <SelectItem value="180">Last 6 months — broader pattern</SelectItem>
                    <SelectItem value="365">Last 12 months — historical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Signal shelf life — only relevant when signals are being
                written, i.e. Deep Dive X or Both. POC Lookup doesn't
                produce signals (it updates the contact list). */}
            {(scanMode === 'deep_dive_x' || scanMode === 'both') && (
              <div>
                <Label htmlFor="shelf" className="mb-1.5 block">Signal shelf life (Deep Dive)</Label>
                <Select
                  value={String(scanShelfLifeDays)}
                  onValueChange={v => setScanShelfLifeDays(Number(v) as 7 | 14 | 30 | 60 | 90)}
                >
                  <SelectTrigger id="shelf">
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
                <p className="text-[10px] text-gray-500 mt-1">
                  How long the resulting X timeline signals stay "fresh" on prospects before expiring.
                </p>
              </div>
            )}

            {/* Max POCs cap — safety brake so a misclick doesn't scan every
                POC in the pipeline. Hot leads (by tier) get the budget first. */}
            {(scanMode === 'deep_dive_x' || scanMode === 'both') && (
              <div>
                <Label htmlFor="maxpocs" className="mb-1.5 block">
                  Max POCs (Deep Dive)
                  <span className="font-normal text-[10px] text-gray-500 ml-1">
                    — cost brake, hot leads first
                  </span>
                </Label>
                <Select
                  value={String(scanMaxPocs)}
                  onValueChange={v => setScanMaxPocs(Number(v) as 1 | 3 | 5 | 10 | 25 | 9999)}
                >
                  <SelectTrigger id="maxpocs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 POC — smoke test</SelectItem>
                    <SelectItem value="3">3 POCs — quick check</SelectItem>
                    <SelectItem value="5">5 POCs — default</SelectItem>
                    <SelectItem value="10">10 POCs</SelectItem>
                    <SelectItem value="25">25 POCs</SelectItem>
                    <SelectItem value="9999">All ({pocsWithXCount}) — full sweep</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-500 mt-1">
                  Grok scans in tier order (Reach Out Now → Pre-Token → Research → Watch → Nurture),
                  so capping at N keeps the highest-value POCs.
                </p>
              </div>
            )}

            {/* Cost estimate */}
            {(() => {
              // POC lookup cost range — depends on engine
              //   Grok: ~$0.10-$0.30 per project (x_search + web_search)
              //   Opus: ~$0.25-$0.75 per project (Claude web_search, pricier)
              //   Sonnet: ~$0.05-$0.15 per project (Claude web_search, cheap)
              const pocLo =
                enrichModel === 'grok' ? 0.10
                : enrichModel === 'opus' ? 0.25
                : 0.05;
              const pocHi =
                enrichModel === 'grok' ? 0.30
                : enrichModel === 'opus' ? 0.75
                : 0.15;
              const pocCount = missingPocCount;
              // Grok deep dive cost range (~$0.10-$0.40 per POC — real runs
              // observed closer to $0.22)
              const grokLo = 0.10;
              const grokHi = 0.40;
              // Apply the max_pocs cap — this is what'll actually be scanned.
              const grokCount = Math.min(pocsWithXCount, scanMaxPocs);
              const grokSkipped = Math.max(0, pocsWithXCount - grokCount);

              let lo = 0, hi = 0, descr = '';
              if (scanMode === 'poc_lookup') {
                lo = pocLo * pocCount; hi = pocHi * pocCount;
                descr = `${pocCount} prospect${pocCount !== 1 ? 's' : ''} × POC lookup`;
              } else if (scanMode === 'deep_dive_x') {
                lo = grokLo * grokCount; hi = grokHi * grokCount;
                descr = `${grokCount} POC${grokCount !== 1 ? 's' : ''} × Grok deep dive`;
              } else {
                lo = pocLo * pocCount + grokLo * grokCount;
                hi = pocHi * pocCount + grokHi * grokCount;
                descr = `POC lookup + Grok deep dive (${grokCount} POC${grokCount !== 1 ? 's' : ''})`;
              }

              // Estimated wall-clock (deep dive is ~110s/POC, sequential)
              const deepDiveSeconds = grokCount * 110;
              const showTime = scanMode !== 'poc_lookup' && grokCount > 0;

              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
                  <p className="font-semibold mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Estimated cost
                  </p>
                  <p>
                    {descr}: roughly <strong>${lo.toFixed(2)} to ${hi.toFixed(2)}</strong>
                    {showTime && (
                      <span className="text-amber-700">
                        {' · '}
                        ~{deepDiveSeconds < 60 ? `${deepDiveSeconds}s` : `${Math.round(deepDiveSeconds / 60)}m`}
                      </span>
                    )}
                  </p>
                  {grokSkipped > 0 && (scanMode === 'deep_dive_x' || scanMode === 'both') && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      {grokSkipped} POC{grokSkipped !== 1 ? 's' : ''} over the cap won't be scanned.
                      Raise "Max POCs" to include them.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Last result */}
            {lastEnrichResult && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
                <div className="font-semibold text-gray-700">Last run</div>
                {lastEnrichResult.error ? (
                  <div className="text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {lastEnrichResult.error}
                  </div>
                ) : (
                  <>
                    {lastEnrichResult.enriched != null && (
                      <div>POCs enriched: {lastEnrichResult.enriched} · Failed: {lastEnrichResult.failed ?? 0}</div>
                    )}
                    {lastEnrichResult.pocs_scanned != null && (
                      <div>
                        POCs deep-scanned: {lastEnrichResult.pocs_scanned} · Signals added: {lastEnrichResult.signals_added ?? 0}
                        {lastEnrichResult.pocs_skipped_due_to_cap > 0 && (
                          <span className="text-amber-700">
                            {' · '}
                            {lastEnrichResult.pocs_skipped_due_to_cap} skipped (cap)
                          </span>
                        )}
                      </div>
                    )}
                    <div>Cost: ${lastEnrichResult.cost_usd?.toFixed(3) ?? '—'} · Duration: {Math.round((lastEnrichResult.duration_ms || 0) / 1000)}s</div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrichDialogOpen(false)} disabled={enriching}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setEnrichDialogOpen(false);
                await runUnifiedScan();
              }}
              disabled={
                enriching ||
                (scanMode === 'poc_lookup' && missingPocCount === 0) ||
                (scanMode === 'deep_dive_x' && pocsWithXCount === 0) ||
                (scanMode === 'both' && missingPocCount === 0 && pocsWithXCount === 0)
              }
              style={{ backgroundColor: 'var(--brand)', color: 'white' }}
              className="hover:opacity-90"
            >
              {enriching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {enriching ? 'Running...' : 'Run Scan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-prospect Deep Dive dialog — opened from the row Deep Dive button.
          Styled to match the Run Discovery + batch Scan dialogs:
          brand teal accent (#3e8692), amber cost card, same progress structure. */}
      <Dialog
        open={rowDeepDive.open}
        onOpenChange={o => { if (!o && !rowDeepDive.running) closeRowDeepDive(); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deep Dive</DialogTitle>
            <DialogDescription>
              Grok reads each POC's X timeline for Korea / Asia relevance signals.
              Target: <span className="font-semibold text-gray-900">{rowDeepDive.projectName}</span>
              {' · '}
              {rowDeepDive.xPocCount} POC{rowDeepDive.xPocCount !== 1 ? 's' : ''} with X handle.
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
                <div className="rounded-lg border border-[#3e8692]/40 bg-[#e8f4f5] p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 text-[#3e8692] animate-spin shrink-0" />
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
    </div>
  );
}
