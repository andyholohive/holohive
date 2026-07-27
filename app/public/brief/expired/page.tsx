/**
 * KOL Brief Delivery — expired/unknown link page.
 *
 * [2026-07-27] Rewrite target for the middleware expiry gate. A static segment
 * so Next resolves it ahead of the [token] dynamic route; middleware excludes
 * this exact path from its own check, or it would rewrite to itself forever.
 *
 * Deliberately says nothing about WHY the link failed — expired and
 * never-existed produce the same page, matching the API, which returns the same
 * 404 for both. Telling a stranger "that token was valid once" is information
 * they have no use for.
 *
 * Server component: it renders the same for everyone and has nothing to fetch,
 * so there is no reason to ship it to the client. Wording matches the inline
 * expired state in [token]/page.tsx — a KOL who hits one should not be able to
 * tell they were served by a different mechanism.
 */

const CONFIDENTIAL_FOOTER = '본 문서는 대외비이며 크리에이터 전용입니다. 재배포하지 마세요.';

export default function BriefExpiredPage() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col">
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
        <div className="pt-20 text-center">
          <p className="text-lg font-semibold">This brief link has expired</p>
          <p className="text-sm text-neutral-500 mt-2">
            Please contact your HoloHive point of contact for an updated link.
          </p>
        </div>
      </main>
      <footer className="w-full border-t border-neutral-200 py-4 px-4 text-center">
        <p className="text-[11px] text-neutral-400">{CONFIDENTIAL_FOOTER}</p>
      </footer>
    </div>
  );
}
