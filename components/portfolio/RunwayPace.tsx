'use client';

/**
 * Runway and pace — the only forward-looking view on the page.
 *
 * [2026-09-11, Andy] Everything else here reports what already happened.
 * This answers the two questions that are still open on any live account:
 * when does it end, and is the budget going to be spent by then.
 *
 * The second question is the one that pays for the component. Venice reached
 * the end of its term with a large share of budget undeployed, and nothing
 * anywhere flagged it while there was still time to spend it. That is not lost
 * revenue — unspent budget is refunded and was never ours — but it is
 * under-delivery, and it is the weakest possible footing for a renewal
 * conversation. Fogo is on the same curve with weeks left rather than days,
 * which is exactly the window this is built to catch.
 *
 * Pace compares two percentages that should track each other: how much of the
 * term has passed against how much of the budget has been committed. A gap
 * either way is worth seeing — well behind means under-delivery, well ahead
 * means the budget runs out before the term does.
 */

import { Card } from '@/components/ui/card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import type { ClientDossier } from '@/lib/portfolioService';
import { formatDate } from '@/lib/dateFormat';

/** Points of divergence before a pace is worth flagging. */
const DRIFT_WARN = 15;
const DRIFT_BAD = 30;

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

interface Row {
  d: ClientDossier;
  pctElapsed: number | null;
  pctDeployed: number | null;
  /** deployed − elapsed. Negative means spending is behind the clock. */
  drift: number | null;
  budget: number;
  deployed: number;
}

function build(d: ClientDossier): Row {
  // Budget is what passes through to creators: paid, owed, and still unspent.
  // Invoiced is not usable here because it also carries our fee.
  const budget = d.toCreators + d.owed + d.unspent;
  const deployed = d.toCreators + d.owed;
  const pctDeployed = budget > 0 ? Math.round((deployed / budget) * 100) : null;

  let pctElapsed: number | null = null;
  if (d.stintStart && d.stintEnd) {
    const start = new Date(d.stintStart).getTime();
    const end = new Date(d.stintEnd).getTime();
    const span = end - start;
    if (span > 0) {
      pctElapsed = Math.max(0, Math.min(100, Math.round(((Date.now() - start) / span) * 100)));
    }
  }

  const drift = pctElapsed !== null && pctDeployed !== null ? pctDeployed - pctElapsed : null;
  return { d, pctElapsed, pctDeployed, drift, budget, deployed };
}

function driftTone(drift: number | null): BadgeTone {
  if (drift === null) return 'neutral';
  const m = Math.abs(drift);
  if (m >= DRIFT_BAD) return 'danger';
  if (m >= DRIFT_WARN) return 'warning';
  return 'success';
}

function driftLabel(drift: number | null): string {
  if (drift === null) return 'no term dates';
  if (Math.abs(drift) < DRIFT_WARN) return 'on pace';
  return drift < 0 ? `${Math.abs(drift)} pts behind` : `${drift} pts ahead`;
}

export function RunwayPace({ rows }: { rows: ClientDossier[] }) {
  if (rows.length === 0) return null;

  const built = rows.map(build).sort((a, b) => {
    const ad = a.d.daysLeft ?? Number.POSITIVE_INFINITY;
    const bd = b.d.daysLeft ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  const behind = built.filter(r => r.drift !== null && r.drift <= -DRIFT_WARN);
  const atRisk = money(behind.reduce((s, r) => s + r.d.unspent, 0));

  return (
    <Card className="border-cream-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-200 bg-cream-50 flex flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
          Looking forward
        </p>
        <h3 className="text-base font-semibold text-ink-warm-900 tracking-tight">
          Runway and spend pace
        </h3>
        <p className="text-[12.5px] text-ink-warm-500 leading-relaxed max-w-[78ch]">
          Soonest to end first. The pace bar compares how much of the term has passed against how
          much of the creator budget is committed — the two should track each other.
          {behind.length > 0 && (
            <>
              {' '}
              <b className="text-ink-warm-900">
                {behind.length} account{behind.length === 1 ? '' : 's'} behind the clock,
                {' '}{atRisk} still undeployed.
              </b>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col">
        {built.map(r => {
          const ended = r.d.daysLeft !== null && r.d.daysLeft <= 0;
          return (
            <div key={r.d.id} className="px-5 py-3.5 border-b border-cream-100 last:border-b-0 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <a
                  href={`#client-${r.d.id}`}
                  className="text-[13px] font-semibold text-ink-warm-900 hover:text-brand transition-colors focus-brand rounded"
                >
                  {r.d.name}
                </a>
                <span className="flex items-center gap-2 flex-wrap">
                  <StatusBadge tone={driftTone(r.drift)} size="sm">{driftLabel(r.drift)}</StatusBadge>
                  <StatusBadge
                    tone={ended ? 'danger' : (r.d.daysLeft ?? 999) <= 30 ? 'warning' : 'neutral'}
                    size="sm"
                  >
                    {ended
                      ? 'term ended'
                      : `${r.d.daysLeft} day${r.d.daysLeft === 1 ? '' : 's'} left`}
                  </StatusBadge>
                </span>
              </div>

              {/* Two bars on one scale, so the gap between them is the finding. */}
              <div className="flex flex-col gap-1">
                <Bar label="Term elapsed" pct={r.pctElapsed} tone="neutral" />
                <Bar label="Budget committed" pct={r.pctDeployed} tone="brand" />
              </div>

              <p className="text-[11.5px] text-ink-warm-400 leading-relaxed">
                {r.d.stintStart ? formatDate(r.d.stintStart) : '—'} → {r.d.stintEnd ? formatDate(r.d.stintEnd) : 'open'}
                {' · '}{money(r.deployed)} of {money(r.budget)} committed
                {r.d.unspent > 0 && <> · <span className="text-amber-700">{money(r.d.unspent)} unspent</span></>}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Bar({ label, pct, tone }: { label: string; pct: number | null; tone: 'neutral' | 'brand' }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-warm-400 w-[120px] flex-shrink-0">
        {label}
      </span>
      <span className="flex-1 h-2 rounded-full bg-cream-100 overflow-hidden min-w-0">
        <span
          className={`block h-full rounded-full ${tone === 'brand' ? 'bg-brand' : 'bg-ink-warm-300'}`}
          style={{ width: `${pct ?? 0}%` }}
        />
      </span>
      <span className="text-[11.5px] tabular-nums text-ink-warm-700 w-[38px] text-right flex-shrink-0">
        {pct === null ? '—' : `${pct}%`}
      </span>
    </div>
  );
}
