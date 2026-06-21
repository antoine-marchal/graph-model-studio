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
    ranksep: options.layerGap ?? 80,
    nodesep: options.nodeGap ?? 48,
    edgesep: 16,
    marginx: 8,
    marginy: 8,
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
  const out: Record<string, Position> = {}
  for (const n of nodes) {
    const dn = g.node(n.id)
    if (!dn) continue
    // dagre reports node centre — convert to top-left and shift to origin
    out[n.id] = { x: origin.x + dn.x - n.width / 2, y: origin.y + dn.y - n.height / 2 }
  }
  return out
}
