'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { LogOut, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRoles?: string[]
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, userProfile, loading, signOut } = useAuth()
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

  // Block inactive users with Pending Approval screen
  if (userProfile && userProfile.is_active === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="mb-6">
            <img
              src="/images/logo.png"
              alt="Logo"
              className="h-16 w-auto mx-auto mb-4"
            />
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#3e869215' }}>
              <Clock className="h-8 w-8" style={{ color: '#3e8692' }} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Pending Approval
            </h2>
            <p className="text-gray-600 mb-6">
              Your account has been created and is awaiting admin approval. You'll be able to access the app once an administrator reviews your request.
            </p>
            <Button
              onClick={signOut}
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Check role access
  if (requiredRoles && requiredRoles.length > 0 && userProfile) {
    if (!requiredRoles.includes(userProfile.role)) {
      return null // Will redirect
    }
  }

  return <>{children}</>
}
