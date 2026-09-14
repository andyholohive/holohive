/**
 * KR Signal — editing a generated listings digest safely.
 *
 * Same problem as the weekly report (see reportEdit.ts), different shape. The
 * digest is line-oriented Telegram HTML:
 *
 *   🇰🇷 <b>Korea Listings · Week of Sep 7–13</b>
 *   ━━━━━━━━━━━━━
 *   Upbit + Bithumb · KRW listings · 4 new
 *   ━━━━━━━━━━━━━
 *   <b>$USELESS</b>  🇰🇷 Bithumb (KRW) · Sep 8
 *   Day-1 KR vol   ₩17.5B ≈ $13M
 *
 * Handing that markup to an operator is the obvious approach and the wrong
 * one: a stray `<` or an unclosed tag and Telegram refuses the send, at which
 * point the digest is late and whoever edited it has no idea why.
 *
 * So the same trick as the report — edit plain text, rebuild the HTML — with
 * one addition. The report has a single bold title, so bold could be implied
 * by position. The digest bolds every ticker line too, and losing that would
 * flatten a scannable list into a wall. Bold therefore round-trips through a
 * single visible marker, `*like this*`, and is the ONLY markup that survives:
 * everything else is escaped on the way back, so invalid markup stays
 * unrepresentable and the layout survives by construction.
 *
 * The separator rules, the emoji and the alignment spacing are all just text
 * and pass through untouched.
 */
import { escapeHtml } from '@/lib/telegramHtml';

/** Telegram HTML entities → what an operator should see and type. */
function unescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // &amp; last, so "&amp;lt;" round-trips to "&lt;" rather than "<".
    .replace(/&amp;/g, '&');
}

/**
 * Rendered digest → editable plain text.
 *
 * Bold becomes `*…*`. Any other tag is dropped rather than shown, because a
 * tag the editor cannot round-trip is worse than no tag: it would look
 * editable and then vanish on save.
 */
export function digestHtmlToText(html: string): string {
  return unescape(
    (html ?? '')
      .replace(/<b>([\s\S]*?)<\/b>/gi, '*$1*')
      .replace(/<\/?[^>]+>/g, ''),
  );
}

/**
 * Editable plain text → Telegram HTML.
 *
 * Escape first, then re-apply bold. Order matters: escaping afterwards would
 * turn the tags we just wrote back into visible `&lt;b&gt;`.
 *
 * An unpaired `*` is left as a literal asterisk rather than opening a tag that
 * never closes — a send-time parse error is exactly what this module exists to
 * prevent, and a stray asterisk in the digest is survivable.
 */
export function digestTextToHtml(text: string): string {
  const escaped = escapeHtml(text ?? '');
  return escaped.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
}

/**
 * Does this text round-trip cleanly?
 *
 * Used to warn before saving. It is not a correctness gate — an operator may
 * legitimately want a literal asterisk — but an unpaired marker almost always
 * means a half-finished edit, and catching it here is far cheaper than
 * noticing the digest rendered wrong after it went to a client.
 */
export function unpairedBoldMarkers(text: string): number {
  return (text ?? '')
    .split('\n')
    .reduce((n, line) => n + ((line.match(/\*/g) ?? []).length % 2), 0);
}
