import type { LayoutDirection, Position } from '../model'

export interface LayoutNodeInput {
  id: string
  width: number
  height: number
}

export interface LayoutEdgeInput {
  source: string
  target: string
}

export interface LayoutOptions {
  direction: LayoutDirection
  layerGap?: number
  nodeGap?: number
  origin?: Position
}

interface InternalNode extends LayoutNodeInput {
  layer: number
  order: number
}

/**
 * Layered (Sugiyama-lite) layout.
 * - assigns layers via longest-path on the DAG (back-edges from cycles ignored)
 * - orders nodes within layers by barycenter (one down + one up sweep)
 * - positions along the primary axis by layer, cross axis spread + centered
 * Disconnected nodes are placed in their own trailing band.
 */
export function layeredLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: LayoutOptions,
): Record<string, Position> {
  if (nodes.length === 0) return {}

  const layerGap = options.layerGap ?? 90
  const nodeGap = options.nodeGap ?? 50
  const origin = options.origin ?? { x: 40, y: 40 }

  const nodeMap = new Map<string, InternalNode>()
  for (const n of nodes) {
    nodeMap.set(n.id, { ...n, layer: 0, order: 0 })
  }

  // Only keep edges between known nodes; drop self-loops
  const validEdges = edges.filter(
    e => e.source !== e.target && nodeMap.has(e.source) && nodeMap.has(e.target),
  )

  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const id of nodeMap.keys()) {
    outgoing.set(id, [])
    incoming.set(id, [])
  }
  for (const e of validEdges) {
    outgoing.get(e.source)!.push(e.target)
    incoming.get(e.target)!.push(e.source)
  }

  // ── Layer assignment: longest path from sources, with cycle protection ──
  const visiting = new Set<string>()
  const done = new Set<string>()

  function assignLayer(id: string): number {
    if (done.has(id)) return nodeMap.get(id)!.layer
    if (visiting.has(id)) return nodeMap.get(id)!.layer // break cycle
    visiting.add(id)
    let maxParent = -1
    for (const p of incoming.get(id)!) {
      maxParent = Math.max(maxParent, assignLayer(p))
    }
    const layer = maxParent + 1
    nodeMap.get(id)!.layer = layer
    visiting.delete(id)
    done.add(id)
    return layer
  }
  for (const id of nodeMap.keys()) assignLayer(id)

  // Connected vs isolated
  const isolated: string[] = []
  for (const id of nodeMap.keys()) {
    if (outgoing.get(id)!.length === 0 && incoming.get(id)!.length === 0) {
      isolated.push(id)
    }
  }
  const isolatedSet = new Set(isolated)

  // Build layers (excluding isolated)
  const layers: string[][] = []
  for (const [id, n] of nodeMap) {
    if (isolatedSet.has(id)) continue
    while (layers.length <= n.layer) layers.push([])
    layers[n.layer].push(id)
  }

  // ── Cross-axis ordering: barycenter sweeps ──
  const orderInLayer = new Map<string, number>()
  layers.forEach(layer => layer.forEach((id, i) => orderInLayer.set(id, i)))

  function barycenter(id: string, neighborGetter: Map<string, string[]>): number {
    const ns = neighborGetter.get(id)!
    if (ns.length === 0) return orderInLayer.get(id) ?? 0
    const sum = ns.reduce((acc, nid) => acc + (orderInLayer.get(nid) ?? 0), 0)
    return sum / ns.length
  }

  for (let pass = 0; pass < 4; pass++) {
    const downward = pass % 2 === 0
    const range = downward
      ? [...Array(layers.length).keys()]
      : [...Array(layers.length).keys()].reverse()
    for (const li of range) {
      const layer = layers[li]
      const getter = downward ? incoming : outgoing
      const withBary = layer.map(id => ({ id, b: barycenter(id, getter) }))
      withBary.sort((a, b) => a.b - b.b)
      layers[li] = withBary.map(x => x.id)
      layers[li].forEach((id, i) => orderInLayer.set(id, i))
    }
  }

  // ── Coordinate assignment ──
  const result: Record<string, Position> = {}
  const horizontal = options.direction === 'lr' || options.direction === 'rl'
  const reverse = options.direction === 'rl' || options.direction === 'bt'

  // Max extent along cross axis for centering
  const layerCrossExtents = layers.map(layer =>
    layer.reduce((acc, id) => {
      const n = nodeMap.get(id)!
      return acc + (horizontal ? n.height : n.width) + nodeGap
    }, -nodeGap),
  )
  const maxCrossExtent = Math.max(0, ...layerCrossExtents)

  // Primary axis offsets per layer (uses max node size in each layer)
  const layerPrimarySizes = layers.map(layer =>
    Math.max(0, ...layer.map(id => {
      const n = nodeMap.get(id)!
      return horizontal ? n.width : n.height
    })),
  )
  const layerPrimaryOffsets: number[] = []
  {
    let acc = 0
    for (let i = 0; i < layers.length; i++) {
      layerPrimaryOffsets.push(acc)
      acc += layerPrimarySizes[i] + layerGap
    }
  }
  const totalPrimary = layerPrimaryOffsets.length
    ? layerPrimaryOffsets[layers.length - 1] + layerPrimarySizes[layers.length - 1]
    : 0

  layers.forEach((layer, li) => {
    // center this layer's nodes on the cross axis
    const crossExtent = layerCrossExtents[li]
    let crossPos = (maxCrossExtent - crossExtent) / 2
    const primaryBase = reverse
      ? totalPrimary - layerPrimaryOffsets[li] - layerPrimarySizes[li]
      : layerPrimaryOffsets[li]

    for (const id of layer) {
      const n = nodeMap.get(id)!
      const crossSize = horizontal ? n.height : n.width
      const primarySize = horizontal ? n.width : n.height
      // align node center within layer band
      const primaryOffset = (layerPrimarySizes[li] - primarySize) / 2

      if (horizontal) {
        result[id] = {
          x: origin.x + primaryBase + primaryOffset,
          y: origin.y + crossPos,
        }
      } else {
        result[id] = {
          x: origin.x + crossPos,
          y: origin.y + primaryBase + primaryOffset,
        }
      }
      crossPos += crossSize + nodeGap
    }
  })

  // ── Isolated nodes: trailing band ──
  if (isolated.length > 0) {
    const bandPrimary = totalPrimary + layerGap
    let crossPos = 0
    for (const id of isolated) {
      const n = nodeMap.get(id)!
      const crossSize = horizontal ? n.height : n.width
      if (horizontal) {
        result[id] = { x: origin.x + bandPrimary, y: origin.y + crossPos }
      } else {
        result[id] = { x: origin.x + crossPos, y: origin.y + bandPrimary }
      }
      crossPos += crossSize + nodeGap
    }
  }

  return result
}

