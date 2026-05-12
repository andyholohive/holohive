import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Public client for unauthenticated booking pages
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// Types
// ============================================

export interface AvailableSlot {
  day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface BookingPage {
  id: string;
  user_id: string;
  slug: string;
  title: string | null;
  description: string | null;
  slot_duration_minutes: number;
  available_slots: AvailableSlot[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user?: {
    name: string;
    email: string;
    profile_photo_url: string | null;
  };
}

export interface Booking {
  id: string;
  booking_page_id: string;
  opportunity_id: string | null;
  booker_name: string;
  booker_email: string;
  meeting_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  status: 'confirmed' | 'cancelled';
  notes: string | null;
  meet_link: string | null;
  google_event_id: string | null;
  confirmation_sent: boolean;
  /** held = the meeting actually happened; no_show = booker didn't show.
   *  null until manually recorded via the /crm/meetings UI for past bookings.
   *  Drives the "calls held / no-show" outreach metrics. (migration 052) */
  attendance_status: 'held' | 'no_show' | null;
  created_at: string;
  // Joined fields
  opportunity?: { name: string | null } | null;
  booking_page?: { title: string | null; slug: string; user_id?: string } | null;
}

export interface CreateBookingData {
  booking_page_id: string;
  opportunity_id?: string | null;
  booker_name: string;
  booker_email: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  notes?: string;
}

export interface TimeSlot {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  booked?: boolean;
}

// ============================================
// Booking Service
// ============================================

export class BookingService {
  /**
   * Fetch a booking page by slug (public, no auth needed)
   */
  static async getBookingPageBySlug(slug: string): Promise<BookingPage | null> {
    const { data, error } = await supabasePublic
      .from('booking_pages')
      .select(`
        *,
        user:users!booking_pages_user_id_fkey(name, email, profile_photo_url)
      `)
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error fetching booking page:', error);
      return null;
    }

    return data as BookingPage;
  }

  /**
   * Compute available time slots for a given date.
   * Returns slots from available_slots config minus already-booked slots.
   */
  static async getAvailableSlots(
    bookingPageId: string,
    date: string, // YYYY-MM-DD
    availableSlots: AvailableSlot[],
    slotDurationMinutes: number
  ): Promise<TimeSlot[]> {
    // Get day of week for the date (0=Sun)
    const dateObj = new Date(date + 'T00:00:00Z');
    const dayOfWeek = dateObj.getUTCDay();

    // Find config slots for this day
    const daySlots = availableSlots.filter(s => s.day === dayOfWeek);
    if (daySlots.length === 0) return [];

    // Generate all possible slots
    const allSlots: TimeSlot[] = [];
    for (const daySlot of daySlots) {
      const [startH, startM] = daySlot.start.split(':').map(Number);
      const [endH, endM] = daySlot.end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      for (let m = startMinutes; m + slotDurationMinutes <= endMinutes; m += slotDurationMinutes) {
        const slotStart = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const slotEndM = m + slotDurationMinutes;
        const slotEnd = `${String(Math.floor(slotEndM / 60)).padStart(2, '0')}:${String(slotEndM % 60).padStart(2, '0')}`;
        allSlots.push({ start: slotStart, end: slotEnd });
      }
    }

    // Fetch existing bookings for this date
    const { data: existingBookings } = await supabasePublic
      .from('bookings')
      .select('start_time, end_time')
      .eq('booking_page_id', bookingPageId)
      .eq('meeting_date', date)
      .eq('status', 'confirmed');

    if (!existingBookings || existingBookings.length === 0) return allSlots;

    // Mark booked slots
    const bookedTimes = new Set(
      existingBookings.map(b => b.start_time.substring(0, 5)) // "HH:MM"
    );

    return allSlots.map(slot => ({
      ...slot,
      booked: bookedTimes.has(slot.start),
    }));
  }

  /**
   * Create a booking (public, no auth needed).
   * Optionally links to an opportunity and updates its fields.
   */
  static async createBooking(data: CreateBookingData): Promise<Booking> {
    const insertData: any = {
      booking_page_id: data.booking_page_id,
      booker_name: data.booker_name,
      booker_email: data.booker_email,
      meeting_date: data.meeting_date,
      start_time: data.start_time,
      end_time: data.end_time,
      notes: data.notes || null,
      status: 'confirmed',
    };

    if (data.opportunity_id) {
      insertData.opportunity_id = data.opportunity_id;
    }

    const { data: booking, error } = await supabasePublic
      .from('bookings')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Error creating booking:', error);
      throw error;
    }

    // Opportunity update is handled by the database trigger
    // (update_opportunity_on_booking) which runs as SECURITY DEFINER
    // and bypasses RLS to set next_meeting_at, calendly_booked_date,
    // next_meeting_type, and auto-advance stage if in outreach.

    return booking as Booking;
  }

