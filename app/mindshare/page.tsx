'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
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
  Minus, Edit, RefreshCw, Upload, ExternalLink, Crown, Download, Bot, CheckCircle2,
  XCircle, HelpCircle, ShieldAlert,
} from 'lucide-react';
import { Treemap, ResponsiveContainer } from 'recharts';

// ─── Types ──────────────────────────────────────────────────────────

type Range = '24h' | '7d' | '14d' | '30d' | '90d';

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
  // [Weighted score v1] 0-100 composite of recency × reach × uniqueness,
  // normalized so the top project = 100. Computed server-side; see the
  // leaderboard route for the formula.
  score: number;
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
  // [Bot membership tracking] Populated by
  // /api/mindshare/channels/check-bot-status. Until bot_status is
  // 'member'/'administrator'/'creator', the scanner won't receive
  // any messages from this chat, so mindshare stays empty for it.
  bot_status?: string | null;
  bot_status_checked_at?: string | null;
  last_message_at?: string | null;
  // [Channel metadata] Captured alongside bot status. member_count
  // lets the admin invite the bot to the highest-reach channels first;
  // chat_type tells them whether they need admin rights (channels) or
  // can add the bot as a regular member (groups).
  member_count?: number | null;
  chat_type?: string | null;
  metadata_checked_at?: string | null;
}

type SortKey = 'mindshare_pct' | 'mention_count' | 'name' | 'delta_pct' | 'channel_reach' | 'score';

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

function deltaColor(delta: number): { bg: string; border: string; text: string; muted: string } {
  // Anchor saturation to ±5 percentage points; clamp so extreme outliers
  // don't blow out the palette.
  const clamped = Math.max(-5, Math.min(5, delta));
  const intensity = Math.abs(clamped) / 5; // 0..1
  if (delta > 0.1) {
    // emerald scale — softer hues, lighter on weak gains, deeper on strong
    const lightness = 42 - intensity * 14;
    const sat = 38 + intensity * 12;
    return {
      bg: `hsl(152, ${sat}%, ${lightness}%)`,
      border: `hsl(152, ${sat}%, ${lightness - 10}%)`,
      text: '#f0fdf4',
      muted: 'rgba(240, 253, 244, 0.72)',
    };
  }
  if (delta < -0.1) {
    const lightness = 44 - intensity * 14;
    const sat = 42 + intensity * 12;
    return {
      bg: `hsl(358, ${sat}%, ${lightness}%)`,
      border: `hsl(358, ${sat}%, ${lightness - 10}%)`,
      text: '#fff1f2',
      muted: 'rgba(255, 241, 242, 0.72)',
    };
  }
  return {
    bg: 'hsl(220, 14%, 30%)',
    border: 'hsl(220, 14%, 22%)',
    text: '#f1f5f9',
    muted: 'rgba(241, 245, 249, 0.7)',
  };
}

