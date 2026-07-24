import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import type { AdminContestItem } from './types'

function ContestRow({ contest }: { contest: AdminContestItem }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const queryClient = useQueryClient()

  const deactivate = useMutation({
    mutationFn: () =>
      api(`/admin/contests/${contest.id}/deactivate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(`${contest.join_code} deactivated`)
      queryClient.invalidateQueries({ queryKey: ['admin', 'contests'] })
      setConfirmOpen(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not deactivate contest')
      setConfirmOpen(false)
    },
  })

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        <Link
          to={`/admin/contests/${contest.id}`}
          className="text-primary hover:underline"
        >
          {contest.join_code}
        </Link>
      </TableCell>
      <TableCell className="max-w-48 truncate font-medium">
        <Link
          to={`/admin/contests/${contest.id}`}
          className="hover:underline"
        >
          {contest.title}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        User #{contest.creator_id}
      </TableCell>
      <TableCell>{contest.contestant_count}</TableCell>
      <TableCell>{contest.rating_count}</TableCell>
      <TableCell>
        {contest.open_report_count > 0 ? (
          <Badge className="bg-destructive text-white">
            {contest.open_report_count}
          </Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={contest.is_active}
            disabled={!contest.is_active}
            onCheckedChange={() => setConfirmOpen(true)}
          />
          <span className="text-sm text-muted-foreground">
            {contest.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate {contest.join_code}?</AlertDialogTitle>
              <AlertDialogDescription>
                This contest will stop accepting new contestants and ratings.
                Deactivation cannot be undone from here.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => deactivate.mutate()}
              >
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}

export default function Contests() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'contests'],
    queryFn: () => api<AdminContestItem[]>('/admin/contests'),
  })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Contests</h1>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            Could not load contests.
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            No contests have been created yet.
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Join code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Creator</TableHead>
              <TableHead>Contestants</TableHead>
              <TableHead>Ratings</TableHead>
              <TableHead>Open reports</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <ContestRow key={c.id} contest={c} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
