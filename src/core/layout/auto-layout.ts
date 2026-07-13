import type { LayoutDirection, Position } from '../model'

export interface LayoutNodeInput { id: string; width: number; height: number }
export interface LayoutEdgeInput { source: string; target: string }
export interface LayoutOptions {
  direction: LayoutDirection
  layerGap?: number
  nodeGap?: number
  origin?: Position
}

type LayoutRunner = (nodes: LayoutNodeInput[], edges: LayoutEdgeInput[], options: LayoutOptions) => Record<string, Position>

/**
 * Deterministic layered layout. Cycles are condensed into strongly connected
 * components before ranks are assigned, then stable barycentre sweeps reduce
 * crossings without making repeated layouts jump around.
 */
export function layeredLayout(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[], options: LayoutOptions): Record<string, Position> {
  if (nodes.length === 0) return {}
  const layerGap = options.layerGap ?? 90
  const nodeGap = options.nodeGap ?? 50
  const origin = options.origin ?? { x: 40, y: 40 }
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const inputOrder = new Map(nodes.map((node, index) => [node.id, index]))
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]))
  const incoming = new Map(nodes.map(node => [node.id, [] as string[]]))
  const edgeKeys = new Set<string>()

  for (const edge of edges) {
    if (edge.source === edge.target || !nodeById.has(edge.source) || !nodeById.has(edge.target)) continue
    const key = `${edge.source}\u0000${edge.target}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    outgoing.get(edge.source)!.push(edge.target)
    incoming.get(edge.target)!.push(edge.source)
  }

  const isolatedIds = new Set(nodes.filter(node => outgoing.get(node.id)!.length === 0 && incoming.get(node.id)!.length === 0).map(node => node.id))
  const connectedIds = nodes.filter(node => !isolatedIds.has(node.id)).map(node => node.id)

  // Tarjan SCC condensation makes cyclic input rankable and deterministic.
  let nextIndex = 0
  const indexes = new Map<string, number>()
  const lowLinks = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []
  const visit = (id: string) => {
    indexes.set(id, nextIndex)
    lowLinks.set(id, nextIndex++)
    stack.push(id)
    onStack.add(id)
    for (const target of outgoing.get(id)!) {
      if (!indexes.has(target)) {
        visit(target)
        lowLinks.set(id, Math.min(lowLinks.get(id)!, lowLinks.get(target)!))
      } else if (onStack.has(target)) {
        lowLinks.set(id, Math.min(lowLinks.get(id)!, indexes.get(target)!))
      }
    }
    if (lowLinks.get(id) !== indexes.get(id)) return
    const component: string[] = []
    let member: string
    do {
      member = stack.pop()!
      onStack.delete(member)
      component.push(member)
    } while (member !== id)
    component.sort((a, b) => inputOrder.get(a)! - inputOrder.get(b)!)
    components.push(component)
  }
  for (const id of connectedIds) if (!indexes.has(id)) visit(id)

  const componentOf = new Map<string, number>()
  components.forEach((component, ci) => component.forEach(id => componentOf.set(id, ci)))
  const componentOut = components.map(() => new Set<number>())
  const indegree = components.map(() => 0)
  for (const key of edgeKeys) {
    const [source, target] = key.split('\u0000')
    const a = componentOf.get(source)
    const b = componentOf.get(target)
    if (a === undefined || b === undefined || a === b || componentOut[a].has(b)) continue
    componentOut[a].add(b)
    indegree[b]++
  }

  const componentRank = components.map(() => 0)
  const queue = components.map((_, ci) => ci).filter(ci => indegree[ci] === 0)
    .sort((a, b) => inputOrder.get(components[a][0])! - inputOrder.get(components[b][0])!)
  while (queue.length) {
    const ci = queue.shift()!
    for (const next of componentOut[ci]) {
      componentRank[next] = Math.max(componentRank[next], componentRank[ci] + 1)
      if (--indegree[next] === 0) queue.push(next)
    }
  }

  const layers: string[][] = []
  components.forEach((component, ci) => {
    const rank = componentRank[ci]
    while (layers.length <= rank) layers.push([])
    layers[rank].push(...component)
  })
  const order = new Map<string, number>()
  const updateOrder = (layer: string[]) => layer.forEach((id, index) => order.set(id, index))
  layers.forEach(updateOrder)
  const barycentre = (id: string, neighbours: Map<string, string[]>) => {
    const ranked = neighbours.get(id)!.filter(neighbour => order.has(neighbour))
    return ranked.length
      ? ranked.reduce((sum, neighbour) => sum + order.get(neighbour)!, 0) / ranked.length
      : order.get(id) ?? 0
  }
  for (let pass = 0; pass < 8; pass++) {
    const downward = pass % 2 === 0
    const layerIndexes = layers.map((_, index) => index)
    if (!downward) layerIndexes.reverse()
    for (const layerIndex of layerIndexes) {
      const neighbours = downward ? incoming : outgoing
      layers[layerIndex] = layers[layerIndex]
        .map(id => ({ id, barycentre: barycentre(id, neighbours), previous: order.get(id) ?? 0 }))
        .sort((a, b) => a.barycentre - b.barycentre || a.previous - b.previous || inputOrder.get(a.id)! - inputOrder.get(b.id)!)
        .map(item => item.id)
      updateOrder(layers[layerIndex])
    }
  }

  const horizontal = options.direction === 'lr' || options.direction === 'rl'
  const reverse = options.direction === 'rl' || options.direction === 'bt'
  const primarySize = (id: string) => horizontal ? nodeById.get(id)!.width : nodeById.get(id)!.height
  const crossSize = (id: string) => horizontal ? nodeById.get(id)!.height : nodeById.get(id)!.width
  const primarySizes = layers.map(layer => Math.max(0, ...layer.map(primarySize)))
  const crossSizes = layers.map(layer => layer.reduce((sum, id, index) => sum + crossSize(id) + (index ? nodeGap : 0), 0))
  const maxCrossSize = Math.max(0, ...crossSizes)
  const layerOffsets: number[] = []
  let totalPrimary = 0
  for (const size of primarySizes) {
    layerOffsets.push(totalPrimary)
    totalPrimary += size + layerGap
  }
  if (layers.length) totalPrimary -= layerGap

  const result: Record<string, Position> = {}
  layers.forEach((layer, layerIndex) => {
    let cross = (maxCrossSize - crossSizes[layerIndex]) / 2
    const primary = reverse ? totalPrimary - layerOffsets[layerIndex] - primarySizes[layerIndex] : layerOffsets[layerIndex]
    for (const id of layer) {
      const alignedPrimary = primary + (primarySizes[layerIndex] - primarySize(id)) / 2
      result[id] = horizontal
        ? { x: origin.x + alignedPrimary, y: origin.y + cross }
        : { x: origin.x + cross, y: origin.y + alignedPrimary }
      cross += crossSize(id) + nodeGap
    }
  })

  // Unconnected nodes live in a compact trailing band, outside meaningful ranks.
  let isolatedCross = 0
  const bandPrimary = layers.length ? totalPrimary + layerGap : 0
  for (const node of nodes.filter(node => isolatedIds.has(node.id))) {
    result[node.id] = horizontal
      ? { x: origin.x + bandPrimary, y: origin.y + isolatedCross }
      : { x: origin.x + isolatedCross, y: origin.y + bandPrimary }
    isolatedCross += (horizontal ? node.height : node.width) + nodeGap
  }
  return result
}

/** Shared induced-subgraph and visual-centre behaviour for every engine. */
export function layoutSubset(
  layout: LayoutRunner,
  allNodes: LayoutNodeInput[],
  allEdges: LayoutEdgeInput[],
  currentPositions: Record<string, Position>,
  subsetIds: Set<string>,
  options: LayoutOptions,
): Record<string, Position> {
  const nodes = allNodes.filter(node => subsetIds.has(node.id))
  if (nodes.length === 0) return {}
  const edges = allEdges.filter(edge => subsetIds.has(edge.source) && subsetIds.has(edge.target))
  const laidOut = layout(nodes, edges, { ...options, origin: { x: 0, y: 0 } })
  const positioned = nodes.filter(node => currentPositions[node.id])
  if (positioned.length === 0) return laidOut

  const centre = (positions: Record<string, Position>, members: LayoutNodeInput[]) => ({
    x: members.reduce((sum, node) => sum + positions[node.id].x + node.width / 2, 0) / members.length,
    y: members.reduce((sum, node) => sum + positions[node.id].y + node.height / 2, 0) / members.length,
  })
  const before = centre(currentPositions, positioned)
  const after = centre(laidOut, nodes)
  return Object.fromEntries(nodes.map(node => [node.id, {
    x: laidOut[node.id].x + before.x - after.x,
    y: laidOut[node.id].y + before.y - after.y,
  }]))
}

/**
 * Align node centres on one axis while preserving the selection's centre.
 * A vertical alignment shares X; a horizontal alignment shares Y.
 */
export function alignNodes(
  nodes: LayoutNodeInput[],
  currentPositions: Record<string, Position>,
  alignment: 'vertical' | 'horizontal',
): Record<string, Position> {
  const positioned = nodes.filter(node => currentPositions[node.id])
  if (positioned.length < 2) return {}
  const vertical = alignment === 'vertical'
  const sharedCentre = positioned.reduce((sum, node) => {
    const position = currentPositions[node.id]
    return sum + (vertical ? position.x + node.width / 2 : position.y + node.height / 2)
  }, 0) / positioned.length

  return Object.fromEntries(positioned.map(node => {
    const position = currentPositions[node.id]
    return [node.id, vertical
      ? { x: sharedCentre - node.width / 2, y: position.y }
      : { x: position.x, y: sharedCentre - node.height / 2 }]
  }))
}

/** @deprecated Use runLayoutSubset so every engine follows the same behaviour. */
export function layeredLayoutSubset(
  allNodes: LayoutNodeInput[], allEdges: LayoutEdgeInput[], currentPositions: Record<string, Position>,
  subsetIds: Set<string>, options: LayoutOptions,
): Record<string, Position> {
  return layoutSubset(layeredLayout, allNodes, allEdges, currentPositions, subsetIds, options)
}