function TreemapCell(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, onSelect } = props;
  // Recharts spreads each node's data fields directly on props (not
  // under `payload` like Tooltip does). Fall back to props.payload if a
  // future version changes the convention.
  const data = props.payload && typeof props.payload === 'object' && 'name' in props.payload
    ? props.payload
    : props;
  const { name, mindshare_pct, delta_pct, spark, rank, project_id } = data;
  if (width < 4 || height < 4 || !name) return null;
  const colors = deltaColor(delta_pct ?? 0);

  // Layout tiers — each adds more decoration as cells get bigger.
  // Below "small" we show only a centered, abbreviated name.
  const tier =
    width > 160 && height > 110 ? 'xl' :
    width > 110 && height > 80 ? 'lg' :
    width > 70 && height > 50 ? 'md' :
    width > 38 && height > 28 ? 'sm' : 'xs';

  const showCrown = (rank ?? 999) <= 3 && (tier === 'lg' || tier === 'xl');
  const positive = (delta_pct ?? 0) > 0.1;
  const negative = (delta_pct ?? 0) < -0.1;

  // Cap label font size so giant cells don't get absurd headers.
  const titleSize = tier === 'xl' ? 26 : tier === 'lg' ? 20 : tier === 'md' ? 14 : tier === 'sm' ? 11 : 10;
  const pctSize = tier === 'xl' ? 16 : tier === 'lg' ? 13 : tier === 'md' ? 11 : 10;
  const deltaSize = tier === 'xl' ? 12 : 11;
  const padding = tier === 'xl' ? 16 : tier === 'lg' ? 12 : 8;

  // Build the sparkline as an area underneath a stroke line, pinned to
  // the bottom 35% of the cell. Title stays in the top-left.
  let sparkLine = '';
  let sparkArea = '';
  const showSpark = (tier === 'lg' || tier === 'xl') && Array.isArray(spark) && spark.length > 1;
  if (showSpark) {
    const max = Math.max(...spark, 1);
    const sparkPadX = padding;
    const sparkBottomPad = padding;
    const sparkTop = y + height * 0.62;
    const sparkH = height * 0.32 - sparkBottomPad;
    const sparkW = width - sparkPadX * 2;
    const baseY = sparkTop + sparkH;
    const stepX = sparkW / (spark.length - 1);
    const points = spark.map((v: number, i: number) => {
      const px = x + sparkPadX + i * stepX;
      const py = sparkTop + sparkH - (v / max) * sparkH;
      return [px, py] as const;
    });
    sparkLine = points.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
    sparkArea =
      `M ${points[0][0].toFixed(2)},${baseY.toFixed(2)} ` +
      points.map(([px, py]) => `L ${px.toFixed(2)},${py.toFixed(2)}`).join(' ') +
      ` L ${points[points.length - 1][0].toFixed(2)},${baseY.toFixed(2)} Z`;
  }

  // Truncate names that won't fit horizontally. Rough proxy: ~7px per char.
  const truncate = (s: string, max: number) =>
    s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + '…';
  const charsFit = Math.max(3, Math.floor((width - padding * 2) / (titleSize * 0.55)));
  const displayName = truncate(name, charsFit);

  const deltaSign = positive ? '+' : '';
  const deltaText = `${deltaSign}${(delta_pct ?? 0).toFixed(2)}%`;
  const deltaArrow = positive ? '▲' : negative ? '▼' : '·';

  return (
    <g
      onClick={() => onSelect && project_id && onSelect(project_id)}
      style={{ cursor: onSelect && project_id ? 'pointer' : 'default' }}
    >
      {/* Cell background — slight rounding for a more polished look. */}
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={1}
        rx={6}
        ry={6}
      />
      {/* Subtle top-left highlight for depth */}
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.min(24, height - 2)}
        fill="rgba(255,255,255,0.04)"
        rx={6}
        ry={6}
        style={{ pointerEvents: 'none' }}
      />
      {/* Sparkline area + line */}
      {sparkArea && (
        <path d={sparkArea} fill={colors.text} opacity={0.08} style={{ pointerEvents: 'none' }} />
      )}
      {sparkLine && (
        <polyline
          points={sparkLine}
          fill="none"
          stroke={colors.text}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.85}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {showCrown && (
        <text
          x={x + width - padding}
          y={y + padding + 4}
          fontSize={tier === 'xl' ? 16 : 14}
          textAnchor="end"
          style={{ pointerEvents: 'none' }}
        >
          👑
        </text>
      )}
      {tier === 'xs' || tier === 'sm' ? (
        // Tiny cells: just a centered, abbreviated name.
        <text
          x={x + width / 2}
          y={y + height / 2}
          fill={colors.text}
          fontSize={titleSize}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: 'none' }}
        >
          {displayName}
        </text>
      ) : (
        <>
          <text
            x={x + padding}
            y={y + padding + titleSize * 0.85}
            fill={colors.text}
            fontSize={titleSize}
            fontWeight={700}
            style={{ pointerEvents: 'none', letterSpacing: '-0.01em' }}
          >
            {displayName}
          </text>
          <text
            x={x + padding}
            y={y + padding + titleSize * 0.85 + pctSize + 6}
            fill={colors.text}
            fontSize={pctSize}
            fontWeight={500}
            style={{ pointerEvents: 'none' }}
          >
            {(mindshare_pct ?? 0).toFixed(2)}%
          </text>
          {(tier === 'lg' || tier === 'xl') && (
            <text
              x={x + padding}
              y={y + padding + titleSize * 0.85 + pctSize + deltaSize + 22}
              fill={colors.muted}
              fontSize={deltaSize}
              fontWeight={500}
              style={{ pointerEvents: 'none' }}
            >
              {deltaArrow} {deltaText}
            </text>
          )}
        </>
      )}
    </g>
  );
}

// ─── Top Gainer / Top Loser side panel ─────────────────────────────
// Compact stacked-row table with Δ1d/Δ7d/Δ30d hidden behind a single
// most-relevant Δ value (matches whichever range the leaderboard is on).
// Click a row to open the drill-down for that project.

