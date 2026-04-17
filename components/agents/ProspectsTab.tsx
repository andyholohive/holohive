'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import ICPSettingsDialog from './ICPSettingsDialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import {
  Search, Globe, ExternalLink, ArrowRight, XCircle, MoreHorizontal,
  Loader2, ChevronLeft, ChevronRight, CheckCircle, Eye, Download, Trash2, Settings,
} from 'lucide-react';

// ─── Signal type labels for KR score breakdown ───
const SIGNAL_LABELS: Record<string, string> = {
  // Tier 1
  tge_within_60d: 'TGE / Token Launch',
  mainnet_launch: 'Mainnet Launch',
  funding_round_5m: 'Funding ($5M+)',
  airdrop_announcement: 'Airdrop',
  korea_expansion_announce: 'Korea Expansion',
  dao_asia_governance: 'DAO Asia Vote',
  korea_job_posting: 'Korea Job',
  korea_exchange_no_community: 'KR Exchange No Community',
  korea_collab: 'Korea Collab',
  // Tier 2
  ecosystem_asia_initiative: 'Asia Initiative',
  staking_defi_launch: 'Staking/DeFi Launch',
  leadership_change: 'Leadership Change',
  vc_portfolio_cascade: 'VC Cascade',
  korea_partnership: 'Partnership',
  korea_intent_competitor: 'Competitor in Korea',
  multi_chain_expansion: 'Multi-Chain',
  apac_conference: 'APAC Conference',
  team_expansion: 'Team Expansion',
  korea_event: 'Korea Event',
  korea_kol_organic: 'KOL Coverage',
  korea_retail_volume_spike: 'KR Volume Spike',
  korea_regulatory_tailwind: 'Regulatory Tailwind',
  // Tier 3
  testnet_compound: 'Testnet',
  ecosystem_grant_asia: 'Asia Grant',
  token_unlock: 'Token Unlock',
  news_mention: 'News Mention',
  web2_to_web3: 'Web2 to Web3',
  accelerator_graduation: 'Accelerator Grad',
  community_growth_spike: 'Community Spike',
  dead_korean_presence: 'Dead KR Channel',
  korea_community_mention: 'KR Community',
  korean_vc_cap_table: 'Korean VC',
  // Tier 4
  warm_intro_available: 'Warm Intro',
  decision_maker_identified: 'Decision Maker',
  previous_contact_positive: 'Previous Contact (+)',
  previous_contact_cold: 'Previous Contact (-)',
  // Negative
  korea_exchange_delisting: 'Delisting',
  korea_regulatory_warning: 'Regulatory Warning',
  korea_scam_alert: 'Scam Alert',
  korea_agency_present: 'Has Korea Agency',
  // Legacy
  korea_hiring: 'Korea Hiring',
  korea_community: 'Korean Community',
  korea_localization: 'Localization',
  social_presence: 'Social Presence',
  korea_intent_apac: 'APAC Expansion',
  korea_intent_vc: 'Korean VC Backed',
  korea_intent_conference: 'Korea Conference',
  korea_intent_hiring: 'Asia Hiring',
  korea_intent_exchange: 'Asian Exchange',
};

const ACTION_TIER_BADGE: Record<string, { label: string; color: string }> = {
  REACH_OUT_NOW: { label: 'Reach Out', color: 'bg-red-100 text-red-700' },
  PRE_TOKEN_PRIORITY: { label: 'Pre-Token', color: 'bg-orange-100 text-orange-700' },
  WATCH: { label: 'Watch', color: 'bg-yellow-100 text-yellow-700' },
  RESEARCH: { label: 'Research', color: 'bg-blue-100 text-blue-700' },
  NURTURE: { label: 'Nurture', color: 'bg-gray-100 text-gray-600' },
  SKIP: { label: 'Skip', color: 'bg-gray-50 text-gray-400' },
};

