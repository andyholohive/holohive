'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Search, Loader2, ExternalLink, Trash2, ChevronDown,
  Sparkles, Zap, AlertTriangle, Eye,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  PIPELINE_STAGES, STAGE_LABELS, STAGE_COLORS,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';

/**
 * Discovery tab for the sales pipeline page.
 *
 * Surfaces prospects from the Intelligence > Discovery scanner that
 * haven't been promoted or dismissed yet, and lets the user promote
 * each one into the CRM at a stage of their choice (cold_dm by default,
 * but anything in PIPELINE_STAGES is fair game — useful when the user
 * has already had some pre-CRM contact and wants to land the prospect
 * directly in 'warm' or 'tg_intro' instead of starting cold).
 *
 * Self-contained: owns its own data fetch + filters + actions, calls
 * `onPromoted()` after a successful promote so the parent can refetch
 * the opportunities list (the new opp needs to appear in the rest of
 * the sales-pipeline tabs immediately).
 *
 * Backed by:
 *   GET    /api/prospects/discovery?status=...
 *   POST   /api/prospects/promote   { id, stage }
 *   PATCH  /api/prospects/promote   { id, status: 'dismissed' }
 */

interface Prospect {
  id: string;
  name: string;
  symbol: string | null;
  category: string | null;
  source_url: string | null;
  website_url: string | null;
  status: string | null;
  scraped_at: string | null;
  updated_at: string | null;
  korea_relevancy_score: number | null;
  icp_score: number | null;
  prospect_score: number | null;
  discovery_action_tier: string | null;
  fit_reasoning: string | null;
  funding: { amount_usd?: number; round?: string; investors?: string[] } | null;
  triggers: Array<{
    signal_type: string;
    headline: string;
    weight: number;
  }>;
}

type StatusFilter = 'needs_review' | 'reviewed' | 'all_open';
type TierFilter = 'any' | 'REACH_OUT_NOW' | 'PRE_TOKEN_PRIORITY' | 'CONSIDER' | 'DISMISS';

interface Props {
  /** Called after a successful promote so parent can refetch its opps list. */
  onPromoted: () => void;
}

