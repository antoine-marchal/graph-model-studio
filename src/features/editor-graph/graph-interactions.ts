import type { Connection, Node } from '@xyflow/react'
import type { Position, Size } from '@/core/model'

type PositionedNode = Pick<Node, 'id' | 'position' | 'parentId'>

export type DragAxis = 'horizontal' | 'vertical'

/** Keep a dragged position on the dominant axis relative to its drag origin. */
export function constrainDragPosition(start: Position, current: Position, axis?: DragAxis): Position {
  const resolvedAxis = axis ?? (
    Math.abs(current.x - start.x) >= Math.abs(current.y - start.y) ? 'horizontal' : 'vertical'
  )
  return resolvedAxis === 'horizontal'
    ? { x: current.x, y: start.y }
    : { x: start.x, y: current.y }
}

/** Resolve synthetic chart handles while deliberately leaving anchors auto. */
export function relationEndpoints(connection: Connection): { sourceId: string; targetId: string } | null {
  const unanchor = (value: string | null | undefined) => {
    if (!value?.startsWith('__treeanchor_')) return value
    return value.slice('__treeanchor_'.length).replace(/_[lr]$/, '')
  }
  const unsankey = (node: string | null | undefined, handle: string | null | undefined) => {
    if (!handle?.startsWith('sankey:')) return node
    return /^sankey:(.+):[lr]$/.exec(handle)?.[1] ?? node
  }
  const sourceId = unsankey(unanchor(connection.source), connection.sourceHandle)
  const targetId = unsankey(unanchor(connection.target), connection.targetHandle)
  if (!sourceId || !targetId) return null
  return { sourceId, targetId }
}

interface SequenceParticipantRect {
  id: string
  position: Position
  width: number
  height: number
}

/** Snap an activity bar to the closest participant lifeline after a drag. */
export function sequenceActivityDrop(
  position: Position,
  width: number,
  participants: SequenceParticipantRect[],
): { participantId: string; y: number } | null {
  if (!participants.length) return null
  const centerX = position.x + width / 2
  const participant = participants.reduce((nearest, candidate) => {
    const distance = Math.abs(candidate.position.x + candidate.width / 2 - centerX)
    const nearestDistance = Math.abs(nearest.position.x + nearest.width / 2 - centerX)
    return distance < nearestDistance ? candidate : nearest
  })
  const lifelineStart = Math.max(...participants.map(candidate => candidate.position.y + candidate.height)) + 2
  return { participantId: participant.id, y: Math.round(Math.max(lifelineStart, position.y)) }
}

/** Resolve a React Flow node position into canvas coordinates. */
export function absoluteNodePosition(node: PositionedNode, nodes: PositionedNode[]): Position {
  const byId = new Map(nodes.map(candidate => [candidate.id, candidate]))
  const absolute = { ...node.position }
  const visited = new Set<string>([node.id])
  let parentId = node.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    absolute.x += parent.position.x
    absolute.y += parent.position.y
    parentId = parent.parentId
  }
  return absolute
}

/** Convert a dropped node's canvas position into its new parent's local space. */
export function droppedPosition(node: PositionedNode, parent: PositionedNode | undefined, nodes: PositionedNode[]): Position {
  const absolute = absoluteNodePosition(node, nodes)
  if (!parent) return absolute
  const parentAbsolute = absoluteNodePosition(parent, nodes)
  return { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y }
}

export interface ResizeSnapshot {
  id: string
  parentId?: string
  position: Position
  size: Size
}

/** Lock an activity bar's established width and snap its vertical edge to nearby messages. */
export function activityBarResize<T extends { x: number; y: number; width: number; height: number }>(
  start: T,
  end: T,
  connectionYs: number[],
  threshold = 10,
): T {
  const result = { ...end, x: start.x, width: start.width }
  const startBottom = start.y + start.height
  const endBottom = end.y + end.height
  const movingTop = Math.abs(end.y - start.y) > Math.abs(endBottom - startBottom)
  const movingEdge = movingTop ? end.y : endBottom
  const nearest = connectionYs.reduce<number | undefined>((best, point) => (
    best === undefined || Math.abs(point - movingEdge) < Math.abs(best - movingEdge) ? point : best
  ), undefined)
  if (nearest === undefined || Math.abs(nearest - movingEdge) > threshold) return result
  if (movingTop) {
    result.y = nearest
    result.height = Math.max(24, endBottom - nearest)
  } else {
    result.height = Math.max(24, nearest - end.y)
  }
  return result
}

/** Translate one or more root nodes so their combined bounds are centered on the pointer. */
export function positionsCenteredAt(
  point: Position,
  nodes: Array<{ id: string; position: Position; size: Size }>,
): Record<string, Position> {
  if (!nodes.length) return {}
  const left = Math.min(...nodes.map(node => node.position.x))
  const top = Math.min(...nodes.map(node => node.position.y))
  const right = Math.max(...nodes.map(node => node.position.x + node.size.width))
  const bottom = Math.max(...nodes.map(node => node.position.y + node.size.height))
  const dx = point.x - (left + right) / 2
  const dy = point.y - (top + bottom) / 2
  return Object.fromEntries(nodes.map(node => [node.id, { x: node.position.x + dx, y: node.position.y + dy }]))
}

/**
 * Apply one resize gesture to every selected node. Moving a container's left
 * or top boundary compensates its direct children so their canvas positions
 * remain fixed and only the inner padding changes.
 */
export function resizeSelection(
  sourceId: string,
  start: { x: number; y: number; width: number; height: number },
  end: { x: number; y: number; width: number; height: number },
  selected: ResizeSnapshot[],
  allNodes: ResizeSnapshot[],
): { sizes: Record<string, Size>; positions: Record<string, Position> } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const selectedIds = new Set(selected.map(node => node.id))
  const sizes: Record<string, Size> = {}
  const positions: Record<string, Position> = {}

  for (const node of selected) {
    sizes[node.id] = { width: Math.round(end.width), height: Math.round(end.height) }
    positions[node.id] = node.id === sourceId
      ? { x: end.x, y: end.y }
      : { ...node.position }
  }

  if (dx || dy) {
    for (const parent of selected) {
      if (parent.id !== sourceId) continue
      for (const child of allNodes) {
        if (child.parentId !== parent.id || selectedIds.has(child.id)) continue
        positions[child.id] = { x: child.position.x - dx, y: child.position.y - dy }
      }
    }
  }

  return { sizes, positions }
}
