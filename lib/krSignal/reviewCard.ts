/**
 * KR Signal — the review card posted to the ops chat.
 *
 * One renderer for both moments a human is asked to decide:
 *   • Saturday, when the report is generated ("here it is, approve to send")
 *   • Sunday, when the send window passes with nothing approved
 *     ("this did NOT go out — still want it?")
 *
 * Same card, different framing, identical buttons — so the second prompt is a
 * nudge rather than a new thing to learn. The full report is quoted verbatim
 * so the decision can be made without leaving Telegram; the preflight line is
 * what makes an unreachable destination visible BEFORE approval instead of
 * after a silent failure.
 */
import { escapeHtml } from '@/lib/telegramHtml';
import type { InlineButton } from './telegram';
import type { WeeklyReviewRow } from './store';
import { effectiveHtml } from './reportEdit';

/** Telegram hard-caps a message at 4096 chars. The card is the report plus a
 *  header, so trim the report rather than have the whole card bounce. */
const MAX_REPORT_CHARS = 3200;

export interface ReviewCardInput {
  clientName: string;
  weekEnding: string;
  row: Pick<WeeklyReviewRow, 'report_html' | 'edited_html' | 'preflight'>;
  /** 'generated' = the Saturday card. 'missed' = the Sunday "didn't send". */
  variant: 'generated' | 'missed';
  /** Set when the operator has edited the copy — worth flagging, since the
   *  approver may not be the person who edited. */
  edited?: boolean;
}

export function buildReviewCard(input: ReviewCardInput): string {
  const { clientName, weekEnding, row, variant, edited } = input;
  const report = effectiveHtml(row);
  const body = report.length > MAX_REPORT_CHARS
    ? `${report.slice(0, MAX_REPORT_CHARS)}\n… (truncated — open in HHP for the full report)`
    : report;

  const header = variant === 'missed'
    ? `⚠️ <b>NOT SENT — ${escapeHtml(clientName)}</b>\nThis week's report was never approved, so nothing went to the client at the usual time.`
    : `📋 <b>Review — ${escapeHtml(clientName)}</b>\nWeekly report for week ending ${escapeHtml(weekEnding)}. It will not send until approved.`;

  const pf = row.preflight;
  const destination = pf?.ok
    ? `✅ Destination reachable${pf.title ? ` — ${escapeHtml(String(pf.title))}` : ''}`
    : `🚫 <b>Destination unreachable</b> — ${escapeHtml(pf?.error || 'no chat resolved')}\n<i>Approving will fail until this is fixed in Korea Signal settings.</i>`;

  return [
    header,
    '',
    destination,
    edited ? '✏️ <i>Edited from the generated version.</i>' : '',
    '',
    '━━━━━━━━━━━━━',
    body,
  ].filter(Boolean).join('\n');
}

/** Buttons carry the row id, so a decision can never be applied to the wrong
 *  week — callback_data is capped at 64 bytes and `krw:approve:<uuid>` is 48. */
export function reviewButtons(rowId: string): InlineButton[][] {
  return [[
    { text: '✅ Approve & send', callback_data: `krw:approve:${rowId}` },
    { text: '✏️ Edit', callback_data: `krw:edit:${rowId}` },
    { text: '⏭ Skip', callback_data: `krw:skip:${rowId}` },
  ]];
}

/** What the card becomes once decided — the report stays quoted for the
 *  record, the buttons go away, and the outcome names who did it. */
export function decidedCard(
  original: string,
  outcome: 'sent' | 'skipped' | 'failed',
  byName: string | null,
  detail?: string
): string {
  const stamp = {
    sent: `✅ <b>Sent to client</b>${byName ? ` by ${escapeHtml(byName)}` : ''}`,
    skipped: `⏭ <b>Skipped</b>${byName ? ` by ${escapeHtml(byName)}` : ''} — not sent this week`,
    failed: `🚫 <b>Send failed</b>${detail ? ` — ${escapeHtml(detail)}` : ''}`,
  }[outcome];
  return `${stamp}\n\n${original}`;
}
