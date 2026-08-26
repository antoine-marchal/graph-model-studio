// Orthogonal edge router with node-obstacle avoidance.
//
// Approach: build a sparse "Hanan grid" from the source/target points and the
// (margin-inflated) bounding boxes of every other node, then run A* over that
// grid preferring short paths with few bends. This is the routing technique used
// by mxGraph/drawio: cheap, deterministic, and good enough for diagram sizes.

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }
/** Axis-aligned segment of an already-routed edge. */
export interface Segment { a: Point; b: Point }

export interface NodeRect {
  id: string
  rect: Rect
}

/** True when an arbitrary line segment crosses the strict interior of a box. */
export function segmentCrossesRect(a: Point, b: Point, rect: Rect, margin = 0): boolean {
  const left = rect.x - margin
  const right = rect.x + rect.width + margin
  const top = rect.y - margin
  const bottom = rect.y + rect.height + margin
  const dx = b.x - a.x
  const dy = b.y - a.y
  let near = 0
  let far = 1
  for (const [p, q] of [
    [-dx, a.x - left], [dx, right - a.x],
    [-dy, a.y - top], [dy, bottom - a.y],
  ] as const) {
    if (p === 0) {
      if (q <= 0) return false
      continue
    }
    const ratio = q / p
    if (p < 0) near = Math.max(near, ratio)
    else far = Math.min(far, ratio)
    if (near >= far) return false
  }
  return far > 0 && near < 1
}

const MARGIN = 14 // keep this far away from node borders
const BEND_PENALTY = 18 // discourage corners (≈ favouring straighter routes)
const MAX_OBSTACLES = 60 // above this, A* gets too heavy — caller should fall back
const LANE_GAP = 5 // min separation between parallel segments of different edges
const OVERLAP_COST = 2 // malus per px of parallel overlap closer than LANE_GAP
const CROSSING_COST = 240 // prefer a modest detour to crossing another relation
const MAX_LANES = 24 // cap on escape-lane grid lines per axis (keeps the grid small)
const CORRIDOR = 140 // padding around the endpoints' bbox that routing cares about

/**
 * Build the node obstacle set for an edge. Endpoint nodes must remain obstacles:
 * the caller routes between outward stubs, so excluding them lets a pinned edge
 * turn around and pass back through its own source or target. Ancestor containers
 * enclosing an endpoint are still ignored because they would trap the route.
 */
export function filterRoutingObstacles(
  nodes: NodeRect[], sourceId: string, targetId: string, source: Point, target: Point,
): Rect[] {
  const encloses = (r: Rect, p: Point) =>
    p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

  return nodes
    .filter(({ id, rect }) =>
      id === sourceId || id === targetId || (!encloses(rect, source) && !encloses(rect, target)))
    .map(({ rect }) => rect)
}

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
 * Malus for running parallel to (and closer than LANE_GAP from) a segment of
 * another edge. Perpendicular crossings cost nothing — only collinear overlap
 * on (nearly) the same pixel line is penalised, proportionally to its length,
 * so A* prefers hopping to a lane ≥ LANE_GAP away. Takes the occupied set
 * pre-split by orientation so the hot A* loop only scans the relevant half.
 */
function overlapPenalty(p: Point, q: Point, occH: Segment[], occV: Segment[]): number {
  let pen = 0
  if (p.x === q.x) {
    const y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y)
    for (const s of occV) {
      if (Math.abs(s.a.x - p.x) >= LANE_GAP) continue
      const o0 = Math.max(y0, Math.min(s.a.y, s.b.y))
      const o1 = Math.min(y1, Math.max(s.a.y, s.b.y))
      if (o1 > o0) pen += (o1 - o0) * OVERLAP_COST
    }
    for (const s of occH) {
      const sx0 = Math.min(s.a.x, s.b.x), sx1 = Math.max(s.a.x, s.b.x)
      if (p.x > sx0 && p.x < sx1 && s.a.y > y0 && s.a.y < y1) pen += CROSSING_COST
    }
  } else {
    const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x)
    for (const s of occH) {
      if (Math.abs(s.a.y - p.y) >= LANE_GAP) continue
      const o0 = Math.max(x0, Math.min(s.a.x, s.b.x))
      const o1 = Math.min(x1, Math.max(s.a.x, s.b.x))
      if (o1 > o0) pen += (o1 - o0) * OVERLAP_COST
    }
    for (const s of occV) {
      const sy0 = Math.min(s.a.y, s.b.y), sy1 = Math.max(s.a.y, s.b.y)
      if (p.y > sy0 && p.y < sy1 && s.a.x > x0 && s.a.x < x1) pen += CROSSING_COST
    }
  }
  return pen
}

