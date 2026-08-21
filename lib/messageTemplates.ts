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
  | 'tmpl_lineup_reminder_thursday'
  | 'tmpl_weekly_content_recap_header'
  | 'tmpl_kol_welcome';

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
    appended: 'The angle/KOL roster and a "Review on HHP" link are appended automatically.',
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
  /**
   * Korean onboarding message sent into a KOL's group chat the first time
   * that chat is linked to them. /api/telegram/send posts with
   * parse_mode HTML, so the editor's formatting toolbar works here — but
   * the built-in default is deliberately plain, and a literal < or & typed
   * into it will fail the send rather than appear.
   *
   * {kol} is available but the built-in default does not use it: the
   * message goes into the KOL's own group chat, where addressing them by
   * name reads oddly to a room that already knows who it is for.
   */
  tmpl_kol_welcome: {
    default: `안녕하세요! Holo Hive와 함께하게 되신 걸 환영해요. 시작 전에 봇으로 몇 가지만 세팅해주시면 돼요.

1. 입금 지갑 등록 (/wallet)
보수는 Arbitrum(ARB) 네트워크로 지급돼요. /wallet 뒤에 지갑 주소를 붙여서 채팅창에 보내주세요.
예시: /wallet 0x...
봇이 주소를 확인한 뒤 저장된 주소를 그대로 다시 보여드려요. 나중에 주소를 바꾸시려면 똑같이 /wallet로 새 주소를 보내고 Confirm만 눌러주시면 됩니다.

2. 콘텐츠 제출 (/submit)
포스팅 올리신 후에 채팅창에서 /submit 뒤에 올리신 포스트 링크만 넣어주시면 돼요. 캠페인 선택해서 제출하면 끝이라, 따로 채팅으로 링크 보내주실 필요 없어요.

3. 공유 딜 (Share Deal)
다른 크리에이터 포스트를 크리에이터님 채널에 공유하고 수익을 받는 기능도 있어요. 딜이 열리면 봇이 단체방으로 오퍼를 보내드리고, 공유 단가랑 마감 시간 확인하신 뒤에 Accept / Reject만 눌러주시면 됩니다. 선착순으로 진행되고 단가는 기본 포스팅 단가의 50%로 산정해 드려요. 포워딩 진행 의사가 있으시다면 채팅창에 /repost yes를 남겨주세요.

궁금한 점 있으면 편하게 알려주세요!`,
    vars: ['kol'],
    format: 'HTML',
    appended: 'Sent as-is. The operator can still edit this copy per-send before it goes out.',
  },
  tmpl_weekly_content_recap_header: {
    default: '<b>{campaign} Weekly Content Recap</b>',
    vars: ['campaign', 'week'],
    format: 'HTML',
    appended: 'The per-angle KOL list (posted only, each name linked to their content) is appended automatically.',
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
