'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Users, Megaphone, Crown, List, Building2, PanelLeftClose, PanelLeftOpen, Bell, Settings, LogOut, Shield, MessageSquare, Zap, User, FileText, ClipboardList, Sliders, DollarSign, TrendingUp, Handshake, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface SidebarProps {
  children: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const { userProfile, signOut } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sidebarCollapsed');
      return stored === 'true';
    }
    return false;
  });

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
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm">
              <Bell className="h-4 w-4" />
            </Button>
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
                <DropdownMenuItem onClick={() => {}}>
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
            <nav className="p-4 space-y-4 flex-1">
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
                {/* Partners tab */}
                <Link href="/partners" legacyBehavior>
                  <Button
                    asChild
                    variant={pathname.startsWith('/partners') ? 'default' : 'ghost'}
                    className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
                    style={pathname.startsWith('/partners') ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                    title={isSidebarCollapsed ? 'Partners' : undefined}
                  >
                    <span>
                      <Building2 className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                      {!isSidebarCollapsed && 'Partners'}
                    </span>
                  </Button>
                </Link>
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
              </div>

              {/* CRM Section */}
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
                {/* Pipeline tab (disabled) */}
                <Button
                  variant="ghost"
                  className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} opacity-50 cursor-not-allowed`}
                  title={isSidebarCollapsed ? 'Pipeline' : undefined}
                  disabled
                >
                  <div className={`flex items-center whitespace-nowrap ${isSidebarCollapsed ? '' : ''}`}>
                    <TrendingUp className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                    {!isSidebarCollapsed && <span>Pipeline</span>}
                  </div>
                </Button>
                {/* Network tab (disabled) */}
                <Button
                  variant="ghost"
                  className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} opacity-50 cursor-not-allowed`}
                  title={isSidebarCollapsed ? 'Network' : undefined}
                  disabled
                >
                  <div className={`flex items-center whitespace-nowrap ${isSidebarCollapsed ? '' : ''}`}>
                    <Handshake className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                    {!isSidebarCollapsed && <span>Network</span>}
                  </div>
                </Button>
                {/* Contacts tab (disabled) */}
                <Button
                  variant="ghost"
                  className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} opacity-50 cursor-not-allowed`}
                  title={isSidebarCollapsed ? 'Contacts' : undefined}
                  disabled
                >
                  <div className={`flex items-center whitespace-nowrap ${isSidebarCollapsed ? '' : ''}`}>
                    <UserPlus className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                    {!isSidebarCollapsed && <span>Contacts</span>}
                  </div>
                </Button>
              </div>

              {/* Documents Section */}
              {!isSidebarCollapsed && (
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
              )}
              <div className="space-y-2">
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
                {/* Forms tab */}
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
                {/* AI Insights tab (disabled) */}
                <Button
                  variant="ghost"
                  className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} opacity-50 cursor-not-allowed`}
                  title={isSidebarCollapsed ? 'AI Insights' : undefined}
                  disabled
                >
                  <div className={`flex items-center whitespace-nowrap ${isSidebarCollapsed ? '' : ''}`}>
                    <Zap className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
                    {!isSidebarCollapsed && <span>AI Insights</span>}
                  </div>
                </Button>
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
    </div>
  );
} 