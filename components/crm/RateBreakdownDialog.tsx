'use client';

/**
 * RateBreakdownDialog — the drill-down behind the Response / Lead / Trial
 * cards on /crm/outreach.
 *
 * [2026-08-15, Andy] The cards answer "what is the rate"; this answers the
 * question that follows, which is "…compared to what". Two breakdowns, both
 * of the SAME rate the card shows:
 *
 *   • by owner        — is this a board-level number or one rep's number?
 *   • by message type — which opener actually works? (Yano's real question:
 *                       3 Line TLDR vs Case Study vs Korea Deck)
 *
 * Chart choices worth stating, since they're easy to "fix" wrongly later:
 *
 *   - Horizontal bars, one hue. These are magnitude comparisons across
 *     nominal categories, so every bar is the same color — shading each bar
 *     darker-where-bigger would double-encode length as hue and add nothing.
 *   - The axis is scaled to the largest bar, not to 100%, or a board where
 *     every rate is single-digit renders as seven invisible slivers. The
 *     scale maximum is printed above the bars so the reader isn't guessing.
 *   - Segments below MIN_N are drawn muted and labelled with their n. One
 *     reply out of two contacted is "50%", and without that marker it
 *     outranks a genuinely good 18% off 200.
 */

import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { BarChart3 } from 'lucide-react';
import {
  computeRates, hasResponded, isLead, isTrial,
  type OutreachProspect, type OutreachStatus,
} from '@/lib/outreachService';

export type RateKey = 'response' | 'lead' | 'trial';

/** Below this many contacted, a segment's percentage is noise — say so. */
const MIN_N = 10;

interface RateMeta {
  label: string;
  /** Yano's definition, verbatim where he gave one. */
  definition: string;
  /** The numerator test. Denominator is always "has been contacted". */
  hit: (p: OutreachProspect) => boolean;
  bar: string;
  dot: string;
  /** Stroke/fill for the SVG charts — Tailwind classes don't reach SVG attrs. */
  hex: string;
  value: (r: ReturnType<typeof computeRates>) => number | null;
  /** Which funnel step this rate measures, for the funnel chart. */
  step: 'responded' | 'leads' | 'trials';
}

export const RATE_META: Record<RateKey, RateMeta> = {
  response: {
    label: 'Response Rate',
    definition: 'Share of contacted prospects who replied at all — a denial is still a response.',
    hit: hasResponded,
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
    hex: '#0ea5e9',
    value: r => r.responseRate,
    step: 'responded',
  },
  lead: {
    label: 'Lead Rate',
    definition: 'Share of contacted prospects who turned into a lead — a trial, a conversation or a call.',
    hit: isLead,
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    hex: '#10b981',
    value: r => r.leadRate,
    step: 'leads',
  },
  trial: {
    label: 'Trial Rate',
    definition: 'Share of contacted prospects who took up the free offer.',
    hit: isTrial,
    bar: 'bg-purple-500',
    dot: 'bg-purple-500',
    hex: '#a855f7',
    value: r => r.trialRate,
    step: 'trials',
  },
};

interface Segment {
  key: string;
  contacted: number;
  hits: number;
  rate: number;
}

/** One breakdown: group rows by a field, compute the rate inside each group. */
function segmentBy(
  rows: OutreachProspect[],
  meta: RateMeta,
  pick: (p: OutreachProspect) => string | null,
  unlabelled: string,
): Segment[] {
  const buckets = new Map<string, { contacted: number; hits: number }>();
  for (const p of rows) {
    // Uncontacted rows belong to no rate — they never had the chance to reply.
    if (!p.date_outreached) continue;
    const key = pick(p)?.trim() || unlabelled;
    const b = buckets.get(key) ?? { contacted: 0, hits: 0 };
    b.contacted += 1;
    if (meta.hit(p)) b.hits += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .map(([key, b]) => ({ key, ...b, rate: (b.hits / b.contacted) * 100 }))
    .sort((a, b) => b.rate - a.rate || b.contacted - a.contacted);
}

// ── Cohort trend ─────────────────────────────────────────────────────
//
// The chart that actually corresponds to a rate: the same rate computed
// per COHORT — prospects grouped by the month they were messaged in — so
// "are we getting better at this" has an answer. Cohorting by outreach
// date (not by reply date) is what keeps each point a real rate: the
// numerator and denominator describe the same people.

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM' → "May '26". Built from a literal table rather than
 *  toLocaleDateString, which the convention linter forbids (and which would
 *  render a full mm/dd/yyyy date where only the month is meant). */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_ABBR[Number(m) - 1]} '${y.slice(2)}`;
}

