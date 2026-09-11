'use client';

/**
 * The campaign backbone — the chain every account hangs off.
 *
 * [2026-09-11, Andy] "Show how it connects to the backbone of our campaign
 * structure." A newcomer meeting HHP sees a lot of nouns — stint, lineup,
 * angle, slot — with no map of how they relate. Every client dossier below
 * is laid out in this same order, so once you have read this you can read
 * any account on the page.
 *
 * The chain is literal: each link is a real table, and each one owns the link
 * to its right. Break any link and everything downstream loses its meaning —
 * which is why a post with no angle, or an angle with no week, is a defect
 * rather than a detail.
 */

import { CollapsibleCard } from '@/components/portfolio/Collapsible';
import {
  Building2, FileSignature, Megaphone, CalendarDays, Lightbulb,
  UserCheck, Send, Wallet, ChevronRight, FileText, Monitor, MessageSquare, Phone,
} from 'lucide-react';

const CHAIN = [
  { icon: Building2,     term: 'Client',   plain: 'The company paying us.', detail: 'One row per company. Everything below belongs to it.' },
  { icon: FileSignature, term: 'Term',     plain: 'The signed period.',     detail: 'Start date, end date, and the money agreed. A renewal adds another term.' },
  { icon: Megaphone,     term: 'Campaign', plain: 'The named programme.',   detail: 'Runs inside the term. Carries the budget and the roster of creators.' },
  { icon: CalendarDays,  term: 'Week',     plain: 'One week of the plan.',  detail: 'Called a lineup. Proposed a few days ahead, then signed off before the week starts.' },
  { icon: Lightbulb,     term: 'Angle',    plain: 'The story a post tells.', detail: 'Each week has two or three. This is the strategy — the rest is execution.' },
  { icon: UserCheck,     term: 'Slot',     plain: 'A creator on an angle.',  detail: 'Who is expected to post what. A slot ends up posted, missed, or still open.' },
  { icon: Send,          term: 'Post',     plain: 'What actually went live.', detail: 'Logged with its date, views and engagement. This is the evidence.' },
  { icon: Wallet,        term: 'Payment',  plain: 'What the creator is owed.', detail: 'Created automatically from the post, then tracked until it is settled.' },
];

/** Before the weekly cycle starts, every client walks the same onboarding
 *  ladder. It is the same seven steps for everyone, which is what makes
 *  "how far along are they" a one-glance question. */
const LADDER = [
  'Kickoff & setup', 'Product deep dive & Korea baseline', 'Outreach brief approved',
  'Korea GTM overview', 'KOL lineup confirmed', 'First content brief approved', 'First content live',
];

const RAILS = [
  { icon: FileText,      term: 'Weekly report', detail: 'A written read on the week, sent every Monday.' },
  { icon: Monitor,       term: 'Client portal', detail: 'A live page the client can open any time, without asking us.' },
  { icon: MessageSquare, term: 'Ops chat',      detail: 'A shared Telegram group with the client team.' },
  { icon: Phone,         term: 'Sync call',     detail: 'A recurring call. Decisions are written up as a summary.' },
];

export function Backbone() {
  return (
    <CollapsibleCard
      id="backbone"
      kicker="How a campaign is built"
      title="The backbone every account hangs off"
      description="Each link owns the one to its right. Every client below is laid out in this same order, so once this makes sense you can read any account on the page."
    >

      {/* the chain */}
      <div className="p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-stretch gap-1.5">
          {CHAIN.map((n, i) => (
            <div key={n.term} className="flex items-stretch gap-1.5">
              <div className="w-[152px] rounded-[10px] border border-cream-200 bg-white px-3 py-2.5 flex flex-col gap-1">
                <span className="flex items-center gap-1.5">
                  <n.icon className="h-3.5 w-3.5 text-brand flex-shrink-0" />
                  <span className="text-[12.5px] font-semibold text-ink-warm-900">{n.term}</span>
                </span>
                <span className="text-[11.5px] text-ink-warm-700 leading-snug">{n.plain}</span>
                <span className="text-[10.5px] text-ink-warm-400 leading-snug">{n.detail}</span>
              </div>
              {i < CHAIN.length - 1 && (
                <span className="flex items-center text-ink-warm-300" aria-hidden="true">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          ))}
        </div>

        {/* how a client gets from signed to shipping */}
        <div className="flex flex-col gap-2 pt-3 border-t border-cream-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
            Before week one — the onboarding ladder every client walks
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {LADDER.map((step, i) => (
              <span key={step} className="flex items-center gap-1.5">
                <span className="rounded-full border border-cream-200 bg-cream-50 px-2.5 py-1 text-[11.5px] text-ink-warm-700">
                  <span className="text-brand font-semibold tabular-nums mr-1.5">{i + 1}</span>{step}
                </span>
                {i < LADDER.length - 1 && <ChevronRight className="h-3 w-3 text-ink-warm-300" aria-hidden="true" />}
              </span>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-warm-500 leading-relaxed max-w-[76ch]">
            Steps 3, 4 and 6 are documents the client signs off — the outreach brief, the GTM plan
            and the content brief. Those are where the weekly angles come from, and each account
            below lists its own copies under <b>The strategy of record</b>.
          </p>
        </div>

        {/* what hangs off the side, in parallel */}
        <div className="flex flex-col gap-2 pt-3 border-t border-cream-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
            Running alongside — how the client sees the work
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {RAILS.map(r => (
              <div key={r.term} className="rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2.5 flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <r.icon className="h-3.5 w-3.5 text-ink-warm-500 flex-shrink-0" />
                  <span className="text-[12.5px] font-semibold text-ink-warm-900">{r.term}</span>
                </span>
                <span className="text-[11.5px] text-ink-warm-500 leading-snug">{r.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
