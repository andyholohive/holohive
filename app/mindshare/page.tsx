'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  BarChart3, Plus, Trash2, Radio, AlertTriangle, Search, TrendingUp, TrendingDown,
  Minus, Edit, RefreshCw, Upload, ExternalLink, Crown,
} from 'lucide-react';
import { Treemap, ResponsiveContainer } from 'recharts';

// ─── Types ──────────────────────────────────────────────────────────

type Range = '24h' | '7d' | '30d';

interface LeaderboardItem {
  project_id: string;
  name: string;
  client_id: string | null;
  category: string | null;
  is_pre_tge: boolean;
  twitter_handle: string | null;
  website_url: string | null;
  mention_count: number;
  channel_reach: number;
  mindshare_pct: number;
  delta_pct: number;
  mention_delta_pct: number;
  spark: number[];
}

interface MindshareProject {
  id: string;
  name: string;
  client_id: string | null;
  tracked_keywords: string[];
  category: string | null;
  is_pre_tge: boolean;
  twitter_handle: string | null;
  website_url: string | null;
  description: string | null;
  is_active: boolean;
  client?: { id: string; name: string } | null;
}

interface MonitoredChannel {
  id: string;
  channel_name: string;
  channel_username: string | null;
  channel_tg_id: string | null;
  language: string;
  is_active: boolean;
}

type SortKey = 'mindshare_pct' | 'mention_count' | 'name' | 'delta_pct' | 'channel_reach';

