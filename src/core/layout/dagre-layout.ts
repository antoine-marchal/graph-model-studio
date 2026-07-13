import Dagre from '@dagrejs/dagre'
import type { Position } from '../model'
import type { LayoutNodeInput, LayoutEdgeInput, LayoutOptions } from './auto-layout'

/** Map our layout direction onto dagre's rankdir. */
function rankdir(direction: LayoutOptions['direction']): 'TB' | 'BT' | 'LR' | 'RL' {
  switch (direction) {
    case 'lr': return 'LR'
    case 'rl': return 'RL'
    case 'bt': return 'BT'
    default: return 'TB'
  }
}

/**
 * Layout via dagre (a proper Sugiyama implementation with edge-crossing
 * minimisation). Returns top-left positions per node, matching the convention
 * used by the built-in layered layout.
 */
export function dagreLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: LayoutOptions,
): Record<string, Position> {
  if (nodes.length === 0) return {}

  const g = new Dagre.graphlib.Graph({ compound: false })
  g.setGraph({
    rankdir: rankdir(options.direction),
    ranker: 'network-simplex',
    acyclicer: 'greedy',
    ranksep: options.layerGap ?? 80,
    nodesep: options.nodeGap ?? 48,
    edgesep: 16,
    marginx: 0,
    marginy: 0,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const e of edges) {
    if (e.source !== e.target && g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target)
    }
  }

  Dagre.layout(g)

  const origin = options.origin ?? { x: 40, y: 40 }
  const raw: Record<string, Position> = {}
  let minX = Infinity
  let minY = Infinity
  for (const n of nodes) {
    const dn = g.node(n.id)
    if (!dn) continue
    raw[n.id] = { x: dn.x - n.width / 2, y: dn.y - n.height / 2 }
    minX = Math.min(minX, raw[n.id].x)
    minY = Math.min(minY, raw[n.id].y)
  }
  // Normalise Dagre's bounding box so `origin` means the same thing for both engines.
  const out: Record<string, Position> = {}
  for (const [id, position] of Object.entries(raw)) {
    out[id] = { x: origin.x + position.x - minX, y: origin.y + position.y - minY }
  }
  return out
}
