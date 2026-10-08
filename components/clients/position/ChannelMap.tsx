'use client';

/**
 * Channel map — the Korean Telegram channels around a client, last 28 days.
 *
 *   Inner ring: channels that mentioned the client. Teal = our hired
 *               creators, sky = organic (nobody paid for it).
 *   Outer ring: channels that talked about the client's peers but never the
 *               client — the gap, and the shortlist of who to reach next.
 *
 * Node size is how much that channel talked about this market (client + peer
 * mentions). Team-only: it names channels and shows who's hired.
 */

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { EmptyState } from '@/components/ui/empty-state';
import { Network, Target } from 'lucide-react';
import { useWidth } from '@/components/portal/korea/KoreaCharts';
import type { ChannelNode } from '@/lib/clientPosition';

const COLORS = { hired: '#3e8692', organic: '#0EA5E9', gap: '#C7C0AF' };

export function ChannelMap({ channels, clientName }: { channels: ChannelNode[] | null; clientName: string }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    if (!channels?.length) return null;
    const inner = channels.filter((c) => c.client > 0);
    const outer = channels.filter((c) => c.client === 0).sort((a, b) => b.peers - a.peers);
    const max = Math.max(...channels.map((c) => c.client + c.peers), 1);
    // Golden-angle spacing keeps neighbours apart without a force simulation.
    const place = (list: ChannelNode[], ring: number, phase: number) => list.map((c, k) => ({
      c, ring, angle: phase + (k * 2 * Math.PI) / Math.max(list.length, 1) + (k % 2 ? 0.12 : -0.12),
      r: 4 + 9 * Math.sqrt((c.client + c.peers) / max),
      // Alternate inner nodes between two radii so a busy ring doesn't overlap.
      stagger: ring === 0 && k % 2 === 1,
    }));
    return { inner, outer, nodes: [...place(inner, 0, -Math.PI / 2), ...place(outer, 1, -Math.PI / 2 + 0.3)] };
  }, [channels]);

  if (!layout) {
    return (
      <Card className="border-cream-200">
        <EmptyState icon={Network} title="No channel data yet" description="Channel coverage appears once Korea Signal has mentions of this client or its peers." />
      </Card>
    );
  }

  const W = Math.max(w, 320), H = Math.min(Math.max(W * 0.7, 380), 540);
  const cx = W / 2, cy = H / 2;
  const R = [Math.min(W, H) * 0.25, Math.min(W, H) * 0.465];
  const rad = (n: typeof layout.nodes[number]) => (n.ring === 1 ? R[1] : n.stagger ? R[0] * 1.32 : R[0]);
  const pos = (n: typeof layout.nodes[number]) => ({ x: cx + Math.cos(n.angle) * rad(n) * 1.18, y: cy + Math.sin(n.angle) * rad(n) });
  const hired = layout.inner.filter((c) => c.hired).length;
  const organic = layout.inner.length - hired;
  const gaps = layout.outer.slice(0, 6);
  const hv = layout.nodes.find((n) => n.c.id === hover);

  return (
    <Card className="min-w-0 overflow-hidden border-cream-200">
      <style>{`
        @keyframes cm-draw { from { stroke-dashoffset: 400; } to { stroke-dashoffset: 0; } }
        .cm-line { stroke-dasharray: 400; animation: cm-draw 1.4s ease-out both; }
        @keyframes cm-in { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }
        .cm-node { transform-box: fill-box; transform-origin: center; animation: cm-in .6s cubic-bezier(.3,1.4,.5,1) both; }
        @media (prefers-reduced-motion: reduce) { .cm-line, .cm-node { animation: none; } }
      `}</style>
      <CardHeaderEditorial icon={Network} title="Korean channel map" subtitle="Last 28 days · who talks about you, and who only talks about your peers" />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div ref={ref} className="relative min-w-0 rounded-xl bg-[radial-gradient(circle_at_50%_50%,rgba(62,134,146,0.10),transparent_60%)]">
          {w > 0 && (
            <svg width={W} height={H} role="img" aria-label={`Korean channels mentioning ${clientName} and its peers`} className="block">
              <ellipse cx={cx} cy={cy} rx={R[0] * 1.16 * 1.18} ry={R[0] * 1.16} fill="none" stroke="#D4E5E4" strokeDasharray="2 5" />
              <ellipse cx={cx} cy={cy} rx={R[1] * 1.18} ry={R[1]} fill="none" stroke="#EBE6D8" strokeDasharray="2 6" />
              {layout.nodes.filter((n) => n.ring === 0).map((n, k) => {
                const p = pos(n);
                return <line key={`l${n.c.id}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={n.c.hired ? COLORS.hired : COLORS.organic}
                  strokeOpacity={hover && hover !== n.c.id ? 0.12 : 0.45} strokeWidth={1 + Math.min(n.c.client, 8) * 0.35} className="cm-line" style={{ animationDelay: `${k * 40}ms` }} />;
              })}
              {layout.nodes.map((n, k) => {
                const p = pos(n);
                const fill = n.ring === 1 ? '#FFFFFF' : n.c.hired ? COLORS.hired : COLORS.organic;
                return (
                  <g key={n.c.id} onMouseEnter={() => setHover(n.c.id)} onMouseLeave={() => setHover(null)} className="cursor-default">
                    <circle cx={p.x} cy={p.y} r={n.r} fill={fill} stroke={n.ring === 1 ? COLORS.gap : '#FFFFFF'} strokeWidth={n.ring === 1 ? 1.5 : 2}
                      strokeDasharray={n.ring === 1 ? '3 2' : undefined} opacity={hover && hover !== n.c.id ? 0.35 : 1}
                      className="cm-node" style={{ animationDelay: `${200 + k * 25}ms` }} />
                  </g>
                );
              })}
              {/* The client at the centre */}
              <circle cx={cx} cy={cy} r={30} fill="#3e8692" opacity={0.14} />
              <circle cx={cx} cy={cy} r={22} fill="url(#cm-core)" stroke="#FFFFFF" strokeWidth={3} />
              <defs><linearGradient id="cm-core" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3e8692" /><stop offset="100%" stopColor="#1f4651" /></linearGradient></defs>
              <text x={cx} y={cy + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#FFFFFF">{clientName.charAt(0).toUpperCase()}</text>
              {hv && (() => {
                const p = pos(hv);
                const right = p.x < W - 200;
                return (
                  <g pointerEvents="none">
                    <rect x={right ? p.x + hv.r + 6 : p.x - hv.r - 196} y={p.y - 30} width={190} height={56} rx={8} fill="#16140F" opacity={0.92} />
                    <text x={right ? p.x + hv.r + 16 : p.x - hv.r - 186} y={p.y - 12} fontSize="12" fontWeight="600" fill="#FFFFFF">{hv.c.name.slice(0, 24)}</text>
                    <text x={right ? p.x + hv.r + 16 : p.x - hv.r - 186} y={p.y + 6} fontSize="11" fill="#E2DDCE">
                      {hv.c.client} on {clientName} · {hv.c.peers} on peers
                    </text>
                    <text x={right ? p.x + hv.r + 16 : p.x - hv.r - 186} y={p.y + 20} fontSize="10.5" fill="#C7C0AF">
                      {hv.ring === 1 ? 'Not covering you yet' : hv.c.hired ? 'Hired creator' : 'Organic'}{hv.c.members ? ` · ${hv.c.members.toLocaleString('en-US')} members` : ''}
                    </text>
                  </g>
                );
              })()}
            </svg>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: 'Hired', v: hired, c: COLORS.hired },
              { k: 'Organic', v: organic, c: COLORS.organic },
              { k: 'Gap', v: layout.outer.length, c: COLORS.gap },
            ].map((x) => (
              <div key={x.k} className="rounded-lg border border-cream-200 bg-white px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500"><i className="h-2 w-2 rounded-full" style={{ background: x.c }} />{x.k}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink-warm-900">{x.v}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-warm-500">
            {organic > 0
              ? `${organic} channel${organic === 1 ? '' : 's'} covered ${clientName} without being paid to.`
              : `Every mention came from a hired creator so far.`}
          </p>
          {gaps.length > 0 && (
            <div className="rounded-lg border border-cream-200 bg-cream-50/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500"><Target className="h-3 w-3" />Reach next</p>
              <ul className="space-y-1.5">
                {gaps.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium text-ink-warm-900">{g.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-warm-500">{g.peers} peer mention{g.peers === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
