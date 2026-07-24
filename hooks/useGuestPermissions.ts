'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

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
  // editors) in the same table, so fetch for them too. Admins and
  // super_admins never need rows — their role already covers everything.
  const isMember = userProfile?.role === 'member';

  useEffect(() => {
    if (!user?.id || (!isGuest && !isMember)) {
      setLoading(false);
      return;
    }
    loadPermissions();
  }, [user?.id, isGuest, isMember]);

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

  const canView = useCallback((pageKey: string): boolean => {
    if (!isGuest) return true; // non-guests have full access
    const perm = permissions.find(p => p.page_key === pageKey);
    return perm?.can_view ?? false;
  }, [isGuest, permissions]);

  const canEdit = useCallback((pageKey: string): boolean => {
    if (!isGuest) return true;
    const perm = permissions.find(p => p.page_key === pageKey);
    return perm?.can_edit ?? false;
  }, [isGuest, permissions]);

  const canDelete = useCallback((pageKey: string): boolean => {
    if (!isGuest) return true;
    const perm = permissions.find(p => p.page_key === pageKey);
    return perm?.can_delete ?? false;
  }, [isGuest, permissions]);

  // [2026-07-24] Member grant check — true only for a member with an
  // explicit can_view row (see MEMBER_GRANT_PAGES). Deliberately returns
  // false for admins/super_admins: callers OR this with their existing
  // role check (`isAdmin || hasMemberGrant('/sops')`), so admin access
  // never depends on grant rows existing.
  const hasMemberGrant = useCallback((pageKey: string): boolean => {
    if (!isMember) return false;
    const perm = permissions.find(p => p.page_key === pageKey);
    return perm?.can_view ?? false;
  }, [isMember, permissions]);

  // Pages all users (including guests) can always access
  const ALWAYS_ALLOWED = ['/settings', '/auth'];

  // Check if a path matches any permitted page
  const canAccessPath = useCallback((path: string): boolean => {
    if (!isGuest) return true;
    if (ALWAYS_ALLOWED.some(p => path.startsWith(p))) return true;
    return permissions.some(p => p.can_view && path.startsWith(p.page_key));
  }, [isGuest, permissions]);

  // First page the guest has access to (for redirect)
  const firstAllowedPath = isGuest
    ? (permissions.find(p => p.can_view)?.page_key || null)
    : null;

  return { isGuest, permissions, loading, canView, canEdit, canDelete, canAccessPath, firstAllowedPath, hasMemberGrant };
}
