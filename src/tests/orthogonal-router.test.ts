import { describe, it, expect } from 'vitest'
import { routeOrthogonal, pointsToRoundedPath, polylineSegments, clipRouteInputs, filterRoutingObstacles, type Rect, type Point, type Segment } from '@/features/editor-graph/edges/orthogonal-router'

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

  it('does not let pinned side anchors route back through an endpoint node', () => {
    const sourceRect: Rect = { x: 720, y: 32, width: 160, height: 64 }
    const targetRect: Rect = { x: 720, y: 144, width: 160, height: 64 }
    const source = { x: 880, y: 64 } // source anchor r
    const target = { x: 720, y: 176 } // target anchor l
    const sourceStub = { x: 900, y: 64 }
    const targetStub = { x: 700, y: 176 }
    const obstacles = filterRoutingObstacles([
      { id: 'source', rect: sourceRect },
      { id: 'target', rect: targetRect },
    ], 'source', 'target', source, target)

    const middle = routeOrthogonal(sourceStub, targetStub, obstacles)
    expect(middle).not.toBeNull()
    const route = [source, ...middle!, target]
    expect(hitsAny(route, [sourceRect, targetRect])).toBe(false)
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

  it('staggers away from an occupied parallel line by at least 5px', () => {
    // another relation already runs along y = 0 from x 0..100
    const occupied = polylineSegments([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    const pts = routeOrthogonal({ x: 0, y: 2 }, { x: 100, y: 2 }, [], occupied)
    expect(pts).not.toBeNull()
    // every horizontal run of the new route stays ≥ 5px from the occupied line
    for (let i = 0; i < pts!.length - 1; i++) {
      const p = pts![i], q = pts![i + 1]
      if (p.y === q.y && p.x !== q.x) expect(Math.abs(p.y - 0)).toBeGreaterThanOrEqual(5)
    }
  })

  it('detours to avoid perpendicular relation crossings', () => {
    const occupied = polylineSegments([{ x: 50, y: -50 }, { x: 50, y: 50 }])
    const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 0 }, [], occupied)
    expect(pts).not.toBeNull()
    expect(pts!.length).toBeGreaterThan(2)
    const crosses = polylineSegments(pts!).some(segment =>
      segment.a.y === segment.b.y
      && segment.a.y > -50 && segment.a.y < 50
      && Math.min(segment.a.x, segment.b.x) < 50 && Math.max(segment.a.x, segment.b.x) > 50)
    expect(crosses).toBe(false)
  })

  it('ignores diagonal (non-orthogonal) segments in polylineSegments', () => {
    const segs = polylineSegments([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 20 }])
    expect(segs.length).toBe(1)
    expect(segs[0]).toEqual({ a: { x: 10, y: 10 }, b: { x: 10, y: 20 } })
  })
})

describe('clipRouteInputs', () => {
  it('drops obstacles and segments far from the endpoints', () => {
    const near: Rect = { x: 50, y: 50, width: 20, height: 20 }
    const far: Rect = { x: 5000, y: 5000, width: 20, height: 20 }
    const nearSeg: Segment = { a: { x: 0, y: 30 }, b: { x: 100, y: 30 } }
    const farSeg: Segment = { a: { x: 5000, y: 0 }, b: { x: 5000, y: 100 } }
    const clipped = clipRouteInputs({ x: 0, y: 0 }, { x: 100, y: 100 }, [near, far], [nearSeg, farSeg])
    expect(clipped.obstacles).toEqual([near])
    expect(clipped.occupied).toEqual([nearSeg])
  })
})

describe('routing performance', () => {
  it('routes a dense scene (45 obstacles, 90 edges, growing occupied set) quickly', () => {
    // grid of 45 node-sized obstacles, like the ArchiMate layered view
    const obstacles: Rect[] = []
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 9; c++) obstacles.push({ x: c * 220, y: r * 160, width: 160, height: 74 })
    }
    const occupied: Segment[] = []
    const t0 = performance.now()
    for (let i = 0; i < 90; i++) {
      const from = obstacles[i % 45], to = obstacles[(i * 7 + 3) % 45]
      if (from === to) continue
      const src = { x: from.x + from.width, y: from.y + 37 }
      const tgt = { x: to.x, y: to.y + 37 }
      const obs = obstacles.filter(o => o !== from && o !== to)
      const clipped = clipRouteInputs(src, tgt, obs, occupied)
      const pts = routeOrthogonal(src, tgt, clipped.obstacles, clipped.occupied)
      if (pts) occupied.push(...polylineSegments(pts))
    }
    const elapsed = performance.now() - t0
    // was multiple seconds before corridor clipping + lane capping + heap
    expect(elapsed).toBeLessThan(1500)
  })
})
