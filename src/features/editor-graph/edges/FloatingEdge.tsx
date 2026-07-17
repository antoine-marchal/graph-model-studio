import { memo, useEffect, useReducer } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  useStore,
  type EdgeProps,
  type InternalNode,
  type Node,
  Position,
} from '@xyflow/react'
import { useModelStore } from '@/store'
import { routeOrthogonal, pointsToRoundedPath, polylineSegments, polylineOverlapCost, clipRouteInputs, filterRoutingObstacles, type NodeRect, type Rect, type Point, type Segment } from './orthogonal-router'
import { END_LABEL_DISTANCE, pointOnBezierAtDistance, pointOnPolyline, pointOnPolylineAtDistance } from './edge-label-position'

// Routes of currently-mounted edges, so each edge can pay a malus for running
// on the same pixel line as another relation (see overlapPenalty in the router).
// Filled during render: edges rendered earlier are avoided by later ones, and
// any re-render (drag, layout, zoom-independent moves) re-converges the set.
const routedEdges = new Map<string, Point[]>()

// A* results keyed by the inputs that determine them (endpoints + clipped
// obstacles + clipped occupied segments). Edges re-render on every node move,
// but only the ones whose corridor actually changed re-run the router.
const routeCache = new Map<string, { key: string; pts: Point[] | null }>()

function routeKey(src: Point, tgt: Point, sp: Position, tp: Position, obstacles: Rect[], occupied: Segment[]): string {
  let k = `${Math.round(src.x)},${Math.round(src.y)},${Math.round(tgt.x)},${Math.round(tgt.y)},${sp},${tp}`
  for (const r of obstacles) k += `|${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`
  for (const s of occupied) k += `;${Math.round(s.a.x)},${Math.round(s.a.y)},${Math.round(s.b.x)},${Math.round(s.b.y)}`
  return k
}

/** Point where the line from intersectionNode's center to targetNode's center crosses intersectionNode's border. */
function getNodeIntersection(intersectionNode: InternalNode<Node>, targetNode: InternalNode<Node>) {
  const w = (intersectionNode.measured.width ?? 1) / 2
  const h = (intersectionNode.measured.height ?? 1) / 2
  const ip = intersectionNode.internals.positionAbsolute
  const tp = targetNode.internals.positionAbsolute

  const x2 = ip.x + w
  const y2 = ip.y + h
  const x1 = tp.x + (targetNode.measured.width ?? 1) / 2
  const y1 = tp.y + (targetNode.measured.height ?? 1) / 2

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1)
  const xx3 = a * xx1
  const yy3 = a * yy1
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 }
}

function getEdgePosition(node: InternalNode<Node>, point: { x: number; y: number }): Position {
  const nx = Math.round(node.internals.positionAbsolute.x)
  const ny = Math.round(node.internals.positionAbsolute.y)
  const nw = node.measured.width ?? 1
  const nh = node.measured.height ?? 1
  const px = Math.round(point.x)
  const py = Math.round(point.y)
  if (px <= nx + 1) return Position.Left
  if (px >= nx + nw - 1) return Position.Right
  if (py <= ny + 1) return Position.Top
  if (py >= ny + nh - 1) return Position.Bottom
  return Position.Top
}

const SIDE_POS: Record<string, Position> = {
  t: Position.Top, b: Position.Bottom, l: Position.Left, r: Position.Right,
}

/** Midpoint of a pinned side ('t'|'b'|'l'|'r') of a node. */
function getHandlePoint(node: InternalNode<Node>, side: string) {
  const x = node.internals.positionAbsolute.x
  const y = node.internals.positionAbsolute.y
  const w = node.measured.width ?? 1
  const h = node.measured.height ?? 1
  switch (side) {
    case 't': return { x: x + w / 2, y }
    case 'b': return { x: x + w / 2, y: y + h }
    case 'l': return { x, y: y + h / 2 }
    case 'r': return { x: x + w, y: y + h / 2 }
    default: return { x: x + w / 2, y: y + h / 2 }
  }
}

function getEdgeParams(
  source: InternalNode<Node>,
  target: InternalNode<Node>,
  sourceHandle?: string | null,
  targetHandle?: string | null,
) {
  const sp = sourceHandle ? getHandlePoint(source, sourceHandle) : getNodeIntersection(source, target)
  const tp = targetHandle ? getHandlePoint(target, targetHandle) : getNodeIntersection(target, source)
  return {
    sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y,
    sourcePos: sourceHandle ? SIDE_POS[sourceHandle] : getEdgePosition(source, sp),
    targetPos: targetHandle ? SIDE_POS[targetHandle] : getEdgePosition(target, tp),
  }
}

const SPREAD = 12 // gap between attachment points of edges sharing a node side

/**
 * Distribute the attachment points of floating edges that share a node side,
 * so two relations never leave/enter a node on the same pixel line. Siblings
 * are ordered by the position of their far node to keep the fan uncrossed.
 */
