import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, DollarSign, Download, ExternalLink, Eye, FileText, Filter, Globe, RotateCw, Wallet, X } from 'lucide-react'

import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'


import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, mediaUrl } from '@/lib/api'

interface PaymentReviewItem {
  id: number
  type: 'subscription' | 'entry_fee'
  user_id: number
  user_name: string
  user_email: string
  user_country?: string
  provider_ref: string
  amount: number

  currency: string
  method: string
  receipt_url: string | null
  receipt_hash: string | null
  receipt_input_type: string | null
  verify_provider_key: string | null
  verify_source: string | null
  verify_reference: string | null
  verify_amount: number | null
  verify_currency: string | null
  verify_payer_name: string | null
  verify_status: 'verified' | 'amount_mismatch' | 'not_completed' | 'fetch_failed' | 'error' | null
  verify_raw_response: Record<string, any> | null
  is_duplicate_hash: boolean
  status: 'awaiting_review' | 'paid' | 'rejected' | 'pending' | 'failed'
  review_note: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by_email: string | null
}

interface IncomeSummary {
  total_income_cents: number
  subscriptions_income_cents: number
  entries_income_cents: number
  manual_income_cents: number
  online_income_cents: number
}

interface IncomeItem {
  id: number
  type: 'subscription' | 'entry_fee'
  user_id: number
  user_name: string
  user_email: string
  provider_ref: string
  amount_cents: number
  currency: string
  method: string
  payment_status: string
  received_at: string
  approved_by_email: string | null
}

interface IncomeResponse {
  summary: IncomeSummary
  items: IncomeItem[]
}

const REJECTION_REASONS = [
  { value: 'duplicate_receipt', label: 'Duplicate Receipt Reference' },
  { value: 'amount_mismatch', label: 'Amount Mismatch / Insufficient Payment' },
  { value: 'not_completed', label: 'Transaction Not Completed Upstream' },
  { value: 'unreadable_receipt', label: 'Unreadable or Invalid Screenshot' },
  { value: 'wrong_reference', label: 'Invalid Reference Number' },
  { value: 'other', label: 'Other (Note Required)' },
]

