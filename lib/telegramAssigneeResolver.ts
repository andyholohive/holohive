import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve @-mentions in a Telegram message to users.id of the
 * matching team member.
 *
 * Telegram delivers two flavors of @-mention via message.entities:
 *
 *   1. type='text_mention' — fires when the mentioned user has NO
 *      public username (you can still tap them to open their profile).
 *      Carries the actual numeric user.id directly. We resolve via
 *      users.telegram_id — the rock-solid path.
 *
 *   2. type='mention' — plain text @handle. We see the literal "@daniel"
 *      substring but no user ID. We resolve via users.telegram_username
 *      (added in migration 069). Case-insensitive — Telegram treats
 *      @Foo and @foo as the same handle.
 *
 * Returns the FIRST matched team member, since /task is "tag person"
 * (singular) per the doc. Multi-assignee tasks aren't a v1 concept.
 *
 * If nothing resolves (no mentions, or mentions don't match anyone in
 * users), returns null. The caller should let Claude / the user
 * disambiguate from there rather than silently picking someone wrong.
 */
export interface ResolvedAssignee {
  user_id: string;
  name: string;
  telegram_username: string | null;
  /** Which entity flavor matched — useful for telemetry/debugging. */
  matched_via: 'text_mention' | 'mention';
}

interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
  user?: { id: number; username?: string };
}

export async function resolveAssigneeFromMessage(
  supabase: SupabaseClient,
  messageText: string,
  entities: TelegramEntity[] | undefined,
): Promise<ResolvedAssignee | null> {
  if (!entities || entities.length === 0) return null;

  // Pass 1: text_mention has the user.id, fastest + most reliable.
  // If the user later renames their handle, this still works (we match
  // on the immutable telegram_id, not the mutable username).
  for (const entity of entities) {
    if (entity.type !== 'text_mention') continue;
    const tgId = entity.user?.id;
    if (!tgId) continue;
    const { data } = await (supabase as any)
      .from('users')
      .select('id, name, telegram_username')
      .eq('telegram_id', String(tgId))
      .maybeSingle();
    if (data) {
      return {
        user_id: data.id,
        name: data.name,
        telegram_username: data.telegram_username,
        matched_via: 'text_mention',
      };
    }
  }

  // Pass 2: mention entities. Slice the @handle out of the message
  // text using offset/length (the entity points at the substring).
  // Strip the leading @ before lookup.
  for (const entity of entities) {
    if (entity.type !== 'mention') continue;
    const handleWithAt = messageText.slice(entity.offset, entity.offset + entity.length);
    const handle = handleWithAt.replace(/^@/, '').trim();
    if (!handle) continue;
    // Case-insensitive lookup against the partial unique index.
    const { data } = await (supabase as any)
      .from('users')
      .select('id, name, telegram_username')
      .ilike('telegram_username', handle)
      .maybeSingle();
    if (data) {
      return {
        user_id: data.id,
        name: data.name,
        telegram_username: data.telegram_username,
        matched_via: 'mention',
      };
    }
  }

  return null;
}
