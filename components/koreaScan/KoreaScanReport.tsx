'use client';

/**
 * Korea Scan report — any project, not only clients.
 *
 * Follows Yano's template grammar (RISE scan + the four week-two/week-four
 * templates, Sep 2026): one idea per graphic, the window stated on the
 * graphic, the data source in the footer, a bold first sentence telling the
 * reader where to look. Light cream + the Holo Hive green ramp, as in his
 * slides. Every chart is plain HTML so it reflows on a phone.
 */

import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table';
import type { KoreaScan } from '@/lib/koreaScan/compute';
import { COVERAGE_LABEL, COVERAGE_TYPES, type CoverageType } from '@/lib/koreaScan/classify';
import { ordinal, scanNarrative } from '@/lib/koreaScan/narrative';

/** Holo Hive green ramp, darkest first (from Yano's templates). */
const G = ['#1E5B40', '#5E8C74', '#9BB8A7', '#C9D9CE', '#E2EAE4'] as const;
const SEG: Record<CoverageType, { bg: string; fg: string }> = {
  analysis: { bg: G[0], fg: '#fff' },
  news: { bg: G[1], fg: '#fff' },
  price: { bg: G[2], fg: '#16140F' },
  farming: { bg: G[3], fg: '#16140F' },
  calendar: { bg: G[4], fg: '#16140F' },
};

