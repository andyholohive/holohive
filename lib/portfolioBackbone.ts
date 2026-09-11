/**
 * How each account departs from the standard workflow.
 *
 * [2026-09-11, Andy] "Show analysis of how each client on the page is different
 * from the original backbone of our actual workflow, if they are."
 *
 * The backbone card at the top of the page states the ideal: Client → Term →
 * Campaign → Week → Angle → Slot → Post → Payment, with a seven-step onboarding
 * ladder before it and four client-facing rails alongside. No account matches it
 * exactly, and the interesting question is never *whether* one departs but
 * whether the departure was chosen or simply happened.
 *
 * So every finding is typed. A `design` departure is one the engagement decided
 * on and can defend — Button never posts publicly because it is a private
 * council. A `gap` is the backbone not holding — a week briefed after it began
 * documents work that already happened, whatever the reason. Rendering them the
 * same way would flatter the second and insult the first.
 *
 * Findings are derived live from the same data the dossier renders, so this
 * cannot drift from the account it describes. Declared design departures come
 * from the client's documents via `portfolioStrategy`.
 */

import type { ClientDossier } from './portfolioService';
import type { ClientStrategy } from './portfolioStrategy';

export interface BackboneFinding {
  /** The backbone link this concerns. */
  link: string;
  /** Chosen and defensible, or the backbone not holding. */
  kind: 'design' | 'gap';
  /** What the standard workflow expects here. */
  standard: string;
  /** What this account does instead. */
  actual: string;
}

/** Hours below which a sign-off cannot have involved reading anything. */
const RUBBER_STAMP_HOURS = 0.25;

/** Week numbers, ascending. The dossier holds weeks newest-first, which is
 *  right for reading a timeline and wrong for naming a set of them. */
const weekList = (ws: { weekNumber: number }[]) =>
  ws.map(w => w.weekNumber).sort((a, b) => a - b).join(', ');

export function auditBackbone(d: ClientDossier, strategy: ClientStrategy | null): BackboneFinding[] {
  const out: BackboneFinding[] = [];

  // ── declared departures, from the client's own documents ──────────────
  const declared = strategy?.deviations ?? [];
  for (const dev of declared) {
    out.push({ link: dev.link, kind: dev.kind, standard: dev.standard, actual: dev.actual });
  }
  /** A declared departure already covers this link; do not also report it live. */
  const covered = (link: string) => declared.some(x => x.link.includes(link));

  const council = strategy?.deliveryModel === 'private-council';

  // ── Week ──────────────────────────────────────────────────────────────
  // A council engagement has no weekly lineup by design and is covered by its
  // declared departure above, so it is not audited again here.
  if (!council) {
    if (d.weeks.length === 0 && !covered('Week')) {
      out.push({
        link: 'Week',
        kind: 'gap',
        standard: 'Each week of the plan is proposed as a lineup a few days ahead, then signed off before the week starts.',
        actual: d.kols > 0
          ? `No weekly lineup exists yet, though ${d.kols} creator${d.kols === 1 ? ' is' : 's are'} on the roster. Everything downstream — angles, slots, posts — has nothing to hang off.`
          : 'No weekly lineup exists yet, so the chain currently stops at Campaign.',
      });
    }

    const late = d.weeks.filter(w => w.leadDays !== null && w.leadDays < 0);
    if (late.length > 0) {
      out.push({
        link: 'Week',
        kind: 'gap',
        standard: 'The plan goes up before the week begins, so it directs the work.',
        actual: `Week${late.length === 1 ? '' : 's'} ${weekList(late)} went up after the week had already started, so the plan recorded work rather than directing it.`,
      });
    }

    const stamped = d.weeks.filter(
      w => w.reviewHours !== null && w.reviewHours < RUBBER_STAMP_HOURS,
    );
    if (stamped.length > 0) {
      out.push({
        link: 'Week',
        kind: 'gap',
        standard: 'A proposed lineup waits for a real sign-off before the week starts.',
        actual: `Week${stamped.length === 1 ? '' : 's'} ${weekList(stamped)} ${stamped.length === 1 ? 'was' : 'were'} confirmed within minutes of being proposed — too fast for anyone to have read it, so the sign-off step recorded a decision nobody made.`,
      });
    }

    // ── Angle ───────────────────────────────────────────────────────────
    const angleless = d.weeks.filter(w => w.angles.length === 0);
    if (angleless.length > 0) {
      out.push({
        link: 'Angle',
        kind: 'gap',
        standard: 'Every week carries two or three angles. The angle is the strategy; the rest is execution.',
        actual: `Week${angleless.length === 1 ? '' : 's'} ${weekList(angleless)} ${angleless.length === 1 ? 'has' : 'have'} no angle recorded, so ${angleless.length === 1 ? 'its slots sit' : 'their slots sit'} under no stated story.`,
      });
    }

    // ── Slot → Post ─────────────────────────────────────────────────────
    const open = d.weeks.reduce((s, w) => s + w.pending, 0);
    const missed = d.weeks.reduce((s, w) => s + w.missed, 0);
    if (missed > 0) {
      out.push({
        link: 'Slot → Post',
        kind: 'gap',
        standard: 'A slot ends the week posted, or it is closed as missed and understood.',
        actual: `${missed} slot${missed === 1 ? '' : 's'} closed without a post${
          open > 0
            ? `, and ${open} more ${open === 1 ? 'is' : 'are'} still open`
            : ''
        }.`,
      });
    }
  }

  // ── Payment ───────────────────────────────────────────────────────────
  if (d.owed > 0) {
    out.push({
      link: 'Payment',
      kind: 'gap',
      standard: 'A payment is created from the post and tracked until it settles.',
      actual: `${d.owedRows} post${d.owedRows === 1 ? '' : 's'} logged and unpaid, $${Math.round(d.owed).toLocaleString('en-US')} outstanding to creators.`,
    });
  }

  // ── the rails ─────────────────────────────────────────────────────────
  if (d.posts > 0 && d.portalExternalVisits === 0) {
    out.push({
      link: 'Rail · Client portal',
      kind: 'gap',
      standard: 'The client can open a live portal any time without asking us.',
      actual: `No external portal visit on record across the whole engagement, despite ${d.docOpens} document open${d.docOpens === 1 ? '' : 's'}. One of the four rails is not being used.`,
    });
  }
  if (d.messages.length === 0) {
    out.push({
      link: 'Rail · Ops chat',
      kind: 'gap',
      standard: 'A shared Telegram group carries the day-to-day with the client team.',
      actual: 'No chat messages are recorded against this client, so that rail is either unused or not connected to HHP.',
    });
  }
  if (d.callNoteCount === 0) {
    out.push({
      link: 'Rail · Sync call',
      kind: 'gap',
      standard: 'A recurring call, with decisions written up as a summary.',
      actual: 'No call summary has been filed, so decisions taken on calls are not on the record.',
    });
  }

  // ── the onboarding ladder ─────────────────────────────────────────────
  const unfinished = d.milestones.filter(m => m.status !== 'completed' && m.status !== 'complete');
  if (unfinished.length > 0 && d.posts > 0) {
    out.push({
      link: 'Onboarding ladder',
      kind: 'gap',
      standard: 'All seven steps are cleared before the weekly cycle starts.',
      actual: `${unfinished.length} step${unfinished.length === 1 ? '' : 's'} still open (${unfinished.map(m => m.name).join(', ')}) even though content is already shipping.`,
    });
  }

  return out;
}

