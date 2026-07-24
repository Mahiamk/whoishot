import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckoutDialog } from '@/components/CheckoutDialog'

import { X } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'


import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Countdown } from '@/components/Countdown'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { FEMALE, MALE } from '@/lib/brackets'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface ContestTiming {
  id: number
  title: string
  ends_at: string
  status: 'active' | 'ended'
  allowed_email_domain: string | null
  requires_password: boolean
  entry_fee_cents: number
  currency: string
}

interface EntryStatus {
  has_paid: boolean
  status: string | null
  provider_ref: string | null
  payment_handle: string | null
}

function emailMatchesDomain(email: string, domain: string): boolean {
  return email.endsWith(`@${domain}`) || email.endsWith(`.${domain}`)
}

const joinSchema = z.object({
  contest_password: z.string().max(100),
  name: z.string().min(1, 'Name is required').max(100),
  gender_category: z.enum(['F', 'M'], { error: 'Pick a bracket' }),
  age: z
    .string()
    .refine((v) => v === '' || (/^\d+$/.test(v) && +v >= 16 && +v <= 120), {
      message: 'Age must be between 16 and 120',
    }),
  country: z.string().max(100),
  hobbies: z.string().max(500),
  fav_things: z.string().max(500),
  relationship_status: z.string().max(50),
  instagram: z.string().max(100),
  tiktok: z.string().max(100),
  x: z.string().max(100),
  socials_visible: z.boolean(),
})

type JoinValues = z.infer<typeof joinSchema>

