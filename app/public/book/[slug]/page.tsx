'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { BookingService, BookingPage, TimeSlot } from '@/lib/bookingService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader, ChevronLeft, ChevronRight, Clock, Calendar, User, Mail, MessageSquare, Globe } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Common timezone list with friendly labels
const TIMEZONE_OPTIONS = [
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKST)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Sao_Paulo', label: 'Brasilia (BRT)' },
  { value: 'Atlantic/Reykjavik', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Europe/Istanbul', label: 'Istanbul (TRT)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Asia/Seoul', label: 'Korea (KST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (NZST)' },
];

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Convert a UTC "HH:MM" time on a given date to a local time string in the given timezone */
function utcTimeToLocal(dateStr: string, utcTime: string, timezone: string): string {
  const [h, m] = utcTime.split(':').map(Number);
  const utcDate = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return utcDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });
}

/** Get the user's local timezone IANA name */
function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Atlantic/Reykjavik'; // fallback to UTC
  }
}

/** Get a short label for a timezone */
function getTimezoneLabel(tz: string): string {
  const match = TIMEZONE_OPTIONS.find(o => o.value === tz);
  if (match) return match.label;
  // If user's local tz isn't in our list, format it nicely
  try {
    const now = new Date();
    const short = now.toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop();
    return `${tz.split('/').pop()?.replace(/_/g, ' ')} (${short})`;
  } catch {
    return tz;
  }
}

