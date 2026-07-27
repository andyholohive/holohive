/**
 * Weekly Strategic Direction Summary — the cross-client roll-up of
 * `client_weekly_updates.strategic_notes`.
 *
 * [2026-07-28] Andy had been assembling this by hand: open each client's
 * Client Context → Weekly Update tab, copy the amber Strategic Direction
 * box, paste into one message. The notes were already structured and
 * week-keyed; only the roll-up was missing.
 *
 * Delivery is a Telegram digest at 15:00 UTC Monday. The cron actually
 * runs DAILY at 15:00 — see the route for why — so the "have we sent
 * this week yet" state lives here in app_settings rather than being
 * implied by the schedule.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml } from '@/lib/telegramHtml';

export const SETTING_CHAT_ID = 'weekly_strategic_digest_chat_id';
export const SETTING_THREAD_ID = 'weekly_strategic_digest_thread_id';
/** week_of (YYYY-MM-DD) of the last week successfully posted. */
export const SETTING_LAST_SENT_WEEK = 'weekly_strategic_digest_last_sent_week';

export interface StrategicEntry {
  clientId: string;
  clientName: string;
  /** Already split into display bullets — leading markers stripped. */
  bullets: string[];
}

/** Monday (YYYY-MM-DD, UTC) of the week containing `d`. Matches the
 *  `week_of` anchor used by client_weekly_updates everywhere else. */
export function mondayOf(d: Date): string {
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return m.toISOString().slice(0, 10);
}

/** Digest destination (chat + optional thread) from app_settings. */
export async function getDigestDestination(
  client: SupabaseClient,
): Promise<{ chatId: string | null; threadId: number | null }> {
  const [chat, thread] = await Promise.all([
    (client as any).from('app_settings').select('value').eq('key', SETTING_CHAT_ID).maybeSingle(),
    (client as any).from('app_settings').select('value').eq('key', SETTING_THREAD_ID).maybeSingle(),
  ]);
  const chatId = (chat as any)?.data?.value || null;
  const rawThread = (thread as any)?.data?.value;
  const threadId = rawThread ? Number(rawThread) : null;
  return { chatId, threadId: Number.isFinite(threadId as number) ? threadId : null };
}

export async function getLastSentWeek(client: SupabaseClient): Promise<string | null> {
  const { data } = await (client as any)
    .from('app_settings').select('value').eq('key', SETTING_LAST_SENT_WEEK).maybeSingle();
  return (data as any)?.value || null;
}

export async function setLastSentWeek(client: SupabaseClient, weekOf: string): Promise<void> {
  await (client as any)
    .from('app_settings')
    .upsert({ key: SETTING_LAST_SENT_WEEK, value: weekOf }, { onConflict: 'key' });
}

/**
 * Strategic notes for `weekOf`, one entry per ACTIVE client that actually
 * wrote something.
 *
 * Clients with an empty or missing note are omitted entirely rather than
 * rendered as a bare header [Andy 2026-07-28] — the digest is a summary
 * of the direction that exists, not a checklist of who hasn't filled it
 * in. An empty overall result is what makes the cron retry tomorrow.
 */
export async function getStrategicEntries(
  client: SupabaseClient,
  weekOf: string,
): Promise<StrategicEntry[]> {
  const { data, error } = await (client as any)
    .from('client_weekly_updates')
    .select('client_id, strategic_notes, clients!inner(id, name, is_active)')
    .eq('week_of', weekOf)
    .eq('clients.is_active', true);
  if (error || !data) return [];

  const entries: StrategicEntry[] = [];
  for (const row of (data as any[])) {
    const bullets = splitBullets(row.strategic_notes);
    if (bullets.length === 0) continue; // nothing written — omit
    entries.push({
      clientId: row.client_id,
      clientName: row.clients?.name ?? 'Unknown',
      bullets,
    });
  }
  // Alphabetical: the source rows have no meaningful order, and a stable
  // one means the digest reads the same way week to week.
  entries.sort((a, b) => a.clientName.localeCompare(b.clientName));
  return entries;
}

/**
 * Split a strategic_notes blob into display bullets.
 *
 * Notes are free text typed into a textarea. In practice everyone writes
 * one "- " prefixed line per point, but the marker is a convention rather
 * than something the input enforces, so strip whichever of -/•/* is
 * present and treat every non-empty line as a bullet.
 */
export function splitBullets(notes: string | null | undefined): string[] {
  if (!notes) return [];
  return String(notes)
    .split('\n')
    .map(l => l.trim().replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 0);
}

/** "Jul 27" — the week label in the digest header. */
function weekLabel(weekOf: string): string {
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = weekOf.split('-').map(Number);
  if (!y || !m || !d) return weekOf;
  return `${MO[m - 1]} ${d}`;
}

/**
 * Render the digest. Returns one or more messages — Telegram caps a
 * message at 4096 chars, so a week with many clients splits on client
 * boundaries rather than being truncated mid-note.
 */
export function formatDigest(entries: StrategicEntry[], weekOf: string): string[] {
  const header = `<b>Weekly Strategic Direction Summary</b>\n<i>Week of ${escapeHtml(weekLabel(weekOf))}</i>`;
  const blocks = entries.map(e => {
    const lines = e.bullets.map(b => `• ${escapeHtml(b)}`).join('\n');
    return `<b>${escapeHtml(e.clientName)}</b>\n${lines}`;
  });

  const LIMIT = 3800; // headroom under Telegram's 4096
  const messages: string[] = [];
  let current = header;
  for (const block of blocks) {
    const candidate = `${current}\n\n${block}`;
    if (candidate.length > LIMIT && current !== header) {
      messages.push(current);
      current = block; // continuation messages carry no header
    } else {
      current = candidate;
    }
  }
  if (current.trim()) messages.push(current);
  return messages;
}
