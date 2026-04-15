'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  Search, Loader2, DollarSign, TrendingUp, Users, Globe, ExternalLink,
  ArrowRight, Radar, RefreshCw, Building2, Flag, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Types ───

interface FundedProspect {
  id: string;
  name: string;
  symbol: string | null;
  category: string | null;
  market_cap: number | null;
  price: number | null;
  logo_url: string | null;
  source_url: string | null;
  source: string;
  status: string;
  website_url: string | null;
  twitter_url: string | null;
  telegram_url: string | null;
  funding_total: number | null;
  funding_round: string | null;
  last_funding_date: string | null;
  investors: string | null;
  has_korean_vc: boolean;
  icp_score: number;
  korea_relevancy_score: number;
}

interface FundingRound {
  id: string;
  prospect_id: string | null;
  project_name: string;
  round_type: string | null;
  amount_usd: number | null;
  investors: string | null;
  lead_investor: string | null;
  has_korean_vc: boolean;
  korean_vcs: string | null;
  source_url: string | null;
  announced_date: string | null;
  detected_at: string;
  prospects?: { name: string; symbol: string | null; logo_url: string | null; status: string } | null;
}

interface FundingStats {
  total_funded: number;
  korean_vc_count: number;
  not_in_pipeline: number;
  total_raised: number;
}

// ─── Korean VCs for highlighting ───

const KOREAN_VC_NAMES = [
  'Hashed', '#Hashed', 'Dunamu', 'Upbit Ventures', 'Kakao Ventures', 'Kakao',
  'Spartan Group', 'Klaytn Foundation', 'Kaia Foundation', 'NEOPIN', 'Block Crafters',
  'Hashed Emergent', 'Nonce', 'KB Investment', 'KB Securities', 'Samsung Next',
  'Samsung Ventures', 'Hyundai', 'LG Technology Ventures', 'Shinhan', 'Mirae Asset',
  'Korea Investment Partners', 'Danal', 'Coinone', 'Hanwha', 'CRIT Ventures',
  'A41', 'Planetarium',
];

function isKoreanVC(investorName: string): boolean {
  const lower = investorName.toLowerCase().trim();
  return KOREAN_VC_NAMES.some(vc => lower.includes(vc.toLowerCase()));
}

// ─── Round Type Config ───

const ROUND_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pre_seed: { label: 'Pre-Seed', color: 'text-violet-700', bg: 'bg-violet-50' },
  seed: { label: 'Seed', color: 'text-blue-700', bg: 'bg-blue-50' },
  series_a: { label: 'Series A', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  series_b: { label: 'Series B', color: 'text-teal-700', bg: 'bg-teal-50' },
  series_c: { label: 'Series C', color: 'text-cyan-700', bg: 'bg-cyan-50' },
  strategic: { label: 'Strategic', color: 'text-amber-700', bg: 'bg-amber-50' },
  private: { label: 'Private', color: 'text-orange-700', bg: 'bg-orange-50' },
  public: { label: 'Public', color: 'text-green-700', bg: 'bg-green-50' },
  token_sale: { label: 'Token Sale', color: 'text-pink-700', bg: 'bg-pink-50' },
  grant: { label: 'Grant', color: 'text-indigo-700', bg: 'bg-indigo-50' },
  undisclosed: { label: 'Undisclosed', color: 'text-gray-600', bg: 'bg-gray-50' },
};

function getRoundStyle(type: string | null) {
  if (!type) return ROUND_STYLES.undisclosed;
  return ROUND_STYLES[type] || { label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: 'text-gray-600', bg: 'bg-gray-50' };
}

// ─── Format Helpers ───

