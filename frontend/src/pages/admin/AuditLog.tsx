import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import type { AdminAuditLogItem, Page } from './types'

const PER_PAGE = 20

// Mirrors the exact action strings written by backend/app/routers/admin.py.
const ACTIONS = [
  'report.dismiss',
  'report.hide_contestant',
  'report.delete_photo',
  'report.remove_contestant',
  'report.ban_user',
  'user.ban',
  'user.unban',
  'contest.deactivate',
]

export default function AuditLog() {
  const [action, setAction] = useState<string>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit-log', action, page],
    queryFn: () =>
      api<Page<AdminAuditLogItem>>(
        `/admin/audit-log?page=${page}&per_page=${PER_PAGE}` +
          (action !== 'all' ? `&action=${encodeURIComponent(action)}` : ''),
      ),
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Audit Log</h1>
      <Select
        value={action}
        onValueChange={(v) => {
          setAction(v)
          setPage(1)
        }}
      >
        <SelectTrigger className="mb-4 w-56">
          <SelectValue placeholder="Filter by action" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All actions</SelectItem>
          {ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
            Could not load the audit log.
          </CardContent>
        </Card>
      )}

      {data && data.items.length === 0 && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            No audit entries{action !== 'all' ? ` for "${action}"` : ''} yet.
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          {/* Desktop Table View */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{row.admin_email}</TableCell>
                  <TableCell className="font-mono text-xs">{row.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.target_type} #{row.target_id}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                    {row.detail ? JSON.stringify(row.detail) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Mobile Stacked Card View */}
          <div className="space-y-3 md:hidden">
            {data.items.map((row) => (
              <Card key={row.id} className="rounded-2xl border-border/70 p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] border-primary/40 text-primary bg-primary/10">
                    {row.action}
                  </Badge>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Admin: <strong className="text-foreground">{row.admin_email}</strong></span>
                  <span>Target: {row.target_type} #{row.target_id}</span>
                </div>
                {row.detail && (
                  <p className="rounded-xl border bg-muted/40 p-2 text-[11px] font-mono text-muted-foreground break-all">
                    {JSON.stringify(row.detail)}
                  </p>
                )}
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
                className="h-10 min-h-[40px] px-4 font-medium rounded-xl"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-10 min-h-[40px] px-4 font-medium rounded-xl"
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
