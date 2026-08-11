import React from 'react';

/**
 * Light formatting for client call notes.
 *
 * [2026-08-11] Call note bodies are free text typed by the team and posted
 * into a client's Telegram group. The send used to escape the whole string
 * and post it with parse_mode HTML, so nothing could ever be bold and a
 * pasted link stayed inert — while `<b>x</b>` arrived literally as
 * `&lt;b&gt;x&lt;/b&gt;`.
 *
 * Rather than let HTML through (this is untrusted input on a client-facing
 * channel), notes accept a small markdown subset that we translate:
 *
 *     **bold**        _italic_        [text](https://…)
 *
 * ORDER MATTERS. The input is parsed into nodes FIRST, then each text node
 * is escaped, then tags are emitted. Escaping the raw string and pattern-
 * matching afterwards would let a crafted note inject markup — the whole
 * reason the blanket escape existed.
 *
 * Telegram's HTML mode accepts a fixed tag set (b, i, u, s, a, code, pre,
 * blockquote, tg-spoiler, tg-emoji) and rejects the message outright
 * otherwise. Notably it has NO list tags, which is why bullets stay literal
 * "• " text and aren't part of this subset.
 *
 * Anything that doesn't parse cleanly falls back to its literal source text,
 * so the worst case is today's behaviour — you see the asterisks — never a
 * broken message or a dropped sentence.
 */

export type CallNoteNode =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'link'; value: string; href: string };

/**
 * Link text stops at `]`, URL stops at whitespace or `)`. Both are
 * single-line by design — a marker left unclosed at end of line reads as
 * a typo, not as formatting that swallows the rest of the note.
 *
 * Bold is checked before italic so `**x**` isn't seen as an empty italic.
 */
const TOKEN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|_([^_\n]+)_/g;

/** http/https only — blocks `javascript:` and friends. */
function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseCallNote(src: string): CallNoteNode[] {
  const out: CallNoteNode[] = [];
  const text = src ?? '';
  let last = 0;
  TOKEN.lastIndex = 0;

  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });

    const [whole, linkText, linkUrl, bold, italic] = m;
    if (linkText !== undefined) {
      const href = safeHref(linkUrl);
      // A bad or non-http URL is shown as the literal source rather than
      // silently dropped — the author can see what they typed and fix it.
      if (href) out.push({ type: 'link', value: linkText, href });
      else out.push({ type: 'text', value: whole });
    } else if (bold !== undefined) {
      out.push({ type: 'bold', value: bold });
    } else {
      out.push({ type: 'italic', value: italic });
    }
    last = m.index + whole.length;
  }

  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Attribute context needs quotes escaped too. */
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;');

/**
 * Serialize to the HTML subset Telegram's parse_mode=HTML accepts.
 * Every text value passes through escapeHtml on the way out.
 */
export function toTelegramHtml(src: string): string {
  return parseCallNote(src)
    .map(n => {
      switch (n.type) {
        case 'bold': return `<b>${escapeHtml(n.value)}</b>`;
        case 'italic': return `<i>${escapeHtml(n.value)}</i>`;
        case 'link': return `<a href="${escapeAttr(n.href)}">${escapeHtml(n.value)}</a>`;
        default: return escapeHtml(n.value);
      }
    })
    .join('');
}

/**
 * Same tree, rendered for the app. React escapes text on its own, so nothing
 * here is dangerouslySetInnerHTML — the tags are real elements.
 */
export function renderCallNote(src: string): React.ReactNode[] {
  return parseCallNote(src).map((n, i) => {
    switch (n.type) {
      case 'bold':
        return React.createElement('strong', { key: i, className: 'font-semibold' }, n.value);
      case 'italic':
        return React.createElement('em', { key: i }, n.value);
      case 'link':
        return React.createElement(
          'a',
          {
            key: i,
            href: n.href,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-brand underline underline-offset-2 hover:text-brand-deep',
          },
          n.value,
        );
      default:
        return React.createElement(React.Fragment, { key: i }, n.value);
    }
  });
}
