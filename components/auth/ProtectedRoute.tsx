'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRoles?: string[]
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth')
    }
  }, [user, loading, router])

  // Check role-based access after loading completes
  useEffect(() => {
    if (!loading && user && userProfile && requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(userProfile.role)) {
        router.push('/') // Redirect to home if role not allowed
      }
    }
  }, [user, userProfile, loading, requiredRoles, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2" style={{ borderBottomColor: '#3e8692' }}></div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  // Check role access
  if (requiredRoles && requiredRoles.length > 0 && userProfile) {
    if (!requiredRoles.includes(userProfile.role)) {
      return null // Will redirect
    }
  }

  return <>{children}</>
} 