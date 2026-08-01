import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CheckCircle2, Pencil, Sparkles, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { CheckoutDialog } from '@/components/CheckoutDialog'


import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { bracketColor } from '@/lib/brackets'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface MyContestantEntry {
  contestant_id: number
  contest_id: number
  contest_title: string
  contest_join_code: string
  contest_status: 'active' | 'ended'
  name: string
  photo_url: string | null
  gender_category: 'F' | 'M'
  age: number | null
  country: string | null
  hobbies: string | null
  fav_things: string | null
  relationship_status: string | null
  socials_visible: boolean
  open_to_opportunities: boolean
  status: 'active' | 'reported' | 'removed'
  criterion_averages: Record<string, number>
  vote_count: number
  avg_score: number | null
  rank: number | null
}

interface PartnerIntroductionItem {
  id: number
  inquiry_id: number
  contestant_id: number
  admin_id: number
  status: 'pending_consent' | 'accepted' | 'declined' | 'expired'
  admin_note: string | null
  contact_info_shared: boolean
  shared_at: string | null
  created_at: string
  responded_at: string | null
  deadline_at: string
  contestant_name?: string
  contest_title?: string
  company_name?: string
  contact_name?: string
  inquiry_type?: string
  inquiry_message?: string
  inquiry_interested_in?: string
}


interface MyInfoRequestItem {
  id: number
  message: string
  status: 'pending' | 'responded' | 'expired' | 'closed'
  user_response: string | null
  deadline_at: string
  created_at: string
  responded_at: string | null
  contest_title: string
  contest_join_code: string
  contestant_name: string
}

