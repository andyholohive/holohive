'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Calendar, Video, MoreHorizontal, XCircle, Copy, ExternalLink, List, CalendarDays, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { BookingService, Booking } from '@/lib/bookingService';
import { useToast } from '@/hooks/use-toast';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  format, isSameMonth, isSameDay, addMonths, subMonths,
} from 'date-fns';

type TabFilter = 'upcoming' | 'past' | 'cancelled';
type ViewMode = 'table' | 'calendar';

export default function MeetingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('upcoming');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadBookings();
  }, []);

  async function loadBookings() {
    try {
      setLoading(true);
      const data = await BookingService.getMyBookings();
      setBookings(data);
    } catch (err) {
      console.error('Error loading bookings:', err);
      toast({ title: 'Error', description: 'Failed to load bookings.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

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
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel meeting.', variant: 'destructive' });
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  }

  function copyMeetLink(link: string) {
    navigator.clipboard.writeText(link);
    toast({ title: 'Copied', description: 'Meet link copied to clipboard.' });
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

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header — real title/subtitle render immediately. */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-brand" />
            Meetings
          </h2>
          <p className="text-gray-600 mt-1">View and manage your booked meetings.</p>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calendar className="h-6 w-6 text-brand" />
          Meetings
        </h2>
        <p className="text-gray-600 mt-1">View and manage your booked meetings.</p>
      </div>

      {/* Tab Filters + View Toggle. Tabs use the shadcn <Tabs> component
          for consistency with /intelligence and /crm/sales-pipeline (was
          a row of <Button>s before 2026-05-06). Active state colored via
          the data-[state=active] convention used by every other Tabs site
          in the app. */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm"
              >
                {tab.label}
                <Badge variant="secondary" className="ml-2 text-xs">
                  {tab.count}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-1 border rounded-md p-0.5">
          <Button
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => { setViewMode('table'); setSelectedDate(null); }}
            style={viewMode === 'table' ? { backgroundColor: '#3e8692', color: 'white' } : {}}
            title="Table view"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode('calendar')}
            style={viewMode === 'calendar' ? { backgroundColor: '#3e8692', color: 'white' } : {}}
            title="Calendar view"
          >
            <CalendarDays className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Booker Name</TableHead>
                  <TableHead>Booker Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Meet Link</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead className="w-10"></TableHead>
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
                        className="py-12"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(booking.meeting_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                      </TableCell>
                      <TableCell className="font-medium">{booking.booker_name}</TableCell>
                      <TableCell>
                        <a href={`mailto:${booking.booker_email}`} className="text-blue-600 hover:underline">
                          {booking.booker_email}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={booking.status === 'confirmed' ? 'default' : 'destructive'}
                          className={
                            booking.status === 'confirmed'
                              ? 'bg-green-100 text-green-800 hover:bg-green-100'
                              : ''
                          }
                        >
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
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
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={booking.notes || ''}>
                        {booking.notes || <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>
                        {booking.opportunity?.name ? (
                          <span className="text-sm">{booking.opportunity.company_name}</span>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
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
                                className="text-red-600 focus:text-red-600"
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
          </CardContent>
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
              <h2 className="text-lg font-semibold">{format(calendarMonth, 'MMMM yyyy')}</h2>
              <Button variant="ghost" size="sm" onClick={() => setCalendarMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-md overflow-hidden">
              {calendarDays.map((day) => {
                const dayMeetings = getMeetingsForDate(day);
                const isCurrentMonth = isSameMonth(day, calendarMonth);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      relative min-h-[80px] p-1.5 text-left bg-white hover:bg-gray-50 transition-colors
                      ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-700'}
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
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {formatTime(m.start_time)} {m.booker_name.split(' ')[0]}
                          </div>
                        ))}
                        {dayMeetings.length > 2 && (
                          <div className="text-[10px] text-gray-500 px-1">
                            +{dayMeetings.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day Detail Panel */}
      {viewMode === 'calendar' && selectedDate && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back to calendar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {selectedDateMeetings.length === 0 ? (
              <p className="text-center py-8 text-gray-400">No meetings on this day.</p>
            ) : (
              <div className="space-y-3">
                {selectedDateMeetings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-sm font-medium whitespace-nowrap">
                        {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                      </span>
                      <span className="text-sm font-medium truncate">{booking.booker_name}</span>
                      <Badge
                        variant={booking.status === 'confirmed' ? 'default' : 'destructive'}
                        className={
                          booking.status === 'confirmed'
                            ? 'bg-green-100 text-green-800 hover:bg-green-100'
                            : ''
                        }
                      >
                        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </Badge>
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
                              className="text-red-600 focus:text-red-600"
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Cancel Meeting
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Meeting</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel the meeting with{' '}
              <span className="font-medium text-gray-900">{cancelTarget?.booker_name}</span> on{' '}
              <span className="font-medium text-gray-900">
                {cancelTarget ? formatDate(cancelTarget.meeting_date) : ''}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
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
