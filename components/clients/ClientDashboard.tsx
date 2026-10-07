'use client';

/**
 * Client dashboard body for /clients/[id] — the reach story up top, this
 * week's lineup beside it, the KPI strip, then a workspace of tabs (Market /
 * Creators / Community) instead of one long scroll.
 *
 * Layout borrows the campaign page's patterns: crd-feature for the featured
 * card, the underline workspace tabs, Card + CardHeaderEditorial elsewhere.
 * Charts are the client portal's Korea charts. Each section stands alone:
 * missing data shows an empty state for that section only.
 */

import type { ComponentType, ReactNode } from 'react';
import { KpiCard } from '@/components/ui/kpi-card';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, ColumnChart, BarList } from '@/components/portal/korea/KoreaCharts';
import {
  Eye, FileText, Heart, Radio, TrendingUp, PieChart, Users, MessageSquare, ListChecks, Quote, CalendarClock,
} from 'lucide-react';
import type { ClientDashboardData } from '@/lib/clientDashboard';

const HEAD = 'h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500';
const KICKER = 'text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-warm-500';
const TAB_LIST = 'w-full justify-start gap-0.5 bg-transparent p-0 h-auto rounded-none border-b border-cream-200';
const TAB = 'relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t';
const SLOT: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Due', tone: 'warning' },
  posted: { label: 'Posted', tone: 'success' },
  missed: { label: 'Missed', tone: 'danger' },
};
const LINEUP: Record<string, BadgeTone> = { confirmed: 'brand', completed: 'success', draft: 'warning', proposed: 'warning' };
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
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Round axis: a 1/2/5 step that covers the data in 3–5 ticks, so labels read 10K, 20K… not 16.7K. */
function scale(v: number): { max: number; ticks: number[] } {
  const top = Math.max(v * 1.08, 1);
  const raw = top / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const max = Math.ceil(top / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => +(i * step).toFixed(6)) };
}
/** Percent change, rounded; null when there's no base to compare against. */
const pct = (now: number, before: number | undefined) => (before ? Math.round(((now - before) / before) * 100) : null);

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

