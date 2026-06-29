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
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/ui/kpi-card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, MessageSquare, Crown, TrendingUp, TrendingDown, Minus, BarChart3,
  Hash, Radio, Activity, Megaphone, FileQuestion, Globe, Twitter,
} from 'lucide-react';

type Range = '24h' | '7d' | '30d';

// v11 tone maps — converts inline status pills to <StatusBadge> tones
// so per-page colors stay aligned with the rest of the surface. Pre-TGE
// reads as a "watch this" cue (warning); category is the operational
// classification (brand).
const PROJECT_FLAG_TONES = {
  preTge: 'warning' as BadgeTone,
  category: 'brand' as BadgeTone,
};

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

  // v11: Structural loading skeleton — mirrors the loaded layout
  // (back link + PageHeader shell + segmented control + KPI strip +
  // table card) so the kicker/title don't shift when data arrives.
  if (loading && !project) {
    return (
      <div className="space-y-6">
        {/* v11 breadcrumb back affordance — matches /campaigns/[id]
            ("Campaigns / CAMPAIGN-NAME"). Lives ABOVE the PageHeader
            block; the second segment shows the current project name
            in tracked-out uppercase. 2026-06-05. */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => router.push('/mindshare')}
            className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Mindshare
          </button>
          <span className="text-ink-warm-300">/</span>
          <Skeleton className="h-3 w-32" />
        </div>

        <PageHeader
          icon={BarChart3}
          title="Project"
          subtitle="Channels mentioning this project, ranked by mention count."
          kicker="Measurement · Mindshare · Project"
          kickerDot="emerald"
        />

        {/* Meta-row skeleton + Tabs strip skeleton matches the loaded
            layout shape (Pre-TGE/category chips + range Tabs strip),
            so nothing shifts when data arrives. */}
        <div className="flex items-center gap-2 -mt-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>

        <Skeleton className="h-10 w-[300px] rounded-md" />

        <SectionHeader label="Overview" dot="brand" first />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  // v11: Error / not-found state — PageHeader shell + EmptyState in a
  // Card, matching /intelligence/discovery/[id].
  if (error && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => router.push('/mindshare')}
            className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Mindshare
          </button>
          <span className="text-ink-warm-300">/</span>
          <span className="text-ink-warm-700 font-medium uppercase text-[10px] tracking-[0.2em] truncate">
            Not Found
          </span>
        </div>

        <PageHeader
          icon={BarChart3}
          title="Project not found"
          subtitle="The project you were looking for couldn't be loaded."
          kicker="Measurement · Mindshare · Project"
          kickerDot="emerald"
        />

        <Card className="border-cream-200">
          <EmptyState
            icon={FileQuestion}
            title="Couldn't load this project"
            description={error}
          >
            <Button asChild variant="outline">
              <Link href="/mindshare">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Mindshare
              </Link>
            </Button>
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* v11 breadcrumb back affordance — matches /campaigns/[id]
          ("Campaigns / CAMPAIGN-NAME"). Was previously a ghost
          Button with `Back to Mindshare` copy; the breadcrumb gives
          the user location context ("you are at Mindshare > X")
          instead of just an undo affordance. */}
      <div className="flex items-center gap-1.5 text-xs">
        <button
          onClick={() => router.push('/mindshare')}
          className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Mindshare
        </button>
        <span className="text-ink-warm-300">/</span>
        <span className="text-ink-warm-700 font-medium uppercase text-[10px] tracking-[0.2em] truncate">
          {project?.name ?? '…'}
        </span>
      </div>

      <PageHeader
        icon={BarChart3}
        title={project?.name || 'Project'}
        subtitle={`Channels mentioning this project, ranked by mention count.${project?.description ? ' · ' + project.description : ''}`}
        kicker="Measurement · Mindshare · Project"
        kickerDot="emerald"
      />

      {/* Meta row — Pre-TGE + category chips + twitter/website links.
          Moved out of PageHeader.actions for parity with
          /intelligence/discovery/[id] (links live as a meta row
          BELOW the header, not crammed into the actions slot). */}
      {(project?.is_pre_tge || project?.category || project?.twitter_handle || project?.website_url) && (
        <div className="flex items-center gap-2 flex-wrap -mt-3">
          {project?.is_pre_tge && (
            <StatusBadge tone={PROJECT_FLAG_TONES.preTge} size="sm">Pre-TGE</StatusBadge>
          )}
          {project?.category && (
            <StatusBadge tone={PROJECT_FLAG_TONES.category} size="sm">{project.category}</StatusBadge>
          )}
          {project?.twitter_handle && (
            <a
              href={`https://x.com/${project.twitter_handle.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-ink-warm-500 hover:text-brand"
            >
              <Twitter className="h-3 w-3" /> @{project.twitter_handle.replace(/^@/, '')}
            </a>
          )}
          {project?.website_url && (
            <a
              href={project.website_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-ink-warm-500 hover:text-brand"
            >
              <Globe className="h-3 w-3" /> Website
            </a>
          )}
        </div>
      )}

      {/* v11 Tabs primitive for the range toggle — matches the
          chrome the parent /mindshare uses for its main tab strip
          (`bg-cream-100 p-1 h-auto border border-cream-200` +
          `data-[state=active]:bg-white shadow-card text-brand`).
          Was previously a hand-rolled Button-based segmented
          control with different sizing (h-8 / text-xs) that drifted
          from the canonical chrome. */}
      <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          {(['24h', '7d', '30d'] as Range[]).map(r => (
            <TabsTrigger
              key={r}
              value={r}
              className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm px-4 py-2"
            >
              {RANGE_LABEL[r]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SectionHeader
        label="Overview"
        dot="brand"
        counter={data ? `${items.length} channel${items.length === 1 ? '' : 's'} · ${RANGE_LABEL[range]}` : undefined}
        first
      />

      {/* Summary stats — v11 KpiCard strip. Total Mentions = brand
          (operational); Distinct Channels = sky (informational); Avg
          per Channel = purple (derived); Top Reach = emerald (good
          news / leaderboard). */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={Megaphone}
            label="Total Mentions"
            value={formatNumber(data.total_mentions)}
            accent="brand"
          />
          <KpiCard
            icon={Radio}
            label="Distinct Channels"
            value={String(distinctChannels)}
            accent="sky"
          />
          <KpiCard
            icon={Activity}
            label="Avg per Channel"
            value={avgPerChannel > 0 ? avgPerChannel.toFixed(1) : '—'}
            accent="purple"
          />
          <KpiCard
            icon={Crown}
            label="Top Reach"
            value={formatNumber(topReach)}
            accent="emerald"
          />
        </div>
      )}

      {/* Channels table — v11 Card chrome (border-cream-200) + EmptyState
          + structural skeleton, matches /clients / /intelligence cards. */}
      <Card className="border-cream-200 overflow-hidden">
        {loading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3.5 px-5 border-b border-cream-100 last:border-0">
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-4 flex-1 max-w-[240px]" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={MessageSquare}
            title="Couldn't load channels."
            description={error}
            className="py-12"
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={`No mentions for ${project?.name || 'this project'} in the last ${RANGE_LABEL[range]}.`}
            description="Try a longer range, or check that the project's tracked_keywords match what Korean channels actually post."
            className="py-12"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[60px] text-center">
                  <Hash className="h-3 w-3 inline" />
                </TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Channel</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Mentions</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">% Share</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Δ vs Prior</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Last Mention</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={item.channel_id || `_unknown-${idx}`} className="border-cream-100 hover:bg-cream-50/50">
                  <TableCell className="py-3.5 px-5 text-center">
                    {idx === 0 ? (
                      <Crown className="h-4 w-4 text-amber-500 inline" />
                    ) : (
                      <span className="text-sm text-ink-warm-400 tabular-nums">{idx + 1}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 px-5">
                    <div className="flex flex-col">
                      <span className="font-medium text-ink-warm-900 truncate max-w-xs">
                        {item.channel_name || <span className="text-ink-warm-400 italic">Unlinked chat</span>}
                      </span>
                      {item.channel_username && (
                        <a
                          href={`https://t.me/${item.channel_username.replace(/^@/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-ink-warm-500 hover:text-brand"
                          onClick={(e) => e.stopPropagation()}
                        >
                          @{item.channel_username.replace(/^@/, '')}
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right font-semibold text-ink-warm-900 tabular-nums">
                    {item.mention_count}
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right text-ink-warm-700 tabular-nums">
                    {item.share_pct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right">
                    <TrendBadge delta={item.delta_pct} priorIsZero={item.prior_count === 0 && item.mention_count > 0} />
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-sm text-ink-warm-500">
                    {formatRelative(item.last_mention_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Footnote */}
      <p className="text-xs text-ink-warm-400">
        Counts come from the Korean Telegram channels currently monitored (
        <Link href="/mindshare" className="text-brand hover:text-brand-dark underline">see channel list</Link>
        ). Unlinked-chat rows appear when the bot received a message from a chat
        not yet linked to the registry — backfilling channel_tg_id fixes those.
      </p>
    </div>
  );
}

function TrendBadge({ delta, priorIsZero }: { delta: number; priorIsZero: boolean }) {
  if (priorIsZero) {
    return <StatusBadge tone="success" size="sm">NEW</StatusBadge>;
  }
  if (Math.abs(delta) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-warm-400 tabular-nums">
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(delta).toFixed(0)}%
    </span>
  );
}
