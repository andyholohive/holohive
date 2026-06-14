'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Settings as SettingsIcon, User, Mail, AtSign, Camera, Loader2, Save, MessageSquare, CheckCircle, XCircle, RefreshCw, Calendar, Link2, Copy, ExternalLink, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookingService, BookingPage, AvailableSlot } from '@/lib/bookingService';
import { TimePicker } from '@/components/ui/time-picker';
import { formatDate, formatDateTime } from '@/lib/dateFormat';

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}

function SettingsContent() {
  const { user, userProfile, refreshUserProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Local object-URL preview shown immediately when the user picks a file,
  // so they get visual confirmation before the upload finishes. Swapped
  // out for the real public URL on upload success. Stored separately
  // from formData so it doesn't leak into the saved user record.
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  // Surfaces image load failures (CORS / 403 / etc.) so the user doesn't
  // silently see initials and think the upload broke.
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);

  // Google Calendar connection state. Status is fetched from /api/google/status
  // on mount; the OAuth callback redirects here with ?google=connected|error
  // which we surface via toast.
  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean;
    email?: string;
    connected_at?: string;
  } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleActionLoading, setGoogleActionLoading] = useState(false);

  // Telegram webhook state
  const [webhookStatus, setWebhookStatus] = useState<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  } | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookActionLoading, setWebhookActionLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    telegram_id: '',
    x_id: '',
    profile_photo_url: '',
  });

  // Booking page state
  const [bookingPage, setBookingPage] = useState<BookingPage | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    title: '',
    description: '',
    slug: '',
    is_active: true,
    slot_duration_minutes: 30,
    available_slots: [] as AvailableSlot[],
  });

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  useEffect(() => {
    if (userProfile) {
      setFormData({
        name: userProfile.name || '',
        email: userProfile.email || '',
        telegram_id: userProfile.telegram_id || '',
        x_id: userProfile.x_id || '',
        profile_photo_url: userProfile.profile_photo_url || '',
      });
      setLoading(false);

      // Fetch webhook status for admins
      if (userProfile.role === 'admin' || userProfile.role === 'super_admin') {
        fetchWebhookStatus();
      }

      // Fetch booking page
      fetchBookingPage();

      // Fetch Google Calendar connection status
      fetchGoogleStatus();
    }
  }, [userProfile]);

  // Surface OAuth callback result. The /api/google/oauth/callback route
  // redirects here with ?google=connected&detail=email or ?google=error&detail=...
  // After showing the toast, strip the params so a refresh doesn't re-fire it.
  useEffect(() => {
    const status = searchParams.get('google');
    if (!status) return;
    const detail = searchParams.get('detail');
    if (status === 'connected') {
      toast({ title: 'Google Calendar connected', description: detail ? `Linked ${detail}` : undefined });
      fetchGoogleStatus();
    } else if (status === 'error') {
      toast({ title: 'Google connection failed', description: detail || 'Unknown error', variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    router.replace('/settings');
  }, [searchParams]);

  const fetchGoogleStatus = async () => {
    setGoogleLoading(true);
    try {
      const res = await fetch('/api/google/status');
      const data = await res.json();
      if (data.connected) {
        setGoogleStatus({ connected: true, email: data.email, connected_at: data.connected_at });
      } else {
        setGoogleStatus({ connected: false });
      }
    } catch (err) {
      console.error('Error fetching Google status:', err);
      setGoogleStatus({ connected: false });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleConnectGoogle = () => {
    // Hard navigate to /api/google/oauth/start — that route sets the
    // CSRF cookie + redirects to Google's consent screen. After consent
    // Google sends the user back to /api/google/oauth/callback which
    // redirects here with ?google=connected.
    window.location.href = '/api/google/oauth/start';
  };

  const handleDisconnectGoogle = async () => {
    setGoogleActionLoading(true);
    try {
      const res = await fetch('/api/google/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast({ title: 'Google Calendar disconnected' });
      setGoogleStatus({ connected: false });
    } catch (err: any) {
      toast({ title: 'Disconnect failed', description: err.message, variant: 'destructive' });
    } finally {
      setGoogleActionLoading(false);
    }
  };

  const fetchBookingPage = async () => {
    setBookingLoading(true);
    try {
      const page = await BookingService.getMyBookingPage();
      if (page) {
        setBookingPage(page);
        setBookingForm({
          title: page.title || '',
          description: page.description || '',
          slug: page.slug,
          is_active: page.is_active,
          slot_duration_minutes: page.slot_duration_minutes,
          available_slots: page.available_slots || [],
        });
      }
    } catch (err) {
      console.error('Error fetching booking page:', err);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleSaveBooking = async () => {
    if (!bookingPage) return;
    setBookingSaving(true);
    try {
      const updated = await BookingService.updateBookingPage(bookingPage.id, {
        title: bookingForm.title.trim() || null,
        description: bookingForm.description.trim() || null,
        slug: bookingForm.slug.trim(),
        is_active: bookingForm.is_active,
        slot_duration_minutes: bookingForm.slot_duration_minutes,
        available_slots: bookingForm.available_slots,
      });
      setBookingPage(updated);
      toast({ title: 'Booking page updated', description: 'Your booking page settings have been saved.' });
    } catch (err: any) {
      console.error('Error saving booking page:', err);
      toast({ title: 'Save failed', description: err?.message || 'Failed to save booking page settings.', variant: 'destructive' });
    } finally {
      setBookingSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    const existing = bookingForm.available_slots.find(s => s.day === day);
    if (existing) {
      setBookingForm(prev => ({
        ...prev,
        available_slots: prev.available_slots.filter(s => s.day !== day),
      }));
    } else {
      setBookingForm(prev => ({
        ...prev,
        available_slots: [...prev.available_slots, { day, start: '09:00', end: '17:00' }],
      }));
    }
  };

  const updateSlotTime = (day: number, field: 'start' | 'end', value: string) => {
    setBookingForm(prev => ({
      ...prev,
      available_slots: prev.available_slots.map(s =>
        s.day === day ? { ...s, [field]: value } : s
      ),
    }));
  };

  const copyBookingUrl = () => {
    if (!bookingPage) return;
    const url = `https://app.holohive.io/public/book/${bookingForm.slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', description: url });
  };

  const fetchWebhookStatus = async () => {
    setWebhookLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/telegram/webhook/manage', {
        headers: {
          'Authorization': `Bearer ${session?.access_token || 'token'}`
        }
      });
      const data = await response.json();
      if (data.result) {
        setWebhookStatus(data.result);
      }
    } catch (error) {
      console.error('Error fetching webhook status:', error);
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleRegisterWebhook = async () => {
    setWebhookActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/telegram/webhook/manage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || 'token'}`
        },
        body: JSON.stringify({ action: 'register' })
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Webhook registered',
          description: `Telegram webhook connected to ${data.webhookUrl}`,
        });
        fetchWebhookStatus();
      } else {
        toast({
          title: 'Registration failed',
          description: data.error || 'Failed to register webhook',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error registering webhook:', error);
      toast({
        title: 'Registration failed',
        description: error instanceof Error ? error.message : 'Failed to register webhook',
        variant: 'destructive',
      });
    } finally {
      setWebhookActionLoading(false);
    }
  };

  const handleDeleteWebhook = async () => {
    setWebhookActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/telegram/webhook/manage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || 'token'}`
        },
        body: JSON.stringify({ action: 'delete' })
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Webhook disconnected',
          description: 'Telegram webhook has been removed',
        });
        fetchWebhookStatus();
      } else {
        toast({
          title: 'Disconnect failed',
          description: data.error || 'Failed to disconnect webhook',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting webhook:', error);
      toast({
        title: 'Disconnect failed',
        description: error instanceof Error ? error.message : 'Failed to disconnect webhook',
        variant: 'destructive',
      });
    } finally {
      setWebhookActionLoading(false);
    }
  };

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Allow-list matches the bucket's allowed_mime_types — Supabase
    // rejects mismatches with a confusing "mime type not supported" error.
    const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      toast({
        title: 'Unsupported image format',
        description: 'Please upload a JPG, PNG, GIF, or WebP image.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    // Show the picked file immediately as a local object-URL preview.
    // Gives the user visual confirmation before the upload completes —
    // and means they don't depend on the public URL loading correctly
    // to know that "something happened" when they clicked Upload.
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(previewUrl);
    setPhotoLoadFailed(false);
    setUploadingPhoto(true);

    // File path = {user_id}/{timestamp}.{ext}. The {user_id} prefix
    // matches the storage RLS policy that gates writes on
    // (storage.foldername(name))[1] = auth.uid().
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        console.error('[settings] profile-photos upload error:', uploadError);
        toast({
          title: 'Upload failed',
          description: uploadError.message || 'Storage rejected the upload.',
          variant: 'destructive',
        });
        // Roll back the preview so user knows the upload didn't take
        URL.revokeObjectURL(previewUrl);
        setPhotoPreviewUrl(null);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      // Cache-buster — Supabase serves with a 1-hour cache header, so the
      // <img> wouldn't refresh if you re-uploaded within an hour. Append
      // a version query param so the URL is always unique per upload.
      const finalUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_photo_url: finalUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) {
        console.error('[settings] users update error:', updateError);
        toast({
          title: 'Photo uploaded but profile not updated',
          description: updateError.message,
          variant: 'destructive',
        });
        return;
      }

      // Update local form state with the real URL. Keep the preview
      // visible for now — the JSX prefers preview over formData URL while
      // uploading and falls back gracefully when the real URL loads.
      setFormData(prev => ({ ...prev, profile_photo_url: finalUrl }));
      await refreshUserProfile();

      // Now safe to drop the preview — the real public URL is in state
      // and AuthContext is in sync.
      URL.revokeObjectURL(previewUrl);
      setPhotoPreviewUrl(null);

      toast({
        title: 'Photo updated',
        description: 'Your profile photo has been updated successfully.',
      });
    } catch (error: any) {
      console.error('[settings] photo upload exception:', error);
      toast({
        title: 'Upload failed',
        description: error?.message || 'Unexpected error. Check the browser console.',
        variant: 'destructive',
      });
      URL.revokeObjectURL(previewUrl);
      setPhotoPreviewUrl(null);
    } finally {
      setUploadingPhoto(false);
      // Clear the input so the same file can be re-selected (browsers
      // dedupe by filename and won't refire onChange for an identical pick).
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: formData.name.trim(),
          telegram_id: formData.telegram_id.trim() || null,
          x_id: formData.x_id.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshUserProfile();

      toast({
        title: 'Settings saved',
        description: 'Your profile has been updated successfully.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Save failed',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      // /settings uses a deliberate max-w-3xl mx-auto centered-form shell
      // so account-settings forms render at a comfortable reading width
      // rather than the full-width admin layout used by data-dense pages.
      <div className="max-w-3xl mx-auto space-y-6">
        <PageHeader
          icon={SettingsIcon}
          title="Settings"
          subtitle="Manage your account settings and profile"
          kicker="Account · Settings"
          kickerDot="brand"
        />

        {/* SectionHeader skeleton — mirrors the loaded layout. */}
        <div className="section-head first flex items-center gap-3">
          <span className="dot bg-brand/30" aria-hidden />
          <Skeleton className="h-3 w-32" />
          <span className="flex-1 h-px bg-cream-200" aria-hidden />
          <Skeleton className="h-3 w-24" />
        </div>

        {/* Profile card skeleton */}
        <Card className="border-cream-200">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-center space-x-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-10 w-32" />
            </div>
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Secondary cards skeleton (Account info / Booking / Integrations) */}
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-cream-200">
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    // /settings uses a deliberate max-w-3xl mx-auto centered-form shell
    // so account-settings forms render at a comfortable reading width
    // rather than the full-width admin layout used by data-dense pages.
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Manage your account settings and profile"
        kicker="Account · Settings"
        kickerDot="brand"
      />

      {/* ── Profile ──────────────────────────────────────────── */}
      <SectionHeader
        label="Profile Information"
        dot="brand"
        counter="Personal details & photo"
        first
      />
      <Card className="border-cream-200">
        <CardContent className="space-y-6 p-6">
              {/* Profile Photo */}
              <div className="flex items-center space-x-6">
                <div className="relative">
                  {(() => {
                    // Display priority: in-flight preview > saved photo URL > initials.
                    // Preview wins during upload so the user sees the picked file
                    // immediately, even while the network round-trip completes.
                    const displayUrl = photoPreviewUrl || formData.profile_photo_url;
                    if (displayUrl && !photoLoadFailed) {
                      return (
                        <div className="w-24 h-24 rounded-full overflow-hidden bg-cream-100">
                          <img
                            // key forces React to remount the <img> when the
                            // URL changes. Without this, browsers sometimes
                            // hold the old image element and don't trigger a
                            // fresh fetch even with a different src attribute.
                            key={displayUrl}
                            src={displayUrl}
                            alt="Profile"
                            className="w-full h-full object-cover"
                            onLoad={() => setPhotoLoadFailed(false)}
                            onError={() => {
                              // Surface failures instead of silently swapping
                              // to initials — that hid real bucket/RLS issues.
                              console.error('[settings] image failed to load:', displayUrl);
                              setPhotoLoadFailed(true);
                            }}
                          />
                        </div>
                      );
                    }
                    // No URL OR load failed → initials gradient. If the load
                    // failed we also pulse the border to flag it.
                    return (
                      <div className={`w-24 h-24 bg-gradient-to-br from-brand to-[#2d6470] rounded-full flex items-center justify-center ${photoLoadFailed ? 'ring-2 ring-rose-400 ring-offset-2' : ''}`}>
                        <span className="text-white font-bold text-2xl">
                          {getUserInitials(formData.name || formData.email)}
                        </span>
                      </div>
                    );
                  })()}
                  {uploadingPhoto && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
                  </Button>
                  <p className="text-sm text-ink-warm-500 mt-2">JPG, PNG, GIF, or WebP. Max 5MB.</p>
                  {photoLoadFailed && !uploadingPhoto && (
                    <p className="text-xs text-rose-600 mt-1">
                      Saved photo failed to load. Try uploading again.
                    </p>
                  )}
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter your name"
                      className="pl-10 focus-brand"
                    />
                  </div>
                </div>

                {/* Email (read-only) */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                    <Input
                      id="email"
                      value={formData.email}
                      disabled
                      className="pl-10 focus-brand bg-cream-50 text-ink-warm-500"
                    />
                  </div>
                  <p className="text-sm text-ink-warm-500">Email cannot be changed</p>
                </div>

                {/* Telegram ID */}
                <div className="space-y-2">
                  <Label htmlFor="telegram_id">Telegram Username</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                    <Input
                      id="telegram_id"
                      value={formData.telegram_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, telegram_id: e.target.value }))}
                      placeholder="Enter your Telegram username"
                      className="pl-10 focus-brand"
                    />
                  </div>
                </div>

                {/* X (Twitter) ID */}
                <div className="space-y-2">
                  <Label htmlFor="x_id">X (Twitter) Username</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                    <Input
                      id="x_id"
                      value={formData.x_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, x_id: e.target.value }))}
                      placeholder="Enter your X username"
                      className="pl-10 focus-brand"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-cream-100">
                <Button variant="brand" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Account Information ──────────────────────────────── */}
          <SectionHeader
            label="Account Information"
            dot="brand"
            counter="Role · Status · Membership"
          />
          <Card className="border-cream-200">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-ink-warm-500">Role</span>
                <StatusBadge tone={userProfile?.role === 'super_admin' ? 'purple' : 'info'}>
                  {userProfile?.role === 'super_admin'
                    ? 'Super Admin'
                    : userProfile?.role
                      ? userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)
                      : 'Unknown'}
                </StatusBadge>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-cream-100">
                <span className="text-sm text-ink-warm-500">Status</span>
                <StatusBadge tone={userProfile?.is_active ? 'success' : 'danger'}>
                  {userProfile?.is_active ? 'Active' : 'Inactive'}
                </StatusBadge>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-cream-100">
                <span className="text-sm text-ink-warm-500">Member Since</span>
                <span className="text-sm font-medium text-ink-warm-900 tabular-nums">
                  {userProfile?.created_at ? formatDate(userProfile.created_at) : 'Unknown'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── Booking Page ─────────────────────────────────────── */}
          <SectionHeader
            label="Booking Page"
            dot="brand"
            counter="Public scheduling link"
          />
          <Card className="border-cream-200">
            <CardContent className="space-y-5 p-6">
              {bookingLoading ? (
                <div className="flex items-center gap-2 text-ink-warm-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading booking settings...</span>
                </div>
              ) : bookingPage ? (
                <>
                  {/* Active toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink-warm-700">Page Active</span>
                      <p className="text-xs text-ink-warm-500">When disabled, your booking page won&apos;t be accessible</p>
                    </div>
                    <button
                      onClick={() => setBookingForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        bookingForm.is_active ? 'bg-brand' : 'bg-cream-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        bookingForm.is_active ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {/* Public URL */}
                  <div className="space-y-2">
                    <Label className="text-sm">Public Booking URL</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-2 bg-cream-50 rounded-md px-3 py-2 text-sm text-ink-warm-700 border border-cream-200">
                        <Link2 className="h-4 w-4 text-ink-warm-400 flex-shrink-0" />
                        <span className="truncate">app.holohive.io/public/book/{bookingForm.slug}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={copyBookingUrl}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/public/book/${bookingForm.slug}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="space-y-2">
                    <Label htmlFor="booking-title">Title</Label>
                    <Input
                      id="booking-title"
                      value={bookingForm.title}
                      onChange={e => setBookingForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder={`Book a call with ${formData.name}`}
                      className="focus-brand"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="booking-desc">Description</Label>
                    <Input
                      id="booking-desc"
                      value={bookingForm.description}
                      onChange={e => setBookingForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Optional subtitle"
                      className="focus-brand"
                    />
                  </div>

                  {/* Slug */}
                  <div className="space-y-2">
                    <Label htmlFor="booking-slug">URL Slug</Label>
                    <Input
                      id="booking-slug"
                      value={bookingForm.slug}
                      onChange={e => setBookingForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                      placeholder="your-slug"
                      className="focus-brand"
                    />
                  </div>

                  {/* Slot Duration */}
                  <div className="space-y-2">
                    <Label>Meeting Duration</Label>
                    <Select
                      value={String(bookingForm.slot_duration_minutes)}
                      onValueChange={v => setBookingForm(prev => ({ ...prev, slot_duration_minutes: Number(v) }))}
                    >
                      <SelectTrigger className="focus-brand">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Available Slots */}
                  <div className="space-y-3">
                    <Label>Available Days & Hours (UTC)</Label>
                    <div className="space-y-2">
                      {DAY_NAMES.map((name, dayIndex) => {
                        const slot = bookingForm.available_slots.find(s => s.day === dayIndex);
                        const isEnabled = !!slot;
                        return (
                          <div key={dayIndex} className="flex items-center gap-3">
                            <div className="flex items-center gap-2 w-28">
                              <Checkbox
                                checked={isEnabled}
                                onCheckedChange={() => toggleDay(dayIndex)}
                              />
                              <span className="text-sm text-ink-warm-700">{name}</span>
                            </div>
                            {isEnabled && (
                              <div className="flex items-center gap-2 text-sm">
                                <TimePicker
                                  value={slot!.start}
                                  onChange={(v) => updateSlotTime(dayIndex, 'start', v)}
                                  className="w-28"
                                  // End time can't be before start, so cap it
                                  // by passing maxTime — but here we're setting
                                  // the START so no upper bound is needed.
                                  maxTime={slot!.end}
                                />
                                <span className="text-ink-warm-400">to</span>
                                <TimePicker
                                  value={slot!.end}
                                  onChange={(v) => updateSlotTime(dayIndex, 'end', v)}
                                  className="w-28"
                                  // The end picker is constrained to be >= start.
                                  minTime={slot!.start}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t border-cream-100">
                    <Button variant="brand" onClick={handleSaveBooking} disabled={bookingSaving}>
                      {bookingSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Booking Settings
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-warm-500">No booking page found for your account.</p>
              )}
            </CardContent>
          </Card>

          {/* ── Google Calendar Integration ──────────────────────── */}
          <SectionHeader
            label="Google Calendar"
            dot="brand"
            counter="Meeting reminders"
          />
          <Card className="border-cream-200">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-brand-light text-brand flex items-center justify-center flex-shrink-0">
                  <Video className="h-4 w-4" />
                </div>
                <p className="text-sm text-ink-warm-500">
                  Connect your Google account to receive Telegram DMs 10 minutes before and at the start of your Google Meet calls.
                  Reminder timing is managed centrally on the <a href="/reminders" className="text-brand hover:text-brand-dark underline">Reminders page</a>.
                </p>
              </div>

              {googleLoading ? (
                <div className="flex items-center gap-2 text-ink-warm-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Checking Google connection...</span>
                </div>
              ) : googleStatus?.connected ? (
                <>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-ink-warm-500">Status</span>
                    <StatusBadge tone="success" withDot>
                      Connected
                    </StatusBadge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-cream-100">
                    <span className="text-sm text-ink-warm-500">Connected as</span>
                    <span className="text-sm font-medium text-ink-warm-900">{googleStatus.email}</span>
                  </div>
                  {googleStatus.connected_at && (
                    <div className="flex items-center justify-between py-2 border-t border-cream-100">
                      <span className="text-sm text-ink-warm-500">Linked on</span>
                      <span className="text-sm text-ink-warm-900 tabular-nums">
                        {formatDate(googleStatus.connected_at)}
                      </span>
                    </div>
                  )}
                  {!userProfile?.telegram_id && (
                    <div className="border-t border-cream-100 pt-3">
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
                        You haven&apos;t linked a Telegram account. Reminders need a Telegram chat to land in — set your <span className="font-medium">Telegram Username</span> above and have a super_admin link your DM on the Team page.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 pt-4 border-t border-cream-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchGoogleStatus}
                      disabled={googleActionLoading}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${googleLoading ? 'animate-spin' : ''}`} />
                      Refresh Status
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDisconnectGoogle}
                      disabled={googleActionLoading}
                    >
                      {googleActionLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Disconnect
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-ink-warm-500">Status</span>
                    <StatusBadge tone="neutral" withDot>
                      Not Connected
                    </StatusBadge>
                  </div>
                  <div className="pt-4 border-t border-cream-100">
                    <Button variant="brand" onClick={handleConnectGoogle} disabled={googleActionLoading}>
                      <Video className="h-4 w-4 mr-2" />
                      Connect Google Calendar
                    </Button>
                  </div>
                  <div className="pt-4 border-t border-cream-100">
                    <p className="text-xs text-ink-warm-500">
                      <strong className="text-ink-warm-700">What we access:</strong> Read-only access to upcoming Calendar events on your primary calendar. We only act on events with a Google Meet link.
                    </p>
                    <p className="text-xs text-ink-warm-500 mt-2">
                      <strong className="text-ink-warm-700">What we send:</strong> A Telegram DM 10 minutes before each Meet, and another at meeting start. You can disable the whole feature on the Reminders page.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Telegram Integration ─ Admin Only ────────────────── */}
          {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
            <>
              <SectionHeader
                label="Telegram Integration"
                dot="brand"
                counter="CRM message tracking"
              />
              <Card className="border-cream-200">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-md bg-brand-light text-brand flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <p className="text-sm text-ink-warm-500">
                      Connect Telegram to automatically track message activity in CRM pipeline group chats.
                    </p>
                  </div>

                  {webhookLoading ? (
                    <div className="flex items-center gap-2 text-ink-warm-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Checking webhook status...</span>
                    </div>
                  ) : (
                    <>
                      {/* Connection Status */}
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-ink-warm-500">Webhook Status</span>
                        {webhookStatus?.url ? (
                          <StatusBadge tone="success" withDot>
                            Connected
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral" withDot>
                            Not Connected
                          </StatusBadge>
                        )}
                      </div>

                      {/* Webhook URL if connected */}
                      {webhookStatus?.url && (
                        <div className="py-2 border-t border-cream-100">
                          <span className="text-sm text-ink-warm-500 block mb-1">Webhook URL</span>
                          <code className="text-xs bg-cream-100 text-ink-warm-700 px-2 py-1 rounded break-all">
                            {webhookStatus.url}
                          </code>
                        </div>
                      )}

                      {/* Pending Updates */}
                      {webhookStatus?.url && webhookStatus.pending_update_count > 0 && (
                        <div className="flex items-center justify-between py-2 border-t border-cream-100">
                          <span className="text-sm text-ink-warm-500">Pending Updates</span>
                          <span className="text-sm font-medium text-amber-600 tabular-nums">
                            {webhookStatus.pending_update_count}
                          </span>
                        </div>
                      )}

                      {/* Last Error */}
                      {webhookStatus?.last_error_message && (
                        <div className="py-2 border-t border-cream-100">
                          <span className="text-sm text-rose-600 block mb-1">Last Error</span>
                          <p className="text-xs text-rose-500">
                            {webhookStatus.last_error_message}
                            {webhookStatus.last_error_date && (
                              <span className="text-ink-warm-400 ml-2">
                                ({formatDateTime(webhookStatus.last_error_date * 1000)})
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3 pt-4 border-t border-cream-100">
                        {webhookStatus?.url ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={fetchWebhookStatus}
                              disabled={webhookLoading}
                            >
                              <RefreshCw className={`h-4 w-4 mr-2 ${webhookLoading ? 'animate-spin' : ''}`} />
                              Refresh Status
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleDeleteWebhook}
                              disabled={webhookActionLoading}
                            >
                              {webhookActionLoading ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <XCircle className="h-4 w-4 mr-2" />
                              )}
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button variant="brand" onClick={handleRegisterWebhook} disabled={webhookActionLoading}>
                            {webhookActionLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <MessageSquare className="h-4 w-4 mr-2" />
                            )}
                            Connect Telegram Webhook
                          </Button>
                        )}
                      </div>

                      {/* Help Text */}
                      <div className="pt-4 border-t border-cream-100">
                        <p className="text-xs text-ink-warm-500">
                          <strong className="text-ink-warm-700">How it works:</strong> Once connected, your Telegram bot will notify this app whenever
                          messages are sent in group chats. Add the chat ID to any CRM opportunity to automatically
                          track message activity.
                        </p>
                        <p className="text-xs text-ink-warm-500 mt-2">
                          <strong className="text-ink-warm-700">Requirements:</strong> Your Telegram bot must be added to each group chat and have
                          permission to see messages (disable privacy mode in BotFather or make it an admin).
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
    </div>
  );
}
