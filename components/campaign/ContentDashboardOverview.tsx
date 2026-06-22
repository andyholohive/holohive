'use client';

/**
 * ContentDashboardOverview — read-only "Overview" view of the Content
 * Dashboard tab. Renders the 5-card KPI hero strip (Views / Replies /
 * Shares / Reactions / Saves) with platform-native engagement icons +
 * the Average Engagement Rate single-stat panel + a recharts
 * cumulative-views line chart + a views-by-platform pie chart.
 *
 * Extracted from `app/campaigns/[id]/page.tsx`
 * (`contentsViewMode === 'overview'` branch) on 2026-06-02. Math layer
 * extracted to `lib/contentMetrics.ts` on 2026-06-19 — the same helpers
 * back the public campaign Overview, so totals + ER + chart shapes can
 * never silently drift. JSX stays specific to the internal audience
 * (compact KpiCard accents); the public Overview owns its own gradient-
 * Card markup.
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
import { Activity, Bookmark, Eye, Heart, MessageSquare, Repeat2 } from 'lucide-react';
import { KpiCard } from '@/components/ui/kpi-card';
import { BRAND_DARK_HEX, BRAND_HEX, getPlatformIcon } from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { formatDate } from '@/lib/dateFormat';
import {
  computeContentTotals,
  computeEngagementRate,
  computeImpressionsByDateCumulative,
  computeImpressionsByPlatform,
} from '@/lib/contentMetrics';

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : n.toLocaleString();

export function ContentDashboardOverview() {
  const { contents } = useCampaignDetail();

  const totals = computeContentTotals(contents);
  const engagementRate = computeEngagementRate(contents);
  const lineData = computeImpressionsByDateCumulative(contents, formatDate);
  const pieData = computeImpressionsByPlatform(contents);

  return (
    <div className="space-y-6">
      {/* Hero KPI strip — Views / Replies / Shares / Reactions /
          Engagement / Saves. Platform-native vocab per Andy 2026-06-19.
          "Engagement" added 2026-06-19 to match the public view's
          6-card layout (Reactions + Replies + Shares + Saves rollup).
          Icons: Eye = views, MessageSquare = replies, Repeat2 = shares,
          Heart = reactions, Activity = engagement, Bookmark = saves. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Eye}            label="Views"      value={fmt(totals.views)}      accent="brand"   />
        <KpiCard icon={MessageSquare}  label="Replies"    value={fmt(totals.replies)}    accent="sky"     />
        <KpiCard icon={Repeat2}        label="Shares"     value={fmt(totals.shares)}     accent="purple"  />
        <KpiCard icon={Heart}          label="Reactions"  value={fmt(totals.reactions)}  accent="rose"    />
        <KpiCard icon={Activity}       label="Engagement" value={fmt(totals.engagement)} accent="amber"   />
        <KpiCard icon={Bookmark}       label="Saves"      value={fmt(totals.saves)}      accent="emerald" />
      </div>

      {/* Average Engagement Rate — single-stat panel. */}
      <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Average Engagement Rate</h3>
        </div>
        <p className="text-[28px] font-semibold text-ink-warm-900 tabular-nums leading-none" style={{ letterSpacing: '-0.03em' }}>
          {engagementRate.toFixed(2)}%
        </p>
        <p className="text-xs text-ink-warm-500 mt-3">
          ER = <span className="mono">(Reactions + Replies + Shares + Saves) / Views</span>
        </p>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Total Views — cumulative line */}
        <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Total Views</h3>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 30, right: 40, left: 40, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => value.toLocaleString()} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    fontSize: '14px',
                  }}
                  formatter={(value: number) => [value.toLocaleString(), 'Cumulative Views']}
                  labelFormatter={(label: string) => `Date: ${label}`}
                />
                <Line type="monotone" dataKey="impressions" stroke={BRAND_HEX} strokeWidth={3} dot={{ fill: BRAND_HEX, strokeWidth: 2, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Views by Platform — pie */}
        <div className="bg-white p-8 rounded-[14px] border border-cream-200 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Views by Platform</h3>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
                <Pie
                  data={pieData}
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
                  {pieData.map((_, index) => {
                    // Brand-teal gradient ramp — start at brand, step down through brand-dark
                    // toward the brand-deep ink anchor.
                    const colors = [BRAND_HEX, BRAND_DARK_HEX, '#1e4a5a', '#0f2d3a'];
                    return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                  })}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    fontSize: '14px',
                  }}
                  formatter={(value: number) => {
                    const percentage = totals.views > 0 ? ((value / totals.views) * 100).toFixed(1) : 0;
                    return [`${value.toLocaleString()} (${percentage}%)`, 'Views'];
                  }}
                  labelFormatter={(label: string) => `Platform: ${label}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}
