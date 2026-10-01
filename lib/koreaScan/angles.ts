/**
 * Korea Scan — which slides a deck can hold, and which story suits a project.
 *
 * A scan has every number; a deck picks the slides that tell one story. The
 * angles below are chosen from the scan itself (falling coverage, a big
 * unreached room, a strong mix...), so each project gets options that fit
 * it, with the reason each one fits stated in words.
 */

import type { KoreaScan } from './compute';

export type SlideId =
  | 'cover' | 'paid' | 'depth' | 'mix' | 'reach' | 'momentum' | 'movement'
  | 'share' | 'channels' | 'room' | 'network' | 'receipts';

export interface SlideMeta {
  id: SlideId;
  label: string;
  /** When it earns its place (Yano's tags). */
  when: string;
  /** What a reader gets from it, for the option list. */
  shows: string;
  /** Internal-only parts are stripped on a shared link; the slide still renders. */
  available: (s: KoreaScan) => boolean;
}

export const SLIDES: SlideMeta[] = [
  { id: 'cover', label: 'Cover', when: 'Every deck', shows: 'Three numbers and the one-line verdict.', available: () => true },
  { id: 'momentum', label: 'Momentum, without pretending', when: 'Use from week four', shows: 'Mentions per week with the running channel count, so one loud channel can’t pass for momentum.', available: (s) => s.momentum.some((w) => w.posts > 0) },
  { id: 'movement', label: 'How the field is moving', when: 'Every week, from day one', shows: 'The whole category’s direction, with the project pinned on top.', available: (s) => s.movement.rows.length > 1 },
  { id: 'mix', label: 'What kind of coverage this is', when: 'Use from week two', shows: 'Product and analysis against points and farming, next to the field average.', available: (s) => s.mix.subject.posts > 0 },
  { id: 'reach', label: 'Readers per mention', when: 'Use from week two', shows: 'How well-read each mention is, week by week. Moves earliest.', available: (s) => s.reach.weeks.some((w) => w.perMention != null) },
  { id: 'share', label: 'Share of the conversation', when: 'Every week, from day one', shows: 'Each name’s share of the field’s quality-weighted coverage.', available: (s) => !!s.share?.rows?.length },
  { id: 'depth', label: 'How deeply it is read', when: 'Prospect scan', shows: 'Readers per channel against every name in the field.', available: (s) => s.depth.length > 1 },
  { id: 'paid', label: 'Who is paying for it', when: 'Prospect scan', shows: 'How much coverage carries a paid marker. A low number means it can be brought back.', available: (s) => s.headline.posts > 0 },
  { id: 'channels', label: 'Who is writing about it', when: 'Prospect scan', shows: 'The channels that named the project, most-read first.', available: (s) => !!s.channels?.length },
  { id: 'room', label: 'The room', when: 'Prospect scan', shows: 'Channels on the subject that have never typed the name.', available: (s) => s.room.channels > 0 },
  { id: 'network', label: 'Where Holo Hive comes in', when: 'Prospect scan', shows: 'Our channels that cover the field and haven’t named them yet.', available: (s) => !!s.network && s.network.inField > 0 },
  { id: 'receipts', label: 'The receipts', when: 'Appendix', shows: 'The most-read posts, in the original Korean, with links.', available: (s) => s.receipts.length > 0 },
];

export const slideMeta = (id: SlideId) => SLIDES.find((x) => x.id === id)!;

export interface Angle {
  id: string;
  label: string;
  /** Why this story fits this project, from its numbers. */
  why: string;
  slides: SlideId[];
  recommended?: boolean;
}