export default function PaymentReviews() {



  const [filter, setFilter] = useState<'awaiting_review' | 'paid' | 'rejected' | 'income' | 'all'>('awaiting_review')
  const [selectedCountry, setSelectedCountry] = useState<string>('all')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  // Approval state
  const [approvingItem, setApprovingItem] = useState<PaymentReviewItem | null>(null)
  const [approveAmountRM, setApproveAmountRM] = useState('')

  // Rejection state
  const [rejectingItem, setRejectingItem] = useState<PaymentReviewItem | null>(null)
  const [rejectReason, setRejectReason] = useState('duplicate_receipt')
  const [rejectNote, setRejectNote] = useState('')

  const queryClient = useQueryClient()

  const { data: items, isLoading } = useQuery({
    queryKey: ['admin-payment-reviews', filter, selectedCountry],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filter !== 'all' && filter !== 'income') params.set('status', filter)
      if (selectedCountry !== 'all') params.set('country', selectedCountry)
      const q = params.toString() ? `?${params.toString()}` : ''
      return api<PaymentReviewItem[]>(`/admin/payment-reviews${q}`)
    },
    enabled: filter !== 'income',
  })

  const { data: incomeData, isLoading: isIncomeLoading } = useQuery({
    queryKey: ['admin-income', selectedCountry],
    queryFn: () => {
      const q = selectedCountry !== 'all' ? `?country=${selectedCountry}` : ''
      return api<IncomeResponse>(`/admin/income${q}`)
    },
    enabled: filter === 'income',
  })


  const approveMutation = useMutation({
    mutationFn: ({ type, id, amount_received }: { type: string; id: number; amount_received?: number }) =>
      api(`/admin/payment-reviews/${type}/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ amount_received }),
      }),
    onSuccess: () => {
      toast.success('Payment approved and activated')
      setApprovingItem(null)
      setApproveAmountRM('')
      queryClient.invalidateQueries({ queryKey: ['admin-payment-reviews'] })
      queryClient.invalidateQueries({ queryKey: ['admin-income'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not approve payment'),
  })

  const retryMutation = useMutation({
    mutationFn: ({ type, id }: { type: string; id: number }) =>
      api(`/admin/payment-reviews/${type}/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Receipt verification retried')
      queryClient.invalidateQueries({ queryKey: ['admin-payment-reviews'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Retry failed'),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ type, id, reason, note }: { type: string; id: number; reason: string; note?: string }) =>
      api(`/admin/payment-reviews/${type}/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason, review_note: note }),
      }),
    onSuccess: () => {
      toast.success('Payment rejected')
      setRejectingItem(null)
      setRejectNote('')
      queryClient.invalidateQueries({ queryKey: ['admin-payment-reviews'] })
      queryClient.invalidateQueries({ queryKey: ['admin-income'] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not reject payment'),
  })

  function handleApproveSubmit() {
    if (!approvingItem) return
    const cents = Math.round(Number(approveAmountRM) * 100)
    if (isNaN(cents) || cents <= 0) {
      toast.error('Please enter a valid positive amount received')
      return
    }
    approveMutation.mutate({
      type: approvingItem.type,
      id: approvingItem.id,
      amount_received: cents,
    })
  }

  function handleRejectSubmit() {
    if (!rejectingItem) return
    if (rejectReason === 'other' && !rejectNote.trim()) {
      toast.error('Note is required when selecting Other')
      return
    }
    rejectMutation.mutate({
      type: rejectingItem.type,
      id: rejectingItem.id,
      reason: rejectReason,
      note: rejectNote.trim() || undefined,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment Reviews & Verification</h1>
        <p className="text-sm text-muted-foreground">
          Review manual payment submissions, verify parsed receipt details via v.odit.et, and track total platform revenue.
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

        {/* Status Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="bg-card/80 backdrop-blur-md border border-border/50 p-1 rounded-full shadow-2xs h-auto gap-1">
            <TabsTrigger value="awaiting_review" className="rounded-full text-xs px-3 py-1 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs">
              <span className="size-1.5 rounded-full bg-amber-500 mr-1.5" /> Pending Review
            </TabsTrigger>
            <TabsTrigger value="paid" className="rounded-full text-xs px-3 py-1 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs">
              <span className="size-1.5 rounded-full bg-green-500 mr-1.5" /> Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" className="rounded-full text-xs px-3 py-1 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs">
              <span className="size-1.5 rounded-full bg-destructive mr-1.5" /> Rejected
            </TabsTrigger>
            <TabsTrigger value="income" className="rounded-full text-xs px-3 py-1 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs">
              💰 Total Income
            </TabsTrigger>
            <TabsTrigger value="all" className="rounded-full text-xs px-3 py-1 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs">
              All Submissions
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Modern Glassmorphic Country Filter Dropdown */}
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="h-9 w-[190px] rounded-xl border border-border/60 bg-card/80 backdrop-blur-md shadow-2xs hover:border-primary/50 focus:ring-2 focus:ring-primary/20 text-xs font-semibold transition-all cursor-pointer">
              <div className="flex items-center gap-2 truncate">
                <Filter className="size-3.5 text-primary" />
                <SelectValue placeholder="Filter Region" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-lg shadow-lg p-1">
              <SelectItem value="all" className="rounded-lg text-xs font-semibold py-2 cursor-pointer focus:bg-primary/10">
                <div className="flex items-center gap-2">
                  <Globe className="size-3.5 text-primary shrink-0" />
                  <span>All Regions</span>
                </div>
              </SelectItem>

              <SelectItem value="MY" className="rounded-lg text-xs font-semibold py-2 cursor-pointer focus:bg-primary/10">
                <div className="flex items-center justify-between w-full gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🇲🇾</span>
                    <span>Malaysia</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">MYR</span>
                </div>
              </SelectItem>
              <SelectItem value="ET" className="rounded-lg text-xs font-semibold py-2 cursor-pointer focus:bg-primary/10">
                <div className="flex items-center justify-between w-full gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🇪🇹</span>
                    <span>Ethiopia</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">ETB</span>
                </div>
              </SelectItem>
              <SelectItem value="US" className="rounded-lg text-xs font-semibold py-2 cursor-pointer focus:bg-primary/10">
                <div className="flex items-center justify-between w-full gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🇺🇸</span>
                    <span>United States</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">USD</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>




      {filter === 'income' ? (
        <div className="space-y-6">
          {isIncomeLoading ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : incomeData ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="size-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      RM {(incomeData.summary.total_income_cents / 100).toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Overall platform earnings</p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Social Subscriptions</CardTitle>
                    <Wallet className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      RM {(incomeData.summary.subscriptions_income_cents / 100).toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Social link unlock plans</p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Contest Entry Fees</CardTitle>
                    <DollarSign className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      RM {(incomeData.summary.entries_income_cents / 100).toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Paid contest entry fees</p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Manual vs Online</CardTitle>
                    <Wallet className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-bold">
                      RM {(incomeData.summary.manual_income_cents / 100).toFixed(2)} / RM {(incomeData.summary.online_income_cents / 100).toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Bank transfer / Online gateways</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">Income Ledger</CardTitle>
                  <CardDescription>
                    All confirmed income transactions across manual bank transfers and online gateways.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {incomeData.items.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No income records logged yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Channel</TableHead>
                            <TableHead>Amount Received</TableHead>
                            <TableHead>Approved By</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {incomeData.items.map((item) => (
                            <TableRow key={`${item.type}-${item.id}`}>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(item.received_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-sm">{item.user_name}</div>
                                <div className="text-xs text-muted-foreground">{item.user_email}</div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize text-xs">
                                  {item.type === 'subscription' ? 'Social Subscription' : 'Entry Fee'}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{item.provider_ref}</TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    item.method === 'manual'
                                      ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30'
                                      : 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/30'
                                  }
                                >
                                  {item.method === 'manual' ? 'Bank/TnG Transfer' : 'Online Gateway'}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-bold text-sm text-green-600">
                                RM {(item.amount_cents / 100).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {item.approved_by_email ?? 'Webhook / Auto'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      ) : (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg">Submissions Queue</CardTitle>
            <CardDescription>
              Review automated receipt verification results (v.odit.et) or manually approve / reject payments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : !items || items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No payment submissions found in this view.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Parsed Provider / Payer</TableHead>
                      <TableHead>Verified Ref & Amount</TableHead>
                      <TableHead>Verification Result</TableHead>
                      <TableHead>Proof / Receipt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={`${item.type}-${item.id}`}>
                        <TableCell>
                          <div className="font-medium text-sm">{item.user_name}</div>
                          <div className="text-xs text-muted-foreground">{item.user_email}</div>
                          <Badge variant="outline" className="capitalize text-[10px] mt-1">
                            {item.type === 'subscription' ? 'Social Subscription' : 'Entry Fee'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {item.verify_provider_key ? (
                              <Badge className="bg-primary/10 text-primary border-primary/30 uppercase text-[10px]">
                                {item.verify_provider_key}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Manual Bank</span>
                            )}
                            <div className="text-xs font-medium">
                              {item.verify_payer_name || 'N/A'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-mono text-xs font-semibold">
                              {item.verify_reference || item.provider_ref}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.verify_amount
                                ? `${(item.verify_amount / 100).toFixed(2)} ${item.verify_currency || 'ETB'}`
                                : `${(item.amount / 100).toFixed(2)} ${item.currency}`}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.verify_status === 'verified' && (
                            <Badge className="bg-green-600 text-white">Auto-Verified</Badge>
                          )}
                          {item.verify_status === 'amount_mismatch' && (
                            <Badge className="bg-amber-500 text-white">Amount Mismatch</Badge>
                          )}
                          {item.verify_status === 'not_completed' && (
                            <Badge className="bg-amber-600 text-white">Not Completed</Badge>
                          )}
                          {item.verify_status === 'fetch_failed' && (
                            <Badge variant="outline" className="text-amber-600 border-amber-500/40 bg-amber-500/10">
                              Needs Manual Review
                            </Badge>
                          )}
                          {item.verify_status === 'error' && (
                            <Badge variant="destructive">Error</Badge>
                          )}
                          {!item.verify_status && (
                            <span className="text-xs text-muted-foreground">Needs Manual Review</span>
                          )}

                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {item.receipt_url ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  onClick={() => setPreviewUrl(mediaUrl(item.receipt_url))}
                                >
                                  <Eye className="size-3.5" /> View
                                </Button>
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="h-8 size-8 p-0"
                                  title="Download Receipt"
                                >
                                  <a href={mediaUrl(item.receipt_url)} download target="_blank" rel="noopener noreferrer">
                                    <Download className="size-3.5" />
                                  </a>
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">No file</span>
                            )}
                            {item.is_duplicate_hash && (
                              <Badge variant="destructive" className="gap-1 text-[10px]">
                                <AlertTriangle className="size-3" /> Duplicate
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.status === 'awaiting_review' && (
                            <Badge className="bg-amber-500 text-white hover:bg-amber-500">Awaiting Review</Badge>
                          )}
                          {item.status === 'paid' && (
                            <Badge className="bg-green-600 text-white hover:bg-green-600">Approved</Badge>
                          )}
                          {item.status === 'rejected' && (
                            <Badge className="bg-destructive text-white">Rejected</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.status === 'awaiting_review' && (
                            <div className="flex justify-end gap-1.5">
                              {(item.verify_status === 'fetch_failed' || item.verify_status === 'error') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1 text-xs"
                                  disabled={retryMutation.isPending}
                                  onClick={() => retryMutation.mutate({ type: item.type, id: item.id })}
                                >
                                  <RotateCw className="size-3.5" /> Retry
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="h-8 bg-green-600 hover:bg-green-700 text-white gap-1 text-xs"
                                disabled={approveMutation.isPending}
                                onClick={() => {
                                  setApprovingItem(item)
                                  setApproveAmountRM(((item.verify_amount || item.amount) / 100).toFixed(2))
                                }}
                              >
                                <Check className="size-3.5" /> Approve
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                onClick={() => {
                                  setRejectingItem(item)
                                  setRejectReason('duplicate_receipt')
                                  setRejectNote('')
                                }}
                              >
                                <X className="size-3.5" /> Reject
                              </Button>
                            </div>
                          )}
                          {item.status === 'rejected' && item.review_note && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={item.review_note}>
                              Reason: {item.review_note}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full-size Receipt View Modal */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-h-[90vh] sm:max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              Uploaded Payment Proof
            </DialogTitle>
            <DialogDescription>Review copy of uploaded bank / transfer receipt.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center p-2 border rounded-xl bg-muted/20 min-h-[300px]">
            {previewUrl?.toLowerCase().includes('.pdf') ? (
              <iframe
                src={previewUrl}
                className="w-full h-[60vh] rounded-lg border bg-white"
                title="Receipt PDF Document"
              />
            ) : (
              <img src={previewUrl || ''} alt="Payment Receipt" className="max-h-[60vh] object-contain rounded-lg" />
            )}
          </div>
          <DialogFooter className="sm:justify-between gap-2 border-t pt-3">
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={previewUrl || '#'} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                  <ExternalLink className="size-3.5" /> Open in New Tab
                </a>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <a href={previewUrl || '#'} download target="_blank" rel="noopener noreferrer" className="gap-1.5">
                  <Download className="size-3.5" /> Download Receipt
                </a>
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPreviewUrl(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation & Amount Dialog */}
      <Dialog open={!!approvingItem} onOpenChange={(open) => !open && setApprovingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Manual Payment</DialogTitle>
            <DialogDescription>
              Confirm approval for {approvingItem?.user_name} ({approvingItem?.user_email}). Specify the exact amount received.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border bg-muted/30 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-semibold capitalize">{approvingItem?.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference:</span>
                <span className="font-mono">{approvingItem?.verify_reference || approvingItem?.provider_ref}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Amount Received (RM/ETB) *</label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={approveAmountRM}
                  onChange={(e) => setApproveAmountRM(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                You can adjust this if the user transferred a different amount. This will be recorded as platform revenue.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovingItem(null)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={approveMutation.isPending}
              onClick={handleApproveSubmit}
            >
              {approveMutation.isPending ? 'Approving…' : 'Approve & Log Revenue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={!!rejectingItem} onOpenChange={(open) => !open && setRejectingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Payment Submission</DialogTitle>
            <DialogDescription>
              Select a reason for rejecting this manual payment. The note will be visible to the user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Rejection Reason *</label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium"
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Additional Note {rejectReason === 'other' ? '*' : '(Optional)'}</label>
              <Textarea
                placeholder="e.g. Reference code TB123456789 was already used for another subscription."
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingItem(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={handleRejectSubmit}
            >
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject Submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
