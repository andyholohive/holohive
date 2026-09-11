import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

/**
 * Operator DMs — alerts that belong to one person, not to the team room.
 *
 * [2026-09-11, Andy] The cron health sweep and the daily task-alert summary
 * were both going to the shared terminal chat. They are operator alerts: a
 * gateway timeout on KR_SIGNAL_LISTINGS or a count of overdue tasks needs one
 * person to act, and posting it to the room turns a to-do into noise everyone
 * scrolls past. Both now DM Andy.
 *
 * The chat id is resolved from the `users` row rather than hardcoded, so it
 * follows the account if his Telegram changes. `TELEGRAM_ANDY_CHAT_ID`
 * overrides it for environments with no database access.
 *
 * Deliberately no fallback to the terminal chat. The instruction was that these
 * do not go there, and a "helpful" fallback would quietly reinstate exactly the
 * behaviour being removed. A failure to resolve logs loudly and returns false.
 */

const OPERATOR_EMAIL = 'andy@holohive.io';

let cached: { id: string | null; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

async function operatorChatId(): Promise<string | null> {
  const override = process.env.TELEGRAM_ANDY_CHAT_ID;
  if (override) return override;

  if (cached && Date.now() - cached.at < TTL_MS) return cached.id;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('email', OPERATOR_EMAIL)
      .maybeSingle();

    const id = (data as { telegram_id?: string | null } | null)?.telegram_id ?? null;
    cached = { id, at: Date.now() };
    return id;
  } catch (err) {
    console.error('[telegramDm] could not resolve operator chat id:', err);
    return null;
  }
}

/**
 * DM the operator. Returns false (and logs) rather than falling back to a
 * shared chat, so a misconfiguration is visible instead of being papered over.
 */
export async function sendOperatorDm(
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
): Promise<boolean> {
  const chatId = await operatorChatId();
  if (!chatId) {
    console.error(
      `[telegramDm] no telegram_id for ${OPERATOR_EMAIL} and no TELEGRAM_ANDY_CHAT_ID set — alert not delivered:`,
      text.slice(0, 120),
    );
    return false;
  }
  return TelegramService.sendToChat(chatId, text, parseMode);
}
