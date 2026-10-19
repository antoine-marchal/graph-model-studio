import { describe, expect, it } from 'vitest'
import { alphaBounds } from './png-export'

describe('alphaBounds', () => {
  it('finds the visible pixels edge to edge, ignoring faint shadow fringes', () => {
    const w = 6, h = 5
    const data = new Uint8ClampedArray(w * h * 4)
    const set = (x: number, y: number, a: number) => { data[(y * w + x) * 4 + 3] = a }
    set(2, 1, 255)
    set(4, 3, 128)
    set(0, 4, 6) // soft shadow tail: background
    expect(alphaBounds(data, w, h)).toEqual({ x: 2, y: 1, width: 3, height: 3 })
    expect(alphaBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull()
  })
})
