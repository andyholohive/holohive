import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * "Which Telegram chat is this client's?" — one answer, one convention.
 *
 * [2026-08-11] The default destination for every client-facing bot is the
 * chat linked to that client in /crm/telegram (`telegram_chats.client_id`).
 * The weekly-content-recap cron and KR Signal already resolved it this way,
 * with byte-identical sort logic copy-pasted into each; this is that logic
 * extracted so there's one implementation rather than three.
 *
 * Call notes used to read `client_context.telegram_chat_id` instead, which
 * nothing else wrote — so linking a chat in /crm/telegram left the send
 * button reporting "No telegram_chat_id configured" (hit on Button). That
 * field is now a LEGACY last-resort fallback only, kept because Quazo.TEST's
 * value (-5312278352) was typed by hand and has no `telegram_chats` row to
 * fall back to. Once that client is linked or retired, drop the column and
 * the `legacyContextChatId` argument with it.
 *
 * Precedence is deliberately attribution-first: a chat linked in the UI must
 * take effect immediately, rather than losing to a stale value nobody can see
 * or edit.
 *
 * Per-feature overrides (`kr_signal_clients.telegram_chat_id`,
 * `app_settings.weekly_recap_client_overrides`) sit ABOVE this and stay where
 * they are — they answer "send this particular feature somewhere else", not
 * "which chat is this client's".
 */

interface ChatRow {
  chat_id: string | null;
  client_id: string | null;
  is_internal: boolean | null;
  last_message_at: string | null;
}

/**
 * Client-facing before internal, then most recently active. Hidden chats are
 * excluded by the query.
 */
function sortCandidates(a: ChatRow, b: ChatRow): number {
  const ai = a.is_internal ? 1 : 0;
  const bi = b.is_internal ? 1 : 0;
  if (ai !== bi) return ai - bi;
  const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
  const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
  return bt - at;
}

/**
 * Batch form — one query for many clients. Returns clientId → chat_id for
 * every client that has at least one linked chat.
 */
export async function resolveClientChatIds(
  supabase: SupabaseClient,
  clientIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data } = await (supabase as any)
    .from('telegram_chats')
    .select('chat_id, client_id, is_internal, is_hidden, last_message_at')
    .in('client_id', ids)
    .or('is_hidden.is.null,is_hidden.eq.false');

  const rows = ((data ?? []) as ChatRow[]).filter(r => !!r.chat_id);
  for (const id of ids) {
    const cands = rows.filter(r => r.client_id === id).sort(sortCandidates);
    if (cands[0]?.chat_id) out.set(id, String(cands[0].chat_id));
  }
  return out;
}

/**
 * Single-client form. `legacyContextChatId` is only consulted when the client
 * has no linked chat at all — see the deprecation note above.
 */
export async function resolveClientChatId(
  supabase: SupabaseClient,
  clientId: string,
  legacyContextChatId?: string | null,
): Promise<string | null> {
  const map = await resolveClientChatIds(supabase, [clientId]);
  return map.get(clientId) ?? ((legacyContextChatId ?? '').trim() || null);
}