/* ── reading the findings in the order the work happens ─────────────────── */

/**
 * The backbone as a sequence, for rendering.
 *
 * [2026-09-11, Andy] "Very hard to read because it doesn't have any context
 * consecutively." Fair — a list of departures sorted by severity tells you what
 * broke but not where, and the backbone is a chain whose whole point is order.
 * Read that way, "Campaign roster" and "Payment" are two unrelated complaints
 * rather than two points on one line.
 *
 * So the block now walks the sequence and shows every link, including the ones
 * that are fine. A departure means more when you can see it sitting between two
 * links that held, and an account with three gaps in a row reads very
 * differently from one with three scattered.
 */
export const BACKBONE_SEQUENCE: Array<{ group: string; note: string; links: string[] }> = [
  {
    group: 'Before week one',
    note: 'What has to be agreed before the weekly cycle can start.',
    links: ['Onboarding ladder', 'Briefs & plans'],
  },
  {
    group: 'The chain',
    note: 'Each link owns the one below it.',
    links: ['Client', 'Term', 'Campaign', 'Week', 'Angle', 'Slot', 'Post', 'Payment'],
  },
  {
    group: 'Running alongside',
    note: 'The four surfaces the client sees.',
    links: ['Weekly report', 'Client portal', 'Ops chat', 'Sync call'],
  },
];

/** Every canonical link, in order, for matching. */
const FLAT = BACKBONE_SEQUENCE.flatMap(g => g.links);

/**
 * Attach each finding to the earliest link it names.
 *
 * A finding can span several links — Button's "Week → Angle → Slot → Post" is
 * one departure across four — and it belongs at the point where the divergence
 * starts, not repeated down the chain.
 */
export function groupByLink(findings: BackboneFinding[]): Map<string, BackboneFinding[]> {
  const out = new Map<string, BackboneFinding[]>();
  for (const f of findings) {
    const anchor = FLAT.find(link => f.link.includes(link)) ?? f.link;
    if (!out.has(anchor)) out.set(anchor, []);
    out.get(anchor)!.push(f);
  }
  return out;
}
