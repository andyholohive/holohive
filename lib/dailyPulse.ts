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
  return isFriday
    ? `gm ${who}. blockers today? and drop one win from the week worth sharing — prefix it with "win:". reply "clear" if no blockers`
    : `gm ${who}. anything blocking you today? reply with what + who you're waiting on, or reply "clear" if you're good`;
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
