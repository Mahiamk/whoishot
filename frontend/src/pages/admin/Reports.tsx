import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, MessageCircleQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type {
  AdminReportItem,
  InfoRequestStatus,
  Page,
  ReportStatus,
  ResolveAction,
} from './types'

const PER_PAGE = 10

const ACTIONS: {
  action: ResolveAction
  label: string
  destructive: boolean
  description: string
}[] = [
  {
    action: 'dismiss',
    label: 'Dismiss',
    destructive: false,
    description: 'Mark this report as resolved with no other changes.',
  },
  {
    action: 'hide_contestant',
    label: 'Hide contestant',
    destructive: false,
    description:
      "Hide this contestant's profile pending review. They can still see it themselves.",
  },
  {
    action: 'delete_photo',
    label: 'Delete photo',
    destructive: false,
    description: "Remove the contestant's photo from storage and clear it from their profile.",
  },
  {
    action: 'remove_contestant',
    label: 'Remove contestant',
    destructive: true,
    description:
      'Soft-delete this contestant profile. This hides them everywhere, same as if they removed themselves.',
  },
  {
    action: 'ban_user',
    label: 'Ban user',
    destructive: true,
    description:
      "Ban this contestant's account. They won't be able to log in, and their profiles are hidden everywhere.",
  },
]

function statusColor(status: string): string {
  if (status === 'removed') return 'bg-muted text-muted-foreground'
  if (status === 'reported') return 'bg-destructive text-white'
  return 'bg-primary/20 text-primary'
}

const INFO_REQUEST_LABELS: Record<InfoRequestStatus, string> = {
  pending: 'Awaiting response',
  responded: 'Responded',
  expired: 'Expired',
  closed: 'Closed',
}

function infoRequestBadgeClass(status: InfoRequestStatus): string {
  if (status === 'responded') return 'bg-primary/20 text-primary'
  if (status === 'expired') return 'bg-destructive text-white'
  if (status === 'pending') return 'bg-amber-500 text-white hover:bg-amber-500'
  return 'bg-muted text-muted-foreground'
}