function spreadPoint(
  edgeId: string,
  node: InternalNode<Node>,
  side: Position,
  point: Point,
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
  nodeLookup: Map<string, InternalNode<Node>>,
): Point {
  const horizontalSide = side === Position.Top || side === Position.Bottom
  const sibs: Array<{ id: string; coord: number }> = []
  for (const e of edges) {
    if (e.source === e.target) continue
    const isSrc = e.source === node.id
    const isTgt = e.target === node.id
    if (!isSrc && !isTgt) continue
    if (isSrc && e.sourceHandle) continue // pinned ends don't float
    if (isTgt && e.targetHandle) continue
    const other = nodeLookup.get(isSrc ? e.target : e.source)
    if (!other) continue
    if (getEdgePosition(node, getNodeIntersection(node, other)) !== side) continue
    const oc = {
      x: other.internals.positionAbsolute.x + (other.measured.width ?? 1) / 2,
      y: other.internals.positionAbsolute.y + (other.measured.height ?? 1) / 2,
    }
    sibs.push({ id: e.id, coord: horizontalSide ? oc.x : oc.y })
  }
  if (sibs.length <= 1) return point
  sibs.sort((p, q) => p.coord - q.coord || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0))
  const k = sibs.findIndex(s => s.id === edgeId)
  if (k < 0) return point
  // anchor the fan at the side's midpoint (not at each edge's own intersection
  // point — those differ per target and would cancel the offsets out)
  const off = (k - (sibs.length - 1) / 2) * SPREAD
  const nx = node.internals.positionAbsolute.x
  const ny = node.internals.positionAbsolute.y
  const nw = node.measured.width ?? 1
  const nh = node.measured.height ?? 1
  if (horizontalSide) {
    return { x: Math.min(nx + nw - 6, Math.max(nx + 6, nx + nw / 2 + off)), y: point.y }
  }
  return { x: point.x, y: Math.min(ny + nh - 6, Math.max(ny + 6, ny + nh / 2 + off)) }
}

/** Drop duplicate and collinear joints from a poly-line. */
function dedupeColinear(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const n = out.length
    if (n && Math.abs(out[n - 1].x - p.x) < 0.5 && Math.abs(out[n - 1].y - p.y) < 0.5) continue
    if (n >= 2) {
      const a = out[n - 2], b = out[n - 1]
      const collinear = (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5)
        || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5)
      if (collinear) { out[n - 1] = p; continue }
    }
    out.push(p)
  }
  return out
}

