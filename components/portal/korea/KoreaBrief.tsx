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
 *
 * Deliberately not the admin app's cream + StatusBadge look: this is the
 * client's page and gets its own dark theme [Andy 2026-10-01: "more
 * futuristic and epic looking"]. Status reads as text + dot, never color alone.
 */

import type { ComponentType, ReactNode } from 'react';
import Image from 'next/image';
import {
  ArrowUpRight, CandlestickChart, ChartPie, ChartSpline, CircleCheck, CircleDashed,
  Crosshair, Quote, Radar, Radio, ShieldCheck, Waves,
} from 'lucide-react';
import type { KoreaSummary } from '@/lib/koreaIntel/summary';
import { ColumnChart, LineChart } from './KoreaCharts';

/*
 * Night theme. This page is the client's own object, opened from Telegram,
 * so it gets its own look instead of the admin app's cream: a dark "signal
 * console" with the brand teal lifted to #5CD6E0 so it holds contrast on the
 * dark ground. Colors live here as tokens so the theme moves as one file.
 * Text steps measured on PANEL (#0C161C): fg 16.6:1, sub 9.4:1, muted 5.9:1.
 */
const C = {
  bg: 'bg-[#05090D]',
  panel: 'border border-[#5CD6E0]/[0.14] bg-[#0C161C]/80 backdrop-blur-sm',
  fg: 'text-[#EAF6F7]',
  sub: 'text-[#A9BEC1]',
  muted: 'text-[#7F979B]',
  accent: 'text-[#5CD6E0]',
  up: 'text-[#4ADE9A]',
  down: 'text-[#FB7F93]',
  warn: 'text-[#FBBF24]',
};

const STATUS: Record<string, { dot: string; text: string }> = {
  heating: { dot: 'bg-[#4ADE9A]', text: C.up },
  cooling: { dot: 'bg-[#FBBF24]', text: C.warn },
  steady: { dot: 'bg-[#A9BEC1]', text: C.sub },
  first: { dot: 'bg-[#5CD6E0]', text: C.accent },
  unlisted: { dot: 'bg-[#7DB8FF]', text: 'text-[#9CC8FF]' },
};
const LABEL_TEXT: Record<string, string> = {
  Questions: C.accent, Positive: C.up, Excited: C.up, Negative: C.down, FUD: C.down,
};

