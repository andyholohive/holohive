/**
 * Telegram message templates — per Andy 2026-07-06.
 *
 * Every notification surfaced on /admin/telegram-comm has an editable
 * message template stored in app_settings under a tmpl_* key. Unset /
 * empty → the built-in default below, so clearing a template is always
 * safe. Senders call getTemplate() + renderTemplate(); the admin page
 * renders a MessageTemplateEditor per section from TEMPLATE_META.
 *
 * Variables use {name} syntax. Unknown {tokens} are left as-is so a
 * typo shows up literally in the test message instead of vanishing.
 * Callers pass values pre-escaped for the template's parse mode
 * (escapeHtml for HTML templates; Markdown templates get raw text).
 *
 * Isomorphic on purpose — imported by both API routes and the client
 * admin page. No server-only imports here.
 */

export type TemplateKey =
  | 'tmpl_lineup_proposed_dm'
  | 'tmpl_lineup_proposed_broadcast'
  | 'tmpl_lineup_confirmed_header'
  | 'tmpl_spa_header'
  | 'tmpl_content_review_card'
  | 'tmpl_lineup_reminder_friday'
  | 'tmpl_lineup_reminder_monday'
  | 'tmpl_lineup_reminder_thursday';

export interface TemplateMeta {
  /** Built-in message used when the app_settings row is unset/empty. */
  default: string;
  /** {variables} available in this template, without braces. */
  vars: string[];
  /** Telegram parse mode the sender uses for this message. */
  format: 'HTML' | 'Markdown';
  /** What the sender appends after the template (not editable). */
  appended?: string;
}

export const TEMPLATE_META: Record<TemplateKey, TemplateMeta> = {
  tmpl_lineup_proposed_dm: {
    default: '<b>{campaign}</b>\nWeek {week} lineup proposed for your review.',
    vars: ['campaign', 'week'],
    format: 'HTML',
    appended: 'A "Review on HHP" link is appended automatically.',
  },
  tmpl_lineup_proposed_broadcast: {
    default: '<b>{campaign}</b>\nWeek {week} lineup proposed for review.',
    vars: ['campaign', 'week'],
    format: 'HTML',
    appended: 'A "Review on HHP" link is appended automatically.',
  },
  tmpl_lineup_confirmed_header: {
    default: '*{campaign}* Week {week} Lineup Confirmed',
    vars: ['campaign', 'week', 'by'],
    format: 'Markdown',
    appended: 'The angle/KOL roster and "Confirmed by" footer are appended automatically.',
  },
  tmpl_spa_header: {
    default: '<b>{campaign}</b>, post live\n<b>{kol}</b> just posted.',
    vars: ['campaign', 'kol'],
    format: 'HTML',
    appended: 'The weekly progress breakdown (N of M live, quota status) is appended automatically.',
  },
  tmpl_content_review_card: {
    default:
      '<b>New content submission</b>\n'
      + 'KOL: <b>{kol}</b>\n'
      + 'Campaign: {campaign}\n'
      + 'Type: {type} · {platform}\n'
      + 'Link: {link}\n'
      + 'Submitted: {submitted}',
    vars: ['kol', 'campaign', 'type', 'platform', 'link', 'submitted'],
    format: 'HTML',
    appended: 'Approve / Reject buttons are attached automatically.',
  },
  tmpl_lineup_reminder_friday: {
    default: '⏰ <b>Lineup deadline — Friday check</b>\nNext week\'s lineup (week of {week}) not yet proposed:',
    vars: ['week'],
    format: 'HTML',
    appended: 'The list of offending campaigns is appended automatically.',
  },
  tmpl_lineup_reminder_monday: {
    default: '⏰ <b>Lineup deadline — Monday check</b>\nThis week\'s lineup (week of {week}) not yet approved:',
    vars: ['week'],
    format: 'HTML',
    appended: 'The list of offending campaigns is appended automatically.',
  },
  tmpl_lineup_reminder_thursday: {
    default: '⏰ <b>Lineup deadline — Thursday check</b>\nThis week\'s lineup (week of {week}) not fully posted:',
    vars: ['week'],
    format: 'HTML',
    appended: 'The list of campaigns with unposted KOLs is appended automatically.',
  },
};

/**
 * Read a template from app_settings, falling back to the built-in
 * default when the row is missing or empty. Read failures also fall
 * back — a broken settings read must never block a notification.
 */
export async function getTemplate(supabase: any, key: TemplateKey): Promise<string> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    const value = (data?.value as string | null | undefined) ?? '';
    return value.trim() ? value : TEMPLATE_META[key].default;
  } catch {
    return TEMPLATE_META[key].default;
  }
}

/** Substitute {name} tokens. Unknown tokens are left untouched. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match,
  );
}
