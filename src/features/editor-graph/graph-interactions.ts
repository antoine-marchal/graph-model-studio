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
  if (!sourceId || !targetId || sourceId === targetId) return null
  return { sourceId, targetId }
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
