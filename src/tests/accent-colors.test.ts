import { describe, expect, it } from 'vitest'
import { deriveAccentColors, normalizeHexColor } from '@/core/notation'

describe('accent colors', () => {
  it('normalizes optional hash and derives stable companion colors', () => {
    expect(normalizeHexColor('4f46e5')).toBe('#4F46E5')
    expect(deriveAccentColors('#4F46E5')).toEqual({
      primary: '#4F46E5',
      secondary: '#3C35AE',
      tertiary: '#DFDEFA',
      container: '#F4F4FD',
      foreground: '#111827',
    })
  })

  it('rejects invalid values', () => {
    expect(normalizeHexColor('#xyz')).toBeUndefined()
  })
})