/** The featured card: total reads as the headline, the weekly trend under it. */
function ReachHero({ d }: { d: ClientDashboardData }) {
  const t = d.totals;
  // Leave the running week out of the trend until its views are in.
  const done = d.weekly.filter((w) => !w.partial);
  const last = done[done.length - 1];
  // Against the 4 weeks before it, not just the one before: a near-empty
  // prior week turns a normal week into "+4000%".
  const base = done.slice(-5, -1);
  const avg = base.length ? base.reduce((n, w) => n + w.reads, 0) / base.length : undefined;
  const change = last ? pct(last.reads, avg) : null;
  const peak = done.reduce<typeof done[number] | null>((best, w) => (!best || w.reads > best.reads ? w : best), null);

  return (
    <div className="crd-feature overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5">
        <div className="min-w-0">
          <p className={`${KICKER} flex items-center gap-2`}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />Reach · all delivered posts
          </p>
          {t ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="display-serif text-[44px] leading-none text-ink-warm-900 tabular-nums">{num(t.reads)}</span>
              <span className="text-sm text-ink-warm-500">reads</span>
              {change !== null && (
                <span className={`text-xs font-medium tabular-nums ${change > 0 ? 'text-emerald-600' : change < 0 ? 'text-rose-600' : 'text-ink-warm-400'}`}>
                  {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change)}% last week vs 4-wk avg
                </span>
              )}
            </div>
          ) : (
            <p className="mt-2 display-serif text-[28px] text-ink-warm-900">No posts yet</p>
          )}
        </div>
        {t && t.byPlatform.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {t.byPlatform.map((p) => (
              <div key={p.platform} className="rounded-lg border border-brand-light/70 bg-white/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">{p.platform}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink-warm-900">
                  {compact(p.reads)} <span className="font-normal text-ink-warm-500">· {p.posts} posts</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {done.length > 1 ? (
        <div className="px-4 pb-3 pt-2">
          <LineChart label="Reads per week" min={0} {...scale(Math.max(...done.map((w) => w.reads)))} fmt={(v) => (v ? compact(v) : '0')}
            points={done.map((w) => ({ x: axis(w.week), y: w.reads, tip: `Week of ${axis(w.week)}\n${num(w.reads)} reads · ${w.posts} posts` }))} />
          {peak && (
            <p className="px-2 pt-1 text-xs text-ink-warm-500">
              Peak {compact(peak.reads)} the week of {axis(peak.week)}. The running week joins once its views are collected.
            </p>
          )}
        </div>
      ) : (
        <Empty icon={TrendingUp} title="Not enough weeks yet" description="The weekly trend appears after two weeks of posts." />
      )}
    </div>
  );
}

/** This week's lineup, compact: progress, then each creator's slot. */
function ThisWeek({ d }: { d: ClientDashboardData }) {
  const l = d.lineup;
  const slots = l?.angles.flatMap((a) => a.slots.map((s) => ({ ...s, angle: a.name }))) ?? [];
  const posted = slots.filter((s) => s.status === 'posted').length;
  const prevSlots = l?.previous?.angles.flatMap((a) => a.slots) ?? [];
  const prevPosted = prevSlots.filter((s) => s.status === 'posted').length;

  return (
    <Card className="flex flex-col overflow-hidden border-cream-200">
      <CardHeaderEditorial icon={ListChecks} title={l ? `This week · Week ${l.weekNumber}` : 'This week'}
        subtitle={l?.campaignName || 'The confirmed lineup'}
        action={l && l.status !== 'none' ? <StatusBadge tone={LINEUP[l.status] ?? 'neutral'} size="sm">{cap(l.status)}</StatusBadge> : undefined} />
      {slots.length ? (
        <div className="flex-1 px-5 pb-4 pt-1">
          <div className="flex items-baseline justify-between text-xs text-ink-warm-500">
            <span><span className="font-semibold text-ink-warm-900 tabular-nums">{posted}</span> of {slots.length} posted</span>
            <span className="tabular-nums">{Math.round((posted / slots.length) * 100)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream-100">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(posted / slots.length) * 100}%` }} />
          </div>
          <ul className="mt-3 divide-y divide-cream-100">
            {slots.map((s, i) => (
              <li key={`${s.kol}${i}`} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-warm-900">{s.kol}</p>
                  <p className="truncate text-xs text-ink-warm-500">{s.angle}</p>
                </div>
                <StatusBadge tone={SLOT[s.status]?.tone ?? 'neutral'} size="sm">{SLOT[s.status]?.label ?? cap(s.status)}</StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex-1">
          <Empty icon={CalendarClock} title="No lineup this week" description="Set one up from the campaign's Lineups tab by Tuesday (Korea time)." />
        </div>
      )}
      {l?.previous && (
        <p className="border-t border-cream-100 bg-cream-50/60 px-5 py-2.5 text-xs text-ink-warm-500">
          Week {l.previous.weekNumber}: <span className="font-medium text-ink-warm-700 tabular-nums">{prevPosted} of {prevSlots.length}</span> posted
        </p>
      )}
    </Card>
  );
}

export function ClientDashboard({ d }: { d: ClientDashboardData }) {
  const t = d.totals;
  const done = d.weekly.filter((w) => !w.partial);
  const last = done[done.length - 1];
  const prev = done[done.length - 2];
  const buzzLast = d.buzz?.weeks[d.buzz.weeks.length - 1];
  const buzzPrev = d.buzz && d.buzz.weeks.length > 1 ? d.buzz.weeks[d.buzz.weeks.length - 2] : null;
  const shareLast = d.market?.weeks[d.market.weeks.length - 1];
  const sharePeak = d.market?.weeks.reduce((b, w) => (w.sharePct > b.sharePct ? w : b), d.market.weeks[0]);
  const engRate = t && t.reads ? ((t.engagements / t.reads) * 100).toFixed(2) : null;
  const topReads = d.creators[0]?.reads || 1;
  const positive = d.sentiment?.byLabel.filter((s) => s.label === 'positive' || s.label === 'hype').reduce((n, s) => n + s.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ReachHero d={d} />
        <ThisWeek d={d} />
      </div>

      {t && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={FileText} label="Posts delivered" value={num(t.posts)} accent="sky" topAccent
            sub={last ? `${last.posts} last week` : 'Across all platforms'}
            trend={last && prev ? { delta: last.posts - prev.posts } : undefined} />
          <KpiCard icon={Heart} label="Engagements" value={num(t.engagements)} accent="emerald" topAccent
            sub={engRate ? `${engRate}% of reads engaged` : undefined} />
          <KpiCard icon={Users} label="Creators" value={t.creators} accent="purple" topAccent
            sub={d.creators[0] ? `Top: ${d.creators[0].name}` : 'Posted at least once'} />
          {buzzLast ? (
            <KpiCard icon={Radio} label="Korean TG mentions" value={buzzLast.mentions} accent="amber" topAccent
              sub={`Week of ${axis(buzzLast.week)} · ${buzzLast.channels} channels`}
              trend={buzzPrev ? { delta: buzzLast.mentions - buzzPrev.mentions } : undefined} />
          ) : (
            <KpiCard icon={Eye} label="Avg reads / post" value={t.posts ? compact(Math.round(t.reads / t.posts)) : '—'} accent="amber" topAccent
              sub="Across every delivered post" />
          )}
        </div>
      )}

      <Tabs defaultValue="market" className="space-y-5">
        <TabsList className={TAB_LIST}>
          <TabsTrigger value="market" className={TAB}>Korean market</TabsTrigger>
          <TabsTrigger value="creators" className={TAB}>
            Creators{d.creators.length > 0 && <span className="ml-1.5 rounded-full bg-brand-light px-1.5 text-[10px] font-semibold text-brand tabular-nums">{t?.creators ?? d.creators.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="community" className={TAB}>
            Community{d.sentiment && <span className="ml-1.5 rounded-full bg-brand-light px-1.5 text-[10px] font-semibold text-brand tabular-nums">{d.sentiment.counted}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="market" className="mt-0">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            <Panel icon={Radio} title="Mentions in Korean Telegram" subtitle="Across tracked Korean channels, beyond our own posts"
              action={buzzLast ? <StatusBadge tone="neutral" size="sm">{buzzLast.mentions} last week</StatusBadge> : undefined}>
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
        </TabsContent>

        <TabsContent value="creators" className="mt-0">
          <Panel icon={Users} title="Top creators" subtitle={t ? `${d.creators.length} of ${t.creators}, by total views on their posts` : 'By total views on their posts'}>
            {d.creators.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                      <TableHead className={HEAD}>Creator</TableHead>
                      <TableHead className={`${HEAD} w-[34%]`}>Reads</TableHead>
                      <TableHead className={`${HEAD} text-right`}>Posts</TableHead>
                      <TableHead className={`${HEAD} text-right`}>Best post</TableHead>
                      <TableHead className={`${HEAD} text-right`}>Engagements</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.creators.map((c, i) => (
                      <TableRow key={c.name} className="border-gray-100">
                        <TableCell className="py-3">
                          <span className="mr-2.5 font-mono text-xs text-ink-warm-400">{String(i + 1).padStart(2, '0')}</span>
                          <span className="font-medium text-ink-warm-900">{c.name}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-100">
                              <div className={`h-full rounded-full ${i === 0 ? 'bg-brand' : 'bg-brand/50'}`} style={{ width: `${Math.max((c.reads / topReads) * 100, 2)}%` }} />
                            </div>
                            <span className="w-16 text-right font-medium tabular-nums text-ink-warm-900">{compact(c.reads)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right tabular-nums">{c.posts}</TableCell>
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
        </TabsContent>

        <TabsContent value="community" className="mt-0">
          {d.sentiment ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <Panel icon={MessageSquare} title="Comment sentiment"
                subtitle={`${d.sentiment.counted} comments with a clear signal · ${d.sentiment.filtered} bot and filler replies filtered`}>
                <div className="space-y-4 p-5">
                  {d.sentiment.counted > 0 && (
                    <div className="flex items-baseline gap-2">
                      <span className="display-serif text-[32px] leading-none text-ink-warm-900 tabular-nums">{Math.round((positive / d.sentiment.counted) * 100)}%</span>
                      <span className="text-xs text-ink-warm-500">positive or hype</span>
                    </div>
                  )}
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
                      <figure key={q.ko} className="accent-l-brand px-5 py-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
