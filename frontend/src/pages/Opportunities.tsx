import { useState } from 'react'
import { Sparkles, Building2, ShieldCheck, UserCheck, Send, CheckCircle2, Glasses, Shirt, Award } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api'

export default function Opportunities() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [inquiryType, setInquiryType] = useState<'modeling_school' | 'fashion_show' | 'stylist' | 'other'>('modeling_school')
  const [interestedIn, setInterestedIn] = useState('')
  const [message, setMessage] = useState('')
  const [websiteHp, setWebsiteHp] = useState('') // Anti-spam honeypot

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim() || !contactName.trim() || !email.trim() || !message.trim()) {
      toast.error('Please fill in all required fields.')
      return
    }

    setSubmitting(true)
    try {
      await api('/partner-inquiries', {
        method: 'POST',
        body: JSON.stringify({
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          inquiry_type: inquiryType,
          interested_in: interestedIn.trim() || null,
          message: message.trim(),
          website_hp: websiteHp.trim() || null,
        }),
      })

      setSubmitted(true)
      toast.success('Inquiry submitted successfully!')
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message)
      } else {
        toast.error('Failed to submit inquiry. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-primary/5 via-background to-background py-16 sm:py-24">
        <div className="container max-w-5xl mx-auto px-4 text-center">
          <Badge variant="outline" className="mb-4 inline-flex items-center gap-1.5 border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            Beyond the Leaderboard
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">
            Real Opportunities, Honest Connections
          </h1>
          <p className="max-w-2xl mx-auto text-muted-foreground text-base sm:text-lg leading-relaxed mb-8">
            WhoIsHot is about fun, friendly contest competition first. But for contestants interested in modeling, styling, or fashion, we bridge the gap with verified modeling schools, fashion shows, and stylists — with your consent guaranteed at every single step.

          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-500" />
              100% Optional Opt-In
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              Verified Agencies Only
            </span>
            <span className="flex items-center gap-1.5">
              <UserCheck className="size-4 text-amber-500" />
              Zero Automatic Data Sharing
            </span>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="container max-w-5xl mx-auto px-4 py-12 sm:py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">How It Works for Contestants</h2>
          <p className="text-sm text-muted-foreground mt-1">Simple 3-step privacy-first discovery process</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="relative rounded-2xl border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:border-primary/40 transition-colors">
            <CardHeader className="space-y-3 pb-3">
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                1
              </div>
              <CardTitle className="text-lg font-bold">Explicit Opt-In</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When editing your contest profile, toggle on <strong>"Partner Opportunities Opt-in"</strong>. It is off by default and winning a contest never auto-enables it.
              </p>
            </CardContent>
          </Card>

          <Card className="relative rounded-2xl border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:border-primary/40 transition-colors">
            <CardHeader className="space-y-3 pb-3">
              <div className="size-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-lg">
                2
              </div>
              <CardTitle className="text-lg font-bold">Get Discovered</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Legitimate modeling schools, fashion show scouts, and stylists submit inquiry proposals to WhoIsHot requesting talent introductions.
              </p>
            </CardContent>
          </Card>

          <Card className="relative rounded-2xl border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:border-primary/40 transition-colors">
            <CardHeader className="space-y-3 pb-3">
              <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-lg">
                3
              </div>
              <CardTitle className="text-lg font-bold">You Consent First</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You receive a private introduction proposal on your dashboard. If you accept, WhoIsHot facilitates the connection manually. No contact info is ever auto-released.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Partner Inquiry Form Section */}
      <section className="container max-w-3xl mx-auto px-4 pt-8">
        <Card className="rounded-3xl border-border/70 shadow-lg bg-card overflow-hidden">
          <div className="bg-gradient-to-r from-primary/10 via-amber-500/10 to-primary/5 p-6 sm:p-8 border-b border-border/50">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                <Building2 className="size-6" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Are you a modeling school, fashion show, or stylist?</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Connect with opted-in student talent across our contest brackets.
                </p>
              </div>
            </div>
          </div>

          <CardContent className="p-6 sm:p-8">
            {submitted ? (
              <div className="text-center py-10 space-y-4">
                <div className="size-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="size-10" />
                </div>
                <h3 className="text-2xl font-bold">Inquiry Received!</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Thank you for reaching out. The WhoIsHot team will review your organization's proposal and get back to you shortly.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSubmitted(false)
                    setCompanyName('')
                    setContactName('')
                    setEmail('')
                    setPhone('')
                    setInterestedIn('')
                    setMessage('')
                  }}
                  className="mt-4"
                >
                  Submit Another Inquiry
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Honeypot field - Anti-spam */}
                <input
                  type="text"
                  name="website_hp"
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                  value={websiteHp}
                  onChange={(e) => setWebsiteHp(e.target.value)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName" className="text-sm font-medium">Company / Organization Name *</Label>
                    <Input
                      id="companyName"
                      placeholder="e.g. NextGen Model Academy"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                      className="h-11 text-base sm:text-sm rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contactName" className="text-sm font-medium">Contact Person Name *</Label>
                    <Input
                      id="contactName"
                      placeholder="e.g. Sarah Connor"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      required
                      className="h-11 text-base sm:text-sm rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium">Official Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="e.g. sarah@agency.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 text-base sm:text-sm rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium">Phone Number (Optional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="e.g. +60123456789"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-11 text-base sm:text-sm rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="inquiryType" className="text-sm font-medium">Organization / Opportunity Type *</Label>
                  <Select value={inquiryType} onValueChange={(val: any) => setInquiryType(val)}>
                    <SelectTrigger id="inquiryType" className="h-11 text-base sm:text-sm rounded-xl">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="modeling_school">
                        <span className="flex items-center gap-2">
                          <Award className="size-4 text-primary" /> Modeling School / Academy
                        </span>
                      </SelectItem>
                      <SelectItem value="fashion_show">
                        <span className="flex items-center gap-2">
                          <Shirt className="size-4 text-amber-500" /> Fashion Show / Runway Organizer
                        </span>
                      </SelectItem>
                      <SelectItem value="stylist">
                        <span className="flex items-center gap-2">
                          <Glasses className="size-4 text-emerald-500" /> Stylist / Wardrobe Designer
                        </span>
                      </SelectItem>
                      <SelectItem value="other">
                        <span className="flex items-center gap-2">
                          <Building2 className="size-4 text-muted-foreground" /> Other Agency / Partner
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="interestedIn" className="text-sm font-medium">What profiles or criteria are you looking for? (Optional)</Label>
                  <Input
                    id="interestedIn"
                    placeholder="e.g. Female contestants in Sunway contest, interested in commercial modeling"
                    value={interestedIn}
                    onChange={(e) => setInterestedIn(e.target.value)}
                    className="h-11 text-base sm:text-sm rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="message" className="text-sm font-medium">Opportunity Details & Message *</Label>
                  <Textarea
                    id="message"
                    rows={4}
                    placeholder="Describe your organization and what opportunities you offer..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    className="text-base sm:text-sm rounded-xl p-3"
                  />
                </div>

                <Button type="submit" disabled={submitting} className="w-full h-11 min-h-[44px] text-sm font-semibold rounded-xl gap-2 mt-2">
                  {submitting ? 'Submitting...' : 'Submit Inquiry'}
                  <Send className="size-4" />
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  WhoIsHot reviews all partner inquiries to ensure safety and authenticity before introducing any contestants.
                </p>

              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