export default function PublicBookingPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const searchParams = useSearchParams();
  const oppId = searchParams.get('opp');

  const [bookingPage, setBookingPage] = useState<BookingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Flow state
  const [step, setStep] = useState<'date' | 'time' | 'form' | 'success'>('date');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Form
  const [bookerName, setBookerName] = useState('');
  const [bookerEmail, setBookerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Timezone
  const [timezone, setTimezone] = useState(getLocalTimezone());

  // Calendar month navigation
  const today = new Date();
  const [calendarMonth, setCalendarMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });

  // Ensure user's local tz is in dropdown options
  const timezoneOptions = useMemo(() => {
    const localTz = getLocalTimezone();
    const exists = TIMEZONE_OPTIONS.some(o => o.value === localTz);
    if (exists) return TIMEZONE_OPTIONS;
    return [{ value: localTz, label: getTimezoneLabel(localTz) }, ...TIMEZONE_OPTIONS];
  }, []);

  useEffect(() => {
    fetchBookingPage();
  }, [slug]);

  const fetchBookingPage = async () => {
    try {
      setLoading(true);
      const page = await BookingService.getBookingPageBySlug(slug);
      if (!page) {
        setError('Booking page not found');
        return;
      }
      setBookingPage(page);
    } catch (err) {
      console.error('Error fetching booking page:', err);
      setError('Failed to load booking page');
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = async (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setLoadingSlots(true);

    try {
      const dateKey = formatDateKey(date);
      const slots = await BookingService.getAvailableSlots(
        bookingPage!.id,
        dateKey,
        bookingPage!.available_slots,
        bookingPage!.slot_duration_minutes
      );
      setAvailableSlots(slots);
      setStep('time');
    } catch (err) {
      console.error('Error fetching slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedSlot || !bookingPage) return;

    setSubmitting(true);
    try {
      const booking = await BookingService.createBooking({
        booking_page_id: bookingPage.id,
        opportunity_id: oppId || undefined,
        booker_name: bookerName.trim(),
        booker_email: bookerEmail.trim(),
        meeting_date: formatDateKey(selectedDate),
        start_time: selectedSlot.start,
        end_time: selectedSlot.end,
        notes: notes.trim() || undefined,
      });

      // Trigger edge function to create Google Calendar event + send confirmation emails
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/booking-confirmation`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ booking_id: booking.id }),
          }
        );
      } catch (fnErr) {
        console.error('Error calling booking-confirmation function:', fnErr);
      }

      setStep('success');
    } catch (err) {
      console.error('Error creating booking:', err);
    } finally {
      setSubmitting(false);
    }
  };

  /** Format a slot time for display in the selected timezone */
  const formatSlotLocal = (utcTime: string): string => {
    if (!selectedDate) return utcTime;
    return utcTimeToLocal(formatDateKey(selectedDate), utcTime, timezone);
  };

  /** Format slot with UTC reference */
  const formatSlotWithUtc = (utcTime: string): { local: string; utc: string } => {
    return {
      local: selectedDate ? utcTimeToLocal(formatDateKey(selectedDate), utcTime, timezone) : utcTime,
      utc: utcTime + ' UTC',
    };
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-12 w-12 animate-spin text-[#3e8692] mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !bookingPage) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="Logo" width={60} height={60} className="rounded-xl" />
          </div>
          <div className="rounded-full bg-red-50 p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Calendar className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Page Not Available</h2>
          <p className="text-lg text-gray-600 leading-relaxed">{error || 'This booking page does not exist.'}</p>
        </div>
      </div>
    );
  }

  // Success state
  if (step === 'success') {
    const startFmt = selectedSlot ? formatSlotWithUtc(selectedSlot.start) : null;
    const endFmt = selectedSlot ? formatSlotWithUtc(selectedSlot.end) : null;
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="Logo" width={60} height={60} className="rounded-xl" />
          </div>
          <div className="rounded-full bg-green-50 p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Meeting Booked!</h2>
          <div className="bg-gray-50 rounded-xl p-6 text-left space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-[#3e8692] flex-shrink-0" />
              <span className="text-gray-700 font-medium">
                {selectedDate && `${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-[#3e8692] flex-shrink-0" />
              <div>
                <div className="text-gray-700 font-medium">
                  {startFmt?.local} - {endFmt?.local}
                  <span className="text-gray-400 text-sm font-normal ml-1">({getTimezoneLabel(timezone)})</span>
                </div>
                <div className="text-gray-400 text-xs mt-0.5">
                  {startFmt?.utc} - {endFmt?.utc}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-[#3e8692] flex-shrink-0" />
              <span className="text-gray-700 font-medium">{bookerName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-center text-sm text-gray-500 bg-blue-50 rounded-lg px-4 py-3">
            <Mail className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span>Check your email for a confirmation with your Google Meet link.</span>
          </div>
        </div>
      </div>
    );
  }

  const ownerName = bookingPage.user?.name || 'Team Member';
  const ownerPhoto = bookingPage.user?.profile_photo_url;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="HoloHive" width={60} height={60} className="rounded-xl" />
          </div>

          {/* Owner avatar */}
          <div className="flex justify-center mb-4">
            {ownerPhoto ? (
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-100">
                <img src={ownerPhoto} alt={ownerName} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#3e8692] to-[#2d6470] flex items-center justify-center">
                <span className="text-white font-bold text-xl">
                  {ownerName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </span>
              </div>
            )}
          </div>

          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {bookingPage.title || `Book a call with ${ownerName}`}
          </h1>
          {bookingPage.description && (
            <p className="text-lg text-gray-600 leading-relaxed max-w-xl mx-auto">{bookingPage.description}</p>
          )}
          <div className="flex items-center justify-center gap-2 mt-3 text-sm text-gray-400">
            <Clock className="h-4 w-4" />
            <span>{bookingPage.slot_duration_minutes} min</span>
          </div>
        </div>

        {/* Content area */}
        <div className="max-w-xl mx-auto">
          {/* Step indicator */}
          <div className="flex justify-center gap-2 mb-8">
            {['date', 'time', 'form'].map((s, i) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-300 ${
                  s === step ? 'bg-[#3e8692] w-8' :
                  ['date', 'time', 'form'].indexOf(step) > i ? 'bg-[#3e8692] opacity-30 w-2' :
                  'bg-gray-300 w-2'
                }`}
              />
            ))}
          </div>

          {/* Step: Date picker */}
          {step === 'date' && (() => {
            const { year, month } = calendarMonth;
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startDow = firstDay.getDay();
            const daysInMonth = lastDay.getDate();
            const todayKey = formatDateKey(new Date());
            const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

            return (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">Select a date</h2>

                {/* Month navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => {
                      if (isCurrentMonth) return;
                      setCalendarMonth(prev => {
                        const d = new Date(prev.year, prev.month - 1, 1);
                        return { year: d.getFullYear(), month: d.getMonth() };
                      });
                    }}
                    disabled={isCurrentMonth}
                    className={`p-2 rounded-lg transition-colors ${isCurrentMonth ? 'text-gray-200 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-base font-medium text-gray-700">
                    {MONTHS[month]} {year}
                  </span>
                  <button
                    onClick={() => {
                      setCalendarMonth(prev => {
                        const d = new Date(prev.year, prev.month + 1, 1);
                        return { year: d.getFullYear(), month: d.getMonth() };
                      });
                    }}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {/* Day headers */}
                  {DAYS.map(d => (
                    <div key={d} className="text-center text-xs font-medium text-gray-400 pb-2">{d}</div>
                  ))}

                  {/* Empty cells before first day */}
                  {Array.from({ length: startDow }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}

                  {/* Date cells */}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const date = new Date(year, month, i + 1);
                    const dateKey = formatDateKey(date);
                    const dayOfWeek = date.getDay();
                    const hasSlots = bookingPage.available_slots.some(s => s.day === dayOfWeek);
                    const isPast = dateKey < todayKey;
                    const isDisabled = !hasSlots || isPast;
                    const isToday = dateKey === todayKey;

                    return (
                      <button
                        key={dateKey}
                        onClick={() => !isDisabled && handleDateSelect(date)}
                        disabled={isDisabled}
                        className={`
                          aspect-square rounded-lg flex items-center justify-center text-sm transition-all
                          ${isDisabled
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'hover:bg-[#3e8692] hover:text-white cursor-pointer border border-gray-200 hover:border-[#3e8692]'
                          }
                          ${isToday ? 'font-bold ring-2 ring-[#3e8692]/30' : ''}
                        `}
                      >
                        <span className="text-lg">{i + 1}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Step: Time slots */}
          {step === 'time' && (
            <div>
              <button
                onClick={() => { setStep('date'); setSelectedDate(null); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
              >
                <ChevronLeft className="h-4 w-4" /> Back to dates
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-1 text-center">
                {selectedDate && `${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
              </h2>

              {/* Timezone selector */}
              <div className="flex items-center justify-center gap-2 mt-2 mb-6">
                <Globe className="h-4 w-4 text-gray-400" />
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-auto h-8 text-xs border-gray-200 text-gray-500 gap-1 pr-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map(tz => (
                      <SelectItem key={tz.value} value={tz.value} className="text-sm">
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loadingSlots ? (
                <div className="flex justify-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-[#3e8692]" />
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No available slots</p>
                  <p className="text-sm">Please try another date.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {availableSlots.map(slot => {
                    const localStart = formatSlotLocal(slot.start);
                    if (slot.booked) {
                      return (
                        <div
                          key={slot.start}
                          className="py-3 px-4 rounded-lg border border-gray-100 bg-gray-50 text-sm font-medium text-gray-300 cursor-not-allowed line-through text-center"
                        >
                          <span className="block">{localStart}</span>
                          <span className="block text-[11px] text-gray-300 mt-0.5">{slot.start} UTC</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={slot.start}
                        onClick={() => handleSlotSelect(slot)}
                        className="py-3 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-[#3e8692] hover:bg-[#3e8692] hover:text-white transition-all group"
                      >
                        <span className="block">{localStart}</span>
                        <span className="block text-[11px] text-gray-400 group-hover:text-white/70 mt-0.5">{slot.start} UTC</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step: Booking form */}
          {step === 'form' && (
            <div>
              <button
                onClick={() => { setStep('time'); setSelectedSlot(null); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
              >
                <ChevronLeft className="h-4 w-4" /> Back to times
              </button>

              {/* Selected slot summary */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4 text-[#3e8692] flex-shrink-0" />
                  {selectedDate && `${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4 text-[#3e8692] flex-shrink-0" />
                  <span>
                    {selectedSlot && formatSlotLocal(selectedSlot.start)} - {selectedSlot && formatSlotLocal(selectedSlot.end)}
                    <span className="text-gray-400 text-xs ml-1">({getTimezoneLabel(timezone)})</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 pl-6">
                  <span>{selectedSlot?.start} - {selectedSlot?.end} UTC</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="name"
                      required
                      value={bookerName}
                      onChange={e => setBookerName(e.target.value)}
                      placeholder="Enter your name"
                      className="pl-10 auth-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Your Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={bookerEmail}
                      onChange={e => setBookerEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="pl-10 auth-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes <span className="font-normal text-gray-400">(optional)</span></Label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Anything you'd like to discuss?"
                      rows={3}
                      className="pl-10 auth-input"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={submitting || !bookerName.trim() || !bookerEmail.trim()}
                    className="w-full h-12 text-base font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    {submitting ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        Booking...
                      </>
                    ) : (
                      <>
                        Confirm Booking
                        <ChevronRight className="h-5 w-5" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-gray-300">Powered by HoloHive</p>
        </div>
      </div>
    </div>
  );
}
