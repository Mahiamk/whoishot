import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Copy, EyeOff, Pause, Settings, Sparkles, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Countdown } from '@/components/Countdown'
import { ShowcaseCard, type ShowcaseEntryData } from '@/components/ShowcaseCard'
import { ManageContestModal } from '@/components/ManageContestModal'
import { useAuth } from '@/context/AuthContext'
import { api, ApiError, mediaUrl, rememberContest } from '@/lib/api'
import { FEMALE, GENERAL, MALE } from '@/lib/brackets'

interface ShowcaseDetail {
  join_code: string
  title: string
  description: string | null
  contestant_count: number
  female_count: number
  male_count: number
  allowed_email_domain: string | null
  ends_at: string
  status: 'active' | 'ended'
  is_paused?: boolean
  is_deleted?: boolean
  is_hidden?: boolean
  F: ShowcaseEntryData[]
  M: ShowcaseEntryData[]
}

interface ContestDetail {
  id: number
  join_code: string
  title: string
  description: string | null
  creator_id: number
  is_active: boolean
  is_paused: boolean
  is_hidden: boolean
  is_deleted: boolean
  deleted_at: string | null
  ends_at: string
  status: 'active' | 'ended'
  allowed_email_domain: string | null
  requires_password: boolean
  contestant_count: number
  female_count: number
  male_count: number
  rating_count: number
  entry_fee_cents: number
  currency: string
  prize_pool_cents: number
}

