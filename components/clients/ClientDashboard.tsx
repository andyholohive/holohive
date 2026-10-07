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
  Trophy, Gauge, Megaphone, Wallet, ArrowLeftRight, Activity,
} from 'lucide-react';
import type { ClientDashboardData } from '@/lib/clientDashboard';
import { ordinal } from '@/lib/koreaScan/narrative';

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

type Verdict = 'strong' | 'steady' | 'watch' | 'info';
const VERDICT: Record<Verdict, { label: string; tone: BadgeTone }> = {
  strong: { label: 'Strong', tone: 'success' },
  steady: { label: 'Steady', tone: 'neutral' },
  watch: { label: 'Watch', tone: 'warning' },
  info: { label: 'Info', tone: 'slate' },
};
interface Signal { key: string; icon: ComponentType<{ className?: string }>; label: string; value: string; detail: string; verdict: Verdict }

/** Change over the last 4 complete weeks against the 4 before. */
function fourWeek(done: ClientDashboardData['weekly'], f: (w: ClientDashboardData['weekly'][number]) => number) {
  if (done.length < 8) return null;
  const a = done.slice(-4).reduce((n, w) => n + f(w), 0);
  const b = done.slice(-8, -4).reduce((n, w) => n + f(w), 0);
  return b ? Math.round(((a - b) / b) * 100) : null;
}
const byChange = (c: number | null, band = 15): Verdict => (c === null ? 'info' : c > band ? 'strong' : c < -band ? 'watch' : 'steady');
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

/**
 * The evaluation read: one line per signal, each with a verdict and the
 * evidence behind it. Thresholds are deliberately simple and stated in the
 * detail line so nobody has to guess why something says Watch.
 */
function signalsFor(d: ClientDashboardData): Signal[] {
  const out: Signal[] = [];
  const done = d.weekly.filter((w) => !w.partial);
  const p = d.placement;
  if (p) {
    const r = p.categoryRank ?? p.rank, of = p.categoryOf ?? p.of;
    const pctile = r / of;
    out.push({
      key: 'mindshare', icon: Trophy, label: 'Korean mindshare',
      value: `#${r} of ${of}`,
      detail: p.categoryRank ? `In ${p.category} · #${p.rank} of ${p.of} overall, last ${p.windowDays} days` : `Of every tracked project, last ${p.windowDays} days`,
      verdict: pctile <= 0.25 ? 'strong' : pctile <= 0.6 ? 'steady' : 'watch',
    });
    if (p.sharePrevPct !== null) {
      const ratio = p.sharePrevPct ? p.sharePct / p.sharePrevPct : p.sharePct > 0 ? 2 : 1;
      out.push({
        key: 'sov', icon: Megaphone, label: 'Share of voice',
        value: `${p.sharePct}%`,
        detail: `Of all tracked mentions, from ${p.sharePrevPct}% the ${p.windowDays} days before`,
        verdict: ratio >= 1.2 ? 'strong' : ratio <= 0.8 ? 'watch' : 'steady',
      });
    }
  }
  const reach = fourWeek(done, (w) => w.reads);
  if (reach !== null) out.push({ key: 'reach', icon: TrendingUp, label: 'Reach momentum', value: signed(reach), detail: 'Reads, last 4 weeks vs the 4 before', verdict: byChange(reach) });
  const pace = fourWeek(done, (w) => w.posts);
  if (pace !== null) {
    const last4 = done.slice(-4).reduce((n, w) => n + w.posts, 0);
    out.push({ key: 'pace', icon: Activity, label: 'Delivery pace', value: `${last4} posts`, detail: `Last 4 weeks, ${signed(pace)} vs the 4 before`, verdict: byChange(pace) });
  }
  if (d.sentiment && d.sentiment.counted >= 10) {
    const c = (l: string[]) => d.sentiment!.byLabel.filter((s) => l.includes(s.label)).reduce((n, s) => n + s.count, 0);
    const good = Math.round((c(['positive', 'hype']) / d.sentiment.counted) * 100);
    const bad = Math.round((c(['negative', 'fud']) / d.sentiment.counted) * 100);
    out.push({
      key: 'community', icon: MessageSquare, label: 'Community', value: `${good}% positive`,
      detail: `${bad}% negative or FUD, ${d.sentiment.counted} comments`,
      verdict: bad >= 20 ? 'watch' : good >= 40 ? 'strong' : 'steady',
    });
  }
  if (d.market && d.market.weeks.length >= 4) {
    const w = d.market.weeks, last = w[w.length - 1];
    const avg = w.slice(0, -1).reduce((n, x) => n + x.sharePct, 0) / (w.length - 1);
    const c = avg ? Math.round(((last.sharePct - avg) / avg) * 100) : null;
    out.push({ key: 'trading', icon: ArrowLeftRight, label: 'Korean trading', value: `${last.sharePct}%`, detail: `Korea's share last week · ${avg.toFixed(1)}% average before`, verdict: byChange(c, 20) });
  }
  // Against the roster: within 20% of the median is Steady, either side of it Strong / Watch.
  const b = d.benchmarks, t = d.totals;
  const vsMedian = (v: number, m: number, lowIsBest = false): Verdict => {
    const r = lowIsBest ? m / v : v / m;
    return r >= 1.2 ? 'strong' : r <= 0.8 ? 'watch' : 'steady';
  };
  const place = (rank: number | null, label: string) => (rank ? ` · ${ordinal(rank)} ${label} of ${b!.clients}` : '');
  if (b && t?.posts && t.reads) {
    const rpp = t.reads / t.posts;
    out.push({
      key: 'rpp', icon: Eye, label: 'Reads per post', value: compact(Math.round(rpp)),
      detail: `Roster median ${compact(Math.round(b.readsPerPost.median))}${place(b.readsPerPost.rank, 'highest')}`,
      verdict: vsMedian(rpp, b.readsPerPost.median),
    });
    const er = (t.engagements / t.reads) * 100;
    out.push({
      key: 'er', icon: Heart, label: 'Engagement rate', value: `${er.toFixed(2)}%`,
      detail: `Roster median ${b.engRate.median.toFixed(2)}%${place(b.engRate.rank, 'highest')}`,
      verdict: vsMedian(er, b.engRate.median),
    });
  }
  if (d.spend && t?.reads) {
    const cpm = (d.spend.kol / t.reads) * 1000;
    out.push({
      key: 'cost', icon: Wallet, label: 'KOL cost / 1K reads', value: `$${cpm.toFixed(2)}`,
      detail: b?.cpm
        ? `Roster median $${b.cpm.median.toFixed(2)}${place(b.cpm.rank, 'lowest')} · ${usd(d.spend.kol)} to KOLs`
        : `${usd(d.spend.kol)} to KOLs · ${usd(d.spend.total)} spent in all`,
      verdict: b?.cpm && cpm > 0 ? vsMedian(cpm, b.cpm.median, true) : 'info',
    });
  }
  return out;
}

