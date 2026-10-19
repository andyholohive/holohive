/**
 * Daily Pulse Bot — shared helpers.
 *
 * One place for the roster/destination config, the day-variant prompt
 * text, and reply classification, so the 06:00 DM cron
 * (app/api/cron/daily-pulse-dm), the webhook reply-capture branch
 * (app/api/telegram/webhook), and the 12:00 digest cron
 * (app/api/cron/daily-pulse-digest) all agree.
 *
 * Timezone: fixed UTC. The whole roster sits UTC+1..+9 (Nigeria /
 * Pakistan / Korea), so 06:00 DM → 12:00 cutoff lands in working hours
 * for everyone and nobody is a clock-driven "No check-in". No per-tz
 * logic and no pending state in v1 (per Jdot).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const PULSE_DM_HOUR_UTC = 6;
export const PULSE_CUTOFF_HOUR_UTC = 12;

export type PulseStatus = 'no_checkin' | 'clear' | 'blocked';

/**
 * One agent_runs row per cron invocation, including the no-op branches.
 * [2026-10-19, defect 2] Both crons used to return early on an empty roster
 * WITHOUT logging, so unchecking the roster silenced the bot forever and the
 * health sweep had nothing to notice. Every exit path logs now.
 */
export async function logPulseRun(
  client: SupabaseClient,
  agent: 'DAILY_PULSE_DM' | 'DAILY_PULSE_DIGEST',
  startedAtMs: number,
  status: 'success' | 'failed',
  summary: string,
): Promise<void> {
  try {
    await (client as any).from('agent_runs').insert({
      agent_name: agent,
      run_type: 'cron',
      started_at: new Date(startedAtMs).toISOString(),
      completed_at: new Date().toISOString(),
      status,
      output_summary: summary,
      error_message: status === 'failed' ? summary : null,
    });
  } catch { /* logging must never fail the cron */ }
}

/**
 * A short follow-up after a reply has already been captured ("thanks", "ok",
 * "👍") is an acknowledgement, not a new answer. [2026-10-19, defect 3] It used
 * to be re-classified and overwrite the day's blocker with "thanks".
 */
const FOLLOW_UP_PHRASES = new Set([
  'thanks', 'thank you', 'thx', 'ty', 'ok', 'okay', 'k', 'kk', 'cool', 'noted', 'got it',
  'sure', 'cheers', 'great', 'nice', 'perfect', 'sounds good', 'will do', 'done', 'yes', 'yep', 'yup', 'no', 'nope',
]);
export function isFollowUp(raw: string): boolean {
  const t = (raw || '').trim();
  if (!t) return true;
  // Emoji / punctuation only, or a known short acknowledgement.
  const letters = t.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  if (!letters) return true;
  return FOLLOW_UP_PHRASES.has(letters) && letters.split(' ').length <= 2;
}

