'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Card } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, Users, TrendingUp, Eye, Zap, Building2, AlertTriangle } from 'lucide-react';

type RankBy = 'avg_views' | 'activations' | 'clients';
type PlatformFilter = 'all' | 'X' | 'Telegram' | 'YouTube';

interface KolRow {
  kol_id: string;
  name: string;
  handle: string | null;
  primary_platform: string | null;
  profile_picture_url: string | null;
  posts: number;
  views: number;
  avg_views: number;
  engagement_rate: number;
  activations: number;
  clients: number;
  is_amber_reuse: boolean;
}

interface LeaderboardResponse {
  asOf: string;
  filters: { platform: string };
  thresholds: {
    reuse_amber_min_clients: number;
    top10_concentration_amber_pct: number;
  };
  kpi: {
    campaign_averages: {
      avg_posts_per_kol: number;
      avg_views_per_post: number;
      avg_activations_per_kol: number;
      avg_engagement_rate: number;
    };
    all_time_totals: {
      total_kols: number;
      total_posts: number;
      total_views: number;
      total_activations: number;
    };
    concentration: {
      top10_pct: number;
      is_amber: boolean;
    };
  };
  leaderboard: KolRow[];
}

const fmtInt = (n: number) => n.toLocaleString('en-US');
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function CampaignOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [rankBy, setRankBy] = useState<RankBy>('avg_views');
  const [platform, setPlatform] = useState<PlatformFilter>('all');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/campaigns/overview/kol-leaderboard?platform=${platform}`)
      .then(r => r.json())
      .then(json => setData(json))
      .finally(() => setLoading(false));
  }, [platform]);

  // Client-side re-rank (spec: does not change which KOLs are shown, only sort).
  const sortedLeaderboard = useMemo(() => {
    if (!data?.leaderboard) return [];
    const rows = [...data.leaderboard];
    if (rankBy === 'avg_views') rows.sort((a, b) => b.avg_views - a.avg_views);
    else if (rankBy === 'activations') rows.sort((a, b) => b.activations - a.activations);
    else if (rankBy === 'clients') rows.sort((a, b) => b.clients - a.clients);
    return rows;
  }, [data, rankBy]);

  const heroActions = (
    <>
      <Select value={rankBy} onValueChange={(v) => setRankBy(v as RankBy)}>
        <SelectTrigger className="h-9 w-[180px] focus-brand"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="avg_views">Rank by · Avg views</SelectItem>
          <SelectItem value="activations">Rank by · Activations</SelectItem>
          <SelectItem value="clients">Rank by · Clients</SelectItem>
        </SelectContent>
      </Select>
      <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformFilter)}>
        <SelectTrigger className="h-9 w-[140px] focus-brand"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All platforms</SelectItem>
          <SelectItem value="X">X</SelectItem>
          <SelectItem value="Telegram">Telegram</SelectItem>
          <SelectItem value="YouTube">YouTube</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={BarChart3}
          kicker="Clients · Campaign Overview"
          kickerDot="sky"
          title="Campaign Overview"
          subtitle="Company-wide, all-time. Who performs and where we over-rely."
          actions={heroActions}
        />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  const { campaign_averages: avg, all_time_totals: total, concentration } = data.kpi;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        kicker="Clients · Campaign Overview"
        kickerDot="sky"
        title="Campaign Overview"
        subtitle="Company-wide, all-time. Who performs and where we over-rely."
        actions={heroActions}
      />

      {/* KPI row 1 — Campaign averages */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 mb-2">Campaign averages</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <KpiCard icon={Eye} label="Avg views per post" value={fmtInt(avg.avg_views_per_post)} accent="brand" />
          <KpiCard icon={BarChart3} label="Avg posts per KOL" value={avg.avg_posts_per_kol} />
          <KpiCard icon={Zap} label="Avg activations per KOL" value={avg.avg_activations_per_kol} accent="purple" />
          <KpiCard icon={TrendingUp} label="Avg engagement rate" value={fmtPct(avg.avg_engagement_rate)} accent="emerald" />
        </div>
      </div>

      {/* KPI row 2 — All-time totals */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 mb-2">All-time totals</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <KpiCard icon={Users} label="Total KOLs" value={fmtInt(total.total_kols)} accent="brand" />
          <KpiCard icon={BarChart3} label="Total posts" value={fmtInt(total.total_posts)} />
          <KpiCard icon={Eye} label="Total views" value={fmtInt(total.total_views)} accent="sky" />
          <KpiCard
            icon={Zap}
            label="Top 10 concentration"
            value={`${concentration.top10_pct}%`}
            sub={concentration.is_amber ? `Amber ≥ ${data.thresholds.top10_concentration_amber_pct}%` : 'Within threshold'}
            accent={concentration.is_amber ? 'amber' : 'gray'}
          />
        </div>
      </div>

      {/* Leaderboard table */}
      <Card className="border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">
            KOL Leaderboard
            <span className="ml-2 text-xs text-gray-500 font-normal">
              · {sortedLeaderboard.length} KOL{sortedLeaderboard.length === 1 ? '' : 's'}
              {platform !== 'all' ? ` on ${platform}` : ''}
            </span>
          </div>
          <div className="text-[11px] text-gray-500">
            Cross-client reuse amber ≥ {data.thresholds.reuse_amber_min_clients} clients
          </div>
        </div>
        {sortedLeaderboard.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No KOLs match"
            description={platform === 'all' ? 'No KOLs have posted yet.' : `No KOLs have posted on ${platform}.`}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-[50px]">#</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">KOL</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-[100px] text-right">Posts</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-[130px] text-right">Avg views</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-[120px] text-right">Eng rate</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-[110px] text-right">Activations</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-[110px] text-right">Clients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLeaderboard.map((r, i) => (
                <TableRow key={r.kol_id} className="border-gray-100">
                  <TableCell className="py-3 text-xs text-gray-500 mono tabular-nums">{i + 1}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      {r.profile_picture_url ? (
                        <img src={r.profile_picture_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-brand text-white text-xs flex items-center justify-center font-bold">
                          {r.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-sm">{r.name}</div>
                        {r.handle && <div className="text-[11px] text-gray-500">@{r.handle}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-right text-sm mono tabular-nums">{fmtInt(r.posts)}</TableCell>
                  <TableCell className="py-3 text-right text-sm mono tabular-nums font-medium">{fmtInt(r.avg_views)}</TableCell>
                  <TableCell className="py-3 text-right text-sm mono tabular-nums">{r.posts > 0 ? fmtPct(r.engagement_rate) : '—'}</TableCell>
                  <TableCell className="py-3 text-right text-sm mono tabular-nums">{r.activations}</TableCell>
                  <TableCell className="py-3 text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <span className="text-sm mono tabular-nums">{r.clients}</span>
                      {r.is_amber_reuse && (
                        <StatusBadge tone="warning" size="sm">Reuse</StatusBadge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {concentration.is_amber && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800">
            <span className="font-semibold">Top-10 concentration is high.</span>{' '}
            Ten KOLs hold {concentration.top10_pct}% of all-time views (amber threshold {data.thresholds.top10_concentration_amber_pct}%). Consider diversifying next lineups.
          </div>
        </div>
      )}
    </div>
  );
}
