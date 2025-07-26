'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Users, Megaphone, Crown, PanelLeftClose, PanelLeftOpen, Bell, Settings, LogOut } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

export default function SectionLayout({ children }: { children: React.ReactNode }) {
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
    <ProtectedRoute>
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
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                    <span className="text-sm font-medium">{getUserInitials()}</span>
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
              <nav className="p-4 space-y-2 flex-1">
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
                {/* KOLs tab is now always visible */}
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
    </ProtectedRoute>
  );
} 