'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Loader2, Radar, ExternalLink, TrendingUp, Newspaper, Building2,
  RefreshCw, AlertCircle, Zap, Globe, Search, Bot, Activity,
  Clock, DollarSign, Cpu, Timer, ChevronDown, ArrowRight, Filter,
  CalendarClock, Plus,
} from 'lucide-react';

// ─── Types ───

interface Signal {
  id: string;
  prospect_id: string | null;
  project_name: string;
  signal_type: string;
  headline: string;
  snippet: string | null;
  source_url: string | null;
  source_name: string;
  relevancy_weight: number;
  detected_at: string;
  is_active: boolean;
  prospects?: {
    name: string;
    symbol: string | null;
    logo_url: string | null;
    category: string | null;
  };
}

interface ScanResult {
  modes: string[];
  recency_months: number;
  scan_duration_ms: number;
  scan_duration_seconds: number;
  scanned: {
    prospects: number;
    upbit_tokens: number;
    bithumb_tokens: number;
    tokenpost_articles: number;
    blockmedia_articles: number;
    total_rss_articles: number;
    filtered_recent_articles: number;
  };
  signals_found: number;
  signals_inserted: number;
  prospects_with_signals: number;
  discovery?: {
    new_prospects: number;
    errors: number;
    candidates_checked: number;
  };
  web?: {
    search_results: number;
    articles_scraped: number;
    projects_discovered: number;
  };
  claude?: {
    articles_analyzed: number;
    signals_found: number;
    cost_usd: number;
    tokens_used: number;
  };
}

interface TopProspect {
  id: string;
  name: string;
  symbol: string | null;
  category: string | null;
  market_cap: number | null;
  korea_relevancy_score: number;
  korea_signal_count: number;
  logo_url: string | null;
  source: string;
  status: string;
}

// ─── Constants ───

