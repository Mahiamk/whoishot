import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Award,
  Crown,
  Flame,
  LayoutGrid,
  ListTree,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
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
import { Sparkline } from '@/components/Sparkline'
import { useAuth } from '@/context/AuthContext'
import { api, mediaUrl, rememberContest } from '@/lib/api'
import { FEMALE, GENERAL, MALE } from '@/lib/brackets'

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

const PODIUM_CONFIG: Record<
  number,
  {
    avatarSize: string
    color: string
    gradient: string
    badgeText: string
    sparkColor: string
    borderGlow: string
  }
> = {
  1: {
    avatarSize: 'size-20 sm:size-28',
    color: '#f59e0b', // Gold
    gradient: 'from-amber-500/20 via-yellow-500/10 to-transparent',
    badgeText: '1st Place 🏆',
    sparkColor: '#f59e0b',
    borderGlow: 'border-amber-500/50 shadow-amber-500/10 shadow-xl',
  },
  2: {
    avatarSize: 'size-16 sm:size-22',
    color: '#94a3b8', // Silver
    gradient: 'from-slate-400/20 via-slate-500/10 to-transparent',
    badgeText: '2nd Place 🥈',
    sparkColor: '#38bdf8',
    borderGlow: 'border-slate-400/40 shadow-slate-500/10 shadow-lg',
  },
  3: {
    avatarSize: 'size-14 sm:size-20',
    color: '#d97706', // Bronze
    gradient: 'from-orange-600/20 via-amber-700/10 to-transparent',
    badgeText: '3rd Place 🥉',
    sparkColor: '#ec4899',
    borderGlow: 'border-amber-700/40 shadow-orange-600/10 shadow-lg',
  },
}

function getContestantCurve(
  entry: PodiumEntry,
  criteriaList: Array<{ key: string; label: string; emoji?: string }>
): { data: number[]; labels: string[] } {
  const avgs = entry.criterion_averages || {}
  const keys = Object.keys(avgs)
  if (keys.length === 0) {
    const s = entry.avg_score || 5
    return {
      data: [Math.max(0, s - 0.6), Math.max(0, s - 0.2), s],
      labels: ['Base', 'Momentum', 'Overall'],
    }
  }
  const data = keys.map((k) => avgs[k])
  const labels = keys.map((k) => {
    const match = criteriaList.find((c) => c.key === k)
    return match ? `${match.emoji ? match.emoji + ' ' : ''}${match.label}` : k
  })
  return { data, labels }
}

