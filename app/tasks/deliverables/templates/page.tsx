'use client';

/**
 * /tasks/deliverables/templates — back-compat redirect.
 *
 * Deliverable templates were merged into the unified /templates page
 * as the "Deliverables" tab on 2026-06-03. This route now redirects
 * to /templates?tab=deliverables so existing bookmarks/links don't
 * 404.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeliverableTemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/templates?tab=deliverables');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-sm text-ink-warm-500">
      Redirecting to Templates…
    </div>
  );
}
