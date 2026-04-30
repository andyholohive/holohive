'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Users, Megaphone, Crown, List, Building2, PanelLeftClose, PanelLeftOpen, Settings, LogOut, Shield, MessageSquare, Zap, User, FileText, ClipboardList, Sliders, DollarSign, TrendingUp, Handshake, UserPlus, Archive, Sparkles, Link2, ChevronLeft, ChevronRight, BookOpen, CheckCircle, Briefcase, ListTodo, Target, Inbox, Calendar, LayoutDashboard, ShieldCheck, ChevronDown, Bell, Radar, Bot, BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChangelog } from '@/contexts/ChangelogContext';
import { useGuestPermissions } from '@/hooks/useGuestPermissions';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  children: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, signOut, loading: authLoading } = useAuth();
  const { isGuest, canView, loading: guestLoading } = useGuestPermissions();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sidebarCollapsed');
      return stored === 'true';
    }
    return false;
  });
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [changelogPage, setChangelogPage] = useState(0);
  const changelogsPerPage = 3;

  // Get changelog data from context (fetched once at app level)
  const { changelogs, latestVersion } = useChangelog();

  // Format date for changelog display
  const formatChangelogDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Render changelog content
  const renderChangelogContent = (content: string) => {
    return content.split('\n').map((line, index) => {
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <li key={index} className="ml-4 text-gray-700 text-sm">
            {line.trim().substring(2)}
          </li>
        );
      }
      if (line.trim().startsWith('### ')) {
        return (
          <h4 key={index} className="font-semibold text-gray-900 mt-3 mb-1 text-sm">
            {line.trim().substring(4)}
          </h4>
        );
      }
      if (line.trim().startsWith('## ')) {
        return (
          <h3 key={index} className="font-bold text-gray-900 mt-4 mb-2 text-sm">
            {line.trim().substring(3)}
          </h3>
        );
      }
      if (line.trim() === '') {
        return <div key={index} className="h-2" />;
      }
      return (
        <p key={index} className="text-gray-700 text-sm">
          {line}
        </p>
      );
    });
  };

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed(prev => {
      localStorage.setItem('sidebarCollapsed', String(!prev));
      return !prev;
    });
  };

  // Helper function to get user initials
  const getUserInitials = () => {
    if (userProfile?.name) {
      return userProfile.name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2);
    }
    return userProfile?.email?.charAt(0).toUpperCase() || 'U';
  };

  // For guests: don't show any restricted nav until permissions are loaded
  const isGuestUser = userProfile?.role === 'guest';
  const guestStillLoading = isGuestUser && guestLoading;

  // Helper: hide nav items guests can't access (or still loading)
  const guestHide = (pageKey: string) => guestStillLoading || (isGuestUser && !canView(pageKey));

  // Helper: hide entire sections when guest has no access to any item in it
  const guestHideSection = (pageKeys: string[]) => guestStillLoading || (isGuestUser && pageKeys.every(k => !canView(k)));

  // Helper: hide items that guests should never see
  const guestHideAlways = guestStillLoading || isGuestUser;

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <Image src="/images/logo.png" alt="Logo" width={36} height={36} />
              <span className="ml-2 text-xl font-semibold text-gray-800">Holo Hive</span>
              {latestVersion && (
                <Badge
                  variant="secondary"
                  className="ml-2 cursor-pointer bg-[#3e8692]/10 text-[#3e8692] hover:bg-[#3e8692]/20 transition-colors"
                  onClick={() => setIsChangelogOpen(true)}
                >
                  v{latestVersion}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 rounded-full hover:bg-transparent active:bg-transparent focus:bg-transparent focus-visible:ring-0 data-[state=open]:bg-transparent"
                >
                  <Avatar className="h-8 w-8">
                    {userProfile?.profile_photo_url ? (
                      <AvatarImage src={userProfile.profile_photo_url} alt={userProfile?.name || userProfile?.email || 'User'} />
                    ) : null}
                    <AvatarFallback className="bg-gray-200 text-gray-800 text-xs font-semibold">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-300 ease-in-out`}>
          <div className="flex flex-col h-full">
            {/* Navigation */}
            <nav className="p-4 space-y-4 flex-1 overflow-y-auto">
              {!userProfile ? (
                <div className="space-y-3 py-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
                </div>
              ) : <>
              {/* Holo GPT - Top of sidebar — hidden for guests */}
              {!guestHideAlways && (<div className="space-y-2">
                <Link href="/chat" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/chat') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/chat') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Holo GPT' : undefined}
                  >
                    <span>
                      <Sparkles className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Holo GPT'}
                    </span>
                  </Button>
                </Link>
              </div>)}

              {/* People Section */}
              {!guestHideSection(['/clients']) && <>
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* Team tab — hidden for guests */}
                {!isGuest && (<Link href="/team" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/team') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/team') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Team' : undefined}
                  >
                    <span>
                      <Shield className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Team'}
                    </span>
                  </Button>
                </Link>)}
                {/* Clients tab */}
                {!guestHide('/clients') && (
                  <Link href="/clients" legacyBehavior>
                    <Button
                      asChild
                      variant={pathname.startsWith('/clients') ? 'default' : 'ghost'}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                      style={pathname.startsWith('/clients') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                      title={isSidebarCollapsed ? 'Clients' : undefined}
                    >
                      <span>
                        <Users className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                        {!isSidebarCollapsed && 'Clients'}
                      </span>
                    </Button>
                  </Link>
                )}
              </div>
              </>}

              {/* KOLs Section */}
              {!guestHideSection(['/kols', '/lists', '/campaigns']) && <>
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <Crown className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* KOLs tab */}
                {!guestHide('/kols') && (<Link href="/kols" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/kols') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/kols') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'KOLs' : undefined}
                  >
                    <span>
                      <Crown className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'KOLs'}
                    </span>
                  </Button>
                </Link>)}
                {/* Lists tab */}
                {!guestHide('/lists') && (<Link href="/lists" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/lists') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/lists') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Lists' : undefined}
                  >
                    <span>
                      <List className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Lists'}
                    </span>
                  </Button>
                </Link>)}
                {/* Campaigns tab */}
                {!guestHide('/campaigns') && (<Link href="/campaigns" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/campaigns') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/campaigns') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Campaigns' : undefined}
                  >
                    <span>
                      <Megaphone className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Campaigns'}
                    </span>
                  </Button>
                </Link>)}
              </div>
              </>}

              {/* CRM Section */}
              {!guestHideSection(['/crm/sales-pipeline', '/intelligence', '/crm/network', '/crm/contacts', '/crm/submissions', '/crm/meetings']) && <>
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* Sales Pipeline tab */}
                {!guestHide('/crm/sales-pipeline') && (<Link href="/crm/sales-pipeline" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/crm/sales-pipeline') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/crm/sales-pipeline') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Sales' : undefined}
                  >
                    <span>
                      <Target className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Sales'}
                    </span>
                  </Button>
                </Link>)}
                {/* Intelligence tab */}
                {!guestHide('/intelligence') && (<Link href="/intelligence" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/intelligence') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/intelligence') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Intelligence' : undefined}
                  >
                    <span>
                      <Radar className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Intelligence'}
                    </span>
                  </Button>
                </Link>)}
                {/* Analytics — team dashboard with KPIs, pipeline funnel,
                    owner workload, recent activity, health alerts. Reads
                    /api/analytics/dashboard in one call. */}
                {!guestHide('/analytics') && (<Link href="/analytics" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/analytics') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/analytics') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Analytics' : undefined}
                  >
                    <span>
                      <BarChart3 className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Analytics'}
                    </span>
                  </Button>
                </Link>)}
                {/* Network tab */}
                {!guestHide('/crm/network') && (<Link href="/crm/network" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/crm/network') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/crm/network') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Network' : undefined}
                  >
                    <span>
                      <Handshake className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Network'}
                    </span>
                  </Button>
                </Link>)}
                {/* Contacts tab */}
                {!guestHide('/crm/contacts') && (<Link href="/crm/contacts" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/crm/contacts') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/crm/contacts') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Contacts' : undefined}
                  >
                    <span>
                      <UserPlus className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Contacts'}
                    </span>
                  </Button>
                </Link>)}
                {/* Submissions tab */}
                {!guestHide('/crm/submissions') && (<Link href="/crm/submissions" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/crm/submissions') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/crm/submissions') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Submissions' : undefined}
                  >
                    <span>
                      <Inbox className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Submissions'}
                    </span>
                  </Button>
                </Link>)}
                {/* Meetings tab */}
                {!guestHide('/crm/meetings') && (<Link href="/crm/meetings" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/crm/meetings') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/crm/meetings') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Meetings' : undefined}
                  >
                    <span>
                      <Calendar className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Meetings'}
                    </span>
                  </Button>
                </Link>)}
                {/* Telegram Chats tab - Super Admin only */}
                {userProfile?.role === 'super_admin' && (
                  <Link href="/crm/telegram" legacyBehavior>
                    <Button
                      asChild
                      variant={pathname.startsWith('/crm/telegram') ? 'default' : 'ghost'}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                      style={pathname.startsWith('/crm/telegram') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                      title={isSidebarCollapsed ? 'TG Chats' : undefined}
                    >
                      <span>
                        <MessageSquare className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                        {!isSidebarCollapsed && 'TG Chats'}
                      </span>
                    </Button>
                  </Link>
                )}
              </div>
              </>}

              {/* Workspace Section */}
              {!guestHideSection(['/daily-standup', '/tasks']) && (
                <>
                  {!isSidebarCollapsed && (
                    <div className="flex items-center space-x-2">
                      <Briefcase className="h-4 w-4 text-gray-400" />
                      <div className="flex-1 h-px bg-gray-200"></div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {/* Daily Stand-Up tab */}
                    <Link href="/daily-standup" legacyBehavior>
                      <Button
                        asChild
                        variant={pathname.startsWith('/daily-standup') ? 'default' : 'ghost'}
                        className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                        style={pathname.startsWith('/daily-standup') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                        title={isSidebarCollapsed ? 'Daily Stand-Up' : undefined}
                      >
                        <span>
                          <CheckCircle className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                          {!isSidebarCollapsed && 'Daily Stand-Up'}
                        </span>
                      </Button>
                    </Link>
                    {/* Tasks tab */}
                    <Link href="/tasks" legacyBehavior>
                      <Button
                        asChild
                        variant={pathname.startsWith('/tasks') ? 'default' : 'ghost'}
                        className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                        style={pathname.startsWith('/tasks') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                        title={isSidebarCollapsed ? 'Tasks' : undefined}
                      >
                        <span>
                          <ListTodo className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                          {!isSidebarCollapsed && 'Tasks'}
                        </span>
                      </Button>
                    </Link>
                    {/* Task sub-nav */}
                    {!isSidebarCollapsed && pathname.startsWith('/tasks') && (
                      <div className="pl-6 space-y-0.5">
                        <Link href="/tasks" legacyBehavior>
                          <Button
                            asChild
                            variant={pathname === '/tasks' ? 'secondary' : 'ghost'}
                            className="w-full justify-start h-7 text-xs"
                          >
                            <span>
                              <ListTodo className="h-3.5 w-3.5 mr-2" />
                              All Tasks
                            </span>
                          </Button>
                        </Link>
                        <Link href="/tasks/my-dashboard" legacyBehavior>
                          <Button
                            asChild
                            variant={pathname === '/tasks/my-dashboard' ? 'secondary' : 'ghost'}
                            className="w-full justify-start h-7 text-xs"
                          >
                            <span>
                              <LayoutDashboard className="h-3.5 w-3.5 mr-2" />
                              My Dashboard
                            </span>
                          </Button>
                        </Link>
                        <Link href="/tasks/deliverables" legacyBehavior>
                          <Button
                            asChild
                            variant={pathname.startsWith('/tasks/deliverables') ? 'secondary' : 'ghost'}
                            className="w-full justify-start h-7 text-xs"
                          >
                            <span>
                              <Target className="h-3.5 w-3.5 mr-2" />
                              Deliverables
                            </span>
                          </Button>
                        </Link>
                        {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                          <>
                            <Link href="/tasks/admin" legacyBehavior>
                              <Button
                                asChild
                                variant={pathname === '/tasks/admin' ? 'secondary' : 'ghost'}
                                className="w-full justify-start h-7 text-xs"
                              >
                                <span>
                                  <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                                  Admin Overview
                                </span>
                              </Button>
                            </Link>
                            <Link href="/tasks/automations" legacyBehavior>
                              <Button
                                asChild
                                variant={pathname === '/tasks/automations' ? 'secondary' : 'ghost'}
                                className="w-full justify-start h-7 text-xs"
                              >
                                <span>
                                  <Zap className="h-3.5 w-3.5 mr-2" />
                                  Automations
                                </span>
                              </Button>
                            </Link>
                            <Link href="/tasks/templates" legacyBehavior>
                              <Button
                                asChild
                                variant={pathname === '/tasks/templates' ? 'secondary' : 'ghost'}
                                className="w-full justify-start h-7 text-xs"
                              >
                                <span>
                                  <FileText className="h-3.5 w-3.5 mr-2" />
                                  Templates
                                </span>
                              </Button>
                            </Link>
                            <Link href="/tasks/deliverables/templates" legacyBehavior>
                              <Button
                                asChild
                                variant={pathname === '/tasks/deliverables/templates' ? 'secondary' : 'ghost'}
                                className="w-full justify-start h-7 text-xs"
                              >
                                <span>
                                  <Sliders className="h-3.5 w-3.5 mr-2" />
                                  Deliverable Templates
                                </span>
                              </Button>
                            </Link>
                          </>
                        )}
                      </div>
                    )}
                    {/* Reminders tab */}
                    <Link href="/reminders" legacyBehavior>
                      <Button
                        asChild
                        variant={pathname.startsWith('/reminders') ? 'default' : 'ghost'}
                        className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                        style={pathname.startsWith('/reminders') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                        title={isSidebarCollapsed ? 'Reminders' : undefined}
                      >
                        <span>
                          <Bell className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                          {!isSidebarCollapsed && 'Reminders'}
                        </span>
                      </Button>
                    </Link>
                  </div>
                </>
              )}

              {/* Documents Section */}
              {!guestHideSection(['/delivery-logs', '/links']) && <>
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* Delivery Logs tab */}
                {!guestHide('/delivery-logs') && (<Link href="/delivery-logs" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/delivery-logs') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/delivery-logs') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Delivery Logs' : undefined}
                  >
                    <span>
                      <ClipboardList className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Delivery Logs'}
                    </span>
                  </Button>
                </Link>)}
                {/* Mindshare Monitor - Admin only */}
                {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                  <Link href="/mindshare" legacyBehavior>
                    <Button
                      asChild
                      variant={pathname.startsWith('/mindshare') ? 'default' : 'ghost'}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                      style={pathname.startsWith('/mindshare') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                      title={isSidebarCollapsed ? 'Mindshare' : undefined}
                    >
                      <span>
                        <TrendingUp className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                        {!isSidebarCollapsed && 'Mindshare'}
                      </span>
                    </Button>
                  </Link>
                )}
                {/* Forms tab - Admin only */}
                {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                  <Link href="/forms" legacyBehavior>
                    <Button
                      asChild
                      variant={pathname.startsWith('/forms') ? 'default' : 'ghost'}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                      style={pathname.startsWith('/forms') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                      title={isSidebarCollapsed ? 'Forms' : undefined}
                    >
                      <span>
                        <ClipboardList className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                        {!isSidebarCollapsed && 'Forms'}
                      </span>
                    </Button>
                  </Link>
                )}
                {/* Links tab */}
                {!guestHide('/links') && (<Link href="/links" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/links') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/links') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Links' : undefined}
                  >
                    <span>
                      <Link2 className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Links'}
                    </span>
                  </Button>
                </Link>)}
                {/* Templates tab — hidden for guests */}
                {!guestHideAlways && (
                  <Link href="/templates" legacyBehavior>
                    <Button
                      asChild
                      variant={pathname.startsWith('/templates') ? 'default' : 'ghost'}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                      style={pathname.startsWith('/templates') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                      title={isSidebarCollapsed ? 'Templates' : undefined}
                    >
                      <span>
                        <MessageSquare className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                        {!isSidebarCollapsed && 'Templates'}
                      </span>
                    </Button>
                  </Link>
                )}
                {/* SOPs tab - Admin only */}
                {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                  <Link href="/sops" legacyBehavior>
                    <Button
                      asChild
                      variant={pathname.startsWith('/sops') ? 'default' : 'ghost'}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                      style={pathname.startsWith('/sops') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                      title={isSidebarCollapsed ? 'SOPs' : undefined}
                    >
                      <span>
                        <BookOpen className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                        {!isSidebarCollapsed && 'SOPs'}
                      </span>
                    </Button>
                  </Link>
                )}
              </div>
              </>}

              {/* Admin Section — hidden for guests */}
              {!guestHideAlways && (<>
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <Settings className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* Field Options tab */}
                <Link href="/admin/field-options" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/admin/field-options') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/admin/field-options') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Field Options' : undefined}
                  >
                    <span>
                      <Sliders className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Field Options'}
                    </span>
                  </Button>
                </Link>
                {/* Claude MCP Cookbook — reference page for the AI connector
                    (example prompts for every tool). Sits in the Admin
                    section because it's a settings/help-style item, but
                    visible to everyone since the connector itself is. */}
                <Link href="/mcp" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/mcp') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/mcp') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Claude MCP' : undefined}
                  >
                    <span>
                      <Bot className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Claude MCP'}
                    </span>
                  </Button>
                </Link>
                {/* Changelog tab - Super Admin only */}
                {userProfile?.role === 'super_admin' && (
                  <Link href="/admin/changelog" legacyBehavior>
                    <Button
                      asChild
                      variant={pathname.startsWith('/admin/changelog') ? 'default' : 'ghost'}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                      style={pathname.startsWith('/admin/changelog') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                      title={isSidebarCollapsed ? 'Changelog' : undefined}
                    >
                      <span>
                        <Sparkles className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                        {!isSidebarCollapsed && 'Changelog'}
                      </span>
                    </Button>
                  </Link>
                )}
                {/* Archive tab */}
                <Link href="/archive" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/archive') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/archive') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Archive' : undefined}
                  >
                    <span>
                      <Archive className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Archive'}
                    </span>
                  </Button>
                </Link>
              </div>
              </>)}

              </>}
            </nav>
            {/* Collapse Button at Bottom */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSidebarToggle}
                  className="hover:bg-gray-100 w-auto px-2"
                  title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {isSidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4 text-gray-600" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4 text-gray-600" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </aside>
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {/* Changelog History Dialog */}
      <Dialog open={isChangelogOpen} onOpenChange={(open) => {
        setIsChangelogOpen(open);
        if (open) setChangelogPage(0);
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#3e8692]" />
              <DialogTitle className="text-xl">Changelog</DialogTitle>
            </div>
            <DialogDescription>
              Version history and updates
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-6">
              {changelogs
                .slice(changelogPage * changelogsPerPage, (changelogPage + 1) * changelogsPerPage)
                .map((changelog, idx) => (
                <div key={changelog.id} className={idx > 0 ? 'border-t pt-6' : ''}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant="secondary"
                      className="bg-[#3e8692]/10 text-[#3e8692]"
                    >
                      v{changelog.version}
                    </Badge>
                    {changelog.published_at && (
                      <span className="text-sm text-gray-500">
                        {formatChangelogDate(changelog.published_at)}
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 mb-2">
                    {changelog.title}
                  </h3>
                  <div className="space-y-1">
                    {renderChangelogContent(changelog.content)}
                  </div>
                </div>
              ))}
              {changelogs.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No changelogs available yet.
                </p>
              )}
            </div>
          </ScrollArea>
          {changelogs.length > changelogsPerPage && (
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChangelogPage(p => Math.max(0, p - 1))}
                disabled={changelogPage === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {changelogPage + 1} of {Math.ceil(changelogs.length / changelogsPerPage)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChangelogPage(p => Math.min(Math.ceil(changelogs.length / changelogsPerPage) - 1, p + 1))}
                disabled={changelogPage >= Math.ceil(changelogs.length / changelogsPerPage) - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 