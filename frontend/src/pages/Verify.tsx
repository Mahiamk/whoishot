import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

export default function Verify() {
  const [searchParams] = useSearchParams()
  const defaultEmail = searchParams.get('email') || ''
  const [email, setEmail] = useState(defaultEmail)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [verified, setVerified] = useState(false)
  const navigate = useNavigate()

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!code || code.trim().length < 4) {
      toast.error('Enter your 6-digit verification code')
      return
    }

    setSubmitting(true)
    try {
      await api('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      })
      toast.success('Email verified successfully!')
      setVerified(true)
      setTimeout(() => {
        navigate('/login')
      }, 1500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (!email) {
      toast.error('Please enter your email address first')
      return
    }

    setResending(true)
    try {
      await api('/auth/send-verification', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      toast.success('New verification code sent to your email!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend code')
    } finally {
      setResending(false)
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 py-8 sm:py-12">
      <Card className="w-full max-w-md rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
        <CardHeader className="space-y-2 p-6 sm:p-8 pb-4 sm:pb-4 text-center">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Verify Your Email</CardTitle>
          <CardDescription className="text-sm">
            Enter the 6-digit security code sent to your email to verify your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 pt-0">
          {verified ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-emerald-500 font-bold text-lg">Email Verified! 🎉</p>
              <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@campus.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 pl-10 text-base sm:text-sm rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-medium">Verification Code</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
                  <Input
                    id="code"
                    type="text"
                    placeholder="123456"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    className="h-11 pl-10 text-base sm:text-sm tracking-widest font-mono rounded-xl"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 min-h-[44px] text-sm font-semibold rounded-xl mt-2"
                disabled={submitting}
              >
                {submitting ? 'Verifying…' : 'Verify Account'}
              </Button>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium transition-colors min-h-[44px] py-2 px-1"
                >
                  <RefreshCw className={`size-3.5 ${resending ? 'animate-spin' : ''}`} />
                  {resending ? 'Sending...' : 'Resend Code'}
                </button>

                <Link to="/login" className="text-primary font-semibold hover:underline min-h-[44px] flex items-center py-2 px-1">
                  Back to Sign In
                </Link>
              </div>

            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
