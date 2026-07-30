import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, Flag, Lock, X } from 'lucide-react'
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
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { bracketColor } from '@/lib/brackets'
import type { ContestCriterion } from '@/lib/criteria'

interface Profile {
  id: number
  user_id: number
  contest_id: number
  name: string
  gender_category: 'F' | 'M'
  photo_url: string | null
  age: number | null
  country: string | null
  hobbies: string | null
  fav_things: string | null
  relationship_status: string | null
  socials_visible: boolean
  status: string
  socials: { id: number; platform: string; handle: string }[]
  socials_locked: boolean
  social_link_count: number
  criterion_averages: Record<string, number>
  vote_count: number
  avg_score: number | null
  my_ratings: Record<string, number>
  contest_status: 'active' | 'ended'
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function defaultScores(myRatings: Record<string, number>, criteriaList: ContestCriterion[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const c of criteriaList) {
    const k = c.key || c.label
    result[k] = myRatings[k] ?? 5
  }
  return result
}


function ReportDialog({ contestantId }: { contestantId: number }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!reason.trim()) {
      toast.error('Please describe the problem')
      return
    }
    setSubmitting(true)
    try {
      await api(`/contestants/${contestantId}/reports`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      toast.success('Report submitted — thank you')
      setOpen(false)
      setReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Flag /> Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this profile</DialogTitle>
          <DialogDescription>
            Tell us what's wrong. Profiles with several open reports are
            hidden automatically pending review.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Impersonation, inappropriate photo, harassment…"
          rows={4}
        />
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SubscribeDialog({ socialLinkCount }: { socialLinkCount: number }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Lock className="size-3.5" />
        Subscribe to see {socialLinkCount} social link{socialLinkCount !== 1 ? 's' : ''} — RM9/mo
      </Button>

      <CheckoutDialog
        open={open}
        onOpenChange={setOpen}
        type="subscription"
        entryFeeCents={900}
      />
    </>
  )
}


export default function ContestantProfile() {
  const { contestantId } = useParams()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [scores, setScores] = useState<Record<string, number> | null>(null)
  const [baseline, setBaseline] = useState<Record<string, number> | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)

  const queryKey = ['profile', contestantId]
  const { data: profile, isLoading } = useQuery({
    queryKey,
    queryFn: () => api<Profile>(`/contestants/${contestantId}`),
    enabled: !!contestantId && !!user,
    retry: false,
  })

  const { data: contestData } = useQuery({
    queryKey: ['contest', profile?.contest_id],
    queryFn: () => api<any>(`/contests/${profile?.contest_id}`),
    enabled: !!profile?.contest_id,
  })

  const criteriaList: ContestCriterion[] = contestData?.criteria?.length
    ? contestData.criteria
    : Object.keys(profile?.criterion_averages || {}).map((k) => ({ key: k, label: k }))

  // Reset slider state when switching contestants so values never carry
  // over from a previously viewed profile.
  useEffect(() => {
    setScores(null)
    setBaseline(null)
  }, [contestantId])

  useEffect(() => {
    if (profile && criteriaList.length > 0 && scores === null) {
      const initial = defaultScores(profile.my_ratings, criteriaList)
      setScores(initial)
      setBaseline(initial)
    }
  }, [profile, criteriaList, scores])

  const isDirty =
    scores != null &&
    baseline != null &&
    criteriaList.some((c) => scores[c.key || c.label] !== baseline[c.key || c.label])


  function closeRatingPanel() {
    if (isDirty) {
      setDiscardOpen(true)
      return
    }
    navigate(-1)
  }

  function discardAndClose() {
    if (baseline) setScores(baseline)
    setDiscardOpen(false)
    navigate(-1)
  }

  const rateMutation = useMutation({
    mutationFn: (payload: Record<string, number>) =>
      api<Record<string, number>>(`/contestants/${contestantId}/ratings`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Profile>(queryKey)
      if (previous) {
        queryClient.setQueryData<Profile>(queryKey, {
          ...previous,
          my_ratings: payload,
        })
      }
      return { previous }
    },
    onError: (err, _payload, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      toast.error(err instanceof Error ? err.message : 'Could not save scores')
    },
    onSuccess: (saved) => {
      toast.success('Scores locked in 🔒')
      setBaseline(saved)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
      // Scores update after every vote, not at the deadline — refresh any
      // cached leaderboard and contestant-grid views right away.
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['contestants'] })
    },
  })

  if (!loading && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-2xl text-center">
          <CardHeader>
            <CardTitle>Members only</CardTitle>
            <CardDescription>Sign in to view profiles.</CardDescription>
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

  if (isLoading || loading || !profile || scores === null) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Skeleton className="size-28 rounded-full" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-32 rounded-full" />
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-5 w-20 rounded-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="space-y-5 py-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    )
  }

  const color = bracketColor(profile.gender_category)
  const isOwnProfile = user?.id === profile.user_id
  const hasRated = Object.keys(profile.my_ratings).length > 0

  const bioBadges: string[] = [
    ...(profile.country ? [profile.country] : []),
    ...(profile.relationship_status ? [profile.relationship_status] : []),
    ...(profile.hobbies?.split(',').map((h) => h.trim()) ?? []),
    ...(profile.fav_things?.split(',').map((f) => f.trim()) ?? []),
  ].filter(Boolean)

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <Card className="relative rounded-2xl">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close profile"
          className="absolute top-3 right-3 h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl"
          onClick={() => navigate(-1)}
        >
          <X />
        </Button>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <Avatar className="size-28 border-4" style={{ borderColor: color }}>
            {profile.photo_url && (
              <AvatarImage src={profile.photo_url} alt={profile.name} />
            )}
            <AvatarFallback
              className="text-2xl"
              style={{ backgroundColor: color, color: 'white' }}
            >
              {initials(profile.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">
              {profile.name}
              {profile.age != null && (
                <span className="font-normal text-muted-foreground">
                  , {profile.age}
                </span>
              )}
            </h1>
            <div className="mt-1 flex items-center justify-center gap-2">
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                {profile.avg_score != null
                  ? `${profile.avg_score.toFixed(2)} avg`
                  : 'Score reveals at 3 voters'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {profile.avg_score != null
                  ? `${profile.vote_count} voter${profile.vote_count === 1 ? '' : 's'}`
                  : `${profile.vote_count}/3 voters so far`}
              </span>
            </div>
          </div>

          {bioBadges.length > 0 && (
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {bioBadges.map((b) => (
                <Badge key={b} variant="secondary">
                  {b}
                </Badge>
              ))}
            </div>
          )}

          {/* Socials — gated behind subscription */}
          {profile.socials.length > 0 && !profile.socials_locked && (
            <div className="flex flex-wrap justify-center gap-2">
              {profile.socials.map((s) => (
                <Badge key={s.id} variant="outline" className="gap-1">
                  <AtSign className="size-3" />
                  {s.platform}: @{s.handle.replace(/^@/, '')}
                </Badge>
              ))}
            </div>
          )}

          {/* Locked state — subscriber prompt */}
          {profile.socials_locked && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-wrap justify-center gap-2">
                {Array.from({ length: profile.social_link_count }).map((_, i) => (
                  <Badge key={i} variant="outline" className="gap-1 opacity-50 select-none blur-[2px]">
                    <AtSign className="size-3" />
                    ••••••
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {profile.social_link_count} social link{profile.social_link_count !== 1 ? 's' : ''} — subscribe to view
              </p>
              <SubscribeDialog socialLinkCount={profile.social_link_count} />
            </div>
          )}

          <ReportDialog contestantId={profile.id} />
        </CardContent>
      </Card>

      {!isOwnProfile && profile.contest_status === 'ended' && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Final scores for {profile.name.split(' ')[0]}</CardTitle>
            <CardDescription>
              This contest has ended — ratings are locked.
              {hasRated ? ' Here are the scores you gave.' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {criteriaList.map((crit) => {
              const criterion = crit.key || crit.label
              const value = scores[criterion] ?? 5
              return (
                <div key={criterion} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize flex items-center gap-1.5">
                      {crit.emoji && <span>{crit.emoji}</span>}
                      <span>{crit.label}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {profile.criterion_averages[criterion] != null && (
                        <span className="text-xs text-muted-foreground">
                          avg {profile.criterion_averages[criterion].toFixed(1)}
                        </span>
                      )}
                      <Badge className="w-9 justify-center bg-amber-500 text-white hover:bg-amber-500">
                        {hasRated ? value : '—'}
                      </Badge>
                    </span>
                  </div>
                  <Progress
                    value={hasRated ? value * 10 : 0}
                    className="h-2 [&>div]:bg-amber-500"
                  />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {!isOwnProfile && profile.contest_status === 'active' && (
        <Card className="rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
          <CardHeader className="p-6 sm:p-8 pb-4 sm:pb-4 space-y-1.5">
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Rate {profile.name.split(' ')[0]}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Slide each criterion from 1 to 10, then lock in your scores.
              You can update them any time.
            </CardDescription>
            <CardAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cancel rating"
                onClick={closeRatingPanel}
                className="h-9 w-9 rounded-xl"
              >
                <X className="size-4" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
              {criteriaList.map((crit) => {
                const criterion = crit.key || crit.label
                const value = scores[criterion] ?? 5
                return (
                  <div key={criterion} className="space-y-2.5 p-3 rounded-2xl bg-muted/30 border border-border/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-semibold capitalize text-foreground flex items-center gap-1.5">
                        {crit.emoji && <span>{crit.emoji}</span>}
                        <span>{crit.label}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {profile.criterion_averages[criterion] != null && (
                          <span className="text-[11px] text-muted-foreground">
                            avg {profile.criterion_averages[criterion].toFixed(1)}
                          </span>
                        )}
                        <Badge className="w-8 h-6 justify-center bg-amber-500 text-white hover:bg-amber-500 font-bold text-xs">
                          {value}
                        </Badge>
                      </span>
                    </div>
                    <div className="py-2 px-1">
                      <Slider
                        min={1}
                        max={10}
                        step={1}
                        value={[value]}
                        onValueChange={([v]) =>
                          setScores((prev) => ({ ...prev!, [criterion]: v }))
                        }
                      />
                    </div>
                  </div>
                )
              })}
              <Button
                className="col-span-1 sm:col-span-2 w-full h-11 min-h-[44px] text-sm font-semibold rounded-xl mt-3"
                onClick={() => rateMutation.mutate(scores)}
                disabled={rateMutation.isPending}
              >
                {rateMutation.isPending
                  ? 'Saving…'
                  : hasRated
                    ? 'Update my scores'
                    : 'Lock in my scores'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You moved some sliders but haven't locked them in. Leaving now
              discards those changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndClose}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