const SIGNAL_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string; tier?: number }> = {
  // ═══ Tier 1 — Act Immediately ═══
  tge_within_60d: { icon: Zap, label: 'TGE / Token Launch', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },
  mainnet_launch: { icon: Zap, label: 'Mainnet Launch', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },
  funding_round_5m: { icon: DollarSign, label: 'Funding Round ($5M+)', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },
  airdrop_announcement: { icon: Zap, label: 'Airdrop Announced', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },
  korea_expansion_announce: { icon: Globe, label: 'Korea Expansion', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },
  dao_asia_governance: { icon: Activity, label: 'DAO Asia Governance', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },
  korea_job_posting: { icon: Search, label: 'Korea Job Posting', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },
  korea_exchange_no_community: { icon: Building2, label: 'KR Exchange No Community', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },
  korea_collab: { icon: Zap, label: 'Korea Collaboration', color: 'text-red-700', bg: 'bg-red-50 border-red-200', tier: 1 },

  // ═══ Tier 2 — Act This Week ═══
  ecosystem_asia_initiative: { icon: Globe, label: 'Asia Ecosystem Initiative', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  staking_defi_launch: { icon: TrendingUp, label: 'Staking/DeFi Launch', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  leadership_change: { icon: Search, label: 'Leadership Change', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  vc_portfolio_cascade: { icon: TrendingUp, label: 'VC Portfolio Cascade', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  korea_partnership: { icon: Zap, label: 'Korea Partnership', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  korea_intent_competitor: { icon: TrendingUp, label: 'Competitor in Korea', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  multi_chain_expansion: { icon: Globe, label: 'Multi-Chain Expansion', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  apac_conference: { icon: Activity, label: 'APAC Conference', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  team_expansion: { icon: Search, label: 'Team Expansion', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  korea_event: { icon: TrendingUp, label: 'Korea Event', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  korea_kol_organic: { icon: Activity, label: 'KOL Organic Coverage', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  korea_retail_volume_spike: { icon: TrendingUp, label: 'KR Retail Volume Spike', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },
  korea_regulatory_tailwind: { icon: Activity, label: 'Regulatory Tailwind', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tier: 2 },

  // ═══ Tier 3 — Monitor/Nurture ═══
  testnet_compound: { icon: Activity, label: 'Testnet (Compound)', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 3 },
  ecosystem_grant_asia: { icon: Globe, label: 'Asia Grant Program', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 3 },
  token_unlock: { icon: Zap, label: 'Token Unlock', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 3 },
  news_mention: { icon: Newspaper, label: 'News Mention', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', tier: 3 },
  web2_to_web3: { icon: Globe, label: 'Web2 to Web3', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 3 },
  accelerator_graduation: { icon: TrendingUp, label: 'Accelerator Grad', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 3 },
  community_growth_spike: { icon: Activity, label: 'Community Spike', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 3 },
  dead_korean_presence: { icon: AlertCircle, label: 'Dead Korean Channel', color: 'text-red-700', bg: 'bg-red-50 border-red-300', tier: 3 },
  korea_community_mention: { icon: Activity, label: 'KR Community Mention', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 3 },
  korean_vc_cap_table: { icon: TrendingUp, label: 'Korean VC in Cap Table', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 3 },

  // ═══ Tier 4 — Enrichment ═══
  warm_intro_available: { icon: Zap, label: 'Warm Intro Available', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', tier: 4 },
  decision_maker_identified: { icon: Search, label: 'Decision Maker Found', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', tier: 4 },
  previous_contact_positive: { icon: Activity, label: 'Previous Contact (+)', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', tier: 4 },
  previous_contact_cold: { icon: AlertCircle, label: 'Previous Contact (-)', color: 'text-red-700', bg: 'bg-red-50 border-red-300', tier: 4 },

  // ═══ Negative signals ═══
  korea_exchange_delisting: { icon: AlertCircle, label: 'Exchange Delisting', color: 'text-red-700', bg: 'bg-red-50 border-red-300' },
  korea_regulatory_warning: { icon: AlertCircle, label: 'Regulatory Warning', color: 'text-red-700', bg: 'bg-red-50 border-red-300' },
  korea_scam_alert: { icon: AlertCircle, label: 'Scam Alert', color: 'text-red-700', bg: 'bg-red-50 border-red-300' },
  korea_agency_present: { icon: AlertCircle, label: 'Has Korea Agency', color: 'text-red-700', bg: 'bg-red-50 border-red-300' },

  // ═══ Legacy (backward compat) ═══
  korea_community: { icon: Globe, label: 'Korean Community', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tier: 1 },
  korea_hiring: { icon: Search, label: 'Korea Hiring', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', tier: 1 },
  korea_localization: { icon: Globe, label: 'Korea Localization', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200', tier: 1 },
  social_presence: { icon: Activity, label: 'Social Presence', color: 'text-pink-700', bg: 'bg-pink-50 border-pink-200', tier: 3 },
  korea_intent_apac: { icon: Globe, label: 'APAC Expansion', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', tier: 2 },
  korea_intent_vc: { icon: TrendingUp, label: 'Korean VC Backed', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', tier: 3 },
  korea_intent_conference: { icon: Activity, label: 'Korea Conference', color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', tier: 2 },
  korea_intent_hiring: { icon: Search, label: 'Asia Hiring', color: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', tier: 2 },
  korea_intent_exchange: { icon: Building2, label: 'Asian Exchange (Not KR)', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', tier: 1 },
};

const ALL_SIGNAL_TYPES = Object.keys(SIGNAL_TYPE_CONFIG);

const DEFAULT_SIGNAL_CONFIG: { icon: React.ElementType; label: string; color: string; bg: string; tier?: number } = { icon: Zap, label: 'Custom Signal', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' };

/** Get config for a signal type, with fallback for custom/unknown types */
function getSignalConfig(type: string): { icon: React.ElementType; label: string; color: string; bg: string; tier?: number } {
  if (SIGNAL_TYPE_CONFIG[type]) return SIGNAL_TYPE_CONFIG[type];
  const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { ...DEFAULT_SIGNAL_CONFIG, label };
}

const SOURCE_LABELS: Record<string, string> = {
  upbit: 'Upbit',
  bithumb: 'Bithumb',
  tokenpost: 'TokenPost',
  blockmedia: 'BlockMedia',
  tokenpost_web: 'TokenPost (Full)',
  blockmedia_web: 'BlockMedia (Full)',
  tokenpost_claude: 'TokenPost (AI)',
  blockmedia_claude: 'BlockMedia (AI)',
  web_search: 'Web Search',
  web_search_claude: 'Web Search (AI)',
  claude_research: 'AI Research',
  coingecko: 'CoinGecko',
  coingecko_community: 'CoinGecko Community',
  defillama: 'DeFiLlama',
  snapshot: 'Snapshot.org',
  cryptojobslist: 'CryptoJobsList',
  web3career: 'Web3.career',
  telegram: 'Telegram',
  exchange_analysis: 'Exchange Analysis',
  crm: 'CRM',
  system: 'System',
};

const ACTION_TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  REACH_OUT_NOW: { label: 'Reach Out Now', color: 'text-red-700', bg: 'bg-red-100' },
  PRE_TOKEN_PRIORITY: { label: 'Pre-Token Priority', color: 'text-orange-700', bg: 'bg-orange-100' },
  WATCH: { label: 'Watch', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  RESEARCH: { label: 'Research', color: 'text-blue-700', bg: 'bg-blue-100' },
  NURTURE: { label: 'Nurture', color: 'text-gray-600', bg: 'bg-gray-100' },
  SKIP: { label: 'Skip', color: 'text-gray-400', bg: 'bg-gray-50' },
};

function TierBadge({ tier }: { tier?: number }) {
  if (!tier) return null;
  const config: Record<number, { label: string; color: string }> = {
    1: { label: 'T1', color: 'bg-red-100 text-red-700' },
    2: { label: 'T2', color: 'bg-purple-100 text-purple-700' },
    3: { label: 'T3', color: 'bg-blue-100 text-blue-700' },
    4: { label: 'T4', color: 'bg-emerald-100 text-emerald-700' },
  };
  const c = config[tier] || config[3];
  return <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${c.color}`}>{c.label}</span>;
}

const AUTO_SCAN_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
];

// Major tokens to filter from prospect list — too large to be actionable BD targets
const MAJOR_TOKENS = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'BNB', 'ADA', 'DOGE', 'DOT', 'MATIC', 'SHIB', 'TRX', 'AVAX', 'LINK', 'UNI', 'LTC', 'BCH', 'ATOM', 'FIL', 'NEAR', 'APT']);

// ─── Component ───

interface KoreaSignalsPanelProps {
  onProspectClick?: (prospectId: string) => void;
}

export default function KoreaSignalsPanel({ onProspectClick }: KoreaSignalsPanelProps) {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Scan modes
  const [modeApi, setModeApi] = useState(true);
  const [modeWeb, setModeWeb] = useState(false);
  const [modeClaude, setModeClaude] = useState(false);
  const [scanCadence, setScanCadence] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [recencyMonths, setRecencyMonths] = useState(1);
  const [scanMenuOpen, setScanMenuOpen] = useState(false);

  // Auto-scan schedule
  const [autoScanFrequency, setAutoScanFrequency] = useState('off');
  const [autoScanLoading, setAutoScanLoading] = useState(false);

  // Dashboard data
  const [totalSignals, setTotalSignals] = useState(0);
  const [byType, setByType] = useState<Record<string, number>>({});
  const [bySource, setBySource] = useState<Record<string, number>>({});
  const [topProspects, setTopProspects] = useState<TopProspect[]>([]);
  const [recentSignals, setRecentSignals] = useState<Signal[]>([]);

  // Signal type filter for Recent Signals
  const [signalTypeFilter, setSignalTypeFilter] = useState<string>('all');

  // Prospect filter for Top Prospects
  const [prospectFilter, setProspectFilter] = useState('all');

  // Cumulative scan stats (across all scans in this session)
  const [totalScans, setTotalScans] = useState(0);
  const [totalClaudeCost, setTotalClaudeCost] = useState(0);
  const [totalClaudeTokens, setTotalClaudeTokens] = useState(0);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);

  // Promoting prospects
  const [promoting, setPromoting] = useState<string | null>(null);
  const [confirmPromote, setConfirmPromote] = useState<{ id: string; name: string; score: number } | null>(null);

  // Signal detail dialog
  const [detailProspectId, setDetailProspectId] = useState<string | null>(null);
  const [detailSignals, setDetailSignals] = useState<Signal[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Manual signal entry
  const [manualSignalOpen, setManualSignalOpen] = useState(false);
  const [manualSignalData, setManualSignalData] = useState({
    prospect_name: '',
    signal_type: 'news_mention',
    headline: '',
    source_url: '',
    confidence: 'likely' as 'confirmed' | 'likely' | 'rumor',
  });
  const [manualSignalSubmitting, setManualSignalSubmitting] = useState(false);
  const [detailName, setDetailName] = useState('');
  const [detailStatus, setDetailStatus] = useState('');

  // Load auto-scan setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('korea_auto_scan');
    if (saved) setAutoScanFrequency(saved);
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, recentRes] = await Promise.all([
        fetch('/api/prospects/signals'),
        fetch('/api/prospects/signals?recent=true&limit=50'),
      ]);
      const stats = await statsRes.json();
      const recent = await recentRes.json();

      setTotalSignals(stats.total_signals || 0);
      setByType(stats.by_type || {});
      setBySource(stats.by_source || {});
      setTopProspects(stats.top_prospects || []);
      setRecentSignals(recent.signals || []);
    } catch (err) {
      console.error('Error fetching signal dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleScan = async () => {
    const modes = [];
    if (modeApi) modes.push('api');
    if (modeWeb) modes.push('web');
    if (modeClaude) modes.push('claude');

    setScanning(true);
    setScanResult(null);
    setScanMenuOpen(false);
    try {
      const body: any = { recency_months: recencyMonths };
      // Use cadence-based scanning by default, fall back to modes
      if (scanCadence) {
        body.cadence = scanCadence;
      } else if (modes.length > 0) {
        body.modes = modes;
      } else {
        body.modes = ['api'];
      }

      const res = await fetch('/api/prospects/signals/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setScanResult(data);
        setTotalScans(prev => prev + 1);
        setLastScanTime(new Date().toISOString());
        if (data.claude) {
          setTotalClaudeCost(prev => prev + (data.claude.cost_usd || 0));
          setTotalClaudeTokens(prev => prev + (data.claude.tokens_used || 0));
        }
        toast({
          title: 'Scan Complete',
          description: `Found ${data.signals_found} signals across ${data.prospects_with_signals} prospects${data.claude ? ` (AI: $${data.claude.cost_usd.toFixed(4)})` : ''}`,
        });
        // Show individual alerts for high-value signals
        if (data.alerts && data.alerts.length > 0) {
          const alertLabels: Record<string, string> = {
            tge_within_60d: 'Token Launch Detected',
            mainnet_launch: 'Mainnet Launch',
            funding_round_5m: 'Funding Round ($5M+)',
            airdrop_announcement: 'Airdrop Announced',
            korea_expansion_announce: 'Korea Expansion',
            dao_asia_governance: 'DAO Asia Vote',
            korea_job_posting: 'Korea Job Posting',
            korea_exchange_no_community: 'KR Exchange No Community',
            warm_intro_available: 'Warm Intro Available',
            korea_partnership: 'Partnership',
            korea_hiring: 'Korea Hiring',
            korea_intent_vc: 'Korean VC Backed',
            korea_intent_apac: 'APAC Expansion',
          };
          data.alerts.slice(0, 3).forEach((alert: any, i: number) => {
            setTimeout(() => {
              toast({
                title: alertLabels[alert.type] || '⚡ High-Value Signal',
                description: `${alert.project}: ${alert.headline}`,
              });
            }, (i + 1) * 800);
          });
        }
        // Show trending prospects
        if (data.trending && data.trending.length > 0) {
          setTimeout(() => {
            toast({
              title: '🔥 Trending Prospects',
              description: `${data.trending.slice(0, 5).join(', ')} — 3+ signals in the last 7 days`,
            });
          }, (data.alerts?.length || 0) * 800 + 800);
        }
        fetchDashboard();
      } else {
        toast({ title: 'Scan Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Network error', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const handlePromote = async (prospectId: string, prospectName: string) => {
    setPromoting(prospectId);
    try {
      const res = await fetch('/api/prospects/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prospectId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: 'Added to Pipeline',
          description: `${prospectName} has been promoted to your sales pipeline.`,
        });
        fetchDashboard();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setPromoting(null);
    }
  };

  const handleAutoScanChange = async (frequency: string) => {
    setAutoScanLoading(true);
    setAutoScanFrequency(frequency);
    localStorage.setItem('korea_auto_scan', frequency);

    try {
      const res = await fetch('/api/prospects/signals/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency }),
      });
      if (res.ok) {
        toast({
          title: frequency === 'off' ? 'Auto-scan disabled' : 'Auto-scan scheduled',
          description: frequency === 'off'
            ? 'Automatic scans have been turned off.'
            : `Signals will be scanned ${frequency}. Modes: API + Web + Claude.`,
        });
      }
    } catch {
      // Schedule endpoint is optional — save preference locally regardless
    } finally {
      setAutoScanLoading(false);
    }
  };

  const openProspectSignals = async (prospectId: string, name: string, status?: string) => {
    setDetailProspectId(prospectId);
    setDetailName(name);
    setDetailStatus(status || '');
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/prospects/signals?prospect_id=${prospectId}`);
      const data = await res.json();
      setDetailSignals(data.signals || []);
    } catch {
      setDetailSignals([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleManualSignalSubmit = async () => {
    if (!manualSignalData.prospect_name || !manualSignalData.headline) {
      toast({ title: 'Prospect and headline are required', variant: 'destructive' });
      return;
    }
    // Find prospect by name
    const match = topProspects.find(p => p.name.toLowerCase() === manualSignalData.prospect_name.toLowerCase());
    if (!match) {
      toast({ title: 'Prospect not found — enter exact name from the list', variant: 'destructive' });
      return;
    }
    setManualSignalSubmitting(true);
    try {
      const res = await fetch('/api/prospects/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: match.id,
          signal_type: manualSignalData.signal_type,
          headline: manualSignalData.headline,
          source_url: manualSignalData.source_url,
          confidence: manualSignalData.confidence,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Signal added', description: `${manualSignalData.signal_type} for ${match.name}` });
        setManualSignalOpen(false);
        setManualSignalData({ prospect_name: '', signal_type: 'news_mention', headline: '', source_url: '', confidence: 'likely' });
        fetchDashboard();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to add signal', variant: 'destructive' });
    } finally {
      setManualSignalSubmitting(false);
    }
  };

  const formatMarketCap = (mc: number | null) => {
    if (!mc) return '';
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
    return `$${(mc / 1e3).toFixed(0)}K`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-red-700 bg-red-100';
    if (score >= 40) return 'text-orange-700 bg-orange-100';
    if (score > 0) return 'text-amber-700 bg-amber-100';
    return 'text-gray-400 bg-gray-100';
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Computed: Korea opportunity signals (non-exchange, non-news)
  const koreaOpportunities = (byType.korea_partnership || 0) + (byType.korea_community || 0) +
    (byType.korea_hiring || 0) + (byType.korea_event || 0) + (byType.korea_localization || 0) +
    (byType.social_presence || 0);

  // Computed: signals detected in last 7 days
  const recentCount = recentSignals.filter(s => {
    const diff = Date.now() - new Date(s.detected_at).getTime();
    return diff < 7 * 24 * 60 * 60 * 1000;
  }).length;

  // Computed: filtered recent signals
  const filteredSignals = signalTypeFilter === 'all'
    ? recentSignals
    : recentSignals.filter(s => s.signal_type === signalTypeFilter);

  // Computed: filtered top prospects
  const filteredProspects = topProspects.filter((p: any) => {
    // Always filter out major tokens — they aren't actionable BD prospects
    if (p.symbol && MAJOR_TOKENS.has(p.symbol.toUpperCase())) return false;
    if (prospectFilter === 'discovered') return p.source === 'signal_discovery';
    if (prospectFilter === 'promoted') return p.status === 'promoted';
    if (prospectFilter === 'intent') return p.has_intent_signals === true;
    return true;
  });
  const discoveredCount = topProspects.filter((p: any) => p.source === 'signal_discovery' && !(p.symbol && MAJOR_TOKENS.has(p.symbol.toUpperCase()))).length;
  const promotedCount = topProspects.filter((p: any) => p.status === 'promoted' && !(p.symbol && MAJOR_TOKENS.has(p.symbol.toUpperCase()))).length;
  const intentCount = topProspects.filter((p: any) => p.has_intent_signals && !(p.symbol && MAJOR_TOKENS.has(p.symbol.toUpperCase()))).length;

  // Get active signal types (ones that have data)
  const activeSignalTypes = ALL_SIGNAL_TYPES.filter(t => byType[t] && byType[t] > 0);

  if (loading) {
    return (
      <div className="space-y-4 pb-8">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4 pb-8">
        {/* Scan Result Banner + Stats */}
        {scanResult && (
          <Card className="border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: '#3e8692' }} />
                <span className="text-sm font-semibold text-gray-900">Scan Complete</span>
                <Badge variant="outline" className="text-[10px] font-medium">{scanResult.scan_duration_seconds}s</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                {scanResult.modes.map(m => (
                  <Badge key={m} variant="secondary" className="text-[10px]">
                    {m === 'api' ? 'API' : m === 'web' ? 'Web' : 'Claude'}
                  </Badge>
                ))}
              </div>
            </div>
            <CardContent className="pt-4 pb-4 px-4 space-y-4">
              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Timer className="w-3.5 h-3.5" style={{ color: '#3e8692' }} />
                    <span className="text-xs text-gray-500">Duration</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{scanResult.scan_duration_seconds}s</div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Radar className="w-3.5 h-3.5" style={{ color: '#3e8692' }} />
                    <span className="text-xs text-gray-500">Signals</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: '#3e8692' }}>{scanResult.signals_inserted}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{scanResult.prospects_with_signals} prospects matched</div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="w-3.5 h-3.5" style={{ color: '#3e8692' }} />
                    <span className="text-xs text-gray-500">Claude Cost</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {scanResult.claude ? `$${scanResult.claude.cost_usd.toFixed(4)}` : '$0.00'}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {scanResult.claude
                      ? `${scanResult.claude.tokens_used.toLocaleString()} tokens`
                      : 'No AI mode used'}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Cpu className="w-3.5 h-3.5" style={{ color: '#3e8692' }} />
                    <span className="text-xs text-gray-500">Sources</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {(scanResult.scanned.upbit_tokens > 0 ? 1 : 0) + (scanResult.scanned.bithumb_tokens > 0 ? 1 : 0) + (scanResult.scanned.tokenpost_articles > 0 ? 1 : 0) + (scanResult.scanned.blockmedia_articles > 0 ? 1 : 0) + (scanResult.web ? 1 : 0)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {scanResult.scanned.filtered_recent_articles} articles ({scanResult.recency_months === 1 ? '1 mo' : `${scanResult.recency_months} mo`})
                    {scanResult.scanned.total_rss_articles > scanResult.scanned.filtered_recent_articles && (
                      <span className="text-amber-500"> · {scanResult.scanned.total_rss_articles - scanResult.scanned.filtered_recent_articles} old filtered</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-1.5">
                {scanResult.modes?.includes('api') && (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5 bg-white">API</Badge>
                    <span>Checked {scanResult.scanned.prospects.toLocaleString()} prospects against {scanResult.scanned.upbit_tokens} Upbit + {scanResult.scanned.bithumb_tokens} Bithumb tokens, {scanResult.scanned.tokenpost_articles + scanResult.scanned.blockmedia_articles} recent news articles</span>
                  </div>
                )}
                {scanResult.web && (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5 bg-white">Web</Badge>
                    <span>
                      {scanResult.web.search_results} search results, {scanResult.web.articles_scraped} full articles scraped
                      {scanResult.web.projects_discovered > 0 && `, ${scanResult.web.projects_discovered} new projects found`}
                    </span>
                  </div>
                )}
                {scanResult.claude && (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5 bg-white">Claude</Badge>
                    <span>
                      Analyzed {scanResult.claude.articles_analyzed} articles → {scanResult.claude.signals_found} signals
                      <span className="ml-1.5 font-mono text-[10px] text-gray-400">
                        ${scanResult.claude.cost_usd.toFixed(4)} · {scanResult.claude.tokens_used.toLocaleString()} tokens
                      </span>
                    </span>
                  </div>
                )}
                {scanResult.discovery && scanResult.discovery.new_prospects > 0 && (
                  <div className="flex items-start gap-2 text-xs font-medium" style={{ color: '#3e8692' }}>
                    <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      {scanResult.discovery.new_prospects} new prospects discovered via signals
                      {scanResult.discovery.errors > 0 && <span className="text-amber-600 font-normal"> ({scanResult.discovery.errors} lookup errors)</span>}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Improvement #3: Better Summary Cards ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Zap className="w-4 h-4" style={{ color: '#3e8692' }} />
                Korea Opportunities
              </div>
              <div className="text-2xl font-bold" style={{ color: '#3e8692' }}>{koreaOpportunities}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {[
                  byType.korea_partnership && `${byType.korea_partnership} partnerships`,
                  byType.korea_community && `${byType.korea_community} community`,
                  byType.korea_hiring && `${byType.korea_hiring} hiring`,
                ].filter(Boolean).join(', ') || 'partnerships, community, events'}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Zap className="w-4 h-4" style={{ color: '#3e8692' }} />
                Partnerships
              </div>
              <div className="text-2xl font-bold text-gray-900">{(byType.korea_partnership || 0) + (byType.korea_community || 0)}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                Partnerships + Community signals
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Bot className="w-4 h-4" style={{ color: '#3e8692' }} />
                AI Research
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {(bySource.claude_research || 0) + (bySource.tokenpost_claude || 0) + (bySource.blockmedia_claude || 0)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Claude-discovered signals
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Clock className="w-4 h-4" style={{ color: '#3e8692' }} />
                New This Week
              </div>
              <div className="text-2xl font-bold text-gray-900">{recentCount}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {totalSignals} total signals
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Source Breakdown */}
        {Object.keys(bySource).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Sources</span>
            {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
              <Badge key={source} variant="outline" className="text-[10px] font-medium bg-white">
                {SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1)}: {count}
              </Badge>
            ))}
          </div>
        )}

        {/* ─── Scan Controls Bar ─── */}
        <div className="flex items-center justify-between flex-wrap gap-2 bg-white rounded-lg border border-gray-200 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <Clock className="w-3 h-3" />
              {lastScanTime
                ? <>Last scanned {timeAgo(lastScanTime)}</>
                : recentSignals.length > 0
                  ? <>Latest signal {timeAgo(recentSignals[0].detected_at)}</>
                  : <>No scans yet</>
              }
            </div>
            {/* Session cost tracker */}
            {totalScans > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] text-gray-400 flex items-center gap-1 cursor-help">
                    <DollarSign className="w-3 h-3" />
                    Session: ${totalClaudeCost.toFixed(4)}
                    {totalClaudeTokens > 0 && <span className="text-gray-300">·</span>}
                    {totalClaudeTokens > 0 && `${(totalClaudeTokens / 1000).toFixed(1)}k tok`}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="text-xs space-y-0.5">
                    <div>{totalScans} scan{totalScans !== 1 ? 's' : ''} this session</div>
                    <div>Total Claude cost: ${totalClaudeCost.toFixed(4)}</div>
                    {totalClaudeTokens > 0 && <div>Total tokens: {totalClaudeTokens.toLocaleString()}</div>}
                    {lastScanTime && <div>Last scan: {timeAgo(lastScanTime)}</div>}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Manual signal entry */}
            <button
              onClick={() => setManualSignalOpen(true)}
              className="inline-flex items-center gap-1 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <Plus className="w-3 h-3 text-gray-400" />
              Signal
            </button>
            {/* Auto-scan schedule dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={autoScanLoading}
                  className="inline-flex items-center gap-1 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <CalendarClock className="w-3 h-3 text-gray-400" />
                  {AUTO_SCAN_OPTIONS.find(o => o.value === autoScanFrequency)?.label || 'Off'}
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                  Auto-Scan Schedule
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={autoScanFrequency} onValueChange={handleAutoScanChange}>
                  {AUTO_SCAN_OPTIONS.map(opt => (
                    <DropdownMenuRadioItem key={opt.value} value={opt.value} className="text-xs cursor-pointer">
                      {opt.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Recency filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-brand">
                  <Clock className="w-3 h-3 text-gray-400" />
                  {recencyMonths === 1 ? '1 mo' : `${recencyMonths} mo`}
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                  Recency Filter
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={String(recencyMonths)} onValueChange={(v) => setRecencyMonths(parseInt(v))}>
                  <DropdownMenuRadioItem value="1" className="text-xs cursor-pointer">Last 1 month</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="2" className="text-xs cursor-pointer">Last 2 months</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="3" className="text-xs cursor-pointer">Last 3 months</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="6" className="text-xs cursor-pointer">Last 6 months</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="12" className="text-xs cursor-pointer">Last 12 months</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Scan button with mode dropdown */}
            <div className="relative">
              <div className="flex items-center">
                <Button
                  onClick={() => scanMenuOpen ? handleScan() : setScanMenuOpen(true)}
                  disabled={scanning}
                  size="sm"
                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                  className="hover:opacity-90 h-8 text-xs rounded-r-none px-4"
                >
                  {scanning ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Scanning{modeClaude ? ' (AI)' : ''}...</>
                  ) : scanMenuOpen ? (
                    <><Radar className="w-3.5 h-3.5 mr-1.5" /> Run Scan</>
                  ) : (
                    <><Radar className="w-3.5 h-3.5 mr-1.5" /> Scan for Signals</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-1.5 rounded-l-none border-l-0"
                  style={scanMenuOpen ? { backgroundColor: '#3e8692', color: 'white', borderColor: '#3e8692' } : {}}
                  onClick={() => setScanMenuOpen(!scanMenuOpen)}
                  disabled={scanning}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </Button>
              </div>
              {scanMenuOpen && !scanning && (
                <div className="absolute right-0 top-10 z-[80] w-80 bg-white rounded-lg border border-gray-200 shadow-lg p-3 space-y-3">
                  {/* Cadence selector */}
                  <div>
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Scan Cadence</div>
                    <div className="flex gap-1">
                      {[
                        { value: 'daily', label: 'Daily', desc: '~5 min', scanners: '6 scanners' },
                        { value: 'weekly', label: 'Weekly', desc: '~20 min', scanners: '12 scanners' },
                        { value: 'monthly', label: 'Monthly', desc: '~45 min', scanners: 'All scanners' },
                      ].map(opt => (
                        <button key={opt.value}
                          onClick={() => setScanCadence(opt.value as any)}
                          className={`flex-1 text-center px-2 py-1.5 rounded-md text-xs border transition-colors ${
                            scanCadence === opt.value
                              ? 'border-brand bg-brand/10 text-brand font-medium'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-[9px] text-gray-400 mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Legacy mode checkboxes (collapsed) */}
                  <details className="group">
                    <summary className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none">
                      Advanced Modes <ChevronDown className="w-3 h-3 inline-block ml-0.5 group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="mt-1.5 space-y-1">
                      <label className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <Checkbox checked={modeApi} onCheckedChange={(v) => setModeApi(v === true)}
                          className="data-[state=checked]:bg-brand data-[state=checked]:border-brand" />
                        <Building2 className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-700">API (exchanges + RSS)</span>
                      </label>
                      <label className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <Checkbox checked={modeWeb} onCheckedChange={(v) => setModeWeb(v === true)}
                          className="data-[state=checked]:bg-brand data-[state=checked]:border-brand" />
                        <Search className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-700">Web Scraping</span>
                      </label>
                      <label className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <Checkbox checked={modeClaude} onCheckedChange={(v) => setModeClaude(v === true)}
                          className="data-[state=checked]:bg-brand data-[state=checked]:border-brand" />
                        <Bot className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-700">Claude AI (~$0.02/scan)</span>
                      </label>
                    </div>
                  </details>

                  <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">
                      {scanCadence ? `${scanCadence} cadence` : [modeApi && 'API', modeWeb && 'Web', modeClaude && 'Claude'].filter(Boolean).join(' + ') || 'None'}
                      {' · '}{recencyMonths === 1 ? '1 month' : `${recencyMonths} months`}
                    </span>
                    <Button size="sm" className="h-7 text-xs" style={{ backgroundColor: '#3e8692', color: 'white' }}
                      onClick={handleScan}>
                      <Radar className="w-3 h-3 mr-1" /> Run
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Two Column Layout: Top Prospects + Recent Signals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Korea-Relevant Prospects */}
          <Card className="border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" style={{ color: '#3e8692' }} />
                  <span className="text-sm font-semibold text-gray-900">Top Prospects</span>
                  <Badge variant="secondary" className="text-xs font-medium">{filteredProspects.length}</Badge>
                </div>
                {/* Prospect filter tabs */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setProspectFilter('all')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      prospectFilter === 'all' ? 'bg-brand/10 text-brand' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >All</button>
                  <button
                    onClick={() => setProspectFilter('discovered')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      prospectFilter === 'discovered' ? 'bg-brand/10 text-brand' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >Discovered <span className="ml-0.5 text-[10px] opacity-70">{discoveredCount}</span></button>
                  <button
                    onClick={() => setProspectFilter('promoted')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      prospectFilter === 'promoted' ? 'bg-brand/10 text-brand' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >In Pipeline <span className="ml-0.5 text-[10px] opacity-70">{promotedCount}</span></button>
                  <button
                    onClick={() => setProspectFilter('intent')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      prospectFilter === 'intent' ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >Pre-Korea <span className="ml-0.5 text-[10px] opacity-70">{intentCount}</span></button>
                </div>
              </div>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-gray-100">
                {filteredProspects.length === 0 ? (
                  <div className="p-8 text-center">
                    <Radar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-500">
                      {prospectFilter === 'discovered' ? 'No discovered prospects yet' :
                       prospectFilter === 'promoted' ? 'No prospects in pipeline yet' :
                       prospectFilter === 'intent' ? 'No pre-Korea intent signals yet' :
                       'No signals found yet'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {prospectFilter !== 'all'
                        ? <button onClick={() => setProspectFilter('all')} className="text-brand hover:underline">Show all prospects</button>
                        : 'Click "Scan Now" to check Korean exchanges and news'}
                    </p>
                  </div>
                ) : (
                  filteredProspects.map((p, i) => (
                    <div
                      key={p.id}
                      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left group"
                    >
                      <span className="text-xs font-mono text-gray-400 w-5">{i + 1}</span>
                      {p.logo_url ? (
                        <img src={p.logo_url} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 font-bold">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <button
                        onClick={() => openProspectSignals(p.id, p.name, p.status)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate">{p.name}</span>
                          {p.symbol && <span className="text-xs text-gray-400">{p.symbol}</span>}
                          {p.source === 'signal_discovery' && (
                            <Badge variant="outline" className="text-[9px] font-medium bg-teal-50 text-teal-700 border-teal-200">
                              Discovered
                            </Badge>
                          )}
                          {p.status === 'promoted' && (
                            <Badge variant="outline" className="text-[9px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
                              In Pipeline
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.category && <span className="text-[10px] text-gray-400">{p.category}</span>}
                          {p.market_cap && <span className="text-[10px] text-gray-400">{formatMarketCap(p.market_cap)}</span>}
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-gray-400">{p.korea_signal_count} signal{p.korea_signal_count !== 1 ? 's' : ''}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getScoreColor(p.korea_relevancy_score)}`}>
                          {p.korea_relevancy_score}
                        </span>
                        {/* ─── Improvement #1: Add to Pipeline button ─── */}
                        {p.status !== 'promoted' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); setConfirmPromote({ id: p.id, name: p.name, score: p.korea_relevancy_score }); }}
                                disabled={promoting === p.id}
                              >
                                {promoting === p.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                                  : <Plus className="w-3.5 h-3.5 text-gray-400 hover:text-brand" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <span className="text-xs">Add to Pipeline</span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>

          {/* Recent Signals Feed */}
          <Card className="border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4" style={{ color: '#3e8692' }} />
                <span className="text-sm font-semibold text-gray-900">Recent Signals</span>
              </div>
              <div className="flex items-center gap-2">
                {/* ─── Improvement #2: Signal Type Filter ─── */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-1 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-brand">
                      <Filter className="w-3 h-3 text-gray-400" />
                      {signalTypeFilter === 'all'
                        ? 'All types'
                        : getSignalConfig(signalTypeFilter).label}
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                      Filter by type
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup value={signalTypeFilter} onValueChange={setSignalTypeFilter}>
                      <DropdownMenuRadioItem value="all" className="text-xs cursor-pointer">
                        All types
                        <span className="ml-auto text-[10px] text-gray-400">{recentSignals.length}</span>
                      </DropdownMenuRadioItem>
                      <DropdownMenuSeparator />
                      {/* Known + custom signal types that appear in data */}
                      {Array.from(new Set([...ALL_SIGNAL_TYPES, ...recentSignals.map(s => s.signal_type)])).map(type => {
                        const config = getSignalConfig(type);
                        const count = recentSignals.filter(s => s.signal_type === type).length;
                        if (count === 0) return null;
                        const Icon = config.icon;
                        return (
                          <DropdownMenuRadioItem key={type} value={type} className="text-xs cursor-pointer">
                            <span className="flex items-center gap-1.5">
                              <Icon className={`w-3 h-3 ${config.color}`} />
                              {config.label}
                            </span>
                            <span className="ml-auto text-[10px] text-gray-400">{count}</span>
                          </DropdownMenuRadioItem>
                        );
                      })}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Badge variant="secondary" className="text-xs font-medium">{filteredSignals.length}</Badge>
              </div>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-gray-100">
                {filteredSignals.length === 0 ? (
                  <div className="p-8 text-center">
                    <Radar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-500">
                      {signalTypeFilter !== 'all' ? `No ${getSignalConfig(signalTypeFilter).label} signals` : 'No signals detected yet'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {signalTypeFilter !== 'all'
                        ? <button onClick={() => setSignalTypeFilter('all')} className="text-brand hover:underline">Show all signal types</button>
                        : 'Run a scan to detect Korean market signals'}
                    </p>
                  </div>
                ) : (
                  filteredSignals.map(signal => {
                    const config = getSignalConfig(signal.signal_type);
                    const Icon = config.icon;
                    return (
                      <div key={signal.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${config.bg}`}>
                            <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-medium text-sm truncate">
                                {signal.prospects?.name || signal.project_name}
                              </span>
                              <TierBadge tier={config.tier} />
                              <Badge variant="outline" className="text-[9px] shrink-0 bg-white">
                                {SOURCE_LABELS[signal.source_name] || signal.source_name}
                              </Badge>
                              <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(signal.detected_at)}</span>
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2">{signal.headline}</p>
                            {signal.source_url && (
                              <a
                                href={signal.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] mt-1 text-brand hover:underline"
                                onClick={e => e.stopPropagation()}
                              >
                                View source <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                signal.relevancy_weight >= 40 ? 'bg-red-100 text-red-700' :
                                signal.relevancy_weight >= 25 ? 'bg-orange-100 text-orange-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                +{signal.relevancy_weight}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <span className="text-xs">Relevancy weight: {signal.relevancy_weight}/100</span>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Signal Detail Dialog */}
        <Dialog open={!!detailProspectId} onOpenChange={() => setDetailProspectId(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Radar className="w-5 h-5" style={{ color: '#3e8692' }} />
                Signals for {detailName}
              </DialogTitle>
              <DialogDescription>
                Evidence of Korean market relevancy for this project.
              </DialogDescription>
            </DialogHeader>

            {/* ─── Improvement #1: Add to Pipeline from detail dialog ─── */}
            {detailProspectId && detailStatus !== 'promoted' && (
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-gray-50">
                <span className="text-xs text-gray-500">This prospect is not in your pipeline yet.</span>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                  onClick={() => { setConfirmPromote({ id: detailProspectId, name: detailName, score: topProspects.find(p => p.id === detailProspectId)?.korea_relevancy_score || 0 }); }}
                  disabled={promoting === detailProspectId}
                >
                  {promoting === detailProspectId
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Adding...</>
                    : <><Plus className="w-3 h-3 mr-1" /> Add to Pipeline</>}
                </Button>
              </div>
            )}
            {detailStatus === 'promoted' && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50">
                <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs text-emerald-700 font-medium">This prospect is in your sales pipeline.</span>
              </div>
            )}

            {detailLoading ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : detailSignals.length === 0 ? (
              <div className="py-8 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">No signals found for this prospect</p>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                {detailSignals.map(signal => {
                  const config = getSignalConfig(signal.signal_type);
                  const Icon = config.icon;
                  return (
                    <div key={signal.id} className={`rounded-lg border p-3 ${config.bg}`}>
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/60">
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
                            <Badge variant="outline" className="text-[9px] bg-white/60">
                              {SOURCE_LABELS[signal.source_name] || signal.source_name}
                            </Badge>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/60 ${config.color}`}>
                              +{signal.relevancy_weight} pts
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900">{signal.headline}</p>
                          {signal.snippet && (
                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{signal.snippet}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[10px] text-gray-400">
                              {new Date(signal.detected_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </span>
                            {signal.source_url && (
                              <a
                                href={signal.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-brand hover:underline"
                              >
                                View source <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* ─── Confirmation Dialog for Promoting to Pipeline ─── */}
      <AlertDialog open={!!confirmPromote} onOpenChange={(open) => { if (!open) setConfirmPromote(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add to Sales Pipeline?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Are you sure you want to promote <span className="font-semibold text-gray-900">{confirmPromote?.name}</span> to your sales pipeline?
                </p>
                {confirmPromote?.score != null && confirmPromote.score > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Korea Relevancy Score:</span>
                    <Badge variant="outline" className="font-mono">{confirmPromote.score}</Badge>
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  This will create a new opportunity in your CRM pipeline with the stage set to &quot;Cold DM&quot;.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!promoting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              disabled={!!promoting}
              onClick={async () => {
                if (!confirmPromote) return;
                const { id, name } = confirmPromote;
                setConfirmPromote(null);
                await handlePromote(id, name);
                // If promoted from detail dialog, update its status
                if (detailProspectId === id) setDetailStatus('promoted');
              }}
            >
              {promoting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Adding...</> : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Manual Signal Entry Dialog */}
      <Dialog open={manualSignalOpen} onOpenChange={setManualSignalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add Manual Signal</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Add a signal that was found outside of automated scanning.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Prospect Name</label>
              <input
                type="text"
                value={manualSignalData.prospect_name}
                onChange={e => setManualSignalData(d => ({ ...d, prospect_name: e.target.value }))}
                placeholder="Enter exact prospect name..."
                list="prospect-names-list"
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <datalist id="prospect-names-list">
                {topProspects.map(p => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Signal Type</label>
              <select
                value={manualSignalData.signal_type}
                onChange={e => setManualSignalData(d => ({ ...d, signal_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <optgroup label="Tier 1 — Act Immediately">
                  <option value="tge_within_60d">TGE / Token Launch (+25)</option>
                  <option value="mainnet_launch">Mainnet Launch (+20)</option>
                  <option value="funding_round_5m">Funding Round $5M+ (+20)</option>
                  <option value="airdrop_announcement">Airdrop Announced (+20)</option>
                  <option value="korea_expansion_announce">Korea Expansion (+15)</option>
                  <option value="dao_asia_governance">DAO Asia Governance (+20)</option>
                  <option value="korea_job_posting">Korea Job Posting (+15)</option>
                  <option value="korea_collab">Korea Collaboration (+15)</option>
                </optgroup>
                <optgroup label="Tier 2 — Act This Week">
                  <option value="korea_partnership">Korea Partnership (+15)</option>
                  <option value="leadership_change">Leadership Change (+15)</option>
                  <option value="korea_event">Korea Event (+10)</option>
                  <option value="vc_portfolio_cascade">VC Portfolio Cascade (+15)</option>
                </optgroup>
                <optgroup label="Tier 3 — Monitor">
                  <option value="news_mention">News Mention (+10)</option>
                  <option value="korea_community_mention">KR Community Mention (+5)</option>
                  <option value="korean_vc_cap_table">Korean VC in Cap Table (+5)</option>
                </optgroup>
                <optgroup label="Tier 4 — Enrichment">
                  <option value="warm_intro_available">Warm Intro Available (+10)</option>
                  <option value="decision_maker_identified">Decision Maker Found (+5)</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Headline</label>
              <input
                type="text"
                value={manualSignalData.headline}
                onChange={e => setManualSignalData(d => ({ ...d, headline: e.target.value }))}
                placeholder="Brief description of the signal..."
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Source URL (optional)</label>
              <input
                type="url"
                value={manualSignalData.source_url}
                onChange={e => setManualSignalData(d => ({ ...d, source_url: e.target.value }))}
                placeholder="https://..."
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Confidence</label>
              <div className="flex gap-2">
                {(['confirmed', 'likely', 'rumor'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setManualSignalData(d => ({ ...d, confidence: level }))}
                    className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${
                      manualSignalData.confidence === level
                        ? 'border-brand bg-brand/10 text-brand font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setManualSignalOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              onClick={handleManualSignalSubmit}
              disabled={manualSignalSubmitting || !manualSignalData.prospect_name || !manualSignalData.headline}
            >
              {manualSignalSubmitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Adding...</> : 'Add Signal'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
