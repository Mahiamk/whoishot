import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CountdownBadge } from '@/components/Countdown'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { bracketColor } from '@/lib/brackets'

export interface ShowcaseEntryData {
  is_demo: boolean
  gender_category: 'F' | 'M'
  name: string | null
  photo_url: string | null
  blurred_thumb_url: string | null
  score: number | null
}

interface ContestTiming {
  endsAt: string
  status: 'active' | 'ended'
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Real (non-demo) contestants: photo is already blurred server-side, and
// the API never sends their real name — clicking prompts sign-in instead
// of revealing anything.
function LockedCard({
  entry,
  timing,
}: {
  entry: ShowcaseEntryData
  timing?: ContestTiming
}) {
  const [open, setOpen] = useState(false)
  const color = bracketColor(entry.gender_category)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group block w-full text-left">
        <Card className="gap-0 overflow-hidden rounded-2xl p-0 transition-colors group-hover:border-primary">
          <div className="relative aspect-4/5 w-full overflow-hidden bg-muted">
            {entry.blurred_thumb_url ? (
              <img
                src={entry.blurred_thumb_url}
                alt=""
                aria-hidden="true"
                className="h-full w-full scale-110 object-cover"
              />
            ) : (
              <div
                className="h-full w-full opacity-60"
                style={{ backgroundColor: color }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/35">
              <Lock className="size-6 text-white" />
            </div>
            {timing && (
              <div className="absolute top-2 left-2">
                <CountdownBadge endsAt={timing.endsAt} status={timing.status} />
              </div>
            )}
          </div>
          <CardContent className="flex items-center justify-between gap-1.5 bg-muted px-2.5 sm:px-3 py-3">
            <span className="text-xs sm:text-sm text-muted-foreground truncate">Sign in to view</span>
            {entry.score != null && (
              <Badge variant="secondary" className="shrink-0 text-[10px] sm:text-xs">
                {entry.score.toFixed(2)}
              </Badge>
            )}
          </CardContent>
        </Card>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="text-center sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Log in to see who's competing</DialogTitle>
            <DialogDescription>
              Contestant photos and names are only visible to signed-in
              members.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center pt-2">
            <Button asChild className="h-11 min-h-[44px] rounded-xl font-semibold">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 min-h-[44px] rounded-xl font-semibold">
              <Link to="/register">Register</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}

function DemoCard({
  entry,
  timing,
}: {
  entry: ShowcaseEntryData
  timing?: ContestTiming
}) {
  const color = bracketColor(entry.gender_category)

  return (
    <Card className="gap-0 overflow-hidden rounded-2xl p-0">
      <div className="relative aspect-4/5 w-full overflow-hidden bg-muted">
        {entry.photo_url ? (
          <img
            src={entry.photo_url}
            alt={entry.name ?? ''}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {entry.name ? initials(entry.name) : '?'}
          </div>
        )}
        <Badge className="absolute top-2 left-2 border-0 bg-black/70 text-white">
          Demo
        </Badge>
        {timing && (
          <div className="absolute top-2 right-2">
            <CountdownBadge endsAt={timing.endsAt} status={timing.status} />
          </div>
        )}
      </div>
      <CardContent className="bg-muted px-3 py-3">
        <p className="truncate font-medium text-foreground">{entry.name}</p>
      </CardContent>
    </Card>
  )
}

export function ShowcaseCard({
  entry,
  timing,
}: {
  entry: ShowcaseEntryData
  timing?: ContestTiming
}) {
  return entry.is_demo ? (
    <DemoCard entry={entry} timing={timing} />
  ) : (
    <LockedCard entry={entry} timing={timing} />
  )
}
