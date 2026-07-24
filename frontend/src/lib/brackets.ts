export const FEMALE = '#FF5CA8'
export const MALE = '#38B6E8'
// Neutral color for the "General" (combined, gender-agnostic) view —
// matches the app's olive-sage primary.
export const GENERAL = '#8E9861'

export function bracketColor(gender: 'F' | 'M'): string {
  return gender === 'F' ? FEMALE : MALE
}
