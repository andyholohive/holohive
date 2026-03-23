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

  useEffect(() => {
    if (!user?.id || !isGuest) {
      setLoading(false);
      return;
    }
    loadPermissions();
  }, [user?.id, isGuest]);

  const loadPermissions = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('guest_permissions')
        .select('page_key, can_view, can_edit, can_delete')
        .eq('user_id', user.id);
      setPermissions(data || []);
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

  return { isGuest, permissions, loading, canView, canEdit, canDelete, canAccessPath, firstAllowedPath };
}
