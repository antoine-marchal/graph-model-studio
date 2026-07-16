import { describe, expect, it, vi } from 'vitest'
import { createElementId } from '@/core/model'

describe('createElementId', () => {
  it('uses two normalized type characters and four random characters', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(createElementId('businessActor')).toBe('bu_aaaa')
    vi.restoreAllMocks()
  })
})
