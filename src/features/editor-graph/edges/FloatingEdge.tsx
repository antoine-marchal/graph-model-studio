import { memo, useEffect, useReducer, useRef } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  useReactFlow,
  useStore,
  type EdgeProps,
  type InternalNode,
  type Node,
  Position,
} from '@xyflow/react'
import { useModelStore } from '@/store'
import { routeOrthogonal, pointsToRoundedPath, polylineSegments, polylineOverlapCost, clipRouteInputs, filterRoutingObstacles, segmentCrossesRect, type NodeRect, type Rect, type Point, type Segment } from './orthogonal-router'
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

/** Auto anchors always use obstacle-aware orthogonal routing. */
export function shouldRouteOrthogonally(
  routing: 'curved' | 'orthogonal',
  sourceHandle?: string | null,
  targetHandle?: string | null,
  directHitsNode = false,
): boolean {
  return (!sourceHandle || !targetHandle) || routing === 'orthogonal' || directHitsNode
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

function outwardPoint(point: Point, side: Position, distance = 24): Point {
  switch (side) {
    case Position.Top: return { x: point.x, y: point.y - distance }
    case Position.Bottom: return { x: point.x, y: point.y + distance }
    case Position.Left: return { x: point.x - distance, y: point.y }
    default: return { x: point.x + distance, y: point.y }
  }
}

/** Pick a node side whose outward stub is not trapped behind a nearby sibling. */
function openAutoSide(node: InternalNode<Node>, other: InternalNode<Node>, preferred: Position, scene: RoutingScene) {
  const alternatives: Record<Position, Position[]> = {
    [Position.Top]: [Position.Top, Position.Left, Position.Right, Position.Bottom],
    [Position.Bottom]: [Position.Bottom, Position.Left, Position.Right, Position.Top],
    [Position.Left]: [Position.Left, Position.Top, Position.Bottom, Position.Right],
    [Position.Right]: [Position.Right, Position.Top, Position.Bottom, Position.Left],
  }
  const sideKey: Record<Position, 't' | 'b' | 'l' | 'r'> = {
    [Position.Top]: 't', [Position.Bottom]: 'b', [Position.Left]: 'l', [Position.Right]: 'r',
  }
  const center = (candidate: InternalNode<Node>) => ({
    x: candidate.internals.positionAbsolute.x + (candidate.measured.width ?? 1) / 2,
    y: candidate.internals.positionAbsolute.y + (candidate.measured.height ?? 1) / 2,
  })
  const nodeCenter = center(node)
  const otherCenter = center(other)
  const encloses = (rect: Rect, point: Point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
  const obstacles = scene.nodeRects.filter(candidate =>
    candidate.id !== node.id && candidate.id !== other.id
    && candidate.rect.width >= 8 && candidate.rect.height >= 8
    && !encloses(candidate.rect, nodeCenter) && !encloses(candidate.rect, otherCenter))
  for (const side of alternatives[preferred]) {
    const point = getHandlePoint(node, sideKey[side])
    const stub = outwardPoint(point, side)
    if (!obstacles.some(obstacle => segmentCrossesRect(point, stub, obstacle.rect, 14))) return { point, side }
  }
  return { point: getHandlePoint(node, sideKey[preferred]), side: preferred }
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

interface RoutingScene {
  nodeLookup: Map<string, InternalNode<Node>>
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>
  nodeRects: NodeRect[]
  spreadSlots: Map<string, { index: number; count: number }>
}

let routingScene: RoutingScene | undefined
let routingSceneReset = 0

/** Build geometry shared by every edge once per animation frame. */
function sceneFor(
  nodeLookup: RoutingScene['nodeLookup'],
  edges: RoutingScene['edges'],
): RoutingScene {
  if (routingScene?.nodeLookup === nodeLookup && routingScene.edges === edges) return routingScene
  const nodeRects: NodeRect[] = []
  for (const [, node] of nodeLookup) {
    nodeRects.push({
      id: node.id,
      rect: {
        x: node.internals.positionAbsolute.x,
        y: node.internals.positionAbsolute.y,
        width: node.measured.width ?? 0,
        height: node.measured.height ?? 0,
      },
    })
  }

  const groups = new Map<string, Array<{ id: string; coord: number }>>()
  const addEndpoint = (edge: RoutingScene['edges'][number], isSource: boolean) => {
    const nodeId = isSource ? edge.source : edge.target
    const otherId = isSource ? edge.target : edge.source
    const handle = isSource ? edge.sourceHandle : edge.targetHandle
    if (nodeId === otherId || handle) return
    const node = nodeLookup.get(nodeId)
    const other = nodeLookup.get(otherId)
    if (!node || !other) return
    const side = getEdgePosition(node, getNodeIntersection(node, other))
    const horizontal = side === Position.Top || side === Position.Bottom
    const coord = horizontal
      ? other.internals.positionAbsolute.x + (other.measured.width ?? 1) / 2
      : other.internals.positionAbsolute.y + (other.measured.height ?? 1) / 2
    const key = `${nodeId}|${side}`
    const group = groups.get(key)
    if (group) group.push({ id: edge.id, coord })
    else groups.set(key, [{ id: edge.id, coord }])
  }
  for (const edge of edges) {
    addEndpoint(edge, true)
    addEndpoint(edge, false)
  }
  const spreadSlots = new Map<string, { index: number; count: number }>()
  for (const [groupKey, group] of groups) {
    group.sort((left, right) => left.coord - right.coord || left.id.localeCompare(right.id))
    group.forEach((item, index) => spreadSlots.set(`${groupKey}|${item.id}`, { index, count: group.length }))
  }

  routingScene = { nodeLookup, edges, nodeRects, spreadSlots }
  if (!routingSceneReset) {
    routingSceneReset = requestAnimationFrame(() => {
      routingScene = undefined
      routingSceneReset = 0
    })
  }
  return routingScene
}

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
  spreadSlots: RoutingScene['spreadSlots'],
): Point {
  const horizontalSide = side === Position.Top || side === Position.Bottom
  const slot = spreadSlots.get(`${node.id}|${side}|${edgeId}`)
  if (!slot || slot.count <= 1) return point
  // anchor the fan at the side's midpoint (not at each edge's own intersection
  // point — those differ per target and would cancel the offsets out)
  const off = (slot.index - (slot.count - 1) / 2) * SPREAD
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

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
  }
}

/** A maximally smooth Snake curve whose tangents follow row flow, not anchors. */
export function snakeFlowCurve(source: Point, target: Point, sourceSide: 'l' | 'r', targetSide: 'l' | 'r') {
  const dx = Math.abs(target.x - source.x)
  const dy = Math.abs(target.y - source.y)
  const sameSide = sourceSide === targetSide
  const offset = sameSide
    ? Math.max(80, dy * 0.45, dx * 0.35)
    : Math.max(40, Math.min(110, dx * 0.42 + dy * 0.18))
  const sourceDirection = sourceSide === 'r' ? 1 : -1
  const targetDirection = targetSide === 'l' ? 1 : -1
  const commonControlX = sameSide
    ? sourceSide === 'r' ? Math.max(source.x, target.x) + offset : Math.min(source.x, target.x) - offset
    : undefined
  // Same-row links that skip bullets bow above the lane so they never run
  // through (and hide) the intermediate step badges; forks read as branches.
  const bow = !sameSide && dy < 1 && dx > 200 ? Math.min(56, dx * 0.2) : 0
  const c1 = { x: commonControlX ?? source.x + sourceDirection * offset, y: source.y - bow }
  const c2 = { x: commonControlX ?? target.x - targetDirection * offset, y: target.y - bow }
  const midpoint = cubicPoint(source, c1, c2, target, 0.5)
  const before = cubicPoint(source, c1, c2, target, 0.47)
  const after = cubicPoint(source, c1, c2, target, 0.53)
  return {
    path: `M ${source.x},${source.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${target.x},${target.y}`,
    midpoint,
    sourceLabelPoint: cubicPoint(source, c1, c2, target, 0.12),
    targetLabelPoint: cubicPoint(source, c1, c2, target, 0.88),
    angle: Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI,
    controls: [c1, c2] as const,
  }
}

/** Git branch/merge curve with tangents aligned to the graph's flow axis. */
export function gitFlowCurve(source: Point, target: Point, orientation: 'horizontal' | 'vertical' = 'horizontal') {
  if (orientation === 'vertical') {
    const dy = target.y - source.y
    const direction = dy >= 0 ? 1 : -1
    const control = Math.max(20, Math.min(Math.abs(dy) * 0.46, 72))
    const c1 = { x: source.x, y: source.y + direction * control }
    const c2 = { x: target.x, y: target.y - direction * control }
    const midpoint = cubicPoint(source, c1, c2, target, 0.5)
    const before = cubicPoint(source, c1, c2, target, 0.47)
    const after = cubicPoint(source, c1, c2, target, 0.53)
    return {
      path: `M ${source.x},${source.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${target.x},${target.y}`,
      midpoint,
      sourceLabelPoint: cubicPoint(source, c1, c2, target, 0.12),
      targetLabelPoint: cubicPoint(source, c1, c2, target, 0.88),
      angle: Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI,
      controls: [c1, c2] as const,
    }
  }
  const dx = target.x - source.x
  const direction = dx >= 0 ? 1 : -1
  const control = Math.max(20, Math.min(Math.abs(dx) * 0.46, 72))
  const c1 = { x: source.x + direction * control, y: source.y }
  const c2 = { x: target.x - direction * control, y: target.y }
  const midpoint = cubicPoint(source, c1, c2, target, 0.5)
  const before = cubicPoint(source, c1, c2, target, 0.47)
  const after = cubicPoint(source, c1, c2, target, 0.53)
  return {
    path: `M ${source.x},${source.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${target.x},${target.y}`,
    midpoint,
    sourceLabelPoint: cubicPoint(source, c1, c2, target, 0.12),
    targetLabelPoint: cubicPoint(source, c1, c2, target, 0.88),
    angle: Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI,
    controls: [c1, c2] as const,
  }
}

interface SelfLoopRect extends Point { width: number; height: number }

/** Stable loop geometry shared by every node type. */
export function selfLoopCurve(rect: SelfLoopRect, side: 't' | 'b' | 'l' | 'r' = 'r', cornerRadius = 8) {
  const gap = 48
  let points: Point[]
  let sourcePos: Position
  let targetPos: Position
  if (side === 'l') {
    points = [
      { x: rect.x, y: rect.y + rect.height * 0.35 },
      { x: rect.x - gap, y: rect.y + rect.height * 0.35 },
      { x: rect.x - gap, y: rect.y + rect.height * 0.65 },
      { x: rect.x, y: rect.y + rect.height * 0.65 },
    ]
    sourcePos = targetPos = Position.Left
  } else if (side === 't') {
    points = [
      { x: rect.x + rect.width * 0.65, y: rect.y },
      { x: rect.x + rect.width * 0.65, y: rect.y - gap },
      { x: rect.x + rect.width * 0.35, y: rect.y - gap },
      { x: rect.x + rect.width * 0.35, y: rect.y },
    ]
    sourcePos = targetPos = Position.Top
  } else if (side === 'b') {
    points = [
      { x: rect.x + rect.width * 0.35, y: rect.y + rect.height },
      { x: rect.x + rect.width * 0.35, y: rect.y + rect.height + gap },
      { x: rect.x + rect.width * 0.65, y: rect.y + rect.height + gap },
      { x: rect.x + rect.width * 0.65, y: rect.y + rect.height },
    ]
    sourcePos = targetPos = Position.Bottom
  } else {
    points = [
      { x: rect.x + rect.width, y: rect.y + rect.height * 0.65 },
      { x: rect.x + rect.width + gap, y: rect.y + rect.height * 0.65 },
      { x: rect.x + rect.width + gap, y: rect.y + rect.height * 0.35 },
      { x: rect.x + rect.width, y: rect.y + rect.height * 0.35 },
    ]
    sourcePos = targetPos = Position.Right
  }
  return {
    path: pointsToRoundedPath(points, cornerRadius),
    points,
    start: points[0],
    end: points[points.length - 1],
    label: pointOnPolyline(points, 0.5),
    sourceLabelPoint: pointOnPolylineAtDistance(points, END_LABEL_DISTANCE),
    targetLabelPoint: pointOnPolylineAtDistance(points, END_LABEL_DISTANCE, true),
    sourcePos,
    targetPos,
  }
}

/** UML-style rectangular return drawn at one sequence lifeline. */
export function sequenceLoopCurve(source: Point, target: Point) {
  const reach = 54
  const points = [source, { x: source.x + reach, y: source.y }, { x: source.x + reach, y: target.y }, target]
  return {
    path: pointsToRoundedPath(points, 6),
    label: { x: source.x + reach, y: (source.y + target.y) / 2 },
    sourceLabelPoint: pointOnPolylineAtDistance(points, END_LABEL_DISTANCE),
    targetLabelPoint: pointOnPolylineAtDistance(points, END_LABEL_DISTANCE, true),
  }
}

interface GanttNodeRect extends Point { width: number; height: number }

/** Finish-to-start attachment points used by every task/milestone combination. */
export function ganttAttachmentPoints(source: GanttNodeRect, target: GanttNodeRect, targetIsMilestone: boolean) {
  return {
    // A task exits at its right edge; for a diamond this is its right corner.
    source: { x: source.x + source.width, y: source.y + source.height / 2 },
    // A diamond is entered at its top corner; a task at its top-left corner.
    target: { x: target.x + (targetIsMilestone ? target.width / 2 : 0), y: target.y },
  }
}

export const FloatingEdge = memo(({ id, source, target, markerEnd, markerStart, style, data, selected, sourceHandleId, targetHandleId }: EdgeProps) => {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const routing = useModelStore(s => s.edgeRouting)
  const nodeLookup = useStore(s => s.nodeLookup)
  const rfEdges = useStore(s => s.edges)
  const dispatch = useModelStore(s => s.dispatch)
  const selectRelation = useModelStore(s => s.selectRelation)
  const { screenToFlowPosition } = useReactFlow()
  const sequenceDrag = useRef<{ pointerId: number; startY: number } | null>(null)
  const scene = sceneFor(nodeLookup, rfEdges)
  useEffect(() => () => { routedEdges.delete(id); routeCache.delete(id) }, [id])
  // settle pass: the first render of each edge happens before later edges are
  // in the registry, so re-route once after mount when the registry is full
  const [, settle] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => settle())
    return () => cancelAnimationFrame(raf)
  }, [id])
  if (!sourceNode || !targetNode) return null

  const edgeData = data as {
    label?: string
    sourceLabel?: string
    targetLabel?: string
    selectedStroke?: string
    middleArrow?: 'directed' | 'bidirectional'
    middleArrowColor?: string
    underlayStroke?: string
    underlayWidth?: number
    cornerRadius?: number
    snakeRelation?: boolean
    snakeSourceSide?: 'l' | 'r'
    snakeTargetSide?: 'l' | 'r'
    chartRelation?: 'gantt' | 'git' | 'sequenceLoop'
    gitOrientation?: 'horizontal' | 'vertical'
    ganttTargetMilestone?: boolean
    sequenceHostId?: string
  } | undefined

  const loopSide = (sourceHandleId ?? targetHandleId ?? 'r') as 't' | 'b' | 'l' | 'r'
  const selfCurve = source === target
    ? selfLoopCurve({
      x: sourceNode.internals.positionAbsolute.x,
      y: sourceNode.internals.positionAbsolute.y,
      width: sourceNode.measured.width ?? 1,
      height: sourceNode.measured.height ?? 1,
    }, loopSide, 8)
    : undefined
  let { sx, sy, tx, ty, sourcePos, targetPos } = selfCurve
    ? {
      sx: selfCurve.start.x, sy: selfCurve.start.y,
      tx: selfCurve.end.x, ty: selfCurve.end.y,
      sourcePos: selfCurve.sourcePos, targetPos: selfCurve.targetPos,
    }
    : getEdgeParams(sourceNode, targetNode, sourceHandleId, targetHandleId)
  const chartRelation = edgeData?.chartRelation
  if (!selfCurve && !chartRelation && !sourceHandleId) {
    const choice = openAutoSide(sourceNode, targetNode, sourcePos, scene)
    sx = choice.point.x; sy = choice.point.y; sourcePos = choice.side
  }
  if (!selfCurve && !chartRelation && !targetHandleId) {
    const choice = openAutoSide(targetNode, sourceNode, targetPos, scene)
    tx = choice.point.x; ty = choice.point.y; targetPos = choice.side
  }
  if (!selfCurve && !sourceHandleId && !chartRelation) {
    const p = spreadPoint(id, sourceNode, sourcePos, { x: sx, y: sy }, scene.spreadSlots)
    sx = p.x; sy = p.y
  }
  if (!selfCurve && !targetHandleId && !chartRelation) {
    const p = spreadPoint(id, targetNode, targetPos, { x: tx, y: ty }, scene.spreadSlots)
    tx = p.x; ty = p.y
  }
  if (edgeData?.snakeRelation) {
    sx = sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 1) / 2
    sy = sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 1) / 2
    tx = targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 1) / 2
    ty = targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 1) / 2
  }
  if (chartRelation === 'gantt') {
    const points = ganttAttachmentPoints(
      {
        x: sourceNode.internals.positionAbsolute.x,
        y: sourceNode.internals.positionAbsolute.y,
        width: sourceNode.measured.width ?? 1,
        height: sourceNode.measured.height ?? 1,
      },
      {
        x: targetNode.internals.positionAbsolute.x,
        y: targetNode.internals.positionAbsolute.y,
        width: targetNode.measured.width ?? 1,
        height: targetNode.measured.height ?? 1,
      },
      edgeData?.ganttTargetMilestone === true,
    )
    sx = points.source.x
    sy = points.source.y
    tx = points.target.x
    ty = points.target.y
    sourcePos = Position.Right
    targetPos = Position.Top
  } else if (chartRelation === 'git') {
    // Stop at each disc boundary. This is visually equivalent to drawing under
    // opaque bubbles, while remaining correct even if React Flow changes the
    // relative SVG/node stacking order.
    if (edgeData?.gitOrientation === 'vertical') {
      sx = sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 1) / 2
      sy = sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 1)
      tx = targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 1) / 2
      ty = targetNode.internals.positionAbsolute.y
      sourcePos = Position.Bottom
      targetPos = Position.Top
    } else {
      sx = sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 1)
      sy = sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 1) / 2
      tx = targetNode.internals.positionAbsolute.x
      ty = targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 1) / 2
      sourcePos = Position.Right
      targetPos = Position.Left
    }
  }
  const snakeCurve = edgeData?.snakeRelation && edgeData.snakeSourceSide && edgeData.snakeTargetSide
  const gitCurve = chartRelation === 'git' ? gitFlowCurve({ x: sx, y: sy }, { x: tx, y: ty }, edgeData?.gitOrientation) : undefined
  const sequenceCurve = chartRelation === 'sequenceLoop' ? sequenceLoopCurve({ x: sx, y: sy }, { x: tx, y: ty }) : undefined

  let path: string
  let labelX: number
  let labelY: number
  let sourceLabelPoint: Point
  let targetLabelPoint: Point
  let middleArrowAngle = 0
  let routed: Point[] | null = null
  if (chartRelation === 'gantt') {
    const src = { x: sx, y: sy }
    const tgt = { x: tx, y: ty }
    const sourceStub = { x: sx + 20, y: sy }
    const targetStub = { x: tx, y: ty - 20 }
    const obstacles = filterRoutingObstacles(scene.nodeRects, source, target, src, tgt)
    const occupied: Segment[] = []
    for (const [edgeId, points] of routedEdges) {
      if (edgeId !== id) occupied.push(...polylineSegments(points))
    }
    const middle = routeOrthogonal(sourceStub, targetStub, obstacles, occupied)
    routed = middle
      ? dedupeColinear([src, ...middle, tgt])
      : dedupeColinear([src, sourceStub, { x: sourceStub.x, y: targetStub.y }, targetStub, tgt])
  } else if (!selfCurve && !sequenceCurve && !snakeCurve) {
    // The middle route runs between outward stubs. Keeping endpoint rectangles
    // here stops pinned edges from turning back through their own source/target.
    const obstacles = filterRoutingObstacles(
      scene.nodeRects, source, target, { x: sx, y: sy }, { x: tx, y: ty },
    )
    const directObstacles = filterRoutingObstacles(
      scene.nodeRects.filter(node => node.id !== source && node.id !== target && node.rect.width >= 8 && node.rect.height >= 8),
      source, target, { x: sx, y: sy }, { x: tx, y: ty },
    )
    const directHitsNode = directObstacles.some(obstacle => segmentCrossesRect({ x: sx, y: sy }, { x: tx, y: ty }, obstacle, 4))
    if (shouldRouteOrthogonally(routing, sourceHandleId, targetHandleId, directHitsNode)) {
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
        // A pinned source/target may be forced to share its initial stub with an
        // existing relation. Edge overlap is preferable to abandoning obstacle
        // avoidance and falling back to a node-crossing Bézier curve.
        if (!routed) routed = tryRoute(clipped.obstacles, [])
        if (!routed) routed = tryRoute(obstacles, [])
        if (!routed) routeCache.set(id, { key: cacheKey, pts: null })
      }
    }
    }
  }

  if (routed) routedEdges.set(id, routed)
  else routedEdges.delete(id)

  if (selfCurve) {
    path = selfCurve.path
    labelX = selfCurve.label.x
    labelY = selfCurve.label.y
    sourceLabelPoint = selfCurve.sourceLabelPoint
    targetLabelPoint = selfCurve.targetLabelPoint
  } else if (sequenceCurve) {
    path = sequenceCurve.path
    labelX = sequenceCurve.label.x
    labelY = sequenceCurve.label.y
    sourceLabelPoint = sequenceCurve.sourceLabelPoint
    targetLabelPoint = sequenceCurve.targetLabelPoint
  } else if (snakeCurve) {
    const curve = snakeFlowCurve(
      { x: sx, y: sy },
      { x: tx, y: ty },
      edgeData!.snakeSourceSide!,
      edgeData!.snakeTargetSide!,
    )
    path = curve.path
    labelX = curve.midpoint.x
    labelY = curve.midpoint.y
    sourceLabelPoint = curve.sourceLabelPoint
    targetLabelPoint = curve.targetLabelPoint
    middleArrowAngle = curve.angle
  } else if (gitCurve) {
    path = gitCurve.path
    labelX = gitCurve.midpoint.x
    labelY = gitCurve.midpoint.y
    sourceLabelPoint = gitCurve.sourceLabelPoint
    targetLabelPoint = gitCurve.targetLabelPoint
    middleArrowAngle = gitCurve.angle
  } else if (routed) {
    path = pointsToRoundedPath(routed, edgeData?.cornerRadius ?? 8)
    const mid = pointOnPolyline(routed, 0.5)
    const beforeMid = pointOnPolyline(routed, 0.47)
    const afterMid = pointOnPolyline(routed, 0.53)
    middleArrowAngle = Math.atan2(afterMid.y - beforeMid.y, afterMid.x - beforeMid.x) * 180 / Math.PI
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
    middleArrowAngle = Math.atan2(ty - sy, tx - sx) * 180 / Math.PI
  }

  const d2 = edgeData
  const sequenceSortable = d2?.sequenceHostId !== undefined
  const finishSequenceDrag = (event: React.PointerEvent<SVGPathElement>) => {
    const drag = sequenceDrag.current
    sequenceDrag.current = null
    if (!drag) return
    event.currentTarget.releasePointerCapture?.(drag.pointerId)
    if (Math.abs(event.clientY - drag.startY) < 5) {
      selectRelation(id)
      return
    }
    const y = screenToFlowPosition({ x: event.clientX, y: event.clientY }).y
    const candidates = rfEdges
      .filter(edge => edge.id !== id && (edge.data as { sequenceHostId?: string } | undefined)?.sequenceHostId === d2?.sequenceHostId)
      .map(edge => {
        const sourcePoint = nodeLookup.get(edge.source)
        const targetPoint = nodeLookup.get(edge.target)
        const middleY = ((sourcePoint?.internals.positionAbsolute.y ?? 0) + (targetPoint?.internals.positionAbsolute.y ?? 0)) / 2
        return { id: edge.id, y: middleY }
      })
      .sort((left, right) => left.y - right.y)
    if (!candidates.length) return
    const nearest = candidates.reduce((best, candidate) => Math.abs(candidate.y - y) < Math.abs(best.y - y) ? candidate : best)
    dispatch({ type: 'REORDER_RELATION', payload: { id, targetId: nearest.id, position: y < nearest.y ? 'before' : 'after' } })
  }
  const label = d2?.label
  const renderedStyle = selected && d2?.selectedStroke
    ? { ...style, stroke: d2.selectedStroke, strokeWidth: Math.max(Number(style?.strokeWidth) || 1.6, 2.4) }
    : style
  const renderedLabelY = d2?.middleArrow ? labelY - 18 : labelY
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
      {d2?.underlayStroke && <BaseEdge id={`${id}-underlay`} path={path} style={{ stroke: d2.underlayStroke, strokeWidth: d2.underlayWidth ?? 18 }} />}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={renderedStyle} />
      {sequenceSortable && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          style={{ cursor: 'ns-resize', pointerEvents: 'stroke' }}
          onPointerDown={event => {
            event.stopPropagation()
            sequenceDrag.current = { pointerId: event.pointerId, startY: event.clientY }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerUp={finishSequenceDrag}
          onPointerCancel={() => { sequenceDrag.current = null }}
        />
      )}
      {/* Drawn in the edge layer (not the label portal) so nodes always paint above it. */}
      {d2?.middleArrow && (
        <g transform={`translate(${labelX},${labelY}) rotate(${middleArrowAngle})`} pointerEvents="none" aria-hidden>
          {d2.middleArrow === 'bidirectional'
            ? <><path d="M-6 -8 L6 -3 L-6 2 Z" fill={d2.middleArrowColor ?? '#FF9828'} /><path d="M6 8 L-6 3 L6 -2 Z" fill={d2.middleArrowColor ?? '#FF9828'} /></>
            : <path d="M-6 -5 L6 0 L-6 5 Z" fill={d2.middleArrowColor ?? '#FF9828'} />}
        </g>
      )}
      {d2?.sourceLabel && endLabel(d2.sourceLabel, sourceLabelPoint.x, sourceLabelPoint.y, 'sc')}
      {d2?.targetLabel && endLabel(d2.targetLabel, targetLabelPoint.x, targetLabelPoint.y, 'tc')}
      {label && (
        <EdgeLabelRenderer>
          <div
            className="gms-edge-label nodrag nopan absolute rounded px-1.5 py-0.5 text-[11px] font-medium shadow-sm"
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${renderedLabelY}px)`,
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
