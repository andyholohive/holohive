/**
 * Telegram post metrics — views, reactions and the posted time from a public
 * channel post's embed page, and the one place that writes them onto a contents row.
 *
 * Extracted from app/api/cron/refresh-telegram-metrics [2026-10-19] so the
 * same fetch + monotonic guard runs in three places:
 *   - the daily cron (every eligible post, 48h+ after it went live),
 *   - the moment a team member pastes a link (api/contents/[id]/fetch-metrics),
 *   - the TG bot's approval path (createApprovedContentsRow).
 * The audit showed ops typing ~600 of these numbers a month by hand, mostly
 * before the cron's first pass reached the post — this closes that gap.
 *
 * No API key: Telegram serves `https://t.me/<channel>/<id>?embed=1&mode=tme`
 * as plain HTML with the counts in it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const TG_URL_REGEX = /t\.me\/([A-Za-z0-9_]+)\/(\d+)/i;
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = 'Mozilla/5.0 (compatible; Holo Hive-MetricsBot/1.0; +https://app.holohive.io)';

/** Parse Telegram's display format: "1.2K", "5.4M", "847", "12,345". Null when unparseable. */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/[,\s]/g, '');
  if (!trimmed) return null;
  const match = trimmed.match(/^([\d.]+)([KkMmBb])?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return null;
  const suffix = match[2]?.toUpperCase();
  if (suffix === 'K') return Math.round(num * 1_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

export const isTelegramPostUrl = (url: string | null | undefined) => !!url && TG_URL_REGEX.test(url);

/**
 * Fetch one post's embed HTML and parse view + reaction counts. Null when the
 * URL is malformed, the fetch fails, or the page carries no metrics (private
 * channel, deleted post).
 */
export async function fetchTelegramMetrics(url: string): Promise<{ views: number | null; reactions: number | null; postedAt: string | null } | null> {
  const match = url.match(TG_URL_REGEX);
  if (!match) return null;
  const [, channel, msgId] = match;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://t.me/${channel}/${msgId}?embed=1&mode=tme`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Views: <span class="tgme_widget_message_views">1.2K</span>
    const viewsMatch = html.match(/<span[^>]*class="[^"]*tgme_widget_message_views[^"]*"[^>]*>([^<]+)<\/span>/i);
    const views = viewsMatch ? parseCount(viewsMatch[1]) : null;
    // Reactions: one <span class="tgme_reaction"> per emoji. The count used to
    // sit in a tgme_reaction_count span; since at least 2026-10 it is bare text
    // after the emoji markup (<i class="emoji">…</i>2). Strip the tags inside
    // each reaction span and read what's left, which handles both layouts.
    let reactions: number | null = null;
    const re = /<span[^>]*class="[^"]*\btgme_reaction\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      // After stripping tags the emoji's fallback glyph is still text ("❤2"), so
      // read the number at the end rather than the whole string.
      const tail = m[1].replace(/<[^>]*>/g, '').match(/([\d.,]+\s*[KkMmBb]?)\s*$/);
      const n = tail ? parseCount(tail[1]) : null;
      if (n !== null) reactions = (reactions ?? 0) + n;
    }
    // Posted time: <time datetime="2026-10-17T11:32:15+00:00"> in the footer.
    const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"/i);
    const postedAt = timeMatch && Number.isFinite(Date.parse(timeMatch[1])) ? new Date(timeMatch[1]).toISOString() : null;
    return { views, reactions, postedAt };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Views settle over the first two days; before that a reading is noise (team rule, 2026-05-27). */
export const METRICS_MIN_AGE_HOURS = 48;

export interface ApplyResult {
  ok: boolean;
  /** 'too_new': the post is under METRICS_MIN_AGE_HOURS old — date filled, metrics left for the daily job. */
  reason?: 'not_telegram' | 'not_found' | 'no_metrics' | 'write_failed' | 'too_new';
  views: number | null;
  reactions: number | null;
  /** Telegram's own post time, when the embed carried one. */
  postedAt: string | null;
  /** When the daily job will first pull metrics for a too-new post. */
  eligibleAt: string | null;
  /** Fields actually written (the monotonic guard may keep the stored number). */
  updated: Partial<{ impressions: number; likes: number; activation_date: string }>;
}

/**
 * Fetch and write metrics for one contents row. Monotonic: a field is only
 * written when the fetched number is HIGHER than what's stored — views and
 * reactions never fall in real life, so a lower number is a parse failure or
 * a stale CDN page, and a higher hand-typed number is never overwritten.
 *
 * Respects the 48h rule [Quazo 2026-10-20]: a post younger than
 * METRICS_MIN_AGE_HOURS (by Telegram's own timestamp) gets its date filled
 * but NO metrics — the daily job pulls them once it's old enough, so nobody
 * has to come back and fix an early reading. Pass `minAgeHours: 0` to force.
 */
export async function applyTelegramMetrics(db: SupabaseClient, contentId: string, opts: { minAgeHours?: number } = {}): Promise<ApplyResult> {
  const sb = db as any;
  const none = { views: null, reactions: null, postedAt: null, eligibleAt: null, updated: {} as ApplyResult['updated'] };
  const { data: row } = await sb.from('contents').select('id, content_link, impressions, likes, activation_date').eq('id', contentId).maybeSingle();
  if (!row) return { ok: false, reason: 'not_found', ...none };
  if (!isTelegramPostUrl(row.content_link)) return { ok: false, reason: 'not_telegram', ...none };
  const m = await fetchTelegramMetrics(row.content_link);
  if (!m || (m.views === null && m.reactions === null && !m.postedAt)) return { ok: false, reason: 'no_metrics', ...none };

  const updated: ApplyResult['updated'] = {};
  // Post date, only when nobody has set one. UTC day, matching what /submit
  // stores (content_items.posted_at), so the same post never lands on two
  // different days depending on who logged it.
  if (!row.activation_date && m.postedAt) updated.activation_date = m.postedAt.slice(0, 10);

  const minAge = opts.minAgeHours ?? METRICS_MIN_AGE_HOURS;
  const ageHours = m.postedAt ? (Date.now() - Date.parse(m.postedAt)) / 3_600_000 : Infinity;
  const tooNew = ageHours < minAge;
  const eligibleAt = m.postedAt ? new Date(Date.parse(m.postedAt) + minAge * 3_600_000).toISOString() : null;
  if (!tooNew) {
    if (m.views !== null && m.views > (row.impressions || 0)) updated.impressions = m.views;
    if (m.reactions !== null && m.reactions > (row.likes || 0)) updated.likes = m.reactions;
  }
  if (Object.keys(updated).length) {
    const { error } = await sb.from('contents').update({ ...updated, updated_at: new Date().toISOString() }).eq('id', contentId);
    if (error) return { ok: false, reason: 'write_failed', views: m.views, reactions: m.reactions, postedAt: m.postedAt, eligibleAt, updated: {} };
  }
  if (tooNew) return { ok: false, reason: 'too_new', views: m.views, reactions: m.reactions, postedAt: m.postedAt, eligibleAt, updated };
  return { ok: true, views: m.views, reactions: m.reactions, postedAt: m.postedAt, eligibleAt, updated };
}
