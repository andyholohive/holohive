'use client';

/**
 * Position studio — the Korea Position Map and the category rank race, driven
 * by one week player so both move together.
 *
 *  Map: x = rolling 2-week share of all tracked Korean Telegram mentions,
 *       y = momentum (that share vs 2 weeks earlier, log2, ÷4 … ×4).
 *       Quadrants split at the peers' average share and flat momentum.
 *       The client leaves a trail of every week up to the one shown.
 *  Race: the same peers ranked by share that week; rows slide as ranks change.
 *
 * Weeks with a thin crawl are marked "low coverage" rather than hidden.
 * Data: lib/clientPosition.ts. Motion is CSS transitions on transforms and is
 * dropped under prefers-reduced-motion.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Crosshair, Pause, Play, RotateCcw, Trophy } from 'lucide-react';
import { useWidth } from '@/components/portal/korea/KoreaCharts';
import type { PositionSeries } from '@/lib/clientPosition';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Chart week label ("Sep 28") — an axis/scrubber tick, not a record date. */
const wk = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const fx = (f: number) => (Math.abs(f - Math.round(f)) < 0.05 ? String(Math.round(f)) : f.toFixed(1));
const times = (m: number) => { const f = 2 ** m; return f >= 1 ? `×${fx(f)}` : `÷${fx(1 / f)}`; };
const STEP_MS = 900;

function usePlayer(n: number) {
  const [i, setI] = useState(n - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { setI(n - 1); }, [n]);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setI((x) => {
        if (x >= n - 1) { setPlaying(false); return x; }
        return x + 1;
      });
    }, STEP_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, n]);
  const play = () => { if (i >= n - 1) setI(0); setPlaying(true); };
  return { i, setI: (v: number) => { setPlaying(false); setI(v); }, playing, play, pause: () => setPlaying(false) };
}

