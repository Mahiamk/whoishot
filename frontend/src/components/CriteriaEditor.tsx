import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react'
import { DEFAULT_CRITERIA_SUGGESTIONS, type ContestCriterion } from '@/lib/criteria'

interface CriteriaEditorProps {
  value: ContestCriterion[]
  onChange: (criteria: ContestCriterion[]) => void
  isLocked?: boolean
  onSave?: () => Promise<void>
  isSaving?: boolean
}

const COMMON_EMOJIS = ['✨', '👀', '💅', '💛', '🧠', '😂', '😎', '🎨', '😊', '⭐', '🔥', '👑', '💯', '🚀', '🎯', '⚡', '🏆', '💎', '🎵', '💪']

export function CriteriaEditor({
  value,
  onChange,
  isLocked = false,
  onSave,
  isSaving = false,
}: CriteriaEditorProps) {
  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState('✨')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const activeCount = value.length
  const isTooFew = activeCount < 3
  const isTooMany = activeCount > 15

  const isDefaultChecked = (defaultKey: string) => {
    return value.some((c) => c.key === defaultKey || c.label.toLowerCase() === defaultKey.toLowerCase())
  }

  const toggleDefault = (defaultItem: ContestCriterion) => {
    if (isLocked) return
    setErrorMsg(null)
    const exists = isDefaultChecked(defaultItem.key!)
    if (exists) {
      if (value.length <= 3) {
        setErrorMsg('At least 3 criteria are required.')
        return
      }
      onChange(value.filter((c) => c.key !== defaultItem.key && c.label.toLowerCase() !== defaultItem.label.toLowerCase()))
    } else {
      if (value.length >= 15) {
        setErrorMsg('Maximum 15 criteria allowed.')
        return
      }
      onChange([...value, defaultItem])
    }
  }

  const addCustomCriterion = () => {
    if (isLocked) return
    setErrorMsg(null)
    const trimmed = newLabel.trim()
    if (!trimmed) {
      setErrorMsg('Criterion label cannot be empty.')
      return
    }
    if (trimmed.length > 30) {
      setErrorMsg('Criterion label cannot exceed 30 characters.')
      return
    }
    if (value.length >= 15) {
      setErrorMsg('Maximum 15 criteria allowed.')
      return
    }
    if (value.some((c) => c.label.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg('A criterion with this label already exists.')
      return
    }

    const newCriterion: ContestCriterion = {
      label: trimmed,
      emoji: newEmoji,
      sort_order: value.length,
    }

    onChange([...value, newCriterion])
    setNewLabel('')
    setShowEmojiPicker(false)
  }

  const removeCriterion = (index: number) => {
    if (isLocked) return
    setErrorMsg(null)
    if (value.length <= 3) {
      setErrorMsg('At least 3 criteria are required.')
      return
    }
    const updated = value.filter((_, i) => i !== index)
    onChange(updated)
  }

  const moveCriterion = (index: number, direction: 'up' | 'down') => {
    if (isLocked) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= value.length) return

    const updated = [...value]
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp

    // Update sort_orders
    const reordered = updated.map((item, i) => ({ ...item, sort_order: i }))
    onChange(reordered)
  }

  return (
    <div className="space-y-4">
      {/* Banner if Locked */}
      {isLocked && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-medium">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Criteria are locked once voting starts</span>
        </div>
      )}

      {/* Header & Counter */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-sm text-foreground">Contest Criteria</h4>
          <p className="text-xs text-muted-foreground">Select or create between 3 and 15 criteria for rating.</p>
        </div>
        <Badge
          variant={isTooFew || isTooMany ? 'destructive' : 'outline'}
          className="text-xs font-mono px-2 py-0.5"
        >
          {activeCount}/15 criteria
        </Badge>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* List of active criteria */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {value.map((crit, idx) => (
          <div
            key={crit.key || crit.label || idx}
            className="flex items-center justify-between p-2.5 rounded-lg border bg-card/50 text-sm gap-2 transition-all hover:bg-card"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-lg leading-none select-none">{crit.emoji || '✨'}</span>
              <span className="font-medium text-foreground truncate">{crit.label}</span>
            </div>

            {!isLocked && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  disabled={idx === 0}
                  onClick={() => moveCriterion(idx, 'up')}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  disabled={idx === value.length - 1}
                  onClick={() => moveCriterion(idx, 'down')}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeCriterion(idx)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isLocked && (
        <>
          {/* Add custom criterion row */}
          <div className="pt-2 border-t space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Add Custom Criterion</span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 text-lg shrink-0"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  {newEmoji}
                </Button>
                {showEmojiPicker && (
                  <div className="absolute left-0 bottom-11 z-50 p-2 bg-popover border rounded-md shadow-lg grid grid-cols-5 gap-1 w-48">
                    {COMMON_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="h-8 w-8 rounded hover:bg-muted text-lg flex items-center justify-center"
                        onClick={() => {
                          setNewEmoji(emoji)
                          setShowEmojiPicker(false)
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Input
                type="text"
                placeholder="Criterion label (max 30 chars)"
                maxLength={30}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomCriterion()
                  }
                }}
                className="h-9 text-sm"
              />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 gap-1 shrink-0"
                onClick={addCustomCriterion}
                disabled={!newLabel.trim() || activeCount >= 15}
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </Button>
            </div>
          </div>

          {/* Quick Suggestions Toggle List */}
          <div className="pt-2 border-t space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Default Templates</span>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_CRITERIA_SUGGESTIONS.map((item) => {
                const isChecked = isDefaultChecked(item.key!)
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleDefault(item)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      isChecked
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/20'
                    }`}
                  >
                    <span>{item.emoji}</span>
                    <span>{item.label}</span>
                    <span className="text-[10px] ml-0.5">{isChecked ? '✓' : '+'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Save button if in settings mode */}
      {onSave && !isLocked && (
        <div className="pt-2 flex justify-end">
          <Button
            type="button"
            onClick={onSave}
            disabled={isSaving || isTooFew || isTooMany}
            size="sm"
          >
            {isSaving ? 'Saving...' : 'Save Criteria'}
          </Button>
        </div>
      )}
    </div>
  )
}
