import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Crown } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Confetti } from '@/components/Confetti'
import { useAuth } from '@/context/AuthContext'
import { api, rememberContest } from '@/lib/api'
import { FEMALE, GENERAL, MALE } from '@/lib/brackets'
import { CRITERIA } from '@/lib/criteria'

interface PodiumEntry {
  contestant_id: number
  name: string
  photo_url: string | null
  rank: number
  avg_score: number
  criterion_averages: Record<string, number>
}

interface OtherEntry {
  contestant_id: number
  name: string
  photo_url: string | null
}

type Bracket = 'F' | 'M' | 'ALL'

interface Leaderboard {
  join_code: string
  gender: 'F' | 'M' | null
  criterion: string
  ends_at: string
  status: 'active' | 'ended'
  podium: PodiumEntry[]
  others: OtherEntry[]
  me: {
    contestant_id: number
    rank: number | null
    avg_score: number | null
    vote_count: number
  } | null
}

function seenFinalResults(key: string): boolean {
  return sessionStorage.getItem(`whoishot:final-seen:${key}`) === '1'
}

function markFinalResultsSeen(key: string): void {
  sessionStorage.setItem(`whoishot:final-seen:${key}`, '1')
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const PODIUM_AVATAR = ['size-28', 'size-20', 'size-16'] // rank 1, 2, 3

function PodiumSpot({
  entry,
  color,
  isMe,
}: {
  entry: PodiumEntry
  color: string
  isMe: boolean
}) {
  return (
    <Link
      to={`/c/${entry.contestant_id}`}
      className="flex flex-col items-center gap-2"
    >
      {entry.rank === 1 && <Crown className="size-6 text-amber-500" />}
      <Avatar
        className={`${PODIUM_AVATAR[entry.rank - 1]} border-4 ${
          isMe ? 'ring-4 ring-primary ring-offset-2 ring-offset-background' : ''
        }`}
        style={{ borderColor: color }}
      >
        {entry.photo_url && <AvatarImage src={entry.photo_url} alt={entry.name} />}
        <AvatarFallback style={{ backgroundColor: color, color: 'white' }}>
          {initials(entry.name)}
        </AvatarFallback>
      </Avatar>
      <Badge
        className="size-6 justify-center rounded-full px-0 text-xs font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {entry.rank}
      </Badge>
      <span className="max-w-28 truncate text-sm font-medium">
        {entry.name}
        {isMe && <span className="text-primary"> (you)</span>}
      </span>
      <Badge className="bg-amber-500 text-white hover:bg-amber-500">
        {entry.avg_score.toFixed(2)}
      </Badge>
    </Link>
  )
}

export default function Board() {
  const { joinCode } = useParams()
  const { user, loading } = useAuth()
  const [gender, setGender] = useState<Bracket>('ALL')
  const [criterion, setCriterion] = useState('overall')

  useEffect(() => {
    if (joinCode) rememberContest(joinCode)
  }, [joinCode])

  const { data: board, isLoading } = useQuery({
    queryKey: ['board', joinCode, gender, criterion],
    queryFn: () =>
      api<Leaderboard>(
        `/contests/${joinCode}/leaderboard?criterion=${criterion}` +
          (gender === 'ALL' ? '' : `&gender=${gender}`),
      ),
    enabled: !!joinCode && !!user,
    retry: false,
    // Ratings update after every vote — keep an open leaderboard live.
    // Once the contest has ended the board is frozen, so stop polling.
    refetchInterval: (query) =>
      query.state.data?.status === 'ended' ? false : 30_000,
  })

  const [showConfetti, setShowConfetti] = useState(false)
  useEffect(() => {
    if (!board || !joinCode) return
    if (board.status !== 'ended' || board.podium.length === 0) return
    const key = `${joinCode}:${gender}`
    if (seenFinalResults(key)) return
    markFinalResultsSeen(key)
    setShowConfetti(true)
  }, [board, joinCode, gender])

  if (!loading && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-2xl text-center">
          <CardHeader>
            <CardTitle>Members only</CardTitle>
            <CardDescription>Sign in to see the leaderboard.</CardDescription>
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

  const color = gender === 'F' ? FEMALE : gender === 'M' ? MALE : GENERAL
  const me = board?.me ?? null
  // Podium display order: #2 left, #1 center, #3 right
  const podiumOrder =
    board?.podium
      .slice()
      .sort((a, b) => [1, 0, 2][a.rank - 1] - [1, 0, 2][b.rank - 1]) ?? []

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {showConfetti && <Confetti />}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">
          {board?.status === 'ended' ? 'Final results 🏆' : 'Leaderboard'}
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link to={`/contest/${joinCode}`}>Back to contest</Link>
        </Button>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Tabs
          value={gender}
          onValueChange={(v) => setGender(v as Bracket)}
          className="flex-1"
        >
          <TabsList className="w-full">
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
        </Tabs>
        <Select value={criterion} onValueChange={setCriterion}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Criterion" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="overall">Overall</SelectItem>
            {CRITERIA.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !board ? (
        <>
          <div className="mb-10 flex items-end justify-center gap-4 sm:gap-8">
            {['size-20', 'size-28', 'size-16'].map((size, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className={`${size} rounded-full`} />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </>
      ) : (
        <>
          {board.podium.length === 0 ? (
            <Card className="mb-6 rounded-2xl border-dashed">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <p className="text-muted-foreground">
                  No one has enough votes yet — contestants need at least 3
                  voters to be ranked.
                </p>
                <Button asChild>
                  <Link to={`/contest/${joinCode}`}>
                    Browse contestants and rate them
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="mb-10 flex items-end justify-center gap-4 sm:gap-8">
              {podiumOrder.map((entry) => (
                <PodiumSpot
                  key={entry.contestant_id}
                  entry={entry}
                  color={color}
                  isMe={me?.contestant_id === entry.contestant_id}
                />
              ))}
            </div>
          )}

          {me && me.rank != null && me.rank > 3 && (
            <Card className="mb-6 rounded-2xl border-primary">
              <CardContent className="flex items-center justify-between py-4">
                <span className="font-medium">
                  Your rank: #{me.rank}{' '}
                  <span className="text-sm text-muted-foreground">
                    (only you can see this)
                  </span>
                </span>
                <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                  {me.avg_score?.toFixed(2)}
                </Badge>
              </CardContent>
            </Card>
          )}
          {me && me.rank == null && (
            <Card className="mb-6 rounded-2xl border-dashed">
              <CardContent className="py-4 text-sm text-muted-foreground">
                You're not ranked yet — {me.vote_count}/3 voters so far.
              </CardContent>
            </Card>
          )}

          {board.others.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Also competing</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.others.map((o) => {
                  const isMe = me?.contestant_id === o.contestant_id
                  return (
                    <TableRow
                      key={o.contestant_id}
                      className={isMe ? 'bg-primary/10' : undefined}
                    >
                      <TableCell>
                        <Link
                          to={`/c/${o.contestant_id}`}
                          className="flex items-center gap-3"
                        >
                          <Avatar className="size-9">
                            {o.photo_url && (
                              <AvatarImage src={o.photo_url} alt={o.name} />
                            )}
                            <AvatarFallback
                              style={{ backgroundColor: color, color: 'white' }}
                            >
                              {initials(o.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {o.name}
                            {isMe && <span className="text-primary"> (you)</span>}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        {isMe && me?.rank != null && (
                          <Badge variant="outline" className="border-primary">
                            #{me.rank}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </main>
  )
}
