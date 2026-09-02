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

/** The bare form, for comparisons and searching. */
export function bareHandle(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^@+/, '').toLowerCase();
}
