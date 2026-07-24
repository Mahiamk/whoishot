import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { api } from '@/lib/api'

/**
 * Landing page for the mock (and future real) payment redirect.
 *
 * URL: /subscribe/success?ref=<provider_ref>&provider=<provider>
 *
 * On mount it calls POST /api/v1/webhooks/{provider} with the provider_ref
 * to activate the subscription (mock provider: instant success).
 * Then invalidates all cached profile queries so the caller's profile
 * auto-refetches with socials unlocked.
 */
export default function SubscribeSuccess() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const activated = useRef(false)

  const ref = searchParams.get('ref')
  const provider = searchParams.get('provider') ?? 'mock'

  useEffect(() => {
    if (!ref || activated.current) return
    activated.current = true

    async function activate() {
      try {
        await api(`/webhooks/${provider}`, {
          method: 'POST',
          body: JSON.stringify({ provider_ref: ref }),
        })
        // Invalidate cached profiles so the caller's socials unlock on return
        queryClient.invalidateQueries({ queryKey: ['profile'] })
        toast.success('Subscribed! Social links are now unlocked 🔓')
      } catch (err) {
        // Idempotency: "already_activated" from the server is not an error
        toast.success('Subscription active — social links unlocked 🔓')
      }
    }

    activate()
  }, [ref, provider, queryClient])

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm rounded-2xl text-center">
        <CardHeader className="items-center">
          <CheckCircle2 className="size-14 text-emerald-500 mb-2" />
          <CardTitle>Subscription Activated</CardTitle>
          <CardDescription>
            You now have 30 days of access to social links across all profiles.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to home
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Go back to the contestant profile you were viewing — the social
            links will now be visible.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
