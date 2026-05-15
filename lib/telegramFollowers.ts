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
 * Fetch a public channel's current subscriber count via the Telegram
 * Bot API.
 *
 * Single API call to getChatMemberCount — returns the integer
 * directly. Earlier version did a getChat sanity-check first, but at
 * ~450ms per Telegram round-trip that doubled the cron's runtime
 * past the Vercel function limit on the full roster. Dropped because
 * getChatMemberCount returns the same "Bad Request: chat not found"
 * error message when the channel doesn't exist, so we lose nothing
 * by skipping the validation call.
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
  /** Reserved for future use — earlier version captured channel
   *  title but the extra API call wasn't worth the latency. Kept
   *  in the interface so the cron's notes string doesn't need to
   *  change when/if we re-add it. */
  channel_title: string | null;
}

export async function fetchTelegramFollowerCount(
  username: string,
  botToken: string,
): Promise<TelegramFollowerResult> {
  const chatId = `@${username}`;
  const apiBase = `https://api.telegram.org/bot${botToken}`;

  // Single API call — getChatMemberCount alone is enough. Earlier
  // version called getChat first for a "sanity check + title" but
  // that doubled the per-KOL latency (~900ms vs ~450ms) and pushed
  // the cron over Vercel's 60s function limit on the full 85-KOL
  // run. The error message from getChatMemberCount is identical to
  // getChat's when a channel doesn't exist ("Bad Request: chat not
  // found"), so we lose nothing by dropping the second call. Title
  // is no longer captured — the notes field on the snapshot just
  // omits it.
  try {
    const countRes = await fetch(`${apiBase}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`);
    const countData = await countRes.json();
    if (!countData.ok) {
      return {
        username,
        follower_count: null,
        error: countData.description || `getChatMemberCount failed (${countRes.status})`,
        channel_title: null,
      };
    }
    const count = Number(countData.result);
    if (!Number.isFinite(count) || count < 0) {
      return {
        username,
        follower_count: null,
        error: `Unparseable count: ${countData.result}`,
        channel_title: null,
      };
    }
    return {
      username,
      follower_count: count,
      error: null,
      channel_title: null,
    };
  } catch (err) {
    return {
      username,
      follower_count: null,
      error: err instanceof Error ? err.message : 'getChatMemberCount threw',
      channel_title: null,
    };
  }
}
