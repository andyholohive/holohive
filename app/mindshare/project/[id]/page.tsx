'use client';

/**
 * Mindshare Storyteller — per-project page showing the top Telegram
 * channels that mention this project, ranked by mention count.
 *
 * Inspired by 3ridge's Storyteller dashboard: answers "who is actually
 * talking about this project, and how loud?" — actionable for KOL
 * outreach (which channels are organically discussing X already?) and
 * mindshare diagnosis (is interest concentrated in 1 channel, or
 * spread across many?).
 *
 * Data: /api/mindshare/projects/[id]/channels — same project_id +
 * tg_mentions pivot, just grouped by channel instead of by project.
 *
 * Time range matches the main leaderboard's 24h / 7d / 30d toggle.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft, ExternalLink, MessageSquare, Crown, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';

type Range = '24h' | '7d' | '30d';

type ProjectMeta = {
  id: string;
  name: string;
  client_id: string | null;
  category: string | null;
  is_pre_tge: boolean;
  twitter_handle: string | null;
  website_url: string | null;
  description: string | null;
  is_active: boolean;
};

type StorytellerItem = {
  channel_id: string | null;
  channel_name: string | null;
  channel_username: string | null;
  mention_count: number;
  share_pct: number;
  prior_count: number;
  delta_pct: number;
  last_mention_at: string | null;
};

type StorytellerResponse = {
  project: ProjectMeta;
  range: Range;
  period: { from: string; to: string };
  prior_period: { from: string; to: string };
  total_mentions: number;
  items: StorytellerItem[];
};

const RANGE_LABEL: Record<Range, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

const formatNumber = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

const formatRelative = (iso: string | null) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

export default function StorytellerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [range, setRange] = useState<Range>('7d');
  const [data, setData] = useState<StorytellerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/mindshare/projects/${id}/channels?range=${range}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || 'Failed'))))
      .then(json => { if (!cancelled) setData(json); })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, range]);

  const project = data?.project;
  const items = data?.items || [];
  const topReach = items.length > 0 ? items[0].mention_count : 0;
  const distinctChannels = items.filter(i => i.mention_count > 0).length;
  const avgPerChannel = distinctChannels > 0 && data
    ? (data.total_mentions / distinctChannels)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/mindshare"
          className="inline-flex items-center text-xs text-gray-500 hover:text-brand mb-1 transition-colors"
        >
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back to Mindshare
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold text-gray-900 truncate">
                {loading && !project ? 'Loading…' : project?.name || 'Project'}
              </h2>
              {project?.is_pre_tge && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">Pre-TGE</Badge>
              )}
              {project?.category && (
                <Badge variant="secondary" className="bg-brand/10 text-brand text-[10px]">{project.category}</Badge>
              )}
            </div>
            <p className="text-sm text-gray-600">
              Channels mentioning this project, ranked by mention count.
              {project?.description && <> · <span className="text-gray-400">{project.description}</span></>}
            </p>
            {(project?.twitter_handle || project?.website_url) && (
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                {project.twitter_handle && (
                  <a
                    href={`https://x.com/${project.twitter_handle.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-brand"
                  >
                    @{project.twitter_handle.replace(/^@/, '')}
                  </a>
                )}
                {project.website_url && (
                  <a
                    href={project.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-brand"
                  >
                    <ExternalLink className="h-3 w-3" /> Website
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Time range toggle — matches the leaderboard's UX */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['24h', '7d', '30d'] as Range[]).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              range === r
                ? 'bg-white text-brand shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Mentions" value={formatNumber(data.total_mentions)} />
          <StatCard label="Distinct Channels" value={String(distinctChannels)} />
          <StatCard label="Avg per Channel" value={avgPerChannel > 0 ? avgPerChannel.toFixed(1) : '—'} />
          <StatCard label="Top Reach" value={formatNumber(topReach)} />
        </div>
      )}

      {/* Channels table */}
      <Card className="border-0 shadow-md rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-brand mx-auto" />
            <p className="text-sm text-gray-500 mt-3">Loading channels…</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-rose-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              No mentions for {project?.name} in the last {RANGE_LABEL[range]}.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Try a longer range, or check that the project's tracked_keywords match what
              Korean channels actually post.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[60px] text-center">#</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Mentions</TableHead>
                <TableHead className="text-right">% Share</TableHead>
                <TableHead className="text-right">Δ vs Prior</TableHead>
                <TableHead>Last Mention</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={item.channel_id || `_unknown-${idx}`} className="hover:bg-gray-50/50">
                  <TableCell className="text-center">
                    {idx === 0 ? (
                      <Crown className="h-4 w-4 text-amber-500 inline" />
                    ) : (
                      <span className="text-sm text-gray-400">{idx + 1}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900 truncate max-w-xs">
                        {item.channel_name || <span className="text-gray-400 italic">Unlinked chat</span>}
                      </span>
                      {item.channel_username && (
                        <a
                          href={`https://t.me/${item.channel_username.replace(/^@/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-gray-500 hover:text-brand"
                          onClick={(e) => e.stopPropagation()}
                        >
                          @{item.channel_username.replace(/^@/, '')}
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-gray-900">
                    {item.mention_count}
                  </TableCell>
                  <TableCell className="text-right text-gray-600">
                    {item.share_pct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <TrendBadge delta={item.delta_pct} priorIsZero={item.prior_count === 0 && item.mention_count > 0} />
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatRelative(item.last_mention_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Footnote */}
      <p className="text-xs text-gray-400">
        Counts come from the Korean Telegram channels currently monitored (
        <Link href="/mindshare" className="hover:text-brand underline">see channel list</Link>
        ). Unlinked-chat rows appear when the bot received a message from a chat
        not yet linked to the registry — backfilling channel_tg_id fixes those.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-0 shadow-sm rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </Card>
  );
}

function TrendBadge({ delta, priorIsZero }: { delta: number; priorIsZero: boolean }) {
  if (priorIsZero) {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">NEW</span>;
  }
  if (Math.abs(delta) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(delta).toFixed(0)}%
    </span>
  );
}