function Scorecard({ d }: { d: ClientDashboardData }) {
  const sig = signalsFor(d);
  if (!sig.length) return null;
  const n = (v: Verdict) => sig.filter((x) => x.verdict === v).length;
  const strong = n('strong'), watch = n('watch');
  // Whichever column count leaves no gap: 9 tiles read as 3×3, not 4+4+1.
  const cols = sig.length % 4 !== 0 && sig.length % 3 === 0 ? 3 : 4;
  const headline = watch === 0 && strong >= 2 ? 'Strong position' : watch > strong ? 'Needs attention' : 'Holding steady';
  return (
    <Card className="overflow-hidden border-cream-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-100 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-light bg-brand-soft text-brand-deep"><Gauge className="h-4 w-4" /></div>
          <div>
            <p className={KICKER}>Evaluation</p>
            <p className="text-[15px] font-semibold text-ink-warm-900">{headline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-warm-500">
          {strong > 0 && <StatusBadge tone="success" size="sm">{strong} strong</StatusBadge>}
          {n('steady') > 0 && <StatusBadge tone="neutral" size="sm">{n('steady')} steady</StatusBadge>}
          {watch > 0 && <StatusBadge tone="warning" size="sm">{watch} to watch</StatusBadge>}
        </div>
      </div>
      {/* gap-px over a cream ground draws the hairlines between tiles at every breakpoint. */}
      <div className={`grid grid-cols-1 gap-px bg-cream-100 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {sig.map((x) => (
          <div key={x.key} className="bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
                <x.icon className="h-3 w-3" />{x.label}
              </p>
              <StatusBadge tone={VERDICT[x.verdict].tone} size="sm">{VERDICT[x.verdict].label}</StatusBadge>
            </div>
            <p className="mt-2 text-[22px] font-semibold leading-none text-ink-warm-900 tabular-nums" style={{ letterSpacing: '-0.02em' }}>{x.value}</p>
            <p className="mt-1.5 text-xs text-ink-warm-500">{x.detail}</p>
          </div>
        ))}
        {Array.from({ length: (cols - (sig.length % cols)) % cols }).map((_, i) => <div key={`fill${i}`} className="hidden bg-white lg:block" aria-hidden />)}
      </div>
    </Card>
  );
}

/** Where the client sits in Korean Telegram, against its category or its neighbours. */
function Placement({ d }: { d: ClientDashboardData }) {
  const p = d.placement;
  if (!p) {
    return (
      <Card className="border-cream-200">
        <Empty icon={Trophy} title="Not tracked in Korea Signal" description="Add this client as a Korea Signal project to rank it against the Korean market." />
      </Card>
    );
  }
  const top = Math.max(...p.peers.map((r) => r.sharePct), 0.1);
  const tiles = [
    p.categoryRank ? { k: `Rank in ${p.category}`, v: `#${p.categoryRank}`, s: `of ${p.categoryOf} projects` } : null,
    { k: 'Overall rank', v: `#${p.rank}`, s: `of ${p.of} tracked projects` },
    { k: 'Share of voice', v: `${p.sharePct}%`, s: p.sharePrevPct !== null ? `from ${p.sharePrevPct}% the ${p.windowDays} days before` : 'of all tracked mentions' },
    { k: 'Mentions', v: num(p.mentions), s: `Korean Telegram, last ${p.windowDays} days` },
  ].filter(Boolean) as Array<{ k: string; v: string; s: string }>;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="crd-feature p-5">
        <p className={`${KICKER} flex items-center gap-2`}><span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />Korean market position</p>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
          {tiles.map((t) => (
            <div key={t.k}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">{t.k}</p>
              <p className="mt-1 display-serif text-[30px] leading-none text-ink-warm-900 tabular-nums">{t.v}</p>
              <p className="mt-1 text-xs text-ink-warm-500">{t.s}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-brand-light/70 pt-3 text-xs text-ink-warm-700">
          {p.krVenues.length
            ? <>Listed in Korea on <span className="font-medium text-ink-warm-900">{p.krVenues.map(cap).join(', ')}</span></>
            : 'Not listed on a Korean exchange'}
        </div>
      </div>
      <Panel icon={Trophy} title="Against the field" subtitle={`${p.peersLabel} · share of Korean Telegram mentions, last ${p.windowDays} days`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className={`${HEAD} w-12`}>#</TableHead>
                <TableHead className={HEAD}>Project</TableHead>
                <TableHead className={`${HEAD} w-[40%]`}>Share of voice</TableHead>
                <TableHead className={`${HEAD} text-right`}>Mentions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.peers.map((r) => (
                <TableRow key={r.name} className={r.isClient ? 'border-gray-100 bg-brand-soft/60 hover:bg-brand-soft/80' : 'border-gray-100'}>
                  <TableCell className="py-3 font-mono text-xs text-ink-warm-500">{r.rank}</TableCell>
                  <TableCell className="py-3">
                    <span className={r.isClient ? 'font-semibold text-brand-deep' : 'font-medium text-ink-warm-900'}>{r.name}</span>
                    {r.isClient && <StatusBadge tone="brand" size="sm" className="ml-2">Client</StatusBadge>}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-100">
                        <div className={`h-full rounded-full ${r.isClient ? 'bg-brand' : 'bg-ink-warm-300'}`} style={{ width: `${Math.max((r.sharePct / top) * 100, 2)}%` }} />
                      </div>
                      <span className="w-12 text-right font-medium tabular-nums text-ink-warm-900">{r.sharePct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-right tabular-nums text-ink-warm-700">{num(r.mentions)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
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
      <Scorecard d={d} />

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

      <Tabs defaultValue="placement" className="space-y-5">
        <TabsList className={TAB_LIST}>
          <TabsTrigger value="placement" className={TAB}>Market placement</TabsTrigger>
          <TabsTrigger value="market" className={TAB}>Trading &amp; buzz</TabsTrigger>
          <TabsTrigger value="creators" className={TAB}>
            Creators{d.creators.length > 0 && <span className="ml-1.5 rounded-full bg-brand-light px-1.5 text-[10px] font-semibold text-brand tabular-nums">{t?.creators ?? d.creators.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="community" className={TAB}>
            Community{d.sentiment && <span className="ml-1.5 rounded-full bg-brand-light px-1.5 text-[10px] font-semibold text-brand tabular-nums">{d.sentiment.counted}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="placement" className="mt-0">
          <Placement d={d} />
        </TabsContent>

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
