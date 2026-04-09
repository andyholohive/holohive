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

const SIGNAL_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  exchange_listing: { icon: Building2, label: 'Exchange Listing', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  korea_partnership: { icon: Zap, label: 'Korea Partnership', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  korea_community: { icon: Globe, label: 'Korean Community', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  korea_hiring: { icon: Search, label: 'Korea Hiring', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
  korea_event: { icon: TrendingUp, label: 'Korea Event', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  korea_localization: { icon: Globe, label: 'Korea Localization', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200' },
  social_presence: { icon: Activity, label: 'Social Presence', color: 'text-pink-700', bg: 'bg-pink-50 border-pink-200' },
  news_mention: { icon: Newspaper, label: 'News Mention', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
};

const ALL_SIGNAL_TYPES = Object.keys(SIGNAL_TYPE_CONFIG);

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
  system: 'System',
};

const AUTO_SCAN_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
];

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
    if (modes.length === 0) {
      toast({ title: 'Select at least one scan mode', variant: 'destructive' });
      return;
    }

    setScanning(true);
    setScanResult(null);
    setScanMenuOpen(false);
    try {
      const res = await fetch('/api/prospects/signals/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modes, recency_months: recencyMonths }),
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
            : `Signals will be scanned ${frequency}. Modes: API${modeClaude ? ' + Claude' : ''}.`,
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
                <Building2 className="w-4 h-4" style={{ color: '#3e8692' }} />
                Exchange Presence
              </div>
              <div className="text-2xl font-bold text-gray-900">{byType.exchange_listing || 0}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {[bySource.upbit && `${bySource.upbit} Upbit`, bySource.bithumb && `${bySource.bithumb} Bithumb`].filter(Boolean).join(', ') || 'Upbit + Bithumb'}
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

        {/* Two Column Layout: Top Prospects + Recent Signals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Korea-Relevant Prospects */}
          <Card className="border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: '#3e8692' }} />
                <span className="text-sm font-semibold text-gray-900">Top Korea-Relevant Prospects</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-medium">{topProspects.length}</Badge>
                {/* Scan Button */}
                <div className="relative">
                  <div className="flex items-center">
                    <Button
                      onClick={() => scanMenuOpen ? handleScan() : setScanMenuOpen(true)}
                      disabled={scanning}
                      size="sm"
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                      className="hover:opacity-90 h-7 text-xs rounded-r-none"
                    >
                      {scanning ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Scanning{modeClaude ? ' (AI)' : ''}...</>
                      ) : scanMenuOpen ? (
                        <><Radar className="w-3.5 h-3.5 mr-1" /> Run Scan</>
                      ) : (
                        <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Scan Now</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-1.5 rounded-l-none border-l-0"
                      style={scanMenuOpen ? { backgroundColor: '#3e8692', color: 'white', borderColor: '#3e8692' } : {}}
                      onClick={() => setScanMenuOpen(!scanMenuOpen)}
                      disabled={scanning}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </Button>
                  </div>
                  {scanMenuOpen && !scanning && (
                    <div className="absolute right-0 top-9 z-[80] w-72 bg-white rounded-lg border border-gray-200 shadow-md p-3 space-y-2">
                      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Scan Modes</div>

                      <label className="flex items-start gap-2.5 p-2 rounded-md hover:bg-gray-50 cursor-pointer">
                        <Checkbox checked={modeApi} onCheckedChange={(v) => setModeApi(v === true)}
                          className="mt-0.5 data-[state=checked]:bg-[#3e8692] data-[state=checked]:border-[#3e8692]" />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-sm font-medium text-gray-900">API Scan</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">Upbit/Bithumb tokens + RSS headlines. Fast, regex-based.</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 p-2 rounded-md hover:bg-gray-50 cursor-pointer">
                        <Checkbox checked={modeWeb} onCheckedChange={(v) => setModeWeb(v === true)}
                          className="mt-0.5 data-[state=checked]:bg-[#3e8692] data-[state=checked]:border-[#3e8692]" />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <Search className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-sm font-medium text-gray-900">Web Scraping</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">DuckDuckGo search + full article scraping. Deeper coverage.</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 p-2 rounded-md hover:bg-gray-50 cursor-pointer">
                        <Checkbox checked={modeClaude} onCheckedChange={(v) => setModeClaude(v === true)}
                          className="mt-0.5 data-[state=checked]:bg-[#3e8692] data-[state=checked]:border-[#3e8692]" />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <Bot className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-sm font-medium text-gray-900">Claude AI Analysis</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">AI reads articles + researches Korea-expansion signals (partnerships, hiring, events). ~$0.02/scan.</p>
                        </div>
                      </label>

                      {/* Recency Filter */}
                      <div className="border-t border-gray-100 pt-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-[11px] font-medium text-gray-500">Recency Filter</span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="inline-flex items-center gap-1 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-[#3e8692]">
                                <Clock className="w-3 h-3 text-gray-400" />
                                {recencyMonths === 1 ? 'Last 1 month' : `Last ${recencyMonths} months`}
                                <ChevronDown className="w-3 h-3 text-gray-400" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                                Articles from
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
                        </div>
                        <p className="text-[10px] text-gray-400 mb-2">Only include news articles published within this period.</p>
                      </div>

                      {/* ─── Improvement #4: Auto-scan Schedule ─── */}
                      <div className="border-t border-gray-100 pt-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-[11px] font-medium text-gray-500">Auto-Scan</span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                disabled={autoScanLoading}
                                className="inline-flex items-center gap-1 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-[#3e8692]"
                              >
                                <CalendarClock className="w-3 h-3 text-gray-400" />
                                {AUTO_SCAN_OPTIONS.find(o => o.value === autoScanFrequency)?.label || 'Off'}
                                <ChevronDown className="w-3 h-3 text-gray-400" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                                Schedule
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
                        </div>
                        <p className="text-[10px] text-gray-400 mb-2">
                          {autoScanFrequency === 'off'
                            ? 'Scans run manually only.'
                            : `Runs API + Claude scan ${autoScanFrequency} automatically.`}
                        </p>
                      </div>

                      <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">
                          {[modeApi && 'API', modeWeb && 'Web', modeClaude && 'Claude'].filter(Boolean).join(' + ') || 'None selected'}
                          {' · '}{recencyMonths === 1 ? '1 month' : `${recencyMonths} months`}
                        </span>
                        <Button size="sm" className="h-7 text-xs" style={{ backgroundColor: '#3e8692', color: 'white' }}
                          onClick={handleScan} disabled={!modeApi && !modeWeb && !modeClaude}>
                          <Radar className="w-3 h-3 mr-1" /> Run
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Session cost tracker */}
              {totalScans > 0 && (
                <div className="flex items-center gap-2 ml-1">
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
                </div>
              )}
            </div>
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-gray-100">
                {topProspects.length === 0 ? (
                  <div className="p-8 text-center">
                    <Radar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-500">No signals found yet</p>
                    <p className="text-xs text-gray-400 mt-1">Click &quot;Scan Now&quot; to check Korean exchanges and news</p>
                  </div>
                ) : (
                  topProspects.map((p, i) => (
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
                                  : <Plus className="w-3.5 h-3.5 text-gray-400 hover:text-[#3e8692]" />}
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
                    <button className="inline-flex items-center gap-1 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-[#3e8692]">
                      <Filter className="w-3 h-3 text-gray-400" />
                      {signalTypeFilter === 'all'
                        ? 'All types'
                        : SIGNAL_TYPE_CONFIG[signalTypeFilter]?.label || signalTypeFilter}
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
                      {ALL_SIGNAL_TYPES.map(type => {
                        const config = SIGNAL_TYPE_CONFIG[type];
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
                      {signalTypeFilter !== 'all' ? `No ${SIGNAL_TYPE_CONFIG[signalTypeFilter]?.label || signalTypeFilter} signals` : 'No signals detected yet'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {signalTypeFilter !== 'all'
                        ? <button onClick={() => setSignalTypeFilter('all')} className="text-[#3e8692] hover:underline">Show all signal types</button>
                        : 'Run a scan to detect Korean market signals'}
                    </p>
                  </div>
                ) : (
                  filteredSignals.map(signal => {
                    const config = SIGNAL_TYPE_CONFIG[signal.signal_type] || SIGNAL_TYPE_CONFIG.news_mention;
                    const Icon = config.icon;
                    return (
                      <div key={signal.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${config.bg}`}>
                            <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-medium text-sm truncate">
                                {signal.prospects?.name || signal.project_name}
                              </span>
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
                                className="inline-flex items-center gap-1 text-[10px] mt-1 text-[#3e8692] hover:underline"
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
                  const config = SIGNAL_TYPE_CONFIG[signal.signal_type] || SIGNAL_TYPE_CONFIG.news_mention;
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
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-[#3e8692] hover:underline"
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
    </TooltipProvider>
  );
}
