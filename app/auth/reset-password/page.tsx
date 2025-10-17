'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { Loader2, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if we have hash params (Supabase sends tokens as hash fragments)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const type = hashParams.get('type')

        // If we have a recovery token in the URL, set the session
        if (accessToken && type === 'recovery') {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get('refresh_token') || ''
          })

          if (error) {
            setError('Invalid or expired reset link')
            setCheckingSession(false)
            return
          }

          if (data.session) {
            setIsValidSession(true)
          } else {
            setError('Invalid or expired reset link')
          }
        } else {
          // Otherwise check for existing session
          const { data: { session }, error } = await supabase.auth.getSession()

          if (error) {
            setError('Invalid or expired reset link')
            setCheckingSession(false)
            return
          }

          if (session) {
            setIsValidSession(true)
          } else {
            setError('Invalid or expired reset link')
          }
        }
      } catch (err) {
        setError('Invalid or expired reset link')
      } finally {
        setCheckingSession(false)
      }
    }

    checkSession()
  }, [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
        // Redirect to home page after 3 seconds
        setTimeout(() => {
          router.push('/')
        }, 3000)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f6feff' }}>
        <div className="animate-spin rounded-full h-32 w-32 border-b-2" style={{ borderBottomColor: '#3e8692' }}></div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#f6feff' }}>
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-8">
              <Image
                src="/images/logo.png"
                alt="KOL Campaign Manager Logo"
                width={120}
                height={120}
                priority
              />
            </div>
          </div>
          
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-1">
              <div className="flex justify-center mb-4">
                <div className="rounded-full p-3 bg-green-100">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-2xl text-center">Password Updated</CardTitle>
              <CardDescription className="text-center">
                Your password has been successfully updated
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertDescription>
                  You will be redirected to the dashboard in a few seconds...
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#f6feff' }}>
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-8">
              <Image
                src="/images/logo.png"
                alt="KOL Campaign Manager Logo"
                width={120}
                height={120}
                priority
              />
            </div>
          </div>
          
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center">Invalid Link</CardTitle>
              <CardDescription className="text-center">
                This password reset link is invalid or has expired
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              
              <Button 
                onClick={() => router.push('/auth')}
                className="w-full mt-4 hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                Back to Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#f6feff' }}>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-8">
            <Image
              src="/images/logo.png"
              alt="KOL Campaign Manager Logo"
              width={120}
              height={120}
              priority
            />
          </div>
        </div>
        
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Set New Password</CardTitle>
            <CardDescription className="text-center">
              Enter your new password below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="focus:outline-none focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692] auth-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="focus:outline-none focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692] auth-input"
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full hover:opacity-90" 
                disabled={loading}
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
