'use client';

/**
 * A reading order for someone seeing this page for the first time.
 *
 * [2026-09-11, Andy] The page is ordered for an operator — what needs deciding
 * sits high, the accounts sit last — because someone running the week needs to
 * know what is on fire before they need detail. A new reader needs the reverse:
 * one concrete account first, because the vocabulary above only means anything
 * once they have seen it used. Read straight down, a newcomer meets "spend the
 * budget or lose the delivery" before they know what a term is.
 *
 * So the path is not the page order, and two steps deliberately send the reader
 * backwards. It also names what to skip, which matters more than what to read:
 * the two operator sections and the glossary are the parts most likely to make
 * someone feel lost on day one.
 *
 * Each step opens its target before scrolling — sections collapse, and landing
 * on a closed disclosure is the same failure as a dead link. Steps tick off as
 * they are visited, per reader, so the path survives a reload and picks up
 * where it left off.
 */

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Check, ArrowRight, Compass } from 'lucide-react';
import { openSection } from '@/components/portfolio/Collapsible';
import { strategyFor } from '@/lib/portfolioStrategy';
import type { ClientDossier } from '@/lib/portfolioService';

const STORE = 'hh.portfolio.reading';

function readVisited(): string[] {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

interface Step {
  id: string;
  label: string;
  detail: string;
  minutes: string;
  /** Collapsible ids to open before scrolling. */
  open: string[];
  /** Element id to scroll to. */
  scrollTo: string;
}

/**
 * The fullest standard account — the one worth reading first.
 *
 * Picked on weeks and posts rather than money, because the point is to see the
 * whole chain working, not the biggest invoice. Council engagements are
 * excluded here: they are the contrast in step 4, and reading one first would
 * teach a shape no other account has.
 */
function exemplar(rows: ClientDossier[]): ClientDossier | null {
  const standard = rows.filter(
    r => strategyFor(r.name)?.deliveryModel !== 'private-council' && r.weeks.length > 0 && r.posts > 0,
  );
  return standard.sort((a, b) => b.weeks.length - a.weeks.length || b.posts - a.posts)[0] ?? rows[0] ?? null;
}

function contrast(rows: ClientDossier[]): ClientDossier | null {
  return rows.find(r => strategyFor(r.name)?.deliveryModel === 'private-council') ?? null;
}

export function ReadingPath({ rows }: { rows: ClientDossier[] }) {
  const [visited, setVisited] = useState<string[]>([]);
  useEffect(() => setVisited(readVisited()), []);

  const full = exemplar(rows);
  const council = contrast(rows);

  const steps: Step[] = [
    {
      id: 'orientation',
      label: 'What the business does',
      detail: 'How a campaign is sold and, more importantly, how the money works. The budget-versus-fee distinction is the thing most people get wrong.',
      minutes: '2 min',
      open: ['orientation'],
      scrollTo: 'rp-anchor-orientation',
    },
    {
      id: 'backbone',
      label: 'The backbone',
      detail: 'Our vocabulary — term, campaign, week, angle, slot, post. Read it once; do not try to memorise it.',
      minutes: '5 min',
      open: ['backbone'],
      scrollTo: 'rp-anchor-backbone',
    },
    ...(full
      ? [{
          id: `account-${full.id}`,
          label: `One account, end to end — ${full.name}`,
          detail: 'All six stages, start to finish. This is where the vocabulary above turns into something real, and it teaches more than the rest of the page put together.',
          minutes: '10 min',
          open: ['accounts', `${full.id}-card`],
          scrollTo: `client-${full.id}`,
        }]
      : []),
    ...(council
      ? [{
          id: `contrast-${council.id}`,
          label: `Then the exception — ${council.name}`,
          detail: 'Read its "departs from the backbone" block now that you have seen a standard account. The contrast teaches the chain better than the chain diagram does.',
          minutes: '3 min',
          open: ['accounts', `${council.id}-card`, `${council.id}-stage-00`],
          scrollTo: `client-${council.id}`,
        }]
      : []),
    {
      id: 'compliance',
      label: 'What we are not allowed to do',
      detail: 'Abstract before you have seen a brief, obvious after. That is why it comes fifth rather than first.',
      minutes: '3 min',
      open: ['compliance'],
      scrollTo: 'rp-anchor-compliance',
    },
    {
      id: 'book',
      label: 'The shape of the business',
      detail: 'Client count over the year, how long each term has left, and whether the budgets are being spent at the pace of the clock.',
      minutes: '4 min',
      open: ['book'],
      scrollTo: 'rp-anchor-book',
    },
  ];

  const go = (step: Step) => {
    step.open.forEach(openSection);

    // Two deliberate details here, both found by testing rather than guessed.
    //
    // `behavior: 'auto'`, not 'smooth': smooth scrolling is a no-op inside this
    // page's scroll container — it silently leaves the reader where they were,
    // which looks exactly like a broken link.
    //
    // And it runs twice: opening a disclosure adds its content to the page, so
    // a position measured the moment it opens is measured against a layout that
    // no longer exists once it paints. The second call corrects for the height
    // the expansion added.
    const land = () =>
      document.getElementById(step.scrollTo)?.scrollIntoView({ behavior: 'auto', block: 'start' });
    window.setTimeout(land, 120);
    window.setTimeout(land, 500);

    setVisited(prev => {
      if (prev.includes(step.id)) return prev;
      const next = [...prev, step.id];
      try {
        window.localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        /* Progress is a convenience; losing it must not break the link. */
      }
      return next;
    });
  };

  const done = steps.filter(s => visited.includes(s.id)).length;

  return (
    <Card className="border-brand/30 bg-brand-light/30 overflow-hidden">
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-brand flex-shrink-0" />
            <span className="text-base font-semibold text-ink-warm-900 tracking-tight">
              New here? Read in this order
            </span>
          </span>
          <StatusBadge tone={done === steps.length ? 'success' : 'neutral'} size="sm">
            {done} of {steps.length} read
          </StatusBadge>
        </div>

        <p className="text-[12.5px] text-ink-warm-700 leading-relaxed max-w-[78ch]">
          This is not the order the page is in. The page puts decisions first because that is what
          someone running the week needs; this puts one real account first, because the words above
          it only make sense once you have seen them used. About 25 minutes.
        </p>

        <ol className="flex flex-col gap-1.5">
          {steps.map((s, i) => {
            const seen = visited.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s)}
                  className="w-full text-left rounded-[10px] border border-cream-200 bg-white px-3.5 py-2.5 flex items-start gap-3 hover:border-brand transition-colors focus-brand group"
                >
                  <span
                    className={`h-5 w-5 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${
                      seen ? 'bg-brand text-white' : 'bg-cream-100 text-ink-warm-500'
                    }`}
                  >
                    {seen ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-ink-warm-900">{s.label}</span>
                      <span className="text-[11px] text-ink-warm-400">{s.minutes}</span>
                    </span>
                    <span className="text-[12px] text-ink-warm-500 leading-relaxed">{s.detail}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-warm-300 flex-shrink-0 mt-1 group-hover:text-brand transition-colors" />
                </button>
              </li>
            );
          })}
        </ol>

        <p className="text-[11.5px] text-ink-warm-500 leading-relaxed max-w-[78ch]">
          <b className="text-ink-warm-700">Skip on day one:</b> &ldquo;Needs a decision&rdquo; and
          &ldquo;What to do from here&rdquo; — both assume you already know the accounts, and they
          will read as noise until you do. The glossary is for looking things up, not for reading
          through; open it when a word stops you.
        </p>
      </div>
    </Card>
  );
}
