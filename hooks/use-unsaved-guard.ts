'use client';

/**
 * useUnsavedGuard — stop a dialog from throwing away typed-but-unsaved work.
 *
 * [2026-10-27] UX audit, finding #5: 114 dialogs, none guarded. Radix closes a
 * dialog on Escape, on an outside click and on the × button, and every one of
 * those silently discarded whatever was in the form. This hook wraps the
 * dialog's `onOpenChange` so a CLOSE while the form is dirty asks first
 * ("Discard unsaved changes?") through the shared ConfirmProvider. Opens,
 * clean closes, and the dialog's own programmatic closes (after a save,
 * from a Cancel button) are untouched — they don't go through the wrapped
 * handler, or the form isn't dirty.
 *
 * Dirty detection, and why it is shaped this way:
 *   - `value` is whatever state the form edits (one object, or a tuple of
 *     the pieces). It is compared by JSON against a snapshot.
 *   - The snapshot is NOT frozen at open. Edit dialogs load their row after
 *     opening, often in an effect that runs after this hook's, so an
 *     open-time snapshot would read as dirty before the user typed anything.
 *     Instead the snapshot keeps following `value` until the user first
 *     interacts with the dialog (any pointer-down or key-down inside its
 *     content), and freezes from then on. Programmatic loads before the first
 *     touch never count; anything after it does — including Radix Selects,
 *     calendars and rich-text editors, which don't emit native change events.
 *   - A `beforeunload` prompt is attached only while dirty, so a tab close or
 *     hard navigation gets the browser's own "leave site?" dialog.
 *
 * Usage:
 *   const guard = useUnsavedGuard({ open, value: form, onOpenChange });
 *   <Dialog open={open} onOpenChange={guard.onOpenChange}>
 *     <DialogContent {...guard.contentProps}>…</DialogContent>
 *
 * Nothing changes for a dialog until it is wired this way, and a wired dialog
 * behaves exactly as before until the form is dirty.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useConfirm } from '@/contexts/ConfirmContext';

export interface UnsavedGuardOptions<T> {
  open: boolean;
  /** The form state (or a tuple/array of the state pieces) to watch. */
  value: T;
  /** The dialog's real close handler. Called with `false` only after consent. */
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /**
   * Changes when the dialog starts a NEW form session without closing — e.g.
   * the meeting-notes modal switching from "add" to "edit note X". The guard
   * re-arms: forgets the touch, follows the value again until the next
   * interaction. Without this, "click Edit, change nothing, close" would read
   * as dirty because the row loaded after the click.
   */
  resetKey?: string | number | null;
}

const safeSerialize = (v: unknown): string => {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return String(v);
  }
};

export function useUnsavedGuard<T>({ open, value, onOpenChange, title, description, resetKey = null }: UnsavedGuardOptions<T>) {
  const confirm = useConfirm();
  const serialized = safeSerialize(value);

  const snapshot = useRef<string | null>(null);
  const touched = useRef(false);
  const latest = useRef(serialized);
  const closeRef = useRef(onOpenChange);
  const lastKey = useRef(resetKey);
  latest.current = serialized;
  closeRef.current = onOpenChange;

  // Follow the value until the first user interaction, then freeze. A new
  // resetKey re-arms (see the option's doc).
  useEffect(() => {
    if (!open) {
      snapshot.current = null;
      touched.current = false;
      lastKey.current = resetKey;
      return;
    }
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      touched.current = false;
    }
    if (!touched.current) snapshot.current = serialized;
  }, [open, serialized, resetKey]);

  const isDirty = useCallback(
    () => open && touched.current && snapshot.current !== null && snapshot.current !== latest.current,
    [open],
  );

  // Browser-level guard for tab close / hard navigation while dirty.
  const dirtyNow = open && touched.current && snapshot.current !== null && snapshot.current !== serialized;
  useEffect(() => {
    if (!dirtyNow) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirtyNow]);

  const guardedOnOpenChange = useCallback(
    async (next: boolean) => {
      if (next || !isDirty()) {
        closeRef.current(next);
        return;
      }
      const ok = await confirm({
        title: title ?? 'Discard unsaved changes?',
        description: description ?? 'This form has edits that have not been saved. Closing it will throw them away.',
        confirmLabel: 'Discard',
        tone: 'destructive',
      });
      if (ok) closeRef.current(false);
    },
    [confirm, isDirty, title, description],
  );

  const markTouched = useCallback(() => {
    touched.current = true;
  }, []);

  return {
    /** Put on <Dialog onOpenChange>. */
    onOpenChange: guardedOnOpenChange,
    /** Spread on <DialogContent>. Capture-phase, so children are unaffected. */
    contentProps: { onPointerDownCapture: markTouched, onKeyDownCapture: markTouched },
    /** True once the user has touched the form and it differs from what was loaded. */
    isDirty,
  };
}
