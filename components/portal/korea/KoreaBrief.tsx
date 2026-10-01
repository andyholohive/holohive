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

import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight, CircleCheck, CircleDashed } from 'lucide-react';
import type { KoreaSummary } from '@/lib/koreaIntel/summary';
import { PortalTopBar } from '@/components/portal/PortalTopBar';
import { ColumnChart, LineChart } from './KoreaCharts';
import { BriefMotionStyles, CountUp, Reveal } from './briefMotion';
import {
  BroadcastGlyph, GlyphBadge, MarketGlyph, RadarGlyph, ShareGlyph, ShieldGlyph,
  TargetGlyph, TrendGlyph, VoiceGlyph, VolumeGlyph,
} from './briefGlyphs';

/*
 * Night theme. This page is the client's own object, opened from Telegram,
 * so it gets its own look instead of the admin app's cream: a dark "signal
 * console" with the brand teal lifted to #5CD6E0 so it holds contrast on the
 * dark ground. Colors live here as tokens so the theme moves as one file.
 * Text steps measured on PANEL (#0C161C): fg 16.6:1, sub 9.4:1, muted 5.9:1.
 */
const C = {
  bg: 'bg-[#05090D]',
  panel: 'border border-[#5CD6E0]/[0.14] bg-[#0C161C]/80 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_40px_-24px_rgba(0,0,0,0.8)]',
  fg: 'text-[#EAF6F7]',
  sub: 'text-[#A9BEC1]',
  muted: 'text-[#7F979B]',
  accent: 'text-[#5CD6E0]',
  up: 'text-[#4ADE9A]',
  down: 'text-[#FB7F93]',
  warn: 'text-[#FBBF24]',
  kicker: 'font-mono text-[10px] font-medium uppercase tracking-[0.2em]',
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

const d = (ms: number) => ({ '--d': `${ms}ms` } as CSSProperties);

export function KoreaBrief({ s, portalUrl, clientLogoUrl = null }: {
  s: KoreaSummary; portalUrl: string | null; clientLogoUrl?: string | null;
}) {
  const ticker = `$${s.client.ticker}`;
  const m = s.market.latest;
  const quote = s.comments.featured ?? s.comments.quotes[0] ?? null;
  const stale = s.comments.latest ? (Date.now() - Date.parse(s.comments.latest)) / 86_400_000 > 21 : false;
  const status = STATUS[s.verdict.status] ?? STATUS.steady;

  return (
    <div className={`kb-root relative min-h-screen overflow-x-clip ${C.bg} ${C.fg} [color-scheme:dark]`}>
      <BriefMotionStyles />
      <Backdrop />

      {/* Same bar as the client portal. */}
      <PortalTopBar clientName={s.client.name} clientLogoUrl={clientLogoUrl} containerClassName="max-w-2xl" surfaceClassName="bg-white/[0.97]" />

      <main className="relative mx-auto max-w-2xl space-y-5 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        {/* The answer */}
        <section aria-labelledby="brief-headline" className="relative space-y-4">
          <div className="kb-enter flex items-center justify-between gap-3" style={d(0)}>
            <p className={`flex items-center gap-2 ${C.kicker} ${C.accent}`}>
              <RadarGlyph className="h-4 w-4" />Korea brief
            </p>
            {s.week && <p className={`${C.kicker} ${C.muted}`}>{s.week.label}</p>}
          </div>
          <div className="kb-enter" style={d(120)}>
            <span className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-2 pr-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] ${status.text}`}>
              <span className="relative flex h-2 w-2">
                <span className={`absolute inset-0 rounded-full ${status.dot} opacity-60 motion-safe:animate-ping`} />
                <span className={`relative h-2 w-2 rounded-full ${status.dot}`} />
              </span>
              {s.verdict.label}
            </span>
          </div>
          <h1 id="brief-headline" style={d(220)}
            className="kb-enter bg-gradient-to-br from-white via-[#DDF6F8] to-[#7FE0E8] bg-clip-text text-[28px] font-semibold leading-[1.14] tracking-[-0.032em] text-transparent [text-wrap:balance] sm:text-[36px]">
            {s.verdict.headline}
          </h1>
          {s.verdict.sub && <p style={d(340)} className={`kb-enter max-w-[56ch] text-[15px] leading-relaxed ${C.sub}`}>{s.verdict.sub}</p>}
        </section>

        {/* One thing to do — spinning light around the rim. */}
        <section style={d(460)} className="kb-enter relative overflow-hidden rounded-2xl p-px">
          <span aria-hidden className="absolute left-1/2 top-1/2 -ml-[320px] -mt-[320px] h-[640px] w-[640px] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(92,214,224,0.9)_40deg,transparent_110deg,transparent_200deg,rgba(62,134,146,0.7)_240deg,transparent_300deg)] motion-safe:animate-[kb-spin_6s_linear_infinite]" />
          <div className="relative rounded-[15px] bg-[linear-gradient(140deg,#0F2A31,#0A151B_55%)] p-5">
            <div className="flex items-start gap-4">
              <GlyphBadge size="lg"><TargetGlyph className="h-6 w-6" /></GlyphBadge>
              <div className="min-w-0">
                <p className={`${C.kicker} ${C.accent}`}>One thing to do this week</p>
                <p className="mt-1.5 text-[17px] font-semibold leading-snug">{s.action.text}</p>
                <p className={`mt-1.5 text-sm leading-relaxed ${C.sub}`}>{s.action.why}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Three numbers */}
        <section aria-label="This week in three numbers" className="grid grid-cols-3 gap-2 sm:gap-3">
          {s.stats.share ? (
            <Stat delay={560} glyph={<ShareGlyph className="h-4 w-4" />} label="KR share" value={`${s.stats.share.value}%`}
              note={s.stats.share.prev != null ? <><Arrow d={s.stats.share.value - s.stats.share.prev} /> from {s.stats.share.prev}%</> : 'first week'} />
          ) : (
            <Stat delay={560} glyph={<ShieldGlyph className="h-4 w-4" />} label="Readiness" value={`${s.readiness?.filter((r) => r.ok).length ?? 0}/${s.readiness?.length ?? 0}`} note="checks passing" />
          )}
          {s.stats.volume ? (
            <Stat delay={640} glyph={<VolumeGlyph className="h-4 w-4" />} label="KR volume" value={usd(s.stats.volume.usd)}
              note={s.stats.volume.paceRatio == null ? 'no prior week' : s.stats.volume.paceRatio >= 1
                ? <><span className={C.up}>▲ {s.stats.volume.paceRatio.toFixed(1)}×</span> daily pace</>
                : <><span className={C.down}>▼ {Math.round((1 - s.stats.volume.paceRatio) * 100)}%</span> daily pace</>} />
          ) : (
            <Stat delay={640} glyph={<VolumeGlyph className="h-4 w-4" />} label="Exchanges" value={String(s.venues.length || '—')} note="global, with volume" />
          )}
          <Stat delay={720} glyph={<BroadcastGlyph className="h-4 w-4" />} label="KR posts" value={s.stats.posts.newThisWeek != null ? String(s.stats.posts.newThisWeek) : '—'}
            note={s.stats.posts.total != null ? `new · ${s.stats.posts.total} total` : 'new this week'} />
        </section>

        {/* The trend (listed) or the path to a listing (not listed) */}
        {s.client.listed && s.shareHistory.length > 1 ? (
          <Panel glyph={<TrendGlyph className="h-[18px] w-[18px]" />} title="Korea’s share, week by week" subtitle="Upbit + Bithumb as a share of all trading">
            <div className="px-3 pb-4 pt-3 sm:px-5">
              <LineChart
                theme="dark" animate
                label={`Korea's share of ${ticker} trading by week`}
                points={s.shareHistory.map((h) => ({ x: short(h.week), y: h.share, hollow: h.partial, tip: `${short(h.week)}\nKorea share ${h.share}%\nKorean volume ${usd(h.volumeUsd)}` }))}
                min={0} max={niceMax(Math.max(...s.shareHistory.map((h) => h.share), 5))}
                ticks={ticksFor(niceMax(Math.max(...s.shareHistory.map((h) => h.share), 5)))}
                fmt={(v) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`}
              />
            </div>
          </Panel>
        ) : s.readiness ? (
          <Panel glyph={<ShieldGlyph className="h-[18px] w-[18px]" />} title="Path to a Korean listing" subtitle="Checked automatically">
            <ul className="divide-y divide-[#5CD6E0]/10 px-4 py-1 sm:px-5">
              {s.readiness.map((r, i) => (
                <li key={r.label} style={d(200 + i * 90)} className="kb-item grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                  {r.ok
                    ? <CircleCheck className={`h-[18px] w-[18px] ${C.up}`} aria-label="Done" />
                    : <CircleDashed className={`h-[18px] w-[18px] ${C.warn} motion-safe:animate-[kb-spin_8s_linear_infinite]`} aria-label="Not yet" />}
                  <span className="min-w-0 text-sm">{r.label}<span className={`block text-xs ${C.muted}`}>{r.detail}</span></span>
                  <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums ${r.ok ? `border-[#4ADE9A]/25 ${C.up}` : `border-[#FBBF24]/25 ${C.warn}`}`}>{r.value}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {/* One real voice */}
        {quote && (
          <Panel glyph={<VoiceGlyph className="h-[18px] w-[18px]" />} title={stale ? 'What Koreans have been saying' : 'What Koreans are saying'}
            subtitle={stale ? 'From your campaign posts' : 'This week, translated'}>
            <div className="space-y-5 p-4 sm:p-5">
              <figure className="relative overflow-hidden rounded-xl border border-[#5CD6E0]/12 bg-[linear-gradient(135deg,rgba(92,214,224,0.08),rgba(92,214,224,0)_60%)] py-4 pl-5 pr-4">
                <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-gradient-to-b from-[#5CD6E0] to-[#3e8692] shadow-[0_0_12px_rgba(92,214,224,0.7)]" />
                <span aria-hidden className="absolute -right-1 -top-4 select-none font-serif text-[88px] leading-none text-[#5CD6E0]/10">”</span>
                <blockquote className="relative text-[17px] leading-snug">{quote.ko}</blockquote>
                {quote.en && <figcaption className={`relative mt-2 text-[15px] leading-snug ${C.sub}`}>“{quote.en}”</figcaption>}
                <p className={`relative mt-3 inline-flex items-center gap-1.5 ${C.kicker} ${LABEL_TEXT[quote.label] ?? C.sub}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />{quote.label}
                </p>
              </figure>
              {s.comments.themes.length > 0 && (
                <div>
                  <p className={`mb-2.5 ${C.kicker} ${C.muted}`}>What keeps coming up</p>
                  <ThemeBars themes={s.comments.themes.slice(0, 4)} />
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* The market, in words first */}
        {m && (
          <Panel glyph={<MarketGlyph className="h-[18px] w-[18px]" />} title="The Korean market" subtitle="Context for this week">
            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="KOSPI" value={m.kospi.toLocaleString('en-US')}
                  delta={m.kospiPct == null ? 'closed' : `${m.kospiPct >= 0 ? '▲' : '▼'} ${Math.abs(m.kospiPct)}%`} good={m.kospiPct == null ? null : m.kospiPct >= 0} />
                <MiniStat label="Kimchi premium" value={`${m.kimchiPct >= 0 ? '+' : ''}${m.kimchiPct.toFixed(1)}%`}
                  delta={m.kimchiPct >= 0 ? 'Koreans pay more' : 'Koreans pay less'} good={m.kimchiPct >= 0} />
              </div>
              <p className={`text-[15px] leading-relaxed ${C.sub}`}>
                <b className={`font-semibold ${C.fg}`}>Korean stocks {m.kospiPct == null ? 'closed' : m.kospiPct >= 0 ? `rose ${m.kospiPct}%` : `fell ${Math.abs(m.kospiPct)}%`}</b>.{' '}
                <b className={`font-semibold ${C.fg}`}>Koreans are paying {Math.abs(m.kimchiPct).toFixed(1)}% {m.kimchiPct >= 0 ? 'more' : 'less'} for crypto</b> than the rest of the world.
                {m.krCexPct != null && <> Overall Korean crypto trading {m.krCexPct >= 0 ? 'rose' : 'fell'} {Math.abs(Math.round(m.krCexPct))}%.</>}
              </p>
              {s.market.series.length > 1 && (
                <div>
                  <p className={`mb-1 ${C.kicker} ${C.muted}`}>How much more Koreans pay for crypto</p>
                  <ColumnChart
                    theme="dark" animate
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
          <Reveal as="section" className={`relative overflow-hidden rounded-2xl p-5 ${C.panel}`}>
            <span aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#5CD6E0]/15 blur-3xl" />
            <p className="relative text-[15px] font-semibold">Want the detail?</p>
            <p className={`relative mt-1 text-sm ${C.sub}`}>Exchanges, every Korean comment, listings and creators are in the Korea section of your portal.</p>
            <a href={`${portalUrl}#korea`}
              className="group relative mt-4 inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-[#3e8692] to-[#5CD6E0] px-4 py-2.5 text-sm font-semibold text-[#03171B] shadow-[0_0_24px_rgba(92,214,224,0.4)] transition-shadow hover:shadow-[0_0_36px_rgba(92,214,224,0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5CD6E0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05090D]">
              <span aria-hidden className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent motion-safe:animate-[kb-shimmer_3.2s_ease-in-out_infinite]" />
              <span className="relative">Open the full Korea report</span>
              <ArrowUpRight className="relative h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <p className={`relative mt-2 text-xs ${C.muted}`}>Your portal asks for your email the first time.</p>
          </Reveal>
        )}

        <p className={`pt-4 text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] ${C.muted}`}>
          Prepared by your Holo Hive account team · updated every Saturday<br />
          Figures cover Upbit and Bithumb{s.week ? `, ${s.week.label}` : ''}
        </p>
      </main>
    </div>
  );
}

/** Drifting aurora + slowly panning grid + one scan line, fixed behind the page. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-1/4 -top-40 h-[520px] w-[520px] rounded-full bg-[#3e8692]/45 blur-[110px] motion-safe:animate-[kb-drift-a_18s_ease-in-out_infinite]" />
      <div className="absolute -right-1/4 top-24 h-[420px] w-[420px] rounded-full bg-[#1d4ed8]/20 blur-[110px] motion-safe:animate-[kb-drift-b_22s_ease-in-out_infinite]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,210,218,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,210,218,0.06)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_90%_70%_at_50%_0%,black,transparent)] motion-safe:animate-[kb-pan_6s_linear_infinite]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-[#5CD6E0]/[0.07] to-transparent motion-safe:animate-[kb-scan_7s_ease-in-out_infinite] motion-reduce:hidden" />
    </div>
  );
}

function Panel({ glyph, title, subtitle, children }: { glyph: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <Reveal as="section" className={`relative overflow-hidden rounded-2xl ${C.panel}`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-px overflow-hidden">
        <span className="block h-px w-full bg-gradient-to-r from-transparent via-[#5CD6E0]/80 to-transparent motion-safe:animate-[kb-sweep_4.5s_ease-in-out_infinite]" />
      </span>
      <div className="flex items-center gap-3 border-b border-[#5CD6E0]/10 px-4 py-3.5 sm:px-5">
        <GlyphBadge>{glyph}</GlyphBadge>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
          <p className={`mt-0.5 text-xs ${C.muted}`}>{subtitle}</p>
        </div>
      </div>
      {children}
    </Reveal>
  );
}

function Stat({ glyph, label, value, note, delay }: { glyph: ReactNode; label: string; value: string; note: ReactNode; delay: number }) {
  return (
    <div style={d(delay)} className={`kb-enter relative min-w-0 overflow-hidden rounded-xl p-3 sm:p-4 ${C.panel}`}>
      <span aria-hidden className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-[#5CD6E0]/70 to-transparent" />
      <div className="flex items-center justify-between gap-1">
        <p className={`truncate font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] ${C.muted}`}>{label}</p>
        <span className={C.accent}>{glyph}</span>
      </div>
      <p className="mt-2.5 font-mono text-[21px] font-semibold leading-none tracking-tight tabular-nums [text-shadow:0_0_18px_rgba(92,214,224,0.45)] sm:text-[26px]">
        <CountUp value={value} delay={delay} />
      </p>
      <p className={`mt-2 text-[11.5px] leading-snug ${C.muted}`}>{note}</p>
    </div>
  );
}

function MiniStat({ label, value, delta, good }: { label: string; value: string; delta: string; good: boolean | null }) {
  return (
    <div className="rounded-xl border border-[#5CD6E0]/10 bg-white/[0.02] px-3 py-2.5">
      <p className={`${C.kicker} ${C.muted} tracking-[0.14em]`}>{label}</p>
      <p className="mt-1 font-mono text-[17px] font-semibold tabular-nums"><CountUp value={value} /></p>
      <p className={`mt-0.5 text-[11.5px] ${good == null ? C.muted : good ? C.up : C.down}`}>{delta}</p>
    </div>
  );
}

/** Recurring comment themes as labelled bars that fill in on reveal. */
function ThemeBars({ themes }: { themes: Array<{ theme: string; count: number }> }) {
  const max = Math.max(...themes.map((t) => t.count), 1);
  return (
    <ul className="grid gap-2">
      {themes.map((t, i) => (
        <li key={t.theme} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className={`truncate text-[13px] ${C.sub}`}>{capitalize(t.theme)}</span>
          <span className={`font-mono text-[12px] font-semibold tabular-nums ${C.accent}`}>{t.count}</span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <span className="kb-bar-x block h-full rounded-full bg-gradient-to-r from-[#3e8692] to-[#5CD6E0] shadow-[0_0_10px_rgba(92,214,224,0.6)]"
              style={{ width: `${Math.max((t.count / max) * 100, 6)}%`, '--i': i } as CSSProperties} />
          </span>
        </li>
      ))}
    </ul>
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
