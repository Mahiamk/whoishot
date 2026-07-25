import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'

const DURATIONS = ['3', '7', '14', '30'] as const

const createContestSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(2000).optional(),
    university_domain: z
      .string()
      .min(3, 'University email domain is required')
      .max(255)
      .refine((v) => v.replace(/^@/, '').includes('.'), {
        message: 'Enter a valid domain, e.g. student.sunway.edu.my',
      }),
    join_password: z
      .string()
      .min(4, 'Password must be at least 4 characters')
      .max(100),
    is_showcase_public: z.boolean(),
    duration: z.enum(['3', '7', '14', '30', 'custom']),
    customDate: z.string(),
    entry_fee: z.coerce.number().min(0, 'Fee cannot be negative').default(0),
    liability_accepted: z.boolean().default(false),
  })
  .refine((v) => v.duration !== 'custom' || v.customDate !== '', {
    message: 'Pick an end date',
    path: ['customDate'],
  })
  .refine((v) => v.entry_fee <= 0 || v.liability_accepted, {
    message: 'You must accept the terms for paid entry contests',
    path: ['liability_accepted'],
  })

type CreateContestValues = z.infer<typeof createContestSchema>

interface ContestResponse {
  join_code: string
}

function computeEndDate(values: Pick<CreateContestValues, 'duration' | 'customDate'>): Date | null {
  if (values.duration === 'custom') {
    if (!values.customDate) return null
    return new Date(`${values.customDate}T23:59:59`)
  }
  const days = Number(values.duration)
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function maxDateISO(): string {
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function CreateContestDialog() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  const form = useForm<any>({
    resolver: zodResolver(createContestSchema),

    defaultValues: {
      title: '',
      description: '',
      university_domain: '',
      join_password: '',
      is_showcase_public: false,
      duration: '14',
      customDate: '',
      entry_fee: 0,
      liability_accepted: false,
    },
  })

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next && user && !form.getValues('university_domain')) {
      form.setValue('university_domain', user.email.split('@')[1] ?? '')
    }
  }

  const duration = form.watch('duration')
  const customDate = form.watch('customDate')
  const entryFee = form.watch('entry_fee') || 0
  const endDate = computeEndDate({ duration, customDate })

  async function onSubmit(values: CreateContestValues) {
    try {
      const contest = await api<ContestResponse>('/contests', {
        method: 'POST',
        body: JSON.stringify({
          title: values.title,
          description: values.description || null,
          allowed_email_domain: values.university_domain,
          join_password: values.join_password,
          is_showcase_public: values.is_showcase_public,
          entry_fee_cents: Math.round(values.entry_fee * 100),
          liability_accepted: values.liability_accepted,
          ...(values.duration === 'custom'
            ? { ends_at: new Date(`${values.customDate}T23:59:59Z`).toISOString() }
            : { duration_days: Number(values.duration) }),
        }),
      })
      setOpen(false)
      toast.success(`Contest created — join code ${contest.join_code}`)
      navigate(`/contest/${contest.join_code}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create contest')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          onClick={(e) => {
            if (!user) {
              e.preventDefault()
              toast.info('Sign in to create a contest')
              navigate('/login')
            }
          }}
        >
          Create contest
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a contest</DialogTitle>
          <DialogDescription>
            You'll get a join code to share with your campus.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Sunway CS Batch '24" className="h-11 text-base sm:text-sm rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="What's this contest about?" className="h-11 text-base sm:text-sm rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="university_domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>University email domain</FormLabel>
                  <FormControl>
                    <Input placeholder="student.sunway.edu.my" className="h-11 text-base sm:text-sm rounded-xl" {...field} />
                  </FormControl>
                  <FormDescription>
                    Only accounts with an email at this domain (or a
                    subdomain) can participate.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="join_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Participation password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Share it with your batch"
                      className="h-11 text-base sm:text-sm rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Contestants must enter this password to join.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={field.value}
                      onValueChange={(v) => v && field.onChange(v)}
                      className="w-full h-11"
                    >
                      {DURATIONS.map((d) => (
                        <ToggleGroupItem key={d} value={d} className="flex-1 h-11 rounded-xl">
                          {d}d
                        </ToggleGroupItem>
                      ))}
                      <ToggleGroupItem value="custom" className="flex-1 h-11 rounded-xl">
                        Custom
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </FormControl>
                  {field.value === 'custom' && (
                    <FormField
                      control={form.control}
                      name="customDate"
                      render={({ field: dateField }) => (
                        <FormControl>
                          <Input
                            type="date"
                            min={todayISO()}
                            max={maxDateISO()}
                            className="mt-2 h-11 text-base sm:text-sm rounded-xl"
                            {...dateField}
                          />
                        </FormControl>
                      )}
                    />
                  )}
                  {endDate && (
                    <FormDescription>
                      Ends{' '}
                      {endDate.toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="entry_fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entry fee (RM)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      placeholder="0 (Free contest)"
                      className="h-11 text-base sm:text-sm rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Set to 0 for free contests. For paid contests, minimum 5 paid entrants are required to trigger prize payouts.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {Number(entryFee) > 0 && (
              <div className="rounded-xl border bg-muted/40 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center font-semibold text-sm">
                  <span>Prize Pool Split Preview</span>
                  <span className="text-primary">Per Entrant (RM {Number(entryFee).toFixed(2)})</span>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                  <div className="bg-background rounded-lg p-2 border">
                    <div className="text-muted-foreground text-[10px]">1st (35%)</div>
                    <div className="font-bold text-amber-500 mt-0.5">RM {(Number(entryFee) * 0.35).toFixed(2)}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 border">
                    <div className="text-muted-foreground text-[10px]">2nd (25%)</div>
                    <div className="font-bold mt-0.5">RM {(Number(entryFee) * 0.25).toFixed(2)}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 border">
                    <div className="text-muted-foreground text-[10px]">3rd (20%)</div>
                    <div className="font-bold mt-0.5">RM {(Number(entryFee) * 0.20).toFixed(2)}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 border">
                    <div className="text-muted-foreground text-[10px]">Platform (20%)</div>
                    <div className="font-bold text-muted-foreground mt-0.5">RM {(Number(entryFee) * 0.20).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}

            {Number(entryFee) > 0 && (
              <FormField
                control={form.control as any}
                name="liability_accepted"
                render={({ field }) => (
                  <FormItem className="flex items-start space-x-2 space-y-0 rounded-lg border p-3 bg-muted/20">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="mt-0.5 h-5 w-5 rounded border-gray-300 accent-primary"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-xs font-normal cursor-pointer">
                        I understand entries are locked after payment and WhoIsHot is not liable for contest outcomes.
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control as any}
              name="is_showcase_public"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Public showcase</FormLabel>
                    <FormDescription>
                      Show the top 4 per bracket on the landing page.
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
              className="w-full h-11 min-h-[44px] rounded-xl font-semibold text-base sm:text-sm"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? 'Creating…' : 'Create contest'}
            </Button>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