interface CohortPoint { ym: string; contacted: number; hits: number; rate: number }

function cohorts(rows: OutreachProspect[], meta: RateMeta): CohortPoint[] {
  const buckets = new Map<string, { contacted: number; hits: number }>();
  for (const p of rows) {
    if (!p.date_outreached) continue;
    const ym = p.date_outreached.slice(0, 7);
    const b = buckets.get(ym) ?? { contacted: 0, hits: 0 };
    b.contacted += 1;
    if (meta.hit(p)) b.hits += 1;
    buckets.set(ym, b);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, b]) => ({ ym, ...b, rate: (b.hits / b.contacted) * 100 }));
}

const VB_W = 620, VB_H = 190;
const PAD = { t: 14, r: 14, b: 34, l: 34 };

function TrendChart({ points, meta }: { points: CohortPoint[]; meta: RateMeta }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="text-xs text-ink-warm-400">
        Not enough history yet — a trend needs outreach sent across at least two months.
      </p>
    );
  }

  // Rounded to a multiple of 20 so the midpoint tick is a whole number —
  // a "37.5%" gridline label reads like a data point rather than a ruler.
  const domain = Math.max(20, Math.ceil(Math.max(...points.map(p => p.rate)) / 20) * 20);
  const plotW = VB_W - PAD.l - PAD.r;
  const plotH = VB_H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const y = (rate: number) => PAD.t + (1 - rate / domain) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.rate)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${PAD.t + plotH} L${x(0)},${PAD.t + plotH} Z`;
  const ticks = [0, domain / 2, domain];
  const active = hover === null ? null : points[hover];

  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-auto" role="img"
        aria-label={`${meta.label} by month of outreach`}>
        {/* Recessive grid — reference, not decoration. */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={VB_W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e7e0d6" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={9} fill="#a89e90">{t}%</text>
          </g>
        ))}

        <path d={area} fill={meta.hex} opacity={0.08} />
        <path d={line} fill="none" stroke={meta.hex} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => {
          const thin = p.contacted < MIN_N;
          const on = hover === i;
          return (
            <g key={p.ym}>
              {/* Hit target far larger than the mark. */}
              <rect x={x(i) - plotW / (points.length * 2)} y={PAD.t}
                width={plotW / points.length} height={plotH} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              {/* Hollow marker = too few contacted for the % to mean much. */}
              <circle cx={x(i)} cy={y(p.rate)} r={on ? 5 : 3.5}
                fill={thin ? '#fff' : meta.hex} stroke={thin ? meta.hex : '#fff'} strokeWidth={2} />
              <text x={x(i)} y={VB_H - 12} textAnchor="middle" fontSize={9}
                fill={on ? '#4a4237' : '#a89e90'}>{monthLabel(p.ym)}</text>
            </g>
          );
        })}

        {/* Crosshair + readout on hover. */}
        {active && hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + plotH}
            stroke="#c9bfb0" strokeWidth={1} strokeDasharray="3 3" />
        )}
      </svg>

      <p className="text-[11px] text-ink-warm-500 h-4">
        {active
          ? `${monthLabel(active.ym)} — ${Math.round(active.rate)}% · ${active.hits} of ${active.contacted} contacted${active.contacted < MIN_N ? ' (low n)' : ''}`
          : 'Grouped by the month outreach was sent. Hollow points had under ' + MIN_N + ' contacted.'}
      </p>
    </div>
  );
}

// ── Outcome composition (Lead Rate's chart) ──────────────────────────
//
// Lead rate's real question isn't "how many" — the card already says 6% —
// it's "of the people who bothered to reply, where did they land, and what
// killed the ones that didn't convert". That's part-to-whole over an
// ORDERED set of outcomes, so it gets one 100%-stacked bar rather than a
// line: reading left to right walks from best outcome to worst.
//
// The ordering is what licenses the color treatment. These aren't nominal
// categories that would need a validated categorical palette — they're a
// diverging scale with real polarity, so the four converting outcomes take
// emerald steps (darkest = best) and the two terminal ones take rose. Every
// segment is also named and counted in the legend, so identity never rests
// on color alone.

const OUTCOMES: Array<{ status: OutreachStatus; label: string; fill: string; chip: string }> = [
  { status: 'lead_trial',           label: 'Took the trial', fill: '#047857', chip: 'bg-emerald-700' },
  { status: 'lead',                 label: 'Lead',           fill: '#10b981', chip: 'bg-emerald-500' },
  { status: 'team_engaged',         label: 'Team engaged',   fill: '#34d399', chip: 'bg-emerald-400' },
  { status: 'response_interested',  label: 'Interested',     fill: '#6ee7b7', chip: 'bg-emerald-300' },
  { status: 'response_referred',    label: 'Referred on',    fill: '#a7f3d0', chip: 'bg-emerald-200' },
  { status: 'response_denial',      label: 'Denied',         fill: '#fb7185', chip: 'bg-rose-400' },
  { status: 'response_not_working', label: 'Not a fit',      fill: '#fecdd3', chip: 'bg-rose-200' },
];

function OutcomeComposition({ rows }: { rows: OutreachProspect[] }) {
  const counts = OUTCOMES.map(o => ({
    ...o,
    n: rows.filter(p => p.date_outreached && p.status === o.status).length,
  }));
  const total = counts.reduce((s, c) => s + c.n, 0);

  if (total === 0) {
    return <p className="text-xs text-ink-warm-400">Nobody has replied yet, so there is nothing to break down.</p>;
  }

  return (
    <div className="space-y-2.5">
      {/* 2px surface gaps keep adjacent segments from reading as one block. */}
      <div className="flex h-5 w-full rounded-md overflow-hidden gap-[2px] bg-cream-200">
        {counts.filter(c => c.n > 0).map(c => (
          <div
            key={c.status}
            style={{ width: `${(c.n / total) * 100}%`, backgroundColor: c.fill }}
            title={`${c.label} — ${c.n} of ${total} responders`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {counts.filter(c => c.n > 0).map(c => (
          <div key={c.status} className="flex items-center gap-2 text-[11px]">
            <span className={`h-2 w-2 rounded-sm shrink-0 ${c.chip}`} />
            <span className="text-ink-warm-700 truncate">{c.label}</span>
            <span className="ml-auto tabular-nums text-ink-warm-500">
              {c.n} · {Math.round((c.n / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-warm-500">
        Share of the {total} people who replied. Everything left of the rose band
        counts toward Lead Rate.
      </p>
    </div>
  );
}

// ── Cumulative trials (Trial Rate's chart) ───────────────────────────
//
// A trial is rare — 16 across the whole board — so a monthly RATE line is
// mostly noise: one signup in a twelve-prospect month reads as 8% and
// outranks every real month. The honest chart for a rare event is the
// running total: it can only go up, each step is one real signup, and the
// slope is the thing worth reading (are we still producing trials, or has
// the line gone flat?).

function CumulativeTrials({ rows }: { rows: OutreachProspect[] }) {
  const points = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const p of rows) {
      if (!p.date_outreached) continue;
      const ym = p.date_outreached.slice(0, 7);
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + (isTrial(p) ? 1 : 0));
    }
    let run = 0;
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, n]) => ({ ym, n, total: (run += n) }));
  }, [rows]);

  // Trials with no send date can't sit on a time axis, so the chart total
  // will read lower than the funnel's. Say so rather than let the two
  // numbers quietly disagree.
  const undated = rows.filter(p => isTrial(p) && !p.date_outreached).length;

  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2 || points[points.length - 1].total === 0) {
    return <p className="text-xs text-ink-warm-400">No trials logged against a send date yet.</p>;
  }

  const peak = points[points.length - 1].total;
  const domain = Math.max(4, Math.ceil(peak / 4) * 4);
  const plotW = VB_W - PAD.l - PAD.r;
  const plotH = VB_H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i * plotW) / (points.length - 1);
  const y = (v: number) => PAD.t + (1 - v / domain) * plotH;

  // Stepped, not smoothed: the total holds flat through a month with no
  // signups, and a diagonal would invent trials on the days between.
  let d = `M${x(0)},${y(points[0].total)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L${x(i)},${y(points[i - 1].total)} L${x(i)},${y(points[i].total)}`;
  }
  const area = `${d} L${x(points.length - 1)},${PAD.t + plotH} L${x(0)},${PAD.t + plotH} Z`;
  const active = hover === null ? null : points[hover];

  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-auto" role="img"
        aria-label="Cumulative trials by month of outreach">
        {[0, domain / 2, domain].map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={VB_W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e7e0d6" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={9} fill="#a89e90">{t}</text>
          </g>
        ))}
        <path d={area} fill="#a855f7" opacity={0.08} />
        <path d={d} fill="none" stroke="#a855f7" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.ym}>
            <rect x={x(i) - plotW / (points.length * 2)} y={PAD.t}
              width={plotW / points.length} height={plotH} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            {/* Only the months that actually added a trial get a marker —
                a dot on every flat month would imply an event happened. */}
            {p.n > 0 && (
              <circle cx={x(i)} cy={y(p.total)} r={hover === i ? 5 : 3.5}
                fill="#a855f7" stroke="#fff" strokeWidth={2} />
            )}
            <text x={x(i)} y={VB_H - 12} textAnchor="middle" fontSize={9}
              fill={hover === i ? '#4a4237' : '#a89e90'}>{monthLabel(p.ym)}</text>
          </g>
        ))}
        {active && hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + plotH}
            stroke="#c9bfb0" strokeWidth={1} strokeDasharray="3 3" />
        )}
      </svg>
      <p className="text-[11px] text-ink-warm-500 h-4">
        {active
          ? `${monthLabel(active.ym)} — ${active.n} new, ${active.total} total`
          : `${peak} trials placed on the timeline${undated > 0 ? ` (${undated} more have no send date, so they can't be dated)` : ''}. Markers are months that added one; flat stretches added none.`}
      </p>
    </div>
  );
}

// ── Funnel ───────────────────────────────────────────────────────────
//
// The three rates share one denominator and nest (trials ⊆ leads ⊆
// responded ⊆ contacted), so a funnel is the honest picture of where THIS
// rate sits. Every bar is drawn against contacted, and the step this
// dialog is about is the one in color — the rest are gray context.

function Funnel({ totals, meta }: { totals: ReturnType<typeof computeRates>; meta: RateMeta }) {
  const steps: Array<{ key: RateMeta['step'] | 'contacted'; label: string; n: number }> = [
    { key: 'contacted', label: 'Contacted',  n: totals.contacted },
    { key: 'responded', label: 'Responded',  n: totals.responded },
    { key: 'leads',     label: 'Leads',      n: totals.leads },
    { key: 'trials',    label: 'Trials',     n: totals.trials },
  ];

  return (
    <div className="space-y-1.5">
      {steps.map(s => {
        const pct = totals.contacted === 0 ? 0 : (s.n / totals.contacted) * 100;
        const on = s.key === meta.step;
        return (
          <div key={s.key} className="flex items-center gap-3">
            <span className={`w-[74px] shrink-0 text-[11px] ${on ? 'font-semibold text-ink-warm-900' : 'text-ink-warm-500'}`}>
              {s.label}
            </span>
            <div className="flex-1 h-3 rounded-full bg-cream-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${on ? meta.bar : 'bg-ink-warm-300'}`}
                style={{ width: `${Math.max(pct, s.n > 0 ? 1.5 : 0)}%` }}
              />
            </div>
            <span className={`w-[92px] shrink-0 text-right text-[11px] tabular-nums ${on ? 'font-semibold text-ink-warm-900' : 'text-ink-warm-500'}`}>
              {s.n.toLocaleString('en-US')} · {Math.round(pct)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BarGroup({ title, segments, meta }: { title: string; segments: Segment[]; meta: RateMeta }) {
  // Scale to the largest bar, rounded up to the next 5%, floored at 10% so a
  // board of near-zero rates doesn't render one lone bar at full width.
  const peak = Math.max(...segments.map(s => s.rate), 0);
  const domain = Math.max(10, Math.ceil(peak / 5) * 5);

  if (segments.length === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">{title}</h4>
        <p className="text-xs text-ink-warm-400">Nothing contacted in this slice yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">{title}</h4>
        <span className="text-[10px] tabular-nums text-ink-warm-400">scale 0–{domain}%</span>
      </div>
      <div className="space-y-2.5">
        {segments.map(s => {
          const thin = s.contacted < MIN_N;
          return (
            <div key={s.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-ink-warm-800 truncate" title={s.key}>{s.key}</span>
                <span className="flex items-baseline gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold tabular-nums ${thin ? 'text-ink-warm-400' : 'text-ink-warm-900'}`}>
                    {Math.round(s.rate)}%
                  </span>
                  <span className="text-[10px] tabular-nums text-ink-warm-400">
                    {s.hits}/{s.contacted}{thin ? ' · low n' : ''}
                  </span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-cream-200 overflow-hidden">
                <div
                  className={`h-full rounded-full ${meta.bar} ${thin ? 'opacity-40' : ''}`}
                  style={{ width: `${Math.max(1.5, (s.rate / domain) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RateBreakdownDialog({
  rateKey,
  rows,
  scopeLabel,
  onClose,
}: {
  /** null closes the dialog. */
  rateKey: RateKey | null;
  /** The rate population — attribute-filtered, never view-filtered. */
  rows: OutreachProspect[];
  scopeLabel: string;
  onClose: () => void;
}) {
  const meta = rateKey ? RATE_META[rateKey] : null;

  const totals = useMemo(() => computeRates(rows), [rows]);
  const byOwner = useMemo(
    () => (meta ? segmentBy(rows, meta, p => p.owner, 'Unassigned') : []),
    [rows, meta],
  );
  const byMessage = useMemo(
    () => (meta ? segmentBy(rows, meta, p => p.message_type, 'No message type') : []),
    [rows, meta],
  );
  // Only Response Rate uses the cohort trend — see the chart switch below.
  const trend = useMemo(
    () => (meta && rateKey === 'response' ? cohorts(rows, meta) : []),
    [rows, meta, rateKey],
  );

  const headline = meta ? meta.value(totals) : null;

  return (
    <Dialog open={!!rateKey} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        {meta && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </DialogTitle>
              <DialogDescription>{meta.definition}</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
              {/* Headline first — the same number the card shows, so opening
                  the dialog never looks like it changed the answer. */}
              <div className="rounded-lg border border-cream-200 bg-cream-50/60 px-4 py-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold tabular-nums text-ink-warm-900">
                    {headline === null ? '—' : `${headline}%`}
                  </span>
                  <span className="text-xs text-ink-warm-500">
                    across {scopeLabel} · {totals.contacted} contacted
                  </span>
                </div>
              </div>

              {totals.contacted === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Nothing contacted yet"
                  description="A rate needs prospects who've actually been messaged. Send some outreach and this fills in."
                />
              ) : (
                <>
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
                      Where it sits in the funnel
                    </h4>
                    <Funnel totals={totals} meta={meta} />
                  </div>

                  {/* Each rate gets the chart its own question calls for,
                      rather than three copies of one line. */}
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
                      {rateKey === 'response' ? 'Trend by outreach month'
                        : rateKey === 'lead' ? 'What the repliers became'
                        : 'Trials to date'}
                    </h4>
                    {rateKey === 'response' && <TrendChart points={trend} meta={meta} />}
                    {rateKey === 'lead' && <OutcomeComposition rows={rows} />}
                    {rateKey === 'trial' && <CumulativeTrials rows={rows} />}
                  </div>

                  <BarGroup title="By message type" segments={byMessage} meta={meta} />
                  <BarGroup title="By owner" segments={byOwner} meta={meta} />
                  <p className="text-[11px] text-ink-warm-400 leading-relaxed">
                    Every bar is denominated on outreach actually sent, so the slices
                    are comparable with each other and with the card. Segments under{' '}
                    {MIN_N} contacted are muted — their percentage swings too far on
                    one reply to rank against the rest.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
