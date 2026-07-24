import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Star, Users, ChevronRight } from 'lucide-react'
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
import type { AdminContestantDetail, AdminContestItem } from './types'

function statusColor(s: string) {
  if (s === 'active') return 'bg-emerald-500'
  if (s === 'reported') return 'bg-amber-500'
  if (s === 'removed') return 'bg-red-600'
  return 'bg-slate-400'
}

export default function ContestDetail() {
  const { contestId } = useParams<{ contestId: string }>()

  const contestsQuery = useQuery({
    queryKey: ['admin', 'contests'],
    queryFn: () => api<AdminContestItem[]>('/admin/contests'),
  })

  const contestantsQuery = useQuery({
    queryKey: ['admin', 'contests', contestId, 'contestants'],
    queryFn: () =>
      api<AdminContestantDetail[]>(`/admin/contests/${contestId}/contestants`),
    enabled: !!contestId,
  })

  const contest = contestsQuery.data?.find((c) => String(c.id) === contestId)

  const isLoading = contestsQuery.isLoading || contestantsQuery.isLoading
  const isError = contestsQuery.isError || contestantsQuery.isError

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-10 text-center text-muted-foreground">
          Could not load contest details.
        </CardContent>
      </Card>
    )
  }

  const contestants = contestantsQuery.data ?? []

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/admin/contests">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Contests
        </Link>
      </Button>

      <h1 className="text-2xl font-bold">
        {contest?.title ?? `Contest #${contestId}`}
      </h1>

      {/* Contest meta card */}
      {contest && (
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Join code</dt>
                <dd className="font-mono font-medium">{contest.join_code}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge
                    className={
                      contest.is_active
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-500 text-white'
                    }
                  >
                    {contest.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Contestants</dt>
                <dd className="font-medium">{contest.contestant_count}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total ratings</dt>
                <dd className="font-medium">{contest.rating_count}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Contestants table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">
            All contestants ({contestants.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Includes reported and removed profiles. Click "Voters" to see who
            rated each contestant and their individual scores.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {contestants.length === 0 ? (
            <p className="px-6 py-8 text-center text-muted-foreground">
              No contestants have joined this contest yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contestant</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> Voters
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5" /> Avg score
                    </span>
                  </TableHead>
                  <TableHead>Top criteria</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contestants.map((c) => {
                  const topCriteria = Object.entries(c.criterion_averages)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)

                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {c.photo_url ? (
                            <img
                              src={c.photo_url}
                              alt={c.name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                              {c.name[0]}
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{c.name}</div>
                            {c.user_id && (
                              <Link
                                to={`/admin/users/${c.user_id}`}
                                className="text-xs text-primary hover:underline"
                              >
                                User #{c.user_id}
                              </Link>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          style={{
                            backgroundColor: bracketColor(c.gender_category),
                            color: 'white',
                          }}
                        >
                          {c.gender_category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${statusColor(c.status)} text-white capitalize`}
                        >
                          {c.status}
                        </Badge>
                        {c.is_demo && (
                          <Badge variant="outline" className="ml-1">
                            Demo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{c.vote_count}</TableCell>
                      <TableCell>
                        {c.avg_score !== null ? (
                          <span className="font-semibold tabular-nums">
                            {c.avg_score.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {topCriteria.map(([criterion, avg]) => (
                            <span
                              key={criterion}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                            >
                              <span className="capitalize">{criterion}</span>
                              <span className="font-semibold text-primary">
                                {avg.toFixed(1)}
                              </span>
                            </span>
                          ))}
                          {topCriteria.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/admin/contestants/${c.id}/voters`}>
                            Voters
                            <ChevronRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
