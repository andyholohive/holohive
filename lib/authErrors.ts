/**
 * Could not ask, as opposed to asked and was told no.
 *
 * A rejected token comes back 401/403 from the auth service. A timeout, a
 * 5xx, or a failed fetch means we never got an answer — the session may be
 * perfectly valid. Supabase surfaces the retryable case as
 * AuthRetryableFetchError, but the status and message carry the same signal
 * and the class name is not worth relying on alone.
 *
 * Collapsing these two into "not signed in" is how a Supabase blip showed a
 * signed-in super_admin "Unauthorized" on Short Links [Andy 2026-09-14].
 */
export function isTransientAuthError(
  error: { name?: string; status?: number; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  const status = error.status ?? 0;
  if (status >= 500) return true;
  // status 0 / absent means the request never completed.
  if (!status && /fetch|network|timeout|gateway|aborted|ECONN/i.test(error.message ?? '')) return true;
  return false;
}
