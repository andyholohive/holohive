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
import { FileText, Eye, Download } from 'lucide-react';
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
    <Card className={`border border-gray-200 shadow-xl rounded-xl overflow-hidden${className ? ` ${className}` : ''}`}>
      <CardHeader className="bg-white border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <CardTitle className="text-lg font-bold text-gray-900">Delivery Documents</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {/* No loading branch: the card doesn't mount until docs are in hand,
            so a skeleton here could only ever appear inside a card that was
            already guaranteed to have rows. */}
        <div className="space-y-2">
          {docs.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => openDoc(d.id)}
              disabled={opening === d.id}
              className="w-full flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-brand hover:bg-brand-light/40 transition-colors disabled:opacity-60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-light text-brand flex-shrink-0">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900 truncate">{d.title}</span>
                <span className="block text-xs text-gray-500">
                  {d.page_count ? `${d.page_count} ${d.page_count === 1 ? 'page' : 'pages'} · ` : ''}Added {formatDate(d.created_at)}
                </span>
              </span>
              <Eye className="h-4 w-4 text-gray-400 flex-shrink-0" />
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
            <DialogTitle className="flex items-center gap-2 pr-8">
              <FileText className="h-5 w-5 text-brand flex-shrink-0" />
              <span className="truncate">{active?.title ?? 'Document'}</span>
              {active?.download_enabled && active.signedUrl && (
                <a
                  href={active.signedUrl}
                  download
                  className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-brand hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />Download
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="max-h-[75vh] overflow-y-auto rounded-lg border border-cream-200 bg-cream-50 p-2">
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
      <p className="mt-3 text-[10px] leading-relaxed text-gray-400">
        Confidential — do not redistribute.
      </p>
      </CardContent>
    </Card>
  );
}