// ─── Lazy-loading Korea score popover ───
function KoreaScoreCard({ prospectId, score, signalCount }: { prospectId: string; score: number; signalCount: number }) {
  const [signals, setSignals] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSignals = async () => {
    if (signals !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/prospects/signals?prospect_id=${prospectId}`);
      const data = await res.json();
      setSignals(data.signals || []);
    } catch {
      setSignals([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <HoverCardPrimitive.Root openDelay={200} closeDelay={100}>
      <HoverCardPrimitive.Trigger asChild>
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded cursor-help ${
            score >= 70 ? 'bg-red-100 text-red-700' :
            score >= 40 ? 'bg-orange-100 text-orange-700' :
            'bg-amber-100 text-amber-700'
          }`}
          onMouseEnter={loadSignals}
        >
          {score >= 70 ? '🔴' : score >= 40 ? '🟠' : '🟡'} {score}
        </span>
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="left"
          align="start"
          sideOffset={8}
          className="z-50 w-[340px] max-h-[400px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        >
          <div className="text-xs">
            <div className="font-semibold text-gray-900 mb-1">Korea Relevancy: {score}/100</div>
            <div className="text-gray-500 mb-2">{signalCount} signal{signalCount !== 1 ? 's' : ''} detected</div>
            {loading && (
              <div className="flex items-center gap-1.5 text-gray-400 py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading signals...
              </div>
            )}
            {signals && signals.length > 0 && (
              <div className="space-y-1.5 border-t border-gray-100 pt-2">
                {signals.filter((s: any) => s.is_active).slice(0, 8).map((s: any, i: number) => {
                  const isNegative = s.relevancy_weight < 0;
                  return (
                    <div key={i} className={`rounded px-2 py-1.5 ${isNegative ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-medium ${isNegative ? 'text-red-700' : 'text-gray-800'}`}>
                          {SIGNAL_LABELS[s.signal_type] || s.signal_type}
                        </span>
                        <span className={`text-[10px] font-bold ${isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
                          {isNegative ? '' : '+'}{s.relevancy_weight}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-600 line-clamp-1 mt-0.5">{s.headline}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-gray-400">{s.source_name}</span>
                        {s.source_url && (
                          <a
                            href={s.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[#3e8692] hover:underline flex items-center gap-0.5"
                            onClick={e => e.stopPropagation()}
                          >
                            Source <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                {signals.filter((s: any) => s.is_active).length > 8 && (
                  <div className="text-[10px] text-gray-400 text-center pt-1">
                    +{signals.filter((s: any) => s.is_active).length - 8} more — see Korea Signals tab
                  </div>
                )}
              </div>
            )}
            {signals && signals.length === 0 && (
              <div className="text-gray-400 py-1">No signal details available</div>
            )}
          </div>
          <HoverCardPrimitive.Arrow className="fill-white" />
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

interface Prospect {
  id: string;
  name: string;
  symbol: string | null;
  category: string | null;
  market_cap: number | null;
  price: number | null;
  volume_24h: number | null;
  website_url: string | null;
  twitter_url: string | null;
  telegram_url: string | null;
  discord_url: string | null;
  logo_url: string | null;
  source_url: string | null;
  source: string;
  status: string;
  icp_score: number;
  korea_relevancy_score: number;
  korea_signal_count: number;
  action_tier: string | null;
  is_disqualified: boolean | null;
  scraped_at: string;
}

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: 'bg-gray-50', text: 'text-gray-600', label: 'Not Checked' },
  needs_review: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Needs Review' },
  reviewed: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Potential' },
  promoted: { bg: 'bg-teal-50', text: 'text-teal-700', label: 'Promoted' },
  dismissed: { bg: 'bg-gray-50', text: 'text-gray-400', label: 'Dismissed' },
};

export default function ProspectsTab() {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('reviewed');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('icp_score');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // Action loading
  const [promoting, setPromoting] = useState<string | null>(null);
  const [bulkActing, setBulkActing] = useState(false);

  // Scraper
  const [scraperOpen, setScraperOpen] = useState(false);
  const [scraperSource, setScraperSource] = useState<'dropstab' | 'coingecko' | 'defillama'>('coingecko');
  const [scraperCount, setScraperCount] = useState('250');
  const [scraperTabs, setScraperTabs] = useState<string[]>(['all']);
  const [scraperWithLinks, setScraperWithLinks] = useState(false);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperResult, setScraperResult] = useState<{ scraped: number; inserted: number; errors: number } | null>(null);
  const [scraperError, setScraperError] = useState<string | null>(null);
  const [scraperCategory, setScraperCategory] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const SOURCES = [
    { value: 'coingecko' as const, label: 'CoinGecko', description: 'Up to 10,000+ coins, works on Vercel', maxPerRequest: 250 },
    { value: 'defillama' as const, label: 'DeFi Llama', description: 'DeFi protocols with TVL, works on Vercel', maxPerRequest: 2000 },
    { value: 'dropstab' as const, label: 'DropsTab', description: 'Up to 100 per tab, local only', maxPerRequest: 100 },
  ];

  const DROPSTAB_TABS = [
    { value: 'all', label: 'All Crypto', description: 'Top 100 by market cap' },
    { value: 'memes', label: 'Memes', description: 'Meme coins' },
    { value: 'ai-agents', label: 'AI Agents', description: 'AI/ML projects' },
    { value: 'by-raised-funds', label: 'By Raised Funds', description: 'Projects with funding' },
    { value: 'token-buybacks', label: 'Token Buybacks', description: 'Buyback programs' },
    { value: 'perp', label: 'PERP DEXes', description: 'Perpetual exchanges' },
    { value: 'airdrops', label: 'Potential Airdrops', description: 'Upcoming airdrops' },
    { value: 'prediction-markets', label: 'Predictions', description: 'Prediction markets' },
    { value: 'listing-ec2yuflbg6', label: 'New Listings', description: 'Recently launched coins' },
  ];

  const COINGECKO_CATEGORIES = [
    { value: '', label: 'All Coins' },
    { value: 'decentralized-finance-defi', label: 'DeFi' },
    { value: 'non-fungible-tokens-nft', label: 'NFT' },
    { value: 'gaming', label: 'Gaming' },
    { value: 'artificial-intelligence', label: 'AI' },
    { value: 'meme-token', label: 'Meme' },
    { value: 'layer-1', label: 'Layer 1' },
    { value: 'layer-2', label: 'Layer 2' },
    { value: 'real-world-assets-rwa', label: 'RWA' },
    { value: 'decentralized-perpetual-exchange', label: 'Perp DEX' },
  ];

  const DEFILLAMA_CATEGORIES = [
    { value: '', label: 'All Protocols' },
    { value: 'Lending', label: 'Lending' },
    { value: 'Dexes', label: 'DEXes' },
    { value: 'Liquid Staking', label: 'Liquid Staking' },
    { value: 'Bridge', label: 'Bridges' },
    { value: 'Yield', label: 'Yield' },
    { value: 'Derivatives', label: 'Derivatives' },
    { value: 'CDP', label: 'CDP' },
    { value: 'RWA', label: 'RWA' },
    { value: 'Gaming', label: 'Gaming' },
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sortBy,
        sortAsc: 'false',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/prospects?${params}`);
      const data = await res.json();
      if (res.ok) {
        setProspects(data.data || []);
        setTotal(data.count || 0);
        if (data.categories) setCategories(data.categories);
        if (data.statusCounts) setStatusCounts(data.statusCounts);
      }
    } catch (err) {
      console.error('Error fetching prospects:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter, search, sortBy]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  // Debounced search
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);
  const handleSearch = (value: string) => {
    if (searchDebounce) clearTimeout(searchDebounce);
    setSearchDebounce(setTimeout(() => {
      setSearch(value);
      setPage(1);
      setSelected([]);
    }, 300));
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelected(prospects.map(p => p.id));
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
        toast({ title: 'Promoted', description: 'Prospect added to pipeline as Cold DM' });
        fetchProspects();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to promote', variant: 'destructive' });
    } finally {
      setPromoting(null);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await fetch('/api/prospects/promote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'dismissed' }),
      });
      fetchProspects();
    } catch {
      toast({ title: 'Error', description: 'Failed to dismiss', variant: 'destructive' });
    }
  };

  const handleBulkPromote = async () => {
    setBulkActing(true);
    try {
      const res = await fetch('/api/prospects/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected }),
      });
      const data = await res.json();
      toast({ title: 'Bulk Promote', description: `Promoted ${data.promoted || 0}, errors: ${data.errors || 0}` });
      setSelected([]);
      fetchProspects();
    } finally {
      setBulkActing(false);
    }
  };

  const handleBulkDismiss = async () => {
    setBulkActing(true);
    try {
      await fetch('/api/prospects/promote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected, status: 'dismissed' }),
      });
      setSelected([]);
      fetchProspects();
    } finally {
      setBulkActing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch('/api/prospects/promote', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchProspects();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.length} prospect(s)? This cannot be undone.`)) return;
    setBulkActing(true);
    try {
      await fetch('/api/prospects/promote', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected }),
      });
      setSelected([]);
      fetchProspects();
      toast({ title: 'Deleted', description: `${selected.length} prospect(s) deleted` });
    } finally {
      setBulkActing(false);
    }
  };

  const formatMarketCap = (mc: number | null) => {
    if (!mc) return '—';
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(1)}M`;
    if (mc >= 1e3) return `$${(mc / 1e3).toFixed(0)}K`;
    return `$${mc.toFixed(0)}`;
  };

  const formatPrice = (p: number | null) => {
    if (!p) return '—';
    if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    return `$${p.toPrecision(3)}`;
  };

  const getScoreReason = (p: Prospect) => {
    const reasons: string[] = [];
    if (p.icp_score === 0) {
      reasons.push('No score — may be disqualified or missing data');
      return reasons;
    }
    if (p.category) reasons.push(`Category: ${p.category}`);
    else reasons.push('No category data');
    if (p.market_cap) {
      const mc = Number(p.market_cap);
      if (mc >= 1e9) reasons.push(`Market cap: $${(mc/1e9).toFixed(1)}B`);
      else if (mc >= 1e6) reasons.push(`Market cap: $${(mc/1e6).toFixed(0)}M`);
      else reasons.push(`Market cap: $${mc.toLocaleString()}`);
    } else reasons.push('No market cap data');
    const links = [p.website_url && 'Website', p.twitter_url && 'Twitter', p.telegram_url && 'Telegram'].filter(Boolean);
    if (links.length > 0) reasons.push(`Links: ${links.join(', ')}`);
    else reasons.push('No links available');

    if (p.icp_score >= 70) reasons.push('→ Potential (score 70+)');
    else if (p.icp_score >= 40) reasons.push('→ Needs Review (score 40-69)');
    else reasons.push('→ Dismissed (score < 40)');
    return reasons;
  };

  const LinkIcon = ({ url, icon: Icon, label }: { url: string | null; icon: any; label: string }) => {
    if (!url) return null;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title={label}
         className="text-gray-400 hover:text-[#3e8692] transition-colors"
         onClick={e => e.stopPropagation()}>
        <Icon className="w-3.5 h-3.5" />
      </a>
    );
  };

  const handleRunScraper = async () => {
    setScraperRunning(true);
    setScraperResult(null);
    setScraperError(null);
    let totalScraped = 0, totalInserted = 0, totalErrors = 0;
    try {
      if (scraperSource === 'dropstab') {
        // DropsTab: iterate through selected tabs
        const countPerTab = Math.min(parseInt(scraperCount) || 100, 100);
        for (const tab of scraperTabs) {
          const res = await fetch('/api/prospects/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'dropstab', count: countPerTab, tab, withLinks: scraperWithLinks }),
          });
          const data = await res.json();
          if (!res.ok) { setScraperError(data.error || `Failed on ${tab}`); break; }
          totalScraped += data.scraped || 0;
          totalInserted += data.inserted || 0;
          totalErrors += data.errors || 0;
          setScraperResult({ scraped: totalScraped, inserted: totalInserted, errors: totalErrors });
        }
      } else {
        // CoinGecko / DeFi Llama: single API call
        const res = await fetch('/api/prospects/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: scraperSource,
            count: parseInt(scraperCount) || 250,
            category: (scraperCategory && !scraperCategory.startsWith('all-')) ? scraperCategory : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setScraperError(data.error || 'Import failed'); }
        else {
          totalScraped = data.scraped || 0;
          totalInserted = data.inserted || 0;
          totalErrors = data.errors || 0;
        }
      }
      if (!scraperError) {
        setScraperResult({ scraped: totalScraped, inserted: totalInserted, errors: totalErrors });
      }
      fetchProspects();
    } catch (err: any) {
      setScraperError(err.message || 'Network error');
    } finally {
      setScraperRunning(false);
    }
  };

  return (
    <TooltipProvider>
    <div className="pb-8">
      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {[
          { value: 'reviewed', label: 'Potential' },
          { value: 'needs_review', label: 'Needs Review' },
          { value: 'new', label: 'Not Checked' },
          { value: 'promoted', label: 'Promoted' },
          { value: 'dismissed', label: 'Dismissed' },
          { value: 'all', label: 'All' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); setSelected([]); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === tab.value
                ? 'text-white'
                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
            }`}
            style={statusFilter === tab.value ? { backgroundColor: '#3e8692' } : {}}
          >
            {tab.label}
            {statusCounts[tab.value] != null && tab.value !== 'all' && (
              <span className={`ml-1.5 text-[10px] font-semibold ${statusFilter === tab.value ? 'opacity-80' : 'opacity-60'}`}>
                {statusCounts[tab.value] || 0}
              </span>
            )}
            {tab.value === 'all' && (
              <span className={`ml-1.5 text-[10px] font-semibold ${statusFilter === 'all' ? 'opacity-80' : 'opacity-60'}`}>
                {Object.values(statusCounts).reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Prospects Table View */}
      <>
      {/* Filters + Scraper Button */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search prospects..."
            onChange={e => handleSearch(e.target.value)}
            className="pl-9 h-9 text-sm auth-input"
          />
        </div>
        <Select value={categoryFilter || 'all'} onValueChange={v => { setCategoryFilter(v === 'all' ? '' : v); setPage(1); setSelected([]); }}>
          <SelectTrigger className="h-9 w-auto text-sm auth-input [&>span]:truncate-none [&>span]:line-clamp-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => { setSortBy(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-auto text-sm auth-input [&>span]:truncate-none [&>span]:line-clamp-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="icp_score">ICP Score</SelectItem>
            <SelectItem value="korea_relevancy_score">Korea Relevancy</SelectItem>
            <SelectItem value="scraped_at">Latest Scraped</SelectItem>
            <SelectItem value="market_cap">Market Cap</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="w-4 h-4 mr-1.5" />
          ICP Settings
        </Button>
        <Button
          size="sm"
          onClick={() => { setScraperResult(null); setScraperError(null); setScraperOpen(true); }}
          style={{ backgroundColor: '#3e8692', color: 'white' }}
          className="hover:opacity-90 h-9"
        >
          <Download className="w-4 h-4 mr-1.5" />
          Import Prospects
        </Button>
      </div>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-lg" style={{ backgroundColor: '#3e869215', border: '1px solid #3e869240' }}>
          <span className="text-sm font-medium" style={{ color: '#3e8692' }}>{selected.length} selected</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>Select All on Page</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelected([])}>Deselect</Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            onClick={async () => {
              setBulkActing(true);
              try {
                await fetch('/api/prospects/promote', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ids: selected, status: 'reviewed' }),
                });
                setSelected([]);
                fetchProspects();
              } finally { setBulkActing(false); }
            }}
            disabled={bulkActing}
          >
            <Eye className="h-3 w-3 mr-1" /> Mark Potential
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs text-white"
            style={{ backgroundColor: '#3e8692' }}
            onClick={handleBulkPromote}
            disabled={bulkActing}
          >
            {bulkActing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowRight className="h-3 w-3 mr-1" />}
            Add to Pipeline
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-gray-500"
            onClick={handleBulkDismiss}
            disabled={bulkActing}
          >
            <XCircle className="h-3 w-3 mr-1" /> Dismiss
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleBulkDelete}
            disabled={bulkActing}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-lg border border-b-0" style={{ backgroundColor: '#3e869210', borderColor: '#3e869230' }}>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4" style={{ color: '#3e8692' }} />
          <h4 className="font-semibold" style={{ color: '#3e8692' }}>Prospects</h4>
          <Badge variant="secondary" className="text-xs font-medium">{total}</Badge>
        </div>
        {totalPages > 1 && (
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 p-4 space-y-2">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="bg-white rounded-b-lg border border-gray-200 border-t-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="w-10"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="whitespace-nowrap">Category</TableHead>
                <TableHead className="whitespace-nowrap">Market Cap</TableHead>
                <TableHead className="w-[80px]">Price</TableHead>
                <TableHead className="w-[80px]">Links</TableHead>
                <TableHead className="w-[60px]">ICP</TableHead>
                <TableHead className="w-[50px]">KR</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead className="w-[90px]">Scraped</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prospects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-16">
                    <Globe className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium text-gray-700 mb-1">No prospects yet</p>
                    <p className="text-xs text-gray-400 mb-4">Import projects from DropsTab to start discovering new prospects.</p>
                    <Button
                      size="sm"
                      onClick={() => { setScraperResult(null); setScraperError(null); setScraperOpen(true); }}
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                      className="hover:opacity-90"
                    >
                      <Download className="w-4 h-4 mr-1.5" />
                      Import Prospects
                    </Button>
                  </TableCell>
                </TableRow>
              ) : prospects.map((p) => {
                const isChecked = selected.includes(p.id);
                const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES.new;

                return (
                  <TableRow key={p.id} className="group hover:bg-gray-50">
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.logo_url ? (
                          <img src={p.logo_url} alt="" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 font-bold">
                            {p.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-sm">{p.name}</span>
                          {p.symbol && <span className="text-xs text-gray-400 ml-1.5">{p.symbol}</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.category ? (
                        <Badge variant="outline" className="text-[10px]">{p.category}</Badge>
                      ) : <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 font-medium">{formatMarketCap(p.market_cap)}</TableCell>
                    <TableCell className="text-sm text-gray-600">{formatPrice(p.price)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <LinkIcon url={p.website_url} icon={Globe} label="Website" />
                        <LinkIcon url={p.twitter_url} icon={() => <span className="text-xs font-bold">𝕏</span>} label="Twitter" />
                        <LinkIcon url={p.telegram_url} icon={() => <span className="text-xs">TG</span>} label="Telegram" />
                        {p.source_url && (
                          <a href={p.source_url} target="_blank" rel="noopener noreferrer" title="View on DropsTab"
                             className="text-gray-400 hover:text-[#3e8692]" onClick={e => e.stopPropagation()}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded cursor-help ${
                            p.icp_score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                            p.icp_score >= 40 ? 'bg-amber-100 text-amber-700' :
                            p.icp_score > 0 ? 'bg-gray-100 text-gray-500' :
                            'bg-gray-50 text-gray-300'
                          }`}>
                            {p.icp_score || '—'}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[220px]">
                          <div className="text-xs space-y-0.5">
                            <div className="font-semibold mb-1">ICP Score: {p.icp_score}/100</div>
                            {getScoreReason(p).map((r, i) => (
                              <div key={i} className={r.startsWith('→') ? 'font-medium mt-1' : 'text-gray-300'}>{r}</div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {p.korea_relevancy_score > 0 ? (
                          <KoreaScoreCard
                            prospectId={p.id}
                            score={p.korea_relevancy_score}
                            signalCount={p.korea_signal_count}
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                        {p.action_tier && p.action_tier !== 'SKIP' && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ACTION_TIER_BADGE[p.action_tier]?.color || 'bg-gray-100 text-gray-500'}`}>
                            {ACTION_TIER_BADGE[p.action_tier]?.label || p.action_tier}
                          </span>
                        )}
                        {p.is_disqualified && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">DQ</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {p.scraped_at ? new Date(p.scraped_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => handlePromote(p.id)}
                            disabled={p.status === 'promoted' || promoting === p.id}
                          >
                            {promoting === p.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                            Add to Pipeline
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            fetch('/api/prospects/promote', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: p.id, status: 'reviewed' }),
                            }).then(() => fetchProspects());
                          }}>
                            <Eye className="h-4 w-4 mr-2" /> Mark as Potential
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDismiss(p.id)} className="text-gray-500">
                            <XCircle className="h-4 w-4 mr-2" /> Dismiss
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { if (confirm('Delete this prospect?')) handleDelete(p.id); }} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <div className="text-sm text-gray-600">
            Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPage(p => p - 1); setSelected([]); }}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPage(p => p + 1); setSelected([]); }}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      </>

      {/* ICP Settings Dialog */}
      <ICPSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onScoresUpdated={() => fetchProspects()}
      />

      {/* Scraper Dialog */}
      <Dialog open={scraperOpen} onOpenChange={setScraperOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Prospects</DialogTitle>
            <DialogDescription>
              Import cryptocurrency projects from external sources.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Source Selection */}
            <div className="grid gap-2">
              <Label>Source</Label>
              <div className="grid grid-cols-3 gap-2">
                {SOURCES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => {
                      setScraperSource(s.value);
                      setScraperCategory('');
                      setScraperCount(s.value === 'coingecko' ? '250' : s.value === 'defillama' ? '500' : '100');
                    }}
                    disabled={scraperRunning}
                    className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                      scraperSource === s.value
                        ? 'text-white border-transparent'
                        : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                    style={scraperSource === s.value ? { backgroundColor: '#3e8692' } : {}}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400">
                {SOURCES.find(s => s.value === scraperSource)?.description}
              </p>
            </div>

            {/* DropsTab: multi-tab selection */}
            {scraperSource === 'dropstab' && (
              <div className="grid gap-2">
                <Label>Categories <span className="font-normal text-gray-400">({scraperTabs.length} selected — up to 100 per tab)</span></Label>
                <div className="border rounded-md p-2 max-h-[160px] overflow-y-auto space-y-1">
                  {DROPSTAB_TABS.map(t => (
                    <label
                      key={t.value}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-50 ${scraperTabs.includes(t.value) ? 'bg-[#3e8692]/5' : ''}`}
                    >
                      <Checkbox
                        checked={scraperTabs.includes(t.value)}
                        onCheckedChange={(checked) => {
                          if (checked) setScraperTabs(prev => [...prev, t.value]);
                          else setScraperTabs(prev => prev.filter(v => v !== t.value));
                        }}
                        disabled={scraperRunning}
                        className="data-[state=checked]:bg-[#3e8692] data-[state=checked]:border-[#3e8692]"
                      />
                      <span className="text-sm flex-1">{t.label}</span>
                      <span className="text-xs text-gray-400">{t.description}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setScraperTabs(DROPSTAB_TABS.map(t => t.value))} disabled={scraperRunning}>Select All</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setScraperTabs([])} disabled={scraperRunning}>Clear</Button>
                </div>
              </div>
            )}

            {/* CoinGecko: category dropdown */}
            {scraperSource === 'coingecko' && (
              <div className="grid gap-2">
                <Label>Category <span className="font-normal text-gray-400">(optional)</span></Label>
                <Select value={scraperCategory} onValueChange={setScraperCategory} disabled={scraperRunning}>
                  <SelectTrigger className="auth-input [&>span]:truncate-none [&>span]:line-clamp-none"><SelectValue placeholder="All Coins" /></SelectTrigger>
                  <SelectContent>
                    {COINGECKO_CATEGORIES.map(c => <SelectItem key={c.value || 'all'} value={c.value || 'all-coins'}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* DeFi Llama: category dropdown */}
            {scraperSource === 'defillama' && (
              <div className="grid gap-2">
                <Label>Category <span className="font-normal text-gray-400">(optional)</span></Label>
                <Select value={scraperCategory} onValueChange={setScraperCategory} disabled={scraperRunning}>
                  <SelectTrigger className="auth-input [&>span]:truncate-none [&>span]:line-clamp-none"><SelectValue placeholder="All Protocols" /></SelectTrigger>
                  <SelectContent>
                    {DEFILLAMA_CATEGORIES.map(c => <SelectItem key={c.value || 'all'} value={c.value || 'all-protocols'}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Count */}
            <div className="grid gap-2">
              <Label>Number of Projects {scraperSource === 'dropstab' && <span className="font-normal text-gray-400">(per tab, max 100)</span>}</Label>
              <Input
                type="number"
                value={scraperCount}
                onChange={e => setScraperCount(e.target.value)}
                className="auth-input"
                disabled={scraperRunning}
                max={scraperSource === 'dropstab' ? 100 : undefined}
              />
            </div>

            {/* DropsTab only: fetch social links */}
            {scraperSource === 'dropstab' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="withLinks"
                  checked={scraperWithLinks}
                  onCheckedChange={(v) => setScraperWithLinks(v === true)}
                  disabled={scraperRunning}
                  className="data-[state=checked]:bg-[#3e8692] data-[state=checked]:border-[#3e8692]"
                />
                <Label htmlFor="withLinks" className="text-sm text-gray-600 cursor-pointer font-normal">
                  Fetch social links (slower — visits each project page)
                </Label>
              </div>
            )}

            {scraperError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {scraperError}
              </div>
            )}

            {scraperResult && (
              <div className={`p-3 rounded-lg text-sm flex items-center gap-1.5 ${scraperRunning ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                {scraperRunning ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
                {scraperRunning ? 'In progress — ' : ''}{scraperResult.inserted} unique projects imported
                {scraperResult.scraped !== scraperResult.inserted && ` (${scraperResult.scraped - scraperResult.inserted} duplicates across tabs skipped)`}
                {scraperResult.errors > 0 && `, ${scraperResult.errors} errors`}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScraperOpen(false)}>
              {scraperResult ? 'Done' : 'Cancel'}
            </Button>
            {(!scraperResult || scraperRunning) && (
              <Button
                onClick={handleRunScraper}
                disabled={scraperRunning || (scraperSource === 'dropstab' && scraperTabs.length === 0)}
                style={{ backgroundColor: '#3e8692', color: 'white' }}
                className="hover:opacity-90"
              >
                {scraperRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing from {SOURCES.find(s => s.value === scraperSource)?.label}...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Import from {SOURCES.find(s => s.value === scraperSource)?.label}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
