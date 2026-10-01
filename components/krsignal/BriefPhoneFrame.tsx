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
 * A fade + "Scroll inside" chip shows while there's more below; the chip
 * is dark glass so it reads over the light Telegram view and the dark brief.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsDown } from 'lucide-react';

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
    <div className="relative mx-auto w-full max-w-[390px] overflow-hidden rounded-[36px] border-[7px] border-[#0B1014] bg-[#0B1014] shadow-[0_0_0_1px_rgba(92,214,224,.22),0_24px_60px_-20px_rgba(5,9,13,.55),0_0_40px_-12px_rgba(62,134,146,.45)]">
      <div className="flex h-[24px] items-center justify-center bg-[#0B1014]" aria-hidden>
        <span className="h-[14px] w-[86px] rounded-full bg-black ring-1 ring-white/5" />
      </div>
      <iframe ref={ref} title={label} className="block h-[clamp(540px,calc(100vh-170px),760px)] w-full border-0 bg-white" />
      {body && createPortal(children, body)}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-gradient-to-b from-transparent to-black/45 pb-3 transition-opacity ${more ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-[#0B1014]/85 px-2.5 py-1 text-[11.5px] font-medium text-white backdrop-blur">
          <ChevronsDown className="h-3 w-3" />Scroll inside
        </span>
      </div>
    </div>
  );
}
