'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Promise-based replacement for window.confirm().
 *
 * [2026-09-03] The portal audit found ten window.confirm() calls left after
 * the June sweep, spread over five files. Each one gated a delete or a paid
 * Grok run behind the browser's native popup — unstyled, un-themeable, and
 * blocked outright by some in-app browsers. Building a bespoke Dialog per
 * site is how the June sweep did it, and it is also why ten were missed:
 * every conversion meant new state, new JSX, and a new place to forget.
 *
 * This keeps the call shape of window.confirm — one line, returns a boolean,
 * the handler simply awaits it — so a conversion is a one-line diff:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm('Delete this signal?'))) return;
 *
 * One provider in the root layout renders the Dialog. Outside a provider
 * the hook falls back to window.confirm, so it can never break a page.
 */
export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'destructive' (default) for deletes; 'brand' for spend / run confirmations. */
  tone?: 'destructive' | 'brand';
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const fallback: ConfirmFn = async (options) => {
  const o = typeof options === 'string' ? { title: options } : options;
  const text = typeof o.description === 'string' ? `${o.title}\n\n${o.description}` : o.title;
  return typeof window !== 'undefined' ? window.confirm(text) : false;
};

const ConfirmContext = React.createContext<ConfirmFn>(fallback);

export function useConfirm(): ConfirmFn {
  return React.useContext(ConfirmContext);
}

interface Pending {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback<ConfirmFn>((options) => {
    const normalized = typeof options === 'string' ? { title: options } : options;
    return new Promise<boolean>((resolve) => {
      // A second confirm while one is open resolves the first as cancelled
      // rather than stacking — matches how the native popup behaves.
      setPending((prev) => {
        prev?.resolve(false);
        return { options: normalized, resolve };
      });
    });
  }, []);

  const settle = (ok: boolean) => {
    setPending((prev) => {
      prev?.resolve(ok);
      return null;
    });
  };

  const o = pending?.options;
  const destructive = (o?.tone ?? 'destructive') === 'destructive';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className={`h-4 w-4 ${destructive ? 'text-rose-500' : 'text-brand'}`} />
              {o?.title}
            </DialogTitle>
            {o?.description ? (
              <DialogDescription className="text-sm text-ink-warm-700 pt-2 whitespace-pre-line">
                {o.description}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => settle(false)}>
              {o?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={destructive ? 'destructive' : 'brand'} onClick={() => settle(true)}>
              {o?.confirmLabel ?? (destructive ? 'Delete' : 'Continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
