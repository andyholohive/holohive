'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Shield, Loader2, UserCheck, UserX, Clock, Ban, Trash2, ChevronDown, ChevronUp, Link2, X, AlertTriangle, Download, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { UserService } from '@/lib/userService';
import { formatDate as fmtDate } from '@/lib/dateFormat';

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

// Map a role string to a centralized BadgeTone so the role pill draws
// from the same palette as the rest of the app (StatusBadge).
const ROLE_TONES: Record<string, BadgeTone> = {
  super_admin: 'purple',
  admin: 'info',
  member: 'neutral',
  guest: 'slate',
};
const formatRoleLabel = (role: string) =>
  role === 'super_admin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1);

// Local initials-avatar — purposefully NOT named `Avatar` so it doesn't
// shadow the shared Radix-based `@/components/ui/avatar` primitive. The
// pending-vs-active sizing + color tint differs per use site so it takes
// a tone prop. Same approach we used on /dashboard.
function InitialsAvatar({
  name,
  src,
  size = 'md',
  tone = 'brand',
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md';
  tone?: 'brand' | 'warning';
}) {
  const initials = (name || '?')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
  const dim = size === 'md' ? 'w-16 h-16 text-xl' : 'w-14 h-14 text-lg';
  const palette = tone === 'warning'
    ? 'bg-amber-200 text-amber-800'
    : 'bg-brand text-white';
  if (src) {
    return (
      <div className={`${dim.split(' ').slice(0, 2).join(' ')} rounded-full overflow-hidden relative shrink-0`}>
        <img
          src={src}
          alt={`${name || 'User'} profile`}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
        <div className={`${dim} ${palette} rounded-full flex items-center justify-center absolute top-0 left-0 hidden font-bold`}>
          {initials}
        </div>
      </div>
    );
  }
  return (
    <div className={`${dim} ${palette} rounded-full flex items-center justify-center shrink-0 font-bold`}>
      {initials}
    </div>
  );
}