export function KoreaScanReport({ s, preparedFor }: { s: KoreaScan; preparedFor?: string | null }) {
  const t = scanNarrative(s);
  const span = `${formatDate(s.window.start)} to ${formatDate(s.window.end)}`;
  const source = `${s.room.channels} Korean Telegram channels writing about ${s.field}, ${s.window.weeks} whole weeks, ${span}.`;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 text-[#16140F]">
      {/* Cover */}
      <Slide kicker={preparedFor ? `Prepared for ${preparedFor}` : 'Korea scan'} footer={source}>
        <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[44px]">{t.cover.title}</h1>
        <p className="mt-2 text-[15px] text-[#46423A]">
          {s.window.weeks}-week scan of Korean-language crypto Telegram. {span}.
        </p>
        <p className="mt-8 max-w-[44ch] text-[20px] font-medium leading-snug [text-wrap:balance] sm:text-[24px]">{t.cover.verdict}</p>
        <div className="mt-8 grid gap-6 border-t border-[#E6E1D4] pt-6 sm:grid-cols-3">
          <Big value={s.headline.posts.toLocaleString('en-US')} label={`Korean posts naming ${s.subject}, across ${s.headline.channels} channels`} />
          <Big value={`${s.paid.share ?? 0}%`} label="carry a paid marker" />
          <Big value={s.headline.changePct == null ? '—' : signed(s.headline.changePct)}
            label={`last ${weeksLabel(s.periods.compare)} against the ${weeksLabel(s.periods.compare)} before${s.headline.fieldChangePct != null ? `, field ${signed(s.headline.fieldChangePct)}` : ''}`} />
        </div>
      </Slide>

      {/* Paid share */}
      <Slide kicker="Who is paying for it" title={t.paid.title} sub={t.paid.sub} footer={source}>
        <div className="space-y-5">
          <HBar label="No paid marker" right={`${s.paid.untagged.posts} posts · ${s.paid.untagged.channels} channels`}
            pct={share(s.paid.untagged.posts, s.headline.posts)} color={G[0]}
            note={`${s.paid.untagged.views.toLocaleString('en-US')} reader-views.`} />
          <HBar label="Tagged #KOL or #AD" right={`${s.paid.tagged.posts} posts · ${s.paid.tagged.channels} channels`}
            pct={share(s.paid.tagged.posts, s.headline.posts)} color={G[3]}
            note={`${s.paid.tagged.views.toLocaleString('en-US')} reader-views.`} />
        </div>
        <Read lead="Paid markers are self-reported.">{t.paid.note}</Read>
      </Slide>

      {/* Depth */}
      <Slide kicker="How deeply it is read" title={t.depth.title} sub={t.depth.sub} footer={source}>
        <ScanTable head={['Project', 'Reader-views', 'Readers per channel']}>
          {s.depth.map((r) => (
            <TableRow key={r.name} className={`border-[#EFEBE1] hover:bg-transparent ${r.isSubject ? 'bg-[#EEF3EF]' : ''}`}>
              <TableCell className="p-0 py-2.5 pl-3 pr-4">
                <span className={r.isSubject ? 'font-semibold' : ''}>{r.name}</span>
                <span className="ml-2 text-xs text-[#6B6557]">{r.posts} posts · {r.channels} channels</span>
              </TableCell>
              <TableCell className="p-0 py-2.5 pr-4 text-right tabular-nums">{compact(r.views)}</TableCell>
              <TableCell className="p-0 w-[38%] py-2.5 pr-3">
                <div className="flex items-center gap-3">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EFEBE1]">
                    <span className="block h-full rounded-full" style={{ width: `${(r.perChannel / Math.max(s.depth[0]?.perChannel ?? 1, 1)) * 100}%`, background: r.isSubject ? G[0] : G[2] }} />
                  </span>
                  <span className="w-16 text-right tabular-nums">{r.perChannel.toLocaleString('en-US')}</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </ScanTable>
        <Read lead="Reader-views divided by channels.">Same window for every name. A high number means the channels that do write about a project are widely read.</Read>
      </Slide>

      {/* Template 1: coverage mix */}
      <Slide kicker="Use from week two" title={t.mix.title} sub={t.mix.sub}
        footer={`Tagged by keyword rules, not by hand. Field: ${s.mix.field.projects} ${s.field}, ${s.mix.field.posts.toLocaleString('en-US')} posts. ${source}`}>
        <div className="space-y-6">
          <MixBar title={s.subject} meta={`${s.mix.subject.posts} posts · weighted quality score ${s.mix.subject.score.toFixed(2)}`} shares={s.mix.subject.shares} />
          <MixBar title="The field average" meta={`${s.mix.field.projects} projects, ${s.mix.field.posts.toLocaleString('en-US')} posts · weighted quality score ${s.mix.field.score.toFixed(2)}`} shares={s.mix.field.shares} />
        </div>
        <Read lead="Read the first segment of each bar.">{t.mix.read}</Read>
        <Legend />
      </Slide>

      {/* Template 2: reach per mention */}
      <Slide kicker="Use from week two" title={t.reach.title} sub={t.reach.sub} footer={source}>
        <Columns
          bars={s.reach.weeks.map((w, i, all) => ({
            key: w.start, value: w.perMention ?? 0, label: w.perMention == null ? '—' : w.perMention.toLocaleString('en-US'),
            x: weekLabel(w.start), dark: i >= all.length - 2, muted: w.perMention == null,
          }))}
        />
        <Read lead="Reader-views divided by mentions, week by week.">{t.reach.read}</Read>
      </Slide>

      {/* Template 3: momentum */}
      <Slide kicker="Use from week four" title={t.momentum.title} sub={t.momentum.sub} footer={`Weeks beginning Monday, KST. Partial weeks are cut. ${source}`}>
        <Columns
          bars={s.momentum.map((w) => ({ key: w.start, value: w.posts, label: String(w.posts), x: weekLabel(w.start), under: `${w.channelsToDate} ch`, dark: true, muted: w.posts === 0 }))}
        />
        <Read lead="Mentions per week, with the running channel count under each bar.">{t.momentum.read}</Read>
      </Slide>

      {/* Template 4: the field */}
      <Slide kicker="Every week, from day one" title={t.movement.title} sub={t.movement.sub} footer={source}>
        <ScanTable head={[`Project`, `${weeksLabel(s.periods.movementLong)}, weighted`, `Last ${weeksLabel(s.periods.movementShort)}`, 'Pace vs own average', 'Projected 90 days']}>
          {[...s.movement.rows.filter((r) => r.isSubject), ...s.movement.rows.filter((r) => !r.isSubject)].map((r, i) => (
            <TableRow key={r.name} className={`border-[#EFEBE1] hover:bg-transparent ${r.isSubject ? 'border-b-2 border-[#C9D9CE] bg-[#EEF3EF] font-semibold' : ''}`}>
              <TableCell className="p-0 py-2.5 pl-3 pr-4">{r.name}{r.isSubject && i === 0 && <span className="ml-2 text-xs font-normal text-[#6B6557]">pinned</span>}</TableCell>
              <TableCell className="p-0 py-2.5 pr-4 text-right tabular-nums">{r.weighted92.toLocaleString('en-US')}</TableCell>
              <TableCell className="p-0 py-2.5 pr-4 text-right tabular-nums">{r.last8w.toLocaleString('en-US')}</TableCell>
              <TableCell className={`p-0 py-2.5 pr-4 text-right tabular-nums ${r.pace == null ? '' : r.pace > 0 ? 'text-[#1E5B40]' : 'text-rose-700'}`}>
                {r.pace == null ? '—' : signed(r.pace)}
              </TableCell>
              <TableCell className="p-0 py-2.5 pr-3 text-right tabular-nums">{r.projected90.toLocaleString('en-US')}</TableCell>
            </TableRow>
          ))}
        </ScanTable>
        <Read lead={`${s.movement.gaining} of ${Math.max(s.movement.rows.length - 1, 0)} ${s.field} are gaining Korean coverage right now.`}>
          {t.movement.read}{s.rank.now != null && <> On raw mentions, {s.subject} is {ordinal(s.rank.now)} of {s.rank.of} over the last {weeksLabel(s.periods.compare)}{s.rank.fourWeeksAgo != null && <>, from {ordinal(s.rank.fourWeeksAgo)} the {weeksLabel(s.periods.compare)} before</>}.</>}
        </Read>
      </Slide>

      {/* The room */}
      <Slide kicker="The door" title={t.room.title} sub={t.room.sub} footer={source}>
        <div className="space-y-5">
          <HBar label={`Channels discussing ${s.field}`} right={`${s.room.channels} channels`} pct={100} color={G[3]} />
          <HBar label={`Channels that have written ${s.subject}`} right={`${s.room.subjectChannels} channels`} pct={share(s.room.subjectChannels, s.room.channels)} color={G[0]}
            note={`${share(s.room.subjectChannels, s.room.channels)}% of the room. The other ${s.room.neverNamed} publish on the same subject and have not typed the name.`} />
        </div>
      </Slide>

      {/* Receipts */}
      {s.receipts.length > 0 && (
        <Slide kicker="Appendix" title="The receipts" sub="The most-read posts naming the project, one per channel, in the original Korean." footer={source}>
          <div className="grid gap-3 md:grid-cols-3">
            {s.receipts.map((r) => (
              <figure key={`${r.channel}${r.date}`} className="flex min-w-0 flex-col rounded-lg border border-[#E6E1D4] bg-white p-4">
                <figcaption className="flex items-baseline justify-between gap-2 text-xs text-[#6B6557]">
                  <span className="truncate font-medium text-[#16140F]">{r.channelTitle ?? r.channel}</span>
                  <span className="shrink-0 tabular-nums">{(r.views ?? 0).toLocaleString('en-US')} views</span>
                </figcaption>
                <blockquote className="mt-2.5 flex-1 text-[14px] leading-relaxed">{r.text}</blockquote>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#6B6557]">
                  <span>{formatDate(r.date)} · {COVERAGE_LABEL[r.type]}</span>
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-[#1E5B40] hover:underline">Open<ExternalLink className="h-3 w-3" /></a>}
                </div>
              </figure>
            ))}
          </div>
        </Slide>
      )}

      <p className="px-1 text-xs leading-relaxed text-[#6B6557]">
        Scope: posts matched on {s.method.aliases.join(', ')}{s.method.exclude.length > 0 && <>; removed before counting: {s.method.exclude.join(', ')}</>}. Field: {s.method.peers.join(', ')}.
        View counts as recorded at harvest and only grow. Corpus: {s.corpus.trackedChannels} tracked channels, newest post {s.corpus.lastPostAt ? formatDate(s.corpus.lastPostAt) : 'unknown'}.
      </p>
    </div>
  );
}

function Slide({ kicker, title, sub, footer, children }: { kicker: string; title?: string; sub?: string; footer: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border border-[#E6E1D4] bg-[#FAF8F3] px-5 py-6 sm:px-9 sm:py-8">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#1E5B40]">{kicker}</p>
      {title && <h2 className="mt-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] [text-wrap:balance] sm:text-[30px]">{title}</h2>}
      {sub && <p className="mt-2 max-w-[70ch] text-[14.5px] leading-relaxed text-[#46423A]">{sub}</p>}
      <div className={title ? 'mt-7' : ''}>{children}</div>
      <div className="mt-8 flex flex-col gap-3 border-t border-[#E6E1D4] pt-4 sm:flex-row sm:items-end sm:justify-between">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Image src="/images/logo.png" alt="" width={20} height={20} />Holo Hive
        </span>
        <p className="max-w-[62ch] text-[11.5px] leading-snug text-[#6B6557] sm:text-right">{footer}</p>
      </div>
    </section>
  );
}

function Read({ lead, children }: { lead: string; children: ReactNode }) {
  return <p className="mt-6 max-w-[78ch] text-[14px] leading-relaxed text-[#46423A]"><b className="font-semibold text-[#16140F]">{lead}</b> {children}</p>;
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      <p className="mt-2 max-w-[26ch] text-[13px] leading-snug text-[#46423A]">{label}</p>
    </div>
  );
}

function HBar({ label, right, pct, color, note }: { label: string; right: string; pct: number; color: string; note?: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="text-[13px] tabular-nums text-[#6B6557]">{right}</span>
      </div>
      <div className="mt-2 h-10 overflow-hidden rounded-[3px] bg-[#EFEBE1]">
        <div className="h-full" style={{ width: `${Math.max(pct, 1)}%`, background: color }} />
      </div>
      {note && <p className="mt-2 text-[13px] text-[#46423A]">{note}</p>}
    </div>
  );
}

function MixBar({ title, meta, shares }: { title: string; meta: string; shares: Record<CoverageType, number> }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[17px] font-semibold">{title}</span>
        <span className="text-[12px] text-[#6B6557]">{meta}</span>
      </div>
      <div className="mt-2.5 flex h-12 overflow-hidden rounded-[3px]" role="img"
        aria-label={COVERAGE_TYPES.map((k) => `${COVERAGE_LABEL[k]} ${shares[k]}%`).join(', ')}>
        {COVERAGE_TYPES.filter((k) => shares[k] > 0).map((k) => (
          <div key={k} className="grid place-items-center text-[13px] font-medium tabular-nums"
            style={{ flex: `${shares[k]} 0 0`, background: SEG[k].bg, color: SEG[k].fg }} title={`${COVERAGE_LABEL[k]} ${shares[k]}%`}>
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
        <span key={k} className="inline-flex items-center gap-2 text-[12.5px] text-[#46423A]">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: SEG[k].bg, boxShadow: k === 'calendar' ? 'inset 0 0 0 1px #C9D9CE' : undefined }} />
          {COVERAGE_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/** Vertical bars with the value on top; heights scale to the tallest. */
function Columns({ bars }: { bars: Array<{ key: string; value: number; label: string; x: string; under?: string; dark: boolean; muted?: boolean }> }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[420px] items-end gap-2 sm:gap-4" style={{ height: 260 } as CSSProperties}>
        {bars.map((b) => (
          <div key={b.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <span className={`mb-1.5 text-center text-[15px] font-medium tabular-nums sm:text-[18px] ${b.muted ? 'text-[#9A9385]' : b.dark ? 'text-[#1E5B40]' : 'text-[#16140F]'}`}>{b.label}</span>
            <div className="rounded-t-[2px]" style={{ height: `${Math.max((b.value / max) * 200, 3)}px`, background: b.muted ? '#E6E1D4' : b.dark ? G[0] : G[4] }} />
          </div>
        ))}
      </div>
      <div className="flex min-w-[420px] gap-2 border-t border-[#E6E1D4] pt-2 sm:gap-4">
        {bars.map((b) => (
          <div key={b.key} className="min-w-0 flex-1 text-center">
            <p className="truncate text-[11.5px] text-[#6B6557]">{b.x}</p>
            {b.under && <p className="text-[11.5px] font-semibold tabular-nums">{b.under}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Table className="min-w-[560px] text-[13.5px]">
      <TableHeader>
        <TableRow className="border-[#E6E1D4] hover:bg-transparent">
          {head.map((h, i) => (
            <TableHead key={h} className={`h-9 px-0 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#6B6557] ${i === 0 ? 'pl-3 text-left' : 'pr-4 text-right'} ${i === head.length - 1 ? 'pr-3' : ''}`}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
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