const pct = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`);

/** The stories this project's numbers support, best fit first. */
export function anglesFor(s: KoreaScan, opts: { client?: boolean } = {}): Angle[] {
  const h = s.headline;
  const falling = h.changePct != null && h.changePct <= -20 && (h.fieldChangePct == null || h.changePct < h.fieldChangePct - 10);
  const rising = h.changePct != null && h.changePct >= 20 && (h.fieldChangePct == null || h.changePct > h.fieldChangePct);
  const bigRoom = s.room.channels > 0 && s.room.neverNamed / s.room.channels >= 0.5;
  const strongMix = s.mix.subject.score >= s.mix.field.score + 0.1;
  const farmHeavy = s.mix.subject.shares.farming >= s.mix.field.shares.farming + 10;
  const depthRank = s.depth.findIndex((d) => d.isSubject) + 1;

  const angles: Angle[] = [];
  if (falling) angles.push({
    id: 'losing-ground', label: 'Losing ground',
    why: `Coverage ${pct(h.changePct)} while the field moved ${pct(h.fieldChangePct)}. Show the drop honestly, then the way back in.`,
    slides: ['cover', 'momentum', 'movement', 'mix', 'room', 'network', 'receipts'],
  });
  if (rising) angles.push({
    id: 'momentum', label: 'Riding momentum',
    why: `Coverage ${pct(h.changePct)} against ${pct(h.fieldChangePct)} for the field. Show it’s real, spreading across channels, and where it goes next.`,
    slides: ['cover', 'momentum', 'share', 'reach', 'movement', 'network'],
  });
  if (bigRoom) angles.push({
    id: 'the-room', label: 'The room they haven’t reached',
    why: `${s.room.neverNamed} of ${s.room.channels} channels on ${s.field} have never named ${s.subject}${s.network?.openCount ? `, ${s.network.openCount} of them ours` : ''}.`,
    slides: ['cover', 'room', 'network', 'channels', 'share', 'depth'],
  });
  if (strongMix || farmHeavy) angles.push({
    id: 'quality', label: strongMix ? 'Quality over volume' : 'What the coverage is made of',
    why: strongMix
      ? `A quality score of ${s.mix.subject.score.toFixed(2)} against ${s.mix.field.score.toFixed(2)} for the field. Lead with what they’re getting, not how much.`
      : `${s.mix.subject.shares.farming}% of coverage is points and farming, against ${s.mix.field.shares.farming}% for the field. Show what the rest of the story could be.`,
    slides: ['cover', 'mix', 'reach', 'depth', 'paid', 'receipts'],
  });
  if (depthRank > 0 && depthRank <= 3 && (s.paid.share ?? 100) <= 20) angles.push({
    id: 'the-good', label: 'Korea already wants them',
    why: `${100 - (s.paid.share ?? 0)}% of coverage carries no paid marker and they rank ${depthRank} of ${s.depth.length} on readers per channel.`,
    slides: ['cover', 'paid', 'depth', 'channels', 'room', 'network'],
  });
  angles.push({
    id: 'client-weekly', label: 'Client weekly (Yano’s four)',
    why: 'The four templates in the order a client meets them: the field from day one, mix and reach from week two, momentum from week four.',
    slides: ['movement', 'mix', 'reach', 'momentum'],
  });
  angles.push({
    id: 'full', label: 'Full scan',
    why: 'Every slide the data supports, in reading order.',
    slides: ['cover', 'paid', 'depth', 'mix', 'reach', 'momentum', 'movement', 'share', 'channels', 'room', 'network', 'receipts'],
  });

  // A client's deck leads with Yano's four; a prospect's with whatever its numbers say.
  if (opts.client) angles.sort((a, b) => (a.id === 'client-weekly' ? -1 : b.id === 'client-weekly' ? 1 : 0));
  const usable = angles.map((a) => ({ ...a, slides: a.slides.filter((id) => slideMeta(id).available(s)) }));
  usable[0].recommended = true;
  return usable;
}

/** Keep only real, available slide ids, in order, without repeats. */
export function cleanSlides(ids: unknown, s?: KoreaScan): SlideId[] {
  const known = new Set(SLIDES.map((x) => x.id));
  const out: SlideId[] = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id === 'string' && known.has(id as SlideId) && !out.includes(id as SlideId) && (!s || slideMeta(id as SlideId).available(s))) out.push(id as SlideId);
  }
  return out;
}
