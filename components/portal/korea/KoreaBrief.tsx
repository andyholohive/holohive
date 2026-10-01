'use client';

/**
 * The weekly Korea brief — the readable page a client opens from the button
 * under the weekly report in their Telegram group [Andy 2026-10-01: "I don't
 * think many of our clients would read emails"].
 *
 * Same reading order as the email it replaces: the answer, one thing to do,
 * three numbers, the trend, one real voice, the market, then a way into the
 * full portal. Laid out for a phone first, because a link tapped in Telegram
 * opens in its in-app browser.
 */

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Activity, Check, AlertTriangle, Globe, MessageSquare, PieChart, Target, ArrowRight } from 'lucide-react';
import type { KoreaSummary } from '@/lib/koreaIntel/summary';
import { ColumnChart, LineChart } from './KoreaCharts';

const STATUS_TONE: Record<string, BadgeTone> = {
  heating: 'success', cooling: 'warning', steady: 'neutral', first: 'brand', unlisted: 'info',
};
const LABEL_TONE: Record<string, BadgeTone> = {
  Questions: 'brand', Positive: 'success', Excited: 'success', Negative: 'danger', FUD: 'danger',
};

export function KoreaBrief({ s, portalUrl }: { s: KoreaSummary; portalUrl: string | null }) {
  const ticker = `$${s.client.ticker}`;
  const m = s.market.latest;
  const quote = s.comments.featured ?? s.comments.quotes[0] ?? null;
  const stale = s.comments.latest ? (Date.now() - Date.parse(s.comments.latest)) / 86_400_000 > 21 : false;

  return (
    <div className="min-h-screen bg-cream-50 text-ink-warm-900">
      <header className="border-b border-cream-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="inline-block h-5 w-5 rounded-md bg-gradient-to-b from-[#4a96a2] to-[#3a7d89]" aria-hidden />
            Holo Hive
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-warm-500">
            {s.client.name} · Korea{s.week ? ` · ${s.week.label}` : ''}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        {/* The answer */}
        <section aria-labelledby="brief-headline" className="space-y-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-dark">
            <Activity className="h-3 w-3" />Korea brief{s.week ? ` · week of ${s.week.label}` : ''}
          </p>
          <StatusBadge tone={STATUS_TONE[s.verdict.status] ?? 'neutral'}>{s.verdict.label}</StatusBadge>
          <h1 id="brief-headline" className="display-serif text-[26px] leading-[1.2] text-ink-warm-900 sm:text-[32px]">{s.verdict.headline}</h1>
          {s.verdict.sub && <p className="text-[15px] leading-relaxed text-ink-warm-700">{s.verdict.sub}</p>}
        </section>

        {/* One thing to do */}
        <section className="crd-feature p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-deep">One thing to do this week</p>
          <p className="mt-2 text-[17px] font-semibold leading-snug text-ink-warm-900">{s.action.text}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-warm-700">{s.action.why}</p>
        </section>

        {/* Three numbers */}
        <section aria-label="This week in three numbers" className="grid grid-cols-3 gap-2 sm:gap-3">
          {s.stats.share ? (
            <Stat label="Korea’s share" value={`${s.stats.share.value}%`}
              note={s.stats.share.prev != null ? <><Arrow d={s.stats.share.value - s.stats.share.prev} /> from {s.stats.share.prev}%</> : 'first week'} />
          ) : (
            <Stat label="Readiness" value={`${s.readiness?.filter((r) => r.ok).length ?? 0}/${s.readiness?.length ?? 0}`} note="checks passing" />
          )}
          {s.stats.volume ? (
            <Stat label="Korean volume" value={usd(s.stats.volume.usd)}
              note={s.stats.volume.paceRatio == null ? 'no prior week' : s.stats.volume.paceRatio >= 1
                ? <><span className="text-emerald-700">▲ {s.stats.volume.paceRatio.toFixed(1)}×</span> daily pace</>
                : <><span className="text-rose-700">▼ {Math.round((1 - s.stats.volume.paceRatio) * 100)}%</span> daily pace</>} />
          ) : (
            <Stat label="Exchanges" value={String(s.venues.length || '—')} note="global, with volume" />
          )}
          <Stat label="Korean posts" value={s.stats.posts.newThisWeek != null ? String(s.stats.posts.newThisWeek) : '—'}
            note={s.stats.posts.total != null ? `new · ${s.stats.posts.total} total` : 'new this week'} />
        </section>

        {/* The trend (listed) or the path to a listing (not listed) */}
        {s.client.listed && s.shareHistory.length > 1 ? (
          <Card>
            <CardHeaderEditorial icon={PieChart} title="Korea’s share, week by week" subtitle="Upbit + Bithumb as a share of all trading" />
            <div className="p-4 sm:p-5">
              <LineChart
                label={`Korea's share of ${ticker} trading by week`}
                points={s.shareHistory.map((h) => ({ x: short(h.week), y: h.share, hollow: h.partial, tip: `${short(h.week)}\nKorea share ${h.share}%\nKorean volume ${usd(h.volumeUsd)}` }))}
                min={0} max={niceMax(Math.max(...s.shareHistory.map((h) => h.share), 5))}
                ticks={ticksFor(niceMax(Math.max(...s.shareHistory.map((h) => h.share), 5)))}
                fmt={(v) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`}
              />
            </div>
          </Card>
        ) : s.readiness ? (
          <Card>
            <CardHeaderEditorial icon={Target} title="Path to a Korean listing" subtitle="Checked automatically" />
            <ul className="divide-y divide-cream-100 px-4 py-1 sm:px-5">
              {s.readiness.map((r) => (
                <li key={r.label} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <span className={`grid h-[22px] w-[22px] place-items-center rounded-md border ${r.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {r.ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 text-sm">{r.label}<span className="block text-xs text-ink-warm-500">{r.detail}</span></span>
                  <StatusBadge tone={r.ok ? 'success' : 'warning'} size="sm">{r.value}</StatusBadge>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* One real voice */}
        {quote && (
          <Card>
            <CardHeaderEditorial icon={MessageSquare} title={stale ? 'What Koreans have been saying' : 'What Koreans are saying'}
              subtitle={stale ? 'From your campaign posts' : 'This week, translated'} />
            <div className="space-y-3 p-4 sm:p-5">
              <figure className="rounded-lg border border-cream-200 bg-cream-50 px-4 py-3.5">
                <blockquote className="text-[17px] leading-snug text-ink-warm-900">{quote.ko}</blockquote>
                {quote.en && <figcaption className="mt-1 text-[15px] leading-snug text-ink-warm-700">“{quote.en}”</figcaption>}
                <div className="mt-2.5"><StatusBadge tone={LABEL_TONE[quote.label] ?? 'neutral'} size="sm">{quote.label}</StatusBadge></div>
              </figure>
              {s.comments.themes.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">What keeps coming up</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.comments.themes.slice(0, 4).map((t) => (
                      <span key={t.theme} className="inline-flex items-center gap-1.5 rounded-md border border-cream-200 bg-cream-100 px-2.5 py-1 text-[13px] text-ink-warm-700">
                        {capitalize(t.theme)}<b className="font-mono text-[11.5px] font-semibold">{t.count}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* The market, in words first */}
        {m && (
          <Card>
            <CardHeaderEditorial icon={Globe} title="The Korean market" subtitle="Context for this week" />
            <div className="space-y-4 p-4 sm:p-5">
              <p className="text-[15px] leading-relaxed text-ink-warm-700">
                <b className="font-semibold text-ink-warm-900">Korean stocks {m.kospiPct == null ? 'closed' : m.kospiPct >= 0 ? `rose ${m.kospiPct}%` : `fell ${Math.abs(m.kospiPct)}%`}</b> (KOSPI {m.kospi.toLocaleString('en-US')}).{' '}
                <b className="font-semibold text-ink-warm-900">Koreans are paying {Math.abs(m.kimchiPct).toFixed(1)}% {m.kimchiPct >= 0 ? 'more' : 'less'} for crypto</b> than the rest of the world.
                {m.krCexPct != null && <> Overall Korean crypto trading {m.krCexPct >= 0 ? 'rose' : 'fell'} {Math.abs(Math.round(m.krCexPct))}%.</>}
              </p>
              {s.market.series.length > 1 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">How much more Koreans pay for crypto</p>
                  <ColumnChart
                    label="Korean crypto price premium over global, weekly"
                    points={s.market.series.map((p) => ({ x: short(p.week), y: p.kimchiPct, tip: `${short(p.week)}\n${p.kimchiPct >= 0 ? '+' : ''}${p.kimchiPct.toFixed(2)}%` }))}
                    min={-1.5} max={1.5} ticks={[-1.5, 0, 1.5]} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                  />
                  <p className="mt-2 text-xs text-ink-warm-500">Above zero, Koreans are paying up to buy, a good window for content.</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Way into the detail */}
        {portalUrl && (
          <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-card">
            <p className="text-[15px] font-semibold text-ink-warm-900">Want the detail?</p>
            <p className="mt-1 text-sm text-ink-warm-700">Exchanges, every Korean comment, listings and creators are in the Korea section of your portal.</p>
            <a href={`${portalUrl}#korea`} className="btn-brand mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white focus-brand">
              Open the full Korea report<ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-2 text-xs text-ink-warm-500">Your portal asks for your email the first time.</p>
          </section>
        )}

        <p className="pt-2 text-center text-xs leading-relaxed text-ink-warm-500">
          Prepared by your Holo Hive account team · updated every Saturday<br />
          Figures cover Upbit and Bithumb{s.week ? `, ${s.week.label}` : ''}.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-cream-200 bg-white p-3 shadow-card sm:p-4">
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-ink-warm-500">{label}</p>
      <p className="mt-2 text-[22px] font-semibold leading-none tracking-tight tabular-nums text-ink-warm-900 sm:text-[26px]">{value}</p>
      <p className="mt-1.5 text-xs leading-snug text-ink-warm-500">{note}</p>
    </div>
  );
}

function Arrow({ d }: { d: number }) {
  return d > 0 ? <span className="text-emerald-700">▲</span> : d < 0 ? <span className="text-rose-700">▼</span> : <span>⟷</span>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Chart-axis week label ("Sep 20"). */
function short(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function usd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
function capitalize(t: string) { return t.charAt(0).toUpperCase() + t.slice(1); }
function niceMax(v: number) { const step = v > 20 ? 10 : 5; return Math.ceil((v * 1.1) / step) * step; }
function ticksFor(max: number) { return Array.from({ length: 4 }, (_, i) => +((max / 3) * i).toFixed(1)); }
