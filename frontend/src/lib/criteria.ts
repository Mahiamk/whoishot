export const CRITERIA = [
  'looks',
  'style',
  'kindness',
  'intelligence',
  'humor',
  'confidence',
  'creativity',
  'friendliness',
  'talent',
  'vibe',
] as const

export type Criterion = (typeof CRITERIA)[number]
