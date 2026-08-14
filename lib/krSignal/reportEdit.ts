/**
 * KR Signal — editing a generated weekly report safely.
 *
 * The report is Telegram HTML in a fixed shape:
 *
 *   <b>$TICKER Weekly Report · Aug 3–9</b>
 *   <pre>…monospace body with ASCII bars…</pre>
 *
 * Letting an operator edit that markup directly is the obvious approach and
 * the wrong one: one unescaped `<` or unbalanced tag and Telegram rejects the
 * send with a parse error — at which point the report is late and the person
 * who edited it has no idea why. The `<pre>` block is also load-bearing, since
 * the volume bars only line up in a monospace context.
 *
 * So editing is decomposed instead. The operator edits *plain text* — a title
 * line and a body — and the HTML is rebuilt from those two, re-escaped, in the
 * exact shape the renderer emits. Invalid markup is unrepresentable, and the
 * layout survives by construction.
 */
import { escapeHtml } from '@/lib/telegramHtml';

export interface ReportParts {
  title: string;
  body: string;
}

/** Telegram HTML entities → the characters an operator should see and type. */
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
 * Split a rendered report back into editable plain-text parts.
 *
 * Parsing our own output with a regex is safe here in a way it wouldn't be for
 * arbitrary HTML: buildWeekly emits exactly one <b> title and one <pre> body,
 * and every interpolated value has already been escaped, so neither tag can
 * appear inside the other's content. Anything that doesn't match that shape
 * (a hand-written message, a future format) falls back to treating the whole
 * string as the body, which stays editable rather than erroring.
 */
export function parseReportHtml(html: string): ReportParts {
  const titleMatch = html.match(/<b>([\s\S]*?)<\/b>/i);
  const bodyMatch = html.match(/<pre>([\s\S]*?)<\/pre>/i);
  if (!bodyMatch) {
    return { title: '', body: unescape(html.replace(/<[^>]+>/g, '')) };
  }
  return {
    title: titleMatch ? unescape(titleMatch[1]) : '',
    body: unescape(bodyMatch[1]),
  };
}

/**
 * Rebuild sendable Telegram HTML from edited parts. Mirrors buildWeekly's
 * final line exactly — `<b>title</b>\n<pre>body</pre>` — so an edited report
 * is byte-for-byte the same shape as a generated one and renders identically
 * in the client's chat.
 */
export function buildReportHtml(parts: ReportParts): string {
  const title = parts.title.trim();
  const body = parts.body.replace(/\s+$/, '');
  const pre = `<pre>${escapeHtml(body)}</pre>`;
  return title ? `<b>${escapeHtml(title)}</b>\n${pre}` : pre;
}

/**
 * The HTML that should actually go to the client: the operator's edit when
 * there is one, else the generated render. Single source of this decision so
 * the send path, the review card and the in-app preview can never disagree
 * about which version is "the" report.
 */
export function effectiveHtml(row: { report_html?: string | null; edited_html?: string | null }): string {
  return (row.edited_html || row.report_html || '').trim();
}
