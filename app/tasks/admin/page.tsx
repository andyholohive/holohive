'use client';

/**
 * /tasks/admin → /dashboard redirect.
 *
 * Per Jdot's Priority Dashboard v2 spec (2026-05-30): the /tasks/admin
 * page is killed; all of its metrics (overdue, tasks per teammate,
 * tasks per client) absorb into the new dashboard's Internal Success
 * + Client Success layers. Anyone with a bookmark lands on the
 * dashboard now.
 *
 * The original 175-line implementation is preserved in git history
 * for the 1-week safety net.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TasksAdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return (
    <div className="p-6 text-sm text-gray-500">
      Redirecting to the Priority Dashboard…
    </div>
  );
}
