import { describe, it, expect } from 'vitest'
import { routeOrthogonal, pointsToRoundedPath, type Rect, type Point } from '@/features/editor-graph/edges/orthogonal-router'

function hitsAny(pts: Point[], obstacles: Rect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1]
    for (const r of obstacles) {
      const L = r.x, R = r.x + r.width, T = r.y, B = r.y + r.height
      if (p.x === q.x) {
        if (p.x > L && p.x < R && Math.min(p.y, q.y) < B && Math.max(p.y, q.y) > T) return true
      } else if (p.y > T && p.y < B && Math.min(p.x, q.x) < R && Math.max(p.x, q.x) > L) {
        return true
      }
    }
  }
  return false
}

describe('routeOrthogonal', () => {
  it('returns a straight 2-point route when nothing blocks', () => {
    const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 0 }, [])
    expect(pts).not.toBeNull()
    expect(pts!.length).toBe(2)
  })

  it('detours around an obstacle sitting on the straight line', () => {
    const obstacle: Rect = { x: 40, y: -20, width: 40, height: 40 }
    const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 120, y: 0 }, [obstacle])
    expect(pts).not.toBeNull()
    expect(pts!.length).toBeGreaterThan(2) // it had to bend
    expect(hitsAny(pts!, [obstacle])).toBe(false) // and avoided the node
  })

  it('keeps endpoints exact', () => {
    const pts = routeOrthogonal({ x: 10, y: 5 }, { x: 200, y: 90 }, [{ x: 80, y: 0, width: 30, height: 120 }])
    expect(pts).not.toBeNull()
    expect(pts![0]).toEqual({ x: 10, y: 5 })
    expect(pts![pts!.length - 1]).toEqual({ x: 200, y: 90 })
  })

  it('bails out (null) past the obstacle cap', () => {
    const many: Rect[] = Array.from({ length: 61 }, (_, i) => ({ x: i * 10, y: 0, width: 5, height: 5 }))
    expect(routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 0 }, many)).toBeNull()
  })

  it('builds a rounded path string', () => {
    const d = pointsToRoundedPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }])
    expect(d.startsWith('M 0,0')).toBe(true)
    expect(d).toContain('Q') // corner rounded
  })
})
