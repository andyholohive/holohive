/**
 * Helpers to auto-pull follower counts for KOLs whose master_kols.link
 * is a public Telegram channel (`https://t.me/<username>`). Used by
 * the monthly snapshot cron — see app/api/cron/snapshot-tg-followers.
 *
 * Why follower-count-only: the team confirmed (May 2026) they only
 * need follower counts at this stage, not engagement metrics. That
 * unlocks the FREE Telegram Bot API path:
 *   - getChat (or getChatMemberCount) works on any PUBLIC channel
 *     just by passing `@<username>` as chat_id, regardless of bot
 *     membership.
 *   - No vendor cost, no rate-limit pain at our volume (~85 channels/
 *     month, well under the 30/sec global limit).
 *
 * Engagement metrics (avg_views_per_post, posting_frequency) would
 * require either bot-membership-as-admin (not realistic for KOL
 * channels) or a paid analytics vendor (TGStat etc.) — explicitly
 * deferred until/if the team needs them. The Score formula's Channel
 * Health dimension just stays null in the meantime; kolScoringEngine
 * redistributes its weight to the active dimensions.
 */

/**
 * Pull the channel @username out of a t.me URL.
 *
 * Accepts:
 *   https://t.me/username
 *   https://t.me/username/         (trailing slash)
 *   t.me/username                  (no scheme)
 *   https://t.me/s/username        (web-preview path; strip the /s/)
 *
 * Rejects (returns null):
 *   https://t.me/+abc123           (private invite — no auto-pull possible)
 *   https://t.me/joinchat/abc123   (legacy private invite)
 *   anything not matching t.me/<word>
 *
 * 100% of the active roster's TG links matched the public format as
 * of the 2026-05-15 audit (85/85), but defensive parsing here so we
 * fail soft if a private link gets added later.
 */
export function parseTelegramChannelUsername(link: string | null): string | null {
  if (!link) return null;
  const trimmed = link.trim();

  // Bail on private-invite formats — these need bot membership we don't have.
  if (/t\.me\/(\+|joinchat\/)/i.test(trimmed)) return null;

  // Match `t.me/<username>` (optionally `t.me/s/<username>` for web previews).
  // \w matches [A-Za-z0-9_], which is exactly Telegram's username char set.
  const match = trimmed.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]+)/i);
  if (!match) return null;
  return match[1];
}

/**
 * Telegram Bot API response for getChat on a channel. Trimmed to the
 * fields we actually use; full shape is at
 * https://core.telegram.org/bots/api#chat
 */
interface TelegramChatResponse {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

/**
 * Fetch a public channel's current subscriber count via the Telegram
 * Bot API. Two-call sequence:
 *
 *   1. getChat — confirms the channel exists + we can see it. Returns
 *      type/title metadata; we use this to filter out invalid links.
 *   2. getChatMemberCount — returns the actual subscriber number.
 *
 * Done as two calls because getChat alone doesn't return member_count
 * for channels (only for chats the bot is a member of).
 *
 * Returns null on any failure — caller logs + skips. Common failures:
 *   - channel renamed (404 on @oldusername)
 *   - channel deleted
 *   - bot token missing/invalid (404 on the bot endpoint itself)
 *   - rate limit (rare at our volume but the API will 429)
 */
export interface TelegramFollowerResult {
  username: string;
  follower_count: number | null;
  /** Populated when something went wrong; null on success. */
  error: string | null;
  /** Telegram's channel title — useful for the operator log so you
   *  can spot "wait, that's not the right channel" mismatches. */
  channel_title: string | null;
}

export async function fetchTelegramFollowerCount(
  username: string,
  botToken: string,
): Promise<TelegramFollowerResult> {
  const chatId = `@${username}`;
  const apiBase = `https://api.telegram.org/bot${botToken}`;

  // Step 1: getChat for sanity check + title.
  let chatTitle: string | null = null;
  try {
    const chatRes = await fetch(`${apiBase}/getChat?chat_id=${encodeURIComponent(chatId)}`);
    const chatData = await chatRes.json();
    if (!chatData.ok) {
      return {
        username,
        follower_count: null,
        error: chatData.description || `getChat failed (${chatRes.status})`,
        channel_title: null,
      };
    }
    const chat = chatData.result as TelegramChatResponse;
    chatTitle = chat.title || null;
    // Defensive: if Telegram returns something other than a channel
    // (e.g. "supergroup") it's still queryable by member count, so we
    // don't reject. We only reject for type=private which means the
    // bot can't see it.
    if (chat.type === 'private') {
      return {
        username,
        follower_count: null,
        error: 'Channel is private',
        channel_title: chatTitle,
      };
    }
  } catch (err) {
    return {
      username,
      follower_count: null,
      error: err instanceof Error ? err.message : 'getChat threw',
      channel_title: null,
    };
  }

  // Step 2: getChatMemberCount for the actual number.
  try {
    const countRes = await fetch(`${apiBase}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`);
    const countData = await countRes.json();
    if (!countData.ok) {
      return {
        username,
        follower_count: null,
        error: countData.description || `getChatMemberCount failed (${countRes.status})`,
        channel_title: chatTitle,
      };
    }
    const count = Number(countData.result);
    if (!Number.isFinite(count) || count < 0) {
      return {
        username,
        follower_count: null,
        error: `Unparseable count: ${countData.result}`,
        channel_title: chatTitle,
      };
    }
    return {
      username,
      follower_count: count,
      error: null,
      channel_title: chatTitle,
    };
  } catch (err) {
    return {
      username,
      follower_count: null,
      error: err instanceof Error ? err.message : 'getChatMemberCount threw',
      channel_title: chatTitle,
    };
  }
}
