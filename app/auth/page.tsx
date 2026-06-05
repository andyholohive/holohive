'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { LoginForm } from '@/components/auth/LoginForm'
import { SignUpForm } from '@/components/auth/SignUpForm'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { useAuth } from '@/contexts/AuthContext'

// [2026-06-05] Brand-mint `#f6feff` background dropped in favor of
// `bg-cream-50` so the auth surface reads as part of the same v11
// design language as the post-login app interior. The Card itself
// stands out on the cream background via `border-cream-200 shadow-card`
// chrome; no more divergent palette on a single page.


export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (user && !loading) {
      const redirectTo = searchParams.get('redirectTo')
      // Only allow relative paths to prevent open redirect
      if (redirectTo && redirectTo.startsWith('/')) {
        router.push(redirectTo)
      } else {
        router.push('/')
      }
    }
  }, [user, loading, router, searchParams])

  const toggleMode = () => {
    setIsLogin(!isLogin)
    setShowForgotPassword(false)
  }

  const handleForgotPassword = () => {
    setShowForgotPassword(true)
  }

  const handleBackToLogin = () => {
    setShowForgotPassword(false)
  }

  if (loading) {
    // v11 spinner — Loader2 (the same lucide icon every other loading
    // state uses in the app) at brand teal, replacing the hand-rolled
    // animate-spin div + inline brand-hex border.
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50">
        <Loader2 className="h-12 w-12 animate-spin text-brand" />
      </div>
    )
  }

  if (user) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-cream-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Image
              src="/images/logo.png"
              alt="HoloHive Portal Logo"
              width={120}
              height={120}
              priority
            />
          </div>
        </div>

        {showForgotPassword ? (
          <ForgotPasswordForm onBackToLogin={handleBackToLogin} />
        ) : isLogin ? (
          <LoginForm onToggleMode={toggleMode} onForgotPassword={handleForgotPassword} />
        ) : (
          <SignUpForm onToggleMode={toggleMode} />
        )}
      </div>
    </div>
  )
}