import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Star, Users, UserCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { bracketColor } from '@/lib/brackets'
import type { AdminContestantDetail } from './types'

const CRITERIA = [
  'looks', 'style', 'kindness', 'intelligence', 'humor',
  'confidence', 'creativity', 'friendliness', 'talent', 'vibe',
]

function statusColor(s: string) {
  if (s === 'active') return 'bg-emerald-500'
  if (s === 'reported') return 'bg-amber-500'
  if (s === 'removed') return 'bg-red-600'
  return 'bg-slate-400'
}

function ScoreCell({ score }: { score: number | undefined }) {
  if (score === undefined) return <span className="text-muted-foreground/40">—</span>
  const hue = Math.round((score / 10) * 120)
  return (
    <span
      className="inline-flex h-6 w-8 items-center justify-center rounded font-semibold text-xs tabular-nums text-white"
      style={{ backgroundColor: `hsl(${hue} 70% 42%)` }}
    >
      {score}
    </span>
  )
}

export default function ContestantVoters() {
  const { contestantId } = useParams<{ contestantId: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'contestants', contestantId, 'voters'],
    queryFn: () =>
      api<AdminContestantDetail>(`/admin/contestants/${contestantId}/voters`),
    enabled: !!contestantId,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-10 text-center text-muted-foreground">
          Could not load voter data.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to={`/admin/contests/${data.contest_id}`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to {data.contest_title}
        </Link>
      </Button>

      <h1 className="text-2xl font-bold">Voter Breakdown</h1>

      {/* Contestant summary card */}
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {data.photo_url ? (
              <img
                src={data.photo_url}
                alt={data.name}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-bold text-muted-foreground">
                {data.name[0]}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{data.name}</h2>
                <Badge
                  style={{ backgroundColor: bracketColor(data.gender_category), color: 'white' }}
                >
                  {data.gender_category}
                </Badge>
                <Badge className={`${statusColor(data.status)} text-white capitalize`}>
                  {data.status}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground font-mono">
                {data.contest_title} · {data.contest_join_code}
              </p>
              {data.user_id && (
                <Link
                  to={`/admin/users/${data.user_id}`}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <UserCircle className="h-3 w-3" />
                  View user profile
                </Link>
              )}
            </div>

            {/* Score summary */}
            <div className="hidden sm:flex gap-6 text-center">
              <div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Voters
                </div>
                <div className="text-2xl font-bold">{data.vote_count}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Star className="h-3.5 w-3.5" /> Avg
                </div>
                <div className="text-2xl font-bold">
                  {data.avg_score !== null ? data.avg_score.toFixed(2) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Per-criterion averages */}
          {Object.keys(data.criterion_averages).length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CRITERIA.filter((c) => data.criterion_averages[c] !== undefined).map((criterion) => {
                const avg = data.criterion_averages[criterion]
                const hue = Math.round((avg / 10) * 120)
                return (
                  <div
                    key={criterion}
                    className="flex flex-col items-center rounded-xl border bg-muted/50 p-3 text-center"
                  >
                    <span className="text-xs text-muted-foreground capitalize">{criterion}</span>
                    <span
                      className="mt-1 text-lg font-bold"
                      style={{ color: `hsl(${hue} 65% 42%)` }}
                    >
                      {avg.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voter table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">
            Voters ({data.voters.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Colour-coded scores: red = 1, yellow = 5, green = 10. Voters are
            sorted by the average score they gave this contestant.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {data.voters.length === 0 ? (
            <p className="px-6 py-8 text-center text-muted-foreground">
              No votes have been cast for this contestant yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Voter</TableHead>
                  {CRITERIA.map((c) => (
                    <TableHead key={c} className="text-center capitalize min-w-[64px]">
                      {c}
                    </TableHead>
                  ))}
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Star className="h-3.5 w-3.5" />
                      Avg
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.voters.map((voter) => (
                  <TableRow key={voter.voter_id}>
                    <TableCell className="sticky left-0 bg-background">
                      <Link
                        to={`/admin/users/${voter.voter_id}`}
                        className="text-primary hover:underline font-medium text-sm"
                      >
                        {voter.voter_display_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {voter.voter_email}
                      </div>
                    </TableCell>
                    {CRITERIA.map((c) => (
                      <TableCell key={c} className="text-center">
                        <ScoreCell score={voter.scores[c]} />
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-semibold tabular-nums">
                      {voter.avg !== null ? voter.avg.toFixed(2) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