function formatAmount(amount: number | null): string {
  if (!amount) return '—';
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Component ───

export default function FundingRadarPanel() {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<FundedProspect[]>([]);
  const [recentRounds, setRecentRounds] = useState<FundingRound[]>([]);
  const [stats, setStats] = useState<FundingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  // Filters
  const [filter, setFilter] = useState<'all' | 'korean_vc' | 'not_in_pipeline' | 'recent'>('all');
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (search) params.set('search', search);
      const res = await fetch(`/api/prospects/funding?${params}`);
      const data = await res.json();
      if (res.ok) {
        setProspects(data.prospects || []);
        setRecentRounds(data.recent_rounds || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error('Error fetching funding data:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Debounced search
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);
  const handleSearch = (value: string) => {
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => setSearch(value), 300));
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/prospects/funding/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxQueries: 5 }),
      });
      const data = await res.json();
      if (res.ok) {
        const sources = [
          data.dropstab_scraped && `${data.dropstab_scraped} Dropstab`,
          data.cryptorank_coins && `${data.cryptorank_coins} CryptoRank`,
          data.search_results && `${data.search_results} web`,
        ].filter(Boolean).join(', ');
        toast({
          title: 'Funding Scan Complete',
          description: `Found ${data.rounds_found} rounds (${sources}). Saved ${data.rounds_saved}, Korean VC: ${data.korean_vc_found}. Cost: $${data.cost_usd?.toFixed(4) || '0'}`,
        });
        fetchData();
      } else {
        toast({ title: 'Scan Error', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Scan Error', description: err.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const handlePromote = async (id: string) => {
    setPromoting(id);
    try {
      const res = await fetch('/api/prospects/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Promoted', description: 'Prospect added to pipeline' });
        fetchData();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to promote', variant: 'destructive' });
    } finally {
      setPromoting(null);
    }
  };

  const renderInvestors = (investorStr: string | null) => {
    if (!investorStr) return <span className="text-gray-400 text-xs">—</span>;
    const investors = investorStr.split(',').map(i => i.trim()).filter(Boolean);
    if (investors.length === 0) return <span className="text-gray-400 text-xs">—</span>;

    return (
      <div className="flex flex-wrap gap-1">
        {investors.slice(0, 6).map((inv, i) => {
          const isKR = isKoreanVC(inv);
          return (
            <span
              key={i}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                isKR
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}
            >
              {isKR && <Flag className="w-2.5 h-2.5 mr-0.5 text-red-500" />}
              {inv}
            </span>
          );
        })}
        {investors.length > 6 && (
          <span className="text-[10px] text-gray-400 self-center">+{investors.length - 6} more</span>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header + Scan Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3e869220' }}>
                <DollarSign className="w-4 h-4" style={{ color: '#3e8692' }} />
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: '#3e8692' }}>Funding Radar</h3>
                <p className="text-[11px] text-gray-500">VC-backed projects &amp; funding rounds</p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleScan}
            disabled={scanning}
            size="sm"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
            className="hover:opacity-90 h-8"
          >
            {scanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Radar className="w-3.5 h-3.5 mr-1.5" />
                Scan Funding Rounds
              </>
            )}
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Funded Projects', value: stats.total_funded, icon: Building2, color: '#3e8692' },
              { label: 'Korean VC Backed', value: stats.korean_vc_count, icon: Flag, color: '#dc2626' },
              { label: 'Not in Pipeline', value: stats.not_in_pipeline, icon: Zap, color: '#f59e0b' },
              { label: 'Total Raised', value: formatAmount(stats.total_raised), icon: TrendingUp, color: '#10b981' },
            ].map((stat, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                  <span className="text-[11px] text-gray-500">{stat.label}</span>
                </div>
                <div className="text-lg font-bold" style={{ color: stat.color }}>
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filter Tabs + Search */}
        <div className="flex items-center gap-2">
          {[
            { value: 'all' as const, label: 'All Funded', count: stats?.total_funded },
            { value: 'korean_vc' as const, label: 'Korean VC', count: stats?.korean_vc_count },
            { value: 'not_in_pipeline' as const, label: 'Not in Pipeline', count: stats?.not_in_pipeline },
            { value: 'recent' as const, label: 'Recently Found' },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === tab.value
                  ? 'text-white'
                  : 'text-gray-600 hover:bg-gray-100 border border-transparent'
              }`}
              style={filter === tab.value ? { backgroundColor: '#3e8692' } : {}}
            >
              {tab.label}
              {tab.count != null && (
                <span className={`ml-1.5 text-[10px] font-semibold ${filter === tab.value ? 'opacity-80' : 'opacity-60'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}

          <div className="flex-1" />

          <div className="relative max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search projects..."
              onChange={e => handleSearch(e.target.value)}
              className="pl-8 h-8 text-xs auth-input"
            />
          </div>
        </div>

        {/* Funded Prospects List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : prospects.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <DollarSign className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-700 mb-1">No funded projects found</p>
            <p className="text-xs text-gray-400 mb-4">
              {filter === 'korean_vc'
                ? 'No projects with Korean VC backing detected yet.'
                : 'Run a scan to discover recently funded crypto projects.'}
            </p>
            <Button
              onClick={handleScan}
              disabled={scanning}
              size="sm"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              <Radar className="w-4 h-4 mr-1.5" />
              Scan Funding Rounds
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50/80 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <div className="col-span-3">Project</div>
              <div className="col-span-1 text-right">Raised</div>
              <div className="col-span-1">Round</div>
              <div className="col-span-3">Investors</div>
              <div className="col-span-1">Market Cap</div>
              <div className="col-span-1">ICP</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1"></div>
            </div>

            {/* Rows */}
            {prospects.map((p) => {
              const roundStyle = getRoundStyle(p.funding_round);
              const isExpanded = expandedRow === p.id;

              return (
                <div key={p.id}>
                  <div
                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                  >
                    {/* Project */}
                    <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                      {p.logo_url ? (
                        <img src={p.logo_url} alt="" className="w-7 h-7 rounded-full shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[11px] text-gray-400 font-bold shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate">{p.name}</span>
                          {p.symbol && <span className="text-xs text-gray-400">{p.symbol}</span>}
                          {p.has_korean_vc && (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="text-[10px] bg-red-50 text-red-600 px-1 py-0.5 rounded font-semibold border border-red-200 flex items-center gap-0.5">
                                  <Flag className="w-2.5 h-2.5" /> KR VC
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Backed by Korean VC(s)</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {p.category && (
                          <span className="text-[10px] text-gray-400">{p.category}</span>
                        )}
                      </div>
                    </div>

                    {/* Raised */}
                    <div className="col-span-1 text-right">
                      <span className="text-sm font-bold text-emerald-700">
                        {formatAmount(p.funding_total)}
                      </span>
                    </div>

                    {/* Round */}
                    <div className="col-span-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${roundStyle.bg} ${roundStyle.color}`}>
                        {roundStyle.label}
                      </span>
                    </div>

                    {/* Investors */}
                    <div className="col-span-3">
                      {renderInvestors(p.investors)}
                    </div>

                    {/* Market Cap */}
                    <div className="col-span-1 text-xs text-gray-600 font-medium">
                      {formatAmount(p.market_cap)}
                    </div>

                    {/* ICP */}
                    <div className="col-span-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        p.icp_score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                        p.icp_score >= 40 ? 'bg-amber-100 text-amber-700' :
                        p.icp_score > 0 ? 'bg-gray-100 text-gray-500' :
                        'bg-gray-50 text-gray-300'
                      }`}>
                        {p.icp_score || '—'}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="col-span-1">
                      {p.status === 'promoted' ? (
                        <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200">
                          In Pipeline
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          Available
                        </Badge>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      {p.status !== 'promoted' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => { e.stopPropagation(); handlePromote(p.id); }}
                              disabled={promoting === p.id}
                            >
                              {promoting === p.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArrowRight className="w-3.5 h-3.5" style={{ color: '#3e8692' }} />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Add to Pipeline</TooltipContent>
                        </Tooltip>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100">
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <div className="font-semibold text-gray-700 mb-1">Links</div>
                          <div className="flex items-center gap-2">
                            {p.website_url && (
                              <a href={p.website_url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#3e8692] flex items-center gap-1">
                                <Globe className="w-3 h-3" /> Website
                              </a>
                            )}
                            {p.twitter_url && (
                              <a href={p.twitter_url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#3e8692] flex items-center gap-1">
                                <span className="font-bold text-[10px]">𝕏</span> Twitter
                              </a>
                            )}
                            {p.source_url && (
                              <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#3e8692] flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" /> Source
                              </a>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold text-gray-700 mb-1">Funding Date</div>
                          <div className="text-gray-600">{formatDate(p.last_funding_date)}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-gray-700 mb-1">Korea Relevancy</div>
                          <div className="text-gray-600">
                            {p.korea_relevancy_score > 0 ? (
                              <span className={`font-bold ${p.korea_relevancy_score >= 70 ? 'text-red-600' : p.korea_relevancy_score >= 40 ? 'text-orange-600' : 'text-amber-600'}`}>
                                Score: {p.korea_relevancy_score}
                              </span>
                            ) : (
                              <span className="text-gray-400">No Korea signals yet</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {p.investors && (
                        <div className="mt-3">
                          <div className="font-semibold text-gray-700 mb-1 text-xs">All Investors</div>
                          {renderInvestors(p.investors)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Recent Funding Rounds */}
        {recentRounds.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-3.5 h-3.5" style={{ color: '#3e8692' }} />
              <h4 className="font-semibold text-sm" style={{ color: '#3e8692' }}>Recent Funding Rounds Detected</h4>
              <Badge variant="secondary" className="text-[10px]">{recentRounds.length}</Badge>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {recentRounds.slice(0, 15).map((round) => {
                const roundStyle = getRoundStyle(round.round_type);
                return (
                  <div key={round.id} className="flex items-center gap-3 px-4 py-2.5">
                    {/* Project info */}
                    <div className="flex items-center gap-2 min-w-[180px]">
                      {round.prospects?.logo_url ? (
                        <img src={round.prospects.logo_url} alt="" className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[9px] text-gray-400 font-bold">
                          {round.project_name.charAt(0)}
                        </div>
                      )}
                      <span className="text-sm font-medium truncate">{round.project_name}</span>
                    </div>

                    {/* Round type */}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${roundStyle.bg} ${roundStyle.color}`}>
                      {roundStyle.label}
                    </span>

                    {/* Amount */}
                    <span className="text-sm font-bold text-emerald-700 min-w-[60px]">
                      {formatAmount(round.amount_usd)}
                    </span>

                    {/* Korean VC flag */}
                    {round.has_korean_vc && (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-semibold border border-red-200 flex items-center gap-0.5 shrink-0">
                            <Flag className="w-2.5 h-2.5" /> {round.korean_vcs || 'Korean VC'}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Korean VC involvement detected</TooltipContent>
                      </Tooltip>
                    )}

                    {/* Lead investor */}
                    {round.lead_investor && (
                      <span className="text-[10px] text-gray-500 truncate">
                        Lead: <span className={`font-medium ${isKoreanVC(round.lead_investor) ? 'text-red-600' : 'text-gray-700'}`}>{round.lead_investor}</span>
                      </span>
                    )}

                    <div className="flex-1" />

                    {/* Date */}
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatDate(round.announced_date)}
                    </span>

                    {/* Source link */}
                    {round.source_url && (
                      <a href={round.source_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#3e8692] shrink-0">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
