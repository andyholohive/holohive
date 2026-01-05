'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Shield, Loader2 } from 'lucide-react';
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
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  useEffect(() => {
    fetchTeamMembers();
    checkSuperAdminStatus();
  }, []);

  const checkSuperAdminStatus = async () => {
    const isSuper = await UserService.isCurrentUserSuperAdmin();
    setIsSuperAdmin(isSuper);
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

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);
      
      // Fetch all users except those with guest role
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .neq('role', 'guest')
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

  const filteredTeamMembers = teamMembers.filter(member =>
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

          {filteredTeamMembers.length === 0 ? (
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTeamMembers.map((member) => (
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
                              // Fallback to initials if image fails to load
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 