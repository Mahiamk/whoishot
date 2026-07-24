import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ShieldCheck,
  User as UserIcon,
  Trophy,
  Star,
  Users,
} from 'lucide-react'
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
import type { AdminUserDetail } from './types'

function statusColor(s: string) {
  if (s === 'active') return 'bg-emerald-500'
  if (s === 'reported') return 'bg-amber-500'
  if (s === 'removed') return 'bg-red-600'
  return 'bg-slate-400'
}

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: () => api<AdminUserDetail>(`/admin/users/${userId}`),
    enabled: !!userId,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-10 text-center text-muted-foreground">
          Could not load user details.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/admin/users">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Users
        </Link>
      </Button>

      <h1 className="text-2xl font-bold">User Detail</h1>

      {/* Profile card */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserIcon className="h-5 w-5 text-muted-foreground" />
            {data.display_name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{data.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Gender</dt>
              <dd>
                <Badge
                  style={{ backgroundColor: bracketColor(data.gender), color: 'white' }}
                >
                  {data.gender === 'F' ? 'Female' : 'Male'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd>
                {data.role === 'admin' ? (
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> Admin
                  </Badge>
                ) : (
                  <Badge variant="secondary">User</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {data.is_banned ? (
                  <Badge className="bg-destructive text-white">Banned</Badge>
                ) : (
                  <Badge variant="secondary">Active</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verified</dt>
              <dd>
                {data.is_verified ? (
                  <Badge className="bg-emerald-500 text-white">Yes</Badge>
                ) : (
                  <Badge variant="outline">No</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Legacy email</dt>
              <dd>{data.legacy_email ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{new Date(data.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Contestant entries */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-muted-foreground" />
            Contest entries ({data.contestant_entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.contestant_entries.length === 0 ? (
            <p className="px-6 py-8 text-center text-muted-foreground">
              This user has not joined any contests.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contest</TableHead>
                  <TableHead>Name in contest</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Voters
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5" />
                      Avg score
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.contestant_entries.map((entry) => (
                  <TableRow key={entry.contestant_id}>
                    <TableCell>
                      <div className="font-medium">{entry.contest_title}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {entry.contest_join_code}
                      </div>
                    </TableCell>
                    <TableCell>{entry.name}</TableCell>
                    <TableCell>
                      <Badge
                        style={{
                          backgroundColor: bracketColor(entry.gender_category),
                          color: 'white',
                        }}
                      >
                        {entry.gender_category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColor(entry.status)} text-white capitalize`}>
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{entry.vote_count}</TableCell>
                    <TableCell>
                      {entry.avg_score !== null ? (
                        <span className="font-semibold tabular-nums">
                          {entry.avg_score.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/admin/contestants/${entry.contestant_id}/voters`}>
                          Voters
                        </Link>
                      </Button>
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
