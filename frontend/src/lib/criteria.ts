export interface ContestCriterion {
  id?: number
  contest_id?: number
  key?: string
  label: string
  emoji?: string | null
  sort_order?: number
}

export const DEFAULT_CRITERIA_SUGGESTIONS: ContestCriterion[] = [
  { key: 'looks', label: 'Looks', emoji: '👀', sort_order: 0 },
  { key: 'style', label: 'Style', emoji: '💅', sort_order: 1 },
  { key: 'kindness', label: 'Kindness', emoji: '💛', sort_order: 2 },
  { key: 'intelligence', label: 'Intelligence', emoji: '🧠', sort_order: 3 },
  { key: 'humor', label: 'Humor', emoji: '😂', sort_order: 4 },
  { key: 'confidence', label: 'Confidence', emoji: '😎', sort_order: 5 },
  { key: 'creativity', label: 'Creativity', emoji: '🎨', sort_order: 6 },
  { key: 'friendliness', label: 'Friendliness', emoji: '😊', sort_order: 7 },
  { key: 'talent', label: 'Talent', emoji: '⭐', sort_order: 8 },
  { key: 'vibe', label: 'Vibe', emoji: '✨', sort_order: 9 },
]

export const SEED_DEFAULT_CRITERIA = DEFAULT_CRITERIA_SUGGESTIONS
