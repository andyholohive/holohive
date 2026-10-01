/**
 * The short weekly Telegram message that points a client at their Korea brief.
 *
 * Proposed replacement for the 17-number weekly report: the verdict, the one
 * thing to do, and a button. The numbers live on the brief page. Built from
 * the same KoreaSummary as the page so the two can never disagree.
 *
 * Returns Telegram HTML (parse_mode "HTML" — only <b>, <i>, <a> etc.), the
 * button, and what Telegram's link preview will show. The team preview
 * renders exactly this, so what you approve is what gets sent.
 *
 * Not wired into the bot yet: approveAndSend still sends the long report with
 * the brief button under it. Switching means sending `html` here instead.
 */

import type { KoreaSummary } from './summary';

export interface BriefTelegramMessage {
  html: string;
  button: { text: string; url: string } | null;
  /** Telegram builds this card from the page's Open Graph tags. */
  linkPreview: { site: string; title: string; description: string };
}

export const BRIEF_BUTTON_TEXT = '📖 Read this week’s Korea brief';

export function buildBriefTelegramMessage(s: KoreaSummary, briefUrl: string | null): BriefTelegramMessage {
  const week = s.week ? ` · ${esc(s.week.label)}` : '';
  const html = [
    `🇰🇷 <b>Korea this week${week}</b>`,
    '',
    `<b>${esc(s.verdict.label)}</b> · ${esc(s.verdict.headline)}`,
    '',
    `<b>To do:</b> ${esc(s.action.text)}`,
  ].join('\n');
  return {
    html,
    button: briefUrl ? { text: BRIEF_BUTTON_TEXT, url: briefUrl } : null,
    // Mirrors generateMetadata in app/public/korea/[token]/page.tsx.
    linkPreview: { site: 'Holo Hive', title: s.verdict.headline, description: `To do: ${s.action.text}` },
  };
}

/** Telegram HTML needs only &, < and > escaped. */
function esc(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