function daysLeft(deadlineAt: string): number {
  const ms = new Date(deadlineAt).getTime() - Date.now()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

interface FullProfile {
  id: number
  name: string
  gender_category: 'F' | 'M'
  photo_url: string | null
  age: number | null
  country: string | null
  hobbies: string | null
  fav_things: string | null
  relationship_status: string | null
  socials_visible: boolean
  socials: { id: number; platform: string; handle: string }[]
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function statusBadge(status: string) {
  if (status === 'removed') return <Badge variant="secondary">Removed</Badge>
  if (status === 'reported') return <Badge className="bg-destructive text-white">Under review</Badge>
  return null
}

// --- Account tab --------------------------------------------------------

const accountSchema = z.object({
  display_name: z.string().min(1, 'Required').max(100),
  gender: z.enum(['F', 'M']),
  country: z.string().max(50),
})
type AccountValues = z.infer<typeof accountSchema>

const passwordSchema = z
  .object({
    old_password: z.string().min(1, 'Required'),
    new_password: z.string().min(8, 'At least 8 characters'),
    confirm_password: z.string().min(1, 'Required'),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  })
type PasswordValues = z.infer<typeof passwordSchema>

function AccountTab() {
  const { user, refreshUser } = useAuth()

  const accountForm = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    values: user
      ? { display_name: user.display_name, gender: user.gender, country: user.country || '' }
      : { display_name: '', gender: 'F', country: '' },
  })

  async function onAccountSubmit(values: AccountValues) {
    try {
      await api('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: values.display_name,
          gender: values.gender,
          country: values.country || null,
        }),
      })
      await refreshUser()
      toast.success('Account updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update account')
    }
  }

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  })

  async function onPasswordSubmit(values: PasswordValues) {
    try {
      await api('/users/me/password', {
        method: 'POST',
        body: JSON.stringify({
          old_password: values.old_password,
          new_password: values.new_password,
        }),
      })
      toast.success('Password changed')
      passwordForm.reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change password')
    }
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
        <CardHeader className="p-6 sm:p-8 pb-4 sm:pb-4 space-y-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Profile</CardTitle>
              <CardDescription className="text-xs sm:text-sm">{user.email}</CardDescription>
            </div>
            {user.is_verified ? (
              <Badge className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1">Verified</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs px-2.5 py-1">Unverified</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 pt-0">
          <Form {...accountForm}>
            <form
              onSubmit={accountForm.handleSubmit(onAccountSubmit)}
              className="space-y-4"
            >
              <FormField
                control={accountForm.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Display name</FormLabel>
                    <FormControl>
                      <Input {...field} className="h-11 text-base sm:text-sm rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={accountForm.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Gender</FormLabel>
                    <FormControl>
                      <Tabs value={field.value} onValueChange={field.onChange}>
                        <TabsList className="w-full h-11 p-1 rounded-xl">
                          <TabsTrigger value="F" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
                            Female
                          </TabsTrigger>
                          <TabsTrigger value="M" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
                            Male
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={accountForm.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Country / Payment Region</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full h-11 rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Auto-detect from IP</option>
                        <option value="FR">France (EUR)</option>
                        <option value="DE">Germany (EUR)</option>
                        <option value="ES">Spain (EUR)</option>
                        <option value="IT">Italy (EUR)</option>
                        <option value="NL">Netherlands (EUR)</option>
                        <option value="GB">United Kingdom (GBP)</option>
                        <option value="US">United States (USD)</option>
                        <option value="CA">Canada (CAD)</option>
                        <option value="AU">Australia (AUD)</option>
                        <option value="SG">Singapore (SGD)</option>
                        <option value="MY">Malaysia (MYR / Touch 'n Go)</option>
                        <option value="ET">Ethiopia (ETB / Chapa)</option>
                        <option value="OTHER">Other Region</option>
                      </select>
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      {user.detected_country && (
                        <span>Detected IP location: <strong>{user.detected_country}</strong>. </span>
                      )}
                      Determines payment currency and available checkout providers.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={accountForm.formState.isSubmitting}
                className="h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl"
              >
                {accountForm.formState.isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
        <CardHeader className="p-6 sm:p-8 pb-4 sm:pb-4 space-y-1">
          <CardTitle className="text-xl font-bold tracking-tight">Change password</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Choose a new password with at least 8 characters.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 pt-0">
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              className="space-y-4"
            >
              <FormField
                control={passwordForm.control}
                name="old_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Current password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} className="h-11 text-base sm:text-sm rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="new_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">New password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} className="h-11 text-base sm:text-sm rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirm_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Confirm new password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} className="h-11 text-base sm:text-sm rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={passwordForm.formState.isSubmitting}
                className="h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl"
              >
                {passwordForm.formState.isSubmitting
                  ? 'Updating…'
                  : 'Change password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <EmailPreferencesCard />

      <MyPaymentsCard />
    </div>
  )

}

function EmailPreferencesCard() {
  const { user, refreshUser } = useAuth()
  const [optOut, setOptOut] = useState(user?.email_opt_out ?? false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) setOptOut(user.email_opt_out ?? false)
  }, [user])

  async function handleToggle(checked: boolean) {
    setOptOut(checked)
    setSaving(true)
    try {
      await api('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ email_opt_out: checked }),
      })
      await refreshUser()
      toast.success(checked ? 'Opted out of non-essential emails' : 'Email notifications enabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update email preferences')
      setOptOut(!checked)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
      <CardHeader className="p-6 sm:p-8 pb-4 sm:pb-4 space-y-1">
        <CardTitle className="text-xl font-bold tracking-tight">Email preferences</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Manage which emails you receive from WhoIsHot.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 sm:p-8 pt-0 space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
          <div className="space-y-0.5">
            <p className="font-semibold text-sm text-foreground">Opt out of contest activity & reminder emails</p>
            <p className="text-xs text-muted-foreground max-w-md">
              Suppresses contest joined and contest ending soon reminders. Security, account verification, payment reviews, and admin/moderation notifications will always send regardless.
            </p>
          </div>
          <Switch
            checked={optOut}
            disabled={saving}
            onCheckedChange={handleToggle}
            className="shrink-0"
          />
        </div>
      </CardContent>
    </Card>
  )

}


interface UserPaymentItem {
  id: number
  type: 'subscription' | 'entry_fee'
  provider_ref: string
  amount: number
  currency: string
  status: 'pending' | 'awaiting_review' | 'paid' | 'rejected' | 'failed'
  review_note: string | null
  receipt_url: string | null
  created_at: string
  reviewed_at: string | null
}

function MyPaymentsCard() {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutType, setCheckoutType] = useState<'subscription' | 'entry_fee'>('subscription')

  const { data: payments, isLoading } = useQuery({
    queryKey: ['my-payments'],
    queryFn: () => api<UserPaymentItem[]>('/users/me/payments'),
  })

  if (isLoading || !payments || payments.length === 0) return null

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Payment Submissions</CardTitle>
          <CardDescription>Status of your manual bank / TnG transfer reviews.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {payments.map((p) => (
            <div key={`${p.type}-${p.id}`} className="rounded-xl border p-3.5 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {p.type === 'subscription' ? 'Social Links Plan' : 'Contest Entry Fee'}
                </span>
                {p.status === 'awaiting_review' && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">Awaiting Review</Badge>
                )}
                {p.status === 'paid' && (
                  <Badge className="bg-green-600 text-white hover:bg-green-600">Approved</Badge>
                )}
                {p.status === 'rejected' && (
                  <Badge className="bg-destructive text-white">Rejected</Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Ref: {p.provider_ref}</span>
                <span>{(p.amount / 100).toFixed(2)} {p.currency}</span>
              </div>
              {p.status === 'rejected' && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  {p.review_note && (
                    <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive font-medium flex-1">
                      Reason: {p.review_note}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1 whitespace-nowrap"
                    onClick={() => {
                      setCheckoutType(p.type)
                      setCheckoutOpen(true)
                    }}
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        type={checkoutType}
      />
    </>
  )
}

interface FullProfile {
  id: number
  name: string
  gender_category: 'F' | 'M'
  photo_url: string | null
  age: number | null
  country: string | null
  hobbies: string | null
  fav_things: string | null
  relationship_status: string | null
  socials_visible: boolean
  open_to_opportunities: boolean
  socials: { id: number; platform: string; handle: string }[]
}

// --- Edit profile dialog -------------------------------------------------

const editSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  gender_category: z.enum(['F', 'M']),
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
  open_to_opportunities: z.boolean(),
})
type EditValues = z.infer<typeof editSchema>

function EditProfileDialog({
  contestantId,
  open,
  onOpenChange,
  onSaved,
}: {
  contestantId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['contestant-profile', contestantId],
    queryFn: () => api<FullProfile>(`/contestants/${contestantId}`),
    enabled: open,
  })

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: '',
      gender_category: 'F',
      age: '',
      country: '',
      hobbies: '',
      fav_things: '',
      relationship_status: '',
      instagram: '',
      tiktok: '',
      x: '',
      socials_visible: true,
      open_to_opportunities: false,
    },
  })

  useEffect(() => {
    if (!profile) return
    const byPlatform = Object.fromEntries(
      profile.socials.map((s) => [s.platform, s.handle]),
    )
    form.reset({
      name: profile.name,
      gender_category: profile.gender_category,
      age: profile.age != null ? String(profile.age) : '',
      country: profile.country ?? '',
      hobbies: profile.hobbies ?? '',
      fav_things: profile.fav_things ?? '',
      relationship_status: profile.relationship_status ?? '',
      instagram: byPlatform.instagram ?? '',
      tiktok: byPlatform.tiktok ?? '',
      x: byPlatform.x ?? '',
      socials_visible: profile.socials_visible,
      open_to_opportunities: profile.open_to_opportunities ?? false,
    })
  }, [profile, form])

  useEffect(() => {
    if (!open) {
      setPhoto(null)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  async function onSubmit(values: EditValues) {
    try {
      let photo_url = profile?.photo_url ?? null
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

      await api(`/contestants/${contestantId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: values.name,
          gender_category: values.gender_category,
          photo_url,
          age: values.age === '' ? null : Number(values.age),
          country: values.country.trim() || null,
          hobbies: values.hobbies.trim() || null,
          fav_things: values.fav_things.trim() || null,
          relationship_status: values.relationship_status.trim() || null,
          socials_visible: values.socials_visible,
          open_to_opportunities: values.open_to_opportunities,
          socials,
        }),
      })
      toast.success('Profile updated')
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save changes')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update how you appear in this contest.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !profile ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  <AvatarImage
                    src={preview ?? profile.photo_url ?? undefined}
                    alt="Photo preview"
                  />
                  <AvatarFallback>📷</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <FormLabel>Photo</FormLabel>
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
                      <Input className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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
                        <TabsList className="w-full h-11 p-1 rounded-xl">
                          <TabsTrigger value="F" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
                            Ladies
                          </TabsTrigger>
                          <TabsTrigger value="M" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
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
                        <Input inputMode="numeric" className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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
                        <Input className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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
                      <Input className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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
                      <Input className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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
                      <Input className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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
                        <Input placeholder="@you" className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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
                        <Input placeholder="@you" className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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
                        <Input placeholder="@you" className="h-11 text-base sm:text-sm rounded-xl" {...field} />
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

              <FormField
                control={form.control}
                name="open_to_opportunities"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <div>
                      <FormLabel className="flex items-center gap-1.5 font-bold text-foreground">
                        <Sparkles className="size-4 text-amber-500" /> Partner Opportunities Opt-in
                      </FormLabel>
                      <FormDescription className="text-xs text-muted-foreground max-w-sm mt-0.5">
                        Allow modeling schools, fashion shows, or stylists to be introduced to me if they're interested. WhoIsHot will contact you first before sharing anything.
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

              <DialogFooter className="pt-2">
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="w-full sm:w-auto h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl"
                >
                  {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>

          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- My contests tab ------------------------------------------------------

function MyContestantCard({ entry }: { entry: MyContestantEntry }) {
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const color = bracketColor(entry.gender_category)
  const isRemoved = entry.status !== 'active'

  const removeMutation = useMutation({
    mutationFn: () =>
      api(`/contestants/${entry.contestant_id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(`Removed from ${entry.contest_title}`)
      queryClient.invalidateQueries({ queryKey: ['my-contestants'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not remove profile'),
  })

  const rankedCriteria = Object.keys(entry.criterion_averages)

  return (
    <Card className="rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
      <CardContent className="space-y-4 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-14 border-2 shrink-0" style={{ borderColor: color }}>
              {entry.photo_url && <AvatarImage src={entry.photo_url} alt={entry.name} />}
              <AvatarFallback style={{ backgroundColor: color, color: 'white' }} className="font-bold">
                {initials(entry.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <Link
                to={`/contest/${entry.contest_join_code}`}
                className="font-bold text-base sm:text-lg hover:underline text-foreground"
              >
                {entry.contest_title}
              </Link>
              <p className="text-xs font-mono text-muted-foreground">
                Code: {entry.contest_join_code}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {statusBadge(entry.status)}
                {entry.open_to_opportunities && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500 bg-amber-500/10 gap-1 font-medium">
                    <Sparkles className="size-3 shrink-0" /> Opportunities Opted In
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 justify-between sm:justify-end">
            <div className="flex items-center gap-1.5">
              <Trophy
                className={`size-4 ${entry.contest_status === 'ended' ? 'text-amber-500' : 'text-muted-foreground'}`}
              />
              {entry.rank != null ? (
                <span className="text-xs sm:text-sm font-semibold">
                  {entry.contest_status === 'ended' ? 'Final rank' : 'Rank'} #{entry.rank}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Unranked</span>
              )}
            </div>
            {entry.avg_score != null && (
              <Badge className="bg-amber-500 text-white hover:bg-amber-500 font-bold text-xs">
                {entry.avg_score.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>

        {rankedCriteria.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-2 border-t text-xs">
            {rankedCriteria.map((criterion) => (
              <div key={criterion} className="space-y-1 bg-muted/30 p-2 rounded-xl border border-border/40">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="capitalize text-muted-foreground font-medium">
                    {criterion}
                  </span>
                  <span className="font-bold">
                    {entry.criterion_averages[criterion].toFixed(1)}
                  </span>
                </div>
                <Progress
                  value={entry.criterion_averages[criterion] * 10}
                  className="h-1.5 [&>div]:bg-amber-500"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-muted-foreground pt-1">
            No ratings yet — {entry.vote_count}/3 voters so far.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={isRemoved}
            className="h-11 min-h-[44px] px-4 font-semibold text-xs sm:text-sm rounded-xl gap-1.5"
          >
            <Pencil className="size-4" /> Edit profile
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={isRemoved}
                className="h-11 min-h-[44px] px-4 font-semibold text-xs sm:text-sm rounded-xl"
              >
                Remove me from this contest
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-3xl p-6 sm:p-8">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-xl font-bold">
                  Leave {entry.contest_title}?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs sm:text-sm">
                  Your profile will be hidden instantly. This can't be undone
                  from here.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4 gap-2">
                <AlertDialogCancel className="h-11 min-h-[44px] rounded-xl font-medium">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="h-11 min-h-[44px] rounded-xl font-semibold bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => removeMutation.mutate()}
                >
                  Remove me
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>

      <EditProfileDialog
        contestantId={entry.contestant_id}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() =>
          queryClient.invalidateQueries({ queryKey: ['my-contestants'] })
        }
      />
    </Card>
  )
}

function MyContestsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-contestants'],
    queryFn: () => api<MyContestantEntry[]>('/users/me/contestants'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-48 w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="rounded-3xl border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            You haven't joined any contests yet.
          </p>
          <Button asChild className="h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl">
            <Link to="/">Find a contest</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {data.map((entry) => (
        <MyContestantCard key={entry.contestant_id} entry={entry} />
      ))}
    </div>
  )
}

// --- Notices tab ---------------------------------------------------------

const respondSchema = z.object({
  response: z.string().min(1, 'Please write a response').max(2000),
})
type RespondValues = z.infer<typeof respondSchema>

function NoticeCard({ notice }: { notice: MyInfoRequestItem }) {
  const queryClient = useQueryClient()
  const left = daysLeft(notice.deadline_at)

  const form = useForm<RespondValues>({
    resolver: zodResolver(respondSchema),
    defaultValues: { response: notice.user_response ?? '' },
  })

  const respond = useMutation({
    mutationFn: (values: RespondValues) =>
      api(`/users/me/info-requests/${notice.id}/respond`, {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast.success('Response sent')
      queryClient.invalidateQueries({ queryKey: ['my-info-requests'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not send response'),
  })

  return (
    <Card className="rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
      <CardHeader className="p-6 sm:p-8 pb-3 sm:pb-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg font-bold">
            {notice.contest_title} — {notice.contestant_name}
          </CardTitle>
          {notice.status === 'pending' && (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs font-bold">
              {left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : 'Due today'}
            </Badge>
          )}
          {notice.status === 'responded' && (
            <Badge className="bg-primary/20 text-primary text-xs font-semibold">Responded</Badge>
          )}
          {notice.status === 'expired' && (
            <Badge className="bg-destructive text-white text-xs font-semibold">Expired</Badge>
          )}
        </div>
        <CardDescription className="text-xs sm:text-sm">An admin asked:</CardDescription>
      </CardHeader>
      <CardContent className="p-6 sm:p-8 pt-0 space-y-3">
        <p className="rounded-2xl border bg-muted/40 p-4 text-xs sm:text-sm leading-relaxed">
          {notice.message}
        </p>

        {notice.status === 'expired' && (
          <p className="text-xs text-muted-foreground">
            The deadline passed before you responded, so your profile in
            this contest was automatically hidden pending review. Contact
            the contest admin if you'd still like to respond.
          </p>
        )}

        {notice.status === 'responded' ? (
          <div className="space-y-1 pt-1">
            <p className="text-xs font-semibold text-muted-foreground">
              Your response
            </p>
            <p className="rounded-2xl border p-4 text-xs sm:text-sm bg-background">
              {notice.user_response}
            </p>
          </div>
        ) : notice.status === 'pending' ? (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => respond.mutate(v))}
              className="space-y-3 pt-1"
            >
              <FormField
                control={form.control}
                name="response"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Write your response…"
                        rows={4}
                        {...field}
                        className="text-base sm:text-sm rounded-xl p-3"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={respond.isPending} className="h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl">
                {respond.isPending ? 'Sending…' : 'Send response'}
              </Button>
            </form>
          </Form>
        ) : null}
      </CardContent>
    </Card>
  )
}

function PartnerIntroductionCard({ intro }: { intro: PartnerIntroductionItem }) {
  const queryClient = useQueryClient()
  const left = daysLeft(intro.deadline_at)

  const respondMutation = useMutation({
    mutationFn: (action: 'accept' | 'decline') =>
      api(`/users/me/introductions/${intro.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_, action) => {
      toast.success(action === 'accept' ? 'Introduction accepted!' : 'Introduction declined')
      queryClient.invalidateQueries({ queryKey: ['my-introductions'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not submit response'),
  })

  return (
    <Card className="rounded-3xl border-amber-500/40 bg-amber-500/5 overflow-hidden shadow-lg">
      <CardHeader className="p-6 sm:p-8 pb-3 sm:pb-3 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500 shrink-0" />
            <CardTitle className="text-base sm:text-lg font-bold">
              Opportunity Proposal — {intro.company_name}
            </CardTitle>
          </div>
          {intro.status === 'pending_consent' && (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs font-bold">
              {left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : 'Due today'}
            </Badge>
          )}
          {intro.status === 'accepted' && (
            <Badge className="bg-emerald-500 text-white text-xs font-semibold">Accepted</Badge>
          )}
          {intro.status === 'declined' && (
            <Badge variant="outline" className="border-destructive text-destructive text-xs font-semibold">Declined</Badge>
          )}
          {intro.status === 'expired' && (
            <Badge variant="secondary" className="text-xs">Expired</Badge>
          )}
        </div>
        <CardDescription className="text-xs sm:text-sm">
          Contest entry: <strong>{intro.contestant_name}</strong> ({intro.contest_title})
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 sm:p-8 pt-0 space-y-3">
        {intro.inquiry_interested_in && (
          <p className="text-xs font-semibold text-primary">
            Targeting: {intro.inquiry_interested_in}
          </p>
        )}
        <div className="rounded-2xl border bg-card p-4 text-xs sm:text-sm space-y-1">
          <p className="font-semibold text-xs text-foreground">Message from partner:</p>
          <p className="text-muted-foreground text-xs leading-relaxed">{intro.inquiry_message}</p>
        </div>

        {intro.admin_note && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs space-y-1">
            <p className="font-semibold text-amber-600 dark:text-amber-400">WhoIsHot Admin Note:</p>
            <p className="text-foreground">{intro.admin_note}</p>
          </div>
        )}

        {intro.contact_info_shared && (
          <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-500 bg-emerald-500/10 gap-1 py-1 px-2.5">
            <CheckCircle2 className="size-3.5" /> Contact Info Marked as Shared by Admin
          </Badge>
        )}

        {intro.status === 'pending_consent' && (
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1 h-11 min-h-[44px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 rounded-xl text-xs sm:text-sm"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate('accept')}
            >
              <Check className="size-4" /> Accept Introduction
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-11 min-h-[44px] font-medium border-destructive/50 text-destructive hover:bg-destructive/10 rounded-xl text-xs sm:text-sm"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate('decline')}
            >
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


function NoticesTab() {
  const { data: infoRequests, isLoading: loadingRequests } = useQuery({
    queryKey: ['my-info-requests'],
    queryFn: () => api<MyInfoRequestItem[]>('/users/me/info-requests'),
  })

  const { data: partnerIntros, isLoading: loadingIntros } = useQuery({
    queryKey: ['my-introductions'],
    queryFn: () => api<PartnerIntroductionItem[]>('/users/me/introductions'),
  })

  if (loadingRequests || loadingIntros) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  const hasRequests = infoRequests && infoRequests.length > 0
  const hasIntros = partnerIntros && partnerIntros.length > 0

  if (!hasRequests && !hasIntros) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-10 text-center text-muted-foreground">
          No notices or opportunity proposals — you're all caught up.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {hasIntros && partnerIntros.map((intro) => (
        <PartnerIntroductionCard key={intro.id} intro={intro} />
      ))}
      {hasRequests && infoRequests.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} />
      ))}
    </div>
  )
}

// --- Page -------------------------------------------------------------

export default function Me() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState('account')

  const { data: notices } = useQuery({
    queryKey: ['my-info-requests'],
    queryFn: () => api<MyInfoRequestItem[]>('/users/me/info-requests'),
    enabled: !!user,
  })

  const { data: intros } = useQuery({
    queryKey: ['my-introductions'],
    queryFn: () => api<PartnerIntroductionItem[]>('/users/me/introductions'),
    enabled: !!user,
  })

  const pendingNotices = notices?.filter((n) => n.status === 'pending') ?? []
  const pendingIntros = intros?.filter((i) => i.status === 'pending_consent') ?? []
  const totalPending = pendingNotices.length + pendingIntros.length

  const soonest = pendingNotices.reduce<MyInfoRequestItem | null>(
    (min, n) => (!min || daysLeft(n.deadline_at) < daysLeft(min.deadline_at) ? n : min),
    null,
  )

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <Skeleton className="mb-6 h-9 w-40" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </main>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <h1 className="mb-6 text-2xl sm:text-3xl font-bold tracking-tight">My account</h1>

      {(soonest || pendingIntros.length > 0) && (
        <Alert className="mb-6 border-amber-500/50 rounded-2xl bg-amber-500/10">
          <Bell className="text-amber-500 size-5" />
          <AlertTitle className="font-bold text-sm sm:text-base">Action required on your account</AlertTitle>
          <AlertDescription className="text-xs sm:text-sm">
            {pendingIntros.length > 0
              ? `You have ${pendingIntros.length} pending partner opportunity proposal${pendingIntros.length > 1 ? 's' : ''}.`
              : soonest
              ? `${daysLeft(soonest.deadline_at)} days left to respond to admin notice.`
              : 'You have pending notices.'}
          </AlertDescription>
          <AlertAction>
            <Button size="sm" onClick={() => setTab('notices')} className="h-9 px-3 rounded-xl text-xs font-semibold">
              View
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 w-full h-11 p-1 rounded-xl">
          <TabsTrigger value="account" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
            Account
          </TabsTrigger>
          <TabsTrigger value="contests" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
            My contests
          </TabsTrigger>
          <TabsTrigger value="notices" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
            Notices
            {totalPending > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 justify-center bg-amber-500 px-1 text-white hover:bg-amber-500 text-[10px] font-bold">
                {totalPending}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
        <TabsContent value="contests">
          <MyContestsTab />
        </TabsContent>
        <TabsContent value="notices">
          <NoticesTab />
        </TabsContent>
      </Tabs>
    </main>
  )
}


