import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Flag, Trophy, UserCheck, Users, Vote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { bracketColor } from '@/lib/brackets'
import type { AdminMetrics } from './types'

function GenderBadges({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="flex gap-1 pt-0.5">
      {(['F', 'M'] as const).map((g) => (
        <Badge
          key={g}
          className="text-[9px] px-1 py-0 font-normal rounded-md"
          style={{ backgroundColor: bracketColor(g), color: 'white' }}
        >
          {counts[g] ?? 0} {g}
        </Badge>
      ))}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  extra,
  alert,
}: {
  icon: React.ElementType
  label: string
  value: number
  extra?: React.ReactNode
  alert?: boolean
}) {
  return (
    <Card className={`rounded-lg border transition-all duration-150 p-2.5 sm:p-3 ${alert ? 'border-destructive/60 bg-destructive/5' : 'border-border/50 bg-card hover:border-border'}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 p-0 pb-1">
        <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={`size-3.5 ${alert ? 'text-destructive' : 'text-primary/70'}`} />
      </CardHeader>
      <CardContent className="p-0 space-y-0.5">
        <p className={`text-base sm:text-lg font-extrabold tracking-tight ${alert ? 'text-destructive' : 'text-foreground'}`}>
          {value}
        </p>
        {extra}
      </CardContent>
    </Card>
  )
}

export default function Overview() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: () => api<AdminMetrics>('/admin/metrics'),
  })

  if (isLoading) {
    return (
      <div className="grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card className="rounded-lg border-dashed">
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          Could not load metrics. Try refreshing the page.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">Overview</h1>
        <p className="text-xs text-muted-foreground">System metrics & platform health.</p>
      </div>

      <div className="grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3">
        <MetricCard icon={Users} label="Total users" value={data.users_total}
          extra={<GenderBadges counts={data.users_by_gender} />} />
        <MetricCard icon={Trophy} label="Active contests" value={data.active_contests} />
        <MetricCard icon={UserCheck} label="Contestants" value={
          Object.values(data.contestants_by_gender).reduce((a, b) => a + b, 0)
        } extra={<GenderBadges counts={data.contestants_by_gender} />} />
        <MetricCard icon={Vote} label="Ratings cast" value={data.ratings_total} />
        <MetricCard
          icon={data.open_reports > 0 ? AlertTriangle : Flag}
          label="Open reports"
          value={data.open_reports}
          alert={data.open_reports > 0}
          extra={
            data.open_reports > 0 ? (
              <p className="text-[10px] font-medium text-destructive">Needs review</p>
            ) : (
              <p className="text-[10px] text-muted-foreground">All clear</p>
            )
          }
        />
      </div>
    </div>
  )
}