function splitByOrientation(occupied: Segment[]): { occH: Segment[]; occV: Segment[] } {
  const occH: Segment[] = [], occV: Segment[] = []
  for (const s of occupied) {
    if (s.a.x === s.b.x) occV.push(s)
    else if (s.a.y === s.b.y) occH.push(s)
  }
  return { occH, occV }
}

/**
 * Drop obstacles and occupied segments that can't influence a route between
 * `source` and `target` (outside their padded bounding box). Callers should
 * clip before routing — and before building cache keys, so a node moving on
 * the far side of the canvas doesn't invalidate every edge's cached route.
 */
export function clipRouteInputs(
  source: Point, target: Point, obstacles: Rect[], occupied: Segment[], pad = CORRIDOR,
): { obstacles: Rect[]; occupied: Segment[] } {
  const minX = Math.min(source.x, target.x) - pad, maxX = Math.max(source.x, target.x) + pad
  const minY = Math.min(source.y, target.y) - pad, maxY = Math.max(source.y, target.y) + pad
  return {
    obstacles: obstacles.filter(r =>
      r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY),
    occupied: occupied.filter(s =>
      Math.min(s.a.x, s.b.x) < maxX && Math.max(s.a.x, s.b.x) > minX
      && Math.min(s.a.y, s.b.y) < maxY && Math.max(s.a.y, s.b.y) > minY),
  }
}

/** Total parallel-overlap malus a poly-line would pay against `occupied`. */
export function polylineOverlapCost(pts: Point[], occupied: Segment[]): number {
  const { occH, occV } = splitByOrientation(occupied)
  let c = 0
  for (let i = 0; i < pts.length - 1; i++) c += overlapPenalty(pts[i], pts[i + 1], occH, occV)
  return c
}

/** Split a routed poly-line into axis-aligned segments (for the occupied registry). */
export function polylineSegments(pts: Point[]): Segment[] {
  const out: Segment[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y)
    // floating endpoints drift off the grid by a px or two — snap nearly
    // axis-aligned segments onto their dominant axis so they still register
    if (dy <= 2 && dx > dy) {
      const y = (a.y + b.y) / 2
      out.push({ a: { x: a.x, y }, b: { x: b.x, y } })
    } else if (dx <= 2 && dy > dx) {
      const x = (a.x + b.x) / 2
      out.push({ a: { x, y: a.y }, b: { x, y: b.y } })
    } else if (dx === 0 || dy === 0) {
      out.push({ a, b })
    }
    // anything else is genuinely diagonal (bezier fallback) — ignore
  }
  return out
}

interface AStarState { ix: number; iy: number; g: number; f: number; dir: number; prev: AStarState | null }

/** Array-backed binary min-heap on `f` (the A* open list). */
class MinHeap {
  private a: AStarState[] = []
  get size() { return this.a.length }
  push(s: AStarState) {
    const a = this.a
    a.push(s)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].f <= a[i].f) break
      const t = a[p]; a[p] = a[i]; a[i] = t
      i = p
    }
  }
  pop(): AStarState {
    const a = this.a
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < a.length && a[l].f < a[m].f) m = l
        if (r < a.length && a[r].f < a[m].f) m = r
        if (m === i) break
        const t = a[m]; a[m] = a[i]; a[i] = t
        i = m
      }
    }
    return top
  }
}

/** Dedupe lane coordinates and keep only the MAX_LANES closest to `center`. */
function capLanes(coords: number[], center: number): number[] {
  const uniq = [...new Set(coords.map(v => Math.round(v)))]
  if (uniq.length <= MAX_LANES) return uniq
  return uniq.sort((a, b) => Math.abs(a - center) - Math.abs(b - center)).slice(0, MAX_LANES)
}

