'use client';

/**
 * Public per-document share link (2026-08-05).
 *
 * Reached via /public/documents/<token> — the link we hand a client directly,
 * instead of asking them to find the document inside their portal.
 *
 * The token addresses the document; the email gate still authorizes the reader,
 * so a forwarded link is not a leak. That means this page always asks for an
 * email, exactly like the portal does, and reveals nothing at all — not even
 * the document's title — until the gate passes.
 *
 * Shell deliberately mirrors app/public/portal/[id] and app/documents/[id]:
 * same gradient ground, same sticky lockup header, same white card. A client
 * clicking through from Telegram should feel they're still with us.
 */

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, FileText, Lock, AlertTriangle } from 'lucide-react';

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
  client_name: string | null;
  log_token?: string | null;
}

/**
 * Map an API failure onto something a CLIENT can act on.
 *
 * The audience here is external, so nothing may hint at whether a document
 * exists, who it belongs to, or why their address failed — a wrong email and a
 * document that isn't theirs must read identically. The only actionable case
 * is "ask us to resend", so that's what every dead end says.
 */
function describeError(status: number | null, code: string): string {
  switch (code) {
    case 'not_found':
      return 'This link isn’t valid. Ask your Holo Hive contact for a new one.';
    case 'revoked':
      return 'This link has been turned off. Ask your Holo Hive contact for a new one.';
    case 'expired':
    case 'doc_expired':
      return 'This link has expired. Ask your Holo Hive contact for a new one.';
    case 'not_authorized':
      return 'That email doesn’t have access to this document. Use the address this link was sent to, or ask your Holo Hive contact to add you.';
    case 'not_available':
      return 'This document isn’t available right now. Ask your Holo Hive contact to check it.';
    case 'no_version':
      return 'This document has no file attached yet. Ask your Holo Hive contact to upload it.';
    default:
      return status === 500
        ? 'Something went wrong on our side. Try again in a moment.'
        : 'We couldn’t open this document. Ask your Holo Hive contact for a new link.';
  }
}

export default function PublicDocumentPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string | undefined;

  const [email, setEmail] = useState('');
  const [meta, setMeta] = useState<ViewMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/documents/${encodeURIComponent(token)}/view-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setMeta(json as ViewMeta);
      else setError(describeError(res.status, typeof json.error === 'string' ? json.error : ''));
    } catch {
      setError('We couldn’t reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [token, email]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Image src="/images/logo.png" alt="Holo Hive" width={100} height={32} className="h-8 w-auto" />
          {meta?.client_name && (
            <span className="ml-auto truncate text-xs text-gray-500">{meta.client_name}</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!meta ? (
          // ── Gate ──────────────────────────────────────────────────────
          // Centred and small on purpose: there is nothing else to look at
          // until the email clears, and a wide empty shell would imply the
          // document failed to load rather than that it's waiting on them.
          <Card className="mx-auto max-w-md border-gray-200 shadow-xl">
            <CardContent className="flex flex-col gap-5 p-8">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand/70">
                  <Lock className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Confirm your email</h1>
                  <p className="text-sm text-gray-500">To open this document</p>
                </div>
              </div>

              <form onSubmit={submit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="share-email">Email address</Label>
                  <Input
                    id="share-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="h-10 focus-brand"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                  />
                </div>
                <Button type="submit" variant="brand" disabled={submitting || !email.trim()}>
                  {submitting ? 'Checking…' : 'Open document'}
                </Button>
              </form>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              <p className="text-xs leading-relaxed text-gray-400">
                Use the address this link was sent to. We record when the document is opened.
              </p>
            </CardContent>
          </Card>
        ) : (
          // ── Viewer ────────────────────────────────────────────────────
          <Card className="border-gray-200 shadow-xl">
            <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand/70">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900">{meta.title}</h1>
                {meta.download_enabled && (
                  <Button asChild variant="outline" size="sm">
                    <a href={meta.signedUrl} download target="_blank" rel="noreferrer">
                      <Download className="mr-1.5 h-4 w-4" />Download
                    </a>
                  </Button>
                )}
              </div>

              <DocumentPdfViewer
                signedUrl={meta.signedUrl}
                documentId={meta.document_id}
                versionId={meta.version_id}
                viewerEmail={email.trim()}
                logToken={meta.log_token ?? null}
              />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
