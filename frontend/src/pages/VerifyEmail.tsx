import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'

interface VerifyEmailResponse {
  access_token: string
}

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { completeVerification } = useAuth()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const attemptRef = useRef(false)

  useEffect(() => {
    if (attemptRef.current) return
    attemptRef.current = true

    if (!token) {
      setStatus('error')
      setErrorMessage('Missing verification token in URL.')
      return
    }

    api<VerifyEmailResponse>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(async (data) => {
        await completeVerification(data.access_token)
        setStatus('success')
        toast.success('Account activated! Welcome to WhoIsHot!')
      })
      .catch((err) => {
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Verification failed or link expired.')
      })
  }, [token, completeVerification])

  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 py-8 sm:py-12">
      <Card className="w-full max-w-md rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
        {status === 'loading' && (
          <CardHeader className="space-y-3 p-6 sm:p-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Loader2 className="size-7 animate-spin" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Activating your account…</CardTitle>
            <CardDescription className="text-sm">
              Please wait while we verify your email address.
            </CardDescription>
          </CardHeader>
        )}

        {status === 'success' && (
          <>
            <CardHeader className="space-y-2 p-6 sm:p-8 text-center pb-2">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-green-500/10 text-green-500 mb-2">
                <CheckCircle2 className="size-8" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Account Activated! 🎉</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Your email has been verified successfully. Your account is active and you are now signed in!
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 pt-4 space-y-3">
              <Button
                asChild
                className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-600 via-pink-600 to-cyan-600 font-semibold text-white shadow-md hover:opacity-95"
              >
                <Link to="/">
                  <Sparkles className="size-4 mr-2" />
                  Explore Contests & Leaderboards
                </Link>
              </Button>
            </CardContent>
          </>
        )}

        {status === 'error' && (
          <>
            <CardHeader className="space-y-2 p-6 sm:p-8 text-center pb-2">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-2">
                <AlertCircle className="size-8" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Verification Link Invalid</CardTitle>
              <CardDescription className="text-sm leading-relaxed text-destructive/90">
                {errorMessage || 'This activation link is invalid or has expired.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 pt-4 space-y-3">
              <Button
                asChild
                className="w-full h-11 rounded-xl font-semibold"
              >
                <Link to="/login">Go to Login</Link>
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  )
}
