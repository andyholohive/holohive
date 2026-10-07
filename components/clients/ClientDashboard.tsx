'use client';

/**
 * Client dashboard body for /clients/[id] — delivery, reach, Korean market,
 * creators, community and this week's lineup for one client.
 *
 * Built from the standard HHP primitives (SectionHeader, KpiCard, Card +
 * CardHeaderEditorial, Table, StatusBadge, EmptyState) and the same charts
 * the client portal's Korea section uses, so it reads like every other page.
 * Each section stands alone: missing data shows an empty state for that
 * section only.
 */

import type { ComponentType, ReactNode } from 'react';
import { SectionHeader } from '@/components/ui/section-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, ColumnChart, BarList } from '@/components/portal/korea/KoreaCharts';
import {
  Eye, FileText, Heart, Radio, TrendingUp, PieChart, Users, MessageSquare, ListChecks, Quote,
} from 'lucide-react';
import type { ClientDashboardData } from '@/lib/clientDashboard';

const HEAD = 'h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500';
const SLOT: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Due', tone: 'warning' },
  posted: { label: 'Posted', tone: 'success' },
  missed: { label: 'Missed', tone: 'danger' },
};
const SENTIMENT: Record<string, { label: string; tone: 'brand' | 'good' | 'bad' | 'mute' }> = {
  question: { label: 'Questions', tone: 'brand' },
  positive: { label: 'Positive', tone: 'good' },
  hype: { label: 'Hype', tone: 'brand' },
  negative: { label: 'Negative', tone: 'bad' },
  fud: { label: 'FUD', tone: 'bad' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Chart-axis week label ("Aug 10"). Axis ticks, not record dates — the mm/dd/yyyy rule is for dates in text. */
const axis = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const num = (n: number) => n.toLocaleString('en-US');
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n));
const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
/** Round axis: a 1/2/5 step that covers the data in 3–5 ticks, so labels read 10K, 20K… not 16.7K. */
function scale(v: number): { max: number; ticks: number[] } {
  const top = Math.max(v * 1.08, 1);
  const raw = top / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const max = Math.ceil(top / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => +(i * step).toFixed(6)) };
}

function Panel({ icon, title, subtitle, action, children }: {
  icon: ComponentType<{ className?: string }>; title: string; subtitle: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-cream-200">
      <CardHeaderEditorial icon={icon} title={title} subtitle={subtitle} action={action} />
      {children}
    </Card>
  );
}

function Empty({ icon, title, description }: { icon: ComponentType<{ className?: string }>; title: string; description: string }) {
  return <EmptyState icon={icon} title={title} description={description} className="py-10" />;
}

