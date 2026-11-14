/**
 * /draft configuration, read from app_settings so ops can change it without
 * a redeploy.
 *
 *   draft_mode             'off' (default) | 'test' | 'live'
 *   draft_test_chat_ids    comma-separated KOL chat ids allowed while in 'test'
 *   drafts_chat_id         review chat (HH Bot Feed)
 *   drafts_thread_id       Drafts topic in that chat
 *   draft_cancel_window_s  seconds between a decision and the send (default 60, 0 disables)
 *   draft_nudge_hours      hours before a pending card is nudged (default 4)
 *   draft_nudge_tags       text prepended to the nudge, e.g. "@jdot @jeremyin"
 *
 * 'off' means the command does nothing at all. 'test' means it only works in
 * the listed chats. Nothing reaches a real KOL group until someone sets 'live'.
 */
export interface DraftConfig {
  mode: 'off' | 'test' | 'live';
  testChatIds: Set<string>;
  reviewChatId: string | null;
  reviewThreadId: number | null;
  cancelWindowS: number;
  nudgeHours: number;
  nudgeTags: string;
}

const KEYS = [
  'draft_mode', 'draft_test_chat_ids', 'drafts_chat_id', 'drafts_thread_id',
  'draft_cancel_window_s', 'draft_nudge_hours', 'draft_nudge_tags',
];

export async function getDraftConfig(sb: any): Promise<DraftConfig> {
  const { data, error } = await sb.from('app_settings').select('key, value').in('key', KEYS);
  // A failed read must not look like "live": fall back to off.
  if (error) console.error('[/draft] config read failed:', error.message);
  const m = new Map<string, string>(((data ?? []) as Array<{ key: string; value: string | null }>).map(r => [r.key, (r.value ?? '').trim()]));
  const mode = m.get('draft_mode');
  const num = (k: string, d: number) => {
    const v = m.get(k);
    const n = v === undefined || v === '' ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  const thread = Number(m.get('drafts_thread_id'));
  return {
    mode: !error && (mode === 'test' || mode === 'live') ? mode : 'off',
    testChatIds: new Set((m.get('draft_test_chat_ids') || '').split(',').map(s => s.trim()).filter(Boolean)),
    reviewChatId: m.get('drafts_chat_id') || null,
    reviewThreadId: Number.isFinite(thread) && thread > 0 ? thread : null,
    cancelWindowS: num('draft_cancel_window_s', 60),
    nudgeHours: num('draft_nudge_hours', 4),
    nudgeTags: m.get('draft_nudge_tags') || '',
  };
}

/** Whether /draft may read from and write to this KOL chat right now. */
export function draftAllowedInChat(cfg: DraftConfig, chatId: string | number): boolean {
  if (cfg.mode === 'live') return true;
  if (cfg.mode === 'test') return cfg.testChatIds.has(String(chatId));
  return false;
}
