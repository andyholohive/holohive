'use client';

/**
 * Korea Scan deck — any project, not only clients.
 *
 * Built to Yano's template grammar (RISE scan + his four templates, Sep 2026):
 * 16:9 slides, one idea per slide, kicker top-left, the window and source in
 * the footer beside the Holo Hive mark, a bold first sentence that tells the
 * reader where to look. Light cream + the Holo Hive green ramp.
 *
 * Sizing: slides are drawn on a 1280-unit grid (`--u` = slide width / 1280)
 * and keep a 16:9 shape from 640px wide up. Narrower than that (a phone,
 * opened from Telegram) they become a stacked page with readable minimum
 * type sizes instead of a shrunken picture.
 *
 * Which slides appear, and in what order, is the caller's choice (`slides`);
 * see lib/koreaScan/angles.ts for the catalog and the per-project angles.
 */

import type { ReactNode } from 'react';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { KoreaScan } from '@/lib/koreaScan/compute';
import { COVERAGE_LABEL, COVERAGE_TYPES, type CoverageType } from '@/lib/koreaScan/classify';
import { kickerFor, ordinal, scanNarrative, type KickerMode } from '@/lib/koreaScan/narrative';
import { SLIDES, slideMeta, type SlideId } from '@/lib/koreaScan/angles';

/** Holo Hive green ramp, darkest first (from Yano's templates). */
const G = ['#1E5B40', '#5E8C74', '#9BB8A7', '#C9D9CE', '#E2EAE4'] as const;
const INK = '#16140F';
const SUB = '#46423A';
const MUTED = '#6B6557';
const LINE = '#E6E1D4';
const SEG: Record<CoverageType, { bg: string; fg: string }> = {
  analysis: { bg: G[0], fg: '#fff' },
  news: { bg: G[1], fg: '#fff' },
  price: { bg: G[2], fg: INK },
  farming: { bg: G[3], fg: INK },
  calendar: { bg: G[4], fg: INK },
};

/* Type scale on the 1280 grid, each with a phone floor (px). */
const CSS = `
.ks-wrap { container-type: inline-size; }
.ks-slide { --u: 0.6px; display: flex; flex-direction: column; background: #FAF8F3; color: ${INK};
  padding: max(calc(var(--u) * 56), 20px) max(calc(var(--u) * 64), 20px) max(calc(var(--u) * 34), 18px); }
@container (min-width: 640px) { .ks-slide { --u: calc(100cqw / 1280); min-height: 56.25cqw; } }
.ks-kicker { font-size: max(calc(var(--u) * 12.5), 10px); font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: ${G[0]}; }
.ks-title { font-size: max(calc(var(--u) * 42), 23px); line-height: 1.1; font-weight: 500; letter-spacing: -0.025em; text-wrap: balance; }
.ks-hero { font-size: max(calc(var(--u) * 64), 32px); line-height: 1.05; font-weight: 500; letter-spacing: -0.03em; }
.ks-sub { font-size: max(calc(var(--u) * 17), 14px); line-height: 1.5; color: ${SUB}; }
.ks-body { font-size: max(calc(var(--u) * 15.5), 13.5px); line-height: 1.6; color: ${SUB}; }
.ks-lead { font-size: max(calc(var(--u) * 26), 18px); line-height: 1.3; font-weight: 500; text-wrap: balance; }
.ks-big { font-size: max(calc(var(--u) * 60), 30px); line-height: 1; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.ks-label { font-size: max(calc(var(--u) * 15), 12.5px); }
.ks-small { font-size: max(calc(var(--u) * 13), 11px); }
.ks-value { font-size: max(calc(var(--u) * 21), 14px); font-weight: 500; font-variant-numeric: tabular-nums; }
.ks-gap { gap: max(calc(var(--u) * 28), 16px); }
.ks-mt { margin-top: max(calc(var(--u) * 30), 18px); }
.ks-bar { height: max(calc(var(--u) * 46), 32px); }
.ks-cols { height: max(calc(var(--u) * 250), 170px); }
`;