export function ClientDashboard({ d }: { d: ClientDashboardData }) {
  const t = d.totals;
  // Leave the running week out of the reads chart until its views are in.
  const done = d.weekly.filter((w) => !w.partial);
  const peak = done.reduce<typeof done[number] | null>((best, w) => (!best || w.reads > best.reads ? w : best), null);
  const buzzLast = d.buzz?.weeks[d.buzz.weeks.length - 1];
  const buzzPrev = d.buzz && d.buzz.weeks.length > 1 ? d.buzz.weeks[d.buzz.weeks.length - 2] : null;
  const shareLast = d.market?.weeks[d.market.weeks.length - 1];
  const sharePeak = d.market?.weeks.reduce((b, w) => (w.sharePct > b.sharePct ? w : b), d.market.weeks[0]);
  const engRate = t && t.reads ? ((t.engagements / t.reads) * 100).toFixed(2) : null;

  return (
    <div className="space-y-6">
      <SectionHeader label="Overview" dot="brand" counter="01 — Campaign totals" first />
      {t ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Eye} label="Total reads" value={num(t.reads)} accent="brand" topAccent
            sub={t.byPlatform.map((p) => `${p.platform} ${compact(p.reads)}`).join(' · ')} />
          <KpiCard icon={FileText} label="Posts delivered" value={num(t.posts)} accent="sky" topAccent
            sub={t.byPlatform.map((p) => `${p.posts} ${p.platform}`).join(' · ')} />
          <KpiCard icon={Heart} label="Engagements" value={num(t.engagements)} accent="emerald" topAccent
            sub={engRate ? `${engRate}% of reads engaged · ${t.creators} creators` : `${t.creators} creators`} />
          {buzzLast ? (
            <KpiCard icon={Radio} label="Korean Telegram buzz" value={buzzLast.mentions} accent="purple" topAccent
              sub={`Mentions, week of ${axis(buzzLast.week)}${buzzPrev ? `, from ${buzzPrev.mentions}` : ''}`}
              trend={buzzPrev ? { delta: buzzLast.mentions - buzzPrev.mentions } : undefined} />
          ) : (
            <KpiCard icon={Users} label="Creators" value={t.creators} accent="purple" topAccent sub="Posted at least once" />
          )}
        </div>
      ) : (
        <Card className="border-cream-200">
          <Empty icon={FileText} title="No posts delivered yet" description="Totals appear once the first post for this client is logged in the delivery log." />
        </Card>
      )}

      <SectionHeader label="Reach" dot="sky" counter="02 — Reads and the Korean market" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel icon={TrendingUp} title="Reads per week" subtitle="Views on every delivered post, by the week it went live"
          action={done.length ? <StatusBadge tone="neutral" size="sm">{done.length} weeks</StatusBadge> : undefined}>
          {done.length > 1 ? (
            <div className="p-5">
              <LineChart label="Reads per week" min={0} {...scale(Math.max(...done.map((w) => w.reads)))} fmt={(v) => (v ? compact(v) : '0')}
                points={done.map((w) => ({ x: axis(w.week), y: w.reads, tip: `Week of ${axis(w.week)}\n${num(w.reads)} reads · ${w.posts} posts` }))} />
              {peak && <p className="mt-3 text-xs text-ink-warm-500">Peak: {compact(peak.reads)} reads the week of {axis(peak.week)}. This week is left out until its views are collected.</p>}
            </div>
          ) : (
            <Empty icon={TrendingUp} title="Not enough weeks yet" description="The trend appears after two weeks of posts." />
          )}
        </Panel>
        <Panel icon={PieChart} title="Korea's share of trading" subtitle="Upbit + Bithumb, by week"
          action={shareLast ? <StatusBadge tone="brand" size="sm">{shareLast.sharePct}% last week</StatusBadge> : undefined}>
          {d.market ? (
            <div className="p-5">
              <ColumnChart label="Korean share of trading by week" min={0} {...scale(Math.max(...d.market.weeks.map((w) => w.sharePct)))} fmt={(v) => `${v}%`}
                points={d.market.weeks.map((w) => ({ x: axis(w.weekEnding), y: w.sharePct, tip: `Week ending ${axis(w.weekEnding)}\n${w.sharePct}% Korean · ${usd(w.volUsd)}` }))} />
              {sharePeak && sharePeak !== shareLast && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-ink-warm-700">
                  <b className="font-semibold text-amber-800">{sharePeak.sharePct}% peak</b> the week ending {axis(sharePeak.weekEnding)}, when Korean exchanges traded {usd(sharePeak.volUsd)}.
                </div>
              )}
            </div>
          ) : (
            <Empty icon={PieChart} title="No Korean market data" description="This client has no Korea Signal report yet, or its token isn't on a Korean exchange." />
          )}
        </Panel>
      </div>

      <SectionHeader label="Creators" dot="violet" counter="03 — Who drove the reads" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel icon={Users} title="Top creators" subtitle={t ? `${d.creators.length} of ${t.creators}, by total views on their posts` : 'By total views on their posts'}>
          {d.creators.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className={HEAD}>Creator</TableHead>
                    <TableHead className={`${HEAD} text-right`}>Posts</TableHead>
                    <TableHead className={`${HEAD} text-right`}>Reads</TableHead>
                    <TableHead className={`${HEAD} text-right`}>Best post</TableHead>
                    <TableHead className={`${HEAD} text-right`}>Engagements</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.creators.map((c, i) => (
                    <TableRow key={c.name} className="border-gray-100">
                      <TableCell className="py-3"><span className="mr-2 font-mono text-xs text-ink-warm-400">{String(i + 1).padStart(2, '0')}</span><span className="font-medium">{c.name}</span></TableCell>
                      <TableCell className="py-3 text-right tabular-nums">{c.posts}</TableCell>
                      <TableCell className="py-3 text-right font-medium tabular-nums">{num(c.reads)}</TableCell>
                      <TableCell className="py-3 text-right tabular-nums text-ink-warm-700">{num(c.best)}</TableCell>
                      <TableCell className="py-3 text-right tabular-nums text-ink-warm-700">{num(c.engagements)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty icon={Users} title="No creators yet" description="Creators appear once their posts are logged." />
          )}
        </Panel>
        <Panel icon={Radio} title="Mentions in Korean Telegram" subtitle="Across tracked Korean channels, beyond our own posts">
          {d.buzz ? (
            <div className="p-5">
              <ColumnChart label="Weekly mentions in Korean Telegram" min={0} {...scale(Math.max(...d.buzz.weeks.map((w) => w.mentions)))} fmt={(v) => String(Math.round(v))}
                points={d.buzz.weeks.map((w) => ({ x: axis(w.week), y: w.mentions, tip: `Week of ${axis(w.week)}\n${w.mentions} mentions · ${w.channels} channels` }))} />
            </div>
          ) : (
            <Empty icon={Radio} title="Not tracked in Korea Signal" description="Add this client to Korea Signal to count its Korean Telegram mentions." />
          )}
        </Panel>
      </div>

      <SectionHeader label="Community" dot="emerald" counter="04 — What Korean readers said" />
      {d.sentiment ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel icon={MessageSquare} title="Comment sentiment"
            subtitle={`${d.sentiment.counted} comments with a clear signal, after filtering ${d.sentiment.filtered} bot and filler replies`}>
            <div className="p-5">
              <BarList fmt={(v) => String(v)} rows={d.sentiment.byLabel.map((s) => ({
                label: SENTIMENT[s.label]?.label ?? s.label, value: s.count,
                tone: SENTIMENT[s.label]?.tone ?? 'mute', strong: s.label === 'positive',
              }))} />
            </div>
          </Panel>
          <Panel icon={Quote} title="In their words" subtitle="Translated from the Korean comments">
            {d.sentiment.quotes.length ? (
              <div className="divide-y divide-cream-100">
                {d.sentiment.quotes.map((q) => (
                  <figure key={q.ko} className="px-5 py-4">
                    <blockquote className="text-[15px] leading-snug text-ink-warm-900" lang="ko">{q.ko}</blockquote>
                    <figcaption className="mt-1 text-[13px] text-ink-warm-700">“{q.en}”</figcaption>
                    <div className="mt-2"><StatusBadge tone={q.label === 'question' ? 'info' : 'success'} size="sm">{SENTIMENT[q.label]?.label ?? q.label}</StatusBadge></div>
                  </figure>
                ))}
              </div>
            ) : (
              <Empty icon={Quote} title="No translated comments yet" description="Quotes appear once comments are scored and translated." />
            )}
          </Panel>
        </div>
      ) : (
        <Card className="border-cream-200">
          <Empty icon={MessageSquare} title="No comments collected yet" description="Comments on this client's Telegram posts are collected daily." />
        </Card>
      )}

      <SectionHeader label="This week" dot="amber" counter={d.lineup ? `05 — Week ${d.lineup.weekNumber}` : '05 — Lineup'} />
      <Panel icon={ListChecks} title={d.lineup?.angles.length ? 'Confirmed lineup' : 'Lineup'}
        subtitle={d.lineup?.campaignName || 'This week’s posts'}
        action={d.lineup && d.lineup.status !== 'none'
          ? <StatusBadge tone={d.lineup.status === 'confirmed' ? 'brand' : d.lineup.status === 'completed' ? 'success' : 'warning'} size="sm">{d.lineup.status.charAt(0).toUpperCase() + d.lineup.status.slice(1)}</StatusBadge>
          : undefined}>
        {d.lineup?.angles.length ? (
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {d.lineup.angles.map((a, i) => (
              <div key={`${a.name}${i}`} className="rounded-lg border border-cream-200 bg-cream-50/60 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Angle {i + 1}</p>
                <p className="mt-1 font-medium">{a.name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.slots.map((s, j) => (
                    <span key={`${s.kol}${j}`} className="inline-flex items-center gap-2 rounded-full border border-cream-200 bg-white py-1 pl-3 pr-1.5 text-[13px]">
                      {s.kol}<StatusBadge tone={SLOT[s.status]?.tone ?? 'neutral'} size="sm">{SLOT[s.status]?.label ?? s.status}</StatusBadge>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={ListChecks} title="No lineup for this week" description="Set one up from the campaign's Lineups tab by Tuesday (Korea time)." />
        )}
        {d.lineup?.previous && (
          <p className="border-t border-cream-100 px-5 py-3 text-[13px] text-ink-warm-700">
            Week {d.lineup.previous.weekNumber}:{' '}
            {(() => {
              const slots = d.lineup.previous.angles.flatMap((a) => a.slots);
              const posted = slots.filter((s) => s.status === 'posted').map((s) => s.kol);
              const missed = slots.filter((s) => s.status === 'missed').map((s) => s.kol);
              const parts = [posted.length && `${posted.join(', ')} posted`, missed.length && `${missed.join(', ')} missed`].filter(Boolean);
              return parts.length ? parts.join(' · ') : `${slots.length} slot${slots.length === 1 ? '' : 's'}, none marked yet`;
            })()}
          </p>
        )}
      </Panel>
    </div>
  );
}