export const FloatingEdge = memo(({ id, source, target, markerEnd, markerStart, style, data, selected, sourceHandleId, targetHandleId }: EdgeProps) => {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const routing = useModelStore(s => s.edgeRouting)
  const nodeLookup = useStore(s => s.nodeLookup)
  const rfEdges = useStore(s => s.edges)
  useEffect(() => () => { routedEdges.delete(id); routeCache.delete(id) }, [id])
  // settle pass: the first render of each edge happens before later edges are
  // in the registry, so re-route once after mount when the registry is full
  const [, settle] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => settle())
    return () => cancelAnimationFrame(raf)
  }, [id])
  if (!sourceNode || !targetNode) return null

  // self-loop fallback
  if (source === target) return null

  let { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode, sourceHandleId, targetHandleId)
  if (!sourceHandleId) {
    const p = spreadPoint(id, sourceNode, sourcePos, { x: sx, y: sy }, rfEdges, nodeLookup)
    sx = p.x; sy = p.y
  }
  if (!targetHandleId) {
    const p = spreadPoint(id, targetNode, targetPos, { x: tx, y: ty }, rfEdges, nodeLookup)
    tx = p.x; ty = p.y
  }

  let path: string
  let labelX: number
  let labelY: number
  let sourceLabelPoint: Point
  let targetLabelPoint: Point
  let routed: Point[] | null = null
  if (routing === 'orthogonal') {
    const nodeRects: NodeRect[] = []
    for (const [, n] of nodeLookup) {
      const x = n.internals.positionAbsolute.x
      const y = n.internals.positionAbsolute.y
      const w = n.measured.width ?? 0
      const h = n.measured.height ?? 0
      nodeRects.push({ id: n.id, rect: { x, y, width: w, height: h } })
    }
    // The middle route runs between outward stubs. Keeping endpoint rectangles
    // here stops pinned edges from turning back through their own source/target.
    const obstacles = filterRoutingObstacles(
      nodeRects, source, target, { x: sx, y: sy }, { x: tx, y: ty },
    )
    // segments of every other already-routed relation — soft-avoided so two
    // relations never sit on the same pixel line (staggered by ≥ 5px)
    const occupied: Segment[] = []
    for (const [eid, pts] of routedEdges) {
      if (eid !== id) occupied.push(...polylineSegments(pts))
    }
    const src = { x: sx, y: sy }
    const tgt = { x: tx, y: ty }
    // only obstacles/segments near this edge matter — clipping keeps both the
    // A* grid and the cache key insensitive to far-away parts of the scene
    const clipped = clipRouteInputs(src, tgt, obstacles, occupied)
    const cacheKey = routeKey(src, tgt, sourcePos, targetPos, clipped.obstacles, clipped.occupied)
    const cached = routeCache.get(id)
    if (cached && cached.key === cacheKey) {
      routed = cached.pts
    } else {
      // Push the route off each border by a sizeable stub so the line leaves and
      // enters the node with a long perpendicular segment, then route between the
      // stubs (the A* router keeps that middle portion clear of other nodes).
      // The stub grows with endpoint distance but is capped so close nodes don't
      // overshoot one another.
      const dist = Math.hypot(tx - sx, ty - sy)
      const stubFor = (S: number) => (p: Point, pos: Position): Point => {
        switch (pos) {
          case Position.Top: return { x: p.x, y: p.y - S }
          case Position.Bottom: return { x: p.x, y: p.y + S }
          case Position.Left: return { x: p.x - S, y: p.y }
          default: return { x: p.x + S, y: p.y }
        }
      }
      // try a large perpendicular stub first, then a small one, then no stub —
      // a big stub can land inside a neighbour's margin and make A* fail, so we
      // degrade gracefully instead of dropping straight to a node-crossing bezier
      const tryRoute = (obs: Rect[], occ: Segment[]): Point[] | null => {
        for (const S of [Math.min(dist * 0.33, 40), 20, 0]) {
          const stub = stubFor(S)
          const a = S > 0 ? stub(src, sourcePos) : src
          const b = S > 0 ? stub(tgt, targetPos) : tgt
          // stub segments are fixed (A* can't bend them off an occupied line), so
          // reject this stub length when they'd run along another relation for
          // more than a few px and fall through to a shorter stub / none at all
          if (S > 0 && polylineOverlapCost([src, a], occ) + polylineOverlapCost([b, tgt], occ) > 16) continue
          const mid = routeOrthogonal(a, b, obs, occ)
          if (mid) return dedupeColinear(S > 0 ? [src, ...mid, tgt] : mid)
        }
        return null
      }
      routed = tryRoute(clipped.obstacles, clipped.occupied)
      if (routed) {
        routeCache.set(id, { key: cacheKey, pts: routed })
      } else {
        // corridor too tight (rare) — retry against the full scene, uncached so
        // the result can't go stale when far-away nodes move
        routed = tryRoute(obstacles, occupied)
        if (!routed) routeCache.set(id, { key: cacheKey, pts: null })
      }
    }
  }

  if (routed) routedEdges.set(id, routed)
  else routedEdges.delete(id)

  if (routed) {
    path = pointsToRoundedPath(routed)
    const mid = pointOnPolyline(routed, 0.5)
    labelX = mid.x
    labelY = mid.y
    sourceLabelPoint = pointOnPolylineAtDistance(routed, END_LABEL_DISTANCE)
    targetLabelPoint = pointOnPolylineAtDistance(routed, END_LABEL_DISTANCE, true)
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
      targetPosition: targetPos, targetX: tx, targetY: ty,
      curvature: 0.25,
    })
    sourceLabelPoint = pointOnBezierAtDistance({ x: sx, y: sy }, { x: tx, y: ty }, sourcePos, targetPos, END_LABEL_DISTANCE)
    targetLabelPoint = pointOnBezierAtDistance({ x: sx, y: sy }, { x: tx, y: ty }, sourcePos, targetPos, END_LABEL_DISTANCE, true)
  }

  const d2 = data as { label?: string; sourceLabel?: string; targetLabel?: string; selectedStroke?: string } | undefined
  const label = d2?.label
  const renderedStyle = selected && d2?.selectedStroke
    ? { ...style, stroke: d2.selectedStroke, strokeWidth: Math.max(Number(style?.strokeWidth) || 1.6, 2.4) }
    : style
  // Multiplicity labels sit directly on the relation, near their respective ends.
  const endLabel = (txt: string, x: number, y: number, key: string) => (
    <EdgeLabelRenderer key={key}>
      <div
        className="gms-edge-label nodrag nopan absolute rounded px-1 text-[10px] font-semibold shadow-sm"
        style={{ transform: `translate(-50%,-50%) translate(${x}px,${y}px)`, background: 'var(--surface-1)', color: 'var(--edge-label)', pointerEvents: 'none' }}
      >{txt}</div>
    </EdgeLabelRenderer>
  )
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={renderedStyle} />
      {d2?.sourceLabel && endLabel(d2.sourceLabel, sourceLabelPoint.x, sourceLabelPoint.y, 'sc')}
      {d2?.targetLabel && endLabel(d2.targetLabel, targetLabelPoint.x, targetLabelPoint.y, 'tc')}
      {label && (
        <EdgeLabelRenderer>
          <div
            className="gms-edge-label nodrag nopan absolute rounded px-1.5 py-0.5 text-[11px] font-medium shadow-sm"
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              background: 'var(--surface-1)',
              color: 'var(--edge-label)',
              border: selected ? `1px solid ${d2?.selectedStroke ?? 'var(--accent)'}` : '1px solid var(--border)',
              pointerEvents: 'all',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

FloatingEdge.displayName = 'FloatingEdge'
