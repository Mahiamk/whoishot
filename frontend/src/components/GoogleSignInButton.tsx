import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/context/AuthContext'
import { FEMALE, MALE } from '@/lib/brackets'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined
const GSI_SRC = 'https://accounts.google.com/gsi/client'

interface GoogleIdApi {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (response: { credential: string }) => void
      }) => void
      renderButton: (
        parent: HTMLElement,
        options: Record<string, unknown>,
      ) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdApi
  }
}

function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    )
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('GSI failed')))
      return
    }
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('GSI failed'))
    document.head.appendChild(script)
  })
}

function GoogleLogo() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.27a11.99 11.99 0 0 0 0 10.78l4.01-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  )
}

/** "Continue with Google" button. Renders nothing when
 * VITE_GOOGLE_CLIENT_ID isn't configured. New Google accounts get a small
 * dialog to pick their bracket before the account is created. Google's
 * iframe button can't be themed to match the app, so a styled layer is
 * shown and the real button sits transparently above it to catch clicks. */
export function GoogleSignInButton() {
  const { loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const buttonRef = useRef<HTMLDivElement>(null)
  const [pendingCredential, setPendingCredential] = useState<string | null>(
    null,
  )
  const [gender, setGender] = useState<'F' | 'M' | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  function finishLogin() {
    toast.success('Welcome!')
    navigate('/')
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !buttonRef.current) return
    let cancelled = false
    loadGsiScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            try {
              const result = await loginWithGoogle(credential)
              if (result === 'needs_gender') {
                setPendingCredential(credential)
              } else {
                finishLogin()
              }
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : 'Google sign-in failed',
              )
            }
          },
        })
        // The real Google button is rendered invisible on top of our own
        // theme-matched button below — Google's iframe can't be restyled,
        // but it still needs to receive the actual click.
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width: 336,
        })
      })
      .catch(() => {
        // Script blocked/offline — quietly leave only password login.
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function completeSignUp() {
    if (!pendingCredential || !gender) return
    setSubmitting(true)
    try {
      const result = await loginWithGoogle(pendingCredential, gender)
      if (result === 'ok') {
        setPendingCredential(null)
        finishLogin()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google sign-in failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!GOOGLE_CLIENT_ID) return null

  return (
    <>
      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="group relative h-10 overflow-hidden rounded-md">
        {/* Visual layer: matches the app's theme. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-md border bg-background text-sm font-medium text-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
        >
          <GoogleLogo />
          Continue with Google
        </div>
        {/* Click layer: the real (invisible) Google button. */}
        <div
          ref={buttonRef}
          className="absolute inset-0 flex justify-center opacity-0"
        />
      </div>

      <Dialog
        open={pendingCredential !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCredential(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>One last thing</DialogTitle>
            <DialogDescription>
              Pick your bracket to finish creating your account.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={gender}
            onValueChange={(v) => setGender(v as 'F' | 'M')}
          >
            <TabsList className="w-full h-11">
              <TabsTrigger value="F" className="flex-1 h-11 rounded-xl font-medium">
                <span
                  className="mr-2 inline-block size-2 rounded-full"
                  style={{ backgroundColor: FEMALE }}
                />
                Female
              </TabsTrigger>
              <TabsTrigger value="M" className="flex-1 h-11 rounded-xl font-medium">
                <span
                  className="mr-2 inline-block size-2 rounded-full"
                  style={{ backgroundColor: MALE }}
                />
                Male
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <DialogFooter>
            <Button
              className="w-full h-11 min-h-[44px] rounded-xl font-semibold"
              disabled={!gender || submitting}
              onClick={completeSignUp}
            >
              {submitting ? 'Creating account…' : 'Continue'}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </>
  )
}
