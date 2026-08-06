/**
 * Pre-Ship Gate — who has to pass it.
 *
 * Lives in lib/ (not in PreShipGateModal.tsx) because the Telegram webhook
 * is a server route and must not pull a `'use client'` React module in just
 * to read one boolean. The modal re-exports this so UI callers keep a single
 * import.
 */

/**
 * [2026-08-06] Per Andy: super_admins are exempt from the gate.
 *
 * The gate is a forcing function for the people doing the client work.
 * Super_admins (Andy / Bolt / Jdot / Yano) defined it, and they're the ones
 * closing *other people's* client tasks from review surfaces — the team-wide
 * Ready-for-Feedback queue, bulk status changes, /done in ops chats. Making
 * them attest "I read the request, not skimmed it" about someone else's work
 * is noise, not a check.
 *
 * One predicate so all four intercepts agree: TaskDetailModal, /tasks
 * saveSelectField, the My Work status circle, and the TG /done flow. Change
 * the rule here, not at the call sites.
 */
export function isPreShipGateExempt(role: string | null | undefined): boolean {
  return role === 'super_admin';
}
