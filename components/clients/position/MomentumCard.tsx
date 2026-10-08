'use client';

/**
 * Momentum index card — the 0–100 score (lib/clientMomentum.ts), its weekly
 * history as a sparkline, the parts behind it, and where the current pace
 * lands by the end of the term. Team-only.
 */

import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Gauge, Flag } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import type { ClientDashboardData } from '@/lib/clientDashboard';
import type { Momentum } from '@/lib/clientMomentum';

const DAY = 86_400_000;
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(Math.round(n)));
const band = (s: number) => (s >= 65 ? { label: 'Accelerating', tone: 'success' as const } : s >= 45 ? { label: 'Steady', tone: 'neutral' as const } : { label: 'Slowing', tone: 'warning' as const });

function Spark({ h }: { h: Momentum['history'] }) {
  const W = 260, H = 64, pad = 4;
  const X = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(h.length - 1, 1);
  const Y = (v: number) => H - pad - (v / 100) * (H - 2 * pad);
  const line = h.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.score)}`).join('');
  const area = `${line}L${X(h.length - 1)},${H - pad}L${X(0)},${H - pad}Z`;
  const last = h[h.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Momentum, last weeks">
      <defs><linearGradient id="mc-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3e8692" stopOpacity="0.28" /><stop offset="100%" stopColor="#3e8692" stopOpacity="0" /></linearGradient></defs>
      <line x1={pad} x2={W - pad} y1={Y(50)} y2={Y(50)} stroke="#D4E5E4" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={area} fill="url(#mc-a)" />
      <path d={line} fill="none" stroke="#3e8692" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="mc-line" />
      <circle cx={X(h.length - 1)} cy={Y(last.score)} r="3.5" fill="#1f4651" stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MomentumCard({ d, m }: { d: ClientDashboardData; m: Momentum | null }) {
  // On pace: total so far plus the last 4 complete weeks' average for each week left.
  const done = d.weekly.filter((w) => !w.partial);
  const recent = done.slice(-4);
  const perWeek = recent.length ? recent.reduce((n, w) => n + w.reads, 0) / recent.length : 0;
  const end = d.journey.end;
  const daysLeft = end ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${d.journey.today}T00:00:00Z`)) / DAY) : null;
  const weeksLeft = daysLeft !== null ? Math.max(daysLeft / 7, 0) : null;
  const projected = d.totals && weeksLeft !== null ? d.totals.reads + perWeek * weeksLeft : null;
  const b = m ? band(m.score) : null;

  return (
    <div className="crd-feature flex h-full min-w-0 flex-col p-5">
      <style>{`
        @keyframes mc-draw { from { stroke-dasharray: 0 2000; } to { stroke-dasharray: 2000 0; } }
        .mc-line { animation: mc-draw 1.6s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .mc-line { animation: none; } }
      `}</style>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-warm-500"><Gauge className="h-3.5 w-3.5 text-brand" />Momentum index</p>
        {b && <StatusBadge tone={b.tone} size="sm">{b.label}</StatusBadge>}
      </div>
      {m ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="display-serif text-[52px] leading-none text-ink-warm-900 tabular-nums">{m.score}</span>
            <span className="text-sm text-ink-warm-500">/ 100</span>
            {m.change3w !== null && (
              <span className={`text-xs font-medium tabular-nums ${m.change3w > 0 ? 'text-emerald-600' : m.change3w < 0 ? 'text-rose-600' : 'text-ink-warm-400'}`}>
                {m.change3w > 0 ? '↑' : m.change3w < 0 ? '↓' : '→'} {Math.abs(m.change3w)} in 3 weeks
              </span>
            )}
          </div>
          <div className="mt-3"><Spark h={m.history} /></div>
          <div className="mt-3 space-y-1.5">
            {m.parts.map((p) => (
              <div key={p.key} className="grid grid-cols-[110px_minmax(0,1fr)_28px] items-center gap-2 text-xs">
                <span className="truncate text-ink-warm-700">{p.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/80">
                  <span className={`block h-full rounded-full ${p.score >= 60 ? 'bg-brand' : p.score >= 40 ? 'bg-ink-warm-300' : 'bg-amber-400'}`} style={{ width: `${Math.max(p.score, 3)}%` }} />
                </span>
                <span className="text-right font-mono tabular-nums text-ink-warm-900">{p.score}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-warm-500">Needs about 8 weeks of posts or Korea Signal history to score.</p>
      )}
      {projected !== null && end && (
        <div className="mt-auto border-t border-brand-light/70 pt-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500"><Flag className="h-3 w-3" />On pace</p>
          <p className="mt-1 text-[13px] text-ink-warm-700">
            {daysLeft! <= 0
              ? <>{daysLeft === 0 ? 'Term ends today' : `Term ended ${formatDate(end)}`}: <b className="font-semibold text-ink-warm-900">{compact(d.totals!.reads)} reads</b> delivered.</>
              : <>At {compact(perWeek)} reads a week, <b className="font-semibold text-ink-warm-900">{compact(projected)} reads</b> by {formatDate(end)}.</>}
          </p>
        </div>
      )}
    </div>
  );
}
