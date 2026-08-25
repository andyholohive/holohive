'use client';

/**
 * KOL Brief Delivery — per-KOL public page (spec §6).
 *
 * Mobile-first, no login. Possession of the token in the URL is the access.
 * On load it pings /api/public/brief/[token] (logs the open) and renders the
 * brief: the generator's Vercel page (page_ref) when present, otherwise a
 * "brief is being prepared" placeholder. Carries the confidential footer only.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { briefRefKind } from '@/lib/briefPageRef';

const CONFIDENTIAL_FOOTER = '본 문서는 대외비이며 크리에이터 전용입니다. 재배포하지 마세요.';

type State =
  | { kind: 'loading' }
  | { kind: 'expired' }
  | { kind: 'ready'; pageRef: string | null; angleName: string | null };

export default function KolBriefPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string | undefined;
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/brief/${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) { setState({ kind: 'expired' }); return; }
        const json = await res.json();
        setState({ kind: 'ready', pageRef: json.page_ref ?? null, angleName: json.angle_name ?? null });
      } catch {
        if (!cancelled) setState({ kind: 'expired' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col">
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
        {state.kind === 'loading' && (
          <div className="animate-pulse space-y-3 pt-10">
            <div className="h-6 bg-neutral-200 rounded w-1/2" />
            <div className="h-4 bg-neutral-200 rounded w-full" />
            <div className="h-4 bg-neutral-200 rounded w-5/6" />
          </div>
        )}

        {state.kind === 'expired' && (
          <div className="pt-20 text-center">
            <p className="text-lg font-semibold">This brief link has expired</p>
            <p className="text-sm text-neutral-500 mt-2">
              Please contact your Holo Hive point of contact for an updated link.
            </p>
          </div>
        )}

        {state.kind === 'ready' && (
          state.pageRef ? (
            briefRefKind(state.pageRef) === 'link' ? (
              /* [2026-07-27] Link-out, not an iframe. Google sends
                 X-Frame-Options on the ordinary /edit view, so framing a shared
                 doc renders an unexplained blank rectangle — and expecting the
                 operator to paste exactly the /preview or published /pub form
                 is a trap that fails silently. A button works for every URL
                 shape. The open is still logged, because this page loads first
                 either way. */
              <div className="pt-12 text-center">
                <p className="text-lg font-semibold">Your brief is ready</p>
                {state.angleName && (
                  <p className="text-sm text-neutral-500 mt-1">Angle: {state.angleName}</p>
                )}
                <div className="mt-6">
                  <Button asChild variant="brand" size="lg">
                    <a href={state.pageRef} target="_blank" rel="noopener noreferrer">
                      Open your brief
                      <ExternalLink className="h-4 w-4 ml-2" />
                    </a>
                  </Button>
                </div>
                <p className="text-sm text-neutral-500 mt-6 max-w-md mx-auto">
                  Opens in a new tab. This link is yours — please don&apos;t share it.
                </p>
              </div>
            ) : (
            /* [2026-07-27] sandboxed. The framed page is published by the
               kr-kol-comms generator, not by us, and it renders inside a page
               carrying the Holo Hive name to an external audience. allow-scripts
               is required for the creative card to work at all; allow-popups
               lets a KOL open a reference link. Deliberately withheld:
               allow-same-origin (so the frame gets an opaque origin and cannot
               reach this page's storage or DOM),
               allow-top-navigation (so it cannot redirect the KOL away),
               allow-forms and allow-modals (nothing in a brief should collect
               input). Host allowlist is enforced at the write boundary — see
               lib/briefPageRef.ts. */
            <iframe
              src={state.pageRef}
              title="Creator brief"
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              className="w-full h-[calc(100vh-120px)] rounded-lg border border-neutral-200 bg-white"
            />
            )
          ) : (
            <div className="pt-16 text-center">
              <p className="text-lg font-semibold">Your brief is being prepared</p>
              {state.angleName && (
                <p className="text-sm text-neutral-500 mt-1">Angle: {state.angleName}</p>
              )}
              <p className="text-sm text-neutral-500 mt-3 max-w-md mx-auto">
                The full creative card for this week will appear here shortly. This link is yours —
                please don&apos;t share it.
              </p>
            </div>
          )
        )}
      </main>

      <footer className="w-full border-t border-neutral-200 py-4 px-4 text-center">
        <p className="text-[11px] text-neutral-400">{CONFIDENTIAL_FOOTER}</p>
      </footer>
    </div>
  );
}
