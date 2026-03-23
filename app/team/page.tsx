'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Shield, Loader2, UserCheck, UserX, Clock, Ban, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { UserService } from '@/lib/userService';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: boolean;
  telegram_id?: string | null;
  x_id?: string | null;
  profile_photo_url?: string | null;
}

export default function TeamPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [guestPermsOpen, setGuestPermsOpen] = useState<string | null>(null);
  const [guestPerms, setGuestPerms] = useState<Record<string, Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }>>>({});
  const { toast } = useToast();
  const { userProfile } = useAuth();

  const GUEST_PAGES = [
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
  ];

  useEffect(() => {
    fetchTeamMembers();
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    const isSuper = await UserService.isCurrentUserSuperAdmin();
    const isAdm = await UserService.isCurrentUserAdmin();
    setIsSuperAdmin(isSuper);
    setIsAdmin(isAdm);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!isSuperAdmin) return;

    setUpdatingRoleId(userId);
    try {
      const success = await UserService.updateUserRole(
        userId,
        newRole as 'super_admin' | 'admin' | 'member' | 'guest'
      );

      if (success) {
        setTeamMembers(prev =>
          prev.map(member =>
            member.id === userId ? { ...member, role: newRole } : member
          )
        );
        toast({
          title: 'Role updated',
          description: 'User role has been updated successfully.',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update user role.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user role.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleApprove = async (member: TeamMember) => {
    setApprovingId(member.id);
    try {
      const selectedRole = pendingRoles[member.id] || member.role;
      // Update role if changed, then activate
      if (selectedRole !== member.role) {
        await UserService.updateUserRole(
          member.id,
          selectedRole as 'super_admin' | 'admin' | 'member' | 'guest'
        );
      }
      const success = await UserService.activateUser(member.id);
      if (success) {
        setTeamMembers(prev =>
          prev.map(m =>
            m.id === member.id ? { ...m, is_active: true, role: selectedRole } : m
          )
        );
        toast({
          title: 'User approved',
          description: `${member.name} has been approved and can now access the app.`,
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to approve user.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error approving user:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve user.',
        variant: 'destructive',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (member: TeamMember) => {
    setRejectingId(member.id);
    try {
      const success = await UserService.deleteUser(member.id);
      if (success) {
        setTeamMembers(prev => prev.filter(m => m.id !== member.id));
        toast({
          title: 'User rejected',
          description: `${member.name}'s sign-up request has been rejected.`,
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to reject user.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject user.',
        variant: 'destructive',
      });
    } finally {
      setRejectingId(null);
    }
  };

  const handleDeactivate = async (member: TeamMember) => {
    setDeactivatingId(member.id);
    try {
      const success = await UserService.deactivateUser(member.id);
      if (success) {
        setTeamMembers(prev =>
          prev.map(m =>
            m.id === member.id ? { ...m, is_active: false } : m
          )
        );
        toast({
          title: 'User deactivated',
          description: `${member.name} has been deactivated and can no longer access the app.`,
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to deactivate user.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deactivating user:', error);
      toast({
        title: 'Error',
        description: 'Failed to deactivate user.',
        variant: 'destructive',
      });
    } finally {
      setDeactivatingId(null);
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    setDeletingId(member.id);
    try {
      const success = await UserService.deleteUser(member.id);
      if (success) {
        setTeamMembers(prev => prev.filter(m => m.id !== member.id));
        setConfirmDeleteId(null);
        toast({
          title: 'User removed',
          description: `${member.name} has been removed from the team.`,
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to remove user.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove user.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);

      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching team members:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch team members.',
          variant: 'destructive',
        });
        return;
      }

      setTeamMembers(users || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch team members.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadGuestPerms = async (userId: string) => {
    const { data } = await supabase.from('guest_permissions').select('*').eq('user_id', userId);
    const perms: Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }> = {};
    for (const p of (data || [])) {
      perms[p.page_key] = { can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete };
    }
    setGuestPerms(prev => ({ ...prev, [userId]: perms }));
  };

  const toggleGuestPerm = async (userId: string, pageKey: string, field: 'can_view' | 'can_edit' | 'can_delete') => {
    const current = guestPerms[userId]?.[pageKey] || { can_view: false, can_edit: false, can_delete: false };
    const newVal = !current[field];

    // If disabling view, disable edit and delete too
    const updates = { ...current, [field]: newVal };
    if (field === 'can_view' && !newVal) {
      updates.can_edit = false;
      updates.can_delete = false;
    }
    // If enabling edit or delete, enable view too
    if ((field === 'can_edit' || field === 'can_delete') && newVal) {
      updates.can_view = true;
    }

    setGuestPerms(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [pageKey]: updates }
    }));

    // Upsert to DB
    const { data: existing } = await supabase.from('guest_permissions').select('id').eq('user_id', userId).eq('page_key', pageKey).single();
    if (existing) {
      await supabase.from('guest_permissions').update(updates).eq('id', existing.id);
    } else {
      await supabase.from('guest_permissions').insert({ user_id: userId, page_key: pageKey, ...updates });
    }
  };

  const pendingMembers = teamMembers.filter(m => !m.is_active);
  const activeMembers = teamMembers.filter(m => m.is_active);

  const filteredActiveMembers = activeMembers.filter(member =>
    member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPendingMembers = pendingMembers.filter(member =>
    member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50">
        <div className="w-full">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Team Members</h2>
                <p className="text-gray-600">Manage your team members</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Search team members..." className="pl-10 auth-input" disabled />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader className="pb-4">
                    <div className="flex flex-col items-center text-center">
                      <Skeleton className="h-16 w-16 rounded-full mb-3" />
                      <div className="mb-2">
                        <Skeleton className="h-6 w-32 mb-2" />
                        <Skeleton className="h-4 w-48 mb-2" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50">
      <div className="w-full">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Team Members</h2>
              <p className="text-gray-600">Manage your team members</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search team members..."
                className="pl-10 auth-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Pending Approval Section */}
          {isAdmin && filteredPendingMembers.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-amber-800">
                  Pending Approval ({filteredPendingMembers.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPendingMembers.map((member) => (
                  <Card key={member.id} className="border-amber-200 bg-amber-50/50">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col items-center text-center">
                        {member.profile_photo_url ? (
                          <div className="w-14 h-14 rounded-full overflow-hidden mb-2 relative">
                            <img
                              src={member.profile_photo_url}
                              alt={`${member.name || 'User'} profile`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="w-14 h-14 bg-amber-200 rounded-full flex items-center justify-center absolute top-0 left-0 hidden">
                              <span className="text-amber-800 font-bold text-lg">
                                {getUserInitials(member.name || member.email)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-14 h-14 bg-amber-200 rounded-full flex items-center justify-center mb-2">
                            <span className="text-amber-800 font-bold text-lg">
                              {getUserInitials(member.name || member.email)}
                            </span>
                          </div>
                        )}
                        <h3 className="font-semibold text-gray-900">
                          {member.name || 'Unnamed User'}
                        </h3>
                        <p className="text-sm text-gray-500">{member.email}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Signed up {formatDate(member.created_at)}
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Assign Role</label>
                        <Select
                          value={pendingRoles[member.id] || member.role}
                          onValueChange={(value) =>
                            setPendingRoles(prev => ({ ...prev, [member.id]: value }))
                          }
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="guest">Guest</SelectItem>
                            {isSuperAdmin && (
                              <SelectItem value="super_admin">Super Admin</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApprove(member)}
                          disabled={approvingId === member.id || rejectingId === member.id}
                          className="flex-1 text-white hover:opacity-90"
                          style={{ backgroundColor: '#3e8692' }}
                          size="sm"
                        >
                          {approvingId === member.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4 mr-1" />
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleReject(member)}
                          disabled={approvingId === member.id || rejectingId === member.id}
                          variant="outline"
                          className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                          size="sm"
                        >
                          {rejectingId === member.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <UserX className="h-4 w-4 mr-1" />
                              Reject
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Active Members Section */}
          {filteredActiveMembers.length === 0 && filteredPendingMembers.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? 'No team members found' : 'No team members yet'}
              </h3>
              <p className="text-gray-600">
                {searchTerm
                  ? 'Try adjusting your search terms.'
                  : 'Team members will appear here.'
                }
              </p>
            </div>
          ) : (
            <>
              {isAdmin && filteredPendingMembers.length > 0 && (
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-700">
                    Active Members ({filteredActiveMembers.length})
                  </h3>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredActiveMembers.map((member) => (
                  <Card key={member.id}>
                    <CardHeader className="pb-4">
                      <div className="flex flex-col items-center text-center">
                        {member.profile_photo_url ? (
                          <div className="w-16 h-16 rounded-full overflow-hidden mb-3 relative">
                            <img
                              src={member.profile_photo_url}
                              alt={`${member.name || 'User'} profile`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="w-16 h-16 bg-gradient-to-br from-[#3e8692] to-[#2d6470] rounded-full flex items-center justify-center absolute top-0 left-0 hidden">
                              <span className="text-white font-bold text-xl">
                                {getUserInitials(member.name || member.email)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-16 h-16 bg-gradient-to-br from-[#3e8692] to-[#2d6470] rounded-full flex items-center justify-center mb-3">
                            <span className="text-white font-bold text-xl">
                              {getUserInitials(member.name || member.email)}
                            </span>
                          </div>
                        )}
                        <div className="mb-2">
                          <h3 className="font-semibold text-gray-900 text-lg">
                            {member.name || 'Unnamed User'}
                          </h3>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isSuperAdmin && member.id !== userProfile?.id ? (
                            <div className="relative">
                              {updatingRoleId === member.id && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded z-10">
                                  <Loader2 className="h-4 w-4 animate-spin text-[#3e8692]" />
                                </div>
                              )}
                              <Select
                                value={member.role}
                                onValueChange={(value) => handleRoleChange(member.id, value)}
                                disabled={updatingRoleId === member.id}
                              >
                                <SelectTrigger className="h-7 text-xs w-[120px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="super_admin">Super Admin</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="member">Member</SelectItem>
                                  <SelectItem value="guest">Guest</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              member.role === 'super_admin'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {member.role === 'super_admin'
                                ? 'Super Admin'
                                : member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Join Date */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Join Date</span>
                        <span className="font-medium text-gray-900">
                          {formatDate(member.created_at)}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Status</span>
                        <span className="font-medium text-gray-900">
                          {member.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {/* Telegram Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Telegram</span>
                        <span className={`font-medium ${member.telegram_id ? 'text-green-600' : 'text-red-600'}`}>
                          {member.telegram_id ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>

                      {/* X ID */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">X</span>
                        <span className={`font-medium ${member.x_id ? 'text-gray-900' : 'text-red-600'}`}>
                          {member.x_id ? (
                            <a
                              href={`https://x.com/${member.x_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              @{member.x_id}
                            </a>
                          ) : (
                            'Not set'
                          )}
                        </span>
                      </div>

                      {/* Last Updated */}
                      {member.updated_at && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Last Updated</span>
                          <span className="font-medium text-gray-900">
                            {formatDate(member.updated_at)}
                          </span>
                        </div>
                      )}

                      {/* Admin actions: Deactivate / Remove */}
                      {isAdmin && member.id !== userProfile?.id && (
                        <div className="pt-2 border-t border-gray-100 space-y-2">
                          {confirmDeleteId === member.id ? (
                            <div className="space-y-2">
                              <p className="text-xs text-red-600 text-center font-medium">
                                Are you sure? This cannot be undone.
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleDeleteMember(member)}
                                  disabled={deletingId === member.id}
                                  variant="outline"
                                  className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                                  size="sm"
                                >
                                  {deletingId === member.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    'Confirm Remove'
                                  )}
                                </Button>
                                <Button
                                  onClick={() => setConfirmDeleteId(null)}
                                  variant="outline"
                                  className="flex-1"
                                  size="sm"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleDeactivate(member)}
                                disabled={deactivatingId === member.id}
                                variant="outline"
                                className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                                size="sm"
                              >
                                {deactivatingId === member.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Ban className="h-3 w-3 mr-1" />
                                    Deactivate
                                  </>
                                )}
                              </Button>
                              <Button
                                onClick={() => setConfirmDeleteId(member.id)}
                                variant="outline"
                                className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                                size="sm"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Guest Permissions */}
                      {member.role === 'guest' && isAdmin && (
                        <div className="pt-2 border-t border-gray-100">
                          <button
                            className="flex items-center justify-between w-full text-sm font-medium text-gray-700 py-1 cursor-pointer"
                            onClick={() => {
                              if (guestPermsOpen === member.id) {
                                setGuestPermsOpen(null);
                              } else {
                                setGuestPermsOpen(member.id);
                                if (!guestPerms[member.id]) loadGuestPerms(member.id);
                              }
                            }}
                          >
                            <span>Page Permissions</span>
                            {guestPermsOpen === member.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          {guestPermsOpen === member.id && (
                            <div className="mt-2 space-y-1">
                              <div className="grid grid-cols-[1fr,auto,auto,auto] gap-x-2 text-[10px] text-gray-500 uppercase tracking-wider pb-1 border-b border-gray-100">
                                <span>Page</span>
                                <span className="w-12 text-center">View</span>
                                <span className="w-12 text-center">Edit</span>
                                <span className="w-12 text-center">Delete</span>
                              </div>
                              {GUEST_PAGES.map(page => {
                                const perms = guestPerms[member.id]?.[page.key] || { can_view: false, can_edit: false, can_delete: false };
                                return (
                                  <div key={page.key} className="grid grid-cols-[1fr,auto,auto,auto] gap-x-2 items-center py-0.5">
                                    <span className="text-xs text-gray-700">{page.label}</span>
                                    <div className="w-12 flex justify-center">
                                      <Checkbox checked={perms.can_view} onCheckedChange={() => toggleGuestPerm(member.id, page.key, 'can_view')} />
                                    </div>
                                    <div className="w-12 flex justify-center">
                                      <Checkbox checked={perms.can_edit} onCheckedChange={() => toggleGuestPerm(member.id, page.key, 'can_edit')} />
                                    </div>
                                    <div className="w-12 flex justify-center">
                                      <Checkbox checked={perms.can_delete} onCheckedChange={() => toggleGuestPerm(member.id, page.key, 'can_delete')} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
