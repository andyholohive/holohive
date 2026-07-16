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
              Please contact your HoloHive point of contact for an updated link.
            </p>
          </div>
        )}

        {state.kind === 'ready' && (
          state.pageRef ? (
            <iframe
              src={state.pageRef}
              title="Creator brief"
              className="w-full h-[calc(100vh-120px)] rounded-lg border border-neutral-200 bg-white"
            />
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
