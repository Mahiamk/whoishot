import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { useAuth } from '@/context/AuthContext'

import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/lib/api'

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginValues = z.infer<typeof loginSchema>

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    setUnverifiedEmail(null)
    try {
      await login(values.email, values.password)
      toast.success('Welcome back!')
      // Always land on the landing page — popular contests are shown
      // there; never bounce a fresh sign-in into a contest.
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      if (msg.toLowerCase().includes('verify') || msg.toLowerCase().includes('activation')) {
        setUnverifiedEmail(values.email)
      }
      toast.error(msg)
    }
  }

  async function handleResend() {
    if (!unverifiedEmail) return
    setResending(true)
    try {
      await api('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: unverifiedEmail }),
      })
      toast.success('Activation link sent! Please check your inbox.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend email')
    } finally {
      setResending(false)
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 py-8 sm:py-12">
      <Card className="w-full max-w-md rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
        <CardHeader className="space-y-1.5 p-6 sm:p-8 pb-4 sm:pb-4">
          <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
          <CardDescription className="text-sm">Sign in to your WhoIsHot account</CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 pt-0">
          {unverifiedEmail && (
            <Alert className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl space-y-2">
              <AlertDescription className="text-xs leading-relaxed">
                Your account is not activated yet. Check your inbox for the link sent to <strong>{unverifiedEmail}</strong>.
              </AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs h-8 rounded-lg border-amber-500/30 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20"
                onClick={handleResend}
                disabled={resending}
              >
                {resending ? 'Sending…' : 'Resend activation email'}
              </Button>
            </Alert>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@campus.edu" {...field} className="h-11 text-base sm:text-sm rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} className="h-11 text-base sm:text-sm rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-11 min-h-[44px] text-sm font-semibold rounded-xl mt-2"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </Form>
          <GoogleSignInButton />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/register" className="text-primary font-semibold hover:underline">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

