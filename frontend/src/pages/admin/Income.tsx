import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, Filter, Globe, TrendingUp, Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'

interface CountryIncomeBreakdown {
  country_code: string
  currency: string
  amount_cents: number
  amount_formatted: string
  converted_myr_cents: number
  converted_myr_formatted: string
}

interface IncomeSummary {
  total_income_cents: number
  subscriptions_income_cents: number
  entries_income_cents: number
  manual_income_cents: number
  online_income_cents: number
  income_by_country: CountryIncomeBreakdown[]
  converted_total_myr_cents: number
  converted_total_myr_formatted: string
  converted_total_usd_cents: number
  converted_total_usd_formatted: string
}

interface IncomeItem {
  id: number
  type: 'subscription' | 'entry_fee'
  user_id: number
  user_name: string
  user_email: string
  user_country: string
  provider_ref: string
  amount_cents: number
  currency: string
  converted_myr_cents: number
  converted_myr_formatted: string
  method: string
  payment_status: string
  received_at: string
  approved_by_email: string | null
}

interface IncomeResponse {
  summary: IncomeSummary
  items: IncomeItem[]
}

const COUNTRY_FLAGS: Record<string, { flag: string; name: string }> = {
  MY: { flag: '🇲🇾', name: 'Malaysia' },
  ET: { flag: '🇪🇹', name: 'Ethiopia' },
  US: { flag: '🇺🇸', name: 'United States' },
}

