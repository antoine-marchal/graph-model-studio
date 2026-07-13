import type { Position } from '../model'
import {
  layeredLayout,
  layoutSubset,
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
export * from './analytic-charts'

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
  return layoutSubset(
    (nodes, edges, layoutOptions) => runLayout(engine, nodes, edges, layoutOptions),
    allNodes,
    allEdges,
    currentPositions,
    subsetIds,
    options,
  )
}
