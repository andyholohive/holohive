'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function StandupSubmitPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);
  const [checkingToday, setCheckingToday] = useState(true);

  const [formData, setFormData] = useState({
    completed_yesterday: '',
    priorities: '',
    output_goal: '',
    blockers: '',
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?redirectTo=/public/standup/submit');
    }
  }, [authLoading, user, router]);

  // Check if already submitted today
  useEffect(() => {
    if (!user) return;
    const checkToday = async () => {
      const { data } = await supabase
        .from('daily_standups')
        .select('id')
        .eq('user_id', user.id)
        .eq('submission_date', todayStr)
        .limit(1);
      setHasSubmittedToday((data && data.length > 0) || false);
      setCheckingToday(false);
    };
    checkToday();
  }, [user, todayStr]);

  const userName = useMemo(() => {
    if (userProfile?.name) return userProfile.name;
    if (userProfile?.email) return userProfile.email;
    if (user?.email) return user.email;
    return 'Unknown';
  }, [user, userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.completed_yesterday) {
      setError('Please select whether you completed yesterday\'s priorities');
      return;
    }
    if (!formData.priorities.trim()) {
      setError('Top priorities are required');
      return;
    }
    if (!formData.output_goal.trim()) {
      setError('Output goal is required');
      return;
    }
    if (!user?.id) {
      setError('You must be logged in to submit');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from('daily_standups')
        .insert({
          user_id: user.id,
          user_name: userName,
          completed_yesterday: formData.completed_yesterday,
          priorities: formData.priorities.trim(),
          output_goal: formData.output_goal.trim(),
          blockers: formData.blockers.trim() || null,
          submission_date: todayStr,
        });

      if (insertError) throw insertError;

      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred while submitting');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderBottomColor: '#3e8692' }} />
      </div>
    );
  }

  // Already submitted today
  if (!checkingToday && hasSubmittedToday && !isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Already Submitted</h2>
            <p className="text-gray-500 mb-2">You&apos;ve already submitted your stand-up for today.</p>
            <p className="text-sm text-gray-400">Come back tomorrow to submit again.</p>
          </div>
        </div>
      </div>
    );
  }

  // Success screen
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Stand-Up Submitted!</h2>
            <p className="text-gray-500 mb-2">Your daily stand-up has been recorded.</p>
            <p className="text-sm text-gray-400">{new Date().getDay() === 5 ? 'See you next week!' : 'See you tomorrow!'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header with logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/images/logo.png"
              alt="Logo"
              width={48}
              height={48}
              className="rounded-lg"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Stand-Up</h1>
          <p className="text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
          {/* User profile */}
          <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
            {userProfile?.profile_photo_url ? (
              <Image
                src={userProfile.profile_photo_url}
                alt={userName}
                width={40}
                height={40}
                className="rounded-full object-cover h-10 w-10"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-[#3e8692]/10 flex items-center justify-center text-[#3e8692] text-sm font-bold">
                {userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <p className="text-sm font-semibold text-gray-900">{userName}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label>Did you complete yesterday&apos;s priorities? <span className="text-red-500">*</span></Label>
              <Select
                value={formData.completed_yesterday}
                onValueChange={(v) => setFormData(prev => ({ ...prev, completed_yesterday: v }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="auth-input">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Top 1-2 Priorities <span className="text-red-500">*</span></Label>
              <p className="text-xs text-gray-400 -mt-1">What will you finish or move forward significantly today?</p>
              <Textarea
                placeholder='e.g., Send outbound pitch deck to 10 partners'
                value={formData.priorities}
                onChange={e => setFormData(prev => ({ ...prev, priorities: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Output Goal <span className="text-red-500">*</span></Label>
              <p className="text-xs text-gray-400 -mt-1">Quantify what success looks like today</p>
              <Textarea
                placeholder='e.g., Book 2 calls'
                value={formData.output_goal}
                onChange={e => setFormData(prev => ({ ...prev, output_goal: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Any blockers, comments, etc.</Label>
              <p className="text-xs text-gray-400 -mt-1">Is anything slowing you down?</p>
              <Textarea
                placeholder="Optional — leave blank if none"
                value={formData.blockers}
                onChange={e => setFormData(prev => ({ ...prev, blockers: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
                rows={2}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              disabled={isSubmitting || checkingToday}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : checkingToday ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Submit Stand-Up'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by Holo Hive
        </p>
      </div>
    </div>
  );
}
