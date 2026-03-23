'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useGuestPermissions } from '@/hooks/useGuestPermissions';

export default function Home() {
  const router = useRouter();
  const { user, userProfile, loading } = useAuth();
  const { isGuest, firstAllowedPath, loading: guestLoading } = useGuestPermissions();

  useEffect(() => {
    if (!loading && !guestLoading) {
      if (user) {
        if (isGuest && firstAllowedPath) {
          router.push(firstAllowedPath);
        } else {
          router.push('/campaigns');
        }
      } else {
        router.push('/auth');
      }
    }
  }, [user, loading, guestLoading, isGuest, firstAllowedPath, router]);

  // Show loading spinner while determining redirect
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2" style={{ borderBottomColor: '#3e8692' }}></div>
    </div>
  );
}