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

  // ─── Nav-item helpers ──────────────────────────────────────────────
  // Extract the repeated <Link><Button>...</Button></Link> pattern that
  // appears 24 times in the main nav and 7 times in the Tasks sub-nav.
  // Per-item gating (guestHide / role checks) stays at the call site —
  // these helpers only own rendering, so the gating logic remains
  // visible and easy to audit.
  //
  // Why local closures instead of separate exports: they capture
  // pathname + isSidebarCollapsed from the parent component scope so
  // call sites don't have to thread those props through every item.
  // Sidebar is the only consumer; if we ever build a mobile-drawer
  // nav, these become a candidate for extraction.

  /** A single top-level nav item. */
  const NavItem = ({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }) => {
    const isActive = pathname.startsWith(href);
    return (
      <Link href={href} legacyBehavior>
        <Button
          asChild
          variant={isActive ? 'default' : 'ghost'}
          className={`w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'} hover:opacity-90`}
          style={isActive ? { backgroundColor: '#3e8692', color: 'white' } : {}}
          title={isSidebarCollapsed ? label : undefined}
        >
          <span>
            <Icon className={`h-4 w-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} />
            {!isSidebarCollapsed && label}
          </span>
        </Button>
      </Link>
    );
  };

  /** A nested item under a NavItem (currently used by the Tasks
   *  sub-nav). Smaller, indented, uses 'secondary' variant for active
   *  state instead of the brand-color default. `exact` matches the
   *  pathname exactly (for "/tasks") rather than starts-with (for
   *  "/tasks/admin" etc.). */
  const SubNavItem = ({
    href,
    icon: Icon,
    label,
    exact = false,
  }: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    exact?: boolean;
  }) => {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link href={href} legacyBehavior>
        <Button
          asChild
          variant={isActive ? 'secondary' : 'ghost'}
          className="w-full justify-start h-7 text-xs"
        >
          <span>
            <Icon className="h-3.5 w-3.5 mr-2" />
            {label}
          </span>
        </Button>
      </Link>
    );
  };

  /** Visual section divider: small icon + horizontal rule. Hidden when
   *  the sidebar is collapsed (icons-only mode would just show a
   *  random floating icon, which is noise). */
  const SectionDivider = ({
    icon: Icon,
  }: {
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    if (isSidebarCollapsed) return null;
    return (
      <div className="flex items-center space-x-2">
        <Icon className="h-4 w-4 text-gray-400" />
        <div className="flex-1 h-px bg-gray-200"></div>
      </div>
    );
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
              {!userProfile ? (
                <div className="space-y-3 py-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
                </div>
              ) : <>
              {/* Holo GPT — top of sidebar, hidden for guests */}
              {!guestHideAlways && (
                <div className="space-y-2">
                  <NavItem href="/chat" icon={Sparkles} label="Holo GPT" />
                </div>
              )}

              {/* People Section */}
              {!guestHideSection(['/clients']) && (
                <>
                  <SectionDivider icon={User} />
                  <div className="space-y-2">
                    {!isGuest && <NavItem href="/team" icon={Shield} label="Team" />}
                    {!guestHide('/clients') && <NavItem href="/clients" icon={Users} label="Clients" />}
                  </div>
                </>
              )}

              {/* KOLs Section */}
              {!guestHideSection(['/kols', '/lists', '/campaigns']) && (
                <>
                  <SectionDivider icon={Crown} />
                  <div className="space-y-2">
                    {!guestHide('/kols') && <NavItem href="/kols" icon={Crown} label="KOLs" />}
                    {!guestHide('/lists') && <NavItem href="/lists" icon={List} label="Lists" />}
                    {!guestHide('/campaigns') && <NavItem href="/campaigns" icon={Megaphone} label="Campaigns" />}
                  </div>
                </>
              )}

              {/* CRM Section */}
              {!guestHideSection(['/crm/sales-pipeline', '/intelligence', '/crm/network', '/crm/contacts', '/crm/submissions', '/crm/meetings']) && (
                <>
                  <SectionDivider icon={DollarSign} />
                  <div className="space-y-2">
                    {!guestHide('/crm/sales-pipeline') && <NavItem href="/crm/sales-pipeline" icon={Target} label="Sales" />}
                    {!guestHide('/intelligence') && <NavItem href="/intelligence" icon={Radar} label="Intelligence" />}
                    {/* Analytics — team dashboard with KPIs, pipeline funnel,
                        owner workload, recent activity, health alerts.
                        Reads /api/analytics/dashboard in one call. */}
                    {!guestHide('/analytics') && <NavItem href="/analytics" icon={BarChart3} label="Analytics" />}
                    {!guestHide('/crm/network') && <NavItem href="/crm/network" icon={Handshake} label="Network" />}
                    {!guestHide('/crm/contacts') && <NavItem href="/crm/contacts" icon={UserPlus} label="Contacts" />}
                    {!guestHide('/crm/submissions') && <NavItem href="/crm/submissions" icon={Inbox} label="Submissions" />}
                    {!guestHide('/crm/meetings') && <NavItem href="/crm/meetings" icon={Calendar} label="Meetings" />}
                    {userProfile?.role === 'super_admin' && <NavItem href="/crm/telegram" icon={MessageSquare} label="TG Chats" />}
                  </div>
                </>
              )}

              {/* Workspace Section */}
              {!guestHideSection(['/daily-standup', '/tasks']) && (
                <>
                  <SectionDivider icon={Briefcase} />
                  <div className="space-y-2">
                    <NavItem href="/daily-standup" icon={CheckCircle} label="Daily Stand-Up" />
                    <NavItem href="/tasks" icon={ListTodo} label="Tasks" />
                    {/* Task sub-nav — visible only when expanded AND on a /tasks route */}
                    {!isSidebarCollapsed && pathname.startsWith('/tasks') && (
                      <div className="pl-6 space-y-0.5">
                        <SubNavItem href="/tasks" icon={ListTodo} label="All Tasks" exact />
                        <SubNavItem href="/tasks/my-dashboard" icon={LayoutDashboard} label="My Dashboard" exact />
                        <SubNavItem href="/tasks/deliverables" icon={Target} label="Deliverables" />
                        {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                          <>
                            <SubNavItem href="/tasks/admin" icon={ShieldCheck} label="Admin Overview" exact />
                            <SubNavItem href="/tasks/automations" icon={Zap} label="Automations" exact />
                            <SubNavItem href="/tasks/templates" icon={FileText} label="Templates" exact />
                            <SubNavItem href="/tasks/deliverables/templates" icon={Sliders} label="Deliverable Templates" exact />
                          </>
                        )}
                      </div>
                    )}
                    <NavItem href="/reminders" icon={Bell} label="Reminders" />
                  </div>
                </>
              )}

              {/* Documents Section */}
              {!guestHideSection(['/delivery-logs', '/links']) && (
                <>
                  <SectionDivider icon={FileText} />
                  <div className="space-y-2">
                    {!guestHide('/delivery-logs') && <NavItem href="/delivery-logs" icon={ClipboardList} label="Delivery Logs" />}
                    {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && <NavItem href="/mindshare" icon={TrendingUp} label="Mindshare" />}
                    {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && <NavItem href="/forms" icon={ClipboardList} label="Forms" />}
                    {!guestHide('/links') && <NavItem href="/links" icon={Link2} label="Links" />}
                    {!guestHideAlways && <NavItem href="/templates" icon={MessageSquare} label="Templates" />}
                    {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && <NavItem href="/sops" icon={BookOpen} label="SOPs" />}
                  </div>
                </>
              )}

              {/* Admin Section — hidden for guests */}
              {!guestHideAlways && (
                <>
                  <SectionDivider icon={Settings} />
                  <div className="space-y-2">
                    <NavItem href="/admin/field-options" icon={Sliders} label="Field Options" />
                    {/* Claude MCP Cookbook — reference page for the AI
                        connector (example prompts for every tool). Sits
                        in the Admin section because it's a settings/help-
                        style item, but visible to everyone since the
                        connector itself is. */}
                    <NavItem href="/mcp" icon={Bot} label="Claude MCP" />
                    {userProfile?.role === 'super_admin' && <NavItem href="/admin/changelog" icon={Sparkles} label="Changelog" />}
                    <NavItem href="/archive" icon={Archive} label="Archive" />
                  </div>
                </>
              )}

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