'use client';

/**
 * Motion for the weekly Korea brief: the keyframes, a scroll reveal, and a
 * count-up for headline numbers. Kept in one file so the brief's motion
 * travels with it and nothing leaks into tailwind.config.
 *
 * Rules:
 * - Everything is readable with motion off. `prefers-reduced-motion` drops
 *   every animation to its end state, and the server render already holds
 *   final values (count-ups only rewind after hydration).
 * - Observers come from the element's own window, so this works inside the
 *   team page's phone-preview iframe as well as on the real page.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const CSS = `
@keyframes kb-rise { from { opacity: 0; transform: translateY(14px); filter: blur(6px) } to { opacity: 1; transform: none; filter: none } }
@keyframes kb-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes kb-spin { to { transform: rotate(360deg) } }
@keyframes kb-ping { 0% { transform: scale(.55); opacity: .9 } 100% { transform: scale(1.7); opacity: 0 } }
@keyframes kb-eq { 0%, 100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }
@keyframes kb-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
@keyframes kb-grow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
@keyframes kb-grow-x { from { transform: scaleX(0) } to { transform: scaleX(1) } }
@keyframes kb-pop { 0% { transform: scale(0) } 70% { transform: scale(1.25) } 100% { transform: scale(1) } }
@keyframes kb-bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }
@keyframes kb-blink { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }
@keyframes kb-shimmer { 0% { transform: translateX(-130%) skewX(-18deg) } 60%, 100% { transform: translateX(260%) skewX(-18deg) } }
@keyframes kb-drift-a { 0%, 100% { transform: translate(-12%, -6%) scale(1) } 50% { transform: translate(10%, 8%) scale(1.15) } }
@keyframes kb-drift-b { 0%, 100% { transform: translate(14%, 4%) scale(1.1) } 50% { transform: translate(-10%, -8%) scale(.95) } }
@keyframes kb-pan { to { background-position: 0 28px, 28px 0 } }
@keyframes kb-scan { 0% { transform: translateY(-100%); opacity: 0 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { transform: translateY(560px); opacity: 0 } }
@keyframes kb-sweep { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }

/* Hero entrance: staggered via --d. */
.kb-root .kb-enter { animation: kb-rise .8s cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d, 0ms) }

/* Scroll reveal. Children charts start drawing when the section arrives. */
.kb-root .kb-reveal { opacity: 0 }
.kb-root .kb-reveal.kb-in { animation: kb-rise .8s cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d, 0ms) }
.kb-root .kb-line { stroke-dasharray: 1; stroke-dashoffset: 1 }
.kb-root .kb-in .kb-line { animation: kb-draw 1.6s cubic-bezier(.6,0,.2,1) .25s forwards }
.kb-root .kb-area, .kb-root .kb-label { opacity: 0 }
.kb-root .kb-in .kb-area { animation: kb-fade 1s ease 1.1s forwards }
.kb-root .kb-in .kb-label { animation: kb-fade .5s ease 1.6s forwards }
.kb-root .kb-dot { transform: scale(0); transform-box: fill-box; transform-origin: center }
.kb-root .kb-in .kb-dot { animation: kb-pop .45s cubic-bezier(.3,1.4,.5,1) forwards; animation-delay: calc(.3s + var(--i, 0) * 90ms) }
.kb-root .kb-bar { transform: scaleY(0); transform-box: fill-box }
.kb-root .kb-in .kb-bar { animation: kb-grow .7s cubic-bezier(.2,.8,.2,1) forwards; animation-delay: calc(.2s + var(--i, 0) * 45ms) }

.kb-root .kb-bar-x { transform: scaleX(0); transform-origin: left }
.kb-root .kb-in .kb-bar-x { animation: kb-grow-x .9s cubic-bezier(.2,.8,.2,1) forwards; animation-delay: calc(.25s + var(--i, 0) * 100ms) }
.kb-root .kb-item { opacity: 0 }
.kb-root .kb-in .kb-item { animation: kb-rise .6s cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d, 0ms) }

@media (prefers-reduced-motion: reduce) {
  .kb-root *, .kb-root *::before, .kb-root *::after { animation: none !important; transition: none !important }
  .kb-root .kb-reveal, .kb-root .kb-area, .kb-root .kb-label, .kb-root .kb-item { opacity: 1 }
  .kb-root .kb-line { stroke-dashoffset: 0 }
  .kb-root .kb-dot, .kb-root .kb-bar, .kb-root .kb-bar-x { transform: none }
}
`;

/** Render once at the top of the brief. */
export function BriefMotionStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

function reducedMotion(win: Window) {
  return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Fades a section up when it scrolls into view (once). */
export function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: {
  children: ReactNode; className?: string; delay?: number; as?: 'div' | 'section';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const win = el.ownerDocument.defaultView ?? window;
    const IO: typeof IntersectionObserver | undefined = (win as any).IntersectionObserver;
    if (!IO || reducedMotion(win)) { setInView(true); return; }
    const io = new IO(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as any} className={`kb-reveal ${inView ? 'kb-in' : ''} ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/**
 * Counts the first number in `value` up from zero ("$1.2M", "7.2%", "6/6").
 * Renders the final string on the server and with motion off.
 */
export function CountUp({ value, duration = 1200, delay = 0 }: { value: string; duration?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const match = value.match(/-?\d+(?:\.\d+)?/);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !match) { setShown(value); return; }
    const win = el.ownerDocument.defaultView ?? window;
    if (reducedMotion(win)) { setShown(value); return; }
    const target = parseFloat(match[0]);
    const decimals = (match[0].split('.')[1] ?? '').length;
    const render = (n: number) => value.replace(match[0], n.toFixed(decimals));
    setShown(render(0));
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t + delay;
      const p = Math.min(Math.max((t - start) / duration, 0), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(render(target * eased));
      if (p < 1) raf = win.requestAnimationFrame(tick);
    };
    raf = win.requestAnimationFrame(tick);
    return () => win.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span ref={ref}>{shown}</span>;
}
