'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Calendar, Video, MoreHorizontal, XCircle, Copy, List, CalendarDays,
  ChevronLeft, ChevronRight, ArrowLeft, CheckCircle2, UserX, User,
} from 'lucide-react';
import { BookingService, Booking } from '@/lib/bookingService';
import { UserService } from '@/lib/userService';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  format, isSameMonth, isSameDay, addMonths, subMonths,
} from 'date-fns';

type TabFilter = 'upcoming' | 'past' | 'cancelled';
type ViewMode = 'table' | 'calendar';

export default function MeetingsPage() {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('upcoming');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // User picker — admins can view any teammate's meetings; everyone
  // else is locked to their own. 'me' is a sentinel that means
  // "current user", so we don't have to wait for userProfile to render.
  const [users, setUsers] = useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [viewUserId, setViewUserId] = useState<string>('me');
  const { toast } = useToast();

  useEffect(() => {
    loadBookings();
  }, [viewUserId, userProfile?.id]);

  // Load the user list once admins have arrived. Skip for non-admins
  // (they can't change the picker anyway).
  useEffect(() => {
    if (!isAdmin) return;
    // Active users only — pending sign-ups + deactivated teammates
    // would clutter the picker without being valid targets. Use
    // getAllUsers() only on /team where managing those users is the
    // whole point.
    UserService.getActiveUsers()
      .then(rows => setUsers(rows.map(u => ({ id: u.id, name: u.name, email: u.email }))))
      .catch(err => console.error('Error loading user list:', err));
  }, [isAdmin]);

  async function loadBookings() {
    try {
      setLoading(true);
      const targetUserId = viewUserId === 'me' ? (userProfile?.id || null) : viewUserId;
      const data = targetUserId
        ? await BookingService.getBookingsForUser(targetUserId)
        : await BookingService.getMyBookings();
      setBookings(data);
    } catch (err) {
      console.error('Error loading bookings:', err);
      toast({ title: 'Load failed', description: err instanceof Error ? err.message : 'Failed to load bookings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  /**
   * Render the status cell. Behavior depends on context:
   *   - cancelled        → danger StatusBadge (terminal)
   *   - upcoming         → success StatusBadge
   *   - past + held      → success StatusBadge with revert dropdown
   *   - past + no_show   → danger StatusBadge with revert dropdown
   *   - past + pending   → warning StatusBadge + inline [Held] [No-show] buttons
   *
   * The pending-state UI is the whole point of this column on the past tab —
   * it nudges the rep to record attendance so the metrics dashboard works.
   *
   * 2026-06-03 v11 pass: all inline `bg-X-100 text-X-800` pills replaced
   * with `<StatusBadge>` so the tones come from the shared 9-tone palette.
   */
  function renderAttendanceCell(booking: Booking) {
    if (booking.status === 'cancelled') {
      return <StatusBadge tone="danger" size="sm">Cancelled</StatusBadge>;
    }
    const isPast = booking.meeting_date < today;
    if (!isPast) {
      return <StatusBadge tone="success" size="sm">Confirmed</StatusBadge>;
    }
    // Past + confirmed
    if (booking.attendance_status === 'held') {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex">
              <StatusBadge tone="success" size="sm">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Held
              </StatusBadge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={() => markAttendance(booking, 'no_show')}>
              <UserX className="h-3.5 w-3.5 mr-2" /> Change to No-show
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => markAttendance(booking, null)} className="text-ink-warm-500">
              Clear
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    if (booking.attendance_status === 'no_show') {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex">
              <StatusBadge tone="danger" size="sm">
                <UserX className="h-3 w-3 mr-1" />
                No-show
              </StatusBadge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={() => markAttendance(booking, 'held')}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Change to Held
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => markAttendance(booking, null)} className="text-ink-warm-500">
              Clear
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    // Past + confirmed + no attendance recorded
    return (
      <div className="flex items-center gap-1">
        <StatusBadge tone="warning" size="sm">Pending</StatusBadge>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-50"
          title="Mark as held"
          onClick={() => markAttendance(booking, 'held')}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-rose-600 hover:bg-rose-50"
          title="Mark as no-show"
          onClick={() => markAttendance(booking, 'no_show')}
        >
          <UserX className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (activeTab === 'cancelled') return b.status === 'cancelled';
      if (activeTab === 'upcoming') return b.status === 'confirmed' && b.meeting_date >= today;
      if (activeTab === 'past') return b.status === 'confirmed' && b.meeting_date < today;
      return true;
    });
  }, [bookings, activeTab, today]);

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await BookingService.cancelBooking(cancelTarget.id);
      setBookings((prev) =>
        prev.map((b) => (b.id === cancelTarget.id ? { ...b, status: 'cancelled' as const } : b))
      );
      toast({ title: 'Meeting cancelled', description: `Cancelled meeting with ${cancelTarget.booker_name}.` });
    } catch (err) {
      toast({ title: 'Cancel failed', description: err instanceof Error ? err.message : 'Failed to cancel meeting', variant: 'destructive' });
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  }

  function copyMeetLink(link: string) {
    navigator.clipboard.writeText(link);
    toast({ title: 'Copied', description: 'Meet link copied to clipboard.' });
  }

  /**
   * Mark a past meeting as held / no-show. Used by the outreach metrics
   * dashboard to compute show rate. Optimistic update with revert-on-error.
   */
  async function markAttendance(booking: Booking, status: 'held' | 'no_show' | null) {
    const previous = booking.attendance_status;
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, attendance_status: status } : b));
    try {
      await BookingService.markAttendance(booking.id, status);
      toast({
        title: status === 'held' ? 'Marked as held' : status === 'no_show' ? 'Marked as no-show' : 'Cleared attendance',
      });
    } catch (err) {
      console.error(err);
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, attendance_status: previous } : b));
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(time: string) {
    // time is "HH:MM:SS" or "HH:MM"
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: bookings.filter((b) => b.status === 'confirmed' && b.meeting_date >= today).length },
    { key: 'past', label: 'Past', count: bookings.filter((b) => b.status === 'confirmed' && b.meeting_date < today).length },
    { key: 'cancelled', label: 'Cancelled', count: bookings.filter((b) => b.status === 'cancelled').length },
  ];

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [calendarMonth]);

  function getMeetingsForDate(date: Date): Booking[] {
    const dateStr = format(date, 'yyyy-MM-dd');
    return filtered.filter((b) => b.meeting_date === dateStr);
  }

  const selectedDateMeetings = selectedDate ? getMeetingsForDate(selectedDate) : [];

  // Tab label for the SectionHeader counter — null-safe.
  const tabLabel = activeTab === 'upcoming' ? 'upcoming'
    : activeTab === 'past' ? 'past'
    : 'cancelled';

  // Header actions — split into "loaded" + "loading" so the admin
  // user-picker doesn't pop in after data arrives. During loading
  // `users` hasn't been fetched yet (separate useEffect), so the
  // loaded headerActions would short-circuit to undefined for admins
  // even though a picker WILL render once the user list lands. The
  // loading branch instead renders a Skeleton of the same width so
  // the title-strip layout stays stable.
  const headerActions = (
    isAdmin && users.length > 1 ? (
      <Select value={viewUserId} onValueChange={setViewUserId}>
        {/* w-auto + min/max — Radix Select doesn't auto-fit to the
            widest option, so the trigger used to be a fixed `w-56`
            (224px) which felt cavernous next to "My meetings". This
            sizes to the current value with a sensible floor + ceiling:
            shrinks for short labels, grows for long teammate names,
            caps at 16rem so a very long name can't shove the row. */}
        <SelectTrigger className="h-9 w-auto min-w-[10rem] max-w-[16rem] text-sm focus-brand">
          <User className="h-3.5 w-3.5 mr-1.5 text-ink-warm-400 flex-shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="me">My meetings</SelectItem>
          {users
            .filter(u => u.id !== userProfile?.id)
            .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
            .map(u => (
              <SelectItem key={u.id} value={u.id}>
                {u.name || u.email}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    ) : undefined
  );

  // Placeholder for the user picker while data + user list are
  // streaming in. Only renders for admins since non-admins never
  // see a picker on this page.
  const loadingHeaderActions = isAdmin
    ? <Skeleton className="h-9 w-40 rounded-md" />
    : undefined;

  // ── Loading branch ────────────────────────────────────────────────
  // Structural skeleton mirroring the loaded layout: PageHeader (same
  // kicker) → SectionHeader skeleton → filter row skeleton → table
  // skeleton. Pre-v11 just had a bare title + 3 button skeletons +
  // one tall block, so the layout used to shift when data arrived.
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Calendar}
          title="Meetings"
          subtitle="View and manage your booked meetings."
          kicker="CRM · Meetings"
          kickerDot="brand"
          actions={loadingHeaderActions}
        />

        <div className="space-y-4">
          {/* SectionHeader skeleton */}
          <div className="section-head first flex items-center gap-3">
            <span className="dot bg-brand/30" aria-hidden />
            <Skeleton className="h-3 w-24" />
            <span className="flex-1 h-px bg-cream-200" aria-hidden />
            <Skeleton className="h-3 w-40" />
          </div>

          {/* Filter toolbar — tabs (left) + view toggle (right). The
              left strip matches the loaded TabsList chrome (cream-100
              outer, no `gap-1` between segments). The right toggle
              matches the v11 segmented control shape (h-8 px-3). */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex bg-cream-100 p-1 rounded-md border border-cream-200">
              <Skeleton className="h-8 w-28 rounded" />
              <Skeleton className="h-8 w-20 rounded" />
              <Skeleton className="h-8 w-28 rounded" />
            </div>
            <div className="flex bg-cream-100 p-1 rounded-md border border-cream-200">
              <Skeleton className="h-8 w-12 rounded" />
              <Skeleton className="h-8 w-12 rounded" />
            </div>
          </div>

          {/* Table skeleton — v11 header strip + 5 body rows. 9
              columns to match the loaded table (Date · Time · Booker
              Name · Booker Email · Status · Meet Link · Notes ·
              Opportunity · Actions). Previously had 8 cells, which
              made the last column shift left when data arrived. */}
          <Card className="overflow-hidden">
            <div className="border-b border-cream-200 bg-cream-50/80 py-2.5 px-5 flex items-center gap-3">
              <Skeleton className="h-3 w-12" />{/* Date */}
              <Skeleton className="h-3 w-12" />{/* Time */}
              <Skeleton className="h-3 w-20" />{/* Booker Name */}
              <Skeleton className="h-3 flex-1 max-w-[140px]" />{/* Booker Email */}
              <Skeleton className="h-3 w-12" />{/* Status */}
              <Skeleton className="h-3 w-16" />{/* Meet Link */}
              <Skeleton className="h-3 flex-1 max-w-[100px]" />{/* Notes */}
              <Skeleton className="h-3 w-20" />{/* Opportunity */}
              <Skeleton className="h-3 w-6" />{/* Actions */}
            </div>
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3.5 px-5 border-b border-cream-100 last:border-0">
                  <Skeleton className="h-4 w-32" />{/* Date "Mon, Jan 5, 2026" */}
                  <Skeleton className="h-4 w-28 tabular-nums" />{/* Time "10:30 AM – 11:00 AM" */}
                  <Skeleton className="h-4 w-28" />{/* Booker Name */}
                  <Skeleton className="h-4 flex-1 max-w-[160px]" />{/* Email */}
                  <Skeleton className="h-5 w-20 rounded-md" />{/* Status pill */}
                  <Skeleton className="h-7 w-14 rounded-md" />{/* Join button */}
                  <Skeleton className="h-4 flex-1 max-w-[120px]" />{/* Notes */}
                  <Skeleton className="h-4 w-24" />{/* Opportunity name */}
                  <Skeleton className="h-7 w-7 rounded-md" />{/* Actions ⋯ */}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── Loaded branch ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Calendar}
        title="Meetings"
        subtitle={viewUserId === 'me'
          ? 'View and manage your booked meetings.'
          : `Viewing ${(users.find(u => u.id === viewUserId)?.name || 'teammate')}'s booked meetings.`}
        kicker="CRM · Meetings"
        kickerDot="brand"
        actions={headerActions}
      />

      <div className="space-y-4">
        {/* v11 chapter divider — counter reflects the active tab so the
            "{N} of {M} bookings · upcoming" reads like a status line. */}
        <SectionHeader
          label="Bookings"
          dot="brand"
          counter={`${filtered.length} of ${bookings.length} bookings · ${tabLabel}`}
          first
        />

        {/* v11 filter toolbar — Tabs (left, with brand-light count
            chips) + view-mode toggle (right). The previous version
            used an unstyled tabs strip + a `border rounded-md p-0.5`
            view toggle that didn't match the new tab chrome. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)}>
            <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
                >
                  {tab.label}
                  <span className="text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full ml-2 tabular-nums">
                    {tab.count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* v11 segmented control — matches /lists + /campaigns
              view-mode toggles. Ghost Button with explicit active
              styling (bg-white shadow-card text-brand) and an
              inactive hover (text-ink-warm-700) so the segment
              behaves like the standard toggle elsewhere in the app
              instead of using variant="brand" which gave the active
              segment the heavier btn-brand shadow + gradient. */}
          <div className="flex bg-cream-100 p-1 rounded-md border border-cream-200">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-3 ${
                viewMode === 'table'
                  ? 'bg-white shadow-card text-brand'
                  : 'text-ink-warm-500 hover:bg-cream-200 hover:text-ink-warm-700'
              }`}
              onClick={() => { setViewMode('table'); setSelectedDate(null); }}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-3 ${
                viewMode === 'calendar'
                  ? 'bg-white shadow-card text-brand'
                  : 'text-ink-warm-500 hover:bg-cream-200 hover:text-ink-warm-700'
              }`}
              onClick={() => setViewMode('calendar')}
              title="Calendar view"
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Table View */}
        {viewMode === 'table' && (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Date</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Time</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Booker Name</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Booker Email</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Status</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Meet Link</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Notes</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Opportunity</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    {/* colSpan must match the 9 column headers above so the
                        empty state spans the full width of the table. */}
                    <TableCell colSpan={9} className="p-0">
                      <EmptyState
                        icon={Calendar}
                        title={
                          activeTab === 'upcoming' ? 'No upcoming meetings.'
                          : activeTab === 'past'   ? 'No past meetings.'
                          : 'No cancelled meetings.'
                        }
                        description={
                          activeTab === 'upcoming'
                            ? 'New bookings from the public form will appear here.'
                            : activeTab === 'past'
                              ? 'Meetings move here after their date passes.'
                              : 'Cancelled meetings are kept for reference.'
                        }
                        className="py-12"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((booking) => (
                    <TableRow key={booking.id} className="border-cream-100 row-accent">
                      <TableCell className="py-3.5 px-5 whitespace-nowrap text-sm text-ink-warm-700">{formatDate(booking.meeting_date)}</TableCell>
                      <TableCell className="py-3.5 px-5 whitespace-nowrap text-sm text-ink-warm-700 tabular-nums">
                        {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                      </TableCell>
                      <TableCell className="py-3.5 px-5 font-medium text-ink-warm-900">{booking.booker_name}</TableCell>
                      <TableCell className="py-3.5 px-5">
                        <a
                          href={`mailto:${booking.booker_email}`}
                          className="text-sm text-brand hover:text-brand-dark hover:underline"
                        >
                          {booking.booker_email}
                        </a>
                      </TableCell>
                      <TableCell className="py-3.5 px-5">
                        {renderAttendanceCell(booking)}
                      </TableCell>
                      <TableCell className="py-3.5 px-5">
                        {booking.meet_link ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => window.open(booking.meet_link!, '_blank')}
                          >
                            <Video className="h-3 w-3" />
                            Join
                          </Button>
                        ) : (
                          <span className="text-ink-warm-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="py-3.5 px-5 max-w-[200px] truncate text-sm text-ink-warm-700"
                        title={booking.notes || ''}
                      >
                        {booking.notes || <span className="text-ink-warm-400">—</span>}
                      </TableCell>
                      <TableCell className="py-3.5 px-5">
                        {booking.opportunity?.name ? (
                          <span className="text-sm text-ink-warm-700">{booking.opportunity.name}</span>
                        ) : (
                          <span className="text-ink-warm-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 px-5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {booking.meet_link && (
                              <DropdownMenuItem onClick={() => copyMeetLink(booking.meet_link!)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Meet Link
                              </DropdownMenuItem>
                            )}
                            {booking.status === 'confirmed' && (
                              <DropdownMenuItem
                                onClick={() => setCancelTarget(booking)}
                                className="text-rose-600 focus:text-rose-600"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Cancel Meeting
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Calendar View */}
        {viewMode === 'calendar' && !selectedDate && (
          <Card>
            <CardContent className="p-4">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="sm" onClick={() => setCalendarMonth((m) => subMonths(m, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-lg font-semibold text-ink-warm-900">{format(calendarMonth, 'MMMM yyyy')}</h2>
                <Button variant="ghost" size="sm" onClick={() => setCalendarMonth((m) => addMonths(m, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* [Responsive cleanup, May 2026] A 7-column calendar can't
                  shrink below 7 columns. Wrap in overflow-x-auto with a
                  sensible min-width so the calendar stays usable on
                  mobile via horizontal scroll instead of becoming
                  unreadable squares. Days-of-week header sits in the
                  same scroll container so they stay aligned. */}
              <div className="overflow-x-auto -mx-1 px-1">
                <div className="min-w-[640px]">

                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 text-center text-xs font-medium text-ink-warm-500 mb-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d} className="py-1">{d}</div>
                    ))}
                  </div>

                  {/* Calendar Grid — v11 cream hairlines (was gray-100) */}
                  <div className="grid grid-cols-7 gap-px bg-cream-100 border border-cream-200 rounded-md overflow-hidden">
                    {calendarDays.map((day) => {
                      const dayMeetings = getMeetingsForDate(day);
                      const isCurrentMonth = isSameMonth(day, calendarMonth);
                      const isToday = isSameDay(day, new Date());
                      return (
                        <button
                          type="button"
                          key={day.toISOString()}
                          onClick={() => setSelectedDate(day)}
                          className={`
                            relative min-h-[80px] p-1.5 text-left bg-white hover:bg-cream-50 transition-colors
                            ${!isCurrentMonth ? 'text-ink-warm-300' : 'text-ink-warm-700'}
                            ${isToday ? 'bg-brand/5 ring-1 ring-inset ring-brand/30' : ''}
                          `}
                        >
                          <span className={`
                            text-xs font-medium inline-flex items-center justify-center w-5 h-5 rounded-full
                            ${isToday ? 'bg-brand text-white' : ''}
                          `}>
                            {format(day, 'd')}
                          </span>
                          {dayMeetings.length > 0 && isCurrentMonth && (
                            <div className="mt-0.5 space-y-0.5">
                              {dayMeetings.slice(0, 2).map((m) => (
                                <div
                                  key={m.id}
                                  className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${
                                    m.status === 'confirmed'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-700'
                                  }`}
                                >
                                  {formatTime(m.start_time)} {m.booker_name.split(' ')[0]}
                                </div>
                              ))}
                              {dayMeetings.length > 2 && (
                                <div className="text-[10px] text-ink-warm-500 px-1">
                                  +{dayMeetings.length - 2} more
                                </div>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Day Detail Panel */}
        {viewMode === 'calendar' && selectedDate && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-cream-100">
                <h2 className="text-base font-semibold text-ink-warm-900">
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)} className="gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Back to calendar
                </Button>
              </div>
              {selectedDateMeetings.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="No meetings on this day."
                  className="py-12"
                />
              ) : (
                <div className="space-y-3">
                  {selectedDateMeetings.map((booking) => (
                    <Card
                      key={booking.id}
                      className="p-3 flex items-center justify-between border-cream-200 hover:bg-cream-50/40 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-sm font-medium text-ink-warm-900 whitespace-nowrap tabular-nums">
                          {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                        </span>
                        <span className="text-sm font-medium text-ink-warm-900 truncate">{booking.booker_name}</span>
                        {renderAttendanceCell(booking)}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {booking.meet_link && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => window.open(booking.meet_link!, '_blank')}
                          >
                            <Video className="h-3 w-3" />
                            Join
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {booking.meet_link && (
                              <DropdownMenuItem onClick={() => copyMeetLink(booking.meet_link!)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Meet Link
                              </DropdownMenuItem>
                            )}
                            {booking.status === 'confirmed' && (
                              <DropdownMenuItem
                                onClick={() => setCancelTarget(booking)}
                                className="text-rose-600 focus:text-rose-600"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Cancel Meeting
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cancel Confirmation Dialog — v11 footer border pinned. */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-brand" />
              Cancel Meeting
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel the meeting with{' '}
              <span className="font-medium text-ink-warm-900">{cancelTarget?.booker_name}</span> on{' '}
              <span className="font-medium text-ink-warm-900">
                {cancelTarget ? formatDate(cancelTarget.meeting_date) : ''}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Keep Meeting
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling...' : 'Cancel Meeting'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
