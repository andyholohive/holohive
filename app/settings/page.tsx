'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Mail, AtSign, Camera, Loader2, Save, ArrowLeft, MessageSquare, CheckCircle, XCircle, RefreshCw, Calendar, Link2, Copy, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useRouter } from 'next/navigation';
import { BookingService, BookingPage, AvailableSlot } from '@/lib/bookingService';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
    }
  }, [userProfile]);

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
        title: 'Error',
        description: 'Failed to register webhook',
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
        title: 'Error',
        description: 'Failed to disconnect webhook',
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploadingPhoto(true);

    try {
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        // If bucket doesn't exist, try campaign-report-files as fallback
        const fallbackFileName = `profile-photos/${user.id}/${Date.now()}.${fileExt}`;
        const { data: fallbackData, error: fallbackError } = await supabase.storage
          .from('campaign-report-files')
          .upload(fallbackFileName, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (fallbackError) {
          throw fallbackError;
        }

        // Get public URL from fallback bucket
        const { data: { publicUrl } } = supabase.storage
          .from('campaign-report-files')
          .getPublicUrl(fallbackFileName);

        // Update user profile with new photo URL
        const { error: updateError } = await supabase
          .from('users')
          .update({ profile_photo_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', user.id);

        if (updateError) throw updateError;

        setFormData(prev => ({ ...prev, profile_photo_url: publicUrl }));
      } else {
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('profile-photos')
          .getPublicUrl(fileName);

        // Update user profile with new photo URL
        const { error: updateError } = await supabase
          .from('users')
          .update({ profile_photo_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', user.id);

        if (updateError) throw updateError;

        setFormData(prev => ({ ...prev, profile_photo_url: publicUrl }));
      }

      await refreshUserProfile();

      toast({
        title: 'Photo updated',
        description: 'Your profile photo has been updated successfully.',
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload profile photo. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploadingPhoto(false);
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
      <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50 py-8">
        <div className="w-full max-w-2xl mx-auto">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div>
                <Skeleton className="h-8 w-48 mb-2" />
                <Skeleton className="h-5 w-72" />
              </div>
            </div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-6">
                  <Skeleton className="h-24 w-24 rounded-full" />
                  <Skeleton className="h-10 w-32" />
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50 py-8">
      <div className="w-full max-w-2xl mx-auto">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.back()}
              className="h-10 w-10"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
              <p className="text-gray-600">Manage your account settings and profile</p>
            </div>
          </div>

          {/* Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information and profile photo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Photo */}
              <div className="flex items-center space-x-6">
                <div className="relative">
                  {formData.profile_photo_url ? (
                    <div className="w-24 h-24 rounded-full overflow-hidden">
                      <img
                        src={formData.profile_photo_url}
                        alt="Profile"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <div className="w-24 h-24 bg-gradient-to-br from-[#3e8692] to-[#2d6470] rounded-full flex items-center justify-center absolute top-0 left-0 hidden">
                        <span className="text-white font-bold text-2xl">
                          {getUserInitials(formData.name || formData.email)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-24 h-24 bg-gradient-to-br from-[#3e8692] to-[#2d6470] rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-2xl">
                        {getUserInitials(formData.name || formData.email)}
                      </span>
                    </div>
                  )}
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
                  <p className="text-sm text-gray-500 mt-2">JPG, PNG or GIF. Max 5MB.</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter your name"
                      className="pl-10 auth-input"
                    />
                  </div>
                </div>

                {/* Email (read-only) */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      value={formData.email}
                      disabled
                      className="pl-10 auth-input bg-gray-50 text-gray-500"
                    />
                  </div>
                  <p className="text-sm text-gray-500">Email cannot be changed</p>
                </div>

                {/* Telegram ID */}
                <div className="space-y-2">
                  <Label htmlFor="telegram_id">Telegram Username</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="telegram_id"
                      value={formData.telegram_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, telegram_id: e.target.value }))}
                      placeholder="Enter your Telegram username"
                      className="pl-10 auth-input"
                    />
                  </div>
                </div>

                {/* X (Twitter) ID */}
                <div className="space-y-2">
                  <Label htmlFor="x_id">X (Twitter) Username</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="x_id"
                      value={formData.x_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, x_id: e.target.value }))}
                      placeholder="Enter your X username"
                      className="pl-10 auth-input"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="hover:opacity-90"
                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                >
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

          {/* Account Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>View your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600">Role</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  userProfile?.role === 'super_admin'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {userProfile?.role === 'super_admin'
                    ? 'Super Admin'
                    : userProfile?.role
                      ? userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)
                      : 'Unknown'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-t">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  userProfile?.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {userProfile?.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-t">
                <span className="text-sm text-gray-600">Member Since</span>
                <span className="text-sm font-medium text-gray-900">
                  {userProfile?.created_at
                    ? new Date(userProfile.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Unknown'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Booking Page Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Booking Page
              </CardTitle>
              <CardDescription>
                Manage your public booking page where prospects can schedule meetings with you
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {bookingLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading booking settings...</span>
                </div>
              ) : bookingPage ? (
                <>
                  {/* Active toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">Page Active</span>
                      <p className="text-xs text-gray-500">When disabled, your booking page won&apos;t be accessible</p>
                    </div>
                    <button
                      onClick={() => setBookingForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        bookingForm.is_active ? 'bg-[#3e8692]' : 'bg-gray-300'
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
                      <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600 border">
                        <Link2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
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
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="booking-desc">Description</Label>
                    <Input
                      id="booking-desc"
                      value={bookingForm.description}
                      onChange={e => setBookingForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Optional subtitle"
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
                    />
                  </div>

                  {/* Slot Duration */}
                  <div className="space-y-2">
                    <Label>Meeting Duration</Label>
                    <Select
                      value={String(bookingForm.slot_duration_minutes)}
                      onValueChange={v => setBookingForm(prev => ({ ...prev, slot_duration_minutes: Number(v) }))}
                    >
                      <SelectTrigger>
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
                              <span className="text-sm text-gray-700">{name}</span>
                            </div>
                            {isEnabled && (
                              <div className="flex items-center gap-2 text-sm">
                                <Input
                                  type="time"
                                  value={slot!.start}
                                  onChange={e => updateSlotTime(dayIndex, 'start', e.target.value)}
                                  className="w-28 h-8 text-sm"
                                />
                                <span className="text-gray-400">to</span>
                                <Input
                                  type="time"
                                  value={slot!.end}
                                  onChange={e => updateSlotTime(dayIndex, 'end', e.target.value)}
                                  className="w-28 h-8 text-sm"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      onClick={handleSaveBooking}
                      disabled={bookingSaving}
                      className="hover:opacity-90"
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                    >
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
                <p className="text-sm text-gray-500">No booking page found for your account.</p>
              )}
            </CardContent>
          </Card>

          {/* Telegram Integration Card - Admin Only */}
          {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Telegram Integration
                </CardTitle>
                <CardDescription>
                  Connect Telegram to automatically track message activity in CRM pipeline group chats
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {webhookLoading ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Checking webhook status...</span>
                  </div>
                ) : (
                  <>
                    {/* Connection Status */}
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-600">Webhook Status</span>
                      {webhookStatus?.url ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3" />
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          <XCircle className="h-3 w-3" />
                          Not Connected
                        </span>
                      )}
                    </div>

                    {/* Webhook URL if connected */}
                    {webhookStatus?.url && (
                      <div className="py-2 border-t">
                        <span className="text-sm text-gray-600 block mb-1">Webhook URL</span>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all">
                          {webhookStatus.url}
                        </code>
                      </div>
                    )}

                    {/* Pending Updates */}
                    {webhookStatus?.url && webhookStatus.pending_update_count > 0 && (
                      <div className="flex items-center justify-between py-2 border-t">
                        <span className="text-sm text-gray-600">Pending Updates</span>
                        <span className="text-sm font-medium text-amber-600">
                          {webhookStatus.pending_update_count}
                        </span>
                      </div>
                    )}

                    {/* Last Error */}
                    {webhookStatus?.last_error_message && (
                      <div className="py-2 border-t">
                        <span className="text-sm text-red-600 block mb-1">Last Error</span>
                        <p className="text-xs text-red-500">
                          {webhookStatus.last_error_message}
                          {webhookStatus.last_error_date && (
                            <span className="text-gray-400 ml-2">
                              ({new Date(webhookStatus.last_error_date * 1000).toLocaleString()})
                            </span>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-4 border-t">
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
                        <Button
                          onClick={handleRegisterWebhook}
                          disabled={webhookActionLoading}
                          className="hover:opacity-90"
                          style={{ backgroundColor: '#3e8692', color: 'white' }}
                        >
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
                    <div className="pt-4 border-t">
                      <p className="text-xs text-gray-500">
                        <strong>How it works:</strong> Once connected, your Telegram bot will notify this app whenever
                        messages are sent in group chats. Add the chat ID to any CRM opportunity to automatically
                        track message activity.
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        <strong>Requirements:</strong> Your Telegram bot must be added to each group chat and have
                        permission to see messages (disable privacy mode in BotFather or make it an admin).
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
