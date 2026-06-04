'use client';

/**
 * /tasks/templates — back-compat redirect.
 *
 * Task templates were merged into the unified /templates page as the
 * "Tasks" tab on 2026-06-03 (sidebar consolidation: three "Templates"
 * entries → one). This route now redirects to /templates?tab=tasks
 * so existing bookmarks, SOP references, and Telegram links still
 * land on the same content.
 *
 * Uses useEffect + router.replace (rather than Next's server-side
 * `redirect()`) so the hop is client-side — the sidebar's active-
 * route detection picks up /templates immediately. A small
 * "Redirecting…" fallback renders for the ~1 frame it takes the
 * effect to fire.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TaskTemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/templates?tab=tasks');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-sm text-ink-warm-500">
      Redirecting to Templates…
    </div>
  );
}