interface ContestantCard {
  id: number
  user_id: number
  name: string
  gender_category: 'F' | 'M'
  photo_url: string | null
  age: number | null
  country: string | null
  avg_score: number | null
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function ContestantGrid({
  contestants,
  joinCode,
}: {
  contestants: ContestantCard[]
  joinCode: string
}) {
  if (contestants.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No contestants in this bracket yet.
          </p>
          <Button asChild className="h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl">
            <Link to={`/join/${joinCode}`}>Be the first to join</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {contestants.map((c) => (
        <Link key={c.id} to={`/c/${c.id}`} className="group">
          <Card className="gap-0 overflow-hidden rounded-2xl p-0 transition-colors group-hover:border-primary">
            <div className="aspect-4/5 w-full overflow-hidden bg-muted">
              {c.photo_url ? (
                <img
                  src={mediaUrl(c.photo_url)}
                  alt={c.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white"
                  style={{
                    backgroundColor: c.gender_category === 'F' ? FEMALE : MALE,
                  }}
                >
                  {initials(c.name)}
                </div>
              )}
            </div>
            <CardContent className="flex items-center justify-between gap-2 bg-muted px-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground text-sm">{c.name}</p>
                {(c.age != null || c.country) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.age, c.country].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {c.avg_score != null ? c.avg_score.toFixed(2) : '—'}
              </Badge>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}

function PreviewGrid({
  entries,
  timing,
}: {
  entries: ShowcaseEntryData[]
  timing: { endsAt: string; status: 'active' | 'ended' }
}) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No contestants in this bracket yet.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map((entry, i) => (
        <ShowcaseCard key={entry.name ?? `real-${i}`} entry={entry} timing={timing} />
      ))}
    </div>
  )
}


export default function Contest() {
  const { joinCode } = useParams()
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()
  const [manageOpen, setManageOpen] = useState(false)

  useEffect(() => {
    if (joinCode) rememberContest(joinCode)
  }, [joinCode])

  const { data: contest, error, isLoading } = useQuery({
    queryKey: ['contest', joinCode],
    queryFn: () => api<ContestDetail>(`/contests/${joinCode}`),
    enabled: !!joinCode && !!user,
    retry: false,
  })

  const { data: contestants } = useQuery({
    queryKey: ['contestants', joinCode],
    queryFn: () => api<ContestantCard[]>(`/contests/${joinCode}/contestants`),
    enabled: !!joinCode && !!user,
    retry: false,
  })

  // Anonymous visitors get a blurred preview built from the public showcase
  // (real names/scores are already public per SPEC; photos and full names
  // are visually obscured here to nudge sign-up without exposing them).
  const {
    data: showcase,
    error: showcaseError,
    isLoading: showcaseLoading,
  } = useQuery({
    queryKey: ['showcase', joinCode],
    queryFn: () => api<ShowcaseDetail>(`/contests/${joinCode}/showcase`),
    enabled: !!joinCode && !loading && !user,
    retry: false,
  })

  const isContestant =
    !!user && !!contestants?.some((c) => c.user_id === user.id)

  const isCreator =
    !!user && !!contest && (contest.creator_id === user.id || user.role === 'admin')

  async function copyJoinCode() {
    if (!contest) return
    await navigator.clipboard.writeText(contest.join_code)
    toast.success('Join code copied to clipboard')
  }

  if (!loading && !user) {
    if (showcaseLoading) {
      return (
        <main className="mx-auto max-w-4xl px-4 py-12">
          <Skeleton className="mb-6 h-9 w-64" />
          <Skeleton className="mb-8 h-28 w-full rounded-2xl" />
          <Skeleton className="mb-4 h-10 w-full" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-4/5 w-full rounded-2xl" />
            ))}
          </div>
        </main>
      )
    }

    if (showcaseError instanceof ApiError && showcaseError.status === 404) {
      return (
        <main className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-sm rounded-2xl text-center">
            <CardHeader>
              <CardTitle>Contest not found</CardTitle>
              <CardDescription>
                No contest with code {joinCode}. Double-check and try again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Back to landing</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      )
    }

    if (showcaseError || !showcase) {
      return (
        <main className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-sm rounded-2xl text-center">
            <CardHeader>
              <CardTitle>Members only</CardTitle>
              <CardDescription>
                This contest's roster is private. Sign in if you're a member.
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

    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{showcase.title}</h1>
            {showcase.description && (
              <p className="mt-1 text-muted-foreground">{showcase.description}</p>
            )}
          </div>
          <Countdown endsAt={showcase.ends_at} status={showcase.status} />
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Badge variant="secondary">
            {showcase.contestant_count} contestants
          </Badge>
          <Badge style={{ backgroundColor: FEMALE, color: 'white' }}>
            {showcase.female_count} ladies
          </Badge>
          <Badge style={{ backgroundColor: MALE, color: 'white' }}>
            {showcase.male_count} gents
          </Badge>
          {showcase.allowed_email_domain && (
            <Badge variant="outline">
              @{showcase.allowed_email_domain} only
            </Badge>
          )}
        </div>

        <Card
          className="mb-8 rounded-2xl border-0 text-white"
          style={{
            background: `linear-gradient(135deg, var(--primary), ${FEMALE})`,
          }}
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="flex items-center gap-3">
              <Sparkles className="size-8" />
              <div>
                <p className="text-lg font-semibold">Who's leading?</p>
                <p className="text-sm opacity-90">
                  Sign in to see every contestant, vote, and join yourself.
                </p>
              </div>
            </div>
            <Button asChild variant="secondary">
              <Link to="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="ALL">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="ALL" className="flex-1">
              <span
                className="mr-2 inline-block size-2 rounded-full"
                style={{ backgroundColor: GENERAL }}
              />
              General
            </TabsTrigger>
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
          <TabsContent value="ALL">
            <PreviewGrid
              entries={[...showcase.F, ...showcase.M].sort(
                (a, b) => (b.score ?? -1) - (a.score ?? -1),
              )}
              timing={{ endsAt: showcase.ends_at, status: showcase.status }}
            />
          </TabsContent>
          <TabsContent value="F">
            <PreviewGrid
              entries={showcase.F}
              timing={{ endsAt: showcase.ends_at, status: showcase.status }}
            />
          </TabsContent>
          <TabsContent value="M">
            <PreviewGrid
              entries={showcase.M}
              timing={{ endsAt: showcase.ends_at, status: showcase.status }}
            />
          </TabsContent>
        </Tabs>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Sign in to see the full roster, ratings, and leaderboard.
        </p>
      </main>
    )
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-2xl text-center">
          <CardHeader>
            <CardTitle>Contest not found</CardTitle>
            <CardDescription>
              No contest with code {joinCode}. Double-check and try again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Back to landing</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (isLoading || loading || !contest) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="mb-6 flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="mb-8 h-28 w-full rounded-2xl" />
        <Skeleton className="mb-4 h-10 w-full" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="aspect-4/5 w-full rounded-2xl" />
          ))}
        </div>
      </main>
    )
  }

  const ladies = contestants?.filter((c) => c.gender_category === 'F') ?? []
  const gents = contestants?.filter((c) => c.gender_category === 'M') ?? []
  const general =
    contestants
      ?.slice()
      .sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1)) ?? []

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{contest.title}</h1>
          {contest.description && (
            <p className="mt-1 text-sm text-muted-foreground">{contest.description}</p>
          )}
        </div>
        <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 border-t sm:border-t-0 pt-3 sm:pt-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1.5 font-mono text-xs sm:text-sm">
              {contest.join_code}
            </Badge>
            <Button
              variant="outline"
              size="icon"
              onClick={copyJoinCode}
              aria-label="Copy join code"
              className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl"
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <Countdown endsAt={contest.ends_at} status={contest.status} className="text-xs sm:text-sm font-semibold" />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-xs py-1 px-2.5">{contest.contestant_count} contestants</Badge>
        <Badge style={{ backgroundColor: FEMALE, color: 'white' }} className="text-xs py-1 px-2.5">
          {contest.female_count} ladies
        </Badge>
        <Badge style={{ backgroundColor: MALE, color: 'white' }} className="text-xs py-1 px-2.5">
          {contest.male_count} gents
        </Badge>
        <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs py-1 px-2.5">
          {contest.rating_count} ratings
        </Badge>
        {contest.is_hidden && isCreator && (
          <Badge variant="secondary" className="gap-1 text-xs py-1 px-2.5 text-muted-foreground">
            <EyeOff className="size-3" /> Hidden from Explore
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isCreator && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManageOpen(true)}
              className="h-10 min-h-[44px] px-3.5 font-semibold text-xs sm:text-sm rounded-xl gap-1.5 border-primary/40 hover:bg-primary/5"
            >
              <Settings className="size-4 text-primary" /> Manage Contest
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="h-10 min-h-[44px] px-3.5 font-semibold text-xs sm:text-sm rounded-xl">
            <Link to={`/contest/${joinCode}/board`}>
              <Trophy className="size-4 text-amber-500" /> Leaderboard
            </Link>
          </Button>
        </div>
      </div>

      {contest.is_deleted && (
        <Card className="mb-6 rounded-2xl border-destructive/40 bg-destructive/10 p-4 text-destructive">
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-6 shrink-0" />
            <div>
              <h4 className="font-bold text-sm sm:text-base">Contest Deleted (Archived)</h4>
              <p className="text-xs text-muted-foreground">
                This contest was deleted by the organizer. Voting and new registrations are closed. All participant scores and rank placements are permanently preserved in Contest History.
              </p>
            </div>
          </div>
        </Card>
      )}

      {contest.is_paused && !contest.is_deleted && (
        <Card className="mb-6 rounded-2xl border-amber-500/40 bg-amber-500/10 p-4 text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-3">
            <Pause className="size-6 shrink-0" />
            <div>
              <h4 className="font-bold text-sm sm:text-base">Contest Paused</h4>
              <p className="text-xs text-muted-foreground">
                This contest is currently paused by the organizer. Ratings and registrations are temporarily frozen until resumed.
              </p>
            </div>
          </div>
        </Card>
      )}


      {contest.entry_fee_cents > 0 && (
        <Card className="mb-6 rounded-2xl border bg-gradient-to-br from-amber-500/10 via-background to-muted">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 font-bold">
                  🏆
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Contest Prize Pool</h3>
                  <p className="text-xs text-muted-foreground">
                    Entry Fee: RM {(contest.entry_fee_cents / 100).toFixed(2)} · Min 5 paid entrants required
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl sm:text-2xl font-extrabold text-amber-500">
                  RM {(contest.prize_pool_cents / 100).toFixed(2)}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Total Pool Collected</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-2 border-t text-xs">
              <div className="rounded-lg bg-background/80 p-2 text-center border">
                <span className="text-muted-foreground block text-[10px]">1st Place (35%)</span>
                <span className="font-bold text-amber-500">
                  RM {((contest.prize_pool_cents * 0.35) / 100).toFixed(2)}
                </span>
              </div>
              <div className="rounded-lg bg-background/80 p-2 text-center border">
                <span className="text-muted-foreground block text-[10px]">2nd Place (25%)</span>
                <span className="font-bold">
                  RM {((contest.prize_pool_cents * 0.25) / 100).toFixed(2)}
                </span>
              </div>
              <div className="rounded-lg bg-background/80 p-2 text-center border">
                <span className="text-muted-foreground block text-[10px]">3rd Place (20%)</span>
                <span className="font-bold">
                  RM {((contest.prize_pool_cents * 0.20) / 100).toFixed(2)}
                </span>
              </div>
              <div className="rounded-lg bg-background/80 p-2 text-center border">
                <span className="text-muted-foreground block text-[10px]">Platform (20%)</span>
                <span className="font-semibold text-muted-foreground">
                  RM {((contest.prize_pool_cents * 0.20) / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {contest.status === 'ended' ? (
        <Card className="mb-8 rounded-2xl border-dashed">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="flex items-center gap-3">
              <Trophy className="size-8 text-amber-500 shrink-0" />
              <div>
                <p className="text-base sm:text-lg font-semibold">Contest ended</p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Voting has closed. Check the final results on the leaderboard.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl">
              <Link to={`/contest/${contest.join_code}/board`}>
                <Trophy className="size-4 text-amber-500" /> Final results
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        !isContestant && (
        <Card
          className="mb-8 rounded-2xl border-0 text-white"
          style={{
            background: `linear-gradient(135deg, var(--primary), ${FEMALE})`,
          }}
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="flex items-center gap-3">
              <Sparkles className="size-8 shrink-0" />
              <div>
                <p className="text-base sm:text-lg font-semibold">Think you've got it?</p>
                <p className="text-xs sm:text-sm opacity-90">
                  Join as a contestant — only your name and bracket are required.
                </p>
              </div>
            </div>
            <Button asChild variant="secondary" className="h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl">
              <Link to={`/join/${contest.join_code}`}>Join as contestant</Link>
            </Button>
          </CardContent>
        </Card>
        )
      )}

      <Tabs defaultValue="ALL">
        <TabsList className="mb-4 w-full h-11 p-1 rounded-xl">
          <TabsTrigger value="ALL" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
            <span
              className="mr-1.5 inline-block size-2 rounded-full"
              style={{ backgroundColor: GENERAL }}
            />
            General ({general.length})
          </TabsTrigger>
          <TabsTrigger value="F" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
            <span
              className="mr-1.5 inline-block size-2 rounded-full"
              style={{ backgroundColor: FEMALE }}
            />
            Ladies ({ladies.length})
          </TabsTrigger>
          <TabsTrigger value="M" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium">
            <span
              className="mr-1.5 inline-block size-2 rounded-full"
              style={{ backgroundColor: MALE }}
            />
            Gents ({gents.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ALL">
          <ContestantGrid contestants={general} joinCode={contest.join_code} />
        </TabsContent>
        <TabsContent value="F">
          <ContestantGrid contestants={ladies} joinCode={contest.join_code} />
        </TabsContent>
        <TabsContent value="M">
          <ContestantGrid contestants={gents} joinCode={contest.join_code} />
        </TabsContent>
      </Tabs>

      {isCreator && (
        <ManageContestModal
          contest={contest}
          open={manageOpen}
          onOpenChange={setManageOpen}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['contest', joinCode] })
            queryClient.invalidateQueries({ queryKey: ['contestants', joinCode] })
          }}
        />
      )}
    </main>
  )
}

