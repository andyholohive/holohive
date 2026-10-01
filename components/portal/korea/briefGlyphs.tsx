'use client';

/**
 * Animated duotone icons for the weekly Korea brief. Each is a 24×24 SVG in
 * currentColor: a soft filled body plus a crisp stroked detail, with one
 * small loop of motion that says what the section is (a radar sweeps, volume
 * bars pulse, a broadcast pings). Animation classes come from briefMotion.tsx
 * and stop under prefers-reduced-motion.
 *
 * `GlyphBadge` frames one in the brief's glass tile.
 */

import type { ReactNode } from 'react';

type GlyphProps = { className?: string };

function Svg({ className = 'h-5 w-5', children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className={`overflow-visible ${className}`} aria-hidden>
      {children}
    </svg>
  );
}

/** Radar with a rotating sweep and a blip. */
export function RadarGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={0.1} />
      <circle cx="12" cy="12" r="5.5" strokeOpacity={0.45} />
      <circle cx="12" cy="12" r="9" />
      <g className="kb-spin">
        <path d="M12 12 L12 3 A9 9 0 0 1 19.8 7.5 Z" fill="currentColor" fillOpacity={0.35} stroke="none" />
        <path d="M12 12 L12 3" />
      </g>
      <circle cx="16.2" cy="8.6" r="1.1" fill="currentColor" stroke="none" className="kb-blink" />
    </Svg>
  );
}

/** Crosshair with a slowly turning dashed ring and a pinging centre. */
export function TargetGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3.2 2.6" className="kb-spin-slow" />
      <circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity={0.14} />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
      <circle cx="12" cy="12" r="2.2" strokeOpacity={0.7} className="kb-ping" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Donut with Korea's slice. */
export function ShareGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={0.1} strokeOpacity={0.4} />
      <path d="M12 3.5 A8.5 8.5 0 0 1 20.2 14.2" strokeWidth={2.6} pathLength={1} className="kb-loop-draw" />
      <circle cx="12" cy="12" r="3.6" strokeOpacity={0.5} />
    </Svg>
  );
}

/** Equaliser bars for trading volume. */
export function VolumeGlyph(p: GlyphProps) {
  const bars = [[4, 10], [8.5, 5], [13, 8], [17.5, 3]];
  return (
    <Svg {...p}>
      <path d="M2.5 20.5h19" strokeOpacity={0.45} />
      {bars.map(([x, y], i) => (
        <rect key={x} x={x} y={y} width="2.8" height={19 - y} rx="1" fill="currentColor" fillOpacity={0.35}
          className="kb-eq" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </Svg>
  );
}

/** Broadcast: a mast with rings pinging out. */
export function BroadcastGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity={0.12} stroke="none" />
      <circle cx="12" cy="12" r="5" strokeOpacity={0.55} className="kb-ping" />
      <circle cx="12" cy="12" r="5" strokeOpacity={0.55} className="kb-ping kb-ping-2" />
      <path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6M16.8 7.2a6.8 6.8 0 0 1 0 9.6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A trend line that keeps redrawing. */
export function TrendGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="3" width="19" height="18" rx="3" fill="currentColor" fillOpacity={0.1} strokeOpacity={0.4} />
      <path d="M5.5 16.5 9.5 12l3 2.5 6-7" pathLength={1} className="kb-loop-draw" />
      <circle cx="18.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" className="kb-blink" />
    </Svg>
  );
}

/** Shield with a check, for the listing checklist. */
export function ShieldGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M12 2.5 19.5 5.5v6c0 4.6-3.2 8.3-7.5 10-4.3-1.7-7.5-5.4-7.5-10v-6Z" fill="currentColor" fillOpacity={0.14} />
      <path d="m8.5 12 2.4 2.4 4.6-4.9" pathLength={1} className="kb-loop-draw" />
    </Svg>
  );
}

/** Speech bubble with typing dots. */
export function VoiceGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5Z"
        fill="currentColor" fillOpacity={0.14} />
      {[8.5, 12, 15.5].map((x, i) => (
        <circle key={x} cx={x} cy="9.5" r="1.15" fill="currentColor" stroke="none" className="kb-blink" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </Svg>
  );
}

/** Candlesticks, gently bobbing. */
export function MarketGlyph(p: GlyphProps) {
  const candles = [
    { x: 6, top: 4, bodyY: 7, bodyH: 7, bottom: 17, up: true },
    { x: 12, top: 8, bodyY: 10, bodyH: 6, bottom: 20, up: false },
    { x: 18, top: 3, bodyY: 5, bodyH: 9, bottom: 15, up: true },
  ];
  return (
    <Svg {...p}>
      {candles.map((c, i) => (
        <g key={c.x} className="kb-bob" style={{ animationDelay: `${i * 0.35}s` }}>
          <path d={`M${c.x} ${c.top}v${c.bottom - c.top}`} strokeOpacity={0.6} />
          <rect x={c.x - 2} y={c.bodyY} width="4" height={c.bodyH} rx="1" fill="currentColor" fillOpacity={c.up ? 0.45 : 0.12} />
        </g>
      ))}
    </Svg>
  );
}

/** Glass tile with a gradient rim and inner glow. */
export function GlyphBadge({ children, size = 'md' }: { children: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'h-7 w-7 rounded-lg', md: 'h-9 w-9 rounded-[11px]', lg: 'h-11 w-11 rounded-[13px]' }[size];
  return (
    <span className={`relative grid shrink-0 place-items-center p-px ${box} bg-gradient-to-br from-[#5CD6E0]/70 via-[#5CD6E0]/15 to-[#3e8692]/50`}>
      <span className={`grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_25%,rgba(92,214,224,0.28),rgba(9,20,26,0.95)_70%)] text-[#7FE6EE] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${box}`}>
        {children}
      </span>
    </span>
  );
}
