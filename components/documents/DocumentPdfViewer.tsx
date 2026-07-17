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

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const IDLE_MS = 60_000;      // 60s no input pauses the dwell timer
const BACKSTOP_MS = 30_000;  // periodic flush guards against hard tab kills
const VISIBLE_MIN = 0.5;     // page must be ≥50% in the viewport to accrue dwell

export default function DocumentPdfViewer({
  signedUrl,
  documentId,
  versionId,
  portalUserId,
  viewerEmail,
}: {
  signedUrl: string;
  documentId: string;
  versionId: string | null;
  portalUserId?: string | null;
  /** Gate email the portal viewer authenticated with — the recipient key. */
  viewerEmail?: string | null;
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
    const body = JSON.stringify({ document_id: documentId, version_id: versionId, session_id: sessionId, portal_user_id: portalUserId ?? null, viewer_email: viewerEmail ?? null, ...payload });
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
    activityEvents.forEach(e => window.addEventListener(e, bump, { passive: true }));

    // 1s dwell accumulator — credits the most-visible qualifying page.
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
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
      activityEvents.forEach(e => window.removeEventListener(e, bump));
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
        file={signedUrl}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
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

/** One PDF page + an IntersectionObserver reporting its visible ratio upward. */
function PageTracked({ pageNumber, width, onRatio }: { pageNumber: number; width: number; onRatio: (ratio: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { for (const e of entries) onRatio(e.intersectionRatio); },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    obs.observe(el);
    return () => { obs.disconnect(); onRatio(0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);
  return (
    <div ref={ref} className="mb-3 flex justify-center">
      <Page pageNumber={pageNumber} width={width} renderTextLayer={false} renderAnnotationLayer={false}
        className="shadow-sm border border-neutral-200" />
    </div>
  );
}
