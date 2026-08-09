import { describe, expect, it } from 'vitest'
import { quadrantItemPosition, quadrantValuesFromPosition } from '@/features/editor-graph/quadrant-position'

describe('quadrant item drag coordinates', () => {
  const chart = { width: 480, height: 380 }
  const item = { width: 16, height: 16 }

  it('round-trips a visual drop to the closest normalized x/y values', () => {
    const position = quadrantItemPosition(0.8123, 0.3476, chart, item)
    expect(quadrantValuesFromPosition(position, chart, item)).toEqual({ x: 0.8123, y: 0.3476 })
  })

  it('clamps items dropped beyond the quadrant edges', () => {
    expect(quadrantValuesFromPosition({ x: -100, y: -100 }, chart, item)).toEqual({ x: 0, y: 1 })
    expect(quadrantValuesFromPosition({ x: 1000, y: 1000 }, chart, item)).toEqual({ x: 1, y: 0 })
  })

  it('places the coordinate extremes at the inset plot corners', () => {
    expect(quadrantItemPosition(0, 0, chart, item)).toEqual({ x: 18, y: 346 })
    expect(quadrantItemPosition(1, 1, chart, item)).toEqual({ x: 446, y: 18 })
  })
})
