import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Check, Clock, Copy, CreditCard, FileCheck, FileText, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

interface ManualInfoResponse {
  manual_info: {
    bank_name: string
    account_no: string
    account_name: string
    tng_number: string
  }
  providers: {
    [key: string]: {
      name: string
      configured: boolean
    }
  }
}

interface CheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'subscription' | 'entry_fee'
  contestId?: number
  contestTitle?: string
  entryFeeCents?: number
  paymentHandle?: string
  onSuccess?: () => void
}

export function CheckoutDialog({
  open,
  onOpenChange,
  type,
  contestId,
  contestTitle,
  entryFeeCents = 900,
  paymentHandle,
  onSuccess,
}: CheckoutDialogProps) {
  const [activeTab, setActiveTab] = useState<'online' | 'manual'>('online')
  const [receiptMode, setReceiptMode] = useState<'link' | 'upload'>('link')
  
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Receipt data
  const [pastedUrl, setPastedUrl] = useState('')
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptHash, setReceiptHash] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [note, setNote] = useState('')

  // Response status
  const [submittedRef, setSubmittedRef] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const { data: infoData } = useQuery({
    queryKey: ['manual-payment-info'],
    queryFn: () => api<ManualInfoResponse>('/payments/manual-info'),
    enabled: open,
  })

  const manualInfo = infoData?.manual_info ?? {
    bank_name: 'Maybank',
    account_no: '1234-5678-9012',
    account_name: 'WhoIsHot Inc',
    tng_number: '+60 12-345 6789',
  }

  const providers = infoData?.providers ?? {
    tng: { name: "Touch 'n Go / Curlec", configured: false },
    birr: { name: 'Chapa / BirrJS', configured: false },
    mock: { name: 'Mock Provider (Dev)', configured: true },
  }

  const amountFormatted = (entryFeeCents / 100).toFixed(2)

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedKey(null), 2000)
  }

  async function handleFileUpload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error('Screenshot must be a JPEG, PNG or WebP image')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Screenshot image must be 5MB or smaller')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api<{ url: string; hash: string }>('/payments/upload-receipt-image', {
        method: 'POST',
        body: formData,
      })
      setReceiptUrl(res.url)
      setReceiptHash(res.hash)
      setFileName(file.name)
      toast.success('Screenshot uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  /* 
  async function _handleOnlineCheckout(provider: string) {
    setSubmitting(true)
    try {
      if (type === 'subscription') {
        const res = await api<{ checkout_url: string }>('/subscriptions/checkout', {
          method: 'POST',
          body: JSON.stringify({ provider, method: 'provider' }),
        })
        if (res.checkout_url) {
          window.location.href = res.checkout_url
        }
      } else {
        const res = await api<{ checkout_url: string }>('/entries/checkout', {
          method: 'POST',
          body: JSON.stringify({
            contest_id: contestId,
            payment_handle: paymentHandle || 'User',
            provider,
            method: 'provider',
          }),
        })
        if (res.checkout_url) {
          window.location.href = res.checkout_url
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start online checkout')
      setSubmitting(false)
    }
  }
  */


  async function handleManualSubmit() {
    setSubmitting(true)
    setChecking(true)
    setRejectionReason(null)

    const finalUrl = receiptMode === 'link' ? (pastedUrl.trim() || undefined) : receiptUrl
    const inputType = receiptMode === 'link' ? 'url' : 'image'

    try {
      if (type === 'subscription') {
        const res = await api<{ session_id: string; status?: string; review_note?: string }>('/subscriptions/checkout', {
          method: 'POST',
          body: JSON.stringify({
            provider: 'manual',
            method: 'manual',
            receipt_url: finalUrl,
            receipt_url_submitted: finalUrl,
            receipt_input_type: inputType,
            receipt_hash: receiptHash,
            note: note.trim() || undefined,
          }),
        })

        if (res.status === 'rejected') {
          setRejectionReason(res.review_note || 'duplicate_receipt')
          toast.error('Rejected — duplicate receipt')
        } else {
          setSubmittedRef(res.session_id)
          onSuccess?.()
        }
      } else {
        const res = await api<{ session_id: string; status?: string; review_note?: string }>('/entries/checkout', {
          method: 'POST',
          body: JSON.stringify({
            contest_id: contestId,
            payment_handle: paymentHandle || 'User',
            provider: 'manual',
            method: 'manual',
            receipt_url: finalUrl,
            receipt_url_submitted: finalUrl,
            receipt_input_type: inputType,
            receipt_hash: receiptHash,
            note: note.trim() || undefined,
          }),
        })

        if (res.status === 'rejected') {
          setRejectionReason(res.review_note || 'duplicate_receipt')
          toast.error('Rejected — duplicate receipt')
        } else {
          setSubmittedRef(res.session_id)
          onSuccess?.()
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit manual payment')
    } finally {
      setSubmitting(false)
      setChecking(false)
    }
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setSubmittedRef(null)
      setRejectionReason(null)
      setPastedUrl('')
      setReceiptUrl(null)
      setReceiptHash(null)
      setFileName(null)
      setNote('')
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" />
            {type === 'subscription' ? 'Unlock Social Links' : `Entry Fee — ${contestTitle || 'Contest'}`}
          </DialogTitle>
          <DialogDescription>
            {type === 'subscription'
              ? 'Subscribe for RM 9.00/mo to view contestant social handles.'
              : `Pay RM ${amountFormatted} to join this contest.`}
          </DialogDescription>
        </DialogHeader>

        {rejectionReason ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-destructive">Rejected — Duplicate Receipt</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                This transaction reference or receipt has already been submitted or approved. Please submit a valid unique receipt.
              </p>
            </div>
            <Button variant="outline" onClick={() => setRejectionReason(null)}>
              Try Another Receipt
            </Button>
          </div>
        ) : submittedRef ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
              <Clock className="size-6" />
            </div>
            <div>
              <Badge className="bg-amber-500 text-white hover:bg-amber-500 mb-2">Awaiting Review</Badge>
              <h3 className="font-semibold text-base">Payment Submitted for Review</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                An administrator will verify your receipt. Your status will update on your Account / Me page once approved.
              </p>
            </div>
            <Card className="bg-muted/40 p-3 text-center border-dashed">
              <span className="text-xs text-muted-foreground block">Reference Code</span>
              <span className="font-mono text-sm font-bold text-foreground">{submittedRef}</span>
            </Card>
            <Button onClick={() => handleClose(false)} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'online' | 'manual')} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Bank / Transfer</TabsTrigger>
              <TabsTrigger value="online" className="gap-1.5">
                Pay Online
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-400/60 text-amber-600 bg-amber-500/10">
                  Coming Soon
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="online" className="space-y-4 pt-3 text-center">
              <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                  <Clock className="size-5" />
                </div>
                <div className="space-y-1">
                  <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 hover:bg-amber-500/20 text-[10px] font-semibold uppercase">
                    Coming Soon
                  </Badge>
                  <h4 className="font-bold text-sm text-foreground">Instant Online Gateways Under Setup</h4>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Direct instant checkout (Touch 'n Go, Chapa, Telebirr) is currently being set up and will be enabled soon.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setActiveTab('manual')} className="mt-1 text-xs font-semibold">
                  Use Bank / Manual Transfer Instead →
                </Button>
              </div>

              <div className="space-y-2 opacity-50 pointer-events-none">
                {Object.entries(providers).map(([key, provider]) => (
                  <Card key={key} className="p-3 flex items-center justify-between gap-2 border bg-muted/20">
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs text-muted-foreground">{provider.name}</span>
                        <Badge variant="outline" className="text-[9px] text-muted-foreground border-border">
                          Coming soon
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {key === 'tng'
                          ? "Curlec / Touch 'n Go eWallet"
                          : key === 'birr'
                          ? 'Chapa / Telebirr / CBE'
                          : 'Online Payment Gateway'}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" disabled className="text-xs">
                      Pay Now
                    </Button>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4 pt-3">
              <Card className="bg-muted/30 p-3.5 space-y-2 text-xs border rounded-xl">
                <div className="flex justify-between items-center pb-1 border-b">
                  <span className="font-semibold text-foreground">Manual Transfer Instructions</span>
                  <span className="font-bold text-primary">RM {amountFormatted} / ETB</span>
                </div>
                <div className="grid gap-1.5 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Bank / Provider:</span>
                    <span className="font-medium">{manualInfo.bank_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Account No:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono">{manualInfo.account_no}</span>
                      <button
                        onClick={() => copyToClipboard(manualInfo.account_no, 'acc')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedKey === 'acc' ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Account Name:</span>
                    <span className="font-medium">{manualInfo.account_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Touch 'n Go DuitNow:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono">{manualInfo.tng_number}</span>
                      <button
                        onClick={() => copyToClipboard(manualInfo.tng_number, 'tng')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedKey === 'tng' ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Input Mode Tabs for Receipt Verification */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Proof of Payment *</label>
                <Tabs value={receiptMode} onValueChange={(v) => setReceiptMode(v as 'link' | 'upload')}>
                  <TabsList className="grid w-full grid-cols-2 h-8 text-xs">
                    <TabsTrigger value="link" className="gap-1 text-[11px]">
                      <FileText className="size-3" /> Paste receipt link
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="gap-1 text-[11px]">
                      <Upload className="size-3" /> Upload screenshot
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="link" className="space-y-1.5 pt-2">
                    <Input
                      placeholder="e.g. https://telebirr.et/..., https://cbe.et/..., or reference code"
                      value={pastedUrl}
                      onChange={(e) => setPastedUrl(e.target.value)}
                      className="h-11 text-base sm:text-sm font-mono rounded-xl"
                    />
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      Supported: Telebirr, CBE, Zemen, Bank of Abyssinia, Awash Bank URLs & reference numbers.
                    </p>
                  </TabsContent>

                  <TabsContent value="upload" className="space-y-2 pt-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploading}
                        onChange={(e) => handleFileUpload(e.target.files)}
                        className="h-11 text-base sm:text-sm rounded-xl"
                      />
                    </div>
                    {uploading && <p className="text-xs text-muted-foreground">Uploading screenshot...</p>}
                    {fileName && (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                        <FileCheck className="size-3.5" /> Attached: {fileName}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Additional Note (Optional)</label>
                <Textarea
                  placeholder="e.g. Transferred via CBE Birr at 2:15 PM"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="text-base sm:text-sm rounded-xl p-3"
                />
              </div>

              <Button
                onClick={handleManualSubmit}
                disabled={submitting || checking || uploading || (receiptMode === 'link' ? !pastedUrl.trim() : !receiptUrl)}
                className="w-full h-11 min-h-[44px] rounded-xl font-semibold gap-2"
              >
                {checking ? (
                  <>
                    <Clock className="size-4 animate-spin" /> Checking receipt...
                  </>
                ) : (
                  'Submit for Review'
                )}
              </Button>

            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
