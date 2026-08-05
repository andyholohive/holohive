'use client';

/**
 * /clients/templates — back-compat redirect.
 *
 * Action Board templates moved into the unified /templates page as the
 * "Action Board" tab on 2026-08-05, joining Messages + Tasks +
 * Deliverables. This route redirects to /templates?tab=action-board so
 * existing bookmarks and the "Manage templates…" links don't 404.
 *
 * Same shape as the /tasks/templates and /tasks/deliverables/templates
 * stubs left behind by the 2026-06-03 consolidation.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ActionBoardTemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/templates?tab=action-board');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-sm text-ink-warm-500">
      Redirecting to Templates…
    </div>
  );
}
