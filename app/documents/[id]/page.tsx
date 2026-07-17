'use client';

/**
 * Document Portal — internal viewer/preview route (spec §3).
 *
 * Team-facing preview of a hosted document: fetches a signed URL + meta, then
 * renders the pdf.js viewer (loaded client-only) which logs opens + per-page
 * dwell. The client-facing embed in the portal Resources card is a later phase;
 * this proves the render + tracking end-to-end.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import Link from 'next/link';

const DocumentPdfViewer = dynamic(() => import('@/components/documents/DocumentPdfViewer'), {
  ssr: false,
  loading: () => <Skeleton className="h-[70vh] w-full rounded-lg" />,
});

interface ViewMeta {
  title: string;
  signedUrl: string;
  page_count: number | null;
  download_enabled: boolean;
  version_id: string | null;
  document_id: string;
}

export default function DocumentViewerPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string | undefined;
  const [meta, setMeta] = useState<ViewMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/documents/${id}/view-url`, { cache: 'no-store' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || `Couldn't load (${res.status})`);
          return;
        }
        setMeta(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id]);

  return (
    <div className="space-y-4">
      <Link href="/links" className="inline-flex items-center text-xs text-gray-500 hover:text-brand transition-colors w-fit">
        <ArrowLeft className="h-3 w-3 mr-1" /> Back to Links
      </Link>

      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-brand" />
        <h2 className="text-2xl font-bold text-ink-warm-900">{meta?.title ?? 'Document'}</h2>
        {meta?.page_count ? <span className="text-sm text-ink-warm-400">· {meta.page_count} pages</span> : null}
        {meta?.download_enabled && meta.signedUrl && (
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <a href={meta.signedUrl} download><Download className="h-4 w-4 mr-2" />Download</a>
          </Button>
        )}
      </div>

      {error ? (
        <div className="py-20 text-center text-sm text-rose-500">{error}</div>
      ) : !meta ? (
        <Skeleton className="h-[70vh] w-full rounded-lg" />
      ) : (
        <div className="rounded-lg border border-cream-200 bg-cream-50 p-2 max-h-[80vh] overflow-y-auto">
          <DocumentPdfViewer
            signedUrl={meta.signedUrl}
            documentId={meta.document_id}
            versionId={meta.version_id}
          />
        </div>
      )}
    </div>
  );
}
