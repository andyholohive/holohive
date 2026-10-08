'use client';

/**
 * Renewal deck — the client-facing pack rendered at /public/renewal/[token]
 * (and previewed in the dashboard's Renewal pack dialog). One section per
 * slide, numbered like a deck, each with a kicker, a title that says the
 * point, and the evidence under it. Built from the same components as the
 * dashboard so the numbers match what the team sees.
 *
 * Takes a frozen, client-safe RenewalSnapshot (lib/renewalPack.ts) — never
 * the live dashboard payload.
 */

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { BarList } from '@/components/portal/korea/KoreaCharts';
import { ExternalLink, Sparkles, Radar, TrendingUp } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import { ReachHero, Placement, Scorecard } from '@/components/clients/ClientDashboard';
import { JourneyTimeline } from '@/components/clients/position/JourneyTimeline';
import { PositionStudio } from '@/components/clients/position/PositionStudio';
import { asDashboard, type RenewalSlide, type RenewalSnapshot } from '@/lib/renewalPack';

const num = (n: number) => n.toLocaleString('en-US');
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(Math.round(n)));
const SENT: Record<string, { label: string; tone: 'brand' | 'good' | 'bad' | 'mute' }> = {
  question: { label: 'Questions', tone: 'brand' }, positive: { label: 'Positive', tone: 'good' },
  hype: { label: 'Hype', tone: 'brand' }, negative: { label: 'Negative', tone: 'bad' }, fud: { label: 'FUD', tone: 'bad' },
};