/** Append a win to any already recorded that day; identical lines once. [defect 1] */
export function mergeWins(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  const lines = [...(existing ?? '').split('\n'), ...(incoming ?? '').split('\n')].map(l => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out = lines.filter(l => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return out.length ? out.join('\n') : null;
}

export interface RosterMember {
  id: string;
  name: string | null;
  telegram_id: string | null;
}

/** UTC calendar date as YYYY-MM-DD — the pulse_date key for a given moment. */
export function pulseDateFor(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Friday in UTC drives the win-collecting prompt + Wins digest block. */
export function isFridayUTC(d: Date): boolean {
  return d.getUTCDay() === 5;
}

/**
 * Resolve the configured roster: app_settings.daily_pulse_roster is a
 * JSON array of user ids; we join through users for name + telegram_id.
 * Members with no telegram_id are still returned (the caller decides
 * whether to skip the DM) so the digest can still list them.
 */
export async function getRoster(client: SupabaseClient): Promise<RosterMember[]> {
  const { data: setting } = await (client as any)
    .from('app_settings')
    .select('value')
    .eq('key', 'daily_pulse_roster')
    .maybeSingle();
  let ids: string[] = [];
  try {
    const parsed = JSON.parse((setting as any)?.value ?? '[]');
    if (Array.isArray(parsed)) ids = parsed.map(String);
  } catch { ids = []; }
  if (ids.length === 0) return [];
  const { data: users } = await (client as any)
    .from('users')
    .select('id, name, telegram_id')
    .in('id', ids);
  // Preserve the configured order.
  const byId = new Map<string, RosterMember>();
  for (const u of ((users ?? []) as any[])) byId.set(u.id, { id: u.id, name: u.name, telegram_id: u.telegram_id });
  return ids.map(id => byId.get(id)).filter(Boolean) as RosterMember[];
}

/** Digest destination (chat + optional thread) from app_settings. */
export async function getDigestDestination(
  client: SupabaseClient,
): Promise<{ chatId: string | null; threadId: number | null }> {
  const [chatSetting, threadSetting] = await Promise.all([
    (client as any).from('app_settings').select('value').eq('key', 'daily_pulse_digest_chat_id').maybeSingle(),
    (client as any).from('app_settings').select('value').eq('key', 'daily_pulse_digest_thread_id').maybeSingle(),
  ]);
  const chatId = (chatSetting.data as any)?.value ?? null;
  const threadRaw = (threadSetting.data as any)?.value ?? null;
  const threadId = threadRaw ? parseInt(String(threadRaw), 10) : null;
  return { chatId: chatId || null, threadId: Number.isFinite(threadId as number) ? threadId : null };
}

/** The morning DM text for a member, by day variant. */
export function promptFor(name: string | null, isFriday: boolean): string {
  const who = (name || 'there').split(' ')[0];
  // A bold emoji header makes the DM stand out in the chat list + notification
  // preview so it isn't scrolled past. Keeps Jdot's casual tone in the body.
  return isFriday
    ? `🟢 <b>DAILY PULSE · Friday</b>\n\ngm ${who} — <b>any blockers today?</b>\nAnd drop one <b>win</b> from the week worth sharing (prefix it <code>win:</code>).\n\n👉 Reply with what + who you're waiting on, or just <b>clear</b> if you're good.`
    : `🟢 <b>DAILY PULSE</b>\n\ngm ${who} — <b>anything blocking you today?</b>\n\n👉 Reply with what + who you're waiting on, or just <b>clear</b> if you're good.`;
}

const CLEAR_PHRASES = new Set([
  'clear', 'all clear', 'allclear', 'im clear', 'all good', 'allgood',
  'good', 'nothing', 'none', 'nope', 'no blockers', 'no blocker',
]);

/**
 * Classify a captured reply. Win and blocker status are independent
 * axes (Jdot): a Friday reply can yield BOTH a win and a blocker.
 *
 *   - Any line prefixed `win:` (Friday only) → winText (joined).
 *   - Remaining text reduces to a clear-phrase (or is empty because the
 *     reply was win-only) → status 'clear'.
 *   - Otherwise → status 'blocked', blockerText = the remaining text
 *     shown verbatim in the digest.
 */
export function classifyReply(
  raw: string,
  isFriday: boolean,
): { status: Exclude<PulseStatus, 'no_checkin'>; blockerText: string | null; winText: string | null } {
  const lines = (raw || '').split('\n').map(l => l.trim()).filter(Boolean);
  const winParts: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    const m = isFriday ? line.match(/^win\s*[:\-–—]\s*(.*)$/i) : null;
    if (m) {
      const w = m[1].trim();
      if (w) winParts.push(w);
    } else {
      rest.push(line);
    }
  }
  const remainder = rest.join('\n').trim();
  const winText = winParts.length ? winParts.join('\n') : null;

  // Win-only reply (no blocker statement) reads as Clear, win still shown.
  if (!remainder) return { status: 'clear', blockerText: null, winText };

  const normalized = remainder.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  if (CLEAR_PHRASES.has(normalized)) return { status: 'clear', blockerText: null, winText };

  return { status: 'blocked', blockerText: remainder, winText };
}
