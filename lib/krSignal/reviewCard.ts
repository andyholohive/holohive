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
    // `detail` is optional here: the weekly report goes to exactly one client
    // and has nothing to add, while the listings digest fans out to several
    // and needs to say how many landed.
    sent: `✅ <b>Sent to client</b>${byName ? ` by ${escapeHtml(byName)}` : ''}${detail ? ` — ${escapeHtml(detail)}` : ''}`,
    skipped: `⏭ <b>Skipped</b>${byName ? ` by ${escapeHtml(byName)}` : ''} — not sent this week`,
    failed: `🚫 <b>Send failed</b>${detail ? ` — ${escapeHtml(detail)}` : ''}`,
  }[outcome];
  return `${stamp}\n\n${original}`;
}

/**
 * The Saturday listings-digest card (spec §7.B).
 *
 * Separate from buildReviewCard because the two are reviewed differently: a
 * weekly report belongs to one client and its preflight is one destination,
 * while the digest is one message bound for several. The preflight therefore
 * has to list every recipient, since approving sends to all of them at once
 * and an unreachable chat among them should be visible before that, not after.
 */
export interface ListingDigestCardInput {
  weekLabel: string;
  html: string;
  /** One entry per digest client: { name, chat_id, ok, error }. */
  preflight: Array<{ name?: string | null; ok?: boolean; error?: string | null }>;
  listingCount: number;
}

export function buildListingDigestCard(input: ListingDigestCardInput): string {
  const { weekLabel, html, preflight, listingCount } = input;
  const body = html.length > MAX_REPORT_CHARS
    ? `${html.slice(0, MAX_REPORT_CHARS)}\n… (truncated — open in HHP for the full digest)`
    : html;

  const reachable = preflight.filter(p => p.ok);
  const broken = preflight.filter(p => !p.ok);

  const recipients = preflight.length === 0
    ? '⚠️ <b>No recipients</b> — no active client has the listings digest enabled.'
    : `Goes to ${reachable.length} of ${preflight.length}: ${
        reachable.map(p => escapeHtml(p.name ?? 'unknown')).join(', ') || '—'
      }`;
  const problems = broken.length
    ? `\n⚠️ Unreachable: ${broken.map(p => `${escapeHtml(p.name ?? 'unknown')} (${escapeHtml(p.error ?? 'unknown error')})`).join(', ')}`
    : '';

  const header = `📋 <b>Review — Korea listings digest</b>\n${escapeHtml(weekLabel)} · ${listingCount} listing${listingCount === 1 ? '' : 's'}. It will not send until approved.\n${recipients}${problems}`;

  return `${header}\n\n———\n\n${body}`;
}

/** Distinct callback prefix from the weekly card so the webhook can tell a
 *  digest decision from a report decision. */
export function listingDigestButtons(rowId: string): InlineButton[][] {
  return [[
    { text: '✅ Approve & send', callback_data: `krd:approve:${rowId}` },
    { text: '⏭ Skip', callback_data: `krd:skip:${rowId}` },
  ]];
}
