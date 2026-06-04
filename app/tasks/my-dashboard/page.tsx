'use client';

/**
 * /tasks/my-dashboard — back-compat redirect.
 *
 * The personal "My Dashboard" view was merged into the main Priority
 * Dashboard as the first tab on 2026-06-03. This route used to host
 * its own implementation; it now redirects to /dashboard?tab=my-work
 * so existing bookmarks, Telegram links, and SOP references still
 * land on the same content.
 *
 * Using `useEffect` + router.replace (rather than Next.js's
 * `redirect()`) so this stays a client-side hop — the sidebar's
 * active-route detection picks up /dashboard immediately and the
 * URL bar updates without a full page reload. A small "Redirecting…"
 * fallback renders for the ~1 frame it takes the effect to fire.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MyDashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard?tab=my-work');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[40vh] text-sm text-ink-warm-500">
      Redirecting to the Priority Dashboard…
    </div>
  );
}