export default function AdminIncome() {
  const [selectedCountry, setSelectedCountry] = useState<string>('all')

  const { data: incomeData, isLoading } = useQuery({
    queryKey: ['admin-income', selectedCountry],
    queryFn: () => api<IncomeResponse>(`/admin/income${selectedCountry !== 'all' ? `?country=${selectedCountry}` : ''}`),
  })

  return (
    <div className="space-y-4">
      {/* Header & Modern Filter Dropdown */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Total Income & Regional Breakdown</h1>
          <p className="text-xs text-muted-foreground">
            Platform revenue overview and regional distribution.
          </p>
        </div>

        {/* Modern Glassmorphic Filter Dropdown */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
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

      {isLoading ? (
        <div className="grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : incomeData ? (
        <>
          {/* Top Converted Revenue Overview Cards */}
          <div className="grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-4">
            <Card className="rounded-lg border border-primary/40 bg-gradient-to-br from-primary/10 via-background to-background p-2.5 sm:p-3 shadow-2xs hover:border-primary/60 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-0.5 p-0">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-primary">Unified Total (MYR)</CardTitle>
                <TrendingUp className="size-3.5 text-primary" />
              </CardHeader>
              <CardContent className="p-0 pt-1">
                <div className="text-base sm:text-lg font-extrabold text-primary tracking-tight">
                  {incomeData.summary.converted_total_myr_formatted}
                </div>
                <p className="text-[10px] text-muted-foreground font-medium">
                  ≈ {incomeData.summary.converted_total_usd_formatted} USD
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-lg border border-border/50 bg-card p-2.5 sm:p-3 hover:border-border transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-0.5 p-0">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Social Subscriptions</CardTitle>
                <Wallet className="size-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-0 pt-1">
                <div className="text-base sm:text-lg font-bold tracking-tight">
                  RM {(incomeData.summary.subscriptions_income_cents / 100).toFixed(2)}
                </div>
                <p className="text-[10px] text-muted-foreground">Unlock plan sales</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg border border-border/50 bg-card p-2.5 sm:p-3 hover:border-border transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-0.5 p-0">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contest Entry Fees</CardTitle>
                <DollarSign className="size-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-0 pt-1">
                <div className="text-base sm:text-lg font-bold tracking-tight">
                  RM {(incomeData.summary.entries_income_cents / 100).toFixed(2)}
                </div>
                <p className="text-[10px] text-muted-foreground">Paid entry fees</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg border border-border/50 bg-card p-2.5 sm:p-3 hover:border-border transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-0.5 p-0">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Manual / Online</CardTitle>
                <Globe className="size-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-0 pt-1">
                <div className="text-sm sm:text-base font-bold tracking-tight">
                  RM {(incomeData.summary.manual_income_cents / 100).toFixed(2)} / RM {(incomeData.summary.online_income_cents / 100).toFixed(2)}
                </div>
                <p className="text-[10px] text-muted-foreground">Bank transfer vs Gateway</p>
              </CardContent>
            </Card>
          </div>

          {/* Income Breakdown by Country Cards */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <Globe className="size-3 text-primary" /> Regional Cards
            </h2>
            <div className="grid gap-2.5 sm:gap-3 grid-cols-1 sm:grid-cols-3">
              {incomeData.summary.income_by_country.length === 0 ? (
                <Card className="col-span-full rounded-lg p-3 text-center text-xs text-muted-foreground border-dashed">
                  No regional payments logged yet.
                </Card>
              ) : (
                incomeData.summary.income_by_country
                  .filter((c) => selectedCountry === 'all' || c.country_code.toUpperCase() === selectedCountry.toUpperCase())
                  .map((c) => {
                    const meta = COUNTRY_FLAGS[c.country_code.toUpperCase()] || { flag: '🌐', name: c.country_code }
                    return (
                      <Card key={c.country_code} className="rounded-lg border border-border/50 bg-card p-2.5 hover:border-border transition-colors">
                        <div className="flex items-center justify-between pb-1 border-b border-border/30">
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg">{meta.flag}</span>
                            <span className="text-xs font-bold">{meta.name}</span>
                          </div>
                          <Badge variant="outline" className="font-mono text-[9px] uppercase px-1 py-0 rounded-sm">
                            {c.currency}
                          </Badge>
                        </div>
                        <div className="pt-1.5 space-y-0">
                          <div className="text-base font-extrabold text-foreground tracking-tight">
                            {c.amount_formatted}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-medium">
                            ≈ Converted: <span className="font-bold text-primary">{c.converted_myr_formatted}</span>
                          </div>
                        </div>
                      </Card>
                    )
                  })
              )}
            </div>
          </div>

          {/* Itemized Income Ledger Table */}
          <Card className="rounded-lg border border-border/50">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-sm font-bold">Income Ledger & Currency Details</CardTitle>
              <CardDescription className="text-xs">
                All confirmed transactions with original native amounts and converted totals.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-4 sm:pt-0">
              {incomeData.items.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No income records found for this selection.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border/30 sm:border-none">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="h-8 text-[11px] py-1">Date</TableHead>
                        <TableHead className="h-8 text-[11px] py-1">User / Region</TableHead>
                        <TableHead className="h-8 text-[11px] py-1">Category</TableHead>
                        <TableHead className="h-8 text-[11px] py-1">Reference</TableHead>
                        <TableHead className="h-8 text-[11px] py-1">Channel</TableHead>
                        <TableHead className="h-8 text-[11px] py-1">Native Amount</TableHead>
                        <TableHead className="h-8 text-[11px] py-1">Converted (MYR)</TableHead>
                        <TableHead className="h-8 text-[11px] py-1">Approved By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incomeData.items.map((item) => {
                        const meta = COUNTRY_FLAGS[item.user_country?.toUpperCase()] || { flag: '🌐', name: item.user_country }
                        return (
                          <TableRow key={`${item.type}-${item.id}`} className="hover:bg-muted/10">
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-1.5">
                              {new Date(item.received_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="font-medium text-xs flex items-center gap-1">
                                <span>{meta.flag}</span>
                                <span>{item.user_name}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">{item.user_email}</div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Badge variant="outline" className="capitalize text-[9px] px-1 py-0 rounded-sm">
                                {item.type === 'subscription' ? 'Social Subscription' : 'Entry Fee'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs py-1.5">{item.provider_ref}</TableCell>
                            <TableCell className="py-1.5">
                              <Badge
                                className={`text-[9px] px-1 py-0 rounded-sm ${
                                  item.method === 'manual'
                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                    : 'bg-primary/10 text-primary border-primary/30'
                                }`}
                              >
                                {item.method === 'manual' ? 'Bank Transfer' : 'Online Gateway'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-bold text-xs py-1.5">
                              {item.currency === 'ETB'
                                ? `${(item.amount_cents / 100).toFixed(2)} ETB`
                                : item.currency === 'USD'
                                ? `$${(item.amount_cents / 100).toFixed(2)}`
                                : `RM ${(item.amount_cents / 100).toFixed(2)}`}
                            </TableCell>
                            <TableCell className="font-bold text-xs text-green-600 py-1.5">
                              {item.converted_myr_formatted}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground py-1.5">
                              {item.approved_by_email ?? 'Webhook / Auto'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