export default function Board() {
  const { joinCode } = useParams()
  const { user, loading } = useAuth()
  const [gender, setGender] = useState<Bracket>('ALL')
  const [criterion, setCriterion] = useState('overall')
  const [viewMode, setViewMode] = useState<'overview' | 'breakdown'>('overview')

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
    refetchInterval: (query) =>
      query.state.data?.status === 'ended' ? false : 30_000,
  })

  const { data: contestData } = useQuery({
    queryKey: ['contest', joinCode],
    queryFn: () => api<any>(`/contests/${joinCode}`),
    enabled: !!joinCode && !!user,
  })

  const criteriaOptions = useMemo(() => contestData?.criteria || [], [contestData])

  const [showConfetti, setShowConfetti] = useState(false)
  useEffect(() => {
    if (!board || !joinCode) return
    if (board.status !== 'ended' || board.podium.length === 0) return
    const key = `${joinCode}:${gender}`
    if (seenFinalResults(key)) return
    markFinalResultsSeen(key)
    setShowConfetti(true)
  }, [board, joinCode, gender])

  // Aggregate stats across podium
  const stats = useMemo(() => {
    if (!board || board.podium.length === 0) return null
    const scores = board.podium.map((p) => p.avg_score)
    const benchmarkAvg = scores.reduce((a, b) => a + b, 0) / scores.length
    const leaderScore = board.podium[0]?.avg_score || 0
    const secondScore = board.podium[1]?.avg_score || 0
    const leadMargin =
      secondScore > 0 ? (((leaderScore - secondScore) / secondScore) * 100).toFixed(1) : '0.0'

    // Find highest individual criterion peak
    let topCriterionName = ''
    let topCriterionScore = 0
    let topCriterionHolder = ''

    board.podium.forEach((p) => {
      Object.entries(p.criterion_averages || {}).forEach(([k, val]) => {
        if (val > topCriterionScore) {
          topCriterionScore = val
          const match = criteriaOptions.find((c: any) => c.key === k)
          topCriterionName = match ? `${match.emoji ? match.emoji + ' ' : ''}${match.label}` : k
          topCriterionHolder = p.name
        }
      })
    })

    return {
      benchmarkAvg,
      leaderScore,
      secondScore,
      leadMargin,
      topCriterionName,
      topCriterionScore,
      topCriterionHolder,
    }
  }, [board, criteriaOptions])

  if (!loading && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm rounded-3xl text-center border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-bold">Members only</CardTitle>
            <CardDescription className="text-sm">Sign in to see the live leaderboard & stats.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full h-11 min-h-[44px] rounded-xl font-semibold bg-gradient-to-r from-violet-600 to-pink-600">
              <Link to="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const color = gender === 'F' ? FEMALE : gender === 'M' ? MALE : GENERAL
  const me = board?.me ?? null

  // Podium order for top cards: #2 on left, #1 in center, #3 on right
  const podiumOrder =
    board?.podium
      .slice()
      .sort((a, b) => [1, 0, 2][a.rank - 1] - [1, 0, 2][b.rank - 1]) ?? []

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      {showConfetti && <Confetti />}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {board?.status === 'ended' ? 'Final Results 🏆' : 'Live Leaderboard'}
            </h1>
            {board?.status === 'active' && (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold px-2 py-0.5 animate-pulse">
                Live
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Real-time ratings, D3 trend sparklines, and criterion performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'overview' ? 'breakdown' : 'overview')}
            className="h-9 px-3 rounded-xl text-xs font-semibold gap-1.5"
          >
            {viewMode === 'overview' ? (
              <>
                <ListTree className="size-3.5" />
                <span>Criteria Breakdown</span>
              </>
            ) : (
              <>
                <LayoutGrid className="size-3.5" />
                <span>Podium View</span>
              </>
            )}
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 px-3 rounded-xl text-xs sm:text-sm font-semibold">
            <Link to={`/contest/${joinCode}`}>Back to contest</Link>
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Criterion Selector */}
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Tabs
          value={gender}
          onValueChange={(v) => setGender(v as Bracket)}
          className="flex-1"
        >
          <TabsList className="w-full h-11 p-1 rounded-xl bg-muted/60 backdrop-blur-sm border border-border/40">
            <TabsTrigger value="ALL" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium rounded-lg">
              <span
                className="mr-1.5 inline-block size-2 rounded-full"
                style={{ backgroundColor: GENERAL }}
              />
              General
            </TabsTrigger>
            <TabsTrigger value="F" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium rounded-lg">
              <span
                className="mr-1.5 inline-block size-2 rounded-full"
                style={{ backgroundColor: FEMALE }}
              />
              Ladies
            </TabsTrigger>
            <TabsTrigger value="M" className="flex-1 h-9 min-h-[36px] text-xs sm:text-sm font-medium rounded-lg">
              <span
                className="mr-1.5 inline-block size-2 rounded-full"
                style={{ backgroundColor: MALE }}
              />
              Gents
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={criterion} onValueChange={setCriterion}>
          <SelectTrigger className="w-full sm:w-48 h-11 text-xs sm:text-sm rounded-xl bg-card border-border/70">
            <SelectValue placeholder="Criterion" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="overall">✨ Overall Score</SelectItem>
            {criteriaOptions.map((c: any) => (
              <SelectItem key={c.key} value={c.key} className="capitalize">
                {c.emoji ? `${c.emoji} ` : ''}{c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Summary Cards (D3 & Leaderboard Metrics) */}
      {stats && board && board.podium.length > 0 && (
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/60 p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold mb-1">
              <Flame className="size-4 text-amber-500" />
              <span>Leader's Margin</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-foreground">
                +{stats.leadMargin}%
              </span>
              <span className="text-[11px] text-muted-foreground">lead over #2</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {board.podium[0]?.name} holds #1 rank
            </p>
          </Card>

          <Card className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/60 p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold mb-1">
              <Zap className="size-4 text-cyan-500" />
              <span>Podium Average</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-foreground">
                {stats.benchmarkAvg.toFixed(2)}
              </span>
              <span className="text-[11px] text-muted-foreground">/ 10 pts</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              Across top {board.podium.length} contenders
            </p>
          </Card>

          <Card className="col-span-2 sm:col-span-1 rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/60 p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold mb-1">
              <Award className="size-4 text-pink-500" />
              <span>Top Criterion Score</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-pink-500">
                {stats.topCriterionScore > 0 ? stats.topCriterionScore.toFixed(1) : '—'}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">{stats.topCriterionName}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              By {stats.topCriterionHolder || 'Contestant'}
            </p>
          </Card>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading || !board ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-3xl" />
            ))}
          </div>
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : board.podium.length === 0 ? (
        /* Empty State */
        <Card className="mb-6 rounded-3xl border-dashed border-2">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="size-6" />
            </div>
            <div>
              <h3 className="font-bold text-base">No contestants ranked yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Contestants require at least 3 ratings to unlock their official leaderboard rank and sparklines.
              </p>
            </div>
            <Button asChild className="h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-pink-600">
              <Link to={`/contest/${joinCode}`}>Rate contestants</Link>
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'overview' ? (
        /* Podium Cards with D3 Sparklines & Percentage Gain */
        <div className="mb-10 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
            {podiumOrder.map((entry) => {
              const cfg = PODIUM_CONFIG[entry.rank] || PODIUM_CONFIG[3]
              const isMe = me?.contestant_id === entry.contestant_id
              const curve = getContestantCurve(entry, criteriaOptions)
              const benchmark = stats?.benchmarkAvg || entry.avg_score
              const incrementPct = benchmark > 0 ? (((entry.avg_score - benchmark) / benchmark) * 100).toFixed(1) : '0.0'
              const isPositive = Number(incrementPct) >= 0

              return (
                <Card
                  key={entry.contestant_id}
                  className={`relative overflow-hidden rounded-3xl border ${cfg.borderGlow} bg-gradient-to-b ${cfg.gradient} transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between`}
                >
                  {/* Top Rank Badge */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {entry.rank === 1 && <Crown className="size-4 text-amber-500 animate-bounce" />}
                    <Badge
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm"
                      style={{ backgroundColor: cfg.color }}
                    >
                      #{entry.rank}
                    </Badge>
                  </div>

                  <CardContent className="p-5 flex flex-col items-center text-center">
                    {/* Avatar */}
                    <Link to={`/c/${entry.contestant_id}`} className="group relative mt-2 mb-3">
                      <Avatar
                        className={`${cfg.avatarSize} border-4 transition-transform group-hover:scale-105 ${
                          isMe ? 'ring-4 ring-primary ring-offset-2 ring-offset-background' : ''
                        }`}
                        style={{ borderColor: cfg.color }}
                      >
                        {entry.photo_url && <AvatarImage src={mediaUrl(entry.photo_url)} alt={entry.name} />}
                        <AvatarFallback
                          style={{ backgroundColor: cfg.color, color: 'white' }}
                          className="font-bold text-base sm:text-xl"
                        >
                          {initials(entry.name)}
                        </AvatarFallback>
                      </Avatar>
                    </Link>

                    {/* Name & Badge */}
                    <Link
                      to={`/c/${entry.contestant_id}`}
                      className="font-bold text-base sm:text-lg hover:underline truncate max-w-full"
                    >
                      {entry.name}
                      {isMe && <span className="text-primary font-bold text-xs ml-1">(you)</span>}
                    </Link>

                    {/* Score and Percentage Increment Badge */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-2xl font-black font-mono tracking-tight text-foreground">
                        {entry.avg_score.toFixed(2)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md gap-0.5 ${
                          isPositive
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isPositive ? (
                          <TrendingUp className="size-3" />
                        ) : (
                          <TrendingDown className="size-3" />
                        )}
                        <span>{isPositive ? `+${incrementPct}%` : `${incrementPct}%`}</span>
                      </Badge>
                    </div>

                    {/* D3 Sparkline Chart */}
                    <div className="mt-4 pt-3 border-t border-border/40 w-full flex flex-col items-center">
                      <div className="flex items-center justify-between w-full text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1 px-1">
                        <span>Criterion Curve</span>
                        <span className="font-mono">{curve.data.length} traits</span>
                      </div>
                      <Sparkline
                        data={curve.data}
                        labels={curve.labels}
                        width={180}
                        height={42}
                        color={cfg.sparkColor}
                        interactive={true}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ) : (
        /* Detailed Criteria Breakdown View */
        <div className="mb-10 space-y-4">
          {board.podium.map((entry) => {
            const cfg = PODIUM_CONFIG[entry.rank] || PODIUM_CONFIG[3]
            const curve = getContestantCurve(entry, criteriaOptions)
            return (
              <Card key={entry.contestant_id} className="rounded-3xl border border-border/70 p-5 shadow-sm bg-card/80">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-12 border-2" style={{ borderColor: cfg.color }}>
                      {entry.photo_url && <AvatarImage src={mediaUrl(entry.photo_url)} alt={entry.name} />}
                      <AvatarFallback style={{ backgroundColor: cfg.color, color: 'white' }} className="font-bold">
                        {initials(entry.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">{entry.name}</span>
                        <Badge className="text-[10px] px-1.5 py-0 text-white font-bold" style={{ backgroundColor: cfg.color }}>
                          #{entry.rank}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Overall Average: <strong className="text-foreground">{entry.avg_score.toFixed(2)}</strong></p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Sparkline
                      data={curve.data}
                      labels={curve.labels}
                      width={140}
                      height={32}
                      color={cfg.sparkColor}
                      interactive={true}
                    />
                  </div>
                </div>

                {/* Criteria Score Mini-Bars */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-4">
                  {Object.entries(entry.criterion_averages || {}).map(([key, val]) => {
                    const match = criteriaOptions.find((c: any) => c.key === key)
                    const label = match ? `${match.emoji ? match.emoji + ' ' : ''}${match.label}` : key
                    const pct = Math.min(100, Math.max(0, (val / 10) * 100))
                    return (
                      <div key={key} className="p-2 rounded-xl bg-muted/40 border border-border/40 text-xs">
                        <div className="flex items-center justify-between font-medium mb-1">
                          <span className="truncate text-muted-foreground">{label}</span>
                          <span className="font-mono font-bold">{val.toFixed(1)}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: cfg.color,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* User's Personal Rank Card */}
      {me && me.rank != null && me.rank > 3 && (
        <Card className="mb-6 rounded-3xl border-primary/50 bg-primary/5 p-4 shadow-sm">
          <CardContent className="flex items-center justify-between p-0">
            <div>
              <span className="font-bold text-sm sm:text-base">
                Your Rank: <span className="text-primary">#{me.rank}</span>
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                (Private to you · Based on {me.vote_count} verified votes)
              </p>
            </div>
            <Badge className="bg-primary text-primary-foreground font-mono font-bold text-sm px-3 py-1">
              {me.avg_score?.toFixed(2)}
            </Badge>
          </CardContent>
        </Card>
      )}

      {me && me.rank == null && (
        <Card className="mb-6 rounded-3xl border-dashed border-2 p-4">
          <CardContent className="p-0 text-xs sm:text-sm text-muted-foreground">
            You're not ranked yet — <strong className="text-foreground">{me.vote_count}/3</strong> votes received so far.
          </CardContent>
        </Card>
      )}

      {/* Others Competing Table */}
      {board && board.others.length > 0 && (
        <Card className="rounded-3xl border border-border/70 overflow-hidden shadow-sm">
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3 border-b border-border/40">
            <CardTitle className="text-base sm:text-lg font-bold">Also Competing ({board.others.length})</CardTitle>
            <CardDescription className="text-xs">
              Contestants striving to unlock podium rankings
            </CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold">Contestant</TableHead>
                <TableHead className="text-right text-xs font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.others.map((o) => {
                const isMe = me?.contestant_id === o.contestant_id
                return (
                  <TableRow
                    key={o.contestant_id}
                    className={`transition-colors ${isMe ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/40'}`}
                  >
                    <TableCell className="py-3">
                      <Link
                        to={`/c/${o.contestant_id}`}
                        className="flex items-center gap-3 group"
                      >
                        <Avatar className="size-9 border border-border/70 group-hover:scale-105 transition-transform">
                          {o.photo_url && <AvatarImage src={mediaUrl(o.photo_url)} alt={o.name} />}
                          <AvatarFallback
                            style={{ backgroundColor: color, color: 'white' }}
                            className="font-semibold text-xs"
                          >
                            {initials(o.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-sm group-hover:text-primary transition-colors">
                          {o.name}
                          {isMe && <span className="text-primary font-bold text-xs ml-1">(you)</span>}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right py-3">
                      {isMe && me?.rank != null ? (
                        <Badge variant="outline" className="border-primary text-primary font-mono text-xs">
                          #{me.rank}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[11px] font-medium text-muted-foreground">
                          In Progress
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  )
}