const TIER_BADGE: Record<string, { bg: string; text: string }> = {
  REACH_OUT_NOW: { bg: 'bg-red-100', text: 'text-red-700' },
  PRE_TOKEN_PRIORITY: { bg: 'bg-amber-100', text: 'text-amber-700' },
  CONSIDER: { bg: 'bg-blue-100', text: 'text-blue-700' },
  DISMISS: { bg: 'bg-gray-100', text: 'text-gray-500' },
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return '';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function DiscoveryTab({ onPromoted }: Props) {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('needs_review');
  const [tierFilter, setTierFilter] = useState<TierFilter>('any');
  // Per-row in-flight flags so the row can disable its buttons while a
  // promote/dismiss is mid-air. Avoids double-clicks creating two opps.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      // 'all_open' = needs_review + reviewed (both pre-promotion states).
      // The API supports needs_review|reviewed|promoted|dismissed|all
      // individually; for "all open" we union the two pre-promotion calls.
      if (statusFilter === 'all_open') {
        const [a, b] = await Promise.all([
          fetch('/api/prospects/discovery?status=needs_review&limit=100').then(r => r.ok ? r.json() : { prospects: [] }),
          fetch('/api/prospects/discovery?status=reviewed&limit=100').then(r => r.ok ? r.json() : { prospects: [] }),
        ]);
        setProspects([...(a.prospects || []), ...(b.prospects || [])]);
      } else {
        const res = await fetch(`/api/prospects/discovery?status=${statusFilter}&limit=100`);
        const data = res.ok ? await res.json() : { prospects: [] };
        setProspects(data.prospects || []);
      }
    } catch (err: any) {
      toast({ title: 'Failed to load prospects', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  // Apply local filters (search + tier). Server already handled status.
  const filtered = useMemo(() => {
    let rows = prospects;
    if (search.trim()) {
      const t = search.trim().toLowerCase();
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(t) ||
        (p.symbol || '').toLowerCase().includes(t),
      );
    }
    if (tierFilter !== 'any') {
      rows = rows.filter(p => p.discovery_action_tier === tierFilter);
    }
    return rows;
  }, [prospects, search, tierFilter]);

  // Helper to add/remove a row id from the busy set.
  const setBusy = (id: string, busy: boolean) => {
    setBusyIds(prev => {
      const next = new Set(prev);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  const promote = async (prospect: Prospect, stage: SalesPipelineStage) => {
    setBusy(prospect.id, true);
    try {
      const res = await fetch('/api/prospects/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prospect.id, stage }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast({
        title: 'Promoted to pipeline',
        description: `${prospect.name} → ${STAGE_LABELS[stage]}`,
      });
      // Optimistic remove from list (no need to wait for refetch)
      setProspects(prev => prev.filter(p => p.id !== prospect.id));
      onPromoted();
    } catch (err: any) {
      toast({
        title: 'Promote failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(prospect.id, false);
    }
  };

  const dismiss = async (prospect: Prospect) => {
    setBusy(prospect.id, true);
    try {
      const res = await fetch('/api/prospects/promote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prospect.id, status: 'dismissed' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      toast({ title: 'Dismissed', description: prospect.name });
      setProspects(prev => prev.filter(p => p.id !== prospect.id));
    } catch (err: any) {
      toast({
        title: 'Dismiss failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(prospect.id, false);
    }
  };

  // Stage choices in the Promote dropdown: full PIPELINE_STAGES list
  // EXCEPT v2_closed_won (you wouldn't promote a fresh discovery
  // prospect directly to "closed won"). Order matches the natural
  // progression so the most common choices (cold_dm, warm) are at top.
  const promoteStages = PIPELINE_STAGES.filter(s => s !== 'v2_closed_won');

  return (
    <div className="pb-8">
      {/* Filter row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search prospects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm auth-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-auto text-sm auth-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="all_open">All open (review + reviewed)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={v => setTierFilter(v as TierFilter)}>
          <SelectTrigger className="h-9 w-auto text-sm auth-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All tiers</SelectItem>
            <SelectItem value="REACH_OUT_NOW">Reach Out Now</SelectItem>
            <SelectItem value="PRE_TOKEN_PRIORITY">Pre-Token Priority</SelectItem>
            <SelectItem value="CONSIDER">Consider</SelectItem>
            <SelectItem value="DISMISS">Dismiss</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">
          {filtered.length} prospect(s)
        </span>
      </div>

      {/* Section header — matches the styling of other tab section headers */}
      <div className="flex items-center justify-between px-4 py-3 bg-purple-50 rounded-t-lg border border-purple-200 border-b-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-700" />
          <h4 className="font-semibold text-purple-700">Discovery Prospects</h4>
          <Badge variant="secondary" className="text-xs font-medium">{filtered.length}</Badge>
          <span className="text-[11px] text-purple-500 ml-1">
            From the Intelligence Discovery scanner — pick a stage to promote into the pipeline
          </span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-b-lg border border-gray-200 border-t-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="min-w-[200px]">Name</TableHead>
                <TableHead className="w-[140px]">Tier</TableHead>
                <TableHead className="w-[110px]">Scores</TableHead>
                <TableHead className="w-[140px]">Funding</TableHead>
                <TableHead className="min-w-[200px]">Why it fits</TableHead>
                <TableHead className="w-[90px]">Found</TableHead>
                <TableHead className="w-[220px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Sparkles className="h-8 w-8" />
                      <p className="text-sm font-medium">No prospects to triage</p>
                      <p className="text-xs">
                        Run a Discovery scan from the Intelligence page to populate this list.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.map(p => {
                const tier = p.discovery_action_tier;
                const tierStyle = tier ? TIER_BADGE[tier] : null;
                const isBusy = busyIds.has(p.id);
                return (
                  <TableRow key={p.id} className="group hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {p.name}
                            {p.symbol && (
                              <span className="text-xs text-gray-500 ml-1.5">${p.symbol}</span>
                            )}
                          </div>
                          {p.website_url && (
                            <a
                              href={p.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-gray-400 hover:text-[#3e8692] inline-flex items-center gap-0.5 truncate"
                              onClick={e => e.stopPropagation()}
                            >
                              {p.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {tier ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierStyle?.bg ?? 'bg-gray-100'} ${tierStyle?.text ?? 'text-gray-600'}`}>
                          {tier === 'REACH_OUT_NOW' && <Zap className="h-3 w-3 mr-0.5" />}
                          {tier === 'PRE_TOKEN_PRIORITY' && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                          {tier === 'CONSIDER' && <Eye className="h-3 w-3 mr-0.5" />}
                          {tier.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <div title="ICP fit score">
                          ICP: <span className="font-semibold text-gray-900">{p.icp_score ?? p.prospect_score ?? '—'}</span>
                        </div>
                        <div title="Korea relevancy score">
                          KR: <span className="font-semibold text-gray-900">{p.korea_relevancy_score ?? '—'}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.funding?.amount_usd ? (
                        <div className="text-xs">
                          <div className="font-semibold text-gray-900">{formatMoney(p.funding.amount_usd)}</div>
                          {p.funding.round && (
                            <div className="text-gray-500">{p.funding.round}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-gray-600 line-clamp-2 max-w-[280px]" title={p.fit_reasoning ?? ''}>
                        {p.fit_reasoning || <span className="text-gray-300">No reasoning yet</span>}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-500">{relTime(p.scraped_at || p.updated_at)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Promote dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-[#3e8692] hover:bg-[#357884] text-white"
                              disabled={isBusy}
                            >
                              {isBusy ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : null}
                              Promote as
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-[10px] uppercase text-gray-500">
                              Land prospect at stage
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {promoteStages.map(stage => {
                              const colors = STAGE_COLORS[stage];
                              return (
                                <DropdownMenuItem
                                  key={stage}
                                  onClick={() => promote(p, stage)}
                                  className="text-xs"
                                >
                                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${colors?.solid ?? 'bg-gray-400'}`} />
                                  {STAGE_LABELS[stage]}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Dismiss button — quick triage for not-a-fit */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:border-red-200"
                          onClick={() => dismiss(p)}
                          disabled={isBusy}
                          title="Dismiss this prospect"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
