'use client';

/**
 * Whether a client can get this week's Korea brief, problems first.
 * Checks already in place fold away; checks waiting on another fix are
 * listed as follow-ons, not as separate problems.
 */

import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { ChevronRight, CircleAlert, CircleCheck, Hourglass } from 'lucide-react';
import type { BriefReadiness, ReadinessCheck } from '@/lib/koreaIntel/briefReadiness';

const LEVEL_TONE: Record<BriefReadiness['level'], BadgeTone> = { ready: 'success', partial: 'warning', blocked: 'danger' };

export function BriefReadinessCard({ clientName, meta, readiness }: {
  clientName: string;
  meta: string;
  readiness: BriefReadiness;
}) {
  const fix = readiness.checks.filter((c) => c.state === 'fix');
  const waits = readiness.checks.filter((c) => c.state === 'waits');
  const ok = readiness.checks.filter((c) => c.state === 'ok');

  return (
    <div className="overflow-hidden rounded-[14px] border border-cream-200 bg-white shadow-card">
      <div className="p-5">
        <StatusBadge tone={LEVEL_TONE[readiness.level]}>{readiness.headline}</StatusBadge>
        <h3 className="display-serif mt-2 text-[22px] leading-tight text-ink-warm-900">{clientName}</h3>
        <p className="mt-1.5 text-[13px] text-ink-warm-500">{meta}</p>
      </div>
      <div className="border-t border-cream-100 p-5">
        {fix.length ? (
          <>
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
              {fix.length === 1 ? 'One thing to fix' : `${fix.length} things to fix`}
            </p>
            <ul className="grid gap-2.5">{fix.map((c) => <CheckRow key={c.key} c={c} />)}</ul>
          </>
        ) : (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800">All {readiness.checks.length} checks pass</p>
        )}
        {waits.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-snug text-ink-warm-500">
            <Hourglass className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Then, automatically: {waits.map((c) => sentenceCase(c.label)).join(' · ')}</span>
          </p>
        )}
        {ok.length > 0 && (
          <details className="group mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-ink-warm-700 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
              {ok.length} of {readiness.checks.length} already in place
            </summary>
            <ul className="mt-2.5 grid gap-2.5">{ok.map((c) => <CheckRow key={c.key} c={c} />)}</ul>
          </details>
        )}
      </div>
    </div>
  );
}

function CheckRow({ c }: { c: ReadinessCheck }) {
  const good = c.state === 'ok';
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2.5 text-[13.5px] text-ink-warm-900">
      {good
        ? <CircleCheck className="mt-px h-[18px] w-[18px] text-emerald-600" aria-label="In place" />
        : <CircleAlert className="mt-px h-[18px] w-[18px] text-amber-600" aria-label="Needs fixing" />}
      <span>{c.label}<span className="block text-xs leading-snug text-ink-warm-500">{c.detail}</span></span>
    </li>
  );
}

/** "Bot can post…" → "bot can post…", but keep proper nouns ("Korean …"). */
function sentenceCase(t: string) {
  return /^(Korea|Korean)\b/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
}