function Section({ n, total, kicker, title, sub, children }: { n: number; total: number; kicker: string; title: ReactNode; sub?: string; children: ReactNode }) {
  return (
    <section className="rd-in rounded-[20px] border border-cream-200 bg-white/80 p-5 shadow-card sm:p-8" style={{ animationDelay: `${n * 60}ms` }}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-deep">{kicker}</p>
        <p className="font-mono text-[10px] tracking-[0.12em] text-ink-warm-400">{String(n).padStart(2, '0')} / {String(total).padStart(2, '0')}</p>
      </div>
      <h2 className="display-serif text-[26px] leading-[1.15] text-ink-warm-900 sm:text-[32px]" style={{ textWrap: 'balance' } as any}>{title}</h2>
      {sub && <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-ink-warm-500">{sub}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
      <p className="display-serif text-[34px] leading-none text-white tabular-nums sm:text-[40px]">{value}</p>
      <p className="mt-2 text-[12.5px] leading-snug text-white/75">{label}</p>
    </div>
  );
}

export function RenewalDeck({ s, slides, preparedFor, note }: { s: RenewalSnapshot; slides: RenewalSlide[]; preparedFor?: string | null; note?: string | null }) {
  const d = asDashboard(s);
  const t = s.totals;
  const p = s.placement;
  const weeks = s.week?.weekNumber ?? null;
  const span = s.journey.start && s.journey.end ? `${formatDate(s.journey.start)} to ${formatDate(s.journey.end)}` : s.startDate ? `Since ${formatDate(s.startDate)}` : '';
  const er = t && t.reads ? ((t.engagements / t.reads) * 100).toFixed(2) : null;
  const done = s.weekly.filter((w) => !w.partial);
  const recent = done.slice(-4);
  const perWeek = recent.length ? recent.reduce((n, w) => n + w.reads, 0) / recent.length : 0;
  const total = slides.length;
  const good = s.sentiment ? s.sentiment.byLabel.filter((x) => x.label === 'positive' || x.label === 'hype').reduce((n, x) => n + x.count, 0) : 0;

  const render: Record<RenewalSlide, (n: number) => ReactNode> = {
    cover: (n) => (
      <section key="cover" className="rd-in relative overflow-hidden rounded-[24px] bg-gradient-to-br from-brand-deep via-brand-dark to-brand p-6 text-white shadow-btn-brand sm:p-10" style={{ animationDelay: '0ms' }}>
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">{preparedFor ? `Prepared for ${preparedFor}` : 'Renewal review'}</p>
            <p className="font-mono text-[10px] tracking-[0.12em] text-white/50">{String(n).padStart(2, '0')} / {String(total).padStart(2, '0')}</p>
          </div>
          <div className="mt-8 flex items-center gap-4">
            {s.client.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.client.logoUrl} alt={s.client.name} className="h-14 w-14 rounded-xl border border-white/30 bg-white object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/15 text-xl font-semibold">{s.client.name.charAt(0).toUpperCase()}</div>
            )}
            <div>
              <h1 className="display-serif text-[38px] leading-[1.05] sm:text-[52px]">{s.client.name} <span className="display-serif-italic text-emerald-200">in Korea.</span></h1>
              <p className="mt-1 text-sm text-white/70">{weeks ? `${weeks} weeks with Holo Hive` : 'With Holo Hive'}{span ? ` · ${span}` : ''}</p>
            </div>
          </div>
          {t && (
            <p className="mt-8 max-w-[52ch] text-lg leading-snug text-white/90 sm:text-xl" style={{ textWrap: 'balance' } as any}>
              {compact(t.reads)} reads across {num(t.posts)} posts from {t.creators} Korean creators
              {p?.categoryRank ? `, and #${p.categoryRank} of ${p.categoryOf} ${p.category} projects on Korean Telegram.` : '.'}
            </p>
          )}
          {t && (
            <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Big value={compact(t.reads)} label="Reads on delivered posts" />
              <Big value={num(t.posts)} label={t.byPlatform.map((x) => `${x.posts} ${x.platform}`).join(' · ')} />
              <Big value={String(t.creators)} label="Korean creators posted" />
              <Big value={er ? `${er}%` : '—'} label="of readers engaged" />
            </div>
          )}
        </div>
      </section>
    ),
    journey: (n) => (
      <Section key="journey" n={n} total={total} kicker="The journey" title="Where the campaign has been, and where it is now."
        sub="Every lineup week, the best week and the top post, on one line.">
        <JourneyTimeline d={d} audience="client" />
      </Section>
    ),
    results: (n) => (
      <Section key="results" n={n} total={total} kicker="Results" title={t ? <>{compact(t.reads)} reads, <span className="display-serif-italic text-brand">{s.journey.bestWeek ? `peaking at ${compact(s.journey.bestWeek.reads)} in a week.` : 'week after week.'}</span></> : 'Results'}
        sub="Views on every delivered post, by the week it went live.">
        <ReachHero d={d} audience="client" />
      </Section>
    ),
    position: (n) => (
      <Section key="position" n={n} total={total} kicker="Korea position"
        title={p?.categoryRank ? <>#{p.categoryRank} of {p.categoryOf} <span className="display-serif-italic text-brand">{p.category} projects</span> in Korean Telegram.</> : p ? <>#{p.rank} of {p.of} tracked projects in Korean Telegram.</> : 'Korea position'}
        sub="Share of every mention across the projects Korea Signal tracks. Press play to watch the weeks.">
        <div className="space-y-4">
          {s.position && <PositionStudio s={s.position} />}
          <Placement d={d} audience="client" />
        </div>
      </Section>
    ),
    community: (n) => s.sentiment && (
      <Section key="community" n={n} total={total} kicker="Community"
        title={<>{s.sentiment.counted ? Math.round((good / s.sentiment.counted) * 100) : 0}% of Korean comments <span className="display-serif-italic text-brand">were positive.</span></>}
        sub={`${s.sentiment.counted} comments with a clear signal, after filtering ${s.sentiment.filtered} bot and filler replies.`}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <BarList fmt={(v) => String(v)} rows={s.sentiment.byLabel.map((x) => ({ label: SENT[x.label]?.label ?? x.label, value: x.count, tone: SENT[x.label]?.tone ?? 'mute', strong: x.label === 'positive' }))} />
          <div className="space-y-3">
            {s.sentiment.quotes.map((q) => (
              <figure key={q.ko} className="accent-l-brand rounded-r-lg bg-cream-50 px-4 py-3">
                <blockquote className="text-[15px] leading-snug text-ink-warm-900" lang="ko">{q.ko}</blockquote>
                <figcaption className="mt-1 text-[13px] text-ink-warm-700">“{q.en}”</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Section>
    ),
    creators: (n) => (
      <Section key="creators" n={n} total={total} kicker="Creators" title={<>The voices that <span className="display-serif-italic text-brand">carried it.</span></>}
        sub="Top creators by total views on their posts.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            {s.creators.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="w-6 font-mono text-xs text-ink-warm-400">{String(i + 1).padStart(2, '0')}</span>
                <span className="w-40 truncate font-medium text-ink-warm-900 sm:w-56">{c.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-cream-100">
                  <span className={`block h-full rounded-full ${i === 0 ? 'bg-brand' : 'bg-brand/50'}`} style={{ width: `${(c.reads / Math.max(s.creators[0].reads, 1)) * 100}%` }} />
                </span>
                <span className="w-16 text-right text-sm font-medium tabular-nums text-ink-warm-900">{compact(c.reads)}</span>
              </div>
            ))}
          </div>
          {s.journey.topPost && (
            <Card className="crd-feature border-0 p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-deep"><Sparkles className="h-3.5 w-3.5" />Top post</p>
              <p className="mt-3 display-serif text-[40px] leading-none text-ink-warm-900 tabular-nums">{compact(s.journey.topPost.reads)}</p>
              <p className="mt-1 text-sm text-ink-warm-500">reads · {s.journey.topPost.kol} on {s.journey.topPost.platform}, {formatDate(s.journey.topPost.date)}</p>
              {s.journey.topPost.url && (
                <a href={s.journey.topPost.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-deep">
                  Open the post<ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </Card>
          )}
        </div>
      </Section>
    ),
    scorecard: (n) => (
      <Section key="scorecard" n={n} total={total} kicker="Where we stand" title={<>The campaign, <span className="display-serif-italic text-brand">signal by signal.</span></>}
        sub="Each line compares now with earlier in the campaign, or with a typical Holo Hive campaign.">
        <Scorecard d={d} audience="client" />
      </Section>
    ),
    next: (n) => (
      <Section key="next" n={n} total={total} kicker="Next term" title={<>What the next term <span className="display-serif-italic text-brand">can build on.</span></>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {note && (
            <div className="rounded-2xl border border-cream-200 bg-cream-50/70 p-5 lg:col-span-3">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-warm-800">{note}</p>
            </div>
          )}
          {s.coverage && (
            <div className="crd-feature p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-deep"><Radar className="h-3.5 w-3.5" />Room to grow</p>
              <p className="mt-3 display-serif text-[40px] leading-none text-ink-warm-900 tabular-nums">{s.coverage.gap}</p>
              <p className="mt-1 text-sm text-ink-warm-500">Korean channels that cover your peers but haven&apos;t covered you yet.</p>
            </div>
          )}
          {s.coverage && (
            <div className="rounded-2xl border border-cream-200 bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Earned coverage</p>
              <p className="mt-3 display-serif text-[40px] leading-none text-ink-warm-900 tabular-nums">{s.coverage.organic}</p>
              <p className="mt-1 text-sm text-ink-warm-500">channels wrote about you without being paid to, out of {s.coverage.covering} covering you.</p>
            </div>
          )}
          {perWeek > 0 && (
            <div className="rounded-2xl border border-cream-200 bg-white p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500"><TrendingUp className="h-3.5 w-3.5" />At this pace</p>
              <p className="mt-3 display-serif text-[40px] leading-none text-ink-warm-900 tabular-nums">+{compact(perWeek * 12)}</p>
              <p className="mt-1 text-sm text-ink-warm-500">reads over another 12 weeks, at the last month&apos;s {compact(perWeek)} a week.</p>
            </div>
          )}
        </div>
      </Section>
    ),
  };

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <style>{`
        @keyframes rd-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .rd-in { animation: rd-in .7s cubic-bezier(.22,.8,.3,1) both; }
        @media (prefers-reduced-motion: reduce) { .rd-in { animation: none; } }
      `}</style>
      {slides.map((id, i) => render[id](i + 1))}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-xs text-ink-warm-500">
        <span className="flex items-center gap-2"><StatusBadge tone="brand" size="sm">Holo Hive</StatusBadge>Prepared {formatDate(s.createdAt)}</span>
        <span>Korean Telegram data from Korea Signal. Not for publication.</span>
      </div>
    </div>
  );
}
