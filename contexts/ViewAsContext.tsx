'use client';

/**
 * "View as" — preview the app's navigation as another team member sees it.
 *
 * [2026-07-28] Built after per-member page permissions landed: Andy can set
 * an allowlist on someone but had no way to check the result short of
 * logging in as them.
 *
 * WHAT THIS IS NOT
 * This is not impersonation. No session is minted, no auth state changes,
 * and every query still runs as the real signed-in user with their own RLS.
 * Nothing written while previewing is attributed to the target.
 *
 * That limit is acceptable precisely because the thing being previewed —
 * users.page_access_restricted plus guest_permissions — is enforced in the
 * client, in useGuestPermissions. Overriding the same inputs the real
 * session would have makes the sidebar render exactly as that person sees
 * it. Preview is faithful for nav, and silent about RLS.
 *
 * Where the difference bites: a page whose emptiness comes from RLS (a
 * member's /clients with no grants) will still look full here, because you
 * are still you as far as Postgres is concerned. The banner says so.
 *
 * Entering is admin-only and the state lives in sessionStorage — it
 * survives navigation, dies with the tab. A stuck preview is a support
 * call, so it should not outlive the browser session.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'hhp_view_as_user_id';

export interface ViewAsTarget {
  id: string;
  name: string;
  role: string;
  restricted: boolean;
  permissions: { page_key: string; can_view: boolean; can_edit: boolean; can_delete: boolean }[];
}

interface ViewAsValue {
  target: ViewAsTarget | null;
  loading: boolean;
  /** Enter preview. No-op unless the caller is an admin/super_admin. */
  startViewAs: (userId: string) => Promise<void>;
  stopViewAs: () => void;
}

const ViewAsContext = createContext<ViewAsValue>({
  target: null,
  loading: false,
  startViewAs: async () => {},
  stopViewAs: () => {},
});

export function ViewAsProvider({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const [target, setTarget] = useState<ViewAsTarget | null>(null);
  const [loading, setLoading] = useState(false);

  const canPreview =
    userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  const load = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const [{ data: u }, { data: perms }] = await Promise.all([
        (supabase as any).from('users').select('id, name, role, page_access_restricted').eq('id', userId).maybeSingle(),
        (supabase as any).from('guest_permissions').select('page_key, can_view, can_edit, can_delete').eq('user_id', userId),
      ]);
      if (!u) { setTarget(null); return; }
      setTarget({
        id: u.id,
        name: u.name ?? 'Unknown',
        role: u.role ?? 'member',
        restricted: Boolean(u.page_access_restricted),
        permissions: (perms ?? []) as ViewAsTarget['permissions'],
      });
    } catch {
      setTarget(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Rehydrate on mount so a page reload mid-preview doesn't silently drop
  // you back to your own view — which would look like the preview lying.
  useEffect(() => {
    if (!canPreview) { setTarget(null); return; }
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && !target) load(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPreview]);

  const startViewAs = useCallback(async (userId: string) => {
    if (!canPreview) return;
    if (userId === userProfile?.id) return; // previewing yourself is a no-op
    try { sessionStorage.setItem(STORAGE_KEY, userId); } catch {}
    await load(userId);
  }, [canPreview, userProfile?.id, load]);

  const stopViewAs = useCallback(() => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    setTarget(null);
  }, []);

  return (
    <ViewAsContext.Provider value={{ target: canPreview ? target : null, loading, startViewAs, stopViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}

export const useViewAs = () => useContext(ViewAsContext);
