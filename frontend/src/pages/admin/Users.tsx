import { useEffect, useState } from 'react'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import type { AdminUserItem, Page } from './types'

const PER_PAGE = 10

function UserRow({ user }: { user: AdminUserItem }) {
  const queryClient = useQueryClient()

  const toggleBan = useMutation({
    mutationFn: () =>
      api(`/admin/users/${user.id}/${user.is_banned ? 'unban' : 'ban'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success(user.is_banned ? `${user.email} unbanned` : `${user.email} banned`)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not update user'),
  })

  const isAdmin = user.role === 'admin'

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          to={`/admin/users/${user.id}`}
          className="text-primary hover:underline"
        >
          {user.email}
        </Link>
      </TableCell>
      <TableCell>
        <Link
          to={`/admin/users/${user.id}`}
          className="hover:underline"
        >
          {user.display_name}
        </Link>
      </TableCell>
      <TableCell>
        <Badge style={{ backgroundColor: bracketColor(user.gender), color: 'white' }}>
          {user.gender}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(user.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell>
        {user.is_banned ? (
          <Badge className="bg-destructive text-white">Banned</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        )}
        {isAdmin && (
          <Badge variant="outline" className="ml-2">
            Admin
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant={user.is_banned ? 'outline' : 'destructive'}
              disabled={isAdmin}
            >
              {user.is_banned ? 'Unban' : 'Ban'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {user.is_banned ? 'Unban' : 'Ban'} {user.email}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {user.is_banned
                  ? 'They will be able to log in again and their profiles will reappear.'
                  : "They won't be able to log in, all their contestant profiles are hidden, and their past ratings are excluded from averages."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={
                  user.is_banned
                    ? undefined
                    : 'bg-destructive text-white hover:bg-destructive/90'
                }
                onClick={() => toggleBan.mutate()}
              >
                {user.is_banned ? 'Unban' : 'Ban'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}

export default function Users() {
  const queryClient = useQueryClient()
  const [searchInput, setSearchInput] = useState('')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users', search, page],
    queryFn: () =>
      api<Page<AdminUserItem>>(
        `/admin/users?search=${encodeURIComponent(search)}&page=${page}&per_page=${PER_PAGE}`,
      ),
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Users</h1>
      <Input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search by email or name…"
        className="mb-4 max-w-sm h-11 text-base sm:text-sm rounded-xl"
      />


      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            Could not load users.
          </CardContent>
        </Card>
      )}

      {data && data.items.length === 0 && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            No users match "{search}".
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          {/* Desktop Table View */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </TableBody>
          </Table>

          {/* Mobile Stacked Card View */}
          <div className="space-y-3 md:hidden">
            {data.items.map((u) => (
              <Card key={u.id} className="rounded-2xl border-border/70 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/admin/users/${u.id}`} className="font-bold text-sm sm:text-base text-primary hover:underline block">
                      {u.email}
                    </Link>
                    <p className="text-xs text-foreground font-medium">{u.display_name}</p>
                  </div>
                  <Badge style={{ backgroundColor: bracketColor(u.gender), color: 'white' }} className="text-xs font-semibold">
                    {u.gender}
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                  <div className="flex items-center gap-2">
                    {u.is_banned ? (
                      <Badge className="bg-destructive text-white text-[10px]">Banned</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Active</Badge>
                    )}
                    {u.role === 'admin' && (
                      <Badge variant="outline" className="text-[10px]">Admin</Badge>
                    )}
                    <span className="text-muted-foreground text-[11px]">
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={u.is_banned ? 'outline' : 'destructive'}
                    disabled={u.role === 'admin'}
                    className="h-11 min-h-[44px] px-4 font-semibold text-xs rounded-xl"
                    onClick={() => {
                      api(`/admin/users/${u.id}/${u.is_banned ? 'unban' : 'ban'}`, { method: 'POST' })
                        .then(() => {
                          toast.success(u.is_banned ? `${u.email} unbanned` : `${u.email} banned`)
                          queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
                        })
                        .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not update user'))
                    }}
                  >
                    {u.is_banned ? 'Unban' : 'Ban'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Page {data.page} of {totalPages} · {data.total} total
            </span>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-11 min-h-[44px] px-4 font-medium rounded-xl flex-1 sm:flex-none"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-11 min-h-[44px] px-4 font-medium rounded-xl flex-1 sm:flex-none"
              >
                Next
              </Button>
            </div>
          </div>

        </>
      )}

    </div>
  )
}
