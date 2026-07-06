'use client';

/**
 * KolDashboardOverview — the read-only "Overview" view of the KOL
 * Dashboard tab. Renders a 4-card KPI strip (Total KOLs / Avg
 * Followers / Unique Platforms / Regions) plus two recharts panels
 * (Platform distribution + Region distribution).
 *
 * Extracted from `app/campaigns/[id]/page.tsx` (KOL Dashboard tab,
 * `kolViewMode === 'overview'` branch) on 2026-06-02. Hidden KOLs
 * are excluded from every count + chart — they're intentionally
 * archived from the active roster (still queryable in the Hidden
 * tab on the table view), so including them in totals / averages /
 * platform-mix would misrepresent the campaign's actual footprint.
 *
 * Read-only: pulls `campaignKOLs` from `useCampaignDetail()`, no
 * setters needed, no internal state. The single side-effect is the
 * fact that recharts owns its own animation lifecycle internally.
 */

import { BarChart3, Flag, Globe, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { KpiCard } from '@/components/ui/kpi-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KOLService } from '@/lib/kolService';
import { BRAND_HEX } from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';

export function KolDashboardOverview() {
  const { campaignKOLs, contents } = useCampaignDetail();
  const dashboardKOLs = campaignKOLs.filter(k => !k.hidden);

  // ─── KOL Performance Leaderboard ─────────────────────────────────
  // Moved back into the KOL Dashboard Overview per Andy 2026-06-19
  // (had briefly lived inside the Content Dashboard Overview).
  // Aggregates `contents` per campaign_kol_id and joins back to
  // dashboardKOLs so we can show name, platform, and (when present)
  // profile picture.
  type LeaderboardRow = {
    id: string;
    name: string;
    platform: string[] | null;
    avatar: string | null;
    contentCount: number;
    views: number;
    engagements: number;
  };
  const byKol = new Map<string, { contentCount: number; views: number; engagements: number }>();
  for (const c of contents) {
    const key = c.campaign_kols_id;
    if (!key) continue;
    const cur = byKol.get(key) || { contentCount: 0, views: 0, engagements: 0 };
    cur.contentCount += 1;
    cur.views += c.impressions || 0;
    cur.engagements += (c.likes || 0) + (c.comments || 0) + (c.retweets || 0) + (c.bookmarks || 0);
    byKol.set(key, cur);
  }
  const leaderboardRows: LeaderboardRow[] = dashboardKOLs
    .map(ck => {
      const stats = byKol.get(ck.id) || { contentCount: 0, views: 0, engagements: 0 };
      return {
        id: ck.id,
        name: ck.master_kol?.name || 'Unknown KOL',
        platform: ck.master_kol?.platform ?? null,
        avatar: (ck.master_kol as any)?.profile_picture_url ?? null,
        contentCount: stats.contentCount,
        views: stats.views,
        engagements: stats.engagements,
      };
    })
    .sort((a, b) => b.views - a.views);
  const totalLeaderboardViews = leaderboardRows.reduce((sum, r) => sum + r.views, 0);
  const formatCompact = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    return n.toLocaleString();
  };

  // ── KPI metrics ─────────────────────────────────────────────────
  const totalKols = dashboardKOLs.length;
  const avgFollowers = (() => {
    if (dashboardKOLs.length === 0) return '0';
    const total = dashboardKOLs.reduce((sum, kol) => sum + (kol.master_kol.followers || 0), 0);
    return KOLService.formatFollowers(Math.round(total / dashboardKOLs.length));
  })();
  const platformSet = (() => {
    const s = new Set<string>();
    dashboardKOLs.forEach((kol) => {
      (kol.master_kol.platform || []).forEach((p: string) => s.add(p));
    });
    return s;
  })();
  const regionSet = (() => {
    const s = new Set<string>();
    dashboardKOLs.forEach((kol) => {
      if (kol.master_kol.region) s.add(kol.master_kol.region);
    });
    return s;
  })();

  // ── Chart data ───────────────────────────────────────────────────
  const platformChartData = (() => {
    const counts: { [key: string]: number } = {};
    dashboardKOLs.forEach(kol => {
      if (kol.master_kol.platform) {
        kol.master_kol.platform.forEach((platform: string) => {
          counts[platform] = (counts[platform] || 0) + 1;
        });
      }
    });
    return Object.entries(counts).map(([platform, count]) => ({ platform, count }));
  })();

  const regionChartData = (() => {
    const counts: { [key: string]: number } = {};
    dashboardKOLs.forEach(kol => {
      if (kol.master_kol.region) {
        counts[kol.master_kol.region] = (counts[kol.master_kol.region] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([region, count]) => ({ region, count }));
  })();

  // Color resolvers — kept local to the chart row since they're
  // category-coloring helpers tied to this specific surface (per the
  // CLAUDE.md "Known exception" note about /kols category colors).
  const platformColor = (platform: string): string => {
    if (platform === 'X') return '#000000';
    if (platform === 'Telegram') return '#0088cc';
    if (platform === 'YouTube') return '#FF0000';
    return BRAND_HEX;
  };

  const regionColor = (region: string): string => {
    if (region === 'China') return '#de2910';
    if (region === 'Korea') return '#cd2e3a';
    if (region === 'Vietnam') return '#da251d';
    if (region === 'Turkey') return '#e30a17';
    if (region === 'Philippines') return '#0038a8';
    if (region === 'Brazil') return '#009c3b';
    if (region === 'Global') return '#1e40af';
    if (region === 'SEA') return '#059669';
    return BRAND_HEX;
  };

  const chartTooltipStyle = {
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    fontSize: '14px',
  };

  return (
    <div className="space-y-6">
      {/* KPI strip — same KpiCard primitive as /dashboard,
          /lists Access & Visits, /analytics. */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users}     label="Total KOLs"     value={totalKols}    accent="brand"   />
        <KpiCard icon={BarChart3} label="Avg Followers"  value={avgFollowers} accent="sky"     />
        <KpiCard icon={Globe}     label={platformSet.size === 1 ? 'Unique Platform' : 'Unique Platforms'} value={platformSet.size} accent="emerald" />
        <KpiCard icon={Flag}      label={regionSet.size === 1 ? 'Region' : 'Regions'}                     value={regionSet.size}    accent="purple"  />
      </div>

      {/* Charts row — Platform + Region distribution hidden per Andy
          2026-07-06. Kept in code (behind a false gate) in case the
          breakdown is wanted again; the KPI strip above still surfaces
          the Unique Platforms / Regions counts. */}
      {false && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Distribution */}
        <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Distribution of KOLs by Platform</h3>
              <p className="text-sm text-ink-warm-500 mt-1">Breakdown of KOLs by social platform</p>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformChartData} margin={{ top: 30, right: 40, left: 40, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="platform"
                  axisLine={false}
                  tickLine={false}
                  tick={({ x, y, payload }: any) => (
                    <g transform={`translate(${x},${y})`}>
                      {payload.value === 'X' ? (
                        <text x={0} y={0} dy={16} textAnchor="middle" fill="#000000" fontSize={14} fontWeight="bold">𝕏</text>
                      ) : payload.value === 'Telegram' ? (
                        <g>
                          <svg x={-8} y={0} width={16} height={16} viewBox="0 0 24 24" fill="#0088cc">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                          </svg>
                        </g>
                      ) : (
                        <text x={0} y={0} dy={16} textAnchor="middle" fill="#64748b" fontSize={12}>{payload.value}</text>
                      )}
                    </g>
                  )}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number) => [value, 'Count']}
                  labelFormatter={(label: string) => `Platform: ${label}`}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {platformChartData.map(entry => (
                    <Cell key={`cell-${entry.platform}`} fill={platformColor(entry.platform)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Region Distribution */}
        <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">KOLs by Region</h3>
              <p className="text-sm text-ink-warm-500 mt-1">Geographic distribution of KOLs</p>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionChartData} margin={{ top: 30, right: 40, left: 40, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="region" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number) => [value, 'Count']}
                  labelFormatter={(label: string) => `Region: ${label}`}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {regionChartData.map(entry => (
                    <Cell key={`cell-${entry.region}`} fill={regionColor(entry.region)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      )}

      {/* ── KOL Performance Leaderboard ────────────────────────────
          Lives on the KOL Dashboard Overview per Andy 2026-06-19.
          Uses the shadcn Table primitive + bg-cream-50/80 header so
          it reads with the same rhythm as the KOL Dashboard Table
          view. Sorted by views desc; unactivated KOLs sink to the
          bottom. */}
      <div className="bg-white rounded-[14px] border border-cream-200 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200">
          <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">KOL Performance Leaderboard</h3>
          <p className="text-xs text-ink-warm-500 mt-0.5">Sorted by views — the highest-impact KOL is row 1.</p>
        </div>
        {leaderboardRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-warm-500">No KOLs activated yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-12">#</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">KOL</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right w-24">Content</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right w-28">Views</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right w-32">Engagement</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[28%]">Share of Views</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboardRows.map((r, idx) => {
                const sharePct = totalLeaderboardViews > 0 ? (r.views / totalLeaderboardViews) * 100 : 0;
                return (
                  <TableRow key={r.id} className="border-b border-cream-100 hover:bg-cream-50/40">
                    <TableCell className="py-3 px-5 text-ink-warm-500 tabular-nums font-medium">{idx + 1}</TableCell>
                    <TableCell className="py-3 px-5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {r.avatar ? (
                          <img src={r.avatar} alt={r.name} className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-cream-100 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-ink-warm-900 truncate">{r.name}</div>
                          {r.platform && r.platform.length > 0 && (
                            <div className="text-[10px] text-ink-warm-500 uppercase tracking-wider truncate">
                              {r.platform.join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-5 text-right tabular-nums text-ink-warm-700">{r.contentCount}</TableCell>
                    <TableCell className="py-3 px-5 text-right tabular-nums font-medium text-ink-warm-900">{formatCompact(r.views)}</TableCell>
                    <TableCell className="py-3 px-5 text-right tabular-nums text-ink-warm-700">{formatCompact(r.engagements)}</TableCell>
                    <TableCell className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-cream-100 overflow-hidden">
                          <div
                            className="h-full"
                            style={{ backgroundColor: BRAND_HEX, width: `${Math.max(2, Math.min(100, sharePct))}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-ink-warm-500 tabular-nums w-12 text-right">{sharePct.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
