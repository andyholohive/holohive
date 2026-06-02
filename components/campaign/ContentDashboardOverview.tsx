'use client';

/**
 * ContentDashboardOverview — read-only "Overview" view of the Content
 * Dashboard tab. Renders the 5-card KPI hero strip (Impressions /
 * Comments / Retweets / Likes / Bookmarks) with platform-native
 * engagement icons + the Average Engagement Rate single-stat panel
 * + a recharts cumulative-impressions line chart.
 *
 * Extracted from `app/campaigns/[id]/page.tsx`
 * (`contentsViewMode === 'overview'` branch) on 2026-06-02. Same
 * shape as KolDashboardOverview / BudgetOverview: reads `contents`
 * from `useCampaignDetail()`, no setters, no internal state.
 */

import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Bookmark, Eye, Heart, MessageSquare, Repeat2 } from 'lucide-react';
import { KpiCard } from '@/components/ui/kpi-card';
import { BRAND_DARK_HEX, BRAND_HEX, getPlatformIcon } from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';

export function ContentDashboardOverview() {
  const { contents } = useCampaignDetail();

  return (
    <>
                  <div className="space-y-6">
                    {/* Hero KPI strip — Total Impressions / Comments /
                        Retweets / Likes / Bookmarks. Uses the shared
                        KpiCard primitive so this strip reads with the
                        same rhythm as /dashboard, /lists Access &
                        Visits, /analytics. Accent palette differentiates
                        the five engagement metrics. */}
                    {(() => {
                      const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                      const totalComments    = contents.reduce((sum, content) => sum + (content.comments    || 0), 0);
                      const totalRetweets    = contents.reduce((sum, content) => sum + (content.retweets    || 0), 0);
                      const totalLikes       = contents.reduce((sum, content) => sum + (content.likes       || 0), 0);
                      const totalBookmarks   = contents.reduce((sum, content) => sum + (content.bookmarks   || 0), 0);
                      const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : n.toLocaleString();
                      return (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                          {/* Icons swapped to platform-native engagement
                              metaphors so the strip reads correctly at a
                              glance: Eye = impressions/views, MessageSquare
                              = comments, Repeat2 = retweets/reposts, Heart
                              = likes, Bookmark = bookmarks. */}
                          <KpiCard icon={Eye}            label="Impressions" value={fmt(totalImpressions)} accent="brand"   />
                          <KpiCard icon={MessageSquare}  label="Comments"    value={fmt(totalComments)}    accent="sky"     />
                          <KpiCard icon={Repeat2}        label="Retweets"    value={fmt(totalRetweets)}    accent="purple"  />
                          <KpiCard icon={Heart}          label="Likes"       value={fmt(totalLikes)}       accent="rose"    />
                          <KpiCard icon={Bookmark}       label="Bookmarks"   value={fmt(totalBookmarks)}   accent="emerald" />
                        </div>
                      );
                    })()}

                    {/* Average Engagement Rate — single-stat panel
                        styled the same way as the inner Card primitives
                        used across the page (display-serif title +
                        cream-200 hairline + shadow-card). */}
                    <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Average Engagement Rate</h3>
                      </div>
                      {(() => {
                        const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                        const totalEngagements = contents.reduce((sum, content) =>
                          sum + (content.likes || 0) + (content.comments || 0) + (content.retweets || 0) + (content.bookmarks || 0), 0);
                        const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0;
                        return (
                          <p className="text-[28px] font-semibold text-ink-warm-900 tabular-nums leading-none" style={{ letterSpacing: '-0.03em' }}>
                            {engagementRate.toFixed(2)}%
                          </p>
                        );
                      })()}
                      <p className="text-xs text-ink-warm-500 mt-3">
                        ER = <span className="mono">(Likes + Comments + Retweets + Bookmarks) / Impressions</span>
                      </p>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Total Impressions */}
                      <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Total Impressions</h3>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={(() => {
                                // Group content by activation date and sum impressions
                                const impressionsByDate = contents.reduce((acc, content) => {
                                  if (content.activation_date) {
                                    const date = content.activation_date;
                                    if (!acc[date]) {
                                      acc[date] = 0;
                                    }
                                    acc[date] += content.impressions || 0;
                                  }
                                  return acc;
                                }, {} as Record<string, number>);

                                // Sort by date and calculate cumulative impressions
                                const sortedEntries = Object.entries(impressionsByDate).sort(([dateA], [dateB]) =>
                                  new Date(dateA).getTime() - new Date(dateB).getTime()
                                ) as [string, number][];

                                let cumulativeImpressions = 0;
                                return sortedEntries.map(([date, impressions]) => {
                                  cumulativeImpressions += impressions;
                                  return {
                                    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                    impressions: cumulativeImpressions
                                  };
                                });
                              })()}
                              margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                              <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                              />
                              <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b' }}
                                tickFormatter={(value) => value.toLocaleString()}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  fontSize: '14px'
                                }}
                                formatter={(value: number) => [value.toLocaleString(), 'Cumulative Impressions']}
                                labelFormatter={(label: string) => `Date: ${label}`}
                              />
                              <Line
                                type="monotone"
                                dataKey="impressions"
                                stroke={BRAND_HEX}
                                strokeWidth={3}
                                dot={{ fill: BRAND_HEX, strokeWidth: 2, r: 4 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Impressions by Platform */}
                      <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Impressions by Platform</h3>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
                              <Pie
                                data={(() => {
                                  const platformImpressions = contents.reduce((acc, content) => {
                                    const platform = content.platform || 'Unknown';
                                    if (!acc[platform]) {
                                      acc[platform] = 0;
                                    }
                                    acc[platform] += content.impressions || 0;
                                    return acc;
                                  }, {} as Record<string, number>);

                                  return Object.entries(platformImpressions).map(([platform, impressions]) => ({
                                    platform,
                                    impressions,
                                    name: platform
                                  }));
                                })()}
                                cx="50%"
                                cy="50%"
                                labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                                label={(props: any) => {
                                  const { cx, cy, midAngle, outerRadius, platform, impressions } = props;
                                  const RADIAN = Math.PI / 180;
                                  const radius = outerRadius + 35;
                                  const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                  const y = cy + radius * Math.sin(-midAngle * RADIAN);

                                  return (
                                    <g>
                                      <foreignObject x={x - 50} y={y - 18} width={100} height={36}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px' }}>
                                            {getPlatformIcon(platform)}
                                          </div>
                                          <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                            {impressions.toLocaleString()}
                                          </div>
                                        </div>
                                      </foreignObject>
                                    </g>
                                  );
                                }}
                                outerRadius={100}
                                dataKey="impressions"
                              >
                                {(() => {
                                  const platformImpressions = contents.reduce((acc, content) => {
                                    const platform = content.platform || 'Unknown';
                                    if (!acc[platform]) {
                                      acc[platform] = 0;
                                    }
                                    acc[platform] += content.impressions || 0;
                                    return acc;
                                  }, {} as Record<string, number>);

                                  // Brand-teal gradient ramp — start at
                                  // brand, step down through brand-dark
                                  // toward the brand-deep ink anchor.
                                  const colors = [BRAND_HEX, BRAND_DARK_HEX, '#1e4a5a', '#0f2d3a'];
                                  return Object.entries(platformImpressions).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                  ));
                                })()}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  fontSize: '14px'
                                }}
                                formatter={(value: number, name: string, props: any) => {
                                  const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                                  const percentage = totalImpressions > 0 ? ((value / totalImpressions) * 100).toFixed(1) : 0;
                                  return [
                                    `${value.toLocaleString()} (${percentage}%)`,
                                    'Impressions'
                                  ];
                                }}
                                labelFormatter={(label: string) => `Platform: ${label}`}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>
    </>
  );
}
