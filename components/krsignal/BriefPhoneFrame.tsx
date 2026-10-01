'use client';

/**
 * A phone-sized frame for previewing client-facing pages (the Korea brief,
 * the Telegram message) inside a team page.
 *
 * Children render into an iframe through a portal, so Tailwind breakpoints
 * see the phone's 374px width instead of the desktop window's — without it,
 * `sm:` styles apply inside a "phone" on a laptop and the preview lies. The
 * parent page's stylesheets are copied in, so the same classes work.
 *
 * A fade + "Scroll inside" hint shows while there's more below.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function BriefPhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"></body></html>');
    doc.close();
    // Same styles as the parent page, so Tailwind classes resolve identically.
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => doc.head.appendChild(n.cloneNode(true)));
    doc.documentElement.className = document.documentElement.className;
    doc.body.className = document.body.className;
    setBody(doc.body);

    const win = iframe.contentWindow!;
    const update = () => {
      const el = doc.scrollingElement || doc.documentElement;
      setMore(el.scrollHeight > el.clientHeight + 8 && el.scrollTop + el.clientHeight < el.scrollHeight - 8);
    };
    win.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(doc.body);
    update();
    return () => { win.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[390px] overflow-hidden rounded-[34px] border-[8px] border-ink-warm-900 bg-white shadow-[0_18px_40px_-18px_rgba(22,20,15,.35)]">
      <div className="flex h-[22px] items-start justify-center bg-ink-warm-900" aria-hidden>
        <span className="h-4 w-24 rounded-b-xl bg-black" />
      </div>
      <iframe ref={ref} title={label} className="block h-[clamp(540px,calc(100vh-170px),760px)] w-full border-0 bg-white" />
      {body && createPortal(children, body)}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-b from-transparent to-cream-50 pb-2 text-[11px] font-medium text-ink-warm-700 transition-opacity ${more ? 'opacity-100' : 'opacity-0'}`}
      >
        Scroll inside ↓
      </div>
    </div>
  );
}
