import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Crown, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CreateContestDialog } from '@/components/CreateContestDialog'
import { Countdown } from '@/components/Countdown'
import { ShowcaseCard, type ShowcaseEntryData } from '@/components/ShowcaseCard'
import { useAuth } from '@/context/AuthContext'
import { api, lastContest } from '@/lib/api'
import { FEMALE, GENERAL, MALE } from '@/lib/brackets'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

const DEFAULT_SHOWCASE = 'SUNWAY-CS24'

interface Showcase {
  join_code: string
  title: string
  description: string | null
  contestant_count: number
  female_count: number
  male_count: number
  allowed_email_domain: string | null
  ends_at: string
  status: 'active' | 'ended'
  F: ShowcaseEntryData[]
  M: ShowcaseEntryData[]
}

interface PopularContest {
  join_code: string
  title: string
  description: string | null
  contestant_count: number
  female_count: number
  male_count: number
  rating_count: number
  allowed_email_domain: string | null
  ends_at: string
  status: 'active' | 'ended'
}

function PopularContests() {
  const { data } = useQuery({
    queryKey: ['popular-contests'],
    queryFn: () => api<PopularContest[]>('/contests/popular'),
    staleTime: 60_000,
  })

  if (!data || data.length === 0) return null

  return (
    <section className="mt-16">
      <h2 className="mb-1 text-center text-2xl font-semibold">
        Popular contests 🔥
      </h2>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Live right now — jump in with one tap
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.map((c) => (
          <Link key={c.join_code} to={`/contest/${c.join_code}`} className="group">
            <Card className="h-full rounded-2xl transition-colors group-hover:border-primary">
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.title}</p>
                    {c.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <Countdown endsAt={c.ends_at} status={c.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {c.contestant_count} contestants
                  </Badge>
                  <Badge style={{ backgroundColor: FEMALE, color: 'white' }}>
                    {c.female_count} ladies
                  </Badge>
                  <Badge style={{ backgroundColor: MALE, color: 'white' }}>
                    {c.male_count} gents
                  </Badge>
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                    {c.rating_count} ratings
                  </Badge>
                  {c.allowed_email_domain && (
                    <Badge variant="outline">
                      @{c.allowed_email_domain} only
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}

function ContestSearchPreview({ code }: { code: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['showcase', code],
    queryFn: () => api<Showcase>(`/contests/${code}/showcase`),
    retry: false,
    staleTime: 30_000,
  })

  if (isLoading) {
    return <Skeleton className="h-28 w-full max-w-sm rounded-2xl" />
  }

  if (isError || !data) {
    return (
      <Card className="w-full max-w-sm rounded-2xl border-dashed">
        <CardContent className="py-4 text-center text-sm text-muted-foreground">
          No contest found for "{code}" — it may be private or the code is
          mistyped.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm rounded-2xl text-left">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{data.title}</p>
            {data.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {data.description}
              </p>
            )}
          </div>
          <Countdown endsAt={data.ends_at} status={data.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{data.contestant_count} contestants</Badge>
          <Badge style={{ backgroundColor: FEMALE, color: 'white' }}>
            {data.female_count} ladies
          </Badge>
          <Badge style={{ backgroundColor: MALE, color: 'white' }}>
            {data.male_count} gents
          </Badge>
          {data.allowed_email_domain && (
            <Badge variant="outline">@{data.allowed_email_domain} only</Badge>
          )}
        </div>
        <Button asChild size="sm" className="w-full">
          <Link to={`/contest/${data.join_code}`}>
            View contest <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function ShowcaseGrid({
  entries,
  timing,
}: {
  entries: ShowcaseEntryData[]
  timing: { endsAt: string; status: 'active' | 'ended' }
}) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Not enough votes yet.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {entries.map((entry, i) => (
        <ShowcaseCard key={entry.name ?? `real-${i}`} entry={entry} timing={timing} />
      ))}
    </div>
  )
}

export default function Landing() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()

  // Live search preview: once the typed code settles, look it up and show
  // the contest's details + countdown inline before they commit.
  const typedCode = useDebouncedValue(code.trim().toUpperCase(), 500)
  const showSearchPreview = typedCode.length >= 4

  const showcaseCode = lastContest() ?? DEFAULT_SHOWCASE
  const {
    data: showcase,
    isLoading: showcaseLoading,
    isError: showcaseError,
  } = useQuery({
    queryKey: ['showcase', showcaseCode],
    queryFn: () => api<Showcase>(`/contests/${showcaseCode}/showcase`),
    retry: false,
  })

  function onJoinSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed) navigate(`/contest/${trimmed}`)
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <Crown className="size-10 text-primary" />
        <h1 className="text-5xl font-bold tracking-tight">
          who<span className="text-primary">is</span>hot
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Opt-in campus contests. Join with a code, rate on ten criteria,
          climb the board.
        </p>
        <form onSubmit={onJoinSubmit} className="flex w-full max-w-sm gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter join code, e.g. SUNWAY-CS24"
            aria-label="Join code"
          />
          <Button type="submit" size="icon" aria-label="Go to contest">
            <ArrowRight />
          </Button>
        </form>
        {showSearchPreview && <ContestSearchPreview code={typedCode} />}
        <CreateContestDialog />
      </section>

      <PopularContests />

      {showcaseLoading && (
        <section className="mt-16">
          <Skeleton className="mx-auto mb-1 h-8 w-56" />
          <Skeleton className="mx-auto mb-6 h-4 w-44" />
          <Skeleton className="mb-4 h-10 w-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <Skeleton key={row} className="aspect-3/4 w-full rounded-2xl" />
            ))}
          </div>
        </section>
      )}

      {showcaseError && (
        <section className="mt-16">
          <Card className="rounded-2xl border-dashed text-center">
            <CardContent className="flex flex-col items-center gap-4 py-10">
              <p className="text-muted-foreground">
                No public showcase to display yet.
              </p>
              <CreateContestDialog />
            </CardContent>
          </Card>
        </section>
      )}

      {showcase && (
        <section className="mt-16">
          <h2 className="mb-1 text-center text-2xl font-semibold">
            {showcase.title}
          </h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Public showcase — real contestants are blurred until you sign in
          </p>
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
              <ShowcaseGrid
                entries={[...showcase.F, ...showcase.M].sort(
                  (a, b) => (b.score ?? -1) - (a.score ?? -1),
                )}
                timing={{ endsAt: showcase.ends_at, status: showcase.status }}
              />
            </TabsContent>
            <TabsContent value="F">
              <ShowcaseGrid
                entries={showcase.F}
                timing={{ endsAt: showcase.ends_at, status: showcase.status }}
              />
            </TabsContent>
            <TabsContent value="M">
              <ShowcaseGrid
                entries={showcase.M}
                timing={{ endsAt: showcase.ends_at, status: showcase.status }}
              />
            </TabsContent>
          </Tabs>

          <Card className="mt-8 rounded-2xl border-dashed">
            <CardHeader className="items-center text-center">
              <Lock className="mx-auto size-6 text-muted-foreground" />
              <CardTitle className="text-lg">Full leaderboard is members-only</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-6">
              {user ? (
                <Button asChild>
                  <Link to={`/contest/${showcase.join_code}/board`}>
                    Open leaderboard
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/login">Sign in to see every ranking</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  )
}