// ─── Sparkline ──────────────────────────────────────────────────────
// Tiny inline SVG so we don't pull a chart lib for one feature. 14
// daily values, scaled to fit a 80×24 viewport.
function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length === 0) return <span className="text-gray-300 text-xs">—</span>;
  const max = Math.max(...values, 1);
  const W = 80, H = 24;
  const stepX = W / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(2)},${(H - (v / max) * H).toFixed(2)}`)
    .join(' ');
  const lastV = values[values.length - 1] || 0;
  const firstV = values.find(v => v > 0) || 0;
  const trendUp = lastV > firstV;
  const stroke = trendUp ? '#16a34a' : (lastV < firstV ? '#dc2626' : '#9ca3af');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="inline-block">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Treemap content renderer ───────────────────────────────────────
// Each cell shows project name (responsive size), mindshare %, and a
// crown badge for top-3. Background color encodes Δ vs prior period:
// green (gain) → red (loss), saturation scaled by magnitude. Recharts
// passes layout coords (x, y, width, height) plus the node's data.

// Recharts injects these props at render time; declare them all
// optional so the placeholder JSX (<TreemapCell />) type-checks.
interface TreemapPayload {
  payload?: any;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  value?: number;
  index?: number;
  rank?: number;
}

function deltaColor(delta: number): { bg: string; border: string; text: string } {
  // Anchor saturation to ±5 percentage points; clamp so extreme outliers
  // don't blow out the palette.
  const clamped = Math.max(-5, Math.min(5, delta));
  const intensity = Math.abs(clamped) / 5; // 0..1
  if (delta > 0.1) {
    // emerald scale
    const lightness = 35 - intensity * 10; // darker green for stronger gain
    return { bg: `hsl(152, 60%, ${lightness}%)`, border: `hsl(152, 60%, ${lightness - 8}%)`, text: '#ecfdf5' };
  }
  if (delta < -0.1) {
    const lightness = 38 - intensity * 10;
    return { bg: `hsl(0, 60%, ${lightness}%)`, border: `hsl(0, 60%, ${lightness - 8}%)`, text: '#fef2f2' };
  }
  return { bg: 'hsl(220, 10%, 28%)', border: 'hsl(220, 10%, 22%)', text: '#e5e7eb' };
}

function TreemapCell(props: TreemapPayload) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || width < 4 || height < 4) return null;
  const { name, mindshare_pct, delta_pct, spark, rank } = payload;
  const colors = deltaColor(delta_pct ?? 0);

  // Responsive text sizing — readable on small cells, prominent on large.
  const showFullLabel = width > 90 && height > 60;
  const showSpark = width > 110 && height > 80;
  const showCrown = rank !== undefined && rank <= 3;
  // Cap label font size so big cells don't get absurd headers.
  const fontSize = Math.min(28, Math.max(11, Math.min(width / 8, height / 4)));
  const pctFontSize = Math.max(9, fontSize * 0.65);

  // Build the sparkline points relative to this cell. Anchored to the
  // bottom 35% of the cell so the title stays readable up top.
  let sparkPoints = '';
  if (showSpark && Array.isArray(spark) && spark.length > 1) {
    const max = Math.max(...spark, 1);
    const padX = 8;
    const padTop = height * 0.55;
    const sparkH = height - padTop - 8;
    const sparkW = width - padX * 2;
    const stepX = sparkW / (spark.length - 1);
    sparkPoints = spark
      .map((v: number, i: number) => `${(x + padX + i * stepX).toFixed(2)},${(y + padTop + sparkH - (v / max) * sparkH).toFixed(2)}`)
      .join(' ');
  }

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={1}
      />
      {showCrown && (
        <g transform={`translate(${x + width - 22}, ${y + 6})`}>
          <text fontSize={14} fill="#fbbf24">👑</text>
        </g>
      )}
      {showFullLabel ? (
        <>
          <text
            x={x + 10}
            y={y + 8 + fontSize * 0.85}
            fill={colors.text}
            fontSize={fontSize}
            fontWeight={700}
            style={{ pointerEvents: 'none' }}
          >
            {name}
          </text>
          <text
            x={x + 10}
            y={y + 8 + fontSize * 0.85 + pctFontSize + 4}
            fill={colors.text}
            fontSize={pctFontSize}
            fontWeight={500}
            opacity={0.9}
            style={{ pointerEvents: 'none' }}
          >
            {(mindshare_pct ?? 0).toFixed(2)}%
          </text>
        </>
      ) : (
        // Tiny cells: show just the project name centered, smaller
        <text
          x={x + width / 2}
          y={y + height / 2}
          fill={colors.text}
          fontSize={Math.max(9, Math.min(11, width / 7))}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: 'none' }}
        >
          {name}
        </text>
      )}
      {sparkPoints && (
        <polyline
          points={sparkPoints}
          fill="none"
          stroke={colors.text}
          strokeWidth={1}
          opacity={0.7}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function MindsharePage() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  const [tab, setTab] = useState<'leaderboard' | 'projects' | 'channels'>('leaderboard');

  // ─── Leaderboard state ──────────────────────────────────────────
  const [range, setRange] = useState<Range>('7d');
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [totalMentions, setTotalMentions] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [preTgeOnly, setPreTgeOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('mindshare_pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Treemap tier toggle — Top 20 vs Top 21-50, mirroring Kaito's split
  const [treemapTier, setTreemapTier] = useState<'top20' | 'top21_50'>('top20');

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch(`/api/mindshare/leaderboard?range=${range}`);
      const json = await res.json();
      setLeaderboard(json.items || []);
      setTotalMentions(json.total_mentions || 0);
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [range]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  // Derive filtered + sorted view
  const filteredSorted = useMemo(() => {
    let arr = leaderboard;
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(i => i.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      arr = arr.filter(i => (i.category || 'Uncategorized') === categoryFilter);
    }
    if (preTgeOnly) {
      arr = arr.filter(i => i.is_pre_tge);
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      const av: any = (a as any)[sortKey];
      const bv: any = (b as any)[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av || '').localeCompare(String(bv || '')) * dir;
    });
  }, [leaderboard, search, categoryFilter, preTgeOnly, sortKey, sortDir]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    leaderboard.forEach(i => set.add(i.category || 'Uncategorized'));
    return ['all', ...Array.from(set).sort()];
  }, [leaderboard]);

  // Treemap source — same filtering pipeline as the table, but always
  // sorted by mention count desc so the tier slicing (Top 20 / 21–50)
  // produces a stable, intuitive partition. Recharts uses `size` as the
  // area weight; mention_count keeps cells proportional to real volume.
  const treemapItems = useMemo(() => {
    let arr = leaderboard;
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(i => i.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      arr = arr.filter(i => (i.category || 'Uncategorized') === categoryFilter);
    }
    if (preTgeOnly) arr = arr.filter(i => i.is_pre_tge);
    arr = [...arr].filter(i => i.mention_count > 0).sort((a, b) => b.mention_count - a.mention_count);
    const slice = treemapTier === 'top20' ? arr.slice(0, 20) : arr.slice(20, 50);
    return slice.map((item, idx) => ({
      ...item,
      size: item.mention_count,
      // Rank is global (across the whole filtered set), not slice-relative,
      // so the "21-50" view doesn't confusingly show #1.
      rank: arr.findIndex(x => x.project_id === item.project_id) + 1,
    }));
  }, [leaderboard, search, categoryFilter, preTgeOnly, treemapTier]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc'); }
  };

  const sortIndicator = (k: SortKey) =>
    sortKey === k ? <span className="ml-0.5 text-[10px] text-gray-500">{sortDir === 'asc' ? '▲' : '▼'}</span> : null;

  // ─── Projects tab state ─────────────────────────────────────────
  const [projects, setProjects] = useState<MindshareProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [editingProject, setEditingProject] = useState<MindshareProject | null>(null);
  const [projectForm, setProjectForm] = useState<Partial<MindshareProject>>({});
  const [savingProject, setSavingProject] = useState(false);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await fetch('/api/mindshare/projects');
      const json = await res.json();
      setProjects(json.items || []);
    } catch (err) {
      console.error('Error loading projects:', err);
    } finally {
      setProjectsLoading(false);
    }
  }, []);
  useEffect(() => { if (tab === 'projects' || tab === 'leaderboard') loadProjects(); }, [tab, loadProjects]);

  const openCreateProject = () => {
    setEditingProject({ id: '', name: '', client_id: null, tracked_keywords: [], category: null, is_pre_tge: false, twitter_handle: null, website_url: null, description: null, is_active: true });
    setProjectForm({ name: '', tracked_keywords: [], is_active: true });
  };

  const openEditProject = (p: MindshareProject) => {
    setEditingProject(p);
    setProjectForm({ ...p, tracked_keywords: p.tracked_keywords || [] });
  };

  const saveProject = async () => {
    if (!projectForm.name?.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSavingProject(true);
    try {
      const isCreate = !editingProject?.id;
      const res = await fetch('/api/mindshare/projects', {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isCreate ? {} : { id: editingProject?.id }),
          ...projectForm,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast({ title: isCreate ? 'Project created' : 'Project updated' });
      setEditingProject(null);
      await loadProjects();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingProject(false);
    }
  };

  const deleteProject = async (p: MindshareProject) => {
    if (!confirm(`Delete project "${p.name}"? This also deletes its mention history.`)) return;
    try {
      const res = await fetch(`/api/mindshare/projects?id=${p.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: 'Project deleted' });
      await loadProjects();
      await loadLeaderboard();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    }
  };

  // ─── Channels tab state ─────────────────────────────────────────
  const [channels, setChannels] = useState<MonitoredChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelSearch, setChannelSearch] = useState('');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const { data } = await supabase.from('tg_monitored_channels').select('*').order('channel_name');
      setChannels((data || []) as MonitoredChannel[]);
    } catch (err) {
      console.error('Error loading channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  }, []);
  useEffect(() => { if (tab === 'channels') loadChannels(); }, [tab, loadChannels]);

  const toggleChannel = async (c: MonitoredChannel) => {
    const next = !c.is_active;
    setChannels(prev => prev.map(ch => ch.id === c.id ? { ...ch, is_active: next } : ch));
    await supabase.from('tg_monitored_channels').update({ is_active: next }).eq('id', c.id);
  };

  const setChannelLanguage = async (c: MonitoredChannel, language: string) => {
    setChannels(prev => prev.map(ch => ch.id === c.id ? { ...ch, language } : ch));
    await supabase.from('tg_monitored_channels').update({ language }).eq('id', c.id);
  };

  const deleteChannel = async (c: MonitoredChannel) => {
    if (!confirm(`Delete channel "${c.channel_name}"?`)) return;
    await supabase.from('tg_monitored_channels').delete().eq('id', c.id);
    setChannels(prev => prev.filter(ch => ch.id !== c.id));
  };

  const handleBulkImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const res = await fetch('/api/mindshare/channels/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText, language: 'ko' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast({ title: 'Channels imported', description: `${json.inserted} added, ${json.skipped} dupes skipped` });
      setImportText('');
      await loadChannels();
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  // Manual scan trigger for admins after onboarding new channels
  const triggerScan = async (backfill = false) => {
    const secret = window.prompt('Enter CRON_SECRET to trigger scan:');
    if (!secret) return;
    const res = await fetch(`/api/cron/mindshare-scan${backfill ? '?backfill=1' : ''}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: 'Scan failed', description: json.error, variant: 'destructive' });
      return;
    }
    toast({
      title: backfill ? 'Backfill complete' : 'Scan complete',
      description: `${json.messages_scanned} messages scanned, ${json.mentions_added} mentions added`,
    });
    await loadLeaderboard();
  };

  if (!isAdmin) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
          <p className="text-gray-600">Admin access required.</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────

  const filteredChannels = channels.filter(c =>
    !channelSearch ||
    c.channel_name.toLowerCase().includes(channelSearch.toLowerCase()) ||
    (c.channel_username || '').toLowerCase().includes(channelSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-brand" />
          Korean Mindshare
        </h2>
        <p className="text-sm text-gray-500">Where projects stand in Korean crypto Telegram channels.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="leaderboard" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Projects
            <Badge variant="secondary" className="ml-1 text-xs">{projects.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="channels" className="flex items-center gap-2">
            <Radio className="h-4 w-4" /> Channels
            <Badge variant="secondary" className="ml-1 text-xs">{channels.filter(c => c.is_active).length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ─── Leaderboard ─────────────────────────────────────── */}
        <TabsContent value="leaderboard" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              {(['24h', '7d', '30d'] as const).map(r => (
                <Button
                  key={r}
                  variant={range === r ? 'default' : 'outline'}
                  size="sm"
                  className={range === r ? 'bg-brand text-white hover:bg-brand/90' : ''}
                  onClick={() => setRange(r)}
                >
                  {r === '24h' ? 'Last 24h' : r === '7d' ? 'Last 7 days' : 'Last 30 days'}
                </Button>
              ))}
              <span className="ml-2 text-xs text-gray-500">{totalMentions.toLocaleString()} total mentions</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 w-56 focus-brand"
                />
              </div>
              {categories.length > 1 && (
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9 w-40 text-sm focus-brand">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{c === 'all' ? 'All categories' : c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-center gap-1.5 text-xs text-gray-600 px-2 py-1 border border-gray-200 rounded-md cursor-pointer">
                <Switch checked={preTgeOnly} onCheckedChange={setPreTgeOnly} />
                Pre-TGE only
              </label>
              <Button variant="outline" size="sm" onClick={loadLeaderboard} title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Treemap — Kaito-style square map. Cells sized by mention
              volume, colored by Δ vs prior period. Top 20 / 21–50 toggle
              mirrors Kaito's tier split for the long tail. */}
          {!leaderboardLoading && treemapItems.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1 text-xs">
                  <button
                    onClick={() => setTreemapTier('top20')}
                    className={`px-2.5 py-1 rounded ${treemapTier === 'top20' ? 'bg-emerald-700 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    Top 20
                  </button>
                  <span className="text-gray-600">›</span>
                  <button
                    onClick={() => setTreemapTier('top21_50')}
                    className={`px-2.5 py-1 rounded ${treemapTier === 'top21_50' ? 'bg-emerald-700 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    Top 21-50
                  </button>
                </div>
                <span className="text-[11px] text-gray-500">
                  Cell size = mention volume · color = Δ vs prior {range === '24h' ? 'day' : range === '7d' ? 'week' : 'month'}
                </span>
              </div>
              <div style={{ width: '100%', height: 500 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={treemapItems}
                    dataKey="size"
                    aspectRatio={4 / 3}
                    stroke="#0f172a"
                    isAnimationActive={false}
                    content={<TreemapCell />}
                  />
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {leaderboardLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filteredSorted.length === 0 ? (
              <div className="py-16 text-center">
                <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {leaderboard.length === 0
                    ? 'No mentions yet. Configure projects + channels, then trigger a scan.'
                    : 'No projects match the current filters.'}
                </p>
                {leaderboard.length === 0 && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => triggerScan(true)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Run backfill scan
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort('name')} className="hover:underline inline-flex items-center font-medium">
                        Project{sortIndicator('name')}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort('mention_count')} className="hover:underline inline-flex items-center font-medium">
                        Mentions{sortIndicator('mention_count')}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort('mindshare_pct')} className="hover:underline inline-flex items-center font-medium">
                        Mindshare{sortIndicator('mindshare_pct')}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort('delta_pct')} className="hover:underline inline-flex items-center font-medium">
                        Δ{sortIndicator('delta_pct')}
                      </button>
                    </TableHead>
                    <TableHead className="w-[100px]">Trend (14d)</TableHead>
                    <TableHead className="w-[100px]">
                      <button onClick={() => toggleSort('channel_reach')} className="hover:underline inline-flex items-center font-medium">
                        Channels{sortIndicator('channel_reach')}
                      </button>
                    </TableHead>
                    <TableHead className="w-[80px]">Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSorted.map((item, idx) => {
                    const trendIcon = item.delta_pct > 0.5
                      ? <TrendingUp className="h-3 w-3 text-emerald-600" />
                      : item.delta_pct < -0.5
                        ? <TrendingDown className="h-3 w-3 text-rose-600" />
                        : <Minus className="h-3 w-3 text-gray-400" />;
                    const deltaColor = item.delta_pct > 0.5 ? 'text-emerald-600' : item.delta_pct < -0.5 ? 'text-rose-600' : 'text-gray-500';
                    return (
                      <TableRow key={item.project_id} className="hover:bg-gray-50">
                        <TableCell className="text-gray-400 font-medium">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{item.name}</span>
                            {item.twitter_handle && (
                              <a
                                href={`https://x.com/${item.twitter_handle.replace(/^@/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-blue-500"
                                title="Open on X"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {item.client_id && <Badge variant="outline" className="text-[10px] bg-brand-light text-brand border-brand/30">Client</Badge>}
                          </div>
                          {item.category && <div className="text-xs text-gray-400 mt-0.5">{item.category}</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.mention_count.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{item.mindshare_pct.toFixed(2)}%</TableCell>
                        <TableCell className={`text-right tabular-nums ${deltaColor}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {trendIcon}
                            {item.delta_pct > 0 ? '+' : ''}{item.delta_pct.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell><Sparkline values={item.spark} /></TableCell>
                        <TableCell className="text-right tabular-nums text-gray-600">{item.channel_reach}</TableCell>
                        <TableCell>
                          {item.is_pre_tge && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Pre-TGE</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* ─── Projects ────────────────────────────────────────── */}
        <TabsContent value="projects" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              The universe ranked on the leaderboard. Includes your clients (auto-seeded) plus competitor benchmarks you add manually.
            </p>
            <Button onClick={openCreateProject} style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
              <Plus className="h-4 w-4 mr-1.5" /> Add Project
            </Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {projectsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : projects.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No projects yet. Add one to start tracking.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Keywords</TableHead>
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead className="w-[100px]">Tags</TableHead>
                    <TableHead className="w-[80px]">Active</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.client && <div className="text-xs text-brand">→ Client: {p.client.name}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[400px]">
                          {p.tracked_keywords.length === 0 && <span className="text-xs text-gray-400 italic">No keywords</span>}
                          {p.tracked_keywords.slice(0, 8).map(k => (
                            <span key={k} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{k}</span>
                          ))}
                          {p.tracked_keywords.length > 8 && (
                            <span className="text-xs text-gray-400">+{p.tracked_keywords.length - 8}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><span className="text-xs text-gray-600">{p.category || '—'}</span></TableCell>
                      <TableCell>
                        {p.is_pre_tge && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Pre-TGE</Badge>}
                      </TableCell>
                      <TableCell><Switch checked={p.is_active} onCheckedChange={async (v) => {
                        await fetch('/api/mindshare/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, is_active: v }) });
                        await loadProjects();
                      }} /></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditProject(p)} className="h-7 w-7 p-0"><Edit className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteProject(p)} className="h-7 w-7 p-0 text-red-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Project edit dialog */}
          <Dialog open={!!editingProject} onOpenChange={(open) => { if (!open) setEditingProject(null); }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingProject?.id ? 'Edit Project' : 'Add Project'}</DialogTitle>
                <DialogDescription>Tracked projects appear on the leaderboard ranked by Korean-channel mention share.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Name *</Label>
                    <Input value={projectForm.name || ''} onChange={(e) => setProjectForm(f => ({ ...f, name: e.target.value }))} className="focus-brand" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Input value={projectForm.category || ''} onChange={(e) => setProjectForm(f => ({ ...f, category: e.target.value || null }))} placeholder="DeFi, L1, AI..." className="focus-brand" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Twitter handle</Label>
                    <Input value={projectForm.twitter_handle || ''} onChange={(e) => setProjectForm(f => ({ ...f, twitter_handle: e.target.value || null }))} placeholder="solana" className="focus-brand" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Tracked keywords (comma-separated, case-insensitive)</Label>
                    <Textarea
                      rows={2}
                      value={(projectForm.tracked_keywords || []).join(', ')}
                      onChange={(e) => setProjectForm(f => ({ ...f, tracked_keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                      placeholder="solana, SOL, 솔라나"
                      className="focus-brand"
                    />
                    <p className="text-[11px] text-gray-500">Add Korean spellings + English + ticker. Each is matched as a substring (case-insensitive) in monitored channel messages.</p>
                  </div>
                  <div className="col-span-2 flex items-center gap-3">
                    <Switch checked={!!projectForm.is_pre_tge} onCheckedChange={(v) => setProjectForm(f => ({ ...f, is_pre_tge: v }))} />
                    <Label className="cursor-pointer">Pre-TGE project</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingProject(null)}>Cancel</Button>
                <Button onClick={saveProject} disabled={savingProject} style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                  {savingProject ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ─── Channels ────────────────────────────────────────── */}
        <TabsContent value="channels" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bulk import */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Upload className="h-4 w-4 text-brand" />
                <h3 className="font-semibold text-sm">Bulk import Korean channels</h3>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Paste one channel per line. Accepts <code className="bg-gray-100 px-1 rounded">@username</code>, <code className="bg-gray-100 px-1 rounded">t.me/username</code>, or <code className="bg-gray-100 px-1 rounded">"Display Name @username"</code>.
              </p>
              <Textarea
                rows={8}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`@coinkorea\nhttps://t.me/cryptokr\nUpbit Official @upbit_official`}
                className="focus-brand font-mono text-xs"
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-gray-500">All imports default to <strong>language=ko</strong> + active.</p>
                <Button onClick={handleBulkImport} disabled={!importText.trim() || importing} style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> {importing ? 'Importing...' : 'Import'}
                </Button>
              </div>
            </div>

            {/* Manual scan trigger */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="h-4 w-4 text-brand" />
                <h3 className="font-semibold text-sm">Scan controls</h3>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                The scanner runs every 30 minutes via Vercel cron. Trigger manually if you just added channels or projects.
              </p>
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={() => triggerScan(false)}>Run incremental scan</Button>
                <Button variant="outline" onClick={() => triggerScan(true)}>Backfill (rescan all messages)</Button>
              </div>
            </div>
          </div>

          {/* Channel list */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <h3 className="font-semibold text-sm flex-1">Monitored channels <Badge variant="secondary" className="ml-1 text-xs">{channels.length}</Badge></h3>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input value={channelSearch} onChange={(e) => setChannelSearch(e.target.value)} placeholder="Search..." className="pl-8 h-8 w-56 focus-brand" />
              </div>
            </div>
            {channelsLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[500px] overflow-auto">
                {filteredChannels.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500">No channels yet. Use the bulk importer above.</div>
                ) : filteredChannels.map(c => (
                  <div key={c.id} className={`px-4 py-2.5 flex items-center gap-3 ${!c.is_active ? 'opacity-60' : ''}`}>
                    <Switch checked={c.is_active} onCheckedChange={() => toggleChannel(c)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.channel_name}</p>
                      <p className="text-xs text-gray-500">@{c.channel_username}</p>
                    </div>
                    <Select value={c.language} onValueChange={(v) => setChannelLanguage(c, v)}>
                      <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ko">ko</SelectItem>
                        <SelectItem value="en">en</SelectItem>
                        <SelectItem value="ja">ja</SelectItem>
                        <SelectItem value="zh">zh</SelectItem>
                        <SelectItem value="vi">vi</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500" onClick={() => deleteChannel(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
