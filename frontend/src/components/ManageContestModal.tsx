import { useState } from 'react'
import { Eye, EyeOff, Pause, Play, Trash2, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api'

export interface ManageContestData {
  id: number
  join_code: string
  title: string
  creator_id: number
  is_active: boolean
  is_paused: boolean
  is_hidden: boolean
  is_deleted: boolean
  status: 'active' | 'ended'
  rating_count: number
  contestant_count: number
}

interface ManageContestModalProps {
  contest: ManageContestData
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
}

export function ManageContestModal({
  contest,
  open,
  onOpenChange,
  onUpdated,
}: ManageContestModalProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleTogglePause() {
    setLoadingAction('pause')
    try {
      await api(`/contests/${contest.join_code}/pause`, { method: 'PATCH' })
      toast.success(
        contest.is_paused
          ? 'Contest resumed! Voting and entries are now active.'
          : 'Contest paused! Voting and new entries are temporarily suspended.'
      )
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to toggle pause')
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleToggleHide() {
    setLoadingAction('hide')
    try {
      await api(`/contests/${contest.join_code}/hide`, { method: 'PATCH' })
      toast.success(
        contest.is_hidden
          ? 'Contest is now visible in explore and public search.'
          : 'Contest is now hidden from public explore. Accessible only with direct link/code.'
      )
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to toggle visibility')
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleDeleteContest() {
    setLoadingAction('delete')
    try {
      await api(`/contests/${contest.join_code}`, { method: 'DELETE' })
      toast.success('Contest deleted. It will remain preserved in your & participants\' history.')
      setConfirmDelete(false)
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete contest')
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleRestoreContest() {
    setLoadingAction('restore')
    try {
      await api(`/contests/${contest.join_code}/restore`, { method: 'POST' })
      toast.success('Contest restored successfully!')
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to restore contest')
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setConfirmDelete(false)
      onOpenChange(val)
    }}>
      <DialogContent className="max-w-md rounded-2xl sm:rounded-3xl p-6">
        <DialogHeader className="text-left space-y-1">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-xl font-bold">Contest Settings</DialogTitle>
            <div className="flex items-center gap-1.5">
              {contest.is_deleted ? (
                <Badge variant="destructive" className="text-xs">Deleted</Badge>
              ) : contest.is_paused ? (
                <Badge className="bg-amber-500 text-white text-xs hover:bg-amber-500">Paused</Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-500">Active</Badge>
              )}
              {contest.is_hidden && (
                <Badge variant="secondary" className="text-xs">Hidden</Badge>
              )}
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Manage operational state for <span className="font-semibold text-foreground">{contest.title}</span> ({contest.join_code}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Pause / Resume Control */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-muted/60 border border-border/60">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-semibold text-sm">
                {contest.is_paused ? <Play className="size-4 text-emerald-500" /> : <Pause className="size-4 text-amber-500" />}
                <span>{contest.is_paused ? 'Resume Voting' : 'Pause Contest'}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {contest.is_paused
                  ? 'Re-enable ratings and new contestant entries.'
                  : 'Temporarily freeze ratings and new joins without losing any data.'}
              </p>
            </div>
            <Button
              variant={contest.is_paused ? 'default' : 'outline'}
              size="sm"
              disabled={contest.is_deleted || loadingAction === 'pause'}
              onClick={handleTogglePause}
              className="shrink-0 rounded-xl font-semibold h-9"
            >
              {contest.is_paused ? 'Resume' : 'Pause'}
            </Button>
          </div>

          {/* Hide / Unhide Control */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-muted/60 border border-border/60">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-semibold text-sm">
                {contest.is_hidden ? <Eye className="size-4 text-primary" /> : <EyeOff className="size-4 text-muted-foreground" />}
                <span>{contest.is_hidden ? 'Make Visible' : 'Hide from Explore'}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {contest.is_hidden
                  ? 'Contest will show in public landing and explore lists.'
                  : 'Unlist from public explore. Only accessible via join code.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={contest.is_deleted || loadingAction === 'hide'}
              onClick={handleToggleHide}
              className="shrink-0 rounded-xl font-semibold h-9"
            >
              {contest.is_hidden ? 'Unhide' : 'Hide'}
            </Button>
          </div>

          {/* Delete / Archive Control */}
          <div className="p-3.5 rounded-2xl bg-destructive/5 border border-destructive/20 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-sm text-destructive">
                  {contest.is_deleted ? 'Contest is Deleted (Archived)' : 'Delete Contest'}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {contest.is_deleted
                    ? 'This contest has been soft-deleted. All participant scores, distribution curves, and ranks remain safely preserved in the Contest History.'
                    : 'Deleting closes the contest and unlists it. All participant data and scores will still appear in History.'}
                </p>
              </div>
            </div>

            {contest.is_deleted ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestoreContest}
                disabled={loadingAction === 'restore'}
                className="w-full rounded-xl border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold gap-2"
              >
                <RotateCcw className="size-4" />
                Restore Contest
              </Button>
            ) : confirmDelete ? (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteContest}
                  disabled={loadingAction === 'delete'}
                  className="flex-1 rounded-xl font-semibold"
                >
                  Confirm Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="w-full rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 font-semibold gap-2"
              >
                <Trash2 className="size-4" />
                Delete Contest
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
            <span>Contest History is permanently preserved for all {contest.contestant_count} participants and {contest.rating_count} voters.</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