/**
 * Returns an orthogonal poly-line (incl. endpoints) from `source` to `target`
 * that avoids `obstacles`, or null when no route is found / too many obstacles.
 * `occupied` segments (other edges' routes) are avoided softly: running on the
 * same line as one of them costs OVERLAP_COST per px, pushing the route onto a
 * parallel lane at least LANE_GAP away.
 *
 * Callers with large scenes should pass inputs through clipRouteInputs first —
 * grid size (and A* cost) grows with every obstacle and occupied segment.
 */
export function routeOrthogonal(source: Point, target: Point, obstacles: Rect[], occupied: Segment[] = []): Point[] | null {
  if (obstacles.length > MAX_OBSTACLES) return null

  const inflated = obstacles.map(r => ({
    x: r.x - MARGIN, y: r.y - MARGIN, width: r.width + 2 * MARGIN, height: r.height + 2 * MARGIN,
  }))

  const { occH, occV } = splitByOrientation(occupied)

  // escape lanes just outside the LANE_GAP band of each occupied segment, so
  // the grid actually contains a parallel line the malus can push us onto —
  // deduped and capped, otherwise dense scenes blow the grid up quadratically
  const laneXs = capLanes([
    ...occV.flatMap(s => [s.a.x - LANE_GAP - 1, s.a.x + LANE_GAP + 1]),
    ...occH.flatMap(s => [Math.min(s.a.x, s.b.x) - LANE_GAP - 1, Math.max(s.a.x, s.b.x) + LANE_GAP + 1]),
  ], (source.x + target.x) / 2)
  const laneYs = capLanes([
    ...occH.flatMap(s => [s.a.y - LANE_GAP - 1, s.a.y + LANE_GAP + 1]),
    ...occV.flatMap(s => [Math.min(s.a.y, s.b.y) - LANE_GAP - 1, Math.max(s.a.y, s.b.y) + LANE_GAP + 1]),
  ], (source.y + target.y) / 2)

  // candidate grid lines: endpoints + inflated obstacle edges + escape lanes
  const xs = uniqSorted([source.x, target.x, ...inflated.flatMap(r => [r.x, r.x + r.width]), ...laneXs])
  const ys = uniqSorted([source.y, target.y, ...inflated.flatMap(r => [r.y, r.y + r.height]), ...laneYs])
  const xi = new Map(xs.map((v, i) => [v, i]))
  const yi = new Map(ys.map((v, i) => [v, i]))

  const key = (ix: number, iy: number) => iy * xs.length + ix
  const sx = xi.get(Math.round(source.x))!, sy = yi.get(Math.round(source.y))!
  const tx = xi.get(Math.round(target.x))!, ty = yi.get(Math.round(target.y))!
  const goalK = key(tx, ty)

  const pointAt = (ix: number, iy: number): Point => ({ x: xs[ix], y: ys[iy] })
  const h = (ix: number, iy: number) => Math.abs(xs[ix] - target.x) + Math.abs(ys[iy] - target.y)

  const open = new MinHeap()
  open.push({ ix: sx, iy: sy, g: 0, f: h(sx, sy), dir: -1, prev: null })
  const best = new Map<number, number>() // key+dir bucket → g

  const neighbors = (ix: number, iy: number): Array<[number, number, number]> => {
    const out: Array<[number, number, number]> = []
    if (ix > 0) out.push([ix - 1, iy, 2])
    if (ix < xs.length - 1) out.push([ix + 1, iy, 3])
    if (iy > 0) out.push([ix, iy - 1, 0])
    if (iy < ys.length - 1) out.push([ix, iy + 1, 1])
    return out
  }

  let goal: AStarState | null = null
  let guard = 0
  while (open.size) {
    if (++guard > 200000) break
    const cur = open.pop()
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
      const g = cur.g + step + bend + overlapPenalty(p, q, occH, occV)
      // skip states already beaten — keeps the heap from silting up
      const nb = key(nx, ny) * 4 + dir
      if (best.has(nb) && best.get(nb)! <= g) continue
      open.push({ ix: nx, iy: ny, g, f: g + h(nx, ny), dir, prev: cur })
    }
  }

  if (!goal) return null

  // reconstruct, then collapse collinear points
  const raw: Point[] = []
  for (let s: AStarState | null = goal; s; s = s.prev) raw.unshift(pointAt(s.ix, s.iy))
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
  if (r <= 0) return `M ${pts.map(point => `${point.x},${point.y}`).join(' L ')}`
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