export function KoreaScanReport({ s, preparedFor, audience = 'internal', slides, kickers = 'verdict' }: {
  s: KoreaScan;
  preparedFor?: string | null;
  /** 'shared' hides internal-only detail (the server also strips it). */
  audience?: 'internal' | 'shared';
  /** Which slides, in order. Defaults to every slide the data supports. */
  slides?: SlideId[];
  kickers?: KickerMode;
}) {
  const t = scanNarrative(s);
  const span = `${formatDate(s.window.start)} to ${formatDate(s.window.end)}`;
  const source = `${s.room.channels} Korean Telegram channels on ${s.field}, ${s.window.weeks} whole weeks, ${span}.`;
  const order = (slides ?? SLIDES.map((x) => x.id)).filter((id) => slideMeta(id)?.available(s));
  const k = (id: SlideId) => kickerFor(id, s, kickers, slideMeta(id).when);

  const render: Record<SlideId, () => ReactNode> = {
    cover: () => (
      <Slide kicker={preparedFor ? `Prepared for ${preparedFor}` : 'Korea scan'} footer={source}>
        <h1 className="ks-hero">{t.cover.title}</h1>
        <p className="ks-sub mt-2">{s.window.weeks}-week scan of Korean-language crypto Telegram. {span}.</p>
        <p className="ks-lead ks-mt max-w-[46ch]">{t.cover.verdict}</p>
        <div className="ks-mt ks-gap grid sm:grid-cols-3">
          <Big value={s.headline.posts.toLocaleString('en-US')} label={`Korean posts naming ${s.subject}, across ${s.headline.channels} channels`} />
          <Big value={`${s.paid.share ?? 0}%`} label="carry a paid marker" />
          <Big value={s.headline.changePct == null ? '—' : signed(s.headline.changePct)}
            label={`last ${weeksLabel(s.periods.compare)} against the ${weeksLabel(s.periods.compare)} before${s.headline.fieldChangePct != null ? `, field ${signed(s.headline.fieldChangePct)}` : ''}`} />
        </div>
      </Slide>
    ),
    paid: () => (
      <Slide kicker={k('paid')} title={t.paid.title} sub={t.paid.sub} footer={source}>
        <div className="space-y-6">
          <HBar label="No paid marker" right={`${s.paid.untagged.posts} posts · ${s.paid.untagged.channels} channels`} pct={share(s.paid.untagged.posts, s.headline.posts)} color={G[0]}
            note={`${s.paid.untagged.views.toLocaleString('en-US')} reader-views.`} />
          <HBar label="Tagged #KOL or #AD" right={`${s.paid.tagged.posts} posts · ${s.paid.tagged.channels} channels`} pct={share(s.paid.tagged.posts, s.headline.posts)} color={G[3]}
            note={`${s.paid.tagged.views.toLocaleString('en-US')} reader-views.`} />
        </div>
        <Read lead="Paid markers are self-reported.">{t.paid.note}</Read>
      </Slide>
    ),
    depth: () => (
      <Slide kicker={k('depth')} title={t.depth.title} sub={t.depth.sub} footer={source}>
        <ScanTable head={['Project', 'Reader-views', 'Readers per channel']}>
          {s.depth.slice(0, 7).map((r) => (
            <Row key={r.name} highlight={r.isSubject}>
              <Cell first><span className={r.isSubject ? 'font-semibold' : ''}>{r.name}</span><span className="ks-small ml-2 font-normal" style={{ color: MUTED }}>{r.posts} posts · {r.channels} channels</span></Cell>
              <Cell>{compact(r.views)}</Cell>
              <Cell last wide>
                <div className="flex items-center gap-3">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EFEBE1]">
                    <span className="block h-full rounded-full" style={{ width: `${(r.perChannel / Math.max(s.depth[0]?.perChannel ?? 1, 1)) * 100}%`, background: r.isSubject ? G[0] : G[2] }} />
                  </span>
                  <span className="w-16 text-right">{r.perChannel.toLocaleString('en-US')}</span>
                </div>
              </Cell>
            </Row>
          ))}
        </ScanTable>
        <Read lead="Reader-views divided by channels.">Same window for every name. A high number means the channels that do write about a project are widely read.</Read>
      </Slide>
    ),
    mix: () => (
      <Slide kicker={k('mix')} title={t.mix.title} sub={t.mix.sub}
        footer={`Tagged by keyword rules, not by hand. Field: ${s.mix.field.projects} ${s.field}, ${s.mix.field.posts.toLocaleString('en-US')} posts. ${source}`}>
        <div className="ks-gap flex flex-col">
          <MixBar title={s.subject} meta={`weighted quality score ${s.mix.subject.score.toFixed(2)}`} shares={s.mix.subject.shares} />
          <MixBar title="The field average" meta={`${s.mix.field.projects} projects, ${s.mix.field.posts.toLocaleString('en-US')} posts, weighted quality score ${s.mix.field.score.toFixed(2)}`} shares={s.mix.field.shares} />
        </div>
        <Read lead="Read the first segment of each bar.">{t.mix.read}</Read>
        <Legend />
      </Slide>
    ),
    reach: () => (
      <Slide kicker={k('reach')} title={t.reach.title} sub={t.reach.sub} footer={source}>
        <Columns bars={s.reach.weeks.map((w, i, all) => ({ key: w.start, value: w.perMention ?? 0, label: w.perMention == null ? '—' : w.perMention.toLocaleString('en-US'), x: weekLabel(w.start), dark: i >= all.length - 2, muted: w.perMention == null }))} />
        <Read lead="Reader-views divided by mentions, week by week.">{t.reach.read}</Read>
      </Slide>
    ),
    momentum: () => (
      <Slide kicker={k('momentum')} title={t.momentum.title} sub={t.momentum.sub} footer={`Weeks beginning Monday, KST. Partial weeks are cut. ${source}`}>
        <Columns bars={s.momentum.map((w) => ({ key: w.start, value: w.posts, label: String(w.posts), x: weekLabel(w.start), under: `${w.channelsToDate} ch`, dark: true, muted: w.posts === 0 }))} />
        <Read lead="Mentions per week, with the running channel count under each bar.">{t.momentum.read}</Read>
      </Slide>
    ),
    movement: () => (
      <Slide kicker={k('movement')} title={t.movement.title} sub={t.movement.sub} footer={source}>
        <ScanTable head={['Project', `${weeksLabel(s.periods.movementLong)}, weighted`, `Last ${weeksLabel(s.periods.movementShort)}`, 'Pace vs own average', 'Projected 90 days']}>
          {[...s.movement.rows.filter((r) => r.isSubject), ...s.movement.rows.filter((r) => !r.isSubject)].slice(0, 8).map((r) => (
            <Row key={r.name} highlight={r.isSubject} pinned={r.isSubject}>
              <Cell first>{r.name}</Cell>
              <Cell>{r.weighted92.toLocaleString('en-US')}</Cell>
              <Cell>{r.last8w.toLocaleString('en-US')}</Cell>
              <Cell><span style={{ color: r.pace == null ? undefined : r.pace > 0 ? G[0] : '#BE123C' }}>{r.pace == null ? '—' : signed(r.pace)}</span></Cell>
              <Cell last>{r.projected90.toLocaleString('en-US')}</Cell>
            </Row>
          ))}
        </ScanTable>
        <Read lead={`${s.movement.gaining} of ${Math.max(s.movement.rows.length - 1, 0)} ${s.field} are gaining Korean coverage right now.`}>
          {t.movement.read}{s.rank.now != null && <> On raw mentions, {s.subject} is {ordinal(s.rank.now)} of {s.rank.of} over the last {weeksLabel(s.periods.compare)}{s.rank.fourWeeksAgo != null && <>, from {ordinal(s.rank.fourWeeksAgo)} the {weeksLabel(s.periods.compare)} before</>}.</>}
        </Read>
      </Slide>
    ),
    share: () => s.share && t.share && (
      <Slide kicker={k('share')} title={t.share.title} sub={t.share.sub} footer={`Share of quality-weighted Korean coverage across ${s.share.rows.length} names. ${source}`}>
        <div className="flex flex-col gap-1.5">
          {s.share.rows.slice(0, 9).map((r) => (
            <div key={r.name} className="ks-label grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3.5rem] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4.5rem]">
              <span className={`truncate ${r.isSubject ? 'font-semibold' : ''}`}>{r.name}</span>
              <span className="h-[1.3em] overflow-hidden rounded-[2px] bg-[#EFEBE1]">
                <span className="block h-full" style={{ width: `${(r.weighted / Math.max(s.share.rows[0].weighted, 1)) * 100}%`, background: r.isSubject ? G[0] : G[3] }} />
              </span>
              <span className="text-right tabular-nums">{r.weighted}%</span>
            </div>
          ))}
        </div>
        <Read lead="Weighted so product and analysis posts count for more than airdrop chatter.">Same method as the field table. Raw mention share for {s.subject}: {s.share.rows.find((r) => r.isSubject)?.raw ?? 0}%.</Read>
      </Slide>
    ),
    channels: () => s.channels && t.channels && (
      <Slide kicker={k('channels')} title={t.channels.title} sub={t.channels.sub} footer={source}>
        <ScanTable head={['Channel', 'Posts', 'Reader-views', 'Readers a post']}>
          {s.channels.slice(0, 8).map((c) => (
            <Row key={c.handle}>
              <Cell first>
                <span className="font-medium">{c.title ?? c.handle}</span>
                {audience === 'internal' && c.ours && <span className="ks-small ml-2 rounded px-1.5 py-0.5" style={{ background: G[4], color: G[0] }}>ours</span>}
              </Cell>
              <Cell>{c.posts}</Cell>
              <Cell>{c.views.toLocaleString('en-US')}</Cell>
              <Cell last>{c.avgViews.toLocaleString('en-US')}</Cell>
            </Row>
          ))}
        </ScanTable>
        <Read lead="Most-read first.">These channels posted publicly about {s.subject}. Reader-views are Telegram view counts at harvest.</Read>
      </Slide>
    ),
    room: () => (
      <Slide kicker={k('room')} title={t.room.title} sub={t.room.sub} footer={source}>
        <div className="space-y-6">
          <HBar label={`Channels discussing ${s.field}`} right={`${s.room.channels} channels`} pct={100} color={G[3]} />
          <HBar label={`Channels that have written ${s.subject}`} right={`${s.room.subjectChannels} channels`} pct={share(s.room.subjectChannels, s.room.channels)} color={G[0]}
            note={`${share(s.room.subjectChannels, s.room.channels)}% of the room. The other ${s.room.neverNamed} publish on the same subject and have not typed the name.`} />
        </div>
      </Slide>
    ),
    network: () => s.network && t.network && (
      <Slide kicker={k('network')} title={t.network.title} sub={t.network.sub}
        footer={`Holo Hive network = channels we have worked with. Readers a post = average views on ${s.field} posts in this window. ${source}`}>
        <div className="ks-gap grid sm:grid-cols-3">
          <Big value={String(s.network.openCount)} label={`of our channels cover ${s.field} and have not named ${s.subject}`} />
          <Big value={compact(s.network.openReaders)} label="combined readers a post across them" />
          <Big value={`${s.network.named}/${s.network.inField}`} label={`of our channels on this subject already name ${s.subject}`} />
        </div>
        {audience === 'internal' && s.network.open.length > 0 && (
          <div className="ks-mt">
            <p className="ks-small mb-2 flex items-center gap-2 font-semibold text-amber-800">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 uppercase tracking-[0.1em]">Internal</span>Channel names never appear on a shared link.
            </p>
            <ScanTable head={['Channel', `Posts on ${s.field}`, 'Readers a post']}>
              {s.network.open.slice(0, 4).map((c) => (
                <Row key={c.handle}>
                  <Cell first><span className="font-medium">{c.title ?? c.handle}</span><span className="ks-small ml-2" style={{ color: MUTED }}>@{c.handle}</span></Cell>
                  <Cell>{c.fieldPosts}</Cell>
                  <Cell last>{c.avgViews.toLocaleString('en-US')}</Cell>
                </Row>
              ))}
            </ScanTable>
            {s.network.open.length > 4 && <p className="ks-small mt-2" style={{ color: MUTED }}>And {s.network.open.length - 4} more on the scan page.</p>}
          </div>
        )}
      </Slide>
    ),
    receipts: () => (
      <Slide kicker={k('receipts')} title="The most-read posts" sub="One per channel, in the original Korean." footer={source}>
        <div className="grid gap-3 md:grid-cols-3">
          {s.receipts.map((r) => (
            <figure key={`${r.channel}${r.date}`} className="flex min-w-0 flex-col rounded-md border bg-white p-4" style={{ borderColor: LINE }}>
              <figcaption className="ks-small flex items-baseline justify-between gap-2" style={{ color: MUTED }}>
                <span className="truncate font-medium" style={{ color: INK }}>{r.channelTitle ?? r.channel}</span>
                <span className="shrink-0 tabular-nums">{(r.views ?? 0).toLocaleString('en-US')} views</span>
              </figcaption>
              <blockquote className="ks-body mt-2.5 flex-1" style={{ color: INK }}>{r.text}</blockquote>
              <div className="ks-small mt-3 flex items-center justify-between gap-2" style={{ color: MUTED }}>
                <span>{formatDate(r.date)} · {COVERAGE_LABEL[r.type]}</span>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: G[0] }}>Open<ExternalLink className="h-3 w-3" /></a>}
              </div>
            </figure>
          ))}
        </div>
      </Slide>
    ),
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {order.map((id) => (
        <div key={id} data-slide={id} className="ks-wrap overflow-hidden rounded-lg border shadow-[0_1px_2px_rgba(60,40,20,.05)]" style={{ borderColor: LINE }}>
          {render[id]()}
        </div>
      ))}
      <p className="px-1 text-xs leading-relaxed" style={{ color: MUTED }}>
        Scope: posts matched on {s.method.aliases.join(', ')}{s.method.exclude.length > 0 && <>; removed before counting: {s.method.exclude.join(', ')}</>}. Field: {s.method.peers.join(', ')}.
        View counts as recorded at harvest and only grow. Corpus: {s.corpus.trackedChannels} tracked channels, newest post {s.corpus.lastPostAt ? formatDate(s.corpus.lastPostAt) : 'unknown'}.
      </p>
    </div>
  );
}

