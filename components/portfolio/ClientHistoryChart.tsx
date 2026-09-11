'use client';

/**
 * Active clients, trailing twelve months.
 *
 * [2026-09-11, Andy] "Add a graph of how many active clients we had over the
 * last year." Every other number on this page is a snapshot of today; this is
 * the only thing on it with a time axis, which is what makes the shape of the
 * book of business visible rather than just its current size.
 *
 * [2026-09-11, Andy] Three follow-ups, all applied here: ad-hoc engagements are
 * out entirely, the bars became a line, and hovering a month names the clients
 * behind the number with their logos — because "5" is the least interesting
 * thing the chart knows, and *which* five is the question anyone actually asks
 * of it.
 *
 * The hover layer is the point of the component, so it is built to be hard to
 * miss: the whole plot is one hit area, the nearest month wins rather than
 * requiring a hit on the dot itself, and the tooltip is HTML rather than SVG so
 * the logos and wrapping cost nothing.
 */

import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { MonthPoint, ClientChip } from '@/lib/portfolioService';

const W = 720;          // viewBox width — the SVG scales to its container
const H = 168;          // plot height
const PAD_L = 30;       // room for the y axis labels
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 24;       // room for the month labels

/** Client logo, or their initials when we have no image on file. */
function Chip({ c }: { c: ClientChip }) {
  const initials = c.name.split(' ').map(w => w.charAt(0).toUpperCase()).join('').slice(0, 2);
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-cream-200 bg-cream-50 pl-1 pr-2.5 py-1">
      {c.logoUrl ? (
        <img
          src={c.logoUrl}
          alt=""
          className="h-4 w-4 rounded-full object-cover bg-white ring-1 ring-cream-200"
        />
      ) : (
        <span className="h-4 w-4 rounded-full bg-brand text-white grid place-items-center text-[8px] font-bold">
          {initials}
        </span>
      )}
      <span className="text-[11.5px] text-ink-warm-900 leading-none">{c.name}</span>
    </span>
  );
}

