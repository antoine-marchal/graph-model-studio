import type { Position } from '../model'
import {
  layeredLayout,
  layeredLayoutSubset,
  type LayoutNodeInput,
  type LayoutEdgeInput,
  type LayoutOptions,
} from './auto-layout'
import { dagreLayout } from './dagre-layout'

export * from './auto-layout'
export { dagreLayout } from './dagre-layout'
export * from './gantt-layout'
export * from './pert'
export * from './special-layouts'

export type LayoutEngine = 'layered' | 'dagre'

export const LAYOUT_ENGINES: { id: LayoutEngine; label: string; hint: string }[] = [
  { id: 'layered', label: 'Layered', hint: 'Built-in Sugiyama-lite, respects container nesting' },
  { id: 'dagre', label: 'Dagre', hint: 'Dagre engine with edge-crossing minimisation' },
]

/** Run a full layout with the chosen engine. */
export function runLayout(
  engine: LayoutEngine,
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: LayoutOptions,
): Record<string, Position> {
  return engine === 'dagre' ? dagreLayout(nodes, edges, options) : layeredLayout(nodes, edges, options)
}

/** Run a subset layout with the chosen engine, re-centred on the subset's centroid. */
export function runLayoutSubset(
  engine: LayoutEngine,
  allNodes: LayoutNodeInput[],
  allEdges: LayoutEdgeInput[],
  currentPositions: Record<string, Position>,
  subsetIds: Set<string>,
  options: LayoutOptions,
): Record<string, Position> {
  if (engine === 'layered') {
    return layeredLayoutSubset(allNodes, allEdges, currentPositions, subsetIds, options)
  }
  // dagre: lay out the induced subgraph then translate back onto the current centroid
  const subNodes = allNodes.filter(n => subsetIds.has(n.id))
  if (subNodes.length === 0) return {}
  const subEdges = allEdges.filter(e => subsetIds.has(e.source) && subsetIds.has(e.target))
  const laid = dagreLayout(subNodes, subEdges, { ...options, origin: { x: 0, y: 0 } })

  let cx = 0, cy = 0, count = 0
  for (const n of subNodes) {
    const p = currentPositions[n.id]
    if (p) { cx += p.x + n.width / 2; cy += p.y + n.height / 2; count++ }
  }
  if (count === 0) return laid
  cx /= count; cy /= count
  let lx = 0, ly = 0
  for (const n of subNodes) { lx += laid[n.id].x + n.width / 2; ly += laid[n.id].y + n.height / 2 }
  lx /= subNodes.length; ly /= subNodes.length
  const dx = cx - lx, dy = cy - ly
  const shifted: Record<string, Position> = {}
  for (const id of Object.keys(laid)) shifted[id] = { x: laid[id].x + dx, y: laid[id].y + dy }
  return shifted
}
