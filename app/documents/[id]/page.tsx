'use client';

/**
 * Document Portal — internal viewer/preview route (spec §3).
 *
 * Team-facing preview of a hosted document: fetches a signed URL + meta, then
 * renders the pdf.js viewer (loaded client-only) which logs opens + per-page
 * dwell.
 *
 * Styling [2026-07-26]: deliberately mirrors the client portal shell
 * (app/public/portal/[id]) — gray gradient page, sticky white header bar with
 * the Holo Hive lockup, max-w-7xl content well, and the same white
 * shadow-xl rounded-xl card with a brand-gradient icon square. This route sits
 * OUTSIDE the sidebar layout (there is no app/documents/layout.tsx), so it gets
 * no container or padding from a parent — it previously rendered flush against
 * the viewport edge with no background. It has to bring its own shell, and the
 * portal's is the right one to copy: this page exists to show you what the
 * client sees.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Download, FileText, LogIn } from 'lucide-react';

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

/** What actually went wrong, so the page can say something true about it. */
interface LoadError {
  status: number | null;
  raw: string;
}

/**
 * Turn an API failure into an honest heading + next step.
 *
 * [2026-07-26] This used to print the raw error under a blanket "revoked or
 * expired" line, which sent people to restore a document when the real problem
 * was that they were signed out (a 401 — easy to hit in an incognito window).
 * Wrong diagnosis is worse than no diagnosis, so each case now speaks for
 * itself and only the auth case offers a sign-in.
 */
function describeError(err: LoadError): { title: string; detail: string; signIn: boolean } {
  const raw = err.raw.toLowerCase();
  if (err.status === 401) {
    return {
      title: 'You need to sign in',
      detail: 'Document previews are internal — sign in with your Holo Hive account to view this.',
      signIn: true,
    };
  }
  if (err.status === 403 && raw.includes('revoked')) {
    return {
      title: 'This document was revoked',
      detail: 'Restore it from the Documents tab on Links, then reopen this page.',
      signIn: false,
    };
  }
  if (err.status === 403 && raw.includes('expired')) {
    return {
      title: 'This document has expired',
      detail: 'Clear or extend its expiry date from the Documents tab on Links.',
      signIn: false,
    };
  }
  if (err.status === 403) {
    return {
      title: 'No access',
      detail: 'Your account doesn’t have permission to preview documents.',
      signIn: false,
    };
  }
  if (err.status === 404) {
    return {
      title: 'Document not found',
      detail: 'It may have been deleted, or no PDF has been attached to it yet.',
      signIn: false,
    };
  }
  return { title: 'Couldn’t load this document', detail: err.raw, signIn: false };
}

export default function DocumentViewerPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string | undefined;
  const [meta, setMeta] = useState<ViewMeta | null>(null);
  const [error, setError] = useState<LoadError | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/documents/${id}/view-url`, { cache: 'no-store' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError({ status: res.status, raw: j.error || `Request failed (${res.status})` });
          return;
        }
        setMeta(await res.json());
      } catch (e) {
        setError({ status: null, raw: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [id]);

  const described = error ? describeError(error) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100">
      {/* Header — same lockup as the client portal, so the preview reads as
          "this is the portal" rather than as a bare admin page. */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Image src="/images/logo.png" alt="Holo Hive" width={100} height={32} className="h-8 w-auto" />
              <span className="text-gray-300">|</span>
              <span className="text-gray-600 font-medium truncate">Document Preview</span>
            </div>
            {meta?.download_enabled && meta.signedUrl && (
              <Button asChild variant="outline" size="sm" className="flex-shrink-0">
                <a href={meta.signedUrl} download><Download className="h-4 w-4 mr-2" />Download</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Link
          href="/links"
          className="inline-flex items-center text-xs text-gray-500 hover:text-brand transition-colors w-fit"
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Links
        </Link>

        <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden">
          <CardHeader className="bg-white border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg flex-shrink-0">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg font-bold text-gray-900 truncate">
                  {meta?.title ?? 'Document'}
                </CardTitle>
                {meta?.page_count ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {meta.page_count} {meta.page_count === 1 ? 'page' : 'pages'}
                  </p>
                ) : null}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {described ? (
              <div className="py-20 text-center">
                <p className="text-sm font-semibold text-ink-warm-900">{described.title}</p>
                <p className="mt-1.5 text-xs text-gray-500 max-w-md mx-auto">{described.detail}</p>
                {described.signIn && (
                  <Button asChild variant="brand" size="sm" className="mt-5">
                    <Link href="/auth"><LogIn className="h-3.5 w-3.5 mr-1.5" />Sign in</Link>
                  </Button>
                )}
              </div>
            ) : !meta ? (
              <Skeleton className="h-[70vh] w-full rounded-lg" />
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-[80vh] overflow-y-auto">
                <DocumentPdfViewer
                  signedUrl={meta.signedUrl}
                  documentId={meta.document_id}
                  versionId={meta.version_id}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