export function ClientHistoryChart({ points }: { points: MonthPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const peak = Math.max(...points.map(p => p.retained), 1);
  // Head-room above the peak so the line never runs along the top edge.
  const ceiling = peak + 1;
  const ticks: number[] = [];
  const step = ceiling <= 6 ? 1 : 2;
  for (let v = 0; v <= ceiling; v += step) ticks.push(v);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD_T + plotH - (v / ceiling) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.retained)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  const latest = points[points.length - 1];
  const net = latest.retained - points[0].retained;
  const active = hover !== null ? points[hover] : latest;

  /** Nearest month to the pointer, so you never have to hit the dot. */
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    // The SVG scales to its container, so map client px back into viewBox units.
    const vx = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(i) - vx) < Math.abs(x(best) - vx)) best = i;
    }
    setHover(best);
  }

  return (
    <Card className="border-cream-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-200 bg-cream-50 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
            Trailing twelve months
          </p>
          <h3 className="text-base font-semibold text-ink-warm-900 tracking-tight">
            Active clients per month
          </h3>
          <p className="text-[12.5px] text-ink-warm-500 leading-relaxed max-w-[70ch]">
            A client counts for a month if an engagement term covered any part of it.
            Hover any month to see who they were.
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className="text-2xl font-bold text-ink-warm-900 tabular-nums leading-none">
            {latest.retained}
          </span>
          <span className="text-[11px] text-ink-warm-500">
            live now{net !== 0 && `, ${net > 0 ? '+' : ''}${net} on the year`}
          </span>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-3">
        {/* The plot and its tooltip share a positioning context. */}
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto touch-none"
            style={{ aspectRatio: `${W} / ${H}` }}
            role="img"
            aria-label={`Active clients per month. ${points.map(p => `${p.label}: ${p.retained}`).join(', ')}.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="chc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3e8692" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#3e8692" stopOpacity="0" />
              </linearGradient>
            </defs>

            {ticks.map(t => (
              <g key={t}>
                <line
                  x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)}
                  stroke="#e7e1d6" strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : '2 4'}
                />
                <text
                  x={PAD_L - 8} y={y(t) + 3.5} textAnchor="end"
                  fontSize={10} fill="#a8a096" style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {t}
                </text>
              </g>
            ))}

            <path d={area} fill="url(#chc-fill)" />
            <path d={line} fill="none" stroke="#3e8692" strokeWidth={2}
                  strokeLinejoin="round" strokeLinecap="round" />

            {/* Crosshair on the hovered month. */}
            {hover !== null && (
              <line
                x1={x(hover)} x2={x(hover)} y1={PAD_T - 4} y2={y(0)}
                stroke="#3e8692" strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
              />
            )}

            {points.map((p, i) => {
              const on = hover === i || (hover === null && i === points.length - 1);
              return (
                <g key={p.month}>
                  {/* A surface-coloured ring keeps the dot legible on the line. */}
                  <circle
                    cx={x(i)} cy={y(p.retained)} r={on ? 5.5 : 3.5}
                    fill="#3e8692" stroke="#ffffff" strokeWidth={2}
                  />
                  <text
                    x={x(i)} y={H - 6} textAnchor="middle"
                    fontSize={10.5} fill={on ? '#5c554b' : '#a8a096'}
                    fontWeight={on ? 600 : 400}
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Tooltip. The card clips anything that leaves it, so the anchor
              flips rather than being nudged: it right-aligns near the right
              edge, left-aligns near the left, and drops below the point when
              the point sits too high for the tooltip to fit above it. A
              centred-and-clamped tooltip looked fine in the middle of the
              series and lost its edge against the card on the last month —
              which is the one anybody looks at first. */}
          {(() => {
            if (hover === null) return null;
            const px = x(hover) / W;
            const anchorX = px > 0.72 ? '-100%' : px < 0.28 ? '0%' : '-50%';
            const pointY = y(points[hover].retained);
            const below = pointY < 70;
            return (
            <div
              className="pointer-events-none absolute z-10 rounded-[10px] border border-cream-200 bg-white shadow-lg px-3 py-2.5 flex flex-col gap-2 w-max max-w-[290px]"
              style={{
                left: `${px * 100}%`,
                top: `${(pointY / H) * 100}%`,
                marginTop: below ? 14 : -14,
                transform: `translate(${anchorX}, ${below ? '0' : '-100%'})`,
              }}
            >
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] font-semibold text-ink-warm-900">
                  {points[hover].longLabel}
                </span>
                <span className="text-[12px] font-semibold text-brand tabular-nums">
                  {points[hover].retained}
                </span>
              </span>
              {points[hover].clients.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {points[hover].clients.map(c => <Chip key={c.id} c={c} />)}
                </span>
              ) : (
                <span className="text-[11.5px] text-ink-warm-400 italic">No active clients</span>
              )}
            </div>
            );
          })()}
        </div>

        {/* The same roster the tooltip shows, kept visible so the chart still
            answers "who" without a pointer — and on touch, where there is no
            hover at all. */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 mr-1">
            {hover === null ? 'Live now' : active.longLabel}
          </span>
          {active.clients.length > 0
            ? active.clients.map(c => <Chip key={c.id} c={c} />)
            : <span className="text-[11.5px] text-ink-warm-400 italic">No active clients</span>}
        </div>

        <p className="text-[12px] text-ink-warm-500 leading-relaxed max-w-[80ch] pt-1 border-t border-cream-100">
          {net > 0
            ? `Net ${net} more ${net === 1 ? 'client' : 'clients'} than twelve months ago`
            : net < 0
              ? `Net ${Math.abs(net)} fewer than twelve months ago`
              : 'Level with twelve months ago'}
          {' — '}
          {latest.retained === peak
            ? `at its twelve-month high of ${peak}.`
            : `down from a high of ${peak} in ${points.find(p => p.retained === peak)!.label}.`}
          {' '}
          One-off ad-hoc engagements are excluded, as are archived records — which is what keeps the
          test accounts out. Genuine past clients are still counted, so this is a history rather
          than a view of who is live today.
        </p>
      </div>
    </Card>
  );
}
