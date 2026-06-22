import { memo } from 'react'
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
import { routeOrthogonal, pointsToRoundedPath, type Rect, type Point } from './orthogonal-router'

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

/** Point at half the total length of a poly-line (for label placement). */
function polylineMidpoint(pts: Point[]): Point {
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  let half = total / 2
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
    if (half <= seg) {
      const t = seg === 0 ? 0 : half / seg
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }
    }
    half -= seg
  }
  return pts[pts.length - 1]
}

export const FloatingEdge = memo(({ id, source, target, markerEnd, markerStart, style, data, selected, sourceHandleId, targetHandleId }: EdgeProps) => {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const routing = useModelStore(s => s.edgeRouting)
  const nodeLookup = useStore(s => s.nodeLookup)
  if (!sourceNode || !targetNode) return null

  // self-loop fallback
  if (source === target) return null

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode, sourceHandleId, targetHandleId)

  let path: string
  let labelX: number
  let labelY: number
  let routed: Point[] | null = null
  if (routing === 'orthogonal') {
    const obstacles: Rect[] = []
    for (const [, n] of nodeLookup) {
      if (n.id === source || n.id === target) continue
      const x = n.internals.positionAbsolute.x
      const y = n.internals.positionAbsolute.y
      const w = n.measured.width ?? 0
      const h = n.measured.height ?? 0
      // skip nodes that enclose an endpoint (ancestor containers) — they would trap the route
      const encloses = (px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h
      if (encloses(sx, sy) || encloses(tx, ty)) continue
      obstacles.push({ x, y, width: w, height: h })
    }
    routed = routeOrthogonal({ x: sx, y: sy }, { x: tx, y: ty }, obstacles)
  }

  if (routed) {
    path = pointsToRoundedPath(routed)
    const mid = polylineMidpoint(routed)
    labelX = mid.x
    labelY = mid.y
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
      targetPosition: targetPos, targetX: tx, targetY: ty,
      curvature: 0.25,
    })
  }

  const label = (data as { label?: string } | undefined)?.label

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute rounded px-1.5 py-0.5 text-[11px] font-medium shadow-sm"
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              background: 'var(--surface-1)',
              color: 'var(--edge-label)',
              border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
              pointerEvents: 'all',
              zIndex: 1001,
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
