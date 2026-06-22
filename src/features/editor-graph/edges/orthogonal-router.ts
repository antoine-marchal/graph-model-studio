// Orthogonal edge router with node-obstacle avoidance.
//
// Approach: build a sparse "Hanan grid" from the source/target points and the
// (margin-inflated) bounding boxes of every other node, then run A* over that
// grid preferring short paths with few bends. This is the routing technique used
// by mxGraph/drawio: cheap, deterministic, and good enough for diagram sizes.

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

const MARGIN = 14 // keep this far away from node borders
const BEND_PENALTY = 18 // discourage corners (≈ favouring straighter routes)
const MAX_OBSTACLES = 60 // above this, A* gets too heavy — caller should fall back

function uniqSorted(values: number[]): number[] {
  return [...new Set(values.map(v => Math.round(v)))].sort((a, b) => a - b)
}

/** Does axis-aligned segment p→q pass through the strict interior of rect? */
function segmentHitsRect(p: Point, q: Point, r: Rect): boolean {
  const left = r.x, right = r.x + r.width, top = r.y, bottom = r.y + r.height
  if (p.x === q.x) {
    // vertical
    if (p.x <= left || p.x >= right) return false
    const y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y)
    return y0 < bottom && y1 > top
  }
  // horizontal
  if (p.y <= top || p.y >= bottom) return false
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x)
  return x0 < right && x1 > left
}

function segmentBlocked(p: Point, q: Point, obstacles: Rect[]): boolean {
  for (const r of obstacles) if (segmentHitsRect(p, q, r)) return true
  return false
}

/**
 * Returns an orthogonal poly-line (incl. endpoints) from `source` to `target`
 * that avoids `obstacles`, or null when no route is found / too many obstacles.
 */
export function routeOrthogonal(source: Point, target: Point, obstacles: Rect[]): Point[] | null {
  if (obstacles.length > MAX_OBSTACLES) return null

  const inflated = obstacles.map(r => ({
    x: r.x - MARGIN, y: r.y - MARGIN, width: r.width + 2 * MARGIN, height: r.height + 2 * MARGIN,
  }))

  // candidate grid lines: endpoints + inflated obstacle edges
  const xs = uniqSorted([source.x, target.x, ...inflated.flatMap(r => [r.x, r.x + r.width])])
  const ys = uniqSorted([source.y, target.y, ...inflated.flatMap(r => [r.y, r.y + r.height])])
  const xi = new Map(xs.map((v, i) => [v, i]))
  const yi = new Map(ys.map((v, i) => [v, i]))

  const key = (ix: number, iy: number) => iy * xs.length + ix
  const sx = xi.get(Math.round(source.x))!, sy = yi.get(Math.round(source.y))!
  const tx = xi.get(Math.round(target.x))!, ty = yi.get(Math.round(target.y))!
  const goalK = key(tx, ty)

  const pointAt = (ix: number, iy: number): Point => ({ x: xs[ix], y: ys[iy] })
  const h = (ix: number, iy: number) => Math.abs(xs[ix] - target.x) + Math.abs(ys[iy] - target.y)

  interface State { ix: number; iy: number; g: number; f: number; dir: number; prev: State | null }
  const open: State[] = [{ ix: sx, iy: sy, g: 0, f: h(sx, sy), dir: -1, prev: null }]
  const best = new Map<number, number>() // key+dir bucket → g

  const neighbors = (ix: number, iy: number): Array<[number, number, number]> => {
    const out: Array<[number, number, number]> = []
    if (ix > 0) out.push([ix - 1, iy, 2])
    if (ix < xs.length - 1) out.push([ix + 1, iy, 3])
    if (iy > 0) out.push([ix, iy - 1, 0])
    if (iy < ys.length - 1) out.push([ix, iy + 1, 1])
    return out
  }

  let goal: State | null = null
  let guard = 0
  while (open.length) {
    if (++guard > 200000) break
    // pop lowest f (linear scan; grids are small)
    let bi = 0
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i
    const cur = open.splice(bi, 1)[0]
    if (key(cur.ix, cur.iy) === goalK) { goal = cur; break }
    const bucket = key(cur.ix, cur.iy) * 4 + (cur.dir < 0 ? 0 : cur.dir)
    if (best.has(bucket) && best.get(bucket)! <= cur.g) continue
    best.set(bucket, cur.g)

    const p = pointAt(cur.ix, cur.iy)
    for (const [nx, ny, dir] of neighbors(cur.ix, cur.iy)) {
      const q = pointAt(nx, ny)
      if (segmentBlocked(p, q, inflated)) continue
      const step = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
      const bend = cur.dir >= 0 && cur.dir !== dir ? BEND_PENALTY : 0
      const g = cur.g + step + bend
      open.push({ ix: nx, iy: ny, g, f: g + h(nx, ny), dir, prev: cur })
    }
  }

  if (!goal) return null

  // reconstruct, then collapse collinear points
  const raw: Point[] = []
  for (let s: State | null = goal; s; s = s.prev) raw.unshift(pointAt(s.ix, s.iy))
  const pts: Point[] = []
  for (const pt of raw) {
    const n = pts.length
    if (n >= 2) {
      const a = pts[n - 2], b = pts[n - 1]
      const collinear = (a.x === b.x && b.x === pt.x) || (a.y === b.y && b.y === pt.y)
      if (collinear) { pts[n - 1] = pt; continue }
    }
    pts.push(pt)
  }
  return pts
}

/** Build an SVG path from poly-line points, rounding corners by `r`. */
export function pointsToRoundedPath(pts: Point[], r = 8): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`
  let d = `M ${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1]
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y)
    const rr = Math.min(r, d1 / 2, d2 / 2)
    const p1 = { x: cur.x - (cur.x - prev.x) / (d1 || 1) * rr, y: cur.y - (cur.y - prev.y) / (d1 || 1) * rr }
    const p2 = { x: cur.x + (next.x - cur.x) / (d2 || 1) * rr, y: cur.y + (next.y - cur.y) / (d2 || 1) * rr }
    d += ` L ${p1.x},${p1.y} Q ${cur.x},${cur.y} ${p2.x},${p2.y}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x},${last.y}`
  return d
}
