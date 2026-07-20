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
  const unmatchedHandles: string[] = [];
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
    unmatchedHandles.push(handle);
  }

  // Pass 3: fuzzy fallback for @handles that don't exactly match a
  // telegram_username — e.g. "@quazo" for the user named "Quazo" whose
  // handle is "Elquazo". An @-tag is unambiguous intent to assign
  // SOMEONE, so try matching the handle against team member names and
  // username substrings. Only auto-picks when exactly ONE member
  // matches; ambiguity still returns null rather than guessing.
  if (unmatchedHandles.length > 0) {
    const { data: roster } = await (supabase as any)
      .from('users')
      .select('id, name, telegram_username')
      .not('telegram_id', 'is', null);
    for (const handle of unmatchedHandles) {
      const match = matchHandleToRoster(handle, (roster || []) as RosterMember[]);
      if (match) {
        return {
          user_id: match.id,
          name: match.name || match.telegram_username || handle,
          telegram_username: match.telegram_username,
          matched_via: 'mention',
        };
      }
    }
  }

  return null;
}

export interface RosterMember {
  id: string;
  name: string | null;
  telegram_username: string | null;
}

/**
 * Match a bare handle (no @) against the team roster by name/username
 * similarity. Returns the member ONLY if exactly one matches — two or
 * more candidates means ambiguity, and picking wrong is worse than
 * asking. Exported for testability.
 */
export function matchHandleToRoster(handle: string, roster: RosterMember[]): RosterMember | null {
  const h = handle.toLowerCase().trim();
  if (h.length < 3) return null;
  const candidates = roster.filter((m) => {
    const name = (m.name || '').toLowerCase().trim();
    const username = (m.telegram_username || '').toLowerCase().trim();
    if (name && (name === h || senderNameTokens({ name: m.name, telegram_username: null }).includes(h))) {
      return true;
    }
    // Substring either way: "@quazo" ⊂ "elquazo", or a typed
    // "@elquazo1" ⊃ "elquazo". Both sides length-gated by the ≥3 check.
    if (username && (username.includes(h) || h.includes(username))) return true;
    return false;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

// ─── Self-reference fallback ─────────────────────────────────────────────
//
// When a user types `/task bolt do X` from their own account (BoltXBT), the
// resolver above returns null because there's no @-tag entity. Without this
// fallback the parser would demand `re-send with @BoltXBT explicitly tagged`
// — annoying for the obvious self-assignment case.
//
// Strategy: build a small set of "tokens that mean this sender" from the
// user's display name, telegram_username, and Telegram-provided first_name,
// and check whether any token (≥3 chars) appears as a whole-word match in
// the message body. Whole-word match avoids matching "ash" inside "cash"
// when the user is named "Ash".

export interface SenderHint {
  /** users.name — the display name on file. */
  name: string | null | undefined;
  /** users.telegram_username — the @handle. */
  telegram_username: string | null | undefined;
  /** message.from.first_name from Telegram (often the friendly nickname). */
  first_name?: string | null | undefined;
}

export function senderNameTokens(sender: SenderHint): string[] {
  const candidates: Array<string | null | undefined> = [
    sender.name,
    sender.telegram_username,
    sender.first_name,
  ];
  // Also try splitting CamelCase / snake_case / dash-case display names —
  // "BoltXBT" → ["bolt", "xbt"], "DefiFarmer" → ["defi", "farmer"], etc.
  // The 2-letter pieces ("XBT") are discarded by the length filter below.
  if (sender.name) {
    candidates.push(...sender.name.split(/[\s\-_]|(?=[A-Z])/g));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    const lower = c.toLowerCase().trim();
    if (lower.length < 3) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

export function messageReferencesSender(messageText: string, sender: SenderHint): boolean {
  const tokens = senderNameTokens(sender);
  if (tokens.length === 0) return false;
  const lower = messageText.toLowerCase();
  return tokens.some((t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    return re.test(lower);
  });
}