function GainerLoserPanel({
  title,
  variant,
  items,
  onSelect,
}: {
  title: string;
  variant: 'gain' | 'loss';
  items: LeaderboardItem[];
  onSelect: (projectId: string) => void;
}) {
  const isGain = variant === 'gain';
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className={`px-3 py-2 border-b border-gray-100 flex items-center justify-between ${isGain ? 'bg-emerald-50' : 'bg-rose-50'}`}>
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${isGain ? 'text-emerald-700' : 'text-rose-700'}`}>{title}</h4>
        {isGain ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-600" />}
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-gray-400">No data</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((item) => (
            <button
              key={item.project_id}
              onClick={() => onSelect(item.project_id)}
              className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-900 truncate">{item.name}</div>
                <div className="text-[10px] text-gray-500">{item.mindshare_pct.toFixed(2)}% mindshare</div>
              </div>
              <div className={`text-xs font-semibold tabular-nums ${item.delta_pct > 0 ? 'text-emerald-600' : item.delta_pct < 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                {item.delta_pct > 0 ? '+' : ''}{item.delta_pct.toFixed(2)}%
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function MindsharePage() {
  const { userProfile, loading: authLoading } = useAuth();
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
  // [Categorical dashboards v1] Full category list returned by the
  // API regardless of active filter — keeps the dropdown stable when
  // the user narrows the view.
  const [allCategories, setAllCategories] = useState<string[]>(['all']);
  const [sortKey, setSortKey] = useState<SortKey>('mindshare_pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Treemap tier toggle — Top 20 vs Top 21-50, mirroring Kaito's split
  const [treemapTier, setTreemapTier] = useState<'top20' | 'top21_50'>('top20');
  // Language filter — defaults to 'all' so the leaderboard uses the
  // precomputed mindshare_daily (channel-agnostic). Switching to a
  // specific language requires monitored channels to have channel_tg_id
  // populated, which only happens once the bot is in those chats and
  // the webhook bridges telegram_messages.chat_id ↔ monitored channels.
  // Until then, 'ko' would show 0 because the inner join eliminates
  // mentions with null channel_id.
  const [language, setLanguage] = useState<'all' | 'ko' | 'en' | 'ja' | 'zh' | 'vi'>('all');

  // Drill-down state — opened from a row click or treemap cell click
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = useCallback(async (projectId: string) => {
    setDetailProjectId(projectId);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch(`/api/mindshare/projects/${projectId}/detail?range=${range}`);
      const json = await res.json();
      setDetailData(json);
    } catch (err) {
      console.error('Error loading detail:', err);
    } finally {
      setDetailLoading(false);
    }
  }, [range]);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      // [Categorical dashboards v1] Category + preTge filters are now
      // server-side so mindshare_pct + total_mentions are correct
      // within the filtered view. Search stays client-side (instant
      // filter, no extra round-trip).
      const params = new URLSearchParams({ range, language });
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (preTgeOnly) params.set('preTge', 'true');
      const res = await fetch(`/api/mindshare/leaderboard?${params.toString()}`);
      const json = await res.json();
      setLeaderboard(json.items || []);
      setTotalMentions(json.total_mentions || 0);
      // Capture all_categories the first time (or whenever the API
      // returns it). Keeps dropdown stable across filtered fetches.
      if (Array.isArray(json.all_categories)) {
        setAllCategories(['all', ...json.all_categories]);
      }
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [range, language, categoryFilter, preTgeOnly]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  // [Categorical dashboards v1] Client-side filter is now just search +
  // sort (category + preTge moved to API). Keeps search instant without
  // forcing a refetch on every keystroke.
  const filteredSorted = useMemo(() => {
    let arr = leaderboard;
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(i => i.name.toLowerCase().includes(q));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      const av: any = (a as any)[sortKey];
      const bv: any = (b as any)[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av || '').localeCompare(String(bv || '')) * dir;
    });
  }, [leaderboard, search, sortKey, sortDir]);

  // Categories list comes from the API (stable across filtered fetches).
  // Falls back to deriving from current leaderboard if API didn't send.
  const categories = useMemo(() => {
    if (allCategories.length > 1) return allCategories;
    const set = new Set<string>();
    leaderboard.forEach(i => set.add(i.category || 'Uncategorized'));
    return ['all', ...Array.from(set).sort()];
  }, [allCategories, leaderboard]);

  // Top Gainers / Top Losers panels — derived from the same leaderboard
  // data, sorted by delta_pct. Only include items with mentions in the
  // current window AND with a delta in the right direction. Otherwise
  // a 7-project universe lands the same items on both panels (a loser
  // appearing in Top Gainer is jarring).
  const topGainers = useMemo(() =>
    [...leaderboard]
      .filter(i => i.mention_count > 0 && i.delta_pct > 0.01)
      .sort((a, b) => b.delta_pct - a.delta_pct)
      .slice(0, 8)
  , [leaderboard]);
  const topLosers = useMemo(() =>
    [...leaderboard]
      .filter(i => i.mention_count > 0 && i.delta_pct < -0.01)
      .sort((a, b) => a.delta_pct - b.delta_pct)
      .slice(0, 8)
  , [leaderboard]);

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

  // CSV export of the current filtered + sorted view. Handy for
  // pasting a snapshot into a weekly report or sharing with the team.
  const exportCsv = () => {
    if (filteredSorted.length === 0) return;
    const header = ['Rank', 'Project', 'Category', 'Mentions', 'Mindshare %', 'Score', 'Δ vs prior %', 'Channels', 'Pre-TGE'];
    const rows = filteredSorted.map((item, i) => [
      i + 1,
      item.name,
      item.category || '',
      item.mention_count,
      item.mindshare_pct.toFixed(2),
      item.score.toFixed(1),
      item.delta_pct.toFixed(2),
      item.channel_reach,
      item.is_pre_tge ? 'yes' : 'no',
    ]);
    const escape = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `korean-mindshare-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
  const [channelMentionCounts, setChannelMentionCounts] = useState<Record<string, number>>({});
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelSearch, setChannelSearch] = useState('');
  const [channelLanguageFilter, setChannelLanguageFilter] = useState<string>('all');
  // [Channel metadata] Sort key for the channel list. 'members' is the
  // pragmatic default once we have metadata — surfaces highest-reach
  // channels so the admin invites the bot there first.
  const [channelSort, setChannelSort] = useState<'name' | 'members' | 'bot'>('name');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const { data } = await supabase.from('tg_monitored_channels').select('*').order('channel_name');
      setChannels((data || []) as MonitoredChannel[]);
      // Sidecar query for last-7d mention activity per channel — gives
      // admins a signal for which channels are dead and prunable.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: activity } = await (supabase as any)
        .from('tg_mentions')
        .select('channel_id')
        .gte('message_date', sevenDaysAgo)
        .not('channel_id', 'is', null);
      const counts: Record<string, number> = {};
      for (const row of (activity || []) as any[]) {
        counts[row.channel_id] = (counts[row.channel_id] || 0) + 1;
      }
      setChannelMentionCounts(counts);
    } catch (err) {
      console.error('Error loading channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  }, []);
  // Load channels on mount so the tab badge counter ("Channels (34)")
  // reflects the real count before the user clicks into the tab. Cheap
  // query — one select against a small table.
  useEffect(() => { loadChannels(); }, [loadChannels]);

  const channelLanguages = useMemo(() => {
    const set = new Set<string>();
    channels.forEach(c => { if (c.language) set.add(c.language); });
    return Array.from(set).sort();
  }, [channels]);

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

  // Manual scan trigger for admins after onboarding new channels.
  // Hits the admin-session-gated /api/mindshare/scan endpoint so we
  // don't have to expose CRON_SECRET to the client.
  const [scanning, setScanning] = useState<false | 'incremental' | 'backfill'>(false);
  const triggerScan = async (backfill = false) => {
    if (scanning) return;
    setScanning(backfill ? 'backfill' : 'incremental');
    try {
      const res = await fetch(`/api/mindshare/scan${backfill ? '?backfill=1' : ''}`, { method: 'POST' });
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
    } finally {
      setScanning(false);
    }
  };

  // [Bot membership tracking] Checks whether the HH bot is actually
  // a member of each monitored chat. Without membership the scanner
  // can't receive messages, no matter how many chats are in the
  // registry. Surfaces in the Channels tab so the admin can chase
  // invites for the ones still marked 'left'.
  const [checkingBotStatus, setCheckingBotStatus] = useState<false | 'all' | string>(false);
  const [botInfo, setBotInfo] = useState<{ id: number; username: string } | null>(null);
  // [Resolve chat IDs from UI] In-app replacement for the
  // backfill-channel-tg-id curl. Calls an admin-gated mirror endpoint
  // that runs the same Telegram getChat loop but accepts a Supabase
  // session instead of CRON_SECRET.
  const [resolvingTgIds, setResolvingTgIds] = useState(false);
  const resolveChatIds = async () => {
    if (resolvingTgIds) return;
    setResolvingTgIds(true);
    try {
      const res = await fetch('/api/mindshare/channels/backfill-tg-ids', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: 'Resolve failed', description: json.error, variant: 'destructive' });
        return;
      }
      if (json.attempted === 0) {
        toast({ title: 'Nothing to resolve', description: json.message || 'All channels already have chat IDs.' });
      } else {
        toast({
          title: 'Chat IDs resolved',
          description: `${json.succeeded}/${json.attempted} resolved${json.failed ? `, ${json.failed} failed (likely rate-limited — click again in 30s)` : ''}`,
        });
      }
      await loadChannels();
    } catch (err: any) {
      toast({ title: 'Resolve failed', description: err?.message, variant: 'destructive' });
    } finally {
      setResolvingTgIds(false);
    }
  };
  const checkBotStatus = async (channelId?: string) => {
    if (checkingBotStatus) return;
    setCheckingBotStatus(channelId || 'all');
    try {
      const res = await fetch('/api/mindshare/channels/check-bot-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channelId ? { channel_id: channelId } : {}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: 'Bot status check failed', description: json.error, variant: 'destructive' });
        return;
      }
      if (json.bot) setBotInfo(json.bot);
      const memberCount = (json.summary?.member || 0) + (json.summary?.administrator || 0) + (json.summary?.creator || 0);
      toast({
        title: channelId ? 'Status updated' : 'Bot status checked',
        description: channelId
          ? `Status: ${json.results?.[0]?.status || 'unknown'}`
          : `${memberCount}/${json.attempted} channels have the bot as a member`,
      });
      await loadChannels();
    } catch (err: any) {
      toast({ title: 'Check failed', description: err?.message, variant: 'destructive' });
    } finally {
      setCheckingBotStatus(false);
    }
  };

  // Avoid flashing the admin-gate screen while auth is still resolving —
  // userProfile is null on first render, which would otherwise paint the
  // "Admin access required" placeholder for one frame before the real
  // role arrives.
  if (authLoading || !userProfile) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      </div>
    );
  }

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

  const filteredChannels = channels
    .filter(c => {
      if (channelLanguageFilter !== 'all' && c.language !== channelLanguageFilter) return false;
      if (!channelSearch) return true;
      const q = channelSearch.toLowerCase();
      return c.channel_name.toLowerCase().includes(q)
        || (c.channel_username || '').toLowerCase().includes(q);
    })
    // [Channel metadata] Sort by user-selected key. 'members' surfaces
    // highest-reach channels first — that's the right order for the
    // bot-invitation workflow (invite to biggest, fall back to MTProto
    // for admin-only channels later). 'bot' surfaces channels that
    // still need a bot invite (left/unknown sort to the top). Default
    // 'name' is alphabetical (original behavior).
    .sort((a, b) => {
      if (channelSort === 'members') {
        const av = a.member_count ?? -1;
        const bv = b.member_count ?? -1;
        if (av !== bv) return bv - av;
      } else if (channelSort === 'bot') {
        const rank = (s?: string | null) => {
          if (s === 'left' || s === 'kicked') return 0;
          if (!s || s === 'unknown') return 1;
          if (s === 'error') return 2;
          return 3; // member/admin/creator
        };
        const ar = rank(a.bot_status);
        const br = rank(b.bot_status);
        if (ar !== br) return ar - br;
      }
      return a.channel_name.localeCompare(b.channel_name);
    });

  return (
    <div className="space-y-6">
      {/* [Design system, May 2026] Header migrated to <PageHeader> */}
      <PageHeader
        icon={BarChart3}
        title="Korean Mindshare"
        subtitle="Where projects stand in Korean crypto Telegram channels."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="leaderboard" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Projects
            {/* Render the count badge only after the underlying fetch
                has resolved at least once — otherwise it flashes "0"
                on first paint before settling. Pattern matches the
                Channels tab below. */}
            {projectsLoading && projects.length === 0 ? (
              <span className="ml-1 inline-block h-4 w-6 rounded bg-gray-100 animate-pulse" />
            ) : (
              <Badge variant="secondary" className="ml-1 text-xs">{projects.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="channels" className="flex items-center gap-2">
            <Radio className="h-4 w-4" /> Channels
            {channelsLoading && channels.length === 0 ? (
              <span className="ml-1 inline-block h-4 w-6 rounded bg-gray-100 animate-pulse" />
            ) : (
              <Badge variant="secondary" className="ml-1 text-xs">{channels.filter(c => c.is_active).length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Leaderboard ─────────────────────────────────────── */}
        <TabsContent value="leaderboard" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              {(['24h', '7d', '14d', '30d', '90d'] as const).map(r => (
                <Button
                  key={r}
                  variant={range === r ? 'default' : 'outline'}
                  size="sm"
                  className={range === r ? 'bg-brand text-white hover:bg-brand/90' : ''}
                  onClick={() => setRange(r)}
                >
                  {r === '24h' ? 'Last 24h'
                    : r === '7d'  ? 'Last 7 days'
                    : r === '14d' ? 'Last 14 days'
                    : r === '30d' ? 'Last 30 days'
                    : 'Last 90 days'}
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
              <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
                <SelectTrigger className="h-9 w-32 text-sm focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All languages</SelectItem>
                  <SelectItem value="ko">한국어 (Korean)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="vi">Tiếng Việt</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 px-2 py-1 border border-gray-200 rounded-md cursor-pointer">
                <Switch checked={preTgeOnly} onCheckedChange={setPreTgeOnly} />
                Pre-TGE only
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={filteredSorted.length === 0}
                title="Export current view to CSV"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={loadLeaderboard} title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Gainers / Losers + Treemap row. On large screens the side
              panels sit to the left of the treemap (Kaito layout); on
              smaller they stack above. Renders whenever the leaderboard
              has finished loading — the empty-state placeholder below is
              more useful than hiding the whole block. */}
          {!leaderboardLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">
              {/* Side panels: gainers on top, losers below */}
              <div className="space-y-3">
                <GainerLoserPanel
                  title="Top Gainer"
                  variant="gain"
                  items={topGainers}
                  onSelect={openDetail}
                />
                <GainerLoserPanel
                  title="Top Loser"
                  variant="loss"
                  items={topLosers}
                  onSelect={openDetail}
                />
              </div>

              {/* Treemap — Kaito-style square map. Cells sized by mention
                  volume, colored by Δ vs prior period. */}
              {treemapItems.length > 0 ? (
                <div
                  className="rounded-xl p-4 border border-slate-800/60 shadow-inner"
                  style={{
                    background: 'linear-gradient(160deg, #0b1220 0%, #0f172a 60%, #111827 100%)',
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        onClick={() => setTreemapTier('top20')}
                        className={`px-3 py-1.5 rounded-md font-medium transition-colors ${treemapTier === 'top20' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
                      >
                        Top 20
                      </button>
                      <span className="text-slate-600 px-1">›</span>
                      <button
                        onClick={() => setTreemapTier('top21_50')}
                        className={`px-3 py-1.5 rounded-md font-medium transition-colors ${treemapTier === 'top21_50' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
                      >
                        Top 21–50
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="hidden sm:inline">Cell size = mention volume</span>
                      <span className="hidden sm:inline text-slate-700">·</span>
                      <div className="flex items-center gap-2">
                        <span>Δ vs prior {range === '24h' ? 'day' : range === '7d' ? 'week' : 'month'}:</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(358, 50%, 38%)' }} />
                          <span className="text-slate-400">down</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(220, 14%, 30%)' }} />
                          <span className="text-slate-400">flat</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(152, 46%, 36%)' }} />
                          <span className="text-slate-400">up</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: 520 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <Treemap
                        data={treemapItems}
                        dataKey="size"
                        // Omit aspectRatio so cells fill the full container
                        // even with very few items. With a fixed aspect,
                        // recharts leaves an unused band at the bottom.
                        stroke="transparent"
                        isAnimationActive={false}
                        content={<TreemapCell onSelect={openDetail} />}
                      />
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900 rounded-xl p-12 flex items-center justify-center border border-slate-800/60">
                  <p className="text-sm text-slate-500">No mentions for the current filters.</p>
                </div>
              )}
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
                    {/* [Weighted score v1] Composite recency × reach × uniqueness,
                        normalized 0-100 against the top project. Hover for the
                        breakdown. */}
                    <TableHead className="text-right">
                      <button
                        onClick={() => toggleSort('score')}
                        className="hover:underline inline-flex items-center font-medium"
                        title="Composite score: recency × reach × uniqueness, normalized to 100"
                      >
                        Score{sortIndicator('score')}
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
                      <TableRow key={item.project_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(item.project_id)}>
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
                        {/* [Weighted score v1] Top project renders as 100.0 by
                            definition; lighter gray below to signal it's
                            relative-to-leader, not absolute. */}
                        <TableCell className="text-right tabular-nums">
                          <span className={item.score >= 50 ? 'font-semibold text-gray-900' : 'text-gray-600'}>
                            {item.score.toFixed(1)}
                          </span>
                        </TableCell>
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

          {/* Drill-down dialog — opened from row click or treemap cell.
              Shows project metadata, daily mention chart, top channels,
              and a sample of recent matching messages. */}
          <Dialog open={!!detailProjectId} onOpenChange={(open) => { if (!open) { setDetailProjectId(null); setDetailData(null); } }}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              {detailLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : !detailData ? (
                <div className="py-8 text-center text-sm text-gray-500">Couldn&apos;t load detail.</div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      {detailData.project.name}
                      {detailData.project.client && (
                        <Badge variant="outline" className="text-[10px] bg-brand-light text-brand border-brand/30">
                          Client: {detailData.project.client.name}
                        </Badge>
                      )}
                      {detailData.project.is_pre_tge && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Pre-TGE</Badge>
                      )}
                      {detailData.project.twitter_handle && (
                        <a
                          href={`https://x.com/${detailData.project.twitter_handle.replace(/^@/, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-blue-500"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {/* [Storyteller v1] Link to the full per-project
                          deep-dive page (richer than this dialog —
                          ALL channels, trend deltas, NEW badges). */}
                      <a
                        href={`/mindshare/project/${detailData.project.id}`}
                        className="ml-auto text-xs text-brand hover:underline inline-flex items-center gap-1"
                        title="Open full Storyteller view (all channels + trend deltas)"
                      >
                        Storyteller view →
                      </a>
                    </DialogTitle>
                    <DialogDescription>
                      {detailData.total_mentions_in_window.toLocaleString()} mentions
                      between {detailData.period.from} and {detailData.period.to}
                      {detailData.project.category && <> · <span className="font-medium">{detailData.project.category}</span></>}
                    </DialogDescription>
                  </DialogHeader>

                  {/* Daily mention bars — simple inline SVG so no extra
                      dependency for one chart. Heights normalized to the
                      window's max. Y-max + first/last day labels give
                      enough scale context without a full axis. */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-gray-700">Daily mentions</div>
                      {(() => {
                        const peak = Math.max(...detailData.series.map((d: any) => d.mentions), 0);
                        return peak > 0 ? (
                          <div className="text-[10px] text-gray-400">peak: {peak.toLocaleString()}/day</div>
                        ) : null;
                      })()}
                    </div>
                    {(() => {
                      const max = Math.max(...detailData.series.map((d: any) => d.mentions), 1);
                      return (
                        <>
                          <div className="flex items-end gap-0.5 h-24 bg-gray-50 rounded p-2 relative">
                            {/* y-axis tick at top */}
                            <span className="absolute top-1 left-1 text-[9px] text-gray-300 leading-none">{max}</span>
                            {detailData.series.map((d: any) => (
                              <div key={d.day} className="flex-1 flex flex-col items-center justify-end group" title={`${d.day}: ${d.mentions} mentions`}>
                                <div
                                  className={`w-full rounded-t transition-opacity ${d.mentions > 0 ? 'bg-brand' : 'bg-gray-200'} group-hover:opacity-80`}
                                  style={{ height: `${(d.mentions / max) * 100}%`, minHeight: d.mentions > 0 ? 2 : 1 }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400 px-1">
                            <span>{detailData.series[0]?.day}</span>
                            <span>{detailData.series[detailData.series.length - 1]?.day}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Top channels */}
                  {detailData.top_channels.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-gray-700">Top channels</div>
                      <div className="space-y-1">
                        {detailData.top_channels.map((c: any, i: number) => {
                          const totalChannelHits = detailData.top_channels.reduce((s: number, x: any) => s + x.count, 0) || 1;
                          const sharePct = (c.count / totalChannelHits) * 100;
                          return (
                            <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-gray-50 rounded">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium text-gray-700 truncate">{c.name}</span>
                                {c.username && (
                                  <a
                                    href={`https://t.me/${String(c.username).replace(/^@/, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-300 hover:text-blue-500 shrink-0"
                                    title="Open on Telegram"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-[10px] text-gray-400 tabular-nums">{sharePct.toFixed(0)}%</span>
                                <span className="tabular-nums font-semibold w-8 text-right">{c.count}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sample mentions */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-gray-700">Recent mentions ({detailData.sample_mentions.length})</div>
                    {detailData.sample_mentions.length === 0 ? (
                      <div className="text-xs text-gray-400 italic px-2 py-3">No matching messages in this window.</div>
                    ) : (
                      <div className="space-y-1.5 max-h-72 overflow-y-auto">
                        {detailData.sample_mentions.map((m: any) => (
                          <div key={m.id} className="text-xs p-2.5 border border-gray-200 rounded">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 min-w-0">
                                <span className="shrink-0">{new Date(m.message_date).toLocaleString()}</span>
                                {m.channel?.channel_name && (
                                  <span className="truncate">
                                    ·{' '}
                                    {m.channel.channel_username ? (
                                      <a
                                        href={`https://t.me/${String(m.channel.channel_username).replace(/^@/, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-gray-500 hover:text-blue-500 underline-offset-2 hover:underline"
                                      >
                                        {m.channel.channel_name}
                                      </a>
                                    ) : (
                                      m.channel.channel_name
                                    )}
                                  </span>
                                )}
                                <Badge variant="outline" className="text-[9px] shrink-0">{m.matched_keyword}</Badge>
                              </div>
                            </div>
                            <p className="text-gray-700 line-clamp-3 whitespace-pre-wrap">{m.message_text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ─── Projects ────────────────────────────────────────── */}
        <TabsContent value="projects" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              The universe ranked on the leaderboard. Includes your clients (auto-seeded) plus competitor benchmarks you add manually.
            </p>
            <Button variant="brand" onClick={openCreateProject}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Project
            </Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {projectsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : projects.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No projects yet"
                description="Add a project to start tracking its share of voice in Korean Telegram channels."
              />
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
                        <Button variant="ghost" size="sm" onClick={() => deleteProject(p)} className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
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
                    <Label>Name <RequiredAsterisk /></Label>
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
                <Button variant="brand" onClick={saveProject} disabled={savingProject}>
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
                <Button variant="brand" onClick={handleBulkImport} disabled={!importText.trim() || importing}>
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
                <Button variant="outline" disabled={!!scanning} onClick={() => triggerScan(false)}>
                  {scanning === 'incremental' ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Scanning…</>
                  ) : 'Run incremental scan'}
                </Button>
                <Button variant="outline" disabled={!!scanning} onClick={() => triggerScan(true)}>
                  {scanning === 'backfill' ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Backfilling…</>
                  ) : 'Backfill (rescan all messages)'}
                </Button>
              </div>
            </div>
          </div>

          {/* [Bot membership tracking] Summary banner — answers
              "is the bot actually in our channels?" at a glance. Until
              the bot is invited to a channel, mindshare can't receive
              any messages from it, so this is the single most important
              piece of operational state on the page. */}
          {(() => {
            const eligible = channels.filter(c => c.is_active && c.channel_tg_id);
            const member = eligible.filter(c =>
              c.bot_status === 'member' || c.bot_status === 'administrator' || c.bot_status === 'creator'
            ).length;
            const left = eligible.filter(c => c.bot_status === 'left' || c.bot_status === 'kicked').length;
            const unknown = eligible.filter(c => !c.bot_status || c.bot_status === 'unknown').length;
            const errored = eligible.filter(c => c.bot_status === 'error').length;
            const pct = eligible.length > 0 ? Math.round((member / eligible.length) * 100) : 0;
            const allGood = unknown === 0 && left === 0 && errored === 0 && eligible.length > 0;
            // [Resolve chat IDs from UI] Count of channels with a
            // username but no channel_tg_id yet — these can't be bot-
            // checked until we resolve their numeric ID via Telegram
            // getChat. Drives the "Resolve N chat IDs" button below.
            const needsResolution = channels.filter(c =>
              c.is_active && !c.channel_tg_id && c.channel_username
            ).length;
            return (
              <div className={`border rounded-lg p-4 ${allGood ? 'bg-emerald-50 border-emerald-200' : left > 0 || unknown > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <Bot className={`h-5 w-5 mt-0.5 flex-shrink-0 ${allGood ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">
                        Bot membership: <span className="tabular-nums">{member} / {eligible.length}</span> channels ({pct}%)
                      </h3>
                      {botInfo && (
                        <a
                          href={`https://t.me/${botInfo.username}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-gray-600 hover:text-brand underline decoration-dotted"
                          title="Open bot on Telegram"
                        >
                          @{botInfo.username}
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {allGood
                        ? 'All active channels have the bot as a member. Mindshare will receive messages from every channel.'
                        : 'The Telegram scanner only sees messages from chats the bot is a member of. Channels marked "left" or "unknown" need a bot invite.'}
                    </p>
                    {(unknown > 0 || left > 0 || errored > 0) && (
                      <div className="flex items-center gap-3 mt-2 text-[11px] tabular-nums">
                        {member > 0 && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> {member} member</span>}
                        {left > 0 && <span className="inline-flex items-center gap-1 text-rose-700"><XCircle className="h-3 w-3" /> {left} not-joined</span>}
                        {unknown > 0 && <span className="inline-flex items-center gap-1 text-gray-600"><HelpCircle className="h-3 w-3" /> {unknown} unchecked</span>}
                        {errored > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><ShieldAlert className="h-3 w-3" /> {errored} errored</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-stretch gap-2 flex-shrink-0">
                    {/* [Resolve chat IDs from UI] Replaces the old curl.
                        Only renders when there are channels missing
                        channel_tg_id — typically right after a bulk
                        channel import. Click runs Telegram getChat per
                        unresolved row + writes the resolved IDs back.
                        Idempotent so re-clicking is safe (also fixes
                        rate-limit failures from the previous run). */}
                    {needsResolution > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resolvingTgIds}
                        onClick={resolveChatIds}
                      >
                        {resolvingTgIds ? (
                          <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Resolving…</>
                        ) : (
                          <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Resolve {needsResolution} chat ID{needsResolution === 1 ? '' : 's'}</>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={checkingBotStatus === 'all'}
                      onClick={() => checkBotStatus()}
                    >
                      {checkingBotStatus === 'all' ? (
                        <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Checking…</>
                      ) : (
                        <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Check all</>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Channel list */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <h3 className="font-semibold text-sm flex-1">
                Monitored channels{' '}
                <Badge variant="secondary" className="ml-1 text-xs">{filteredChannels.length}{filteredChannels.length !== channels.length && ` of ${channels.length}`}</Badge>
              </h3>
              {/* [Channel metadata] Sort selector — defaults to alpha,
                  but "by members" is the right pick once we've run
                  "Check all" once. */}
              <Select value={channelSort} onValueChange={(v) => setChannelSort(v as any)}>
                <SelectTrigger className="h-8 w-36 text-xs focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort: name</SelectItem>
                  <SelectItem value="members">Sort: members (high → low)</SelectItem>
                  <SelectItem value="bot">Sort: bot needed first</SelectItem>
                </SelectContent>
              </Select>
              {channelLanguages.length > 1 && (
                <Select value={channelLanguageFilter} onValueChange={setChannelLanguageFilter}>
                  <SelectTrigger className="h-8 w-32 text-xs focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All languages</SelectItem>
                    {channelLanguages.map(l => {
                      // Map ISO code → full label for the filter dropdown.
                      // Falls back to the raw code so we don't lose options
                      // if a new language gets added without us updating this.
                      const label = ({ ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese' } as Record<string, string>)[l] || l;
                      return <SelectItem key={l} value={l}>{label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              )}
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
                ) : filteredChannels.map(c => {
                  const hits7d = channelMentionCounts[c.id] || 0;
                  // Visual signal: dead channels (no hits in 7d) get a
                  // muted dot so admins can scan and prune.
                  const activityClass =
                    hits7d === 0 ? 'bg-gray-200 text-gray-500'
                    : hits7d < 5 ? 'bg-amber-50 text-amber-700 border border-amber-100'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                  return (
                    <div key={c.id} className={`px-4 py-2.5 flex items-center gap-3 ${!c.is_active ? 'opacity-60' : ''}`}>
                      <Switch checked={c.is_active} onCheckedChange={() => toggleChannel(c)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.channel_name}</p>
                          {c.channel_username && (
                            <a
                              href={`https://t.me/${c.channel_username.replace(/^@/, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-300 hover:text-blue-500"
                              title="Open on Telegram"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-500">{c.channel_username ? `@${c.channel_username}` : '—'}</p>
                          {/* [Channel metadata] Chat type hint — channels
                              need admin rights to add a bot. Tooltip
                              spells out the invitation requirement. */}
                          {c.chat_type && (
                            <span
                              className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                c.chat_type === 'channel'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-100'
                                  : 'bg-blue-50 text-blue-700 border border-blue-100'
                              }`}
                              title={
                                c.chat_type === 'channel'
                                  ? 'Broadcast channel — bot must be added as admin (not regular member)'
                                  : `${c.chat_type} — bot can be added as a regular member`
                              }
                            >
                              {c.chat_type}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* [Channel metadata] Member count badge — reach
                          signal so admin can prioritize bot-invite work
                          on the biggest channels first. */}
                      {typeof c.member_count === 'number' && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full tabular-nums bg-gray-100 text-gray-700 border border-gray-200"
                          title={`~${c.member_count.toLocaleString()} members (Telegram approximate)`}
                        >
                          {c.member_count >= 1000 ? `${(c.member_count / 1000).toFixed(1)}K` : c.member_count}
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full tabular-nums ${activityClass}`}
                        title={`${hits7d} mentions in last 7 days`}
                      >
                        {hits7d} / 7d
                      </span>
                      {/* [Bot membership tracking] Per-row status pill +
                          single-channel recheck. Click the pill to
                          recheck just this channel (useful right after
                          you invite the bot). */}
                      {(() => {
                        const status = c.bot_status || 'unknown';
                        const isMember = status === 'member' || status === 'administrator' || status === 'creator';
                        const isLeft = status === 'left' || status === 'kicked';
                        const pillClass = isMember
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : isLeft
                            ? 'bg-rose-50 text-rose-700 border border-rose-100'
                            : status === 'error'
                              ? 'bg-amber-50 text-amber-700 border border-amber-100'
                              : 'bg-gray-100 text-gray-500';
                        const label = isMember
                          ? (status === 'administrator' ? 'admin' : status === 'creator' ? 'owner' : 'in')
                          : isLeft ? 'not in'
                            : status === 'error' ? 'error'
                              : 'unknown';
                        return (
                          <button
                            type="button"
                            disabled={checkingBotStatus === c.id || checkingBotStatus === 'all'}
                            onClick={() => checkBotStatus(c.id)}
                            className={`text-[10px] px-2 py-0.5 rounded-full ${pillClass} hover:opacity-80 transition-opacity disabled:opacity-50 inline-flex items-center gap-1`}
                            title={
                              checkingBotStatus === c.id ? 'Checking…' :
                              `Bot status: ${status}${c.bot_status_checked_at ? ` (checked ${new Date(c.bot_status_checked_at).toLocaleString()})` : ''}. Click to recheck.`
                            }
                          >
                            {checkingBotStatus === c.id ? (
                              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <Bot className="h-2.5 w-2.5" />
                            )}
                            {label}
                          </button>
                        );
                      })()}
                      <Select value={c.language} onValueChange={(v) => setChannelLanguage(c, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ko">Korean</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="ja">Japanese</SelectItem>
                          <SelectItem value="zh">Chinese</SelectItem>
                          <SelectItem value="vi">Vietnamese</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-rose-500" onClick={() => deleteChannel(c)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
