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

/**
 * Cap on retry-after waits — anything longer than this and we just
 * give up rather than burn the function-execution budget on one KOL.
 * 30s comfortably covers Telegram's typical "retry after 9-19" range
 * we saw on the first prod run; longer waits indicate a deeper limit
 * we won't escape inside the same function invocation anyway.
 */
const MAX_RETRY_AFTER_SECONDS = 30;

export async function fetchTelegramFollowerCount(
  username: string,
  botToken: string,
): Promise<TelegramFollowerResult> {
  const chatId = `@${username}`;
  const apiBase = `https://api.telegram.org/bot${botToken}`;

  // Single API call — getChatMemberCount alone is enough. Earlier
  // version called getChat first for a "sanity check + title" but
  // that doubled the per-KOL latency. The error message from
  // getChatMemberCount is identical to getChat's when a channel
  // doesn't exist ("Bad Request: chat not found"), so we lose
  // nothing by dropping the second call.
  //
  // Retry-after handling: when Telegram returns a 429, the response
  // includes parameters.retry_after with the suggested wait. We
  // honor it once, capped at MAX_RETRY_AFTER_SECONDS, then bail.
  // First-run on 85 KOLs (2026-05-15) hit retry-after values of
  // 9-19s; the 30s cap leaves headroom for slightly punitive
  // limiter responses without blowing the cron's function budget.
  return await fetchWithRetry(apiBase, chatId, username, /* alreadyRetried */ false);
}

async function fetchWithRetry(
  apiBase: string,
  chatId: string,
  username: string,
  alreadyRetried: boolean,
): Promise<TelegramFollowerResult> {
  try {
    const res = await fetch(`${apiBase}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`);
    const data = await res.json();

    if (!data.ok) {
      // Telegram tells us exactly how long to wait on a 429. Honor
      // it once. The single-retry cap prevents an unbounded loop if
      // their limiter is genuinely over.
      const retryAfter: unknown = data.parameters?.retry_after;
      const isRateLimit = res.status === 429 || (typeof retryAfter === 'number');
      if (isRateLimit && !alreadyRetried && typeof retryAfter === 'number' && retryAfter <= MAX_RETRY_AFTER_SECONDS) {
        // +1 second buffer — Telegram's clock isn't ours and being
        // off by even a millisecond at the boundary triggers another
        // 429. The buffer is cheaper than a wasted retry.
        await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
        return fetchWithRetry(apiBase, chatId, username, /* alreadyRetried */ true);
      }
      return {
        username,
        follower_count: null,
        error: data.description || `getChatMemberCount failed (${res.status})`,
        channel_title: null,
      };
    }

    const count = Number(data.result);
    if (!Number.isFinite(count) || count < 0) {
      return {
        username,
        follower_count: null,
        error: `Unparseable count: ${data.result}`,
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