/**
 * Layout only a subset of nodes (induced subgraph) and keep the result
 * roughly centered on the subset's current centroid.
 */
export function layeredLayoutSubset(
  allNodes: LayoutNodeInput[],
  allEdges: LayoutEdgeInput[],
  currentPositions: Record<string, Position>,
  subsetIds: Set<string>,
  options: LayoutOptions,
): Record<string, Position> {
  const subNodes = allNodes.filter(n => subsetIds.has(n.id))
  if (subNodes.length === 0) return {}
  const subEdges = allEdges.filter(e => subsetIds.has(e.source) && subsetIds.has(e.target))

  // current centroid
  let cx = 0
  let cy = 0
  let count = 0
  for (const n of subNodes) {
    const p = currentPositions[n.id]
    if (p) {
      cx += p.x + n.width / 2
      cy += p.y + n.height / 2
      count++
    }
  }
  const origin = count > 0 ? { x: 0, y: 0 } : { x: 40, y: 40 }
  const laid = layeredLayout(subNodes, subEdges, { ...options, origin })

  if (count === 0) return laid

  cx /= count
  cy /= count
  // centroid of the laid-out result
  let lx = 0
  let ly = 0
  for (const n of subNodes) {
    const p = laid[n.id]
    lx += p.x + n.width / 2
    ly += p.y + n.height / 2
  }
  lx /= subNodes.length
  ly /= subNodes.length

  const dx = cx - lx
  const dy = cy - ly
  const shifted: Record<string, Position> = {}
  for (const id of Object.keys(laid)) {
    shifted[id] = { x: laid[id].x + dx, y: laid[id].y + dy }
  }
  return shifted
}
