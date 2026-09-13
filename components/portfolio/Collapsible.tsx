'use client';

/**
 * Collapsible section primitives for the portfolio page.
 *
 * [2026-09-11, Andy] "Make it so that each section is collapsable." The page
 * carries five accounts, six stages each, and thirty documents behind them —
 * more than anyone wants open at once, and the part you need varies by why you
 * opened it. Collapsing is how a reference page stays readable without losing
 * anything.
 *
 * Built on native <details>/<summary>: keyboard and screen-reader behaviour
 * come free, the content stays in the DOM for in-page search, and no state has
 * to be threaded through the page to make it work.
 *
 * Open/closed is remembered per viewer in localStorage. Every access is wrapped
 * because the accessor itself throws in some contexts (private windows,
 * thumbnailing, browsers set to block site data) — and a page that cannot
 * remember a toggle must still render correctly, so a failed read simply falls
 * back to the section's default.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';

const STORE = 'hh.portfolio.collapsed';
/** Fired when something sets every section at once. */
const BULK = 'hh-portfolio-bulk';
/** Fired when something wants one particular section opened. */
const OPEN_ONE = 'hh-portfolio-open';

/**
 * Open one section by id, wherever it is on the page.
 *
 * The reading path needs to send someone to a section that may be collapsed,
 * and scrolling to a closed disclosure is the same failure as a broken link.
 */
export function openSection(id: string) {
  window.dispatchEvent(new CustomEvent(OPEN_ONE, { detail: id }));
}

/**
 * Open or close every remembered section on the page.
 *
 * Broadcasts rather than lifting state: each disclosure already owns its own
 * open flag, and threading a controlled prop through the page, the dossiers and
 * six stages apiece to serve one button would be a lot of wiring for a
 * convenience.
 */
export function setAllSections(open: boolean) {
  window.dispatchEvent(new CustomEvent(BULK, { detail: open }));
}

function readStore(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(id: string, open: boolean) {
  try {
    const next = { ...readStore(), [id]: open };
    window.localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    /* Remembering the toggle is a convenience, never a requirement. */
  }
}

/**
 * The store as it was when the page loaded, read once.
 *
 * Restoration has to compare against the state the *viewer* left behind, not
 * against whatever this page load has written since — and it writes almost
 * immediately, because mounting a <details> fires a toggle of its own.
 */
let snapshot: Record<string, boolean> | null = null;
function loadSnapshot(): Record<string, boolean> {
  if (snapshot === null) snapshot = readStore();
  return snapshot;
}

/**
 * Remembered open/closed state.
 *
 * Starts from `defaultOpen` on both server and first client render, then
 * adopts the stored value in an effect. Reading localStorage during render
 * would desync the server and client markup and hydrate wrong.
 *
 * The `ready` guard is the load-bearing part. Every <details> emits a toggle
 * as it mounts, and without the guard that spurious event wrote the default
 * back to storage before the restore effect could read it — so the page
 * faithfully remembered nothing, while looking like it was working. Writes are
 * ignored until restoration has run; only a real click gets recorded.
 */
function useRemembered(id: string, defaultOpen: boolean) {
  const [open, setOpen] = useState(defaultOpen);
  const ready = useRef(false);

  useEffect(() => {
    const stored = loadSnapshot()[id];
    if (typeof stored === 'boolean') setOpen(stored);
    ready.current = true;
  }, [id]);

  useEffect(() => {
    const onBulk = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      setOpen(next);
      writeStore(id, next);
    };
    const onOpenOne = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) return;
      setOpen(true);
      writeStore(id, true);
    };
    window.addEventListener(BULK, onBulk);
    window.addEventListener(OPEN_ONE, onOpenOne);
    return () => {
      window.removeEventListener(BULK, onBulk);
      window.removeEventListener(OPEN_ONE, onOpenOne);
    };
  }, [id]);

  return {
    open,
    onToggle: (e: React.SyntheticEvent<HTMLDetailsElement>) => {
      const next = e.currentTarget.open;
      setOpen(next);
      if (ready.current) writeStore(id, next);
    },
    /** Force a state, e.g. when something jumps to this section. */
    set: (next: boolean) => {
      setOpen(next);
      writeStore(id, next);
    },
  };
}

/**
 * A top-level page section: the v11 chapter divider, made clickable.
 *
 * Matches `SectionHeader`'s look rather than importing it, because that
 * component renders a plain div and a <summary> cannot contain one without
 * breaking the disclosure's accessible name.
 */
export function CollapsibleSection({
  id, label, counter, defaultOpen = true, first = false, children,
}: {
  id: string;
  label: string;
  counter?: string;
  defaultOpen?: boolean;
  first?: boolean;
  children: React.ReactNode;
}) {
  const { open, onToggle } = useRemembered(id, defaultOpen);
  return (
    <details open={open} onToggle={onToggle} className="group/section flex flex-col">
      <summary
        className={`section-head ${first ? 'first' : ''} cursor-pointer list-none marker:hidden rounded focus-brand hover:opacity-80 transition-opacity`}
      >
        <div className="left flex items-center gap-2">
          <ChevronRight
            className="h-3.5 w-3.5 text-ink-warm-400 flex-shrink-0 transition-transform group-open/section:rotate-90"
            aria-hidden="true"
          />
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
          <span className="label">{label}</span>
        </div>
        {counter && <span className="counter">{counter}</span>}
      </summary>
      <div className="flex flex-col gap-6 pt-2">{children}</div>
    </details>
  );
}

/**
 * A collapsible card — used for the standalone blocks at the top of the page
 * that have their own header rather than a chapter divider.
 */
export function CollapsibleCard({
  id, kicker, title, description, defaultOpen = true, children,
}: {
  id: string;
  kicker?: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const { open, onToggle } = useRemembered(id, defaultOpen);
  return (
    <Card className="border-cream-200 overflow-hidden">
      <details open={open} onToggle={onToggle} className="group/card">
        <summary className="px-5 py-4 bg-cream-50 flex items-start gap-2.5 cursor-pointer list-none marker:hidden hover:bg-cream-100/60 transition-colors focus-brand">
          <ChevronRight
            className="h-4 w-4 text-ink-warm-400 flex-shrink-0 mt-0.5 transition-transform group-open/card:rotate-90"
            aria-hidden="true"
          />
          <span className="flex flex-col gap-1 min-w-0">
            {kicker && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
                {kicker}
              </span>
            )}
            <span className="text-base font-semibold text-ink-warm-900 tracking-tight">{title}</span>
            {description && (
              <span className="text-[12.5px] text-ink-warm-500 leading-relaxed max-w-[76ch]">
                {description}
              </span>
            )}
          </span>
        </summary>
        <div className="border-t border-cream-200">{children}</div>
      </details>
    </Card>
  );
}

export { useRemembered };
