import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { FEMALE, MALE } from '@/lib/brackets'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

const registerSchema = z.object({
  display_name: z.string().min(1, 'Display name is required').max(100),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  gender: z.enum(['F', 'M'], { error: 'Pick one' }),
})

type RegisterValues = z.infer<typeof registerSchema>

interface EmailCheck {
  allowed: boolean
  reason: string
}

function NotRecognizedDialog({
  email,
  open,
  onOpenChange,
}: {
  email: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [submitting, setSubmitting] = useState(false)

  async function submitRequest() {
    setSubmitting(true)
    try {
      await api('/auth/domain-requests', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      toast.success("Thanks — we'll review your university's domain.")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>My university isn't recognized</DialogTitle>
          <DialogDescription>
            We'll ask an admin to review <span className="font-medium">{email}</span>{' '}
            and add your university's domain if it checks out.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submitRequest} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [requestDialogOpen, setRequestDialogOpen] = useState(false)

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { display_name: '', email: '', password: '' },
  })

  const email = form.watch('email')
  const debouncedEmail = useDebouncedValue(email, 500)
  const emailLooksValid = z.email().safeParse(debouncedEmail).success

  const {
    data: emailCheck,
    isFetching: checkingEmail,
  } = useQuery({
    queryKey: ['check-email', debouncedEmail],
    queryFn: () =>
      api<EmailCheck>(`/auth/check-email?email=${encodeURIComponent(debouncedEmail)}`),
    enabled: emailLooksValid,
    retry: false,
    staleTime: 30_000,
  })

  // Only trust emailCheck once it was computed for the email currently
  // debounced/displayed — avoids flashing a stale verdict while retyping.
  const checkIsCurrent = emailLooksValid && !checkingEmail && emailCheck !== undefined
  const allowed = checkIsCurrent ? emailCheck.allowed : false

  async function onSubmit(values: RegisterValues) {
    try {
      await register(values)
      toast.success('Account created — welcome!')
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 py-8 sm:py-12">
      <Card className="w-full max-w-md rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
        <CardHeader className="space-y-1.5 p-6 sm:p-8 pb-4 sm:pb-4">
          <CardTitle className="text-2xl font-bold tracking-tight">Create account</CardTitle>
          <CardDescription className="text-sm">Join WhoIsHot in a minute</CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 pt-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Display name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} className="h-11 text-base sm:text-sm rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                    {emailLooksValid && email === debouncedEmail && (
                      <>
                        {checkingEmail ? (
                          <Alert className="border-amber-500/40 py-2 text-amber-600 dark:text-amber-400 rounded-xl">
                            <Loader2 className="size-4 animate-spin" />
                            <AlertDescription className="text-current text-xs">
                              Checking…
                            </AlertDescription>
                          </Alert>
                        ) : emailCheck?.allowed ? (
                          <Alert className="border-green-500/40 py-2 text-green-600 dark:text-green-400 rounded-xl">
                            <CheckCircle2 className="size-4" />
                            <AlertDescription className="text-current text-xs">
                              University email ✓
                            </AlertDescription>
                          </Alert>
                        ) : emailCheck && !emailCheck.allowed ? (
                          <Alert className="border-destructive/40 py-2 text-destructive rounded-xl">
                            <XCircle className="size-4" />
                            <AlertDescription className="text-current text-xs">
                              Please use your university email (e.g.
                              you@student.youruni.edu.my).{' '}
                              <button
                                type="button"
                                onClick={() => setRequestDialogOpen(true)}
                                className="font-semibold underline underline-offset-2"
                              >
                                My university isn't recognized
                              </button>
                            </AlertDescription>
                          </Alert>
                        ) : null}
                      </>
                    )}
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
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Gender</FormLabel>
                    <FormControl>
                      <Tabs value={field.value} onValueChange={field.onChange}>
                        <TabsList className="w-full h-11 p-1 rounded-xl">
                          <TabsTrigger value="F" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
                            <span
                              className="mr-1.5 inline-block size-2 rounded-full"
                              style={{ backgroundColor: FEMALE }}
                            />
                            Female
                          </TabsTrigger>
                          <TabsTrigger value="M" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
                            <span
                              className="mr-1.5 inline-block size-2 rounded-full"
                              style={{ backgroundColor: MALE }}
                            />
                            Male
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-11 min-h-[44px] text-sm font-semibold rounded-xl mt-2"
                disabled={form.formState.isSubmitting || !allowed}
              >
                {form.formState.isSubmitting ? 'Creating…' : 'Create account'}
              </Button>
            </form>
          </Form>
          <GoogleSignInButton />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
      <NotRecognizedDialog
        email={debouncedEmail}
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
      />
    </main>
  )
}

