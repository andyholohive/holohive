'use client';

/**
 * What to do about all of it.
 *
 * [2026-09-11, Andy] "Have a suggestion section on what we should do with them
 * from now." The rest of the page reports; this is the only part that proposes.
 *
 * Every suggestion is derived from the same live data the sections above
 * render, never written by hand, so it cannot recommend something that has
 * already been done. Each one states the evidence that produced it — a
 * suggestion whose reasoning is invisible is just an opinion, and the first
 * time one is wrong nobody can tell why.
 *
 * Deliberately not a task list. Nothing here writes anywhere or marks itself
 * done: it is a reading of the current state, and it should disappear on its
 * own when the state changes rather than being ticked off.
 */

import { Card } from '@/components/ui/card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Lightbulb } from 'lucide-react';
import type { ClientDossier, CreatorReach } from '@/lib/portfolioService';
import { strategyFor } from '@/lib/portfolioStrategy';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

interface Move {
  /** Sooner is smaller. Drives ordering. */
  urgency: number;
  when: string;
  tone: BadgeTone;
  title: string;
  /** What to do. */
  action: string;
  /** Why this came up — the numbers behind it. */
  because: string;
}

export function NextMoves({ rows, creators }: { rows: ClientDossier[]; creators: CreatorReach[] }) {
  const moves: Move[] = [];

  for (const d of rows) {
    const budget = d.toCreators + d.owed + d.unspent;
    const deployed = d.toCreators + d.owed;
    const pctDeployed = budget > 0 ? Math.round((deployed / budget) * 100) : null;
    let pctElapsed: number | null = null;
    if (d.stintStart && d.stintEnd) {
      const start = new Date(d.stintStart).getTime();
      const span = new Date(d.stintEnd).getTime() - start;
      if (span > 0) pctElapsed = Math.round(((Date.now() - start) / span) * 100);
    }
    const drift = pctElapsed !== null && pctDeployed !== null ? pctDeployed - pctElapsed : null;

    // ── the term is over or nearly over ────────────────────────────────
    if (d.daysLeft !== null && d.daysLeft <= 0) {
      moves.push({
        urgency: 0,
        when: 'Today',
        tone: 'danger',
        title: `${d.name} — decide the renewal`,
        action: d.unspent > 0
          ? `Close it out or extend. If it closes, ${money(d.unspent)} goes back to the client; if it extends, that budget is still spendable.`
          : 'Close it out or extend. Budget is fully deployed, so this is a clean conversation to have.',
        because: `The term ended ${d.stintEnd ? 'on its recorded end date' : 'with no end date on file'} and nothing has replaced it.`,
      });
    } else if (d.daysLeft !== null && d.daysLeft <= 30) {
      moves.push({
        urgency: d.daysLeft,
        when: `${d.daysLeft} days`,
        tone: 'warning',
        title: `${d.name} — open the renewal conversation`,
        action: `Put the renewal on the table now, while there is still a term to point at${d.unspent > 0 ? ` and ${money(d.unspent)} of budget to deploy into it` : ''}.`,
        because: `The term ends in ${d.daysLeft} days. Renewals discussed after a term lapses start from a worse position than ones discussed inside it.`,
      });
    }

    // ── spend is behind the clock ──────────────────────────────────────
    if (drift !== null && drift <= -15 && (d.daysLeft ?? 0) > 0) {
      moves.push({
        urgency: Math.max(1, d.daysLeft ?? 60),
        when: `${d.daysLeft} days`,
        tone: (d.daysLeft ?? 60) <= 30 ? 'danger' : 'warning',
        title: `${d.name} — spend the budget or lose the delivery`,
        action: `Add creators, add an activation, or agree a smaller budget with the client. ${money(d.unspent)} is undeployed with ${d.daysLeft} days to use it.`,
        because: `${pctElapsed}% of the term has passed but only ${pctDeployed}% of budget is committed — ${Math.abs(drift)} points behind. Unspent budget is refunded, so this is under-delivery rather than lost revenue, and it is the weakest footing for a renewal.`,
      });
    }

    // ── the client is not reading what we send ─────────────────────────
    if (d.posts > 0 && d.portalExternalVisits === 0) {
      moves.push({
        urgency: 30,
        when: 'This month',
        tone: 'info',
        title: `${d.name} — the portal is going unused`,
        action: 'Either walk them through it on the next call, or accept that Telegram is the channel and stop maintaining a second one.',
        because: `${d.docOpens} document opens but no external portal visit on record across the whole engagement. One of the four client-facing rails is doing nothing.`,
      });
    }

    // ── briefs going up after the week starts ──────────────────────────
    const late = d.weeks.filter(w => w.leadDays !== null && w.leadDays < 0);
    if (late.length > 0) {
      moves.push({
        urgency: 25,
        when: 'Next lineup',
        tone: 'warning',
        title: `${d.name} — get the plan ahead of the week again`,
        action: 'Propose the next lineup before its week opens, even if the brief behind it is thin. A short plan in advance beats a complete one in arrears.',
        because: `${late.length} week${late.length === 1 ? '' : 's'} went up after the week had already begun, so the plan recorded work instead of directing it.`,
      });
    }

    // ── strategy reading going stale ───────────────────────────────────
    const strat = strategyFor(d.name);
    if (strat) {
      const age = Math.floor((Date.now() - new Date(strat.readOn).getTime()) / 86_400_000);
      if (age >= 30) {
        moves.push({
          urgency: 45,
          when: 'When convenient',
          tone: 'neutral',
          title: `${d.name} — re-read the strategy documents`,
          action: 'Open the briefs again and update the strategy block. Nothing syncs this automatically.',
          because: `Last read ${age} days ago. Client documents change without telling us, and a stale reading presented as current is worse than no reading.`,
        });
      }
    }
  }

  // ── creators owed, across the whole portfolio ────────────────────────
  // One line, not one per client. Four near-identical rows read as four
  // problems and pushed a renewal with a deadline below them, when the actual
  // job is a single payment run.
  const owing = rows.filter(r => r.owed > 0).sort((a, b) => b.owed - a.owed);
  if (owing.length > 0) {
    const total = owing.reduce((s, r) => s + r.owed, 0);
    const posts = owing.reduce((s, r) => s + r.owedRows, 0);
    moves.push({
      urgency: 20,
      when: 'This week',
      tone: total >= 2000 ? 'warning' : 'info',
      title: `Settle ${money(total)} owed to creators`,
      action: `${posts} logged post${posts === 1 ? '' : 's'} across ${owing.length} account${owing.length === 1 ? '' : 's'} — ${owing.map(r => `${r.name} ${money(r.owed)}`).join(', ')}. One payment run clears it.`,
      because: 'Creator relationships are the roster, and late payment is the cheapest way to lose one.',
    });
  }

  // ── roster concentration, portfolio-wide ─────────────────────────────
  const heavy = creators.filter(c => c.clients.length >= 4);
  if (heavy.length > 0) {
    moves.push({
      urgency: 40,
      when: 'Next roster build',
      tone: 'warning',
      title: 'Spread the load across the roster',
      action: `Brief a wider set on the next lineup. ${heavy.map(c => c.name).join(', ')} ${heavy.length === 1 ? 'is' : 'are'} on ${heavy[0].clients.length} live accounts at once.`,
      because: 'Losing any one of them degrades that many campaigns in the same week, and the same audience is seeing one voice cover several projects, which spends the credibility we pay those channels for.',
    });
  }

  moves.sort((a, b) => a.urgency - b.urgency);

  if (moves.length === 0) {
    return (
      <Card className="border-cream-200 p-5">
        <p className="text-[13px] text-ink-warm-500 leading-relaxed">
          Nothing on the portfolio is asking for a decision right now — no term is closing, budgets
          are tracking their clocks, creators are paid, and every plan went up before its week.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-cream-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-200 bg-cream-50 flex flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
          Soonest first
        </p>
        <h3 className="text-base font-semibold text-ink-warm-900 tracking-tight flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-brand flex-shrink-0" />
          What to do from here
        </h3>
        <p className="text-[12.5px] text-ink-warm-500 leading-relaxed max-w-[78ch]">
          Every line is read off the live data above, so these change as the accounts do. Nothing
          here is a task and nothing marks itself done — a suggestion disappears when the situation
          that produced it does.
        </p>
      </div>

      <div className="flex flex-col">
        {moves.map((m, i) => (
          <div key={`${m.title}-${i}`} className="px-5 py-3.5 border-b border-cream-100 last:border-b-0 flex gap-3.5">
            <span
              className={`w-[3px] self-stretch rounded-sm flex-shrink-0 ${
                m.tone === 'danger' ? 'bg-rose-500' : m.tone === 'warning' ? 'bg-amber-500' : 'bg-brand'
              }`}
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-semibold text-ink-warm-900">{m.title}</span>
                <StatusBadge tone={m.tone} size="sm">{m.when}</StatusBadge>
              </span>
              <span className="text-[12.5px] text-ink-warm-700 leading-relaxed max-w-[80ch]">{m.action}</span>
              <span className="text-[11.5px] text-ink-warm-400 leading-relaxed max-w-[80ch]">
                Why: {m.because}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
