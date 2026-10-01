'use client';

/**
 * Small SVG charts for the portal Korea section.
 *
 * Drawn at the container's measured width (ResizeObserver) rather than scaled
 * from a fixed viewBox, so axis text stays the same size from phone to desktop
 * and week labels thin out instead of colliding. Single series each, so no
 * legend box — the card title names the series.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

const BRAND = '#3e8692';
const BRAND_FILL = 'rgba(62,134,146,0.10)';
const NEG = '#f59e0b';
const GRID = '#EBE6D8';
const AXIS = '#9A9385';
const INK = '#16140F';

export interface Point { x: string; y: number; tip: string; hollow?: boolean }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Label every Nth point so x-axis text never collides at narrow widths. */
function every(n: number, w: number) {
  const per = (w - 60) / Math.max(n, 1);
  return per >= 58 ? 1 : per >= 30 ? 2 : 3;
}

function Tip({ tip }: { tip: { x: number; y: number; html: string } | null }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 rounded-md bg-ink-warm-900 px-2.5 py-1.5 text-xs leading-snug text-cream-50 shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 10px))', whiteSpace: 'pre-line' }}
    >
      {tip.html}
    </div>
  );
}

export function LineChart({ points, min, max, ticks, fmt, label }: {
  points: Point[]; min: number; max: number; ticks: number[]; fmt: (v: number) => string; label: string;
}) {
  const { ref, w } = useWidth();
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  const H = 210, m = { t: 18, r: 16, b: 28, l: 46 };
  const W = Math.max(w, 220), iw = W - m.l - m.r, ih = H - m.t - m.b;
  const X = (i: number) => m.l + (points.length < 2 ? iw / 2 : (i * iw) / (points.length - 1));
  const Y = (v: number) => m.t + ih - ((v - min) / (max - min)) * ih;
  const step = every(points.length, W);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.y)}`).join('');
  const colW = iw / Math.max(points.length - 1, 1);
  return (
    <div ref={ref} className="relative w-full min-w-0">
      {w > 0 && points.length > 0 && (
        <svg width={W} height={H} role="img" aria-label={label} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke={GRID} />
              <text x={m.l - 8} y={Y(t) + 4} textAnchor="end" fontSize={10.5} fill={AXIS} className="font-mono">{fmt(t)}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const last = i === points.length - 1;
            const show = last || (i % step === 0 && points.length - 1 - i >= step);
            return show ? (
              <text key={p.x} x={X(i)} y={H - 6} textAnchor={i === 0 ? 'start' : last ? 'end' : 'middle'} fontSize={10.5} fill={AXIS} className="font-mono">{p.x}</text>
            ) : null;
          })}
          {points.length > 1 && <path d={`${d}L${X(points.length - 1)},${m.t + ih}L${X(0)},${m.t + ih}Z`} fill={BRAND_FILL} />}
          <path d={d} fill="none" stroke={BRAND} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => {
            const last = i === points.length - 1;
            return (
              <g key={`d${i}`}>
                <circle cx={X(i)} cy={Y(p.y)} r={last ? 5.5 : 4} fill={p.hollow ? '#fff' : BRAND} stroke={p.hollow ? BRAND : '#fff'} strokeWidth={2} />
                {last && <text x={X(i) - 10} y={Y(p.y) - 11} textAnchor="end" fontSize={12.5} fontWeight={600} fill={INK} className="font-mono">{fmt(p.y)}</text>}
                <rect
                  x={X(i) - colW / 2} y={m.t} width={colW} height={ih} fill="transparent" tabIndex={0}
                  aria-label={p.tip.replace(/\n/g, ', ')}
                  className="cursor-crosshair outline-none"
                  onMouseEnter={() => setTip({ x: X(i), y: Y(p.y), html: p.tip })}
                  onFocus={() => setTip({ x: X(i), y: Y(p.y), html: p.tip })}
                  onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tip tip={tip} />
    </div>
  );
}

export function ColumnChart({ points, min, max, ticks, fmt, label }: {
  points: Point[]; min: number; max: number; ticks: number[]; fmt: (v: number) => string; label: string;
}) {
  const { ref, w } = useWidth();
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const H = 210, m = { t: 18, r: 12, b: 28, l: 46 };
  const W = Math.max(w, 220), iw = W - m.l - m.r, ih = H - m.t - m.b;
  const Y = (v: number) => m.t + ih - ((v - min) / (max - min)) * ih;
  const bw = iw / Math.max(points.length, 1), gap = Math.min(12, bw * 0.3), base = Y(Math.max(min, 0));
  const step = every(points.length, W);
  return (
    <div ref={ref} className="relative w-full min-w-0">
      {w > 0 && points.length > 0 && (
        <svg width={W} height={H} role="img" aria-label={label} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke={t === 0 && min < 0 ? '#C7C0AF' : GRID} />
              <text x={m.l - 8} y={Y(t) + 4} textAnchor="end" fontSize={10.5} fill={AXIS} className="font-mono">{fmt(t)}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = m.l + i * bw + gap / 2, bwid = bw - gap, y = Y(p.y);
            const top = Math.min(y, base), h = Math.max(Math.abs(base - y), 2);
            const last = i === points.length - 1;
            const showX = last || (i % step === 0 && points.length - 1 - i >= step);
            return (
              <g key={p.x}>
                <rect x={x} y={top} width={bwid} height={h} rx={3} fill={p.y < 0 ? NEG : BRAND} opacity={hover === i ? 0.72 : 1} />
                {showX && <text x={x + bwid / 2} y={H - 6} textAnchor="middle" fontSize={10.5} fill={AXIS} className="font-mono">{p.x}</text>}
                {last && <text x={x + bwid / 2} y={p.y < 0 ? top + h + 14 : top - 7} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK} className="font-mono">{fmt(p.y)}</text>}
                <rect
                  x={m.l + i * bw} y={m.t} width={bw} height={ih} fill="transparent" tabIndex={0}
                  aria-label={p.tip.replace(/\n/g, ', ')} className="cursor-crosshair outline-none"
                  onMouseEnter={() => { setHover(i); setTip({ x: x + bwid / 2, y: top, html: p.tip }); }}
                  onFocus={() => { setHover(i); setTip({ x: x + bwid / 2, y: top, html: p.tip }); }}
                  onMouseLeave={() => { setHover(null); setTip(null); }} onBlur={() => { setHover(null); setTip(null); }}
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tip tip={tip} />
    </div>
  );
}

/** Horizontal bar list — labels always visible, so identity never rides on color. */
export function BarList({ rows, fmt }: {
  rows: Array<{ label: ReactNode; value: number; tone?: 'brand' | 'mute' | 'good' | 'bad'; strong?: boolean }>;
  fmt: (v: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const toneClass = { brand: 'bg-brand', mute: 'bg-ink-warm-300', good: 'bg-emerald-500', bad: 'bg-rose-500' };
  return (
    <div className="grid gap-2.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)_60px] sm:grid-cols-[116px_minmax(0,1fr)_68px] items-center gap-3 text-[13.5px]">
          <span className={`flex items-center gap-1.5 truncate ${r.strong ? 'font-semibold text-ink-warm-900' : 'text-ink-warm-700'}`}>{r.label}</span>
          <span className="h-4 overflow-hidden rounded bg-cream-100">
            <span className={`block h-full rounded-r ${toneClass[r.tone ?? 'brand']}`} style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%` }} />
          </span>
          <span className="text-right font-mono text-[12.5px] font-medium tabular-nums text-ink-warm-900">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