function defaultDeadline(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function RequestInfoDialog({ report }: { report: AdminReportItem }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [deadline, setDeadline] = useState(defaultDeadline)
  const queryClient = useQueryClient()

  const requestInfo = useMutation({
    mutationFn: () =>
      api(`/admin/reports/${report.id}/request-info`, {
        method: 'POST',
        body: JSON.stringify({
          message: message.trim(),
          deadline_at: `${deadline}T23:59:59Z`,
        }),
      }),
    onSuccess: () => {
      toast.success('Info request sent')
      setOpen(false)
      setMessage('')
      setDeadline(defaultDeadline())
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : 'Could not send info request',
      ),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => e.stopPropagation()}
        >
          <MessageCircleQuestion /> Request info
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request info from the contestant</DialogTitle>
          <DialogDescription>
            They'll get an email with your message and this deadline. Their
            profile hides automatically if they don't respond in time. The
            reporter is never named.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="info-message">Message</Label>
            <Textarea
              id="info-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Can you confirm this photo is really you?"
              rows={4}
              className="text-base sm:text-sm rounded-xl p-3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="info-deadline">Deadline</Label>
            <Input
              id="info-deadline"
              type="date"
              value={deadline}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-11 text-base sm:text-sm rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!message.trim() || requestInfo.isPending}
            onClick={() => requestInfo.mutate()}
            className="w-full sm:w-auto h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl"
          >
            {requestInfo.isPending ? 'Sending…' : 'Send request'}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}

function ReportRow({ report }: { report: AdminReportItem }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const resolve = useMutation({
    mutationFn: (action: ResolveAction) =>
      api(`/admin/reports/${report.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, action) => {
      toast.success(`Report resolved: ${action.replace('_', ' ')}`)
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not resolve report'),
  })

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <TableCell>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </TableCell>
        <TableCell className="font-medium">{report.contestant.name}</TableCell>
        <TableCell className="max-w-xs truncate text-muted-foreground">
          {report.reason}
        </TableCell>
        <TableCell>{report.reporter_email ?? 'Anonymous'}</TableCell>
        <TableCell>
          <Badge className={statusColor(report.contestant.status)}>
            {report.contestant.status}
          </Badge>
        </TableCell>
        <TableCell>
          {report.info_request && (
            <Badge className={infoRequestBadgeClass(report.info_request.status)}>
              {INFO_REQUEST_LABELS[report.info_request.status]}
            </Badge>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} className="p-0">
          <Collapsible open={open}>
            <CollapsibleContent>
              <div className="space-y-4 px-4 py-4">
                <Card className="rounded-2xl">
                  <CardContent className="flex items-center gap-3 py-4">
                    <Avatar className="size-12">
                      {report.contestant.photo_url && (
                        <AvatarImage
                          src={report.contestant.photo_url}
                          alt={report.contestant.name}
                        />
                      )}
                      <AvatarFallback>
                        {report.contestant.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{report.contestant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Contestant #{report.contestant.id} · Contest #
                        {report.contestant.contest_id} · User #
                        {report.contestant.user_id}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <div>
                  <p className="mb-1 text-sm font-medium">Reason</p>
                  <p className="text-sm text-muted-foreground">{report.reason}</p>
                </div>
                {report.info_request && (
                  <div>
                    <p className="mb-1 text-sm font-medium">
                      Info request —{' '}
                      {INFO_REQUEST_LABELS[report.info_request.status]}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      "{report.info_request.message}"
                    </p>
                    {report.info_request.status === 'responded' && (
                      <div className="mt-2 rounded-lg border bg-muted/50 p-3">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Their response
                        </p>
                        <p className="text-sm">{report.info_request.user_response}</p>
                      </div>
                    )}
                    {report.info_request.status === 'expired' && (
                      <p className="mt-1 text-xs text-destructive">
                        No response before the deadline — the profile was
                        auto-hidden.
                      </p>
                    )}
                  </div>
                )}
                {report.status === 'open' && (
                  <div className="flex flex-wrap gap-2">
                    {(!report.info_request ||
                      report.info_request.status !== 'pending') && (
                      <RequestInfoDialog report={report} />
                    )}
                    {ACTIONS.map(({ action, label, destructive, description }) => (
                      <AlertDialog key={action}>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant={destructive ? 'destructive' : 'outline'}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {label}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{label}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {description}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className={
                                destructive
                                  ? 'bg-destructive text-white hover:bg-destructive/90'
                                  : undefined
                              }
                              onClick={() => resolve.mutate(action)}
                            >
                              {label}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </TableCell>
      </TableRow>
    </>
  )
}

export default function Reports() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ReportStatus>('open')
  const [page, setPage] = useState(1)


  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'reports', status, page],
    queryFn: () =>
      api<Page<AdminReportItem>>(
        `/admin/reports?status=${status}&page=${page}&per_page=${PER_PAGE}`,
      ),
  })

  function changeStatus(v: string) {
    setStatus(v as ReportStatus)
    setPage(1)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Reports</h1>
      <Tabs value={status} onValueChange={changeStatus} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>

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
            Could not load reports.
          </CardContent>
        </Card>
      )}

      {data && data.items.length === 0 && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            {status === 'open'
              ? 'No open reports — the queue is clear.'
              : 'No resolved reports yet.'}
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          {/* Desktop Table View */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Contestant</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Reporter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Info request</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((r) => (
                <ReportRow key={r.id} report={r} />
              ))}
            </TableBody>
          </Table>

          {/* Mobile Stacked Card View */}
          <div className="space-y-4 md:hidden">
            {data.items.map((r) => (
              <Card key={r.id} className="rounded-2xl border-border/70 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base">{r.contestant.name}</h3>
                    <p className="text-xs text-muted-foreground">Reporter: {r.reporter_email ?? 'Anonymous'}</p>
                  </div>
                  <Badge className={statusColor(r.contestant.status)}>
                    {r.contestant.status}
                  </Badge>
                </div>
                <div className="rounded-xl border bg-muted/40 p-3 text-xs space-y-1">
                  <p className="font-semibold text-foreground">Reason:</p>
                  <p className="text-muted-foreground">{r.reason}</p>
                </div>
                {r.info_request && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Info Request:</span>
                    <Badge className={infoRequestBadgeClass(r.info_request.status)}>
                      {INFO_REQUEST_LABELS[r.info_request.status]}
                    </Badge>
                  </div>
                )}
                {r.status === 'open' && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    {(!r.info_request || r.info_request.status !== 'pending') && (
                      <RequestInfoDialog report={r} />
                    )}
                    {ACTIONS.map(({ action, label, destructive }) => (
                      <Button
                        key={action}
                        size="sm"
                        variant={destructive ? 'destructive' : 'outline'}
                        className="h-10 min-h-[40px] text-xs font-semibold rounded-xl"
                        onClick={() => {
                          api(`/admin/reports/${r.id}/resolve`, {
                            method: 'POST',
                            body: JSON.stringify({ action }),
                          }).then(() => {
                            toast.success(`Report resolved: ${action.replace('_', ' ')}`)
                            queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
                          }).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed'))
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
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
