/**
 * Korea Scan — the sentence on each graphic.
 *
 * Yano's grammar: one idea per graphic, the headline says what the chart
 * shows, the window is stated on it. These are written from the numbers so a
 * scan of any project reads like a hand-written one, and so a weak number
 * gets a plain sentence instead of a spun one.
 */

import type { KoreaScan } from './compute';

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
export const ordinal = (n: number) => ORD[n] ?? `${n}th`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const weeks = (days: number) => (days % 7 === 0 ? `${days / 7} weeks` : `${days} days`);

export function scanNarrative(s: KoreaScan) {
  const n = s.subject;
  const h = s.headline;
  const cmp = weeks(s.periods.compare);

  const paidShare = s.paid.share ?? 0;
  const untaggedTenths = Math.round((100 - paidShare) / 10);
  const depthRank = s.depth.findIndex((d) => d.isSubject) + 1;
  const mixGap = s.mix.subject.shares.analysis - s.mix.field.shares.analysis;
  const reachW = s.reach.weeks.filter((w) => !w.partial && w.perMention != null);
  const reachUp = reachW.length >= 2 && reachW[reachW.length - 1].perMention! > reachW[0].perMention!;
  const mv = s.movement.rows.find((r) => r.isSubject);
  const going = (mv?.pace ?? 0) > 0;
  const fieldGrew = (s.movement.fieldPace ?? 0) >= 0;
  const shrinking = s.movement.rows.filter((r) => (r.pace ?? 0) < 0).length;

  return {
    cover: {
      title: `${n} in Korea`,
      verdict: h.changePct == null ? `${h.posts} Korean posts named ${n} across ${h.channels} channels.`
        : h.changePct < 0
          ? `Korean coverage of ${n} fell ${Math.abs(h.changePct)}% in the last ${cmp}${h.fieldChangePct != null ? `, while the field ${h.fieldChangePct >= 0 ? `grew ${h.fieldChangePct}%` : `fell ${Math.abs(h.fieldChangePct)}%`}` : ''}.`
          : `Korean coverage of ${n} rose ${h.changePct}% in the last ${cmp}${h.fieldChangePct != null ? `, while the field ${h.fieldChangePct >= 0 ? `grew ${h.fieldChangePct}%` : `fell ${Math.abs(h.fieldChangePct)}%`}` : ''}.`,
    },
    paid: {
      title: paidShare <= 20 ? `${capital(untaggedTenths >= 10 ? 'All but a few' : `${untaggedTenths} in ten`)} ${n} posts carry no paid marker.` : `${paidShare}% of ${n}'s Korean coverage is marked as paid.`,
      sub: `${s.paid.tagged.posts} of ${h.posts} are tagged. The rest are not.`,
      note: 'An untagged post is not proof of an unpaid one. Korean channels disclose inconsistently and we count only what is marked. Read this as a ceiling on disclosed spend.',
    },
    depth: {
      title: depthRank > 0 && depthRank <= 3 ? `Where a Korean channel writes about ${n}, it is read.` : `${n} reaches fewer readers per channel than most of the field.`,
      sub: depthRank > 0 ? `${capital(ordinal(depthRank))} of ${s.depth.length} on readers per channel.` : `${n} has no Korean coverage in this window.`,
    },
    mix: {
      title: 'What kind of coverage this is',
      sub: `Every post tagged by what it actually is. ${n}'s mix against the ${s.field} average.`,
      read: mixGap >= 0
        ? `Product and analysis is ${s.mix.subject.shares.analysis}% of ${n}'s coverage and ${s.mix.field.shares.analysis}% of the field's. Points and farming is ${s.mix.subject.shares.farming}%, against ${s.mix.field.shares.farming}% for the field.`
        : `Product and analysis is ${s.mix.subject.shares.analysis}% of ${n}'s coverage, below the field's ${s.mix.field.shares.analysis}%. Points and farming is ${s.mix.subject.shares.farming}%, against ${s.mix.field.shares.farming}% for the field.`,
    },
    reach: {
      title: reachUp ? 'Placement is getting better each week' : 'Readers per mention, week by week',
      sub: 'Not how much coverage, but how well-read it is.',
      read: s.reach.best && s.reach.worst
        ? `A rising line means placement is improving even while totals are small. For reference, in the ${s.field} room the strongest project averages ${s.reach.best.perMention.toLocaleString('en-US')} readers a mention (${s.reach.best.name}) and the weakest ${s.reach.worst.perMention.toLocaleString('en-US')} (${s.reach.worst.name}).`
        : 'A rising line means placement is improving even while totals are small.',
    },
    momentum: {
      title: 'Momentum, without pretending',
      sub: 'Mentions per week, with the running count of channels that have written the name.',
      read: `The channel count under each bar is what stops a single loud channel reading as momentum. ${h.channels} channels have written ${n} in this window.`,
    },
    movement: {
      title: `How ${s.field} are moving in Korea`,
      sub: `The field ${fieldGrew ? 'grew' : 'shrank'} ${Math.abs(s.movement.fieldPace ?? 0)} percent. ${mv ? (going ? `${n} is gaining with it.` : `${n} is one of ${shrinking} names going backwards.`) : `${n} has no coverage to compare.`}`,
      read: `Quality-weighted Korean coverage. Change compares the last ${weeks(s.periods.movementShort)} against each project's own pace over ${weeks(s.periods.movementLong)}.`,
    },
    room: {
      title: `Korea's ${s.field} conversation runs across ${s.room.channels} channels.`,
      sub: `${s.room.neverNamed} of them have never written ${n}.`,
    },
  };
}
