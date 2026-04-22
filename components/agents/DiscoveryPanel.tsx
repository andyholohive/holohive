'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Sparkles, Loader2, ExternalLink, Send, Twitter, Globe,
  ChevronDown, ChevronRight as ChevronRightIcon, CheckCircle, XCircle,
  ArrowRight, AlertTriangle, RefreshCw, UserSearch,
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

  // POC enrichment state
  const [enrichDialogOpen, setEnrichDialogOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [lastEnrichResult, setLastEnrichResult] = useState<any>(null);
  const [enrichModel, setEnrichModel] = useState<'sonnet' | 'opus'>('opus');

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

  const runScan = async () => {
    setScanning(true);
    setLastScanResult(null);
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
      setScanning(false);
    }
  };

  const runPocEnrichment = async () => {
    setEnriching(true);
    setLastEnrichResult(null);
    try {
      const res = await fetch('/api/prospects/discovery/enrich-pocs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: enrichModel }), // empty = enrich all missing
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
  const filteredProspects = hideSkip
    ? prospects.filter(p => p.discovery_action_tier !== 'SKIP')
    : prospects;
  const hiddenSkipCount = hideSkip
    ? prospects.filter(p => p.discovery_action_tier === 'SKIP').length
    : 0;

  // Count prospects with no outreach contacts — candidates for POC enrichment.
  // We only count non-SKIP (no point enriching dismissed/disqualified).
  const missingPocCount = prospects.filter(
    p => p.discovery_action_tier !== 'SKIP' && (!p.outreach_contacts || p.outreach_contacts.length === 0),
  ).length;

  return (
    <div className="pb-8">
      {/* Header + scan button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-600">
            Candidates sourced from DropsTab's raised-funds list. For each, Claude hunts POC handles on project sites, X bios, and crypto directories — prioritizing Telegram handles (your BD channel) over X.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {missingPocCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEnrichDialogOpen(true)}
              disabled={enriching}
              className="h-9 text-amber-700 border-amber-200 hover:bg-amber-50"
              title="Run POC lookup for prospects that don't have outreach contacts yet"
            >
              {enriching
                ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                : <UserSearch className="w-4 h-4 mr-1.5" />}
              Find POCs ({missingPocCount})
            </Button>
          )}
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

      {/* Status filter tabs */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
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
        <div className="w-px h-5 bg-gray-200 mx-1.5" />
        <div className="flex items-center gap-2">
          <Switch
            id="hide-disqualified"
            checked={hideSkip}
            onCheckedChange={setHideSkip}
          />
          <Label htmlFor="hide-disqualified" className="text-xs text-gray-600 cursor-pointer select-none">
            Hide disqualified
            {hideSkip && hiddenSkipCount > 0 && (
              <span className="text-[10px] text-gray-400 ml-1">({hiddenSkipCount} hidden)</span>
            )}
          </Label>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filteredProspects.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-gray-50">
          <Sparkles className="h-10 w-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-700 font-medium">
            {statusFilter === 'needs_review'
              ? 'No prospects awaiting review'
              : `No ${statusFilter.replace('_', ' ')} prospects yet`}
          </p>
          <p className="text-gray-500 text-sm mt-1 mb-4">
            Run a Discovery scan to find projects with live outreach triggers.
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
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-8"></TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Funding</TableHead>
                <TableHead>Triggers</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Score</TableHead>
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
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
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
        </div>
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

      {/* POC enrichment confirmation dialog */}
      <Dialog open={enrichDialogOpen} onOpenChange={setEnrichDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Find POCs for {missingPocCount} prospect{missingPocCount !== 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              For each of the {missingPocCount} discovered prospect{missingPocCount !== 1 ? 's' : ''} without a POC,
              Claude will use web_search to find 1-3 decision-maker handles from project team pages,
              X bios, and crypto directories — prioritizing Telegram.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label className="mb-1.5 block">Model</Label>
              <div className="grid grid-cols-2 gap-2">
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
                  <div className="text-[10px] text-gray-600 mt-0.5">Better POC accuracy</div>
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
                  <div className="text-[10px] text-gray-600 mt-0.5">Faster, cheaper</div>
                </button>
              </div>
            </div>

            {(() => {
              const lo = enrichModel === 'opus' ? 0.25 : 0.05;
              const hi = enrichModel === 'opus' ? 0.75 : 0.15;
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
                  <p className="font-semibold mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Estimated cost
                  </p>
                  <p>
                    ~${lo.toFixed(2)}–${hi.toFixed(2)} per prospect on {enrichModel === 'opus' ? 'Opus' : 'Sonnet'}.
                    For {missingPocCount} prospect{missingPocCount !== 1 ? 's' : ''}:
                    roughly <strong>${(missingPocCount * lo).toFixed(2)} to ${(missingPocCount * hi).toFixed(2)}</strong>.
                  </p>
                  <p className="mt-1">
                    Duration: ~5-15s per prospect (sequential, to stay under web_search rate limits).
                    Estimated total: <strong>{Math.round(missingPocCount * 10 / 60)}-{Math.round(missingPocCount * 15 / 60)} min</strong>.
                  </p>
                </div>
              );
            })()}

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
                    <div>Enriched: {lastEnrichResult.enriched} · Failed: {lastEnrichResult.failed}</div>
                    <div>Cost: ${lastEnrichResult.cost_usd?.toFixed(3) ?? '—'} · Duration: {Math.round((lastEnrichResult.duration_ms || 0) / 1000)}s</div>
                    {lastEnrichResult.errors?.length > 0 && (
                      <div className="text-amber-700 mt-1">
                        {lastEnrichResult.errors.length} error{lastEnrichResult.errors.length !== 1 ? 's' : ''}
                      </div>
                    )}
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
                await runPocEnrichment();
              }}
              disabled={enriching || missingPocCount === 0}
              style={{ backgroundColor: 'var(--brand)', color: 'white' }}
              className="hover:opacity-90"
            >
              {enriching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {enriching ? 'Finding POCs...' : `Find ${missingPocCount} POC${missingPocCount !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