function PositionMap({ s, i }: { s: PositionSeries; i: number }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<string | null>(null);
  const H = 360, m = { t: 20, r: 24, b: 40, l: 52 };
  const W = Math.max(w, 300), iw = W - m.l - m.r, ih = H - m.t - m.b;
  // One x scale for every week, so a dot moving right means its share grew.
  const maxShare = Math.max(...s.projects.flatMap((p) => p.share.filter((v): v is number => v !== null)), 0.5) * 1.12;
  const X = (v: number) => m.l + (v / maxShare) * iw;
  const Y = (v: number) => m.t + ih / 2 - (v / 2) * (ih / 2);
  const shares = s.projects.map((p) => p.share[i]).filter((v): v is number => v !== null);
  const split = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : maxShare / 2;
  const me = s.projects.find((p) => p.isClient);
  const trail = me ? me.share.slice(0, i + 1).map((v, j) => (v === null || me.momentum[j] === null ? null : [X(v), Y(me.momentum[j]!)] as const)) : [];
  const path = trail.filter(Boolean).map((p, j) => `${j ? 'L' : 'M'}${p![0]},${p![1]}`).join('');
  const xTicks = Array.from({ length: 5 }, (_, k) => (maxShare / 4) * k);
  const quads = [
    { label: 'Rising', x: m.l + 8, y: m.t + 14, anchor: 'start' as const },
    { label: 'Leading', x: m.l + iw - 8, y: m.t + ih / 2 - 8, anchor: 'end' as const },
    { label: 'Quiet', x: m.l + 8, y: m.t + ih - 8, anchor: 'start' as const },
    { label: 'Fading', x: m.l + iw - 8, y: m.t + ih - 8, anchor: 'end' as const },
  ];
  const sx = X(split);

  // Label placement: flip left near the right edge, then nudge any label that
  // would sit on top of one already placed.
  const labels = new Map<string, { dx: number; dy: number; anchor: 'start' | 'end' }>();
  const boxes: Array<{ x0: number; x1: number; y: number }> = [];
  [...s.projects].sort((a, b) => Number(b.isClient) - Number(a.isClient)).forEach((p) => {
    const v = p.share[i], mo = p.momentum[i];
    if (v === null || mo === null) return;
    const x = X(v), y = Y(mo);
    const wpx = p.name.length * (p.isClient ? 7.2 : 6.2);
    const flip = x + wpx + 16 > m.l + iw;
    const off = p.isClient ? 13 : 9;
    const x0 = flip ? x - off - wpx : x + off, x1 = flip ? x - off : x + off + wpx;
    let dy = 4;
    for (let k = 0; k < 6 && boxes.some((b) => b.x1 > x0 && b.x0 < x1 && Math.abs(b.y - (y + dy)) < 13); k++) dy += 13;
    boxes.push({ x0, x1, y: y + dy });
    labels.set(p.id, { dx: flip ? -off : off, dy, anchor: flip ? 'end' : 'start' });
  });

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label="Korea position map" className="block overflow-visible">
          <defs>
            <radialGradient id="pm-lead" cx="100%" cy="0%" r="80%"><stop offset="0%" stopColor="#3e8692" stopOpacity="0.14" /><stop offset="100%" stopColor="#3e8692" stopOpacity="0" /></radialGradient>
            <filter id="pm-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>
          {/* Leading quadrant glow + quadrant split */}
          <rect x={sx} y={m.t} width={Math.max(m.l + iw - sx, 0)} height={ih / 2} fill="url(#pm-lead)" className="pm-anim" />
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="none" stroke="#EBE6D8" />
          <line x1={m.l} x2={m.l + iw} y1={Y(0)} y2={Y(0)} stroke="#D9D2BD" strokeDasharray="3 4" />
          <line x1={sx} x2={sx} y1={m.t} y2={m.t + ih} stroke="#D9D2BD" strokeDasharray="3 4" className="pm-anim" />
          {quads.map((q) => (
            <text key={q.label} x={q.x} y={q.y} textAnchor={q.anchor} fontSize="10" fontWeight="600" letterSpacing="0.18em" fill={q.label === 'Leading' ? '#2d6470' : '#9A9385'}>{q.label.toUpperCase()}</text>
          ))}
          {/* Axes */}
          {xTicks.map((t) => (
            <text key={t} x={X(t)} y={m.t + ih + 16} textAnchor="middle" fontSize="10" fill="#9A9385" className="tabular-nums">{t.toFixed(t < 1 ? 1 : 0)}%</text>
          ))}
          {[-2, -1, 0, 1, 2].map((t) => (
            <text key={t} x={m.l - 8} y={Y(t) + 3} textAnchor="end" fontSize="10" fill="#9A9385">{t === 0 ? 'flat' : times(t)}</text>
          ))}
          <text x={m.l + iw / 2} y={H - 4} textAnchor="middle" fontSize="10" fontWeight="600" letterSpacing="0.16em" fill="#6B6557">SHARE OF KOREAN TELEGRAM MENTIONS →</text>
          <text transform={`translate(12 ${m.t + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fontWeight="600" letterSpacing="0.16em" fill="#6B6557">MOMENTUM →</text>

          {/* Client trail */}
          {path && <path d={path} fill="none" stroke="#3e8692" strokeWidth="2" strokeOpacity="0.35" strokeLinecap="round" strokeLinejoin="round" />}
          {trail.map((p, j) => p && j < i && <circle key={j} cx={p[0]} cy={p[1]} r={2.5} fill="#3e8692" opacity={0.25 + (0.5 * j) / Math.max(i, 1)} />)}

          {/* Projects */}
          {s.projects.map((p) => {
            const v = p.share[i], mo = p.momentum[i];
            const ok = v !== null && mo !== null;
            const x = ok ? X(v!) : m.l, y = ok ? Y(mo!) : Y(0);
            const active = hover === p.id;
            return (
              <g key={p.id} className="pm-dot" style={{ transform: `translate(${x}px, ${y}px)`, opacity: ok ? 1 : 0 }}
                onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}>
                {p.isClient && <circle r={16} fill="#3e8692" opacity={0.18} filter="url(#pm-glow)" className="pm-pulse" />}
                <circle r={p.isClient ? 8 : active ? 6.5 : 5} fill={p.isClient ? '#3e8692' : '#FFFFFF'} stroke={p.isClient ? '#FFFFFF' : '#9A9385'} strokeWidth={p.isClient ? 2.5 : 1.5} />
                <text x={labels.get(p.id)?.dx ?? 9} y={labels.get(p.id)?.dy ?? 4} textAnchor={labels.get(p.id)?.anchor ?? 'start'} fontSize={p.isClient ? 12 : 11} fontWeight={p.isClient ? 700 : 500} fill={p.isClient ? '#1f4651' : '#46423A'}
                  paintOrder="stroke" stroke="#FBF9F4" strokeWidth="3">{p.name}</text>
                {active && ok && (
                  <text x={9} y={18} fontSize="10" fill="#6B6557" paintOrder="stroke" stroke="#FBF9F4" strokeWidth="3" className="tabular-nums">{v!.toFixed(2)}% · {times(mo!)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function RankRace({ s, i }: { s: PositionSeries; i: number }) {
  const ROW = 38;
  const ranked = s.projects
    .map((p) => ({ p, v: p.share[i] ?? 0 }))
    .sort((a, b) => b.v - a.v);
  const top = Math.max(ranked[0]?.v ?? 0, 0.01);
  const pos = new Map(ranked.map((r, k) => [r.p.id, k]));
  return (
    <div className="relative" style={{ height: ROW * s.projects.length }}>
      {s.projects.map((p) => {
        const k = pos.get(p.id)!;
        const v = p.share[i] ?? 0;
        return (
          <div key={p.id} className="rr-row absolute inset-x-0 flex items-center gap-3" style={{ height: ROW, transform: `translateY(${k * ROW}px)` }}>
            <span className={`w-6 text-right font-mono text-xs tabular-nums ${p.isClient ? 'font-semibold text-brand-deep' : 'text-ink-warm-400'}`}>{k + 1}</span>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-cream-100">
              <div className={`rr-bar absolute inset-y-0 left-0 rounded-md ${p.isClient ? 'bg-gradient-to-r from-brand to-brand-dark shadow-btn-brand' : 'bg-ink-warm-200'}`}
                style={{ width: `${Math.max((v / top) * 100, 1.5)}%` }} />
              <span className={`absolute inset-y-0 left-2.5 flex items-center truncate text-[13px] ${p.isClient ? 'font-semibold text-white' : 'font-medium text-ink-warm-800'}`}
                style={p.isClient && v / top < 0.35 ? { color: '#1f4651', left: `calc(${(v / top) * 100}% + 8px)` } : undefined}>{p.name}</span>
            </div>
            <span className={`w-14 text-right text-[13px] tabular-nums ${p.isClient ? 'font-semibold text-brand-deep' : 'text-ink-warm-700'}`}>{v.toFixed(2)}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function PositionStudio({ s }: { s: PositionSeries }) {
  const n = s.weeks.length;
  const { i, setI, playing, play, pause } = usePlayer(n);
  const me = s.projects.find((p) => p.isClient);
  const rankNow = useMemo(() => {
    if (!me) return null;
    const v = me.share[i];
    if (v === null) return null;
    return s.projects.filter((p) => (p.share[i] ?? 0) > v).length + 1;
  }, [s, i, me]);
  const quadrant = useMemo(() => {
    if (!me || me.share[i] === null || me.momentum[i] === null) return null;
    const shares = s.projects.map((p) => p.share[i]).filter((v): v is number => v !== null);
    const avg = shares.reduce((a, b) => a + b, 0) / shares.length;
    const hi = me.share[i]! >= avg, up = me.momentum[i]! >= 0;
    return hi && up ? 'Leading' : !hi && up ? 'Rising' : hi ? 'Fading' : 'Quiet';
  }, [s, i, me]);

  return (
    <Card className="min-w-0 overflow-hidden border-cream-200">
      <style>{`
        .pm-dot, .rr-row { transition: transform ${STEP_MS - 100}ms cubic-bezier(.22,.8,.3,1), opacity 400ms ease; }
        .rr-bar { transition: width ${STEP_MS - 100}ms cubic-bezier(.22,.8,.3,1); }
        .pm-anim { transition: all ${STEP_MS - 100}ms cubic-bezier(.22,.8,.3,1); }
        @keyframes pm-pulse { 0%,100% { opacity: .12; } 50% { opacity: .32; } }
        .pm-pulse { animation: pm-pulse 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pm-dot, .rr-row, .rr-bar, .pm-anim { transition: none; } .pm-pulse { animation: none; } }
      `}</style>
      <CardHeaderEditorial icon={Crosshair} title="Korea position" subtitle={`${s.peersLabel} · rolling 2-week share of Korean Telegram mentions`}
        action={quadrant ? <StatusBadge tone={quadrant === 'Leading' ? 'success' : quadrant === 'Rising' ? 'brand' : quadrant === 'Fading' ? 'warning' : 'neutral'} size="sm">{quadrant}</StatusBadge> : undefined} />
      <div className="grid grid-cols-1 gap-6 px-5 pb-2 pt-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <PositionMap s={s} i={i} />
        <div className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500"><Trophy className="h-3 w-3" />Rank race</p>
            {rankNow && <p className="text-xs text-ink-warm-500"><span className="display-serif text-xl text-ink-warm-900">#{rankNow}</span> of {s.projects.length}</p>}
          </div>
          <RankRace s={s} i={i} />
        </div>
      </div>
      {/* Week player */}
      <div className="flex flex-wrap items-center gap-3 border-t border-cream-100 bg-cream-50/60 px-5 py-3">
        <Button variant="brand" size="sm" className="h-8 w-8 p-0" onClick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play the weeks'}>
          {playing ? <Pause className="h-3.5 w-3.5" /> : i >= n - 1 ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <input type="range" min={0} max={n - 1} value={i} onChange={(e) => setI(Number(e.target.value))}
          aria-label="Week" className="h-1.5 min-w-[160px] flex-1 cursor-pointer accent-[#3e8692]" />
        <span className="w-28 text-right text-sm font-medium tabular-nums text-ink-warm-900">Week of {wk(s.weeks[i])}</span>
        {s.lowCoverage[i] && <StatusBadge tone="warning" size="sm">Low coverage</StatusBadge>}
      </div>
    </Card>
  );
}