function Slide({ kicker, title, sub, footer, children }: { kicker: string; title?: string; sub?: string; footer: string; children: ReactNode }) {
  return (
    <section className="ks-slide">
      <p className="ks-kicker">{kicker}</p>
      {title && <h2 className="ks-title mt-3 max-w-[30ch]">{title}</h2>}
      {sub && <p className="ks-sub mt-3 max-w-[72ch]">{sub}</p>}
      <div className={title ? 'ks-mt' : ''}>{children}</div>
      <div className="mt-auto flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: LINE, marginTop: 'max(calc(var(--u) * 40), 24px)' }}>
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Image src="/images/logo.png" alt="" width={22} height={22} />Holo Hive
        </span>
        <p className="ks-small max-w-[64ch] leading-snug sm:text-right" style={{ color: MUTED }}>{footer}</p>
      </div>
    </section>
  );
}

function Read({ lead, children }: { lead: string; children: ReactNode }) {
  return <p className="ks-body ks-mt max-w-[82ch]"><b className="font-semibold" style={{ color: INK }}>{lead}</b> {children}</p>;
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="ks-big">{value}</p>
      <p className="ks-label mt-2 max-w-[26ch] leading-snug" style={{ color: SUB }}>{label}</p>
    </div>
  );
}

function HBar({ label, right, pct, color, note }: { label: string; right: string; pct: number; color: string; note?: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="ks-value">{label}</span>
        <span className="ks-small tabular-nums" style={{ color: MUTED }}>{right}</span>
      </div>
      <div className="ks-bar mt-2 overflow-hidden rounded-[3px] bg-[#EFEBE1]">
        <div className="h-full" style={{ width: `${Math.max(pct, 1)}%`, background: color }} />
      </div>
      {note && <p className="ks-label mt-2" style={{ color: SUB }}>{note}</p>}
    </div>
  );
}

