'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useViewAs } from '@/contexts/ViewAsContext';

type Permission = {
  page_key: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

// [2026-07-24 per Andy] Pages a MEMBER can be granted beyond the role's
// defaults. Members get the whole core app from their role; these are the
// two admin-gated surfaces that can be opened per-member via the same
// guest_permissions table (rows are ADDITIVE grants for members, unlike
// guests where the rows are the entire allowlist).
export const MEMBER_GRANT_PAGES = [
  { key: '/sops', label: 'SOPs' },
  { key: '/templates', label: 'Templates — Tasks & Deliverables editors' },
] as const;

// All pages a guest could potentially access
export const GUEST_PAGES = [
  { key: '/crm/sales-pipeline', label: 'Sales Pipeline', group: 'CRM' },
  // [2026-08-26] Both already carried a `pageKey` in the nav registry, so
  // their visibility was being checked against a permission row — but they
  // were missing here, which is what creates the row. The gate was wired to
  // something that could never exist, so a guest could never be granted
  // either page. Adding them here is what makes the existing check reachable.
  { key: '/crm/outreach', label: 'Outreach', group: 'CRM' },
  { key: '/intelligence', label: 'Intelligence', group: 'CRM' },
  { key: '/crm/network', label: 'Network', group: 'CRM' },
  { key: '/crm/contacts', label: 'Contacts', group: 'CRM' },
  { key: '/crm/submissions', label: 'Submissions', group: 'CRM' },
  { key: '/crm/meetings', label: 'Meetings', group: 'CRM' },
  { key: '/clients', label: 'Clients', group: 'Core' },
  { key: '/campaigns', label: 'Campaigns', group: 'Core' },
  { key: '/kols', label: 'KOLs', group: 'Core' },
  { key: '/links', label: 'Links', group: 'Core' },
  { key: '/delivery-logs', label: 'Delivery Logs', group: 'Core' },
  { key: '/lists', label: 'Lists', group: 'Core' },
  { key: '/tasks', label: 'Tasks', group: 'Core' },
] as const;

export function useGuestPermissions() {
  const { user, userProfile } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const isGuest = userProfile?.role === 'guest';
  // [2026-07-24] Members can hold ADDITIVE grants (SOPs / Templates
  // editors) in the same table, so fetch for them too.
  const isMember = userProfile?.role === 'member';

  // [2026-07-28] Third reading of the same rows: a RESTRICTED admin.
  //
  // guest → rows are the whole allowlist
  // member → rows are additive grants on top of the role
  // restricted admin → rows are an allowlist that SUBTRACTS from the role
  //
  // Driven by users.page_access_restricted, never by the mere presence of
  // rows — one stray row must not silently lock an admin out of the app.
  //
  // super_admin is excluded unconditionally. That is the lockout guard:
  // whatever the flag says in the DB, the owner account keeps full access,
  // so a bad save can always be undone from the UI.
  const isSuperAdmin = userProfile?.role === 'super_admin';
  const ownRestricted = !isSuperAdmin && Boolean((userProfile as any)?.page_access_restricted);

  // [2026-07-28] "View as" preview. When active every gate below answers
  // for the TARGET rather than the signed-in user, which is what makes the
  // sidebar render as they see it. Scoped to nav only — see ViewAsContext
  // for why that's the honest boundary.
  const { target: viewAs } = useViewAs();
  const previewing = Boolean(viewAs);
  const isRestricted = previewing
    ? (viewAs!.role !== 'super_admin' && viewAs!.restricted)
    : ownRestricted;

  useEffect(() => {
    if (previewing) return;               // rows come from the preview target
    if (!user?.id || (!isGuest && !isMember && !isRestricted)) {
      setLoading(false);
      return;
    }
    loadPermissions();
  }, [user?.id, isGuest, isMember, isRestricted, previewing]);

  const loadPermissions = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('guest_permissions')
        .select('page_key, can_view, can_edit, can_delete')
        .eq('user_id', user.id);
      // Cast: DB has can_view/can_edit/can_delete as nullable, interface
      // narrows to non-null. Permission rows always have these set in
      // practice (NOT NULL is enforced by application writes).
      setPermissions((data || []) as Permission[]);
    } catch (err) {
      console.error('Error loading guest permissions:', err);
    } finally {
      setLoading(false);
    }
  };

  // The rows every gate below reads: the preview target's when
  // previewing, otherwise the signed-in user's own.
  const effectivePermissions = previewing ? viewAs!.permissions : permissions;
  const effectiveIsGuest = previewing ? viewAs!.role === 'guest' : isGuest;

  const canView = useCallback((pageKey: string): boolean => {
    if (!effectiveIsGuest) return true; // non-guests have full access
    const perm = effectivePermissions.find(p => p.page_key === pageKey);
    return perm?.can_view ?? false;
  }, [effectiveIsGuest, effectivePermissions]);

  const canEdit = useCallback((pageKey: string): boolean => {
    if (!effectiveIsGuest) return true;
    const perm = effectivePermissions.find(p => p.page_key === pageKey);
    return perm?.can_edit ?? false;
  }, [effectiveIsGuest, effectivePermissions]);

  const canDelete = useCallback((pageKey: string): boolean => {
    if (!effectiveIsGuest) return true;
    const perm = effectivePermissions.find(p => p.page_key === pageKey);
    return perm?.can_delete ?? false;
  }, [effectiveIsGuest, effectivePermissions]);

  // [2026-07-24] Member grant check — true only for a member with an
  // explicit can_view row (see MEMBER_GRANT_PAGES). Deliberately returns
  // false for admins/super_admins: callers OR this with their existing
  // role check (`isAdmin || hasMemberGrant('/sops')`), so admin access
  // never depends on grant rows existing.
  const hasMemberGrant = useCallback((pageKey: string): boolean => {
    if (!isMember) return false;
    const perm = effectivePermissions.find(p => p.page_key === pageKey);
    return perm?.can_view ?? false;
  }, [isMember, effectivePermissions]);

  // Pages all users (including guests) can always access
  const ALWAYS_ALLOWED = ['/settings', '/auth'];

  // Check if a path matches any permitted page.
  //
  // Guests and restricted users share the same allowlist semantics here —
  // the difference is only in who gets rows, not how they're read.
  const canAccessPath = useCallback((path: string): boolean => {
    if (!effectiveIsGuest && !isRestricted) return true;
    if (ALWAYS_ALLOWED.some(p => path.startsWith(p))) return true;
    return effectivePermissions.some(p => p.can_view && path.startsWith(p.page_key));
  }, [effectiveIsGuest, isRestricted, effectivePermissions]);

  /**
   * Should this nav item / page be shown?
   *
   * The one call the Sidebar needs. Unrestricted users always get true, so
   * adding a new page to the app never requires touching permission rows —
   * only a RESTRICTED user is filtered, and only against their own list.
   *
   * Fails OPEN while `loading` is true: a restricted user would otherwise
   * see the sidebar flash empty on every navigation before rows arrive.
   * The gate that matters is the page's own data access, not the nav item.
   */
  const canSeePage = useCallback((pageKey: string): boolean => {
    if (!isRestricted) return true;
    if (loading && !previewing) return true;
    if (ALWAYS_ALLOWED.some(p => pageKey.startsWith(p))) return true;
    return effectivePermissions.some(p => p.can_view && p.page_key === pageKey);
  }, [isRestricted, loading, previewing, effectivePermissions]);

  // First page the user has access to (for redirect). Restricted users need
  // this too — landing them on a page they can't see is a dead end.
  const firstAllowedPath = (effectiveIsGuest || isRestricted)
    ? (effectivePermissions.find(p => p.can_view)?.page_key || null)
    : null;

  return {
    isGuest, isRestricted, permissions, loading,
    canView, canEdit, canDelete, canAccessPath, canSeePage,
    firstAllowedPath, hasMemberGrant,
    /**
     * Guest-ness as the CURRENT VIEW sees it: the preview target's role
     * while previewing, otherwise the signed-in user's.
     *
     * [2026-08-26] Exported because the Sidebar was deriving this itself
     * from userProfile.role, which is the signed-in user and never the
     * target — so "view sidebar as <guest>" showed a super_admin the whole
     * app. Every other gate in this hook already reads the target.
     */
    isGuestView: effectiveIsGuest,
    /**
     * The role the CURRENT VIEW should be gated on: the preview target's
     * while previewing, otherwise the signed-in user's.
     *
     * [2026-08-26] Sections gated directly on `userProfile.role` bypassed
     * every guest check, so previewing as a guest still showed the
     * admin-only Measurement, Logistics and Admin sections. Anything that
     * decides VISIBILITY should read this; anything that decides what data
     * to fetch for the real user should keep reading userProfile.
     */
    roleView: (previewing ? viewAs!.role : userProfile?.role) as string | undefined,
    /** True while rendering as someone else. Permission rows come from the
     *  target, so the hook's own `loading` is not meaningful then. */
    previewing,
  };
}
