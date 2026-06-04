'use client';

/**
 * /tasks/admin → /dashboard?tab=internal redirect.
 *
 * The Admin Overview page was killed per Jdot's Priority Dashboard v2
 * spec (2026-05-30) and re-implemented as a redirect. Briefly restored
 * 2026-06-03 to audit what was in there before final deletion; the
 * audit confirmed every section has a richer home on /dashboard:
 *
 *   Admin Overview section            →  Dashboard tab + card
 *   ─────────────────────────────────    ──────────────────────────────
 *   Overall Stats (5 KPI tiles)       →  Internal Success layer KPIs
 *   Tasks per Member (table)          →  Internal Success → Team Workload
 *                                        (richer: photos, escalation
 *                                        tones, status badges)
 *   Tasks per Client (list)           →  Client Success → Client Health
 *                                        (richer: renewal tone, weekly
 *                                        completed, owner)
 *
 * Direct routes to old admin views can be deep-linked by passing the
 * matching tab, so this hop targets `?tab=internal` (where the
 * teammate workload table lives) rather than the dashboard root.
 * Anyone with a bookmark or SOP reference still lands on the
 * up-to-date content.
 *
 * Original 175-LOC implementation preserved in git history
 * (commit 2bf21df) for future reference.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TasksAdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard?tab=internal');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-sm text-ink-warm-500">
      Redirecting to the Priority Dashboard…
    </div>
  );
}
