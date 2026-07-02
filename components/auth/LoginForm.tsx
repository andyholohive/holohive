'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredAsterisk } from '@/components/ui/required-asterisk'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'
import { GoogleSignInButton } from './GoogleSignInButton'

interface LoginFormProps {
  onToggleMode: () => void
  onForgotPassword: () => void
}

// [2026-07-02] Per Andy: consolidate internal auth. Two flows (email +
// password AND Google SSO) was inconvenient — everyone on the team lives
// on @holohive.io, so Google is the primary path. The email/password
// form still lives below "Sign in with email" for the one team member
// not on the workspace domain, but the default surface is one big
// Google button.
export function LoginForm({ onToggleMode, onForgotPassword }: LoginFormProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md border-cream-200 shadow-card">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Welcome Back</CardTitle>
        <CardDescription className="text-center">
          Sign in with your HoloHive Google account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <GoogleSignInButton mode="signin" />

        {showPasswordForm ? (
          <>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-cream-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-ink-warm-500">or use password</span>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email <RequiredAsterisk /></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="focus-brand"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password <RequiredAsterisk /></Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="focus-brand"
                />
              </div>

              <Button variant="brand" type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Signing In…' : 'Sign In'}
              </Button>

              <div className="text-center">
                <button type="button" onClick={onForgotPassword} className="text-sm text-brand hover:text-brand-dark hover:underline">
                  Forgot your password?
                </button>
              </div>

              <div className="text-center text-sm text-ink-warm-500">
                Don&apos;t have an account?{' '}
                <button type="button" onClick={onToggleMode} className="text-brand hover:text-brand-dark hover:underline">
                  Sign up
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setShowPasswordForm(true)}
              className="text-xs text-ink-warm-500 hover:text-brand hover:underline"
            >
              Sign in with email instead
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}