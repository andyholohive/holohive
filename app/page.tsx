'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/clients');
  }, [router]);
  return <ProtectedRoute><div className="h-screen flex items-center justify-center text-lg">Redirecting...</div></ProtectedRoute>;
}