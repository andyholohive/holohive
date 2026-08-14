'use client';

/**
 * Document Portal — pdf.js viewer + qualified-dwell instrumentation (spec §3/§4).
 *
 * Renders each PDF page as a canvas (pdf.js) and tracks per-page attention:
 * a page's dwell timer runs only while it is ≥50% visible AND the tab is
 * focused AND the user is not idle (60s no input pauses). Accumulated dwell is
 * flushed as one page_view per page on tab blur / navigation / close via
 * navigator.sendBeacon, plus a 30s backstop. doc_opened fires on mount,
 * doc_closed on teardown.
 *
 * Loaded via next/dynamic {ssr:false} so pdf.js never runs during SSR.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Same-origin worker only. A CDN URL here throws SecurityError in every browser
// ("Failed to construct 'Worker': Script at '<cdn>' cannot be accessed from
// origin '<app>'") — cross-origin worker scripts are forbidden regardless of
// CORS headers, so the viewer would hang on "Loading document…" forever.
// scripts/copy-pdf-worker.mjs copies the matching worker into /public.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const IDLE_MS = 60_000;      // 60s no input pauses the dwell timer
const BACKSTOP_MS = 30_000;  // periodic flush guards against hard tab kills
const VISIBLE_MIN = 0.5;     // page must be ≥50% in the viewport to accrue dwell

export default function DocumentPdfViewer({
  signedUrl,
  documentId,
  versionId,
  portalUserId,
  viewerEmail,
  logToken,
}: {
  signedUrl: string;
  documentId: string;
  versionId: string | null;
  portalUserId?: string | null;
  /** Gate email the portal viewer authenticated with — the recipient key. */
  viewerEmail?: string | null;
  /**
   * Signed beacon token from the gated view-url route (audit H6). Threaded to
   * /api/documents/log so it can trust the attribution; without it the server
   * ignores viewer_email and fires no alert.
   */
  logToken?: string | null;
}) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionId = useMemo(() => (globalThis.crypto?.randomUUID?.() ?? String(Math.random())), []);

  // Per-page state (refs — updated every tick, no re-render churn).
  const visibleRatio = useRef<Record<number, number>>({});
  const dwellMs = useRef<Record<number, number>>({});   // un-flushed dwell per page
  const lastActivity = useRef<number>(Date.now());

  const post = (payload: Record<string, any>) => {
    const body = JSON.stringify({ document_id: documentId, version_id: versionId, session_id: sessionId, portal_user_id: portalUserId ?? null, viewer_email: viewerEmail ?? null, log_token: logToken ?? null, ...payload });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/documents/log', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/documents/log', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
      }
    } catch { /* best-effort */ }
  };

  /** Send accumulated dwell as one page_view per page, then reset (sends deltas). */
  const flush = () => {
    const acc = dwellMs.current;
    for (const [pageStr, ms] of Object.entries(acc)) {
      if (ms >= 1000) post({ event_type: 'page_view', page_no: Number(pageStr), dwell_ms: Math.round(ms) });
    }
    dwellMs.current = {};
  };

  // Responsive page width.
  useEffect(() => {
    const measure = () => setWidth(Math.min(900, (containerRef.current?.clientWidth ?? 800) - 4));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // doc_opened + activity listeners + dwell tick + flush hooks.
  useEffect(() => {
    post({ event_type: 'doc_opened' });

    const bump = () => { lastActivity.current = Date.now(); };
    const activityEvents: (keyof WindowEventMap)[] = ['scroll', 'mousemove', 'keydown', 'touchstart', 'click'];
    // `capture: true` because the viewer lives inside its own overflow-y
    // container: scroll does NOT bubble to window, so a listener in the bubble
    // phase never sees trackpad/keyboard scrolling. Without this, a reader who
    // scrolls but doesn't move the pointer is marked idle after 60s and their
    // dwell silently stops accruing.
    activityEvents.forEach(e => window.addEventListener(e, bump, { passive: true, capture: true }));

    // "Tab focused" per the spec — visibilityState alone does NOT cover a
    // window that is still visible but behind another app, which would keep
    // crediting attention to someone who has walked away from the document.
    let windowFocused = typeof document !== 'undefined' ? document.hasFocus() : true;
    const onFocus = () => { windowFocused = true; bump(); };
    const onBlur = () => { windowFocused = false; flush(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    // 1s dwell accumulator — credits the most-visible qualifying page.
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!windowFocused) return;
      if (Date.now() - lastActivity.current > IDLE_MS) return;
      let best = -1, bestRatio = 0;
      for (const [p, r] of Object.entries(visibleRatio.current)) {
        if (r >= VISIBLE_MIN && r > bestRatio) { bestRatio = r; best = Number(p); }
      }
      if (best >= 0) dwellMs.current[best] = (dwellMs.current[best] ?? 0) + 1000;
    }, 1000);

    const backstop = setInterval(flush, BACKSTOP_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    return () => {
      flush();
      post({ event_type: 'doc_closed' });
      clearInterval(tick);
      clearInterval(backstop);
      activityEvents.forEach(e => window.removeEventListener(e, bump, { capture: true }));
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full doc-portal-viewer"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Best-effort print/save deterrent for confidential deliveries: hide the
          rendered pages from print media. Not DRM — a determined user can still
          screenshot — but it stops casual Cmd-P/right-click-save. */}
      <style>{`@media print { .doc-portal-viewer { display: none !important; } }`}</style>
      <Document
        // [2026-08-14] key on the URL so a new document mounts a fresh
        // Document instead of swapping the file underneath the Page children.
        // In the swap case the pages keep rendering against a transport that
        // has already been destroyed, which surfaces as
        // "Cannot read properties of null (reading 'sendWithPromise')".
        key={signedUrl}
        file={signedUrl}
        // [2026-08-11] Links inside the PDF open in a new tab rather than
        // navigating the viewer away mid-read (which would also cut the dwell
        // timer short and lose the page_view). rel is set explicitly because
        // these documents are client-facing and the destinations aren't ours.
        externalLinkTarget="_blank"
        externalLinkRel="noopener noreferrer"
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        // Drop the pages the moment the load fails, so nothing is left
        // rendering against a document that never finished opening.
        onLoadError={() => setNumPages(0)}
        onSourceError={() => setNumPages(0)}
        loading={<div className="py-20 text-center text-sm text-neutral-400">Loading document…</div>}
        error={<div className="py-20 text-center text-sm text-rose-500">Couldn&apos;t load this document.</div>}
      >
        {Array.from({ length: numPages }).map((_, i) => (
          <PageTracked key={i} pageNumber={i + 1} width={width} onRatio={(r) => { visibleRatio.current[i + 1] = r; }} />
        ))}
      </Document>
    </div>
  );
}

/**
 * One PDF page + an IntersectionObserver reporting how "on screen" it is.
 *
 * [2026-07-27] Reports max(pageCoverage, viewportFill) rather than raw
 * intersectionRatio. intersectionRatio alone is the fraction of the PAGE that
 * is visible, and an A4 page is ~1.41× as tall as it is wide — inside the
 * viewer's max-h-[80vh] scroll container the ratio tops out around 0.47–0.56.
 * On a laptop-height window it never crossed the 0.5 gate, so NO page_view was
 * ever emitted: focused time, pages read, completion and the per-page bars all
 * silently read zero while opens kept logging.
 *
 * viewportFill (visible slice ÷ container height) fixes the tall-page case: a
 * page that fills the reader's screen counts as being read even when only 45%
 * of that page fits. Whichever measure is kinder is the honest one here —
 * both describe "this is what the reader is looking at".
 */
function PageTracked({ pageNumber, width, onRatio }: { pageNumber: number; width: number; onRatio: (ratio: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const pageCoverage = e.intersectionRatio;
          const rootH = e.rootBounds?.height ?? 0;
          const viewportFill = rootH > 0 ? e.intersectionRect.height / rootH : 0;
          onRatio(Math.max(pageCoverage, viewportFill));
        }
      },
      // Fine-grained thresholds: with a tall page the ratio moves in small
      // steps, and coarse buckets would leave the value stale mid-scroll.
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );
    obs.observe(el);
    return () => { obs.disconnect(); onRatio(0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);
  return (
    <div ref={ref} className="mb-5 flex justify-center last:mb-0">
      {/* Annotation layer on, text layer off — deliberately.
          The annotation layer is what makes a PDF's hyperlinks clickable
          [2026-08-11]; without it the pages render as bare canvas and every
          link in a delivery report is dead.
          The text layer stays off: it would make the document's text
          selectable and copyable, which quietly defeats the download_enabled
          toggle and the print suppression above. Links are navigation, not
          content — turning one on doesn't require the other. */}
      {/* Sheet treatment: a real drop shadow and no border, so the page reads
          as paper lifted off the ground rather than a bordered image. */}
      <Page pageNumber={pageNumber} width={width} renderTextLayer={false} renderAnnotationLayer
        className="shadow-[0_4px_24px_rgba(0,0,0,0.35)] rounded-[2px] overflow-hidden" />
    </div>
  );
}
