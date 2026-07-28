'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientsLayout from '../clients/layout';
import { useAuth } from '@/contexts/AuthContext';
import { useGuestPermissions } from '@/hooks/useGuestPermissions';

/**
 * Admin section shell.
 *
 * Was a bare `export { default } from '../clients/layout'` — the app shell
 * only, which checks you are signed in and nothing else. The sidebar has
 * always hidden "Admin Tools" via canSeePage('/admin'), but the ROUTE never
 * enforced it, so a restricted user could reach /admin, /admin/field-options,
 * /admin/content-tags and /admin/telegram-comm by typing the URL. That went
 * from theoretical to real on 2026-07-28, when Ethan became a restricted
 * admin whose page list deliberately excludes admin tooling.
 *
 * Deliberately gated on canSeePage, NOT on role. A super_admin-only check
 * would have been the obvious fix and the wrong one: Jaymz, Jeremyin and
 * Quazo are plain admins who can reach these pages today and would have
 * silently lost them. canSeePage returns true for every unrestricted user,
 * so this changes nothing for them — it only makes the route agree with the
 * nav that was already hiding it.
 *
 * /admin/changelog keeps its own stricter super_admin check; this is a floor,
 * not a ceiling.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { canSeePage, loading } = useGuestPermissions();

  // Wait for BOTH the profile and the permission rows before judging.
  // canSeePage already fails open while loading, but userProfile arriving
  // late would otherwise let a restricted user render the page for a beat
  // before the redirect — and that beat is enough to click something.
  const allowed = !userProfile || loading || canSeePage('/admin');

  useEffect(() => {
    if (userProfile && !loading && !canSeePage('/admin')) {
      router.replace('/');
    }
  }, [userProfile, loading, canSeePage, router]);

  // Render the shell either way so the sidebar doesn't flicker; just hold
  // the page content back until we know.
  return <ClientsLayout>{allowed ? children : null}</ClientsLayout>;
}