export default function Join() {
  const { joinCode } = useParams()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [paymentHandle, setPaymentHandle] = useState('')
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const { data: contestTiming } = useQuery({
    queryKey: ['contest-timing', joinCode],
    queryFn: () => api<ContestTiming>(`/contests/${joinCode}`),
    enabled: !!joinCode && !!user,
    retry: false,
  })

  const { data: entryStatus } = useQuery({
    queryKey: ['entry-status', contestTiming?.id],
    queryFn: () => api<EntryStatus>(`/entries/status?contest_id=${contestTiming?.id}`),
    enabled: !!contestTiming && contestTiming.entry_fee_cents > 0 && !!user,
  })


  const form = useForm<JoinValues>({
    resolver: zodResolver(joinSchema),
    defaultValues: {
      contest_password: '',
      name: '',
      age: '',
      country: '',
      hobbies: '',
      fav_things: '',
      relationship_status: '',
      instagram: '',
      tiktok: '',
      x: '',
      socials_visible: true,
    },
  })

  function goBack() {
    if (form.formState.isDirty || photo) {
      setDiscardOpen(true)
      return
    }
    navigate(`/contest/${joinCode}`)
  }

  function discardAndGoBack() {
    setDiscardOpen(false)
    navigate(`/contest/${joinCode}`)
  }

  function onPhotoChange(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) {
      toast.error('Photo must be a JPEG, PNG or WebP image')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Photo must be 5 MB or smaller')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  async function onSubmit(values: JoinValues) {
    if (contestTiming?.requires_password && !values.contest_password) {
      form.setError('contest_password', {
        message: 'This contest requires a password to join',
      })
      return
    }
    try {
      let photo_url: string | null = null
      if (photo) {
        const formData = new FormData()
        formData.append('file', photo)
        const uploaded = await api<{ url: string }>('/media/photo', {
          method: 'POST',
          body: formData,
        })
        photo_url = uploaded.url
      }

      const socials = [
        { platform: 'instagram', handle: values.instagram.trim() },
        { platform: 'tiktok', handle: values.tiktok.trim() },
        { platform: 'x', handle: values.x.trim() },
      ].filter((s) => s.handle)

      await api(`/contests/${joinCode}/contestants`, {
        method: 'POST',
        body: JSON.stringify({
          password: values.contest_password || null,
          name: values.name,
          gender_category: values.gender_category,
          photo_url,
          age: values.age === '' ? null : Number(values.age),
          country: values.country.trim() || null,
          hobbies: values.hobbies.trim() || null,
          fav_things: values.fav_things.trim() || null,
          relationship_status: values.relationship_status.trim() || null,
          socials_visible: values.socials_visible,
          socials,
        }),
      })
      toast.success("You're in! Good luck 🍀")
      navigate(`/contest/${joinCode}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join contest')
    }
  }

  if (!loading && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-2xl text-center">
          <CardHeader>
            <CardTitle>Sign in first</CardTitle>
            <CardDescription>
              You need an account to join {joinCode}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (contestTiming?.status === 'ended') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-2xl text-center">
          <CardHeader>
            <CardTitle>Contest ended</CardTitle>
            <CardDescription>
              {contestTiming.title} is no longer accepting new contestants.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/contest/${joinCode}`}>Back to contest</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (
    user &&
    contestTiming?.allowed_email_domain &&
    !emailMatchesDomain(user.email, contestTiming.allowed_email_domain)
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-2xl text-center">
          <CardHeader>
            <CardTitle>Students only</CardTitle>
            <CardDescription>
              This contest is for @{contestTiming.allowed_email_domain}{' '}
              students. Your account email ({user.email}) doesn't match.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/contest/${joinCode}`}>Back to contest</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (contestTiming && contestTiming.entry_fee_cents > 0 && !entryStatus?.has_paid) {
    const feeRM = (contestTiming.entry_fee_cents / 100).toFixed(2)
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Join {joinCode} — Paid Contest</CardTitle>
            <CardDescription>
              Entry fee is required to participate in this contest.
            </CardDescription>
            <CardAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cancel and go back"
                onClick={goBack}
              >
                <X />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
              <div className="flex justify-between items-center text-sm font-semibold">
                <span>Entry Fee Required</span>
                <span className="text-lg text-primary font-bold">RM {feeRM}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                All entry fees build the contest prize pool (1st 35%, 2nd 25%, 3rd 20%, Platform 20%). If fewer than 5 paid entrants join by the end of the contest, entry fees will be refunded.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Payout / Refund Handle (TNG eWallet / Bank Account) *
              </label>
              <Input
                placeholder="e.g. TNG 012-3456789 or Bank account"
                value={paymentHandle}
                onChange={(e) => setPaymentHandle(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                This handle will be used by CampusCrown admins to transfer prize money if you win or issue a refund if applicable.
              </p>
            </div>

            {entryStatus?.status === 'awaiting_review' ? (
              <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-center space-y-2">
                <Badge className="bg-amber-500 text-white">Awaiting Review</Badge>
                <h4 className="font-semibold">Entry Payment Submitted</h4>
                <p className="text-xs text-muted-foreground">
                  Your manual payment receipt is awaiting admin review (Ref: {entryStatus.provider_ref}).
                  You will be able to complete join submission as soon as an admin approves it.
                </p>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={() => {
                  if (!paymentHandle.trim()) {
                    toast.error('Please enter your payment handle for prize payout or refund')
                    return
                  }
                  setCheckoutOpen(true)
                }}
              >
                Pay RM {feeRM} & Unlock Join Form
              </Button>
            )}

            <CheckoutDialog
              open={checkoutOpen}
              onOpenChange={setCheckoutOpen}
              type="entry_fee"
              contestId={contestTiming.id}
              contestTitle={contestTiming.title}
              entryFeeCents={contestTiming.entry_fee_cents}
              paymentHandle={paymentHandle}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['entry-status', contestTiming.id] })
              }}
            />
          </CardContent>
        </Card>
      </main>
    )
  }


  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Join {joinCode}</CardTitle>
          <CardDescription>
            Only name and bracket are required — share as much as you like.
            You can remove your profile at any time.
          </CardDescription>
          {contestTiming && (
            <Countdown
              endsAt={contestTiming.ends_at}
              status={contestTiming.status}
              className="mt-1"
            />
          )}
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel and go back"
              onClick={goBack}
            >
              <X />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {contestTiming?.requires_password && (
                <FormField
                  control={form.control}
                  name="contest_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contest password *</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Ask the contest creator"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="flex items-center gap-4">
                <Avatar className="size-20">
                  {preview && <AvatarImage src={preview} alt="Photo preview" />}
                  <AvatarFallback>📷</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <FormLabel>Photo (optional)</FormLabel>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept={PHOTO_TYPES.join(',')}
                    onChange={(e) => onPhotoChange(e.target.files)}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="How should we call you?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bracket *</FormLabel>
                    <FormControl>
                      <Tabs value={field.value} onValueChange={field.onChange}>
                        <TabsList className="w-full">
                          <TabsTrigger value="F" className="flex-1">
                            <span
                              className="mr-2 inline-block size-2 rounded-full"
                              style={{ backgroundColor: FEMALE }}
                            />
                            Ladies
                          </TabsTrigger>
                          <TabsTrigger value="M" className="flex-1">
                            <span
                              className="mr-2 inline-block size-2 rounded-full"
                              style={{ backgroundColor: MALE }}
                            />
                            Gents
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" placeholder="21" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder="Malaysia" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="hobbies"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hobbies</FormLabel>
                    <FormControl>
                      <Input placeholder="futsal, baking, chess" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fav_things"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Favourite things</FormLabel>
                    <FormControl>
                      <Input placeholder="matcha, night markets" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="relationship_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship status</FormLabel>
                    <FormControl>
                      <Input placeholder="single / taken / it's complicated" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="instagram"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram</FormLabel>
                      <FormControl>
                        <Input placeholder="@you" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tiktok"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>TikTok</FormLabel>
                      <FormControl>
                        <Input placeholder="@you" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="x"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>X</FormLabel>
                      <FormControl>
                        <Input placeholder="@you" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="socials_visible"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Show my socials</FormLabel>
                      <FormDescription>
                        Voters can see your handles on your profile.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? 'Joining…' : 'Join contest'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your entry?</AlertDialogTitle>
            <AlertDialogDescription>
              You've filled in some details. Leaving now discards them and
              you won't have joined this contest.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndGoBack}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
