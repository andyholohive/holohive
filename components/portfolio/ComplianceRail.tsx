'use client';

/**
 * What Korean law and these contracts forbid.
 *
 * [2026-09-11, Andy] Reading all five clients' documents end to end turned up
 * the same handful of constraints repeating across unrelated engagements, each
 * one recorded inside a single client's dossier. Scattered like that they read
 * as five separate client quirks; together they are the operating rules for
 * working in this market, and they are the class of mistake that is expensive
 * rather than embarrassing.
 *
 * Every line is quoted from or tightly paraphrased from a client document — see
 * `lib/portfolioStrategy.ts` for where each came from. Nothing here is inferred,
 * and nothing here is legal advice; it is what our own briefs already commit to.
 */

import { StatusBadge } from '@/components/ui/status-badge';
import { CollapsibleCard } from '@/components/portfolio/Collapsible';

const RULES: Array<{
  rule: string;
  detail: string;
  scope: string;
  /** true when it binds every client, not just the ones listed. */
  universal?: boolean;
}> = [
  {
    rule: 'No referral links in public creator content',
    detail:
      'Referral programs are restricted in Korea. Button routes attribution through custom landing pages on a pull basis instead, and Umia bars participation referral links outright. The unresolved case is Fogo, whose creator incentive document still proposes onboarding every KOL through the Valiant affiliate form while its own comments record that referral programs are now illegal here.',
    scope: 'Button · Umia · unresolved on Fogo',
    universal: true,
  },
  {
    rule: 'Korean paid-partnership disclosure is mandatory',
    detail:
      'Required on all creator content. Jumper states it in the agreement; it applies regardless of whether a given contract spells it out.',
    scope: 'Jumper, and every engagement',
    universal: true,
  },
  {
    rule: 'No performance claims, including screenshots',
    detail:
      'Button is pursuing RIA licensing in the United States, so no communication may imply or promise a return — and the restriction reaches results tables and backtest screenshots, not only stated returns.',
    scope: 'Button',
  },
  {
    rule: 'No legal, regulatory, tax, investment or financial advice on a token',
    detail:
      'And no representation on amount raised, allocation, listing, price, trading volume or market capitalisation. Jumper carries it in the agreement; Umia’s baseline applies the same bar through compliance review.',
    scope: 'Jumper · Umia',
  },
  {
    rule: 'Prediction-market mechanics need compliance review before distribution',
    detail:
      'Umia’s decision markets sit close to prediction-market territory, which is restricted under Korean regulation. Creator content is walkthrough and education formats only, reviewed before it goes out.',
    scope: 'Umia',
  },
  {
    rule: 'Pre-announcement detail never reaches a creator first',
    detail:
      'Jumper’s sale and platform details stay behind the client’s own PR. Umia holds eligibility specifics until Umia announces them.',
    scope: 'Jumper · Umia',
  },
  {
    rule: 'Korean personal data under PIPA, minimum necessary',
    detail:
      'A data processing agreement has to be in place before any processing on the client’s behalf.',
    scope: 'Jumper',
  },
];

export function ComplianceRail() {
  return (
    <CollapsibleCard
      id="compliance"
      kicker="Across every account"
      title="What we are not allowed to do in this market"
      description="Each of these sits inside one client's documents, but most of them are the same Korean rule arriving through different contracts. Read together they are the standing constraints on any brief we write."
    >

      <div className="flex flex-col">
        {RULES.map(r => (
          <div key={r.rule} className="px-5 py-3.5 border-b border-cream-100 last:border-b-0 flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-[13px] font-semibold text-ink-warm-900">{r.rule}</span>
              <StatusBadge tone={r.universal ? 'danger' : 'neutral'} size="sm">
                {r.universal ? 'all clients' : r.scope}
              </StatusBadge>
            </span>
            <span className="text-[12px] text-ink-warm-500 leading-relaxed max-w-[80ch]">{r.detail}</span>
            {r.universal && (
              <span className="text-[11px] text-ink-warm-400">Recorded on: {r.scope}</span>
            )}
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}
