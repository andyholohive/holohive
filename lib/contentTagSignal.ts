/**
 * "Content tags changed" — a signal, not a store.
 *
 * [2026-09-01, Quazo] Tagging a post Complimentary on the Content tab did not
 * show on the Budget tab until a page refresh. The two tabs each fetch tag
 * assignments independently: the Content one refetches after its own edit, the
 * Budget one keyed its fetch on `contents`, which a tag change never touches.
 *
 * Prop-drilling a refresh key between them means threading it through
 * app/campaigns/[id]/page.tsx, which is 3,200 lines and the thing CLAUDE.md
 * asks us to stop growing. A module-level event decouples them: whoever
 * mutates a tag announces it, whoever displays tags listens. No shared parent,
 * no context, and a listener that never mounts costs nothing.
 */

const EVENT = 'hh:content-tags-changed';

/** Call after any write to content_tag_assignments. */
export function announceContentTagsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Subscribe. Returns the unsubscribe function for a useEffect cleanup. */
export function onContentTagsChanged(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
