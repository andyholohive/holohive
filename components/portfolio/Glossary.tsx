'use client';

/**
 * The vocabulary this page assumes.
 *
 * [2026-09-11, Andy] The brief for this page was to write it for someone new to
 * the company, and the backbone card does that for our own nouns — term, angle,
 * slot. It does nothing for the other half, which is the Korean market and
 * crypto vocabulary the client documents are written in. A reader who has just
 * been told what a lineup is still cannot read "the kimchi premium moved" or
 * "a $75M FDV" or "DFBA batch auctions".
 *
 * Only terms that actually appear on this page are listed, each defined in the
 * sense this page uses. Definitions are deliberately plain rather than precise:
 * the job is to let someone keep reading, not to make them an expert.
 */

import { CollapsibleCard } from '@/components/portfolio/Collapsible';

const GROUPS: Array<{ heading: string; terms: Array<{ term: string; def: string }> }> = [
  {
    heading: 'How the work is sold and measured',
    terms: [
      { term: 'KOL', def: 'Key Opinion Leader — a creator with a following on X or Telegram. The people we brief and pay.' },
      { term: 'Impressions / views', def: 'How many times a post was seen. Not how many people saw it, and not engagement.' },
      { term: 'Engagement rate', def: 'Reactions, comments and forwards as a share of views. A small channel often beats a large one here.' },
      { term: 'UGC', def: 'User-generated content — posts made by the audience rather than by a briefed creator. Unpaid, so it reads differently.' },
      { term: 'CPA', def: 'Cost per acquisition — what it cost us to produce one participant or signup.' },
      { term: 'Mindshare', def: 'How much a project is being talked about in a market, usually counted as mentions across tracked channels.' },
      { term: 'Baseline / signal snapshot', def: 'An audit of how often a client was mentioned in Korean channels before we started. The line everything later is measured against.' },
    ],
  },
  {
    heading: 'The Korean market',
    terms: [
      { term: 'Upbit / Bithumb', def: 'The two dominant Korean exchanges. A listing on either is a major credibility event, and their teams watch Korean Telegram when evaluating one.' },
      { term: 'Kimchi premium', def: 'The gap between a token’s price in Korea and its price elsewhere. A standing indicator of Korean retail demand.' },
      { term: 'KBW', def: 'Korea Blockchain Week — the largest event on the Korean crypto calendar, late September.' },
      { term: 'PIPA', def: 'Korea’s personal data protection law. Governs what we may collect from participants and requires an agreement before processing on a client’s behalf.' },
    ],
  },
  {
    heading: 'Tokens and launches',
    terms: [
      { term: 'TGE', def: 'Token Generation Event — when a project’s token is created and distributed. Usually the centre of a campaign calendar.' },
      { term: 'FDV', def: 'Fully diluted valuation — the project’s implied value if every token existed today. What a sale is priced against.' },
      { term: 'Airdrop', def: 'Free tokens given to early or active users. Attracts volume, and attracts farmers who leave once it ends.' },
      { term: 'Farming', def: 'Doing the minimum to qualify for a reward. The behaviour activations are designed to filter out.' },
      { term: 'Perps / perp DEX', def: 'Perpetual futures — leveraged bets with no expiry — and the on-chain venues that trade them.' },
      { term: 'Liquid staking', def: 'Locking a token for yield while keeping something tradeable in return.' },
      { term: 'Futarchy / decision markets', def: 'Governing by betting: the proposal the market prices highest is the one that executes. Close to prediction markets, which are restricted in Korea.' },
      { term: 'zkTLS', def: 'A way to prove something about an account — that you held it, or qualified — without revealing the account itself.' },
    ],
  },
];

export function Glossary() {
  return (
    <CollapsibleCard
      id="glossary"
      kicker="If a word on this page is unfamiliar"
      title="The vocabulary, in plain terms"
      description="Only the terms that actually appear below, defined in the sense this page uses them."
      defaultOpen={false}
    >
      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {GROUPS.map(g => (
          <div key={g.heading} className="flex flex-col gap-2 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 pb-1.5 border-b border-cream-100">
              {g.heading}
            </p>
            <dl className="flex flex-col gap-2.5">
              {g.terms.map(t => (
                <div key={t.term} className="flex flex-col gap-0.5">
                  <dt className="text-[12.5px] font-semibold text-ink-warm-900">{t.term}</dt>
                  <dd className="text-[12px] text-ink-warm-500 leading-relaxed">{t.def}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}