export function KoreaBrief({ s, portalUrl }: { s: KoreaSummary; portalUrl: string | null }) {
  const ticker = `$${s.client.ticker}`;
  const m = s.market.latest;
  const quote = s.comments.featured ?? s.comments.quotes[0] ?? null;
  const stale = s.comments.latest ? (Date.now() - Date.parse(s.comments.latest)) / 86_400_000 > 21 : false;
  const status = STATUS[s.verdict.status] ?? STATUS.steady;

  return (
    <div className={`relative min-h-screen overflow-hidden ${C.bg} ${C.fg} [color-scheme:dark]`}>
      {/* Backdrop: a teal glow over a faint measurement grid, fading out as you scroll. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(62,134,146,0.55),rgba(5,9,13,0)_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[linear-gradient(rgba(148,210,218,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,210,218,0.07)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <header className="relative border-b border-[#5CD6E0]/10 bg-[#05090D]/60 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(92,214,224,0.5),0_0_18px_rgba(92,214,224,0.45)]">
              <Image src="/images/logo.png" alt="" width={22} height={22} priority />
            </span>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em]">Holo Hive</span>
          </span>
          <span className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] ${C.sub}`}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#5CD6E0] opacity-70 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#5CD6E0]" />
            </span>
            {s.client.name} · KR
          </span>
        </div>
      </header>

      <main className="relative mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
        {/* The answer */}
        <section aria-labelledby="brief-headline" className="space-y-3.5">
          <p className={`flex items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.2em] ${C.accent}`}>
            <Radar className="h-3.5 w-3.5" />Korea brief{s.week ? ` // ${s.week.label}` : ''}
          </p>
          <span className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] ${status.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot} shadow-[0_0_8px_currentColor]`} />{s.verdict.label}
          </span>
          <h1 id="brief-headline"
            className="bg-gradient-to-br from-white via-[#DDF6F8] to-[#7FE0E8] bg-clip-text text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-transparent [text-wrap:balance] sm:text-[34px]">
            {s.verdict.headline}
          </h1>
          {s.verdict.sub && <p className={`text-[15px] leading-relaxed ${C.sub}`}>{s.verdict.sub}</p>}
        </section>

        {/* One thing to do */}
        <section className="relative overflow-hidden rounded-2xl border border-[#5CD6E0]/35 bg-[linear-gradient(135deg,rgba(62,134,146,0.32),rgba(12,22,28,0.85)_60%)] p-5 shadow-[0_0_0_1px_rgba(92,214,224,0.06),0_18px_50px_-20px_rgba(92,214,224,0.45)]">
          <Corners />
          <div className="flex items-start gap-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#5CD6E0]/40 bg-[#5CD6E0]/10 text-[#5CD6E0] shadow-[0_0_20px_rgba(92,214,224,0.35)]">
              <Crosshair className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className={`font-mono text-[10.5px] font-medium uppercase tracking-[0.2em] ${C.accent}`}>One thing to do this week</p>
              <p className="mt-1.5 text-[17px] font-semibold leading-snug">{s.action.text}</p>
              <p className={`mt-1.5 text-sm leading-relaxed ${C.sub}`}>{s.action.why}</p>
            </div>
          </div>
        </section>

        {/* Three numbers */}
        <section aria-label="This week in three numbers" className="grid grid-cols-3 gap-2 sm:gap-3">
          {s.stats.share ? (
            <Stat icon={ChartPie} label="Korea’s share" value={`${s.stats.share.value}%`}
              note={s.stats.share.prev != null ? <><Arrow d={s.stats.share.value - s.stats.share.prev} /> from {s.stats.share.prev}%</> : 'first week'} />
          ) : (
            <Stat icon={ShieldCheck} label="Readiness" value={`${s.readiness?.filter((r) => r.ok).length ?? 0}/${s.readiness?.length ?? 0}`} note="checks passing" />
          )}
          {s.stats.volume ? (
            <Stat icon={Waves} label="Korean volume" value={usd(s.stats.volume.usd)}
              note={s.stats.volume.paceRatio == null ? 'no prior week' : s.stats.volume.paceRatio >= 1
                ? <><span className={C.up}>▲ {s.stats.volume.paceRatio.toFixed(1)}×</span> daily pace</>
                : <><span className={C.down}>▼ {Math.round((1 - s.stats.volume.paceRatio) * 100)}%</span> daily pace</>} />
          ) : (
            <Stat icon={Waves} label="Exchanges" value={String(s.venues.length || '—')} note="global, with volume" />
          )}
          <Stat icon={Radio} label="Korean posts" value={s.stats.posts.newThisWeek != null ? String(s.stats.posts.newThisWeek) : '—'}
            note={s.stats.posts.total != null ? `new · ${s.stats.posts.total} total` : 'new this week'} />
        </section>

        {/* The trend (listed) or the path to a listing (not listed) */}
        {s.client.listed && s.shareHistory.length > 1 ? (
          <Panel icon={ChartSpline} title="Korea’s share, week by week" subtitle="Upbit + Bithumb as a share of all trading">
            <div className="p-4 sm:p-5">
              <LineChart
                theme="dark"
                label={`Korea's share of ${ticker} trading by week`}
                points={s.shareHistory.map((h) => ({ x: short(h.week), y: h.share, hollow: h.partial, tip: `${short(h.week)}\nKorea share ${h.share}%\nKorean volume ${usd(h.volumeUsd)}` }))}
                min={0} max={niceMax(Math.max(...s.shareHistory.map((h) => h.share), 5))}
                ticks={ticksFor(niceMax(Math.max(...s.shareHistory.map((h) => h.share), 5)))}
                fmt={(v) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`}
              />
            </div>
          </Panel>
        ) : s.readiness ? (
          <Panel icon={ShieldCheck} title="Path to a Korean listing" subtitle="Checked automatically">
            <ul className="divide-y divide-[#5CD6E0]/10 px-4 py-1 sm:px-5">
              {s.readiness.map((r) => (
                <li key={r.label} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                  {r.ok
                    ? <CircleCheck className={`h-[18px] w-[18px] ${C.up}`} aria-label="Done" />
                    : <CircleDashed className={`h-[18px] w-[18px] ${C.warn}`} aria-label="Not yet" />}
                  <span className="min-w-0 text-sm">{r.label}<span className={`block text-xs ${C.muted}`}>{r.detail}</span></span>
                  <span className={`font-mono text-[11.5px] font-medium tabular-nums ${r.ok ? C.up : C.warn}`}>{r.value}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {/* One real voice */}
        {quote && (
          <Panel icon={Quote} title={stale ? 'What Koreans have been saying' : 'What Koreans are saying'}
            subtitle={stale ? 'From your campaign posts' : 'This week, translated'}>
            <div className="space-y-4 p-4 sm:p-5">
              <figure className="relative border-l-2 border-[#5CD6E0] pl-4">
                <blockquote className="text-[17px] leading-snug">{quote.ko}</blockquote>
                {quote.en && <figcaption className={`mt-1.5 text-[15px] leading-snug ${C.sub}`}>“{quote.en}”</figcaption>}
                <p className={`mt-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] ${LABEL_TEXT[quote.label] ?? C.sub}`}>
                  ● {quote.label}
                </p>
              </figure>
              {s.comments.themes.length > 0 && (
                <div>
                  <p className={`mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] ${C.muted}`}>What keeps coming up</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.comments.themes.slice(0, 4).map((t) => (
                      <span key={t.theme} className={`inline-flex items-center gap-2 rounded-md border border-[#5CD6E0]/15 bg-white/[0.03] px-2.5 py-1 text-[13px] ${C.sub}`}>
                        {capitalize(t.theme)}<b className={`font-mono text-[11.5px] font-semibold ${C.accent}`}>{t.count}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* The market, in words first */}
        {m && (
          <Panel icon={CandlestickChart} title="The Korean market" subtitle="Context for this week">
            <div className="space-y-4 p-4 sm:p-5">
              <p className={`text-[15px] leading-relaxed ${C.sub}`}>
                <b className={`font-semibold ${C.fg}`}>Korean stocks {m.kospiPct == null ? 'closed' : m.kospiPct >= 0 ? `rose ${m.kospiPct}%` : `fell ${Math.abs(m.kospiPct)}%`}</b> (KOSPI {m.kospi.toLocaleString('en-US')}).{' '}
                <b className={`font-semibold ${C.fg}`}>Koreans are paying {Math.abs(m.kimchiPct).toFixed(1)}% {m.kimchiPct >= 0 ? 'more' : 'less'} for crypto</b> than the rest of the world.
                {m.krCexPct != null && <> Overall Korean crypto trading {m.krCexPct >= 0 ? 'rose' : 'fell'} {Math.abs(Math.round(m.krCexPct))}%.</>}
              </p>
              {s.market.series.length > 1 && (
                <div>
                  <p className={`mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] ${C.muted}`}>How much more Koreans pay for crypto</p>
                  <ColumnChart
                    theme="dark"
                    label="Korean crypto price premium over global, weekly"
                    points={s.market.series.map((p) => ({ x: short(p.week), y: p.kimchiPct, tip: `${short(p.week)}\n${p.kimchiPct >= 0 ? '+' : ''}${p.kimchiPct.toFixed(2)}%` }))}
                    min={-1.5} max={1.5} ticks={[-1.5, 0, 1.5]} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                  />
                  <p className={`mt-2 text-xs ${C.muted}`}>Above zero, Koreans are paying up to buy, a good window for content.</p>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Way into the detail */}
        {portalUrl && (
          <section className={`rounded-2xl p-5 ${C.panel}`}>
            <p className="text-[15px] font-semibold">Want the detail?</p>
            <p className={`mt-1 text-sm ${C.sub}`}>Exchanges, every Korean comment, listings and creators are in the Korea section of your portal.</p>
            <a href={`${portalUrl}#korea`}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#3e8692] to-[#5CD6E0] px-4 py-2.5 text-sm font-semibold text-[#03171B] shadow-[0_0_24px_rgba(92,214,224,0.4)] transition hover:shadow-[0_0_32px_rgba(92,214,224,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5CD6E0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05090D]">
              Open the full Korea report<ArrowUpRight className="h-4 w-4" />
            </a>
            <p className={`mt-2 text-xs ${C.muted}`}>Your portal asks for your email the first time.</p>
          </section>
        )}

        <p className={`pt-3 text-center font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.12em] ${C.muted}`}>
          Prepared by your Holo Hive account team · updated every Saturday<br />
          Figures cover Upbit and Bithumb{s.week ? `, ${s.week.label}` : ''}
        </p>
      </main>
    </div>
  );
}

type Icon = ComponentType<{ className?: string }>;

function Panel({ icon: I, title, subtitle, children }: { icon: Icon; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-2xl ${C.panel}`}>
      <div className="flex items-center gap-3 border-b border-[#5CD6E0]/10 px-4 py-3.5 sm:px-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#5CD6E0]/25 bg-[#5CD6E0]/[0.08] text-[#5CD6E0]">
          <I className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
          <p className={`mt-0.5 text-xs ${C.muted}`}>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({ icon: I, label, value, note }: { icon: Icon; label: string; value: string; note: ReactNode }) {
  return (
    <div className={`relative min-w-0 overflow-hidden rounded-xl p-3 sm:p-4 ${C.panel}`}>
      <span aria-hidden className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-[#5CD6E0]/70 to-transparent" />
      <I className={`h-4 w-4 ${C.accent}`} />
      <p className={`mt-2 font-mono text-[9.5px] font-medium uppercase leading-tight tracking-[0.14em] ${C.muted}`}>{label}</p>
      <p className="mt-1.5 font-mono text-[21px] font-semibold leading-none tracking-tight tabular-nums [text-shadow:0_0_18px_rgba(92,214,224,0.45)] sm:text-[26px]">{value}</p>
      <p className={`mt-1.5 text-xs leading-snug ${C.muted}`}>{note}</p>
    </div>
  );
}

/** Viewfinder brackets on the action card's corners. */
function Corners() {
  const b = 'pointer-events-none absolute h-3 w-3 border-[#5CD6E0]';
  return (
    <span aria-hidden>
      <span className={`${b} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${b} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${b} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${b} bottom-2 right-2 border-b-2 border-r-2`} />
    </span>
  );
}

function Arrow({ d }: { d: number }) {
  return d > 0 ? <span className={C.up}>▲</span> : d < 0 ? <span className={C.down}>▼</span> : <span>⟷</span>;
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
