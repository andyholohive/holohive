'use client';

/**
 * Client portal — Korea section [Andy 2026-10-01].
 *
 * Layers 2 and 3 of the Korea intelligence stack (layer 1 is the weekly
 * email, rendered from the same summary in lib/koreaIntel/email.ts):
 *   - Top: the week's verdict and one action, three numbers, the trend in
 *     Korea's share of trading, the Korean market, and what Koreans are saying.
 *   - Detail tabs, one at a time: Exchanges, Listings, Comments, Peers, News,
 *     Creators. A tab with nothing real to show is left out rather than
 *     padded with placeholders.
 *
 * Fetches through /api/public/portal-gate/korea, which re-checks the portal
 * email gate server-side. Renders nothing for a client with no Korea setup,
 * so the 4,000-line portal page only needs one line to include it.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { KpiCard } from '@/components/ui/kpi-card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity, PieChart, Coins, PenLine, Globe, MessageSquare, MessagesSquare, Target,
  TrendingUp, Newspaper, Megaphone, Users, Scale, Check, AlertTriangle,
} from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import type { KoreaSummary } from '@/lib/koreaIntel/summary';
import { BarList, ColumnChart, LineChart } from './KoreaCharts';

const STATUS_TONE: Record<string, BadgeTone> = {
  heating: 'success', cooling: 'warning', steady: 'neutral', first: 'brand', unlisted: 'info',
};
const SPLIT_TONE: Record<string, 'brand' | 'good' | 'bad'> = {
  question: 'brand', positive: 'good', hype: 'good', negative: 'bad', fud: 'bad',
};
const LABEL_TONE: Record<string, BadgeTone> = {
  Questions: 'brand', Positive: 'success', Excited: 'success', Negative: 'danger', FUD: 'danger',
};

export function KoreaIntelligence({ idOrSlug, email, className }: { idOrSlug: string; email: string; className?: string }) {
  const [summary, setSummary] = useState<KoreaSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');

  useEffect(() => {
    if (!idOrSlug || !email) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/public/portal-gate/korea', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idOrSlug, email }), cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || !json.ok) { setState('error'); return; }
        if (!json.summary) { setState('none'); return; }
        setSummary(json.summary); setState('ready');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [idOrSlug, email]);

  if (state === 'none') return null;
  if (state === 'error') {
    return (
      <Card className={`p-5 ${className ?? ''}`}>
        <p className="text-sm text-ink-warm-500">Korea data couldn’t load just now. Refresh the page to try again.</p>
      </Card>
    );
  }
  if (state === 'loading' || !summary) {
    return (
      <section className={`space-y-4 ${className ?? ''}`} aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </section>
    );
  }

  const s = summary;
  const ticker = `$${s.client.ticker}`;

  return (
    <section className={`space-y-4 ${className ?? ''}`} aria-labelledby="korea-heading">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-warm-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />{s.client.name} · Korea
        </div>
        <h2 id="korea-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-warm-900">
          <Activity className="h-5 w-5 text-ink-warm-700" />Korea
        </h2>
        <p className="text-sm text-ink-warm-500">
          {ticker}{s.week ? ` · week of ${s.week.label}` : ''} · updated every Saturday
        </p>
      </div>

      {/* ── Verdict + one action ─────────────────────────────── */}
      <div className="crd-feature grid overflow-hidden md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="p-5 sm:p-6">
          <StatusBadge tone={STATUS_TONE[s.verdict.status] ?? 'neutral'}>{s.verdict.label}</StatusBadge>
          <p className="display-serif mt-2.5 text-[21px] leading-snug text-ink-warm-900">{s.verdict.headline}</p>
          {s.verdict.sub && <p className="mt-1.5 text-sm text-ink-warm-700">{s.verdict.sub}</p>}
        </div>
        <div className="border-t border-[#D4E5E4] bg-white/55 p-5 sm:p-6 md:border-l md:border-t-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-deep">One thing to do this week</p>
          <p className="text-[15.5px] font-semibold leading-snug text-ink-warm-900">{s.action.text}</p>
          <p className="mt-1.5 text-sm text-ink-warm-700">{s.action.why}</p>
        </div>
      </div>

      {/* ── Three numbers ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {s.stats.share ? (
          <KpiCard icon={PieChart} accent="brand" label="Korea’s share of volume" value={`${s.stats.share.value}%`}
            trend={s.stats.share.prev != null ? { delta: +(s.stats.share.value - s.stats.share.prev).toFixed(1), label: `${signed(s.stats.share.value - s.stats.share.prev)} pts` } : undefined}
            sub={s.stats.share.prev != null ? `From ${s.stats.share.prev}% last week` : 'First week tracked'} />
        ) : (
          <KpiCard icon={Target} accent="sky" label="Listing readiness" value={`${s.readiness?.filter((r) => r.ok).length ?? 0} of ${s.readiness?.length ?? 0}`} sub="Checks passing" />
        )}
        {s.stats.volume ? (
          <KpiCard icon={Coins} label={`Korean volume · ${s.stats.volume.window ?? '7d'}`} value={usd(s.stats.volume.usd)}
            trend={s.stats.volume.paceRatio != null ? { delta: s.stats.volume.paceRatio - 1, label: s.stats.volume.paceRatio >= 1 ? `${s.stats.volume.paceRatio.toFixed(1)}×` : `−${Math.round((1 - s.stats.volume.paceRatio) * 100)}%` } : undefined}
            sub={s.stats.volume.paceRatio != null ? 'Daily pace vs last week' : 'No prior week to compare yet'} />
        ) : (
          <KpiCard icon={Globe} label="Exchanges with volume" value={String(s.venues.length || "—")} sub={s.venues.map((v) => v.name).join(', ') || 'None tracked yet'} />
        )}
        <KpiCard icon={PenLine} accent="emerald" label="Korean posts about you"
          value={s.stats.posts.newThisWeek != null ? String(s.stats.posts.newThisWeek) : '—'}
          sub={s.stats.posts.total != null ? `New this week · ${s.stats.posts.total} in total` : 'New this week'} />
      </div>

      {/* ── Trend + market ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {s.client.listed ? (
          <Card>
            <CardHeaderEditorial icon={PieChart} title="Korea’s share of volume" subtitle="Upbit + Bithumb · weekly" />
            <div className="p-5">
              <LineChart
                label={`Korea's share of ${ticker} trading volume by week`}
                points={s.shareHistory.map((h) => ({ x: short(h.week), y: h.share, hollow: h.partial, tip: `${short(h.week)}\nKorea share ${h.share}%\nKorean volume ${usd(h.volumeUsd)}${h.partial ? '\nFewer than 7 days of data' : ''}` }))}
                min={0} max={niceMax(Math.max(...s.shareHistory.map((h) => h.share), 5))} ticks={ticksFor(niceMax(Math.max(...s.shareHistory.map((h) => h.share), 5)))}
                fmt={(v) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`}
              />
              {s.shareHistory.some((h) => h.partial) && (
                <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-ink-warm-500">
                  <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-brand" />Full week</span>
                  <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full border-2 border-brand bg-white" />Fewer than 7 days of data</span>
                </div>
              )}
            </div>
          </Card>
        ) : s.readiness ? (
          <Card>
            <CardHeaderEditorial icon={Target} title="Path to a Korean listing" subtitle="Checked automatically"
              action={<StatusBadge tone="success">{s.readiness.filter((r) => r.ok).length} of {s.readiness.length}</StatusBadge>} />
            <ul className="divide-y divide-cream-100 px-5 py-1">
              {s.readiness.map((r) => (
                <li key={r.label} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <span className={`grid h-[22px] w-[22px] place-items-center rounded-md border ${r.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {r.ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 text-sm text-ink-warm-900">{r.label}<span className="block text-xs text-ink-warm-500">{r.detail}</span></span>
                  <StatusBadge tone={r.ok ? 'success' : 'warning'} size="sm">{r.value}</StatusBadge>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {s.market.latest && (
          <Card>
            <CardHeaderEditorial icon={Globe} title="The Korean market" subtitle={`Week of ${formatDate(s.market.latest.week)}`} />
            <div className="grid gap-4 p-5">
              <div className="grid gap-2 text-sm">
                <MarketRow label="KOSPI" value={s.market.latest.kospi.toLocaleString('en-US')} delta={s.market.latest.kospiPct} />
                <MarketRow label="Koreans pay" value={`${s.market.latest.kimchiPct >= 0 ? '+' : ''}${s.market.latest.kimchiPct.toFixed(1)}% vs global`}
                  note={s.market.latest.kimchiPrev != null ? `from ${s.market.latest.kimchiPrev >= 0 ? '+' : ''}${s.market.latest.kimchiPrev.toFixed(1)}%` : undefined}
                  good={s.market.latest.kimchiPrev != null ? s.market.latest.kimchiPct >= s.market.latest.kimchiPrev : undefined} />
                <MarketRow label="KR crypto volume" value={usd(s.market.latest.krCexUsd)} delta={s.market.latest.krCexPct} />
              </div>
              {s.market.series.length > 1 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">How much more Koreans pay for crypto</p>
                  <ColumnChart
                    label="Korean crypto price premium over global, weekly"
                    points={s.market.series.map((p) => ({ x: short(p.week), y: p.kimchiPct, tip: `${short(p.week)}\n${p.kimchiPct >= 0 ? '+' : ''}${p.kimchiPct.toFixed(2)}%${p.kimchiPct < 0 ? '\nKoreans paid less' : ''}` }))}
                    min={-1.5} max={1.5} ticks={[-1.5, 0, 1.5]} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                  />
                  <p className="mt-2 text-xs text-ink-warm-500">Above zero means Koreans are paying up to buy, a good window for content. Amber weeks were a discount.</p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* ── What Korea is saying (top themes only) ─────────────── */}
      {s.comments.substantive > 0 && (
        <Card>
          <CardHeaderEditorial icon={MessageSquare} title="What Korea is saying" subtitle="Top themes in Korean comments"
            action={s.comments.latest ? <StatusBadge tone="neutral">Through {formatDate(s.comments.latest)}</StatusBadge> : undefined} />
          <div className="grid gap-3.5 p-5">
            <div className="flex flex-wrap gap-1.5">
              {s.comments.themes.map((t, i) => (
                <span key={t.theme} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] ${i < 3 ? 'border-brand-light bg-brand-light text-brand-deep' : 'border-cream-200 bg-cream-100 text-ink-warm-700'}`}>
                  {capitalize(t.theme)}<b className="font-mono text-[11.5px] font-semibold">{t.count}</b>
                </span>
              ))}
            </div>
            <p className="text-xs text-ink-warm-500">
              {s.comments.substantive} real comments: {s.comments.split.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(', ')}. Every comment is in the Comments tab below.
            </p>
          </div>
        </Card>
      )}

      {/* ── Detail tabs ─────────────────────────────────────── */}
      <DetailTabs s={s} />
    </section>
  );
}

function DetailTabs({ s }: { s: KoreaSummary }) {
  const tabs: Array<{ value: string; label: string; show: boolean }> = [
    { value: 'exchanges', label: 'Exchanges', show: s.venues.length > 0 },
    { value: 'listings', label: 'Listings', show: s.listings.length > 0 },
    { value: 'comments', label: 'Comments', show: s.comments.total > 0 },
    // Peers only appears once real peer values exist — never with placeholders.
    { value: 'peers', label: 'Peers', show: s.peers.rows.length > 1 },
    { value: 'news', label: 'News', show: true },
    { value: 'creators', label: 'Creators', show: s.creators.channels > 0 },
  ];
  const visible = tabs.filter((t) => t.show);
  if (!visible.length) return null;
  const ticker = `$${s.client.ticker}`;

  return (
    <Tabs defaultValue={visible[0].value} className="space-y-4 pt-2">
      <div className="max-w-full overflow-x-auto">
        <TabsList className="h-auto border border-cream-200 bg-cream-100 p-1">
          {visible.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-[13px] data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card">{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="exchanges" className="mt-0">
        <Card>
          <CardHeaderEditorial icon={Coins} title={`Where ${ticker} trades`} subtitle="7-day volume by exchange" />
          <div className="p-5">
            <BarList fmt={usd} rows={s.venues.map((v) => ({
              label: <>{v.isKR && <span className="rounded bg-brand-light px-1 font-mono text-[9.5px] font-semibold text-brand">KR</span>}{v.name}</>,
              value: v.usd, tone: v.isKR ? 'brand' : 'mute', strong: v.isKR,
            }))} />
            <p className="mt-3.5 text-xs text-ink-warm-500">{s.client.listed ? 'Korean exchanges in teal.' : 'Not on a Korean exchange yet — these are your global venues.'}</p>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="listings" className="mt-0">
        <Card>
          <CardHeaderEditorial icon={TrendingUp} title="Recent Korean debuts" subtitle="First-day trading on Upbit and Bithumb" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm">
              <thead><tr className="border-b border-cream-200 bg-cream-50/80">
                {['Token', 'Exchange', 'Listed', 'Day-1 volume'].map((h, i) => (
                  <th key={h} className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {s.listings.map((l) => (
                  <tr key={`${l.ticker}-${l.venue}-${l.listedOn}`} className="border-b border-cream-100 last:border-0">
                    <td className="px-5 py-3.5 font-semibold text-ink-warm-900">{l.ticker}</td>
                    <td className="px-5 py-3.5 text-ink-warm-700">{l.venue}</td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-warm-900">{formatDate(l.listedOn)}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-ink-warm-900">{l.day1Usd != null ? `≈ ${usd(l.day1Usd)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 pb-4 pt-3 text-xs text-ink-warm-500">Converted from Korean won at the week’s exchange rate.</p>
        </Card>
      </TabsContent>

      <TabsContent value="comments" className="mt-0">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeaderEditorial icon={MessageSquare} title={`How the ${s.comments.substantive} split`} subtitle={`${s.comments.noise} stickers and spam left out`} />
            <div className="p-5">
              <BarList fmt={(v) => String(v)} rows={s.comments.split.map((p) => ({ label: p.label, value: p.count, tone: SPLIT_TONE[p.key] }))} />
              <p className="mt-3.5 text-xs text-ink-warm-500">{s.comments.total} comments on your campaign posts, {s.comments.korean} in Korean.</p>
            </div>
          </Card>
          <Card>
            <CardHeaderEditorial icon={MessagesSquare} title="In their own words" subtitle="Korean original · translation" />
            <div className="grid gap-2.5 p-5">
              {s.comments.quotes.length ? s.comments.quotes.map((q, i) => (
                <div key={i} className="rounded-lg border border-cream-200 bg-cream-50 px-3.5 py-3">
                  <p className="text-[15px] leading-snug text-ink-warm-900">{q.ko}</p>
                  {q.en && <p className="mt-0.5 text-[13.5px] text-ink-warm-500">“{q.en}”</p>}
                  <div className="mt-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider text-ink-warm-400">
                    <StatusBadge tone={LABEL_TONE[q.label] ?? 'neutral'} size="sm">{q.label}</StatusBadge>
                    {q.theme && <span className="truncate">{q.theme}</span>}
                    {q.date && <span>{formatDate(q.date)}</span>}
                  </div>
                </div>
              )) : <p className="text-sm text-ink-warm-500">No translated comments yet.</p>}
            </div>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="peers" className="mt-0">
        <Card>
          <CardHeaderEditorial icon={Scale} title="Korea’s share vs your peers" subtitle="Last 7 days · Upbit + Bithumb as a share of all trading" />
          <div className="p-5">
            <div className="max-w-2xl"><BarList fmt={(v) => `${v}%`} rows={s.peers.rows.map((r) => ({ label: r.name, value: r.share, tone: r.isClient ? 'brand' : 'mute', strong: r.isClient }))} /></div>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="news" className="mt-0">
        <Card>
          <CardHeaderEditorial icon={Newspaper} title="Korean media" subtitle="TokenPost · BlockMedia · you, your peers, and Korean listings" />
          {s.news.length ? (
            <ul className="divide-y divide-cream-100">
              {s.news.map((n) => (
                <li key={n.link || n.title} className="grid gap-1.5 px-5 py-4 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:gap-4">
                  <span className="font-mono text-[10.5px] uppercase leading-relaxed tracking-wider text-ink-warm-400">{n.source}{n.published && <><br />{formatDate(n.published)}</>}</span>
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="min-w-0 group">
                    <span className="block text-[15px] font-semibold leading-snug text-ink-warm-900 group-hover:text-brand">{n.titleEn ?? n.title}</span>
                    {n.titleEn && <span className="mt-0.5 block text-[13px] text-ink-warm-500">{n.title}</span>}
                  </a>
                  <StatusBadge tone={n.kind === 'client' ? 'brand' : n.kind === 'peer' ? 'info' : 'neutral'}>
                    {n.kind === 'client' ? s.client.name : n.kind === 'peer' ? `Peer · ${n.matched}` : 'Listings'}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-ink-warm-500">No Korean headlines mentioned {s.client.name} or its peers this week.</p>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="creators" className="mt-0">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeaderEditorial icon={Users} title="Korean creator landscape" subtitle={`${s.creators.channels} channels · ${compact(s.creators.followers)} followers`} />
            <div className="grid gap-4 p-5">
              <BarList fmt={compact} rows={[...s.creators.tiers].sort((a, b) => b.followers - a.followers).map((t) => ({ label: t.tier, value: t.followers }))} />
              <p className="rounded-lg bg-brand-soft px-3.5 py-3 text-[13.5px] text-ink-warm-800 accent-l-brand">
                Mid-size channels reach more people in total than the largest ones. That’s why a good lineup isn’t just the biggest names.
              </p>
            </div>
          </Card>
          <Card>
            <CardHeaderEditorial icon={Megaphone} title="Tier details" subtitle="Latest monthly snapshot" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead><tr className="border-b border-cream-200 bg-cream-50/80">
                  {['Tier', 'Channels', 'Avg views / post'].map((h, i) => (
                    <th key={h} className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 ${i ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {s.creators.tiers.map((t) => (
                    <tr key={t.tier} className="border-b border-cream-100 last:border-0">
                      <td className="px-5 py-3.5 font-semibold text-ink-warm-900">{t.tier}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-ink-warm-900">{t.channels}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-ink-warm-900">{t.avgViews.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function MarketRow({ label, value, delta, note, good }: { label: string; value: string; delta?: number | null; note?: string; good?: boolean }): ReactNode {
  const tone = delta != null ? (delta >= 0 ? 'text-emerald-600' : 'text-rose-600') : good == null ? 'text-ink-warm-400' : good ? 'text-emerald-600' : 'text-rose-600';
  const text = delta != null ? `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%` : note ?? '';
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-baseline gap-3">
      <span className="text-ink-warm-700">{label}</span>
      <span className="font-mono text-[15px] font-medium tabular-nums text-ink-warm-900">{value}</span>
      <span className={`text-xs font-medium tabular-nums ${tone}`}>{text}</span>
    </div>
  );
}

// ── formatting ──────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Chart-axis week label ("Sep 20"). Axes only — tables use formatDate (mm/dd/yyyy). */
function short(iso: string) {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function usd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
function compact(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}
function signed(n: number) { return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`; }
function capitalize(t: string) { return t.charAt(0).toUpperCase() + t.slice(1); }
function niceMax(v: number) { const step = v > 20 ? 10 : 5; return Math.ceil((v * 1.1) / step) * step; }
function ticksFor(max: number) { const n = 3; return Array.from({ length: n + 1 }, (_, i) => +((max / n) * i).toFixed(1)); }
