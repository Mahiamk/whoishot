import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'

type ContestStatus = 'active' | 'ended'

interface CountdownProps {
  endsAt: string
  status: ContestStatus
  className?: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatRemaining(diffMs: number): { label: string; tier: 'normal' | 'amber' | 'red' } {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (diffMs < 60 * 60 * 1000) {
    return { label: `Ends in ${minutes}m ${pad(seconds)}s`, tier: 'red' }
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    return { label: `Ends in ${hours}h ${pad(minutes)}m`, tier: 'amber' }
  }
  return { label: `Ends in ${days}d ${hours}h ${pad(minutes)}m`, tier: 'normal' }
}

const TIER_CLASS: Record<string, string> = {
  normal: 'text-muted-foreground',
  amber: 'text-amber-500',
  red: 'text-destructive',
}

/** Reusable live countdown. Ticks every second while active; frozen once
 * the contest has ended. Color shifts amber under 24h, red under 1h. */
export function Countdown({ endsAt, status, className = '' }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (status === 'ended') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [status])

  if (status === 'ended') {
    return (
      <span className={`text-sm font-medium text-muted-foreground ${className}`}>
        Ended
      </span>
    )
  }

  const diffMs = new Date(endsAt).getTime() - now
  if (diffMs <= 0) {
    return (
      <span className={`text-sm font-medium text-destructive ${className}`}>
        Ending…
      </span>
    )
  }

  const { label, tier } = formatRemaining(diffMs)
  return (
    <span className={`text-sm font-medium tabular-nums ${TIER_CLASS[tier]} ${className}`}>
      {label}
    </span>
  )
}

/** Static "Ends in Xd" Badge for showcase cards — no ticking, just a
 * subtle glance at how much runway a contest has left. */
export function CountdownBadge({ endsAt, status }: CountdownProps) {
  if (status === 'ended') {
    return <Badge variant="secondary">Ended</Badge>
  }
  const diffMs = new Date(endsAt).getTime() - Date.now()
  if (diffMs <= 0) {
    return <Badge variant="secondary">Ending soon</Badge>
  }
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const label = days >= 1 ? `Ends in ${days}d` : 'Ends today'
  const urgent = diffMs < 24 * 60 * 60 * 1000
  return (
    <Badge
      variant="outline"
      className={urgent ? 'border-amber-500 text-amber-500' : 'text-muted-foreground'}
    >
      {label}
    </Badge>
  )
}
