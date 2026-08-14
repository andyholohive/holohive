'use client';

/**
 * Document Portal — client-facing embed (spec §3/§4).
 *
 * Renders the shared hosted PDFs for a client portal as a "Delivery Documents"
 * sub-section and opens the tracked pdf.js viewer in a dialog. Self-contained so
 * the 4,100-line portal page only needs a one-line render: it fetches via the
 * service-role public routes (which re-check the gate email) and threads that
 * email into every access event for per-recipient attribution. Renders nothing
 * until there's at least one shared document, so an empty state never clutters
 * the portal.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Download, Lock, ArrowRight } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

const DocumentPdfViewer = dynamic(() => import('@/components/documents/DocumentPdfViewer'), {
  ssr: false,
  loading: () => <Skeleton className="h-[70vh] w-full rounded-lg" />,
});

interface PortalDoc {
  id: string;
  title: string;
  page_count: number | null;
  download_enabled: boolean;
  created_at: string;
}

interface ViewMeta {
  title: string;
  signedUrl: string;
  page_count: number | null;
  download_enabled: boolean;
  version_id: string | null;
  document_id: string;
  log_token?: string | null;
}

export default function PortalDocumentsCard({ portalId, email, className }: { portalId: string; email: string; className?: string }) {
  const [docs, setDocs] = useState<PortalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ViewMeta | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const trimmedEmail = useMemo(() => (email || '').trim(), [email]);

  useEffect(() => {
    let cancelled = false;
    if (!trimmedEmail || !portalId) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/public/portal/${encodeURIComponent(portalId)}/documents`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedEmail }), cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setDocs(res.ok ? (json.documents ?? []) : []);
      } catch {
        if (!cancelled) setDocs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [portalId, trimmedEmail]);

  const openDoc = useCallback(async (docId: string) => {
    setOpening(docId);
    try {
      const res = await fetch(`/api/public/portal/documents/${docId}/view-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalId, email: trimmedEmail }), cache: 'no-store',
      });
      const json = await res.json();
      if (res.ok) setActive(json as ViewMeta);
    } catch { /* silently ignore — the dialog just won't open */ }
    finally { setOpening(null); }
  }, [portalId, trimmedEmail]);

  // Nothing to show → render nothing (no empty-state clutter in the portal).
  //
  // [2026-07-31] Also render nothing WHILE loading. This was
  // `!loading && docs.length === 0`, which meant every portal without shared
  // documents drew a full "Delivery Documents" card with a skeleton and then
  // deleted it the moment the fetch came back empty — a visible flash of a
  // section that was never going to exist. Most portals have no documents, so
  // most portals showed the flash.
  //
  // The parent deliberately holds the entire page behind one spinner until
  // portalReady ("the whole portal paints once, instead of reflow → reflow →
  // reflow"), but this card fetches on its own after mount, so it landed after
  // that gate had already settled. Gating on `loading` puts it back in line
  // with that intent: the card has exactly two states now, absent or present,
  // and never transitions from present back to absent.
  if (loading || docs.length === 0) return null;

  return (
    /* [2026-08-14] Presented as a shelf of documents rather than a list of
       rows. These are the deliverables a client is paying for — the previous
       treatment (a 36px icon and a line of grey text per row) read like a file
       attachment list, and nothing about it suggested the contents mattered.
       Each entry now carries a page-shaped cover with a folded corner and a
       ruled preview, the title is set in the display face, and the section is
       framed by a confidential kicker rather than a toolbar icon. */
    <Card className={`border border-cream-200 bg-cream-50 shadow-xl rounded-xl overflow-hidden${className ? ` ${className}` : ''}`}>
      <CardHeader className="bg-white border-b border-cream-200 pb-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand flex items-center gap-1.5">
              <Lock className="h-3 w-3" />Confidential
            </p>
            <CardTitle className="display-serif text-2xl text-ink-warm-900 mt-1">Delivery Documents</CardTitle>
            <p className="text-xs text-ink-warm-500 mt-1">
              Prepared for you by HoloHive. {docs.length === 1 ? '1 document' : `${docs.length} documents`}.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        {/* No loading branch: the card doesn't mount until docs are in hand,
            so a skeleton here could only ever appear inside a card that was
            already guaranteed to have rows. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {docs.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => openDoc(d.id)}
              disabled={opening === d.id}
              className="group relative flex items-center gap-4 rounded-xl border border-cream-200 bg-white p-4 text-left transition-all hover:border-brand/50 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60 disabled:translate-y-0"
            >
              {/* Page-shaped cover: portrait sheet, folded top-right corner,
                  ruled lines standing in for body copy. Purely decorative —
                  we don't render a real first-page thumbnail because that
                  would mean loading every PDF up front. */}
              <span
                aria-hidden
                className="relative flex h-[68px] w-[52px] flex-shrink-0 flex-col justify-center gap-[3px] rounded-[3px] border border-cream-300 bg-white px-2 shadow-sm transition-shadow group-hover:shadow-md"
              >
                <span className="absolute right-0 top-0 h-3 w-3 rounded-bl-[3px] border-b border-l border-cream-300 bg-cream-100" />
                <span className="h-[2px] w-3/4 rounded-full bg-brand/50" />
                <span className="h-[2px] w-full rounded-full bg-cream-300" />
                <span className="h-[2px] w-full rounded-full bg-cream-300" />
                <span className="h-[2px] w-2/3 rounded-full bg-cream-300" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block display-serif text-[15px] leading-snug text-ink-warm-900 line-clamp-2">
                  {d.title}
                </span>
                <span className="mt-1.5 block text-[11px] uppercase tracking-wider text-ink-warm-400 tabular">
                  {d.page_count ? `${d.page_count} ${d.page_count === 1 ? 'page' : 'pages'} · ` : ''}
                  {formatDate(d.created_at)}
                </span>
                <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand">
                  {opening === d.id ? 'Opening…' : 'Read'}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </button>
          ))}
        </div>

      <Dialog open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
        {/* [2026-07-31 per Andy] Wider. max-w-4xl (56rem) left a PDF page
            rendering small enough that clients were zooming or downloading
            instead of reading in place, which defeats the tracked viewer.
            95vw capped at 84rem fills a laptop screen while still reading as
            a dialog rather than a full-page takeover. */}
        <DialogContent className="!bg-white w-[95vw] max-w-[84rem]">
          <DialogHeader>
            {/* Reading chrome: kicker + serif title, the way a report's cover
                page is set, with the page count as quiet metadata. */}
            <DialogTitle className="pr-8 text-left">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
                Delivery Document
              </span>
              <span className="mt-1 flex items-baseline gap-3">
                <span className="display-serif text-xl text-ink-warm-900 truncate">
                  {active?.title ?? 'Document'}
                </span>
                {active?.page_count ? (
                  <span className="text-[11px] uppercase tracking-wider text-ink-warm-400 tabular flex-shrink-0">
                    {active.page_count} {active.page_count === 1 ? 'page' : 'pages'}
                  </span>
                ) : null}
                {active?.download_enabled && active.signedUrl && (
                  <a
                    href={active.signedUrl}
                    download
                    className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-brand hover:underline flex-shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />Download
                  </a>
                )}
              </span>
            </DialogTitle>
          </DialogHeader>
          {active && (
            /* Dark ground behind the pages. A white page on a near-white
               panel has nothing to sit against; against ink the sheet reads
               as paper and the eye goes to the document instead of the
               dialog around it. */
            <div className="max-h-[75vh] overflow-y-auto rounded-lg bg-ink-warm-900 px-2 py-4 sm:px-6">
              <DocumentPdfViewer
                signedUrl={active.signedUrl}
                documentId={active.document_id}
                versionId={active.version_id}
                viewerEmail={trimmedEmail}
                logToken={active.log_token ?? null}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confidentiality footer for client-delivery documents. English only:
          this portal is read by the CLIENT (an international project buying
          Korean reach), not by Korean creators. The Korean-language equivalent
          on app/public/brief/[token] is correct there because that page is
          creator-facing — don't copy it back here. */}
      <p className="mt-5 border-t border-cream-200 pt-3 text-[10px] leading-relaxed text-ink-warm-400">
        Confidential — prepared for the named recipient. Please do not redistribute.
      </p>
      </CardContent>
    </Card>
  );
}
