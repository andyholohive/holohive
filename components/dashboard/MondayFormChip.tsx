'use client';

/**
 * Monday form summary chip for the dashboard PageHeader.
 *
 * [2026-06-11] Per the Bucket B audit: the spec § 6 places Monday form
 * status BELOW all 3 layers, but the current shipping UI buries it
 * inside the Internal tab so CMs on Client / Renewals tabs can't see
 * the team submission rate at a glance. This chip surfaces the
 * "N/8 submitted · deadline in 4h" summary in the PageHeader so it's
 * always visible.
 *
 * Visual: subtle pill with brand-teal kicker dot. Color flips amber
 * when the deadline has passed and at least one person hasn't
 * submitted. Click navigates to the form.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

type Summary = {
  formSlug: string;
  weekOf: string;
  submittedCount: number;
  totalCount: number;
  deadlinePassed: boolean;
  deadlineHourUtc: number;
};

export function MondayFormChip() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/v2/monday-form-summary');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error || !data) return null;

  const allDone = data.submittedCount >= data.totalCount;
  const missingCount = Math.max(0, data.totalCount - data.submittedCount);
  // Three states:
  //   1. everyone in: emerald — quiet "Mon form: 8/8"
  //   2. deadline passed + missing: amber alert
  //   3. before deadline: neutral countdown chip
  const tone: 'success' | 'warning' | 'neutral' =
    allDone ? 'success' :
    data.deadlinePassed ? 'warning' :
    'neutral';

  const toneClasses = {
    success: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50/70 text-amber-800',
    neutral: 'border-cream-300 bg-cream-50 text-ink-warm-700',
  }[tone];

  const Icon = allDone ? CheckCircle2 : data.deadlinePassed ? AlertTriangle : Clock;
  const label =
    allDone ? `Mon form: ${data.submittedCount}/${data.totalCount}` :
    data.deadlinePassed ? `Mon form late: ${missingCount} pending` :
    `Mon form: ${data.submittedCount}/${data.totalCount}`;
  const sub =
    allDone ? 'all in' :
    data.deadlinePassed ? `deadline passed at ${data.deadlineHourUtc}:00 UTC` :
    `due ${data.deadlineHourUtc}:00 UTC Mon`;

  return (
    <Link
      href={`/forms/${data.formSlug}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium hover:shadow-sm transition-shadow ${toneClasses}`}
      title={`Monday form · Week of ${data.weekOf}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className="opacity-70 hidden sm:inline">· {sub}</span>
    </Link>
  );
}
