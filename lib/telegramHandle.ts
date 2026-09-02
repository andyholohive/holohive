/**
 * One way to render a Telegram handle.
 *
 * [Andy, 2026-09-03] Handles reach us from two places that disagree about the
 * @: telegram_messages.from_username never has one (Telegram stores the bare
 * username), while handles typed into the roster by hand usually do. Prefixing
 * blindly produced "@@raonikor" for the second kind.
 *
 * So: strip every leading @ — plural, because a value that has already been
 * through a naive prefixer can carry two — then add exactly one back.
 */
export function formatHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const bare = raw.trim().replace(/^@+/, '');
  return bare ? `@${bare}` : null;
}

/**
 * Collapse an @ the sender typed in front of the token.
 *
 * [Andy, 2026-09-03] "So I have to manually put @?" — no, {handle} already
 * renders one. But writing "@{handle}" is the natural instinct, and it would
 * have produced "@@dokudoku1219" in a message going to that person.
 *
 * Only an @ directly attached to the token is removed, so an email address or
 * a mention elsewhere in the body is untouched.
 */
export function collapseHandleToken(text: string): string {
  return text.replace(/@+\s*(\{handle\})/gi, '$1');
}

/** The bare form, for comparisons and searching. */
export function bareHandle(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^@+/, '').toLowerCase();
}
