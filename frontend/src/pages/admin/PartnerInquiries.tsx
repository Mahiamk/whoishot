import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Search, Check, Sparkles, User, Share2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'


interface PartnerIntroduction {
  id: number
  inquiry_id: number
  contestant_id: number
  admin_id: number
  status: 'pending_consent' | 'accepted' | 'declined' | 'expired'
  admin_note: string | null
  contact_info_shared: boolean
  shared_at: string | null
  created_at: string
  responded_at: string | null
  deadline_at: string
  contestant_name?: string
  contestant_photo_url?: string
  contest_title?: string
  company_name?: string
}

interface PartnerInquiry {
  id: number
  company_name: string
  contact_name: string
  email: string
  phone: string | null
  inquiry_type: 'modeling_school' | 'fashion_show' | 'stylist' | 'other'
  message: string
  interested_in: string | null
  status: 'new' | 'reviewing' | 'matched' | 'closed'
  created_at: string
  introductions: PartnerIntroduction[]
}

interface OptedInContestant {
  id: number
  name: string
  photo_url: string | null
  gender_category: 'F' | 'M'
  country: string | null
  contest_id: number
  contest_title: string
  open_to_opportunities: boolean
}

export default function PartnerInquiries() {
  const queryClient = useQueryClient()
  const [proposeInquiry, setProposeInquiry] = useState<PartnerInquiry | null>(null)
  const [contestantSearch, setContestantSearch] = useState('')
  const [selectedContestantId, setSelectedContestantId] = useState<number | null>(null)
  const [adminNote, setAdminNote] = useState('')

  const { data: inquiries, isLoading } = useQuery<PartnerInquiry[]>({
    queryKey: ['admin-partner-inquiries'],
    queryFn: () => api('/admin/partner-inquiries'),
  })

  const { data: optedInContestants, isLoading: loadingContestants } = useQuery<OptedInContestant[]>({
    queryKey: ['admin-opted-in-contestants', contestantSearch],
    queryFn: () => api(`/admin/opted-in-contestants?q=${encodeURIComponent(contestantSearch)}`),
    enabled: proposeInquiry !== null,
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api(`/admin/partner-inquiries/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success('Inquiry status updated')
      queryClient.invalidateQueries({ queryKey: ['admin-partner-inquiries'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Update failed'),
  })

  const proposeMutation = useMutation({
    mutationFn: ({ inquiryId, contestantId, note }: { inquiryId: number; contestantId: number; note: string }) =>
      api(`/admin/partner-inquiries/${inquiryId}/propose-introduction`, {
        method: 'POST',
        body: JSON.stringify({ contestant_id: contestantId, admin_note: note || null }),
      }),
    onSuccess: () => {
      toast.success('Introduction proposed and notification sent to contestant')
      queryClient.invalidateQueries({ queryKey: ['admin-partner-inquiries'] })
      setProposeInquiry(null)
      setSelectedContestantId(null)
      setAdminNote('')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to propose introduction'),
  })

  const markSharedMutation = useMutation({
    mutationFn: (introId: number) =>
      api(`/admin/partner-introductions/${introId}/mark-shared`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Marked as shared in audit log')
      queryClient.invalidateQueries({ queryKey: ['admin-partner-inquiries'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Action failed'),
  })

  function statusBadge(status: PartnerInquiry['status']) {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-500 text-white font-semibold">New</Badge>
      case 'reviewing':
        return <Badge className="bg-amber-500 text-white font-semibold">Reviewing</Badge>
      case 'matched':
        return <Badge className="bg-emerald-500 text-white font-semibold">Matched</Badge>
      case 'closed':
        return <Badge variant="outline" className="text-muted-foreground font-semibold">Closed</Badge>
    }
  }

  function introStatusBadge(status: PartnerIntroduction['status']) {
    switch (status) {
      case 'pending_consent':
        return <Badge variant="outline" className="border-amber-500 text-amber-500 bg-amber-500/10">Pending Consent</Badge>
      case 'accepted':
        return <Badge className="bg-emerald-500 text-white font-semibold">Accepted</Badge>
      case 'declined':
        return <Badge variant="outline" className="border-destructive text-destructive">Declined</Badge>
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>
    }
  }

  function typeLabel(type: string) {
    switch (type) {
      case 'modeling_school':
        return 'Modeling School'
      case 'fashion_show':
        return 'Fashion Show'
      case 'stylist':
        return 'Stylist'
      default:
        return 'Other Partner'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partner Inquiries & Opportunities</h1>
          <p className="text-sm text-muted-foreground">
            Manage modeling school, fashion show, and stylist partnership requests and propose introductions to opted-in contestants.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border-border/60">
        <CardHeader>
          <CardTitle className="text-lg">All Partner Inquiries</CardTitle>
          <CardDescription>
            Agencies submitting inquiries seeking talent. Propose introductions only to opted-in contestants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !inquiries || inquiries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Building2 className="size-10 mx-auto text-muted-foreground/60" />
              <p>No partner inquiries received yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <>
                {/* Desktop Table View */}
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner Organization</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Details & Criteria</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Introductions</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inquiries.map((inquiry) => (
                      <TableRow key={inquiry.id} className="align-top">
                        <TableCell className="font-medium max-w-[200px]">
                          <p className="font-bold text-foreground truncate">{inquiry.company_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{inquiry.contact_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{inquiry.email}</p>
                          {inquiry.phone && <p className="text-xs text-muted-foreground truncate">{inquiry.phone}</p>}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-xs font-semibold">
                            {typeLabel(inquiry.inquiry_type)}
                          </Badge>
                        </TableCell>

                        <TableCell className="max-w-[280px]">
                          {inquiry.interested_in && (
                            <p className="text-xs font-semibold text-primary mb-1 line-clamp-2">
                              Target: {inquiry.interested_in}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {inquiry.message}
                          </p>
                        </TableCell>

                        <TableCell className="whitespace-nowrap space-y-1.5">
                          <div>{statusBadge(inquiry.status)}</div>
                          <Select
                            value={inquiry.status}
                            onValueChange={(val) => updateStatusMutation.mutate({ id: inquiry.id, status: val })}
                          >
                            <SelectTrigger className="h-7 text-xs w-[110px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="reviewing">Reviewing</SelectItem>
                              <SelectItem value="matched">Matched</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>

                        <TableCell className="min-w-[220px]">
                          {inquiry.introductions.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">None proposed</span>
                          ) : (
                            <div className="space-y-2">
                              {inquiry.introductions.map((intro) => (
                                <div key={intro.id} className="p-2 rounded-lg border bg-muted/20 text-xs space-y-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-semibold">{intro.contestant_name || `Contestant #${intro.contestant_id}`}</span>
                                    {introStatusBadge(intro.status)}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">{intro.contest_title}</p>
                                  {intro.contact_info_shared ? (
                                    <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500 bg-emerald-500/10 gap-1">
                                      <Check className="size-2.5" /> Contact Shared
                                    </Badge>
                                  ) : intro.status === 'accepted' ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-[10px] font-bold border-amber-500 text-amber-500 hover:bg-amber-500/10 gap-1 mt-1 w-full"
                                      onClick={() => markSharedMutation.mutate(intro.id)}
                                      disabled={markSharedMutation.isPending}
                                    >
                                      <Share2 className="size-3" /> Mark as shared
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            className="gap-1 text-xs font-semibold"
                            onClick={() => {
                              setProposeInquiry(inquiry)
                              setSelectedContestantId(null)
                              setContestantSearch('')
                              setAdminNote('')
                            }}
                          >
                            <Sparkles className="size-3.5" />
                            Propose Intro
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Mobile Stacked Card View */}
                <div className="space-y-3 md:hidden">
                  {inquiries.map((inquiry) => (
                    <Card key={inquiry.id} className="rounded-2xl border-border/70 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-base">{inquiry.company_name}</h4>
                          <p className="text-xs text-muted-foreground">{inquiry.contact_name} · {inquiry.email}</p>
                        </div>
                        <Badge variant="outline" className="text-xs font-semibold shrink-0">
                          {typeLabel(inquiry.inquiry_type)}
                        </Badge>
                      </div>
                      {inquiry.interested_in && (
                        <p className="text-xs font-semibold text-primary">Target: {inquiry.interested_in}</p>
                      )}
                      <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
                        {inquiry.message}
                      </div>
                      <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                        <div className="flex items-center gap-2">
                          {statusBadge(inquiry.status)}
                          <Select
                            value={inquiry.status}
                            onValueChange={(val) => updateStatusMutation.mutate({ id: inquiry.id, status: val })}
                          >
                            <SelectTrigger className="h-8 text-xs w-[100px] rounded-lg">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="reviewing">Reviewing</SelectItem>
                              <SelectItem value="matched">Matched</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          size="sm"
                          className="h-10 px-3 font-semibold text-xs rounded-xl gap-1"
                          onClick={() => {
                            setProposeInquiry(inquiry)
                            setSelectedContestantId(null)
                            setContestantSearch('')
                            setAdminNote('')
                          }}
                        >
                          <Sparkles className="size-3.5" />
                          Propose Intro
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Propose Introduction Dialog */}
      {proposeInquiry && (
        <Dialog open={proposeInquiry !== null} onOpenChange={(open) => !open && setProposeInquiry(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-amber-500" />
                Propose Introduction for {proposeInquiry.company_name}
              </DialogTitle>
              <DialogDescription>
                Select an opted-in contestant to receive an introduction proposal notification.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl border bg-muted/30 text-xs space-y-1">
                <p className="font-semibold">{typeLabel(proposeInquiry.inquiry_type)} — {proposeInquiry.contact_name} ({proposeInquiry.email})</p>
                {proposeInquiry.interested_in && (
                  <p className="text-primary font-medium">Interested in: {proposeInquiry.interested_in}</p>
                )}
                <p className="text-muted-foreground italic">"{proposeInquiry.message}"</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center justify-between">
                  <span>Select Opted-In Contestant *</span>
                  <span className="text-xs text-muted-foreground font-normal">Restricted to opted-in contestants only</span>
                </label>

                <div className="relative">
                  <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search opted-in contestants by name or country..."
                    className="pl-9 h-11 text-base sm:text-sm rounded-xl"
                    value={contestantSearch}
                    onChange={(e) => setContestantSearch(e.target.value)}
                  />
                </div>

                <div className="max-h-48 overflow-y-auto rounded-xl border p-1 space-y-1">
                  {loadingContestants ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">Loading opted-in contestants...</div>
                  ) : !optedInContestants || optedInContestants.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No opted-in contestants match your search.
                    </div>
                  ) : (
                    optedInContestants.map((c) => {
                      const isSelected = selectedContestantId === c.id
                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelectedContestantId(c.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/15 border-primary border' : 'hover:bg-muted/50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9">
                              {c.photo_url && <AvatarImage src={c.photo_url} alt={c.name} />}
                              <AvatarFallback><User className="size-4" /></AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-bold leading-none">{c.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{c.contest_title} • {c.country || 'N/A'}</p>
                            </div>
                          </div>

                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500 bg-amber-500/10">
                            Opted In
                          </Badge>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Admin Note (Optional)</label>
                <Textarea
                  placeholder="Add context for the contestant about why this opportunity fits them..."
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="text-base sm:text-sm rounded-xl p-3"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setProposeInquiry(null)} className="h-11 min-h-[44px] px-4 font-medium rounded-xl">
                Cancel
              </Button>
              <Button
                disabled={selectedContestantId === null || proposeMutation.isPending}
                onClick={() => {
                  if (selectedContestantId && proposeInquiry) {
                    proposeMutation.mutate({
                      inquiryId: proposeInquiry.id,
                      contestantId: selectedContestantId,
                      note: adminNote,
                    })
                  }
                }}
                className="h-11 min-h-[44px] px-5 font-bold rounded-xl gap-2"
              >
                {proposeMutation.isPending ? 'Proposing...' : 'Send Proposal Notice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  )
}