  /**
   * Fetch all bookings for the current user's booking page(s),
   * joined with booking_pages and optionally crm_opportunities.
   */
  static async getMyBookings(): Promise<Booking[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    return this.getBookingsForUser(user.id);
  }

  /**
   * Same as getMyBookings but for an arbitrary user. Used by the
   * Meetings page when an admin wants to view a teammate's calendar.
   * RLS still applies, so non-admin callers will get empty results
   * for users they don't own.
   */
  static async getBookingsForUser(userId: string): Promise<Booking[]> {
    const { data: pages } = await supabase
      .from('booking_pages')
      .select('id')
      .eq('user_id', userId);

    if (!pages || pages.length === 0) return [];

    const pageIds = pages.map(p => p.id);

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        booking_page:booking_pages!bookings_booking_page_id_fkey(title, slug),
        opportunity:crm_opportunities!bookings_opportunity_id_fkey(name)
      `)
      .in('booking_page_id', pageIds)
      .order('meeting_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    return (data || []) as Booking[];
  }

  /**
   * Get bookings for a page within a date range (authenticated)
   */
  static async getBookingsByPage(
    bookingPageId: string,
    startDate?: string,
    endDate?: string
  ): Promise<Booking[]> {
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('booking_page_id', bookingPageId)
      .order('meeting_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (startDate) query = query.gte('meeting_date', startDate);
    if (endDate) query = query.lte('meeting_date', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Booking[];
  }

  /**
   * Get the current user's booking page (authenticated)
   */
  static async getMyBookingPage(): Promise<BookingPage | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('booking_pages')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as BookingPage;
  }

  /**
   * Update a booking page (authenticated, owner only)
   */
  static async updateBookingPage(
    id: string,
    updates: Partial<Pick<BookingPage, 'title' | 'description' | 'slug' | 'slot_duration_minutes' | 'available_slots' | 'is_active'>>
  ): Promise<BookingPage> {
    const { data, error } = await supabase
      .from('booking_pages')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as BookingPage;
  }

  /**
   * Cancel a booking (set status to cancelled)
   */
  static async cancelBooking(id: string): Promise<Booking> {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Booking;
  }

  /**
   * Mark a booking as held or no-show. Pass null to clear. Used by the
   * /crm/meetings page after the meeting time has passed so the
   * outreach-metrics dashboard can compute call-held and no-show rates.
   */
  static async markAttendance(id: string, status: 'held' | 'no_show' | null): Promise<Booking> {
    // Cast through `any` because database.types.ts hasn't been
    // regenerated since migration 052 added the attendance_status
    // column. Safe — we control the column type via the migration.
    const { data, error } = await (supabase as any)
      .from('bookings')
      .update({ attendance_status: status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Booking;
  }

  /**
   * Fetch all bookings (any user) within a date range — used by the
   * Metrics tab in /crm/sales-pipeline to compute per-user calls-booked /
   * calls-held / no-show numbers without one query per user.
   *
   * Joins booking_pages so we can group by user_id (the booking page
   * owner = the rep who took the meeting).
   */
  static async getBookingsForMetrics(fromIso: string, toIso: string): Promise<Booking[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        booking_page:booking_pages!bookings_booking_page_id_fkey(user_id, slug, title)
      `)
      .gte('meeting_date', fromIso.slice(0, 10))
      .lte('meeting_date', toIso.slice(0, 10))
      .order('meeting_date', { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as Booking[];
  }

  /**
   * Get booking page by user_id (for generating booking links in pipeline)
   */
  static async getBookingPageByUserId(userId: string): Promise<BookingPage | null> {
    const { data, error } = await supabase
      .from('booking_pages')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      return null;
    }
    return data as BookingPage;
  }
}
