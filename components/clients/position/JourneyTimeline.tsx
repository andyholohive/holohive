'use client';

/**
 * Journey timeline — the engagement on one line, kickoff to term end, with a
 * "you are here" marker. Above the track: moments (first post, best week, top
 * post, Korean listings). Below: every lineup week, coloured by how much of it
 * posted. Positions are percentages of the term, so it reflows at any width.
 */

import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { StatusBadge } from '@/components/ui/status-badge';
import { Route, Flag, Sparkles, Trophy, Rocket, Landmark, Send } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import type { ClientDashboardData } from '@/lib/clientDashboard';

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n));

interface Moment { key: string; at: number; icon: typeof Flag; label: string; sub: string; tone: 'brand' | 'amber' | 'emerald' | 'sky' }
const TONE = {
  brand: 'bg-brand text-white ring-brand/25',
  amber: 'bg-amber-500 text-white ring-amber-500/25',
  emerald: 'bg-emerald-500 text-white ring-emerald-500/25',
  sky: 'bg-sky-500 text-white ring-sky-500/25',
};

export function JourneyTimeline({ d }: { d: ClientDashboardData }) {
  const j = d.journey;
  const startIso = j.start ?? j.firstPost ?? j.lineups[0]?.weekOf;
  if (!startIso) return null;
  const now = t(j.today);
  const start = t(startIso);
  // No term end on file: draw four weeks past today so "you are here" still has room.
  const end = j.end ? t(j.end) : now + 28 * DAY;
  const span = Math.max(end - start, DAY);
  const at = (ms: number) => Math.max(0, Math.min(100, ((ms - start) / span) * 100));
  const daysLeft = Math.round((end - now) / DAY);
  const elapsed = at(now);

  const moments: Moment[] = [
    { key: 'kick', at: start, icon: Flag, label: 'Kickoff', sub: formatDate(startIso), tone: 'brand' },
  ];
  if (j.firstPost) moments.push({ key: 'first', at: t(j.firstPost), icon: Send, label: 'First post', sub: formatDate(j.firstPost), tone: 'sky' });
  if (j.bestWeek) moments.push({ key: 'best', at: t(j.bestWeek.week) + 3 * DAY, icon: Trophy, label: 'Best week', sub: `${compact(j.bestWeek.reads)} reads`, tone: 'amber' });
  if (j.topPost) moments.push({ key: 'top', at: t(j.topPost.date), icon: Sparkles, label: 'Top post', sub: `${j.topPost.kol} · ${compact(j.topPost.reads)}`, tone: 'emerald' });
  for (const l of j.listings) moments.push({ key: `list${l.date}`, at: t(l.date), icon: Landmark, label: 'Korean listing', sub: l.venues.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(', '), tone: 'sky' });
  // Moments within ~3% of each other share one pin (stacked labels), then
  // pins stagger into three lanes so neighbouring labels never collide.
  type Pin = { key: string; pct: number; lane: number; items: Moment[] };
  const pins: Pin[] = [];
  for (const mo of moments.filter((x) => x.at >= start && x.at <= end).sort((a, b) => a.at - b.at)) {
    const pct = at(mo.at);
    const prev = pins[pins.length - 1];
    if (prev && pct - prev.pct < 3) prev.items.push(mo);
    else pins.push({ key: mo.key, pct, lane: 0, items: [mo] });
  }
  const laneEnd = [-100, -100, -100];
  for (const p of pins) {
    const lane = laneEnd.findIndex((e) => p.pct - e >= 17);
    p.lane = lane === -1 ? laneEnd.indexOf(Math.min(...laneEnd)) : lane;
    laneEnd[p.lane] = p.pct;
  }

  // Month ticks between start and end.
  const ticks: Array<{ pct: number; label: string }> = [];
  const c = new Date(start); c.setUTCDate(1); c.setUTCMonth(c.getUTCMonth() + 1);
  while (c.getTime() < end) { ticks.push({ pct: at(c.getTime()), label: MONTHS[c.getUTCMonth()] }); c.setUTCMonth(c.getUTCMonth() + 1); }

  const weekTone = (l: typeof j.lineups[number]) => {
    const past = t(l.weekOf) + 7 * DAY <= now;
    if (!l.total) return 'bg-cream-200';
    if (l.posted >= l.total) return 'bg-emerald-500';
    if (!past) return l.posted > 0 ? 'bg-brand' : 'bg-brand/40';
    return l.posted > 0 ? 'bg-amber-400' : 'bg-rose-400';
  };
  const ending = j.end && daysLeft <= 14;

  return (
    <Card className="min-w-0 overflow-hidden border-cream-200">
      <style>{`
        @keyframes jt-fill { from { width: 0; } }
        .jt-fill { animation: jt-fill 1.1s cubic-bezier(.22,.8,.3,1) both; }
        @keyframes jt-ping { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(2.6); opacity: 0; } }
        .jt-ping { animation: jt-ping 1.8s ease-out infinite; }
        @keyframes jt-pop { from { opacity: 0; } to { opacity: 1; } }
        .jt-pop { animation: jt-pop .5s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .jt-fill, .jt-ping, .jt-pop { animation: none; } }
      `}</style>
      <CardHeaderEditorial icon={Route} title="Journey" subtitle={j.end ? `${formatDate(startIso)} to ${formatDate(j.end)}` : `Since ${formatDate(startIso)} · no term end on file`}
        action={j.end ? (
          <StatusBadge tone={daysLeft < 0 ? 'danger' : ending ? 'warning' : 'neutral'} size="sm">
            {daysLeft < 0 ? 'Term ended' : daysLeft === 0 ? 'Ends today' : `${daysLeft} days left`}
          </StatusBadge>
        ) : undefined} />
      <div className="overflow-x-auto px-6 pb-5 pt-2">
        <div className="relative min-w-[560px]">
          {/* Moments */}
          <div className="relative h-[164px]">
            {pins.map((p, k) => (
              <div key={p.key} className={`jt-pop absolute bottom-0 flex flex-col ${p.pct < 8 ? 'items-start' : p.pct > 92 ? 'items-end' : 'items-center'}`}
                // Pins near either end hang their labels inward instead of off the card.
                style={{ left: `${p.pct}%`, transform: p.pct < 8 ? 'translateX(-12px)' : p.pct > 92 ? 'translateX(calc(-100% + 12px))' : 'translateX(-50%)', animationDelay: `${300 + k * 90}ms` }}>
                <div className={`space-y-1 whitespace-nowrap ${p.pct < 8 ? 'text-left' : p.pct > 92 ? 'text-right' : 'text-center'}`}>
                  {p.items.map((m) => (
                    <div key={m.key}>
                      <p className="text-[11px] font-semibold text-ink-warm-900">{m.label}</p>
                      <p className="text-[10.5px] text-ink-warm-500 tabular-nums">{m.sub}</p>
                    </div>
                  ))}
                </div>
                {/* Stem length is the lane: higher lanes lift the label clear of their neighbours. */}
                <div className={`w-px bg-cream-300 ${p.pct < 8 ? 'ml-3' : p.pct > 92 ? 'mr-3' : ''}`} style={{ height: 6 + p.lane * 36 }} />
                <div className="flex -space-x-1.5">
                  {p.items.map((m) => (
                    <div key={m.key} className={`flex h-6 w-6 items-center justify-center rounded-full ring-4 ${TONE[m.tone]}`}><m.icon className="h-3 w-3" /></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* Track */}
          <div className="relative mt-2 h-2.5 rounded-full bg-cream-100">
            <div className="jt-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand/50 via-brand to-brand-dark" style={{ width: `${elapsed}%` }} />
            <div className="absolute top-1/2" style={{ left: `${elapsed}%` }}>
              <span className="jt-ping absolute -left-2 -top-2 h-4 w-4 rounded-full bg-brand" />
              <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-[3px] border-white bg-brand-deep shadow" />
            </div>
            {j.end && <div className={`absolute -top-1 right-0 h-[18px] w-1 rounded-full ${ending ? 'bg-amber-500' : 'bg-ink-warm-300'}`} />}
          </div>
          {/* Lineup weeks */}
          <div className="relative mt-2 h-3">
            {j.lineups.map((l) => {
              const a = at(t(l.weekOf)), b = at(t(l.weekOf) + 7 * DAY);
              return (
                <div key={l.weekOf} title={`Week ${l.weekNumber}: ${l.posted} of ${l.total} posted`}
                  className={`absolute inset-y-0 rounded-[3px] ${weekTone(l)}`} style={{ left: `calc(${a}% + 1px)`, width: `calc(${Math.max(b - a, 0.6)}% - 2px)` }} />
              );
            })}
          </div>
          {/* Axis */}
          <div className="relative mt-1.5 h-4 text-[10px] text-ink-warm-400">
            {ticks.map((x) => <span key={`${x.label}${x.pct}`} className="absolute -translate-x-1/2" style={{ left: `${x.pct}%` }}>{x.label}</span>)}
            <span className="absolute -translate-x-1/2 font-semibold text-brand-deep" style={{ left: `${elapsed}%`, top: 14 }}>Today</span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-warm-500">
          <span className="font-semibold uppercase tracking-[0.16em]">Lineup weeks</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />All posted</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />Partly</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-400" />None posted</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand/40" />Running</span>
          <span className="ml-auto flex items-center gap-1.5"><Rocket className="h-3 w-3" />{j.lineups.length} lineup weeks · {j.lineups.reduce((n, l) => n + l.posted, 0)} posts from lineups</span>
        </div>
      </div>
    </Card>
  );
}
