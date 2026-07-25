import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import type { AdminDomainRequestItem, DomainKind, EmailDomainItem } from './types'

function kindBadgeClass(kind: DomainKind): string {
  return kind === 'allow'
    ? 'bg-primary/20 text-primary'
    : 'bg-destructive text-white'
}

function AddDomainDialog() {
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [kind, setKind] = useState<DomainKind>('allow')
  const [note, setNote] = useState('')
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: () =>
      api('/admin/email-domains', {
        method: 'POST',
        body: JSON.stringify({ domain: domain.trim(), kind, note: note.trim() || null }),
      }),
    onSuccess: () => {
      toast.success('Domain rule added')
      setOpen(false)
      setDomain('')
      setNote('')
      setKind('allow')
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-domains'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not add domain rule'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 min-h-[44px] px-4 rounded-xl font-semibold text-sm">Add domain rule</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add domain rule</DialogTitle>
          <DialogDescription>
            Allow entries let a domain (and its subdomains) register even if
            it fails the automatic checks. Deny entries always block a
            domain, even if it would otherwise pass.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain-input">Domain</Label>
            <Input
              id="domain-input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="student.example.edu"
              className="h-11 text-base sm:text-sm rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-kind">Rule</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as DomainKind)}>
              <SelectTrigger id="domain-kind" className="h-11 text-base sm:text-sm rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-note">Note (optional)</Label>
            <Input
              id="domain-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this rule exists"
              className="h-11 text-base sm:text-sm rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!domain.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="w-full sm:w-auto h-11 min-h-[44px] px-6 text-sm font-semibold rounded-xl"
          >
            {create.isPending ? 'Adding…' : 'Add rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  )
}

function DomainRulesTable() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'email-domains'],
    queryFn: () => api<EmailDomainItem[]>('/admin/email-domains'),
  })

  const remove = useMutation({
    mutationFn: (id: number) =>
      api(`/admin/email-domains/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Domain rule removed')
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-domains'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not remove rule'),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-10 text-center text-muted-foreground">
          No domain rules yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Desktop Table View */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Domain</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Added by</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">{entry.domain}</TableCell>
              <TableCell>
                <Badge className={kindBadgeClass(entry.kind)}>{entry.kind}</Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">
                {entry.note ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {entry.added_by_email ?? '—'}
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove domain rule"
                  onClick={() => remove.mutate(entry.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Mobile Stacked Card View */}
      <div className="space-y-3 md:hidden">
        {data.map((entry) => (
          <Card key={entry.id} className="rounded-2xl border-border/70 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-foreground">{entry.domain}</span>
              <Badge className={kindBadgeClass(entry.kind)}>{entry.kind}</Badge>
            </div>
            {entry.note && (
              <p className="text-xs text-muted-foreground">{entry.note}</p>
            )}
            <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
              <span className="text-muted-foreground text-[10px]">Added by {entry.added_by_email ?? 'System'}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-3 text-destructive border-destructive/40 hover:bg-destructive/10 font-semibold rounded-xl text-xs"
                onClick={() => remove.mutate(entry.id)}
              >
                <Trash2 className="size-3.5 mr-1" /> Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

function DomainRequestsQueue() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain-requests'],
    queryFn: () =>
      api<AdminDomainRequestItem[]>('/admin/domain-requests?status=open'),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'domain-requests'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'email-domains'] })
  }

  const approve = useMutation({
    mutationFn: (id: number) =>
      api(`/admin/domain-requests/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Domain approved and allow-listed')
      invalidate()
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not approve request'),
  })

  const reject = useMutation({
    mutationFn: (id: number) =>
      api(`/admin/domain-requests/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Request rejected')
      invalidate()
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not reject request'),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No pending domain requests.
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Desktop Table View */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Domain</TableHead>
            <TableHead>Submitted by</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((req) => (
            <TableRow key={req.id}>
              <TableCell className="font-medium">{req.requested_domain}</TableCell>
              <TableCell className="text-muted-foreground">
                {req.reporter_email ?? 'Unknown'}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Approve request"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate(req.id)}
                  >
                    <Check className="size-4 text-primary" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Reject request"
                    disabled={reject.isPending}
                    onClick={() => reject.mutate(req.id)}
                  >
                    <X className="size-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Mobile Stacked Card View */}
      <div className="space-y-3 md:hidden">
        {data.map((req) => (
          <Card key={req.id} className="rounded-2xl border-border/70 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-foreground">{req.requested_domain}</p>
              <p className="text-xs text-muted-foreground">Submitted by {req.reporter_email ?? 'Unknown'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-10 px-3 bg-emerald-600 text-white font-semibold rounded-xl"
                disabled={approve.isPending}
                onClick={() => approve.mutate(req.id)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-10 px-3 font-semibold rounded-xl"
                disabled={reject.isPending}
                onClick={() => reject.mutate(req.id)}
              >
                Reject
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}


export default function EmailDomains() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email domains</h1>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Pending requests</h2>
        <DomainRequestsQueue />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Domain rules</h2>
          <AddDomainDialog />
        </div>
        <DomainRulesTable />
      </section>
    </div>
  )
}