function MixBar({ title, meta, shares }: { title: string; meta: string; shares: Record<CoverageType, number> }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="ks-value">{title}</span>
        <span className="ks-small" style={{ color: MUTED }}>{meta}</span>
      </div>
      <div className="ks-bar mt-2.5 flex overflow-hidden rounded-[3px]" role="img" aria-label={COVERAGE_TYPES.map((k) => `${COVERAGE_LABEL[k]} ${shares[k]}%`).join(', ')}>
        {COVERAGE_TYPES.filter((k) => shares[k] > 0).map((k) => (
          <div key={k} className="ks-label grid place-items-center font-medium tabular-nums" style={{ flex: `${shares[k]} 0 0`, background: SEG[k].bg, color: SEG[k].fg }} title={`${COVERAGE_LABEL[k]} ${shares[k]}%`}>
            {shares[k] >= 6 ? `${shares[k]}%` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
      {COVERAGE_TYPES.map((k) => (
        <span key={k} className="ks-small inline-flex items-center gap-2" style={{ color: SUB }}>
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: SEG[k].bg, boxShadow: k === 'calendar' ? `inset 0 0 0 1px ${G[3]}` : undefined }} />
          {COVERAGE_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/** Vertical bars, value on top; the last two (or all, for momentum) in the dark green. */
function Columns({ bars }: { bars: Array<{ key: string; value: number; label: string; x: string; under?: string; dark: boolean; muted?: boolean }> }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="overflow-x-auto">
      <div className="ks-cols flex min-w-[420px] items-end gap-2 sm:gap-4">
        {bars.map((b) => (
          <div key={b.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <span className="ks-value mb-1.5 text-center" style={{ color: b.muted ? '#9A9385' : b.dark ? G[0] : INK }}>{b.label}</span>
            <div className="rounded-t-[2px]" style={{ height: `${Math.max((b.value / max) * 80, 1.2)}%`, background: b.muted ? LINE : b.dark ? G[0] : G[4] }} />
          </div>
        ))}
      </div>
      <div className="flex min-w-[420px] gap-2 border-t pt-2 sm:gap-4" style={{ borderColor: LINE }}>
        {bars.map((b) => (
          <div key={b.key} className="min-w-0 flex-1 text-center">
            <p className="ks-small truncate" style={{ color: MUTED }}>{b.x}</p>
            {b.under && <p className="ks-small font-semibold tabular-nums">{b.under}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Table className="ks-small min-w-[560px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent" style={{ borderColor: LINE }}>
          {head.map((h, i) => (
            <TableHead key={h} className={`ks-small h-auto px-0 pb-2 pt-0 font-semibold uppercase tracking-[0.12em] ${i === 0 ? 'pl-3 text-left' : 'pr-4 text-right'} ${i === head.length - 1 ? 'pr-3' : ''}`} style={{ color: MUTED }}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

function Row({ children, highlight, pinned }: { children: ReactNode; highlight?: boolean; pinned?: boolean }) {
  return (
    <TableRow className={`hover:bg-transparent ${highlight ? 'font-semibold' : ''}`}
      style={{ borderColor: pinned ? G[3] : '#EFEBE1', borderBottomWidth: pinned ? 2 : undefined, background: highlight ? '#EEF3EF' : undefined }}>
      {children}
    </TableRow>
  );
}

function Cell({ children, first, last, wide }: { children: ReactNode; first?: boolean; last?: boolean; wide?: boolean }) {
  return (
    <TableCell className={`p-0 py-[0.42em] tabular-nums ${first ? 'pl-3 pr-4 text-left' : 'pr-4 text-right'} ${last ? 'pr-3' : ''} ${wide ? 'w-[38%]' : ''}`}>
      {children}
    </TableCell>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Chart-axis week label ("Jul 27"). */
function weekLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function weeksLabel(days: number) { return days % 7 === 0 ? `${days / 7} weeks` : `${days} days`; }
/** +12% / −12%, with a real minus sign. */
function signed(n: number) { return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`; }
function share(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function compact(n: number) { return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n); }
