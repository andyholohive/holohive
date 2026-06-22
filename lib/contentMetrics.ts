/**
 * Pure computation helpers for Content Dashboard metrics. Shared by the
 * internal `components/campaign/ContentDashboardOverview.tsx` and the
 * public `app/public/campaigns/[id]/page.tsx` Overview block. Visual
 * JSX stays per-audience (KpiCard accents internally vs gradient Cards
 * publicly) — only the math is shared.
 *
 * Conventions:
 *   - Inputs: array of contents rows. Each row may have nullable
 *     `impressions / likes / comments / retweets / bookmarks` numbers.
 *   - Outputs: plain primitives or `{name, value}[]` ready for KpiCard
 *     and recharts respectively.
 *   - Engagement = likes + comments + retweets + bookmarks (the same
 *     four-field sum used everywhere in this repo).
 *   - Engagement Rate = engagement / impressions × 100, expressed as a
 *     percentage. Returns 0 when impressions is 0 to avoid NaN.
 *   - pending_verification rows are NOT filtered here — the caller
 *     decides whether to pass them in. Public fetch already excludes
 *     them; internal fetch keeps them so the team can verify.
 */

export interface ContentMetricRow {
  impressions?: number | null;
  likes?: number | null;
  comments?: number | null;
  retweets?: number | null;
  bookmarks?: number | null;
  platform?: string | null;
  activation_date?: string | null;
}

export interface ContentTotals {
  views: number;
  reactions: number;
  replies: number;
  shares: number;
  saves: number;
  engagement: number;
}

const sum = (rows: ContentMetricRow[], key: keyof ContentMetricRow) =>
  rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

export function computeContentTotals(rows: ContentMetricRow[]): ContentTotals {
  const views = sum(rows, 'impressions');
  const reactions = sum(rows, 'likes');
  const replies = sum(rows, 'comments');
  const shares = sum(rows, 'retweets');
  const saves = sum(rows, 'bookmarks');
  return {
    views,
    reactions,
    replies,
    shares,
    saves,
    engagement: reactions + replies + shares + saves,
  };
}

/** Engagement rate as a percentage (e.g. 0.56 for 0.56%). 0 when views is 0. */
export function computeEngagementRate(rows: ContentMetricRow[]): number {
  const t = computeContentTotals(rows);
  return t.views > 0 ? (t.engagement / t.views) * 100 : 0;
}

/**
 * Cumulative views over time. Groups rows by activation_date, sums their
 * impressions, sorts chronologically, then walks the series to produce a
 * running total. Returns `[{date, impressions}]` ready for recharts.
 *
 * The `formatDate` callback is injected so callers can keep their own
 * display formatting (mm/dd/yyyy via lib/dateFormat or a custom
 * formatter). Rows with null activation_date are dropped.
 */
export function computeImpressionsByDateCumulative(
  rows: ContentMetricRow[],
  formatDate: (iso: string) => string,
): Array<{ date: string; impressions: number }> {
  const byDate = rows.reduce((acc, r) => {
    if (r.activation_date) {
      acc[r.activation_date] = (acc[r.activation_date] || 0) + (Number(r.impressions) || 0);
    }
    return acc;
  }, {} as Record<string, number>);

  const sorted = Object.entries(byDate).sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());

  let running = 0;
  return sorted.map(([date, impressions]) => {
    running += impressions;
    return { date: formatDate(date), impressions: running };
  });
}

/**
 * Views grouped by platform. Returns `[{platform, impressions, name}]`
 * where `name` mirrors `platform` (recharts Pie wants a `name` key for
 * its default tooltip). Rows with null platform fall under "Unknown".
 */
export function computeImpressionsByPlatform(
  rows: ContentMetricRow[],
): Array<{ platform: string; impressions: number; name: string }> {
  const byPlatform = rows.reduce((acc, r) => {
    const p = r.platform || 'Unknown';
    acc[p] = (acc[p] || 0) + (Number(r.impressions) || 0);
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(byPlatform).map(([platform, impressions]) => ({
    platform,
    impressions,
    name: platform,
  }));
}
