import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Clock, DollarSign, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import type { AdminPayoutItem, AdminRefundItem } from './types'

interface PayoutsResponse {
  payouts: AdminPayoutItem[]
  refunds: AdminRefundItem[]
}

function MarkSentDialog({
  payout,
  onClose,
}: {
  payout: AdminPayoutItem | null
  onClose: () => void
}) {
  const [providerRef, setProviderRef] = useState('')
  const queryClient = useQueryClient()

  const markSentMutation = useMutation({
    mutationFn: (id: number) =>
      api(`/admin/payouts/${id}/mark-sent`, {
        method: 'POST',
        body: JSON.stringify({ provider_ref: providerRef.trim() }),
      }),
    onSuccess: () => {
      toast.success('Payout marked as sent')
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] })
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not mark payout as sent')
    },
  })

  if (!payout) return null

  return (
    <Dialog open={!!payout} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Payout as Sent</DialogTitle>
          <DialogDescription>
            Record the transaction reference string from your payment provider (TNG, bank transfer, etc.).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p><span className="font-semibold">Contest:</span> {payout.contest_title}</p>
            <p><span className="font-semibold">Rank:</span> {payout.rank === 'platform' ? 'Platform Fee' : `${payout.rank} Place`}</p>
            <p><span className="font-semibold">Recipient:</span> {payout.contestant_name ?? payout.user_email ?? 'Platform'}</p>
            <p><span className="font-semibold">Amount:</span> RM {(payout.amount_cents / 100).toFixed(2)}</p>
            {payout.payment_handle && (
              <p><span className="font-semibold">Handle:</span> <code className="bg-background px-1.5 py-0.5 rounded">{payout.payment_handle}</code></p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Payment Provider Reference / TxID *</label>
            <Input
              placeholder="e.g. TNG-9823412 or BANK-REF-001"
              value={providerRef}
              onChange={(e) => setProviderRef(e.target.value)}
              className="h-11 text-base sm:text-sm rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-11 min-h-[44px] px-4 rounded-xl font-medium">
            Cancel
          </Button>
          <Button
            disabled={!providerRef.trim() || markSentMutation.isPending}
            onClick={() => markSentMutation.mutate(payout.id)}
            className="h-11 min-h-[44px] px-5 rounded-xl font-semibold"
          >
            {markSentMutation.isPending ? 'Saving…' : 'Mark as Sent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MarkRefundDialog({
  refund,
  onClose,
}: {
  refund: AdminRefundItem | null
  onClose: () => void
}) {
  const [providerRef, setProviderRef] = useState('')
  const queryClient = useQueryClient()

  const markRefundMutation = useMutation({
    mutationFn: (id: number) =>
      api(`/admin/refunds/${id}/mark-refunded`, {
        method: 'POST',
        body: JSON.stringify({ provider_ref: providerRef.trim() }),
      }),
    onSuccess: () => {
      toast.success('Refund marked as completed')
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] })
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not mark refund')
    },
  })

  if (!refund) return null

  return (
    <Dialog open={!!refund} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Refund as Completed</DialogTitle>
          <DialogDescription>
            Record the transaction reference string for the issued refund.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p><span className="font-semibold">Contest:</span> {refund.contest_title}</p>
            <p><span className="font-semibold">User:</span> {refund.user_email}</p>
            <p><span className="font-semibold">Amount:</span> RM {(refund.amount_cents / 100).toFixed(2)}</p>
            {refund.payment_handle && (
              <p><span className="font-semibold">Handle:</span> <code className="bg-background px-1.5 py-0.5 rounded">{refund.payment_handle}</code></p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Refund Reference / TxID *</label>
            <Input
              placeholder="e.g. REF-TNG-9823412"
              value={providerRef}
              onChange={(e) => setProviderRef(e.target.value)}
              className="h-11 text-base sm:text-sm rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-11 min-h-[44px] px-4 rounded-xl font-medium">
            Cancel
          </Button>
          <Button
            disabled={!providerRef.trim() || markRefundMutation.isPending}
            onClick={() => markRefundMutation.mutate(refund.id)}
            className="h-11 min-h-[44px] px-5 rounded-xl font-semibold"
          >
            {markRefundMutation.isPending ? 'Saving…' : 'Mark as Refunded'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminPayouts() {

  const [selectedPayout, setSelectedPayout] = useState<AdminPayoutItem | null>(null)
  const [selectedRefund, setSelectedRefund] = useState<AdminRefundItem | null>(null)

  const { data, isLoading } = useQuery<PayoutsResponse>({
    queryKey: ['admin-payouts'],
    queryFn: () => api<PayoutsResponse>('/admin/payouts'),
  })

  const payouts = data?.payouts ?? []
  const refunds = data?.refunds ?? []

  const pendingPayouts = payouts.filter((p) => p.status === 'pending')
  const pendingRefunds = refunds.filter((r) => r.status === 'refund_pending')



  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payouts & Refunds</h1>
        <p className="text-sm text-muted-foreground">
          Manage prize transfers and entrant refunds across all contests.
        </p>
      </div>

      <Tabs defaultValue="payouts" className="w-full">
        <TabsList>
          <TabsTrigger value="payouts" className="gap-2">
            <DollarSign className="size-4" />
            Payouts
            {pendingPayouts.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {pendingPayouts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="refunds" className="gap-2">
            <RefreshCw className="size-4" />
            Refunds
            {pendingRefunds.length > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs">
                {pendingRefunds.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payouts" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Payouts</CardTitle>
              <CardDescription>
                Contests that have ended and require manual admin transfer of prize money.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : payouts.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No payouts found.
                </p>
              ) : (
                <>

                  {/* Desktop Table View */}
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contest</TableHead>
                        <TableHead>Rank</TableHead>
                        <TableHead>Winner / Recipient</TableHead>
                        <TableHead>Payment Handle</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payouts.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.contest_title}</TableCell>
                          <TableCell>
                            <Badge variant={p.rank === '1' ? 'default' : 'outline'}>
                              {p.rank === 'platform' ? 'Platform' : `${p.rank} Place`}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {p.contestant_name ? (
                              <div>
                                <div className="font-medium">{p.contestant_name}</div>
                                <div className="text-xs text-muted-foreground">{p.user_email}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">WhoIsHot Platform</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.payment_handle ? (
                              <code className="bg-muted px-2 py-1 rounded text-xs">
                                {p.payment_handle}
                              </code>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">
                            RM {(p.amount_cents / 100).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {p.status === 'sent' ? (
                              <Badge className="bg-emerald-500 hover:bg-emerald-600 gap-1">
                                <CheckCircle className="size-3" /> Sent ({p.provider_ref})
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <Clock className="size-3" /> Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.status === 'pending' ? (
                              <Button
                                size="sm"
                                onClick={() => setSelectedPayout(p)}
                              >
                                Mark as Sent
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground font-mono">
                                {p.provider_ref}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Mobile Stacked Cards View */}
                  <div className="space-y-3 md:hidden">
                    {payouts.map((p) => (
                      <Card key={p.id} className="rounded-2xl border-border/70 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-sm sm:text-base">{p.contest_title}</h4>
                            <p className="text-xs text-muted-foreground">
                              {p.contestant_name ? `${p.contestant_name} (${p.user_email})` : 'WhoIsHot Platform'}
                            </p>
                          </div>
                          <Badge variant={p.rank === '1' ? 'default' : 'outline'} className="text-xs shrink-0">
                            {p.rank === 'platform' ? 'Platform' : `${p.rank} Place`}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                          <div>
                            <span className="text-muted-foreground block text-[10px]">Amount</span>
                            <span className="font-bold text-amber-500 text-sm">RM {(p.amount_cents / 100).toFixed(2)}</span>
                          </div>
                          {p.payment_handle && (
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Handle</span>
                              <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">{p.payment_handle}</code>
                            </div>
                          )}
                          <div className="text-right">
                            {p.status === 'pending' ? (
                              <Button
                                size="sm"
                                onClick={() => setSelectedPayout(p)}
                                className="h-10 min-h-[40px] px-3 font-semibold text-xs rounded-xl"
                              >
                                Mark as Sent
                              </Button>
                            ) : (
                              <Badge className="bg-emerald-500 text-white text-[10px]">Sent</Badge>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refunds" className="mt-4 space-y-4">
          <Card className="rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
            <CardHeader className="p-6 sm:p-8 pb-3 sm:pb-3 space-y-1">
              <CardTitle className="text-xl font-bold tracking-tight">Pending & Issued Refunds</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Entrants requiring refunds due to contest cancellation (&lt;5 entrants) or self-deletion.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 pt-0">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : refunds.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No refunds pending.
                </p>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contest</TableHead>
                        <TableHead>User Email</TableHead>
                        <TableHead>Payment Handle</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {refunds.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.contest_title}</TableCell>
                          <TableCell>{r.user_email}</TableCell>
                          <TableCell>
                            {r.payment_handle ? (
                              <code className="bg-muted px-2 py-1 rounded text-xs">
                                {r.payment_handle}
                              </code>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">
                            RM {(r.amount_cents / 100).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {r.status === 'refunded' ? (
                              <Badge className="bg-emerald-500 hover:bg-emerald-600 gap-1">
                                <CheckCircle className="size-3" /> Refunded
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1">
                                <Clock className="size-3" /> Refund Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.status === 'refund_pending' ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setSelectedRefund(r)}
                              >
                                Mark as Refunded
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground font-mono">
                                {r.provider_ref}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Mobile Stacked Card View */}
                  <div className="space-y-3 md:hidden">
                    {refunds.map((r) => (
                      <Card key={r.id} className="rounded-2xl border-border/70 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-sm sm:text-base">{r.contest_title}</h4>
                            <p className="text-xs text-muted-foreground">{r.user_email}</p>
                          </div>
                          <Badge variant={r.status === 'refunded' ? 'secondary' : 'destructive'} className="text-xs shrink-0">
                            {r.status === 'refunded' ? 'Refunded' : 'Pending'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                          <div>
                            <span className="text-muted-foreground block text-[10px]">Amount</span>
                            <span className="font-bold text-destructive text-sm">RM {(r.amount_cents / 100).toFixed(2)}</span>
                          </div>
                          {r.payment_handle && (
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Handle</span>
                              <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">{r.payment_handle}</code>
                            </div>
                          )}
                          <div className="text-right">
                            {r.status === 'refund_pending' ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setSelectedRefund(r)}
                                className="h-10 min-h-[40px] px-3 font-semibold text-xs rounded-xl"
                              >
                                Mark Refunded
                              </Button>
                            ) : (
                              <span className="text-xs font-mono text-muted-foreground">{r.provider_ref}</span>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      <MarkSentDialog
        payout={selectedPayout}
        onClose={() => setSelectedPayout(null)}
      />

      <MarkRefundDialog
        refund={selectedRefund}
        onClose={() => setSelectedRefund(null)}
      />
    </div>
  )
}
