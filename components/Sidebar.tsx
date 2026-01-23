'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Users, Megaphone, Crown, List, Building2, PanelLeftClose, PanelLeftOpen, Settings, LogOut, Shield, MessageSquare, Zap, User, FileText, ClipboardList, Sliders, DollarSign, TrendingUp, Handshake, UserPlus, Archive, Sparkles, Link2, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChangelog } from '@/contexts/ChangelogContext';
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
  const { userProfile, signOut } = useAuth();
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
              {/* Holo GPT - Top of sidebar */}
              <div className="space-y-2">
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
              </div>

              {/* People Section */}
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* Team tab */}
                <Link href="/team" legacyBehavior>
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
                </Link>
                {/* Clients tab */}
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
              </div>

              {/* KOLs Section */}
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <Crown className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* KOLs tab */}
                <Link href="/kols" legacyBehavior>
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
                </Link>
                {/* Lists tab */}
                <Link href="/lists" legacyBehavior>
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
                </Link>
                {/* Campaigns tab */}
                <Link href="/campaigns" legacyBehavior>
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
                </Link>
              </div>

              {/* CRM Section */}
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* Pipeline tab */}
                <Link href="/crm/pipeline" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/crm/pipeline') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/crm/pipeline') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Pipeline' : undefined}
                  >
                    <span>
                      <TrendingUp className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Pipeline'}
                    </span>
                  </Button>
                </Link>
                {/* Network tab */}
                <Link href="/crm/network" legacyBehavior>
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
                </Link>
                {/* Contacts tab */}
                <Link href="/crm/contacts" legacyBehavior>
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
                </Link>
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

              {/* Documents Section */}
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
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
                <Link href="/links" legacyBehavior>
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
                </Link>
                {/* Templates tab */}
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

              {/* Admin Section */}
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