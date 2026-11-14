import { escapeHtml } from '@/lib/telegramHtml';
import type { LintFlag } from './llm';

/**
 * The review card posted to the Drafts topic.
 *
 * Never put rates, pricing, wallets or budget on it: the card is built only
 * from the draft itself, the lineup slot and the KOL's name and handle.
 */
export interface CardInput {
  draftId: string;
  version: number;
  matched: boolean;
  clientName: string | null;
  weekNumber: number | null;
  angleIndex: number | null;
  angleName: string | null;
  kolName: string;
  kolHandle: string | null;
  deadline: Date | null;
  bodyText: string | null;
  /** Line shown in place of media, e.g. "[media in the message above]". */
  mediaNote: string | null;
  docUrl: string | null;
  gloss: string | null;
  flags: LintFlag[];
  kolChatId: string;
  kolThreadId: number | null;
  sourceMessageId: number;
}

const CHUNK = 3800;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

/** "November 14th (in 2 days)", in Korea time. */
export function deadlineLabel(deadline: Date, now = new Date()): string {
  const k = new Date(deadline.getTime() + 9 * 3_600_000);
  const date = `${MONTHS[k.getUTCMonth()]} ${ordinal(k.getUTCDate())}`;
  const hours = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (hours < 0) return `${date} (passed)`;
  if (hours < 24) return `${date} (in ${Math.max(1, Math.round(hours))}h)`;
  const days = Math.round(hours / 24);
  return `${date} (in ${days} day${days === 1 ? '' : 's'})`;
}

/** Split raw text into pieces that each fit one message, breaking on lines where possible. */
function splitRaw(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Card as one or more HTML messages, each under Telegram's 4,096-character
 * cap. Buttons go on the last one.
 */
export function buildCardMessages(c: CardInput): string[] {
  const head: string[] = [];
  if (c.matched) {
    const bits = [`DRAFT v${c.version}`, c.clientName || 'Campaign'];
    if (c.weekNumber != null) bits.push(`Week ${c.weekNumber}`);
    if (c.angleIndex != null) bits.push(`Angle ${c.angleIndex}${c.angleName ? `: ${c.angleName}` : ''}`);
    head.push(`📝 <b>${escapeHtml(bits.join(' · '))}</b>`);
  } else {
    head.push('📝 <b>DRAFT · UNMATCHED</b>');
    head.push('No open lineup slot for this KOL. Needs a manual check.');
  }
  const kolBits = [`KOL: ${c.kolName}`];
  if (c.kolHandle) kolBits.push(`@${c.kolHandle}`);
  if (c.deadline) kolBits.push(`Deadline ${deadlineLabel(c.deadline)}`);
  head.push(escapeHtml(kolBits.join(' · ')));

  // Blocks: [title, raw body]. Bodies are split, titles never are.
  const blocks: Array<{ title: string; body: string }> = [];
  const original = [
    c.bodyText?.trim() || '',
    c.mediaNote || '',
    c.docUrl ? c.docUrl : '',
  ].filter(Boolean).join('\n');
  blocks.push({ title: 'KOREAN ORIGINAL', body: original || '[empty]' });
  blocks.push({ title: 'ENGLISH (auto)', body: c.gloss?.trim() || 'gloss unavailable' });

  const tail: string[] = [];
  if (c.flags.length) {
    tail.push(`⚠ <b>${c.flags.length} flag${c.flags.length === 1 ? '' : 's'}</b>`);
    for (const f of c.flags.slice(0, 8)) {
      const span = f.span.length > 120 ? `${f.span.slice(0, 117)}...` : f.span;
      tail.push(`• "${escapeHtml(span)}" (${escapeHtml(f.rule)})`);
    }
    if (c.flags.length > 8) tail.push(`• and ${c.flags.length - 8} more`);
  }

  const messages: string[] = [];
  let cur = head.join('\n');
  let curLen = cur.length;
  const push = (html: string, rawLen: number) => {
    if (curLen + rawLen + 2 > CHUNK && cur) {
      messages.push(cur);
      cur = ''; curLen = 0;
    }
    cur += (cur ? '\n' : '') + html;
    curLen += rawLen + 1;
  };
  for (const b of blocks) {
    push(`\n<b>${b.title}</b>`, b.title.length + 1);
    for (const piece of splitRaw(b.body, CHUNK - 200)) push(escapeHtml(piece), piece.length);
  }
  if (tail.length) {
    const tailHtml = `\n${tail.join('\n')}`;
    push(tailHtml, tailHtml.length);
  }
  if (cur) messages.push(cur);
  return messages;
}

export type InlineButton = { text: string; callback_data?: string; url?: string };

/** Link to the draft in the KOL group. Only supergroups have linkable messages. */
export function kolChatLink(chatId: string, threadId: number | null, messageId: number): string | null {
  if (!chatId.startsWith('-100')) return null;
  const internal = chatId.slice(4);
  return threadId
    ? `https://t.me/c/${internal}/${threadId}/${messageId}`
    : `https://t.me/c/${internal}/${messageId}`;
}

/**
 * Buttons for a pending card.
 *   clean          Approve            (one tap)
 *   flags present  Approve anyway     (second tap needed)
 *   no gloss       Approve (no gloss) (second tap needed)
 * `confirming` is the state after the first tap.
 */
export function cardKeyboard(c: {
  draftId: string; matched: boolean; flagCount: number; glossFailed: boolean;
  kolChatId: string; kolThreadId: number | null; sourceMessageId: number; confirming?: boolean;
}): InlineButton[][] {
  const rows: InlineButton[][] = [];
  if (c.matched) {
    const needsSecondTap = c.flagCount > 0 || c.glossFailed;
    const approve: InlineButton = c.confirming
      ? { text: '✅ Tap again to confirm', callback_data: `drf:a2:${c.draftId}` }
      : needsSecondTap
        ? { text: c.flagCount > 0 ? '✅ Approve anyway' : '✅ Approve (no gloss)', callback_data: `drf:a1:${c.draftId}` }
        : { text: '✅ Approve', callback_data: `drf:ap:${c.draftId}` };
    rows.push([approve, { text: '✏️ Request changes', callback_data: `drf:rc:${c.draftId}` }]);
  }
  const link = kolChatLink(c.kolChatId, c.kolThreadId, c.sourceMessageId);
  if (link) rows.push([{ text: '💬 Open KOL chat', url: link }]);
  return rows;
}

/** Messages the KOL receives. Wording is fixed by the spec. */
export function approveMessage(handle: string | null, kolName: string): string {
  return `${handle ? `@${handle}` : kolName} 님 초안 확인했습니다! 좋습니다, 바로 올려주셔도 됩니다 ^^\n\n포스팅 후 링크는 /submit 으로 한 번 부탁드려요~`;
}

export function changesMessage(handle: string | null, kolName: string, noteKo: string): string {
  return `${handle ? `@${handle}` : kolName} 님 초안 감사합니다! 몇 가지만 수정 부탁드려요~\n\n${noteKo}\n\n수정본은 /draft 로 다시 올려주시면 바로 확인드릴게요 ^^`;
}