export default function TeamPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Pending vs Approved tab — mirrors the Clients page filter pattern.
  // Default to "approved" because that's the steady-state view; the
  // pending tab's count chip draws attention when there's queue.
  const [statusFilter, setStatusFilter] = useState<'approved' | 'pending'>('approved');
  // isAdmin/isSuperAdmin used to live in `useState(false)` and were
  // hydrated by an async `checkAdminStatus()` fetch — that caused the
  // Pending tab to pop in ~300ms after the page loaded (flash of
  // missing tab). They're now derived synchronously from
  // `userProfile.role` (already in memory via AuthContext), so the
  // tab visibility is correct on first paint. `userProfile` may be
  // null for a frame before AuthContext hydrates, but during that
  // frame the page's own `loading` skeleton is rendering, so the
  // user never sees the "Approved-only" tab list flicker.
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [guestPermsOpen, setGuestPermsOpen] = useState<string | null>(null);
  const [guestPerms, setGuestPerms] = useState<Record<string, Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }>>>({});

  // Available private DM chats (chat_type='private') with last-seen
  // timestamp. Used by the super-admin Telegram linking popover on each
  // team member's card. Loaded once on mount; refetched after linking
  // to keep the "already linked to X" disabled-state accurate.
  type TgChatRow = { chat_id: string; title: string | null; last_message_at: string | null };
  const [tgChats, setTgChats] = useState<TgChatRow[]>([]);
  const [linkingMemberId, setLinkingMemberId] = useState<string | null>(null);

  const { toast } = useToast();
  const { userProfile } = useAuth();
  const isSuperAdmin = userProfile?.role === 'super_admin';
  const isAdmin = userProfile?.role === 'super_admin' || userProfile?.role === 'admin';

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
    fetchTgChats();
  }, []);

  // Pull every private DM chat the bot has tracked. Each one is a
  // potential link target for a team member. The team-member card's
  // popover filters out chats already linked to OTHER users so a
  // single chat can only point at one user (matches the unique
  // semantics of users.telegram_id being one TG user per HoloHive user).
  const fetchTgChats = async () => {
    try {
      const { data } = await (supabase as any)
        .from('telegram_chats')
        .select('chat_id, title, last_message_at')
        .eq('chat_type', 'private')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      setTgChats(data || []);
    } catch (err) {
      console.error('Error fetching TG chats:', err);
    }
  };

  // Backfill a telegram_chats row when a member's telegram_id is set
  // but no chat row exists. Calls /api/team/backfill-tg-chat which
  // hits the Telegram getChat API and inserts the result. Most common
  // use case: a member chatted with the bot before tracking was wired
  // (or before the row was lost), so the id is real but unrecorded.
  const [backfillingId, setBackfillingId] = useState<string | null>(null);
  const handleBackfillTgChat = async (member: TeamMember) => {
    if (!isSuperAdmin || !member.telegram_id) return;
    setBackfillingId(member.id);
    try {
      const res = await fetch('/api/team/backfill-tg-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: member.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      toast({
        title: 'Chat backfilled',
        description: `Linked ${json.chat.title || member.telegram_id} via Telegram getChat.`,
      });
      // Refresh chat list so the popover dropdown reflects the new row.
      await fetchTgChats();
    } catch (err: any) {
      toast({
        title: 'Backfill failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBackfillingId(null);
    }
  };

  // Link / unlink a team member's Telegram DM. Pass null to clear.
  // Optimistic — updates local state, then writes via UserService.
  // Reverts on error.
  const handleLinkTelegram = async (member: TeamMember, chatId: string | null) => {
    if (!isSuperAdmin) return;
    setLinkingMemberId(member.id);
    const previous = member.telegram_id;
    setTeamMembers(prev => prev.map(m =>
      m.id === member.id ? { ...m, telegram_id: chatId } : m
    ));
    try {
      const ok = await UserService.updateUserProfile(member.id, { telegram_id: chatId });
      if (!ok) throw new Error('Update returned false');
      toast({
        title: chatId ? 'Telegram linked' : 'Telegram unlinked',
        description: chatId
          ? `${member.name} is now linked to ${tgChats.find(c => c.chat_id === chatId)?.title ?? chatId}`
          : `${member.name}'s Telegram link cleared`,
      });
    } catch (err: any) {
      // Revert
      setTeamMembers(prev => prev.map(m =>
        m.id === member.id ? { ...m, telegram_id: previous } : m
      ));
      toast({ title: 'Link failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setLinkingMemberId(null);
    }
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
        toast({ title: 'Role updated' });
      } else {
        toast({
          title: 'Update failed',
          description: 'Failed to update user role.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update user role',
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
          description: `${member.name} can now access the app.`,
        });
      } else {
        toast({
          title: 'Approve failed',
          description: 'Failed to approve user.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error approving user:', error);
      toast({
        title: 'Approve failed',
        description: error instanceof Error ? error.message : 'Failed to approve user',
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
          description: `${member.name}'s sign-up request rejected.`,
        });
      } else {
        toast({
          title: 'Reject failed',
          description: 'Failed to reject user.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast({
        title: 'Reject failed',
        description: error instanceof Error ? error.message : 'Failed to reject user',
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
          description: `${member.name} can no longer access the app.`,
        });
      } else {
        toast({
          title: 'Deactivate failed',
          description: 'Failed to deactivate user.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deactivating user:', error);
      toast({
        title: 'Deactivate failed',
        description: error instanceof Error ? error.message : 'Failed to deactivate user',
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
          description: `${member.name} removed from the team.`,
        });
      } else {
        toast({
          title: 'Remove failed',
          description: 'Failed to remove user.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Remove failed',
        description: error instanceof Error ? error.message : 'Failed to remove user',
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
          title: 'Load failed',
          description: error instanceof Error ? error.message : 'Failed to fetch team members',
          variant: 'destructive',
        });
        return;
      }

      setTeamMembers(users || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to fetch team members',
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
      perms[p.page_key] = { can_view: p.can_view as boolean, can_edit: p.can_edit as boolean, can_delete: p.can_delete as boolean };
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    return fmtDate(dateString);
  };

  // Derived counts — used both in the tab chips and the SectionHeader
  // counter. Computed on filtered (search-aware) buckets so the count
  // and the visible grid always agree.
  const visibleMembers = statusFilter === 'pending' ? filteredPendingMembers : filteredActiveMembers;
  const totalCount = pendingMembers.length + activeMembers.length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Shield}
        title="Team Members"
        subtitle="Manage your team members"
        kicker="Resources · Team"
        kickerDot="amber"
      />

      {loading ? (
        <div className="space-y-4">
          {/* SectionHeader skeleton — mirrors the loaded layout. */}
          <div className="section-head first flex items-center gap-3">
            <span className="dot bg-brand/30" aria-hidden />
            <Skeleton className="h-3 w-24" />
            <span className="flex-1 h-px bg-cream-200" aria-hidden />
            <Skeleton className="h-3 w-32" />
          </div>
          {/* Filter toolbar skeleton — tabs left, search right. */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 p-1 rounded-md bg-cream-100 border border-cream-200">
              <Skeleton className="h-8 w-24 rounded" />
              <Skeleton className="h-8 w-20 rounded" />
            </div>
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
              <Input placeholder="Search team members..." className="pl-10 focus-brand" disabled />
            </div>
          </div>
          {/* Member card skeleton grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="crd-hover flex flex-col h-full">
                <CardHeader className="pb-2">
                  <div className="flex flex-col items-center text-center">
                    <Skeleton className="h-16 w-16 rounded-full mb-3" />
                    <Skeleton className="h-5 w-32 mb-1.5" />
                    <Skeleton className="h-3 w-40 mb-3" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1 space-y-3">
                  {Array.from({ length: 3 }).map((__, j) => (
                    <div key={j} className="flex items-center justify-between">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  ))}
                  <div className="mt-auto pt-3 border-t border-cream-100 flex gap-2">
                    <Skeleton className="h-8 flex-1 rounded-md" />
                    <Skeleton className="h-8 flex-1 rounded-md" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── Members ──────────────────────────────────────────────
              Single SectionHeader carries the chapter rhythm; the
              filter toolbar (tabs left, search right) sits beneath
              it the same way it does on /clients. The Pending tab
              uses an amber accent so a queue draws attention; the
              Approved tab uses the brand teal. */}
          <div className="space-y-4">
            <SectionHeader
              label="Members"
              dot="violet"
              counter={`${visibleMembers.length} of ${totalCount} ${statusFilter === 'pending' ? 'pending' : 'approved'}`}
              first
            />

            {/* Filter toolbar — tabs (left) + search (right) */}
            <div className="flex items-center gap-3 flex-wrap">
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'approved' | 'pending')}>
                <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
                  <TabsTrigger
                    value="approved"
                    className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card px-4 py-2"
                  >
                    Approved
                    <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full pointer-events-none">{activeMembers.length}</span>
                  </TabsTrigger>
                  {/* Pending is admin-only — non-admins shouldn't see
                      a queue they can't action. The tab is hidden
                      entirely, not just disabled, to keep the toolbar
                      tidy for members/guests. */}
                  {isAdmin && (
                    <TabsTrigger
                      value="pending"
                      className="data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-card px-4 py-2"
                    >
                      <Clock className="h-3.5 w-3.5 mr-1.5" />
                      Pending
                      <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full pointer-events-none">{pendingMembers.length}</span>
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                <Input
                  placeholder="Search team members..."
                  className="pl-10 focus-brand"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

          {/* ── Pending tab ── admin-only; non-admins can't reach
              this tab so the gate is "statusFilter === pending" only. */}
          {statusFilter === 'pending' && isAdmin && (
            filteredPendingMembers.length === 0 ? (
              <EmptyState
                icon={Clock}
                title={searchTerm ? 'No pending requests match' : 'No pending requests'}
                description={searchTerm
                  ? 'Try adjusting your search terms.'
                  : 'New sign-ups will appear here for approval.'}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPendingMembers.map((member) => (
                  // Chrome is identical to the approved card — same Card
                  // shell, same avatar tone, same cream-100 dividers.
                  // The only thing that flags the row as pending is the
                  // pulse-dot "Pending approval" StatusBadge + the
                  // Approve/Reject action row. Amber tint dropped per
                  // 2026-06-02 design pass so the two card states
                  // visually align in the grid.
                  <Card key={member.id} className="crd-hover group flex flex-col h-full">
                    <CardHeader className="pb-2">
                      <div className="flex flex-col items-center text-center">
                        <div className="mb-3">
                          <InitialsAvatar
                            name={member.name || member.email}
                            src={member.profile_photo_url}
                            size="md"
                            tone="brand"
                          />
                        </div>
                        <h3 className="text-base font-semibold text-ink-warm-900 tracking-tight">
                          {member.name || 'Unnamed User'}
                        </h3>
                        <p className="text-sm text-ink-warm-500 mt-0.5">{member.email}</p>
                        <div className="mt-2">
                          <StatusBadge tone="warning" size="sm" bordered withDot="pulse">
                            Pending approval
                          </StatusBadge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1">
                      <div className="space-y-3 mb-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-ink-warm-500">Signed up</span>
                          <span className="font-medium text-ink-warm-900 tabular-nums">
                            {formatDate(member.created_at)}
                          </span>
                        </div>
                        <div>
                          <label className="text-[11px] mono uppercase tracking-[0.14em] text-ink-warm-500 mb-1 block">Assign Role</label>
                          <Select
                            value={pendingRoles[member.id] || member.role}
                            onValueChange={(value) =>
                              setPendingRoles(prev => ({ ...prev, [member.id]: value }))
                            }
                          >
                            <SelectTrigger className="h-9 text-sm focus-brand">
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
                      </div>
                      {/* Approve / Reject pinned to bottom so action row
                          aligns across cards in the grid. */}
                      <div className="mt-auto pt-3 border-t border-cream-100 flex gap-2">
                        <Button
                          variant="brand"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleApprove(member)}
                          disabled={approvingId === member.id || rejectingId === member.id}
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
                          // The outline variant's hover:text-accent-foreground
                          // was stripped at the source (2026-06-03 audit) so
                          // text-rose-600 holds on hover without needing an
                          // inline override.
                          className="flex-1 border-rose-300 text-rose-600 hover:bg-rose-50"
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
            )
          )}

          {/* ── Approved tab ── default view; visible to all roles. */}
          {statusFilter === 'approved' && (
            filteredActiveMembers.length === 0 ? (
              <EmptyState
                icon={Shield}
                title={searchTerm ? 'No team members found' : 'No team members yet'}
                description={searchTerm
                  ? 'Try adjusting your search terms.'
                  : 'Team members will appear here once they\'re approved.'}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredActiveMembers.map((member) => (
                  <Card key={member.id} className="crd-hover group flex flex-col h-full">
                    <CardHeader className="pb-2">
                      <div className="flex flex-col items-center text-center">
                        <div className="mb-3">
                          <InitialsAvatar
                            name={member.name || member.email}
                            src={member.profile_photo_url}
                            size="md"
                            tone="brand"
                          />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-ink-warm-900 tracking-tight">
                            {member.name || 'Unnamed User'}
                          </h3>
                          <p className="text-sm text-ink-warm-500 mt-0.5">{member.email}</p>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {isSuperAdmin && member.id !== userProfile?.id ? (
                            <div className="relative">
                              {updatingRoleId === member.id && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded z-10">
                                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                                </div>
                              )}
                              <Select
                                value={member.role}
                                onValueChange={(value) => handleRoleChange(member.id, value)}
                                disabled={updatingRoleId === member.id}
                              >
                                <SelectTrigger className="h-8 text-xs w-[120px] focus-brand">
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
                            <StatusBadge tone={ROLE_TONES[member.role] ?? 'neutral'} size="sm" bordered>
                              {formatRoleLabel(member.role)}
                            </StatusBadge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1 space-y-3">
                      {/* Join Date */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-warm-500">Joined</span>
                        <span className="font-medium text-ink-warm-900 tabular-nums">
                          {formatDate(member.created_at)}
                        </span>
                      </div>

                      {/* Status row removed — Approved tab already
                          filters by `is_active === true`, so the row
                          always read "Active" and added vertical noise. */}

                      {/* Telegram link. Read-only for everyone except
                          super_admin. Super admin: opens a popover with
                          a Select of private DM chats. Chats already
                          linked to OTHER users render disabled with the
                          owner's name to avoid dupes. The chat's
                          chat_id IS the user's Telegram user_id (1:1
                          chats — chat_id equals the other party's user
                          id), so it goes straight into users.telegram_id. */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-warm-500">Telegram</span>
                        {(() => {
                          // Three states for the trigger:
                          //   linked   — telegram_id set AND a matching telegram_chats row exists. Emerald.
                          //   orphan   — telegram_id set but NO chat row. Amber. "Backfill" button in popover.
                          //   unlinked — telegram_id null. Rose.
                          const matchedChat = member.telegram_id
                            ? tgChats.find(c => c.chat_id === member.telegram_id)
                            : null;
                          const state: 'linked' | 'orphan' | 'unlinked' =
                            !member.telegram_id ? 'unlinked'
                              : matchedChat ? 'linked'
                                : 'orphan';

                          if (!isSuperAdmin) {
                            return (
                              <span className={`font-medium ${
                                state === 'linked' ? 'text-emerald-600'
                                  : state === 'orphan' ? 'text-amber-600'
                                  : 'text-rose-600'
                              }`}>
                                {state === 'linked' ? 'Connected'
                                  : state === 'orphan' ? 'ID set, no DM tracked'
                                  : 'Disconnected'}
                              </span>
                            );
                          }

                          return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2 text-sm font-medium ${
                                  state === 'linked' ? 'text-emerald-600'
                                    : state === 'orphan' ? 'text-amber-600'
                                    : 'text-rose-600'
                                }`}
                                disabled={linkingMemberId === member.id}
                              >
                                {linkingMemberId === member.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : state === 'linked' ? (
                                  <>
                                    <Link2 className="h-3.5 w-3.5 mr-1" />
                                    {matchedChat?.title}
                                  </>
                                ) : state === 'orphan' ? (
                                  <>
                                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                    No DM tracked
                                  </>
                                ) : (
                                  <>Link…</>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 p-4">
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-semibold text-ink-warm-900 uppercase tracking-wider">
                                    {state === 'orphan' ? 'Backfill' : 'Link'} {member.name}'s Telegram
                                  </p>
                                  <p className="text-xs text-ink-warm-500 mt-1">
                                    {state === 'orphan'
                                      ? `Telegram ID ${member.telegram_id} is saved but the bot has no DM record. Pull it from Telegram, or pick a different chat below.`
                                      : 'Pick the private chat the bot has with this person.'}
                                  </p>
                                </div>

                                {/* Orphan-state action: backfill via getChat. */}
                                {state === 'orphan' && (
                                  <Button
                                    variant="brand"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => handleBackfillTgChat(member)}
                                    disabled={backfillingId === member.id}
                                  >
                                    {backfillingId === member.id ? (
                                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                    ) : (
                                      <Download className="h-3.5 w-3.5 mr-1.5" />
                                    )}
                                    Backfill chat from bot
                                  </Button>
                                )}

                                <Select
                                  value={member.telegram_id ?? 'none'}
                                  onValueChange={(v) => handleLinkTelegram(member, v === 'none' ? null : v)}
                                >
                                  <SelectTrigger className="focus-brand">
                                    <SelectValue placeholder="No chat linked" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">— Unlinked</SelectItem>
                                    {tgChats.map(chat => {
                                      // A chat already linked to a DIFFERENT user
                                      // is disabled — keeps the (chat_id → user)
                                      // mapping unique and surfaces who took it.
                                      const linkedTo = teamMembers.find(
                                        m => m.telegram_id === chat.chat_id && m.id !== member.id
                                      );
                                      return (
                                        <SelectItem
                                          key={chat.chat_id}
                                          value={chat.chat_id}
                                          disabled={!!linkedTo}
                                        >
                                          {chat.title || '(untitled)'}
                                          {linkedTo && (
                                            <span className="text-ink-warm-400 ml-1">
                                              (linked to {linkedTo.name})
                                            </span>
                                          )}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                                {member.telegram_id && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-rose-600 hover:bg-rose-50"
                                    onClick={() => handleLinkTelegram(member, null)}
                                  >
                                    <X className="h-3.5 w-3.5 mr-1.5" />
                                    Unlink
                                  </Button>
                                )}
                                {tgChats.length === 0 && state === 'unlinked' && (
                                  // Cream tile + amber AlertTriangle icon
                                  // preserves the "needs attention" cue
                                  // while letting the popover chrome stay
                                  // on the v11 cream/ink-warm palette.
                                  // Previously the entire tile was amber-50
                                  // which made the popover feel like two
                                  // unrelated surfaces stitched together.
                                  <div className="rounded-md bg-cream-50 border border-cream-200 p-2.5 flex items-start gap-2">
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <p className="text-xs text-ink-warm-700">
                                      No private DM chats tracked yet. Ask {member.name} to send a message to the bot first, then refresh.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          );
                        })()}
                      </div>

                      {/* X ID */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-warm-500">X</span>
                        <span className={`font-medium ${member.x_id ? 'text-ink-warm-900' : 'text-rose-600'}`}>
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
                          <span className="text-sm text-ink-warm-500">Last Updated</span>
                          <span className="font-medium text-ink-warm-900">
                            {formatDate(member.updated_at)}
                          </span>
                        </div>
                      )}

                      {/* Admin actions: Deactivate / Remove.
                          `mt-auto` pushes the action row to the bottom
                          of the card so the divider + buttons align
                          across cards in the grid regardless of how
                          much content sits above (telegram state,
                          X handle, last-updated row all vary). */}
                      {isAdmin && member.id !== userProfile?.id && (
                        <div className="mt-auto pt-3 border-t border-cream-100 space-y-2">
                          {confirmDeleteId === member.id ? (
                            <div className="space-y-2">
                              <p className="text-xs text-rose-600 text-center font-medium">
                                Are you sure? This cannot be undone.
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleDeleteMember(member)}
                                  disabled={deletingId === member.id}
                                  variant="destructive"
                                  className="flex-1"
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
                                className="flex-1 border-rose-300 text-rose-600 hover:bg-rose-50"
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
                        <Collapsible
                          open={guestPermsOpen === member.id}
                          onOpenChange={(open) => {
                            if (open) {
                              setGuestPermsOpen(member.id);
                              if (!guestPerms[member.id]) loadGuestPerms(member.id);
                            } else {
                              setGuestPermsOpen(null);
                            }
                          }}
                          className="pt-2 border-t border-cream-100"
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex items-center justify-between w-full text-sm font-medium text-ink-warm-700 py-1 h-auto px-0 hover:bg-transparent"
                            >
                              <span>Page Permissions</span>
                              {guestPermsOpen === member.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 space-y-1">
                              <div className="grid grid-cols-[1fr,auto,auto,auto] gap-x-2 text-[11px] text-ink-warm-500 uppercase tracking-wider pb-1 border-b border-cream-100">
                                <span>Page</span>
                                <span className="w-12 text-center">View</span>
                                <span className="w-12 text-center">Edit</span>
                                <span className="w-12 text-center">Delete</span>
                              </div>
                              {GUEST_PAGES.map(page => {
                                const perms = guestPerms[member.id]?.[page.key] || { can_view: false, can_edit: false, can_delete: false };
                                return (
                                  <div key={page.key} className="grid grid-cols-[1fr,auto,auto,auto] gap-x-2 items-center py-0.5">
                                    <span className="text-xs text-ink-warm-700">{page.label}</span>
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
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          )}
          </div>
        </>
      )}
    </div>
  );
}
